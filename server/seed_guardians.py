"""
Guardian seed — populates the `guardians` and `raid_log` tables
with realistic data for ~70% of existing blocks.

Owner archetypes drive personality assignment:
  "whales" / .eth heavy-hitters → aggressive (raiding others)
  active traders / mid-tier     → balanced
  casual / anon / single-tile   → passive

Run: python3 seed_guardians.py
Idempotent: clears guardian + raid_log tables before inserting.
"""
import sqlite3, time, random, math
from pathlib import Path

DB = Path(__file__).parent / "cryptoland.db"

random.seed(42)
now_ms = int(time.time() * 1000)

def ts_ago(days):
    return now_ms - int(days * 24 * 3600 * 1000) + random.randint(-3600000, 3600000)

# ── Owner archetypes ──────────────────────────────────────────────────────────
# aggressive = high attack, raids often; balanced = versatile; passive = defender

OWNER_ARCHETYPE = {
    # Aggressive players — whales and power users
    "CryptoWhale.eth":  "aggressive",
    "NFT_Baron":        "aggressive",
    "LandBaron.eth":    "aggressive",
    "DeFiKing.eth":     "aggressive",
    "SilkRoad.eth":     "aggressive",
    "GeoMaster":        "aggressive",
    "0x9bBc…1f77":      "aggressive",
    "TundraKing":       "aggressive",
    "PixelEarth":       "aggressive",

    # Balanced players — active traders, named accounts
    "eth_maxi":         "balanced",
    "moon_boi":         "balanced",
    "Satoshi_fan":      "balanced",
    "sofia.m":          "balanced",
    "james_k":          "balanced",
    "hiroshi_t":        "balanced",
    "web3_anon":        "balanced",
    "TropicToken":      "balanced",
    "isabela_r":        "balanced",
    "mehmet_y":         "balanced",
    "luca_verdi":       "balanced",
    "MapleCrypto":      "balanced",
    "CryptoNomad.eth":  "balanced",
    "PetroDollar":      "balanced",
    "priya_nair":       "balanced",

    # Passive players — casual, anon, or single-tile holders
    "crypto_kate":      "passive",
    "mark.j88":         "passive",
    "travel_tom":       "passive",
    "yuki_s":           "passive",
    "omar.al":          "passive",
    "CapeHope.eth":     "passive",
    "alex_novak":       "passive",
    "BalticChain":      "passive",
    "ZurichVault.eth":  "passive",
    "anna_k":           "passive",
    "NordicBlock":      "passive",
    "sara_l":           "passive",
    "MumbaiMoon":       "passive",
    "nikhil_a":         "passive",
    "real_estate_ravi": "passive",
    "AfricaDAO":        "passive",
    "kwame_o":          "passive",
    "DesertBloom":      "passive",
    "fatima_h":         "passive",
    "PampasLord":       "passive",
    "defi_degen":       "passive",
    "carlos_m":         "passive",
    "BlockVault.eth":   "passive",
    "ming_zhang":       "passive",
    "liu_wei":          "passive",
    "not_a_bot_lol":    "passive",
    "david_p":          "passive",
}

# Budget ranges per archetype — whales spend more
BUDGET_RANGES = {
    "aggressive": (80,  400),
    "balanced":   (20,  120),
    "passive":    (5,   40),
}

# XP ranges per archetype — veterans have more XP
XP_RANGES = {
    "aggressive": (800,  6000),
    "balanced":   (200,  2000),
    "passive":    (10,   500),
}

# Deployment age (days ago) per archetype
DEPLOY_AGE = {
    "aggressive": (3,  25),
    "balanced":   (1,  20),
    "passive":    (1,  15),
}

# ── Skip ratio — which owners DON'T get guardians on NON-landmark tiles ──────
# Landmark tiles (label IS NOT NULL) always get a guardian regardless of owner.
# Only unlabeled cluster tiles for these owners may be skipped.

NO_GUARDIAN_OWNERS = {
    "mark.j88", "0x9bBc…1f77", "liu_wei",
    "david_p", "not_a_bot_lol", "sara_l",
    "kwame_o", "fatima_h", "carlos_m",
}
# These owners get guardians on SOME of their non-landmark tiles
PARTIAL_GUARDIAN_OWNERS = {
    "crypto_kate": 0.5,
    "omar.al":     0.5,
    "yuki_s":      0.7,
    "travel_tom":  0.6,
    "ming_zhang":  0.6,
    "BalticChain": 0.7,
    "anna_k":      0.5,
    "nikhil_a":    0.7,
    "defi_degen":  0.6,
    "PampasLord":  0.5,
    "BlockVault.eth": 0.7,
}

# ── RAID LOG seed data ────────────────────────────────────────────────────────
# Realistic historical raids — whales attacking everyone

