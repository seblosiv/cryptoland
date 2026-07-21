# Backend

## Overview

The backend is a Python FastAPI application serving a REST API backed by SQLite. It handles tile ownership, payments, guardian agents, marketplace, DAO, and the accounts + affiliate system.

### User Accounts & Affiliate System

As of the current version, the backend also manages:
- **User accounts** — auto-created on wallet connect, one row per wallet address
- **Sessions** — anonymous UUIDs bridging referral landing → wallet connection
- **Affiliate codes** — deterministic `LAND-XXXXXX` code per wallet (SHA-256)
- **Referral tracking** — 5-layer fraud prevention; 30% commission on tile purchases
- **Earnings** — `referral_balance` with pending and paid amounts

See [documentation/affiliate.md](affiliate.md) for the full affiliate system spec.

**Runtime:** `uvicorn main:app --reload`
**Port:** `8000`
**Database:** `./cryptoland.db` (SQLite, relative to `server/`)
**CORS origins:** Configured via `ALLOWED_ORIGINS` env var (comma-separated). Defaults to `http://localhost:5173,http://127.0.0.1:5173`.
**Rate limiting:** `slowapi` — `POST /blocks` 20/min, `POST /np/payment` 10/min, `POST /auth/register` 5/min, `POST /auth/login` 10/min.

Copy `server/.env.example` to `server/.env` and fill in `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`, and `SERVER_URL` before running in production.

---

## `server/main.py`

### Database Schema

```sql
CREATE TABLE IF NOT EXISTS blocks (
    tile_key      TEXT PRIMARY KEY,
    tx            INTEGER NOT NULL,
    ty            INTEGER NOT NULL,
    owner         TEXT NOT NULL,
    color         TEXT NOT NULL DEFAULT '#00ff88',
    price         REAL NOT NULL,
    country       TEXT NOT NULL DEFAULT 'Unknown',
    purchased_at  INTEGER NOT NULL,        -- Unix milliseconds
    image_url     TEXT,                    -- nullable
    label         TEXT                     -- nullable
);

CREATE INDEX IF NOT EXISTS idx_blocks_owner ON blocks(owner);
```

`tile_key` format: `"tx:ty"` (e.g., `"1024:512"`).

### Pydantic Models

#### `Block` (response model)
```python
class Block(BaseModel):
    tile_key: str
    tx: int
    ty: int
    owner: str
    color: str
    price: float
    country: str
    purchased_at: int
    image_url: Optional[str] = None
    label: Optional[str] = None
```

#### `PurchaseRequest` (request body)
```python
class PurchaseRequest(BaseModel):
    tile_key: str
    tx: int
    ty: int
    owner: str
    color: str
    price: float
    country: str
    image_url: Optional[str] = None
    label: Optional[str] = None
```

### Lifecycle

#### `init_db()` (startup event)
Called on application startup via `@app.on_event("startup")`.
- Opens SQLite connection
- Executes `CREATE TABLE IF NOT EXISTS blocks ...`
- Executes `CREATE INDEX IF NOT EXISTS idx_blocks_owner ...`
- Closes connection

### API Endpoints

#### `GET /health`
Health check. Returns database path.

**Response:**
```json
{ "ok": true, "db": "./cryptoland.db" }
```

---

#### `GET /blocks`
Returns all purchased blocks, newest first.

**Response:** `Block[]`

**SQL:**
```sql
SELECT * FROM blocks ORDER BY purchased_at DESC
```

---

#### `GET /blocks/{tile_key}`
Returns a single block by tile key.

**Path param:** `tile_key` — e.g., `1024:512`

**Response:** `Block` or `404`

**SQL:**
```sql
SELECT * FROM blocks WHERE tile_key = ?
```

---

#### `POST /blocks`
Purchase a tile atomically. Protected by `BEGIN EXCLUSIVE` transaction.

**Request body:** `PurchaseRequest`

**Rate limit:** 20 requests/minute per IP.

**Logic:**
1. Validate coords: `tile_key` must equal `"{tx}:{ty}"`, both 0–16383 → `400` if mismatch.
2. Normalize `owner`: `0x...` addresses lowercased, non-hex owners left as-is.
3. Open `BEGIN EXCLUSIVE` transaction to prevent race condition on simultaneous purchases.
4. Check ownership:
   ```sql
   SELECT owner FROM blocks WHERE tile_key = ?
   ```
