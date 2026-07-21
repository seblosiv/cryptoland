# Guardian Agent System

## Overview

The Guardian Agent system is CryptoLand's core gameplay loop beyond buying tiles. It transforms static tile ownership into an active "Agentic Real Estate" platform where each owned tile can employ an autonomous AI agent that works 24/7 — defending territory, earning yield, and competing in mini-games.

**Design principle:** All three phases are modular. Each has its own component, store slice, and API surface. They share the same guardian DB record but can be developed and deployed independently.

---

## Architecture

```
Frontend                          Backend
─────────────────────────         ─────────────────────────
GuardianModal.jsx                 server/main.py
  └─ DeployTab (Phase 1)            └─ /guardian/* routes
  └─ ReportsTab (Phase 1)         server/guardian.py
  └─ ProfileTab (Phase 3)           └─ Pure engine logic
RaidModal.jsx (Phase 2)
src/store/guardianStore.js        Database
src/lib/api.js (guardian calls)   ├─ guardians table
src/components/Map.jsx            └─ raid_log table
  └─ shield badge on tile overlay
```

---

## Phase 1 — Guardian Deployment

### What it does
- Tile owner deploys a guardian with a **personality** and a **defense budget**
- Guardian computes ATK / DEF / daily yield stats from personality + budget + level (XP)
- Simulated **daily activity reports** are generated deterministically per tile (no real async processes)
- A **🛡 badge** appears on the tile overlay on the map

### Personalities

| Personality | Icon | ATK Bonus | DEF Bonus | Yield Bonus | Color     |
|-------------|------|-----------|-----------|-------------|-----------|
| Aggressive  | ⚔️   | +35%      | −10%      | +20%        | `#f87171` |
| Balanced    | ⚖️   | +10%      | +10%      | +10%        | `#60a5fa` |
| Passive     | 🛡️   | −10%      | +35%      | +5%         | `#4ade80` |

### Stats formula (`guardian.py → compute_stats`)
```python
base_atk   = 10 + level * 8 + log1p(budget) * 4
base_def   = 10 + level * 8 + log1p(budget) * 4
base_yield = budget * 0.02 * (1 + level * 0.1)

# Multiplied by personality bonuses
atk    = base_atk   * (1 + personality.atk_bonus)
def    = base_def   * (1 + personality.def_bonus)
yield_ = base_yield * (1 + personality.yield_bonus)
```

### XP and leveling
```python
LEVEL_XP = [0, 100, 250, 500, 900, 1500, 2400, 3700, 5500, 8000]
```
XP is earned from raids (win or lose) and from defending (recorded in `resolve_defense()`).

### Database: `guardians` table
```sql
CREATE TABLE guardians (
    tile_key    TEXT PRIMARY KEY,
    owner       TEXT NOT NULL,
    personality TEXT NOT NULL DEFAULT 'balanced',
    budget      REAL NOT NULL DEFAULT 10.0,
    xp          INTEGER NOT NULL DEFAULT 0,
    deployed_at INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
)
```

---

## Phase 2 — Raid Mini-game

### What it does
- Any guardian owner can **challenge** an enemy tile by paying a raid budget
- ATK vs DEF comparison with ±25% RNG noise determines outcome
- **Winner** earns yield from loser's daily_yield pool
- **Both sides** earn XP (more for winners, some for losers)
- All raids are logged in `raid_log` table

### Raid flow (`RaidModal.jsx`)
```
select step → user picks defender tile + budget
    ↓
resolving step → POST /guardian/raid
    ↓
result step → win/loss animation, stats, XP gained
```

### Resolution formula (`guardian.py → resolve_raid`)
```python
atk_power = attacker.atk + log1p(raid_budget) * 6
atk_roll  = atk_power * random.uniform(0.75, 1.25)
def_roll  = defender.def * random.uniform(0.75, 1.25)

attacker_wins = atk_roll > def_roll
margin        = |atk_roll - def_roll| / max(atk_roll, def_roll)

if attacker_wins:
    yield_stolen = defender.daily_yield * margin * random.uniform(0.3, 0.8)
    xp_gain      = 20 + margin * 40
else:
    yield_stolen = 0
    xp_gain      = 5 + margin * 10
```

**Seed stability:** Raid outcomes use a time-bucketed seed (`int(time.time() / 300)`) so the same attacker/defender pair produces consistent results within a 5-minute window. This prevents result fishing by spamming the endpoint.

### Unguarded tiles
Tiles with no guardian have a baseline `def_power = 5.0`, making them easy raids but low yield.

### Database: `raid_log` table
```sql
CREATE TABLE raid_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    attacker_tile TEXT NOT NULL,
    defender_tile TEXT NOT NULL,
    attacker_wins INTEGER NOT NULL,   -- 0 or 1
    yield_stolen  REAL NOT NULL,
    atk_roll      REAL NOT NULL,
    def_roll      REAL NOT NULL,
    margin_pct    REAL NOT NULL,
    message       TEXT NOT NULL,
    timestamp_ms  INTEGER NOT NULL
)
```

### Triggering a raid from PurchasePanel
When viewing an enemy tile with a guardian, a **⚔️ Raid this tile** button appears.
- If the viewer has no guardian, they are redirected to GuardianModal to deploy one first.
- If they have a guardian, `openRaidModal(myGuardianKey)` + `defenderKey = selectedKey` is set.

