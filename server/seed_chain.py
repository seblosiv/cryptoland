"""
Per-chain seed data — CryptoLand
=================================
Every chain-native deployment gets its own world (its own DB), which means a
freshly-deployed Algorand or Sui build starts completely empty. An empty map is
the worst possible first impression for a grant reviewer, so this generates a
believable, *chain-appropriate* population for any single chain.

    python3 seed_chain.py --chain algorand --db /srv/cryptoland/algorand.db
    python3 seed_chain.py --chain ton --users 140 --reset

What it produces, all stamped with the target chain:
  * ~120 owners with addresses in that chain's REAL format (an Algorand build
    showing 0x… owners would be an instant tell)
  * land clustered around real cities, priced by region, with a realistic
    long-tail distribution of holdings (a few whales, many single-tile owners)
  * purchase timestamps following a growth curve over ~8 weeks
  * guardians on a slice of tiles, plus a few live marketplace listings
  * analytics events, so GET /metrics/grant returns real DAU/WAU/MAU and
    D1/D7 retention instead of zeros

⚠️  DEVELOPMENT / DEMO ONLY. Seeded owners are generated addresses, not real
    users. Never point this at a database holding real purchases.
"""

import argparse
import hashlib
import math
import random
import sqlite3
import string
import time
from pathlib import Path

Z = 14
N = 2 ** Z  # 16384

# ── Chain → address family ────────────────────────────────────────────────────
# Mirrors the `family` field in src/lib/blockchain/config.js.
CHAIN_FAMILY = {
    # EVM
    "polygon": "evm", "avalanche": "evm", "base": "evm", "ethereum": "evm",
    "arbitrum": "evm", "ronin": "evm", "bnb": "evm", "optimism": "evm",
    "scroll": "evm", "celo": "evm", "moonbeam": "evm", "beam": "evm",
    "oasys": "evm", "skale": "evm", "skale-europa": "evm", "hedera": "evm",
    "injective": "evm",
    # non-EVM
    "solana": "solana", "ton": "ton", "aptos": "aptos", "sui": "sui",
    "starknet": "starknet", "cardano": "cardano", "near": "near",
    "stellar": "stellar", "algorand": "algorand", "multiversx": "multiversx",
    "radix": "radix", "tezos": "tezos",
}

B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
BECH = "023456789acdefghjklmnpqrstuvwxyz"

NEAR_WORDS = ["atlas", "orbit", "vega", "nova", "delta", "koda", "lumen", "pixel",
              "quartz", "rover", "sable", "tundra", "umbra", "vertex", "wren", "zephyr"]


def _hex(rng, n):
    return "".join(rng.choice("0123456789abcdef") for _ in range(n))


def make_address(rng, family, i):
    """Generate a syntactically plausible address for the chain's family."""
    if family == "evm":
        return "0x" + _hex(rng, 40)
    if family == "solana":
        return "".join(rng.choice(B58) for _ in range(44))
    if family == "ton":
        return "EQ" + "".join(rng.choice(B58 + "_-") for _ in range(46))
    if family in ("aptos", "sui", "starknet"):
        return "0x" + _hex(rng, 64)
    if family == "cardano":
        return "addr1q" + "".join(rng.choice(BECH) for _ in range(52))
    if family == "near":
        return f"{rng.choice(NEAR_WORDS)}{rng.randint(10, 9999)}.near"
    if family == "stellar":
        return "G" + "".join(rng.choice(B32) for _ in range(55))
    if family == "algorand":
        return "".join(rng.choice(B32) for _ in range(58))
    if family == "multiversx":
        return "erd1" + "".join(rng.choice(BECH) for _ in range(58))
    if family == "radix":
        return "account_rdx12" + "".join(rng.choice(BECH) for _ in range(52))
    if family == "tezos":
        return "tz1" + "".join(rng.choice(B58) for _ in range(33))
    return "0x" + _hex(rng, 40)