5. If owned by different user → `409 Conflict`: "Already owned by {owner}"
6. If unowned or same owner → upsert (protected fields never overwritten):
   ```sql
   INSERT INTO blocks (tile_key, tx, ty, owner, color, price, country, purchased_at, image_url, label)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(tile_key) DO UPDATE SET
     color = excluded.color,
     image_url = excluded.image_url,
     label = excluded.label
   ```
   `price`, `chain`, `country`, and `owner` are immutable after first purchase.
7. `purchased_at` is auto-set to `int(time.time() * 1000)` (current Unix ms)

**Response:** `Block` (the saved record, fetched back from DB)

**Error responses:**
- `400 Bad Request` — coord mismatch or out-of-range
- `409 Conflict` — tile owned by another user

---

#### `GET /stats`
Aggregate statistics across all blocks.

**Response:**
```json
{ "sold": 183, "volume": 824.50, "owners": 28 }
```

**SQL:**
```sql
SELECT
    COUNT(*) as sold,
    COALESCE(SUM(price), 0) as volume,
    COUNT(DISTINCT owner) as owners
FROM blocks
```

---

### Database Helper: `row_to_dict(row)`
Converts `aiosqlite.Row` to `dict`. Used to build Pydantic model from query result.

```python
def row_to_dict(row):
    return {
        "tile_key": row["tile_key"],
        "tx": row["tx"],
        "ty": row["ty"],
        "owner": row["owner"],
        "color": row["color"],
        "price": row["price"],
        "country": row["country"],
        "purchased_at": row["purchased_at"],
        "image_url": row["image_url"],
        "label": row["label"],
    }
```

---

### NOWPayments Integration

#### `POST /np/payment`
Creates a NOWPayments payment intent and stores metadata for IPN fulfillment.

**Rate limit:** 10 requests/minute per IP.

**Request body:** `CreatePaymentRequest`
```python
class CreatePaymentRequest(BaseModel):
    tile_key: str
    usd_amount: float
    currency: str        # e.g. "usdttrc20"
    owner: Optional[str] = None
    chain: Optional[str] = None
    ref_code: Optional[str] = None
    session_id: Optional[str] = None
```

**Logic:**
- Calls NOWPayments API to create payment, returns full NP response.
- Stores `owner`, `chain`, `ref_code`, `session_id` in `payments` table for use by IPN handler.
- Uses `SERVER_URL` env var for IPN callback URL (must be publicly accessible in production).

#### `POST /np/ipn`
IPN webhook called by NOWPayments when payment status changes.

**Logic:**
- Verifies HMAC-SHA512 signature using `NOWPAYMENTS_IPN_SECRET`.
- On `finished` status: calls `np_finalize()` which uses `BEGIN EXCLUSIVE` transaction and validates tile coords.
- On `partially_paid` status: only finalizes if received amount ≥ 95% of expected.
- Looks up `owner`, `chain`, `ref_code`, `session_id` from stored `payments` row to use real owner (never fabricates one).
- Calls `_process_referral_commission()` with ref_code and session_id for affiliate credit.

---

### `payments` Table

```sql
CREATE TABLE IF NOT EXISTS payments (
    np_payment_id  TEXT PRIMARY KEY,
    tile_key       TEXT NOT NULL,
    usd_amount     REAL NOT NULL,
    currency       TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'waiting',
    created_at     INTEGER NOT NULL,
    owner          TEXT,     -- tile owner after purchase
    chain          TEXT,     -- blockchain (e.g. 'polygon')
    ref_code       TEXT,     -- affiliate ref code if present
    session_id     TEXT      -- session UUID for affiliate tracking
)
```

---

## `server/seed.py`

Standalone script to populate `cryptoland.db` with realistic test data. Run once:
```bash
python seed.py
```

### Data Inputs

#### Users (28 hardcoded)
Each user has:
- `handle`: username string
- `color`: hex color for their blocks
- `home_city`: name of their primary city
- `personality`: `'whale' | 'collector' | 'strategic' | 'random'`