RAID_SCENARIOS = [
    # (attacker_tile_owner, defender_tile_owner, days_ago, attacker_wins, yield_stolen)
    ("CryptoWhale.eth", "travel_tom",     14, True,  0.042),
    ("CryptoWhale.eth", "yuki_s",         11, True,  0.031),
    ("CryptoWhale.eth", "omar.al",         8, False, 0.0),
    ("NFT_Baron",       "alex_novak",     12, True,  0.028),
    ("NFT_Baron",       "CapeHope.eth",    9, True,  0.019),
    ("LandBaron.eth",   "mark.j88",       16, True,  0.051),
    ("LandBaron.eth",   "not_a_bot_lol",  10, False, 0.0),
    ("DeFiKing.eth",    "nikhil_a",        7, True,  0.033),
    ("DeFiKing.eth",    "kwame_o",         5, True,  0.022),
    ("SilkRoad.eth",    "ming_zhang",     13, True,  0.047),
    ("GeoMaster",       "fatima_h",        9, True,  0.018),
    ("GeoMaster",       "DesertBloom",     6, False, 0.0),
    ("0x9bBc…1f77",     "BalticChain",    18, True,  0.035),
    ("TundraKing",      "anna_k",         15, True,  0.025),
    ("TundraKing",      "NordicBlock",    11, False, 0.0),
    ("PixelEarth",      "ZurichVault.eth", 8, True,  0.029),
    ("eth_maxi",        "DesertBloom",    20, True,  0.015),
    ("eth_maxi",        "BlockVault.eth", 17, False, 0.0),
    ("moon_boi",        "crypto_kate",    14, False, 0.0),
    ("Satoshi_fan",     "not_a_bot_lol",  19, True,  0.040),
    ("web3_anon",       "liu_wei",        12, True,  0.022),
    ("TropicToken",     "carlos_m",        8, True,  0.017),
    ("isabela_r",       "PampasLord",     10, False, 0.0),
    ("priya_nair",      "real_estate_ravi", 6, True, 0.021),
    ("MapleCrypto",     "david_p",         4, True,  0.009),
    # Counter-raids
    ("travel_tom",      "CryptoWhale.eth",  5, False, 0.0),
    ("yuki_s",          "NFT_Baron",        3, False, 0.0),
    ("CapeHope.eth",    "LandBaron.eth",    7, False, 0.0),
    ("mehmet_y",        "GeoMaster",        9, True,  0.038),
    ("luca_verdi",      "sofia.m",          5, False, 0.0),
    ("sofia.m",         "eth_maxi",         2, True,  0.011),
    ("hiroshi_t",       "Satoshi_fan",     15, False, 0.0),
    ("PetroDollar",     "NFT_Baron",        4, True,  0.055),
    ("PetroDollar",     "omar.al",          2, True,  0.041),
    ("CryptoNomad.eth", "PixelEarth",       6, False, 0.0),
]

# ── Connect and migrate ───────────────────────────────────────────────────────

con = sqlite3.connect(DB)
cur = con.cursor()

# Create tables if missing (in case server hasn't run yet)
cur.execute("""
    CREATE TABLE IF NOT EXISTS guardians (
        tile_key    TEXT PRIMARY KEY,
        owner       TEXT NOT NULL,
        personality TEXT NOT NULL DEFAULT 'balanced',
        budget      REAL NOT NULL DEFAULT 10.0,
        xp          INTEGER NOT NULL DEFAULT 0,
        deployed_at INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
    )
""")
cur.execute("""
    CREATE TABLE IF NOT EXISTS raid_log (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        attacker_tile   TEXT NOT NULL,
        defender_tile   TEXT NOT NULL,
        attacker_wins   INTEGER NOT NULL,
        yield_stolen    REAL NOT NULL DEFAULT 0,
        atk_roll        REAL NOT NULL DEFAULT 0,
        def_roll        REAL NOT NULL DEFAULT 0,
        margin_pct      REAL NOT NULL DEFAULT 0,
        message         TEXT NOT NULL DEFAULT '',
        timestamp_ms    INTEGER NOT NULL
    )
""")
cur.execute("CREATE INDEX IF NOT EXISTS idx_raid_attacker ON raid_log(attacker_tile)")
cur.execute("CREATE INDEX IF NOT EXISTS idx_raid_defender ON raid_log(defender_tile)")

# Clear existing seeded data
cur.execute("DELETE FROM guardians")
cur.execute("DELETE FROM raid_log")

# ── Load all blocks ───────────────────────────────────────────────────────────

blocks = cur.execute(
    "SELECT tile_key, owner, label FROM blocks ORDER BY purchased_at DESC"
).fetchall()

print(f"Found {len(blocks)} blocks")

# ── Seed guardians ────────────────────────────────────────────────────────────

guardian_records = []
tile_to_owner    = {}   # tile_key → owner (for raid log lookups)