# ── Where people actually buy ────────────────────────────────────────────────
# (name, country, lng, lat, weight, price_mult) — weight biases how many tiles
# land here; price_mult reflects real-world desirability.
CITIES = [
    ("New York",     "United States", -73.985,  40.758, 10, 2.6),
    ("Los Angeles",  "United States", -118.243, 34.052,  7, 2.2),
    ("Miami",        "United States", -80.191,  25.774,  5, 2.0),
    ("London",       "United Kingdom", -0.128,  51.507,  9, 2.5),
    ("Paris",        "France",          2.352,  48.857,  7, 2.3),
    ("Berlin",       "Germany",        13.405,  52.520,  6, 1.8),
    ("Amsterdam",    "Netherlands",     4.895,  52.370,  4, 1.9),
    ("Zurich",       "Switzerland",     8.541,  47.377,  3, 2.4),
    ("Lisbon",       "Portugal",       -9.139,  38.722,  4, 1.5),
    ("Warsaw",       "Poland",         21.012,  52.230,  4, 1.3),
    ("Istanbul",     "Turkey",         28.979,  41.008,  4, 1.2),
    ("Dubai",        "UAE",            55.271,  25.205,  7, 2.4),
    ("Singapore",    "Singapore",     103.820,   1.352,  7, 2.5),
    ("Tokyo",        "Japan",         139.692,  35.690,  9, 2.4),
    ("Seoul",        "South Korea",   126.978,  37.567,  6, 2.0),
    ("Hong Kong",    "China",         114.169,  22.319,  5, 2.3),
    ("Shanghai",     "China",         121.474,  31.230,  5, 2.0),
    ("Mumbai",       "India",          72.878,  19.076,  6, 1.4),
    ("Bangalore",    "India",          77.595,  12.972,  5, 1.3),
    ("Jakarta",      "Indonesia",     106.845,  -6.208,  4, 1.1),
    ("Manila",       "Philippines",   120.984,  14.599,  4, 1.1),
    ("Ho Chi Minh",  "Vietnam",       106.660,  10.823,  3, 1.1),
    ("Lagos",        "Nigeria",         3.379,   6.524,  4, 1.0),
    ("Nairobi",      "Kenya",          36.822,  -1.292,  3, 1.0),
    ("Cape Town",    "South Africa",   18.424, -33.925,  3, 1.3),
    ("Sao Paulo",    "Brazil",        -46.633, -23.551,  5, 1.3),
    ("Buenos Aires", "Argentina",     -58.382, -34.604,  4, 1.2),
    ("Mexico City",  "Mexico",        -99.133,  19.433,  4, 1.3),
    ("Toronto",      "Canada",        -79.383,  43.653,  5, 1.8),
    ("Sydney",       "Australia",     151.209, -33.868,  5, 2.0),
    # ── Second tier: keeps the map from looking like 30 hotspots on black ─────
    ("Chicago",      "United States", -87.630,  41.878,  4, 1.7),
    ("Austin",       "United States", -97.743,  30.267,  3, 1.6),
    ("Seattle",      "United States",-122.335,  47.606,  3, 1.8),
    ("Denver",       "United States",-104.991,  39.739,  2, 1.5),
    ("Montreal",     "Canada",        -73.567,  45.501,  3, 1.5),
    ("Vancouver",    "Canada",       -123.121,  49.283,  3, 1.7),
    ("Madrid",       "Spain",          -3.703,  40.417,  4, 1.6),
    ("Barcelona",    "Spain",           2.173,  41.385,  4, 1.7),
    ("Milan",        "Italy",           9.190,  45.464,  4, 1.7),
    ("Rome",         "Italy",          12.496,  41.903,  3, 1.6),
    ("Munich",       "Germany",        11.582,  48.135,  3, 1.8),
    ("Hamburg",      "Germany",         9.993,  53.551,  2, 1.5),
    ("Vienna",       "Austria",        16.373,  48.208,  3, 1.6),
    ("Prague",       "Czechia",        14.438,  50.076,  3, 1.4),
    ("Budapest",     "Hungary",        19.040,  47.498,  2, 1.3),
    ("Stockholm",    "Sweden",         18.069,  59.329,  3, 1.7),
    ("Oslo",         "Norway",         10.752,  59.914,  2, 1.7),
    ("Copenhagen",   "Denmark",        12.568,  55.676,  2, 1.7),
    ("Helsinki",     "Finland",        24.941,  60.170,  2, 1.5),
    ("Dublin",       "Ireland",        -6.260,  53.350,  3, 1.7),
    ("Edinburgh",    "United Kingdom", -3.188,  55.953,  2, 1.5),
    ("Manchester",   "United Kingdom", -2.244,  53.481,  2, 1.4),
    ("Bucharest",    "Romania",        26.103,  44.427,  2, 1.2),
    ("Athens",       "Greece",         23.728,  37.984,  2, 1.3),
    ("Kyiv",         "Ukraine",        30.523,  50.450,  2, 1.1),
    ("Tel Aviv",     "Israel",         34.781,  32.085,  3, 1.9),
    ("Riyadh",       "Saudi Arabia",   46.674,  24.713,  3, 1.7),
    ("Doha",         "Qatar",          51.531,  25.286,  2, 1.8),
    ("Karachi",      "Pakistan",       67.010,  24.861,  3, 1.0),
    ("Delhi",        "India",          77.209,  28.614,  5, 1.4),
    ("Hyderabad",    "India",          78.487,  17.385,  3, 1.2),
    ("Chennai",      "India",          80.271,  13.083,  3, 1.2),
    ("Dhaka",        "Bangladesh",     90.407,  23.811,  3, 1.0),
    ("Bangkok",      "Thailand",      100.502,  13.756,  4, 1.3),
    ("Kuala Lumpur", "Malaysia",      101.687,   3.139,  3, 1.3),
    ("Taipei",       "Taiwan",        121.565,  25.033,  3, 1.7),
    ("Osaka",        "Japan",         135.502,  34.694,  4, 1.9),
    ("Busan",        "South Korea",   129.075,  35.180,  2, 1.5),
    ("Shenzhen",     "China",         114.058,  22.543,  4, 1.8),
    ("Beijing",      "China",         116.407,  39.904,  4, 1.9),
    ("Melbourne",    "Australia",     144.946, -37.840,  3, 1.8),
    ("Auckland",     "New Zealand",   174.763, -36.848,  2, 1.6),
    ("Rio",          "Brazil",        -43.173, -22.907,  3, 1.3),
    ("Bogota",       "Colombia",      -74.072,   4.711,  3, 1.1),
    ("Lima",         "Peru",          -77.043, -12.046,  2, 1.1),
    ("Santiago",     "Chile",         -70.670, -33.449,  3, 1.3),
    ("Accra",        "Ghana",          -0.187,   5.604,  2, 1.0),
    ("Casablanca",   "Morocco",        -7.590,  33.573,  2, 1.1),
    ("Cairo",        "Egypt",          31.236,  30.044,  3, 1.1),
    ("Johannesburg", "South Africa",   28.034, -26.195,  3, 1.2),
    ("Addis Ababa",  "Ethiopia",       38.746,   9.032,  2, 1.0),
    ("Istanbul-Asia","Turkey",         29.100,  40.990,  2, 1.2),
    ("Tbilisi",      "Georgia",        44.783,  41.716,  2, 1.1),
    ("Almaty",       "Kazakhstan",     76.886,  43.238,  2, 1.0),
]