#### Cities (28 real-world locations)
Each city has:
- `name`: display name
- `lng`, `lat`: WGS-84 coordinates
- Used to compute home tile coordinates via Web Mercator math

#### Scatter Points (~40 entries)
Land-only global coordinates for non-home purchases. Avoids oceans.

#### Unsplash Image URLs (15 entries)
Random real landmark photos assigned to some blocks.

### Generation Logic

For each user:
1. **Home blocks:** Buy N tiles within 2–8 tile radius of home city center
   - Count determined by personality:
     - `whale`: 6–12
     - `collector`: 4–8
     - `strategic`: 3–6
     - `random`: 2–5
   - 45% chance each block gets an image URL
   - ~50% chance each block gets a label (emoji prefix, e.g. "🌆 My City")
   - Price: random `$1.20–$9.50`

2. **Global blocks:** Buy M tiles at random scatter points
   - Count by personality:
     - `whale`: 4–8
     - `collector`: 2–5
     - `strategic`: 3–7
     - `random`: 1–4
   - 30% chance image URL
   - Price: random `$0.80–$6.00`

3. **Timestamps:** Each block gets a random `purchased_at` in the past 14 days

### Output
~180 blocks across 28 distinct owners, all inserted into `blocks` table.
Existing data is cleared (`DELETE FROM blocks`) before seeding.

---

## Database File

`server/cryptoland.db` — committed SQLite file. Contains seeded data out of the box. Delete + re-run `seed.py` to reset.

All seed data uses `SEED_OWNER = "0x0000000000000000000000000000000000000001"` as the block owner (replaces old fake owner strings).

---

## Viral feature endpoints (2026 v1)

See [viral-strategy.md](viral-strategy.md) for the strategic rationale.

### Tables

```sql
CREATE TABLE streaks (
  user_id          TEXT PRIMARY KEY,
  current_streak   INTEGER NOT NULL DEFAULT 0,
  longest_streak   INTEGER NOT NULL DEFAULT 0,
  last_checkin_day TEXT,                          -- 'YYYY-MM-DD' UTC
  last_checkin_at  INTEGER NOT NULL DEFAULT 0,
  total_checkins   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE share_cards (
  card_id      TEXT PRIMARY KEY,                  -- "user_id:YYYY-MM-DD"
  user_id      TEXT NOT NULL,
  day          TEXT NOT NULL,                     -- 'YYYY-MM-DD' UTC
  payload_json TEXT NOT NULL,                     -- serialized card data
  generated_at INTEGER NOT NULL,
  view_count   INTEGER NOT NULL DEFAULT 0,
  share_count  INTEGER NOT NULL DEFAULT 0
);
```

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/streak/checkin`               | Token  | Idempotent daily check-in. Increments or resets streak. |
| `GET`  | `/streak/me`                     | Token  | Current user's streak status (incl. `checked_in_today`). |
| `GET`  | `/streak/leaderboard?limit=25`   | None   | Top streaks globally. |
| `GET`  | `/streak/owners`                 | None   | All wallets/user_ids with streak ≥ 7 — used by Map for badges. |
| `GET`  | `/share/card/me`                 | Token  | Today's empire card payload (cached per UTC day). |
| `GET`  | `/share/card/{handle}`           | None   | Public card by handle — used for share preview. |
| `POST` | `/share/card/{handle}/share`     | None   | Increment share count (analytics only). |
| `GET`  | `/empire/{handle}`               | None   | Full public empire snapshot for the `/u/{handle}` viewer page. |
| `GET`  | `/search/place?q=...&limit=6`    | None   | Nominatim-backed real-place search returning the matching Z14 tile. |

### Streak badge tiers

```python
def _streak_badge(streak):
    if streak >= 365: return "Legend"
    if streak >= 100: return "Gold"
    if streak >= 30:  return "Silver"
    if streak >= 7:   return "Spark"
    return None