for tile_key, owner, label in blocks:
    tile_to_owner[tile_key] = owner
    is_landmark = bool(label)  # tiles with labels = named places (capitals, landmarks)

    # Landmark tiles always get a guardian — they're the most visible tiles
    if not is_landmark:
        # Fully excluded owners — skip their unnamed cluster tiles
        if owner in NO_GUARDIAN_OWNERS:
            continue
        # Partial — coin flip on non-landmark tiles only
        if owner in PARTIAL_GUARDIAN_OWNERS:
            if random.random() > PARTIAL_GUARDIAN_OWNERS[owner]:
                continue

    personality  = OWNER_ARCHETYPE.get(owner, "balanced")
    bmin, bmax   = BUDGET_RANGES[personality]
    xmin, xmax   = XP_RANGES[personality]
    dmin, dmax   = DEPLOY_AGE[personality]

    # Landmark tiles get slightly better stats (owners care about these)
    if is_landmark:
        budget   = round(random.uniform(bmin * 1.3, bmax), 2)
        xp       = random.randint(int(xmin * 1.2), xmax)
    else:
        budget   = round(random.uniform(bmin, bmax * 0.8), 2)
        xp       = random.randint(xmin, int(xmax * 0.8))

    days_ago    = random.uniform(dmin, dmax)
    deployed_at = ts_ago(days_ago)

    guardian_records.append((
        tile_key, owner, personality, budget, xp,
        deployed_at, deployed_at,
    ))

cur.executemany("""
    INSERT OR REPLACE INTO guardians
        (tile_key, owner, personality, budget, xp, deployed_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
""", guardian_records)

# ── Seed raid log ─────────────────────────────────────────────────────────────

# Build owner → tile_key(s) map
owner_tiles = {}
for tile_key, owner, _label in blocks:
    owner_tiles.setdefault(owner, []).append(tile_key)

# Build guardian tile set for quick lookup
guarded_tiles = {r[0] for r in guardian_records}

RAID_MESSAGES = [
    "Raid successful. Yield extracted.",
    "Guardian held the line. Yield protected.",
    "Aggressive tactics paid off.",
    "The raider broke through your defenses.",
    "Defender was too strong. Try a weaker target.",
    "Territory secured against all raiders.",
    "Yield transferred. Consider upgrading.",
    "Guardian dominated the combat.",
    "Close fight — defender barely held on.",
    "Overwhelming force. Tile breached.",
]

raid_records = []
for (atk_owner, def_owner, days_ago, atk_wins, yield_stolen) in RAID_SCENARIOS:
    atk_tiles = [t for t in owner_tiles.get(atk_owner, []) if t in guarded_tiles]
    def_tiles = [t for t in owner_tiles.get(def_owner, []) if t in guarded_tiles or t in tile_to_owner]
    if not atk_tiles or not def_tiles:
        continue

    atk_tile = random.choice(atk_tiles)
    def_tile = random.choice(def_tiles)
    if atk_tile == def_tile:
        continue

    atk_roll   = round(random.uniform(15, 90), 2)
    def_roll   = round(atk_roll * (0.7 if atk_wins else 1.2) + random.uniform(-5, 5), 2)
    margin_pct = round(abs(atk_roll - def_roll) / max(atk_roll, def_roll) * 100, 1)
    message    = random.choice(RAID_MESSAGES)
    timestamp  = ts_ago(days_ago)

    raid_records.append((
        atk_tile, def_tile, int(atk_wins), yield_stolen,
        atk_roll, def_roll, margin_pct, message, timestamp,
    ))

cur.executemany("""
    INSERT INTO raid_log
        (attacker_tile, defender_tile, attacker_wins, yield_stolen,
         atk_roll, def_roll, margin_pct, message, timestamp_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
""", raid_records)

con.commit()

# ── Stats ─────────────────────────────────────────────────────────────────────
g_total  = cur.execute("SELECT COUNT(*) FROM guardians").fetchone()[0]
r_total  = cur.execute("SELECT COUNT(*) FROM raid_log").fetchone()[0]
agg = cur.execute("SELECT COUNT(*) FROM guardians WHERE personality='aggressive'").fetchone()[0]
bal = cur.execute("SELECT COUNT(*) FROM guardians WHERE personality='balanced'").fetchone()[0]
pas = cur.execute("SELECT COUNT(*) FROM guardians WHERE personality='passive'").fetchone()[0]

con.close()

pct = round(g_total / len(blocks) * 100, 1)
print(f"✓ {g_total} guardians ({pct}% of {len(blocks)} blocks)")
print(f"  ⚔️  Aggressive: {agg}")
print(f"  ⚖️  Balanced:   {bal}")
print(f"  🛡️  Passive:    {pas}")
print(f"✓ {r_total} raid log entries")