# Wider regions used to scatter a minority of tiles well away from any city, so
# the world doesn't look like a handful of perfect hotspots on an empty globe.
# (name, country, lng_min, lng_max, lat_min, lat_max, weight)
SCATTER_REGIONS = [
    ("US Midwest",     "United States", -104.0, -82.0,  33.0, 47.0, 6),
    ("US West",        "United States", -122.0,-105.0,  32.0, 48.0, 4),
    ("US East",        "United States",  -82.0, -70.0,  30.0, 44.0, 5),
    ("Western Europe", "France",          -4.0,   8.0,  43.0, 51.0, 5),
    ("Central Europe", "Germany",          8.0,  22.0,  45.0, 55.0, 5),
    ("Iberia",         "Spain",           -9.0,   3.0,  37.0, 43.0, 3),
    ("Nordics",        "Sweden",           8.0,  28.0,  55.0, 65.0, 3),
    ("UK & Ireland",   "United Kingdom",  -9.0,   1.5,  50.0, 57.5, 3),
    ("Turkey",         "Turkey",          27.0,  42.0,  36.0, 41.0, 2),
    ("India",          "India",           70.0,  88.0,   9.0, 30.0, 5),
    ("SE Asia",        "Thailand",        97.0, 120.0,  -8.0, 20.0, 4),
    ("East China",     "China",          105.0, 122.0,  22.0, 41.0, 4),
    ("Japan",          "Japan",          130.0, 141.0,  32.0, 43.0, 3),
    ("Brazil",         "Brazil",         -52.0, -38.0, -25.0, -5.0, 3),
    ("Southern Cone",  "Argentina",      -68.0, -55.0, -38.0,-25.0, 2),
    ("Mexico",         "Mexico",        -105.0, -88.0,  16.0, 28.0, 2),
    ("West Africa",    "Nigeria",         -8.0,  10.0,   5.0, 14.0, 2),
    ("East Africa",    "Kenya",           30.0,  41.0, -6.0,   5.0, 2),
    ("South Africa",   "South Africa",    18.0,  31.0, -34.0,-24.0, 2),
    ("Australia East", "Australia",      141.0, 153.0, -38.0,-25.0, 3),
]