---

## Phase 3 — Territory Intelligence

### What it does
Internal analysis of a tile's strategic value — no external AI APIs. All scores are deterministic and seeded from the tile key. Designed to feel like real intelligence, scalable to real AI later.

### Analysis inputs (`guardian.py → analyze_territory`)
| Input         | Effect on score                    |
|---------------|------------------------------------|
| `label`       | +15 strategic score (named place)  |
| `image_url`   | +10 strategic score (has photo)    |
| `blocks_nearby` | Up to +40 (density × 2, max 40)  |
| `price`       | Up to +30 (log-scaled)             |
| Random seed   | +5–20 (deterministic per tile)     |
| Total         | 0–99 strategic score               |

### Output fields
```json
{
  "strategic_score": 72,
  "risk_level": "Medium",
  "tags": ["High-density zone", "Trade corridor", "Tech cluster"],
  "climate_zone": "Temperate",
  "rent_suggested": 1.85,
  "ad_sector": "Travel & Tourism",
  "country": "France",
  "analysis_note": "Territory in France scores 72/99 strategically..."
}
```

### Risk level mapping
```
nearby_owned: 0–2  → Low
              3–5  → Medium
              6–8  → Elevated
              9–11 → High
              12+  → Critical
```

---

## API Reference

| Method | Endpoint                          | Description                          |
|--------|-----------------------------------|--------------------------------------|
| GET    | `/guardian/personalities`         | List personality definitions         |
| GET    | `/guardian/{tile_key}`            | Full guardian + computed stats       |
| POST   | `/guardian`                       | Deploy or reconfigure guardian       |
| DELETE | `/guardian/{tile_key}?owner=...`  | Remove guardian                      |
| GET    | `/guardian/{tile_key}/report`     | Simulated daily reports (last N days)|
| POST   | `/guardian/raid`                  | Execute a raid                       |
| GET    | `/guardian/{tile_key}/raids`      | Raid history for a tile              |
| GET    | `/guardian/{tile_key}/profile`    | Phase 3 territory intelligence       |
| GET    | `/guardians/summary`              | All guardians (lightweight, for map) |

---

## Frontend Files

| File                              | Purpose                                       |
|-----------------------------------|-----------------------------------------------|
| `src/store/guardianStore.js`      | Zustand store — all guardian state + actions  |
| `src/lib/api.js`                  | Guardian API call functions (added to api obj)|
| `src/components/GuardianModal.jsx`| Deploy/reports/intel modal (3 tabs)           |
| `src/components/RaidModal.jsx`    | Raid flow: select → resolving → result        |
| `src/components/PurchasePanel.jsx`| Guardian + raid buttons on owned/enemy tiles  |
| `src/components/Map.jsx`          | Shield badge on tiles with guardians          |
| `src/App.jsx`                     | Mounts modals, boots guardian store on load   |

---

## Data Flow

### Boot
```
App.jsx useEffect
  ├─ loadBlocksFromServer()       → populates gameStore.blocks
  ├─ loadGuardiansSummary()       → populates guardianStore.guardians (Map)
  └─ loadPersonalities()          → populates guardianStore.personalities
```

### Guardian deploy
```
PurchasePanel "Deploy Guardian" button
  → openGuardianModal(tileKey, 'deploy')
    → guardianStore.guardianModal = { open: true, tileKey }
      → GuardianModal renders
        → user picks personality + budget
          → deployGuardian() → POST /guardian
            → guardianStore.guardians updated (local cache)
            → Map.jsx re-syncs overlay (shield badge appears)
```

### Raid
```
PurchasePanel "⚔️ Raid this tile" button
  → openRaidModal(myGuardianKey) + defenderKey = selectedKey
    → guardianStore.raidModal = { open: true, attackerKey, defenderKey }
      → RaidModal renders (select step)
        → user sets budget → performRaid()
          → step = 'resolving'
          → POST /guardian/raid → server resolves, writes raid_log, updates XP
          → step = 'result' → display outcome
            → loadGuardiansSummary() refreshes levels on map
```

---

## Adding / Modifying Guardians

**To add a personality:** Edit `PERSONALITIES` dict in `guardian.py` and redeploy. No DB migration needed.

**To change stat formula:** Edit `compute_stats()` in `guardian.py`. All computed values (atk, def, level) are derived at request time — not stored in DB.

**To add a raid outcome type:** Add to `RAID_MESSAGES_WIN/LOSE` arrays in `guardian.py`.

**To change intelligence scoring:** Edit `analyze_territory()` in `guardian.py`. Profile results are cached in the frontend `profileCache` Map — cache is cleared on page refresh.

---

## What NOT To Do

| Don't                                           | Why                                                                 |
|-------------------------------------------------|---------------------------------------------------------------------|
| Store computed ATK/DEF in DB                    | They'd go stale instantly when formula changes — compute on demand  |
| Call `useGuardianStore` inside Map.jsx JSX      | Map uses a single `useEffect` — use `guardianStore.getState()` ref  |
| Remove `?owner=` guard from DELETE /guardian    | Without it any user can delete any guardian                         |
| Use `random.random()` directly in engine        | Always use seeded `_rng(seed)` for reproducible outcomes            |
| Load full guardian objects in `/guardians/summary` | Summary only needs tile_key + personality + level for map badges |