```

UTC day boundaries are used so streaks are deterministic regardless of user timezone. Yesterday calculation uses `datetime.timedelta(days=1)`.

## Security Notes

- `server/.env` is in `.gitignore` — never commit API keys. Copy `.env.example` to `.env`.
- `server/.env.example` is the safe template with placeholder values.
- All `0x...` wallet addresses are stored lowercase — `_norm_wallet()` applied on all writes.
- `BEGIN EXCLUSIVE` transactions prevent double-purchase race conditions.
- `ON CONFLICT DO UPDATE` on `blocks` protects `price`, `owner`, `chain`, `country` from being overwritten on re-customization.
- UNIQUE index on `referrals(tile_key)` prevents duplicate affiliate commissions per tile.

---

## 2026 Viral Frontier Module (`server/viral.py`)

A self-contained module that adds four 2026-frontier viral primitives. See [viral.md](viral.md) for strategy.

### Tables

| Table | Purpose |
|---|---|
| `agent_posts` | Public Guardian-agent micro-posts (Truth Terminal pattern). `(id, tile_key, owner, personality, mood, body, treasury, kind, ts)` |
| `squads` | 6-member intimacy-cap squads. `(squad_id, code, name, creator_id, created_at)` |
| `squad_members` | Composite PK `(squad_id, user_id)`. |
| `daily_drops` | One claim per (date_utc, user). `(date_utc, user_id, choice_idx, rarity, tile_key, country, claimed_at)` |

All tables are `CREATE TABLE IF NOT EXISTS` and bootstrapped in `lifespan()` via `init_viral_tables(DB_PATH)`.

### Routes (mounted via `app.include_router(build_viral_router(DB_PATH, _require_auth))`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/agents/feed?limit=N` | none | Public global feed of Guardian thoughts |
| GET | `/agents/{tile_key}/recent?limit=N` | none | Per-tile thought history |
| POST | `/agents/{tile_key}/post` | Bearer (tile owner) | Owner publishes a 280-char post (60s rate-limit per tile) |
| GET | `/og/{tile_key}.svg` | none | OG-image SVG for Twitter/Discord/Telegram unfurls (1200×630) |
| GET | `/t/{tile_key}` | none | Frame-style standalone HTML mini-page with OG/Twitter/Farcaster meta |
| POST | `/squads/create` | Bearer | Creates a squad; user becomes first member |
| POST | `/squads/join` | Bearer | Joins by `SQ-XXXXXX` code (max 6 members enforced) |
| POST | `/squads/leave` | Bearer | Removes user from their current squad |
| GET | `/squads/me` | Bearer | Full summary of user's squad with members + yield math |
| GET | `/squads/{squad_id}` | none | Public squad summary |
| GET | `/squads/leaderboard/top` | none | Top-10 squads by aggregated tile volume |
| GET | `/drop/today` | optional Bearer | Today's drop window state + user's claim if authed |
| POST | `/drop/claim` | Bearer | Claim with `choice_idx` ∈ {0,1,2} — 90s window enforced |
| GET | `/drop/feed?limit=N` | none | Recent global drop claims |

### Squad yield math

- `member_count >= 4` → `yield_multiplier = 1.4` (healthy)
- `member_count <  4` → `yield_multiplier = 0.6` (shrunk penalty)
- `pool_daily = total_squad_volume * 0.02 * yield_multiplier`
- `per_member_daily = pool_daily / max(1, member_count)`

### Drop deterministic resolution

Per-user, per-date, per-choice: `seed = SHA-256(f"{date_utc}:{user_id}:{choice_idx}")[:16]`. Rarity weights vary by Founder tier:
- `founder` (first 1k users) → 50/35/15 common/rare/mythic
- `pioneer` (1k–10k) → 60/32/8
- `settler` (10k–100k) → 70/25/5
- `none` → 80/18/2

The window opens once per day at a date-derived global UTC hour (12-23), lasts exactly 90 seconds, identical for every user worldwide.

### Background task

`agent_feed_loop(DB_PATH)` runs every 3 minutes. If the last `agent_posts` row is >3 min old, it picks a random guardian (or guardian-less block) and inserts a fresh personality-driven post. Salted random so consecutive posts vary.

### Frame meta tags

`/t/{tile_key}` emits **OpenGraph**, **Twitter Card**, **and Farcaster Frame vNext** meta tags so a single share works across all three platforms with one unfurl image (`/og/{tile_key}.svg`).