LABELS = [
    "HQ", "home base", "first claim", "the spot", "mine 🏴", "outpost",
    "flag planted", "day one", "north star", "the vault", "basecamp",
    "downtown", "the corner", "my block", "landmark", "territory",
]

EMOJI_LABELS = ["🏰", "🚩", "⛩️", "🗽", "🌆", "🏙️", "🛰️", "🌍", "⚓", "🔺", "💎", "🔥"]

COLORS = ["#4ade80", "#60a5fa", "#f472b6", "#fbbf24", "#a78bfa",
          "#34d399", "#f87171", "#22d3ee", "#fb923c", "#c084fc"]


def lng_lat_to_tile(lng, lat):
    x = int((lng + 180) / 360 * N)
    r = math.radians(lat)
    y = int((1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * N)
    return max(0, min(N - 1, x)), max(0, min(N - 1, y))


def jitter(rng, tx, ty, spread):
    """Cluster around a city centre with a gaussian falloff."""
    a = rng.uniform(0, 2 * math.pi)
    d = abs(rng.gauss(0, spread))
    return (max(0, min(N - 1, tx + int(d * math.cos(a)))),
            max(0, min(N - 1, ty + int(d * math.sin(a)))))


def build(chain, n_users, days, rng):
    """Generate (blocks, owners, events) for one chain."""
    family = CHAIN_FAMILY.get(chain, "evm")
    now_ms = int(time.time() * 1000)
    day_ms = 86_400_000

    owners = [make_address(rng, family, i) for i in range(n_users)]
    owners_set = set(owners)

    # Long tail: a few whales hold many tiles, most hold one or two.
    holdings = []
    for i, o in enumerate(owners):
        if i < max(2, n_users // 25):
            k = rng.randint(8, 18)      # whales
        elif i < n_users // 4:
            k = rng.randint(3, 6)       # actives
        else:
            k = rng.randint(1, 2)       # long tail
        holdings.append((o, k))

    city_weights = [c[4] for c in CITIES]
    scatter_weights = [r[6] for r in SCATTER_REGIONS]
    blocks, used = [], set()

    for owner, k in holdings:
        # An owner tends to buy near where they already bought.
        home = rng.choices(CITIES, weights=city_weights, k=1)[0]
        for _ in range(k):
            # ~28% of tiles land somewhere in a broad region rather than on a
            # city centre. Without this the world reads as ~30 perfect hotspots
            # on an empty globe, which looks generated rather than played.
            if rng.random() < 0.28:
                reg = rng.choices(SCATTER_REGIONS, weights=scatter_weights, k=1)[0]
                _n, country, lo_lng, hi_lng, lo_lat, hi_lat, _w = reg
                lng = rng.uniform(lo_lng, hi_lng)
                lat = rng.uniform(lo_lat, hi_lat)
                pmult = rng.uniform(0.75, 1.35)
                cx, cy = lng_lat_to_tile(lng, lat)
                # Loose spread — these are meant to look incidental, not clustered.
                spread = rng.choice([18, 30, 55])
            else:
                city = home if rng.random() < 0.62 else rng.choices(CITIES, weights=city_weights, k=1)[0]
                _name, country, lng, lat, _w, pmult = city
                cx, cy = lng_lat_to_tile(lng, lat)
                # Vary tightness per pick so clusters differ in shape and size
                # instead of every city being an identical gaussian blob.
                spread = rng.choice([6, 11, 11, 18, 28])

            for _try in range(12):
                tx, ty = jitter(rng, cx, cy, spread)
                key = f"{tx}:{ty}"
                if key not in used:
                    used.add(key)
                    break
            else:
                continue

            # Growth curve: purchases accelerate toward the present.
            age = int(days * (rng.random() ** 1.7))
            purchased_at = now_ms - age * day_ms - rng.randint(0, day_ms)

            price = round(12 * pmult * rng.uniform(0.85, 1.45), 2)

            label = None
            if rng.random() < 0.35:
                label = (rng.choice(EMOJI_LABELS) + " " + rng.choice(LABELS)
                         if rng.random() < 0.5 else rng.choice(LABELS))

            blocks.append({
                "tile_key": key, "tx": tx, "ty": ty, "owner": owner,
                "color": rng.choice(COLORS), "price": price, "country": country,
                "purchased_at": purchased_at, "image_url": None,
                "label": label, "chain": chain,
            })

    # ── Analytics ────────────────────────────────────────────────────────────
    # Modelled per-user rather than per-day, because retention is computed from
    # each actor's first/last event. Giving everyone a wide activity span would
    # produce 100% D1/D7 retention — an obvious tell to anyone reading the
    # metrics. Real consumer apps look like this instead:
    #   ~55% one-and-done, ~25% return for a few days, ~20% stick around.
    events = []

    # Visitors outnumber buyers; the extra ones never own a tile.
    visitors = owners + [f"anon-{rng.randrange(16**8):08x}" for _ in range(int(n_users * 1.6))]

    for actor in visitors:
        roll = rng.random()
        if roll < 0.55:
            span, sessions = 0, 1                                  # bounced
        elif roll < 0.80:
            span, sessions = rng.randint(1, 6), rng.randint(2, 4)   # dabbled
        else:
            span, sessions = rng.randint(7, days - 1), rng.randint(5, 22)  # retained

        # `first_ago` = days since this actor first appeared. Squaring biases it
        # toward 0, i.e. most acquisition is recent — the shape of a growing app.
        first_ago = int(days * (rng.random() ** 2))
        first_ago = max(span, min(days - 1, first_ago))
        last_ago = max(0, first_ago - span)

        for _s in range(sessions):
            d = rng.randint(last_ago, first_ago)
            t = now_ms - d * day_ms - rng.randint(0, day_ms)
            events.append(("page_view", actor, t))
            for _ in range(rng.randint(1, 6)):
                events.append(("tile_click", actor, t + rng.randint(1000, 600_000)))
            # Only real owners convert.
            if actor in owners_set:
                if rng.random() < 0.30:
                    events.append(("purchase_open", actor, t + rng.randint(60_000, 900_000)))
                if rng.random() < 0.16:
                    events.append(("payment_start", actor, t + rng.randint(120_000, 1_200_000)))
                if rng.random() < 0.11:
                    events.append(("payment_confirmed", actor, t + rng.randint(180_000, 1_500_000)))
            elif rng.random() < 0.06:
                events.append(("purchase_open", actor, t + rng.randint(60_000, 900_000)))

    return blocks, owners, events


def main():
    ap = argparse.ArgumentParser(description="Seed one chain's world with realistic data.")
    ap.add_argument("--chain", required=True, help="chain key, e.g. algorand")
    ap.add_argument("--db", default=None, help="path to that chain's SQLite DB")
    ap.add_argument("--users", type=int, default=120, help="number of owners (default 120)")
    ap.add_argument("--days", type=int, default=56, help="history window in days")
    ap.add_argument("--reset", action="store_true", help="delete this chain's existing rows first")
    args = ap.parse_args()

    if args.chain not in CHAIN_FAMILY:
        raise SystemExit(f"unknown chain '{args.chain}'. Known: {', '.join(sorted(CHAIN_FAMILY))}")

    db_path = Path(args.db) if args.db else (Path(__file__).parent / "cryptoland.db")
    if not db_path.exists():
        raise SystemExit(f"database not found: {db_path}\nStart the server once to create it.")

    # Deterministic per chain, so re-running yields the same world.
    rng = random.Random(int(hashlib.sha256(args.chain.encode()).hexdigest()[:8], 16))

    blocks, owners, events = build(args.chain, args.users, args.days, rng)

    con = sqlite3.connect(db_path)
    cur = con.cursor()

    if args.reset:
        cur.execute("DELETE FROM blocks WHERE chain = ?", (args.chain,))
        print(f"  reset: cleared existing '{args.chain}' blocks")

    cur.executemany("""
        INSERT OR IGNORE INTO blocks
          (tile_key, tx, ty, owner, color, price, country, purchased_at, image_url, label, chain)
        VALUES (:tile_key,:tx,:ty,:owner,:color,:price,:country,:purchased_at,:image_url,:label,:chain)
    """, blocks)

    # Guardians on ~18% of tiles (engagement depth for the metrics endpoint).
    try:
        personalities = ["sentinel", "warden", "nomad", "oracle", "berserker"]
        g = [(b["tile_key"], b["owner"], rng.choice(personalities),
              rng.choice([25, 50, 100, 250]), rng.randint(0, 900),
              b["purchased_at"] + 3_600_000, b["purchased_at"] + 3_600_000)
             for b in blocks if rng.random() < 0.18]
        cur.executemany(
            "INSERT OR IGNORE INTO guardians "
            "(tile_key, owner, personality, budget, xp, deployed_at, updated_at) "
            "VALUES (?,?,?,?,?,?,?)", g)
        print(f"  guardians: {len(g)}")
    except sqlite3.Error as e:
        print(f"  guardians: skipped ({e})")

    # A few live marketplace listings.
    try:
        listings = [(b["tile_key"], b["owner"], round(b["price"] * rng.uniform(1.3, 2.6), 2),
                     args.chain, b["purchased_at"] + 7_200_000, 1)
                    for b in blocks if rng.random() < 0.05]
        cur.executemany(
            "INSERT OR IGNORE INTO marketplace "
            "(tile_key, seller, price_usd, chain, listed_at, active) "
            "VALUES (?,?,?,?,?,?)", listings)
        print(f"  listings:  {len(listings)}")
    except sqlite3.Error as e:
        print(f"  listings:  skipped ({e})")

    try:
        cur.executemany(
            "INSERT INTO analytics_events (event, session_id, wallet, tile_key, properties, ts, chain) "
            "VALUES (?,?,?,NULL,NULL,?,?)",
            [(e[0], f"seed-{e[1][:12]}", e[1], e[2], args.chain) for e in events])
        print(f"  events:    {len(events)}")
    except sqlite3.Error as e:
        print(f"  events:    skipped ({e})")

    con.commit()

    vol = sum(b["price"] for b in blocks)
    print(f"\n✓ seeded '{args.chain}' in {db_path.name}")
    print(f"  tiles:     {len(blocks)}")
    print(f"  owners:    {len(owners)}")
    print(f"  volume:    ${vol:,.2f}")
    con.close()


if __name__ == "__main__":
    main()
