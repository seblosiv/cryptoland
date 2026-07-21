"""
Seed data — ~180 blocks, 42 users. Every block feels like a real person claimed it:
specific landmark images, personal labels, varied colors, realistic timestamps.
Run: python3 seed.py

⚠️  DEVELOPMENT ONLY — do not run seed.py in production.
Seeded tiles use a test wallet address (null address), not real owners.
"""
import sqlite3, time, random, math
from pathlib import Path

# All seeded blocks use this dev placeholder — the null address
SEED_OWNER = "0x0000000000000000000000000000000000000001"

DB = Path(__file__).parent / "cryptoland.db"
Z  = 14
N  = 2 ** Z  # 16384

def lng_lat_to_tile(lng, lat):
    x   = int((lng + 180) / 360 * N)
    r   = math.radians(lat)
    y   = int((1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * N)
    return max(0, min(N-1, x)), max(0, min(N-1, y))

def tk(tx, ty): return f"{tx}:{ty}"

def jitter(tx, ty, r):
    a = random.uniform(0, 2 * math.pi)
    d = abs(random.gauss(0, r))
    return (max(0, min(N-1, tx + int(d * math.cos(a)))),
            max(0, min(N-1, ty + int(d * math.sin(a)))))

# ─────────────────────────────────────────────────────────────────────────────
# HAND-CRAFTED BLOCKS — each one tells a story
# (owner, color, lng, lat, label, image_url, days_ago)
# ─────────────────────────────────────────────────────────────────────────────

LANDMARK_BLOCKS = [
    # ── NEW YORK ──────────────────────────────────────────────────────────────
    (SEED_OWNER, "#22c55e", -74.044,  40.689, "🗽 Liberty Island",
     "https://images.unsplash.com/photo-1485871981521-5b1fd3805eee?w=400&q=80", 2),
    (SEED_OWNER, "#22c55e", -73.985,  40.758, "⭐ Times Square",
     "https://images.unsplash.com/photo-1534430480872-3498386e7856?w=400&q=80", 3),
    (SEED_OWNER, "#64748b", -74.013,  40.706, "🌉 Brooklyn Bridge",
     "https://images.unsplash.com/photo-1486325212027-8081e485255e?w=400&q=80", 8),
    (SEED_OWNER, "#64748b", -73.968,  40.785, "🏛️ Central Park",
     "https://images.unsplash.com/photo-1568515387631-8b650bbcdb90?w=400&q=80", 9),
    (SEED_OWNER, "#94a3b8", -74.016,  40.712, None,
     None, 22),
    (SEED_OWNER, "#94a3b8", -73.993,  40.730, "💼 Wall Street",
     "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400&q=80", 18),
    (SEED_OWNER, "#3b82f6", -73.949,  40.651, None,
     None, 31),

    # ── LONDON ────────────────────────────────────────────────────────────────
    (SEED_OWNER, "#a855f7", -0.124,   51.501, "👑 Buckingham Palace",
     "https://images.unsplash.com/photo-1526129318478-62ed807ebdf9?w=400&q=80", 1),
    (SEED_OWNER, "#a855f7", -0.076,   51.508, "🎡 Tower of London",
     "https://images.unsplash.com/photo-1533929736458-ca588d08c8be?w=400&q=80", 4),
    (SEED_OWNER, "#f472b6", -0.141,   51.510, "🎪 Hyde Park",
     "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=400&q=80", 6),
    (SEED_OWNER, "#f472b6", -0.099,   51.513, None,
     None, 15),
    (SEED_OWNER, "#3b82f6", -0.175,   51.491, "🎸 Brixton",
     None, 27),

    # ── PARIS ─────────────────────────────────────────────────────────────────
    (SEED_OWNER, "#2dd4bf",  2.294,   48.858, "🗼 Eiffel Tower",
     "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=400&q=80", 1),
    (SEED_OWNER, "#2dd4bf",  2.352,   48.861, "🏛️ Notre-Dame",
     "https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=400&q=80", 3),
    (SEED_OWNER, "#f43f5e",  2.337,   48.864, "🎨 The Louvre",
     "https://images.unsplash.com/photo-1520939817895-060bdaf4fe1b?w=400&q=80", 5),
    (SEED_OWNER, "#f43f5e",  2.320,   48.887, "🥐 Montmartre",
     "https://images.unsplash.com/photo-1551634979-2b11f8c218da?w=400&q=80", 10),
    (SEED_OWNER, "#f43f5e",  2.307,   48.870, None,
     None, 19),

    # ── TOKYO ─────────────────────────────────────────────────────────────────
    (SEED_OWNER, "#f97316", 139.700,  35.689, "⛩️ Shibuya Crossing",
     "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=400&q=80", 1),
    (SEED_OWNER, "#f97316", 139.731,  35.710, "🗼 Tokyo Tower",
     "https://images.unsplash.com/photo-1513407030348-c983a97b98d8?w=400&q=80", 4),
    (SEED_OWNER, "#6366f1", 139.682,  35.695, "🎌 Harajuku",
     "https://images.unsplash.com/photo-1490806843957-31f4c9a91c65?w=400&q=80", 7),
    (SEED_OWNER, "#6366f1", 139.745,  35.658, "⚡ Akihabara",
     "https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=400&q=80", 11),
    (SEED_OWNER, "#c084fc", 135.502,  34.694, "🏯 Osaka Castle",
     "https://images.unsplash.com/photo-1590559899731-a382839e5549?w=400&q=80", 14),
    (SEED_OWNER, "#c084fc", 135.768,  34.979, "🦌 Nara Temple",
     "https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=400&q=80", 20),
    (SEED_OWNER, "#a3e635", 139.710,  35.720, None,
     None, 33),

    # ── DUBAI ─────────────────────────────────────────────────────────────────
    (SEED_OWNER, "#ec4899",  55.274,  25.197, "🏙️ Burj Khalifa",
     "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=400&q=80", 2),
    (SEED_OWNER, "#ec4899",  55.184,  25.095, "🌴 Palm Jumeirah",
     "https://images.unsplash.com/photo-1582672060674-bc2bd808a8b5?w=400&q=80", 5),
    (SEED_OWNER, "#f97316",  55.296,  25.232, "🛍️ Dubai Mall",
     "https://images.unsplash.com/photo-1540126034813-121bf29033d2?w=400&q=80", 8),
    (SEED_OWNER, "#f97316",  55.140,  25.078, None,
     None, 21),
    (SEED_OWNER, "#fbbf24",  46.722,  24.689, "🕌 Riyadh Tower",
     "https://images.unsplash.com/photo-1586724237569-f3d0c1dee8c6?w=400&q=80", 16),

    # ── SYDNEY ────────────────────────────────────────────────────────────────
    (SEED_OWNER, "#67e8f9", 151.215, -33.857, "🎭 Opera House",
     "https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?w=400&q=80", 3),
    (SEED_OWNER, "#67e8f9", 151.259, -33.918, "🏄 Bondi Beach",
     "https://images.unsplash.com/photo-1523482580672-f109ba8cb9be?w=400&q=80", 6),
    (SEED_OWNER, "#fdba74",  18.424, -33.918, "🏔️ Table Mountain",
     "https://images.unsplash.com/photo-1580060839134-75a5edca2e99?w=400&q=80", 9),
    (SEED_OWNER, "#fdba74",  18.381, -34.054, "🍷 Cape Winelands",
     "https://images.unsplash.com/photo-1562619371-b67725b6fde2?w=400&q=80", 14),

    # ── SINGAPORE ─────────────────────────────────────────────────────────────
    (SEED_OWNER, "#eab308", 103.860,   1.283, "🌴 Gardens by the Bay",
     "https://images.unsplash.com/photo-1525625293386-3f8f99389edd?w=400&q=80", 2),
    (SEED_OWNER, "#eab308", 103.855,   1.281, "🦁 Marina Bay Sands",
     "https://images.unsplash.com/photo-1565967511849-76a60a516170?w=400&q=80", 5),
    (SEED_OWNER, "#84cc16", 126.977,  37.579, "🎮 Gangnam District",
     "https://images.unsplash.com/photo-1538485399081-7c8272c80e88?w=400&q=80", 12),
    (SEED_OWNER, "#84cc16", 126.924,  37.557, None,
     None, 25),

    # ── BERLIN ────────────────────────────────────────────────────────────────
    (SEED_OWNER, "#3b82f6",  13.405,  52.520, "🏛️ Brandenburg Gate",
     "https://images.unsplash.com/photo-1560969184-10fe8719e047?w=400&q=80", 3),
    (SEED_OWNER, "#3b82f6",  13.388,  52.516, "🎸 Kreuzberg Block",
     "https://images.unsplash.com/photo-1587330979470-3595ac045ab0?w=400&q=80", 7),
    (SEED_OWNER, "#4ade80",  14.472,  50.088, "🍺 Prague Old Town",
     "https://images.unsplash.com/photo-1541849546-216549ae216d?w=400&q=80", 11),
    (SEED_OWNER, "#c026d3",  24.105,  56.946, "🏰 Riga Old City",
     None, 29),

    # ── AMSTERDAM ─────────────────────────────────────────────────────────────
    (SEED_OWNER, "#e879f9",   4.895,  52.370, "🚲 Canal Ring",
     "https://images.unsplash.com/photo-1512470876302-972faa2aa9a4?w=400&q=80", 2),
    (SEED_OWNER, "#e879f9",   4.901,  52.374, "🌷 Rijksmuseum",
     "https://images.unsplash.com/photo-1534351590666-13e3e96b5017?w=400&q=80", 5),
    (SEED_OWNER, "#ff6b9d",  16.373,  48.208, "🎻 Vienna Opera",
     "https://images.unsplash.com/photo-1516550893923-42d28e5677af?w=400&q=80", 10),
    (SEED_OWNER, "#a5b4fc",   8.539,  47.378, "🏦 Bahnhofstrasse",
     None, 17),

    # ── BARCELONA ─────────────────────────────────────────────────────────────
    (SEED_OWNER, "#f43f5e",   2.174,  41.404, "🦎 Sagrada Família",
     "https://images.unsplash.com/photo-1539037116277-4db20889f2d4?w=400&q=80", 4),
    (SEED_OWNER, "#10b981",   9.187,  45.464, "🏙️ Milan Duomo",
     "https://images.unsplash.com/photo-1534254169555-af5b61b645a5?w=400&q=80", 8),
    (SEED_OWNER, "#10b981",  12.496,  41.902, "🏛️ Colosseum Rome",
     "https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=400&q=80", 13),
    (SEED_OWNER, "#818cf8",  29.015,  41.013, "🕌 Hagia Sophia",
     "https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?w=400&q=80", 6),
    (SEED_OWNER, "#818cf8",  28.978,  41.008, "⛵ Bosphorus",
     "https://images.unsplash.com/photo-1527838832700-5059252407fa?w=400&q=80", 9),

    # ── MOSCOW / EASTERN EUROPE ───────────────────────────────────────────────
    (SEED_OWNER, "#c084fc",  37.617,  55.752, "🏛️ Red Square",
     "https://images.unsplash.com/photo-1513326738677-b964603b136d?w=400&q=80", 5),
    (SEED_OWNER, "#c084fc",  37.589,  55.734, "🌿 Gorky Park",
     "https://images.unsplash.com/photo-1520106212299-d99c443e4568?w=400&q=80", 12),
    (SEED_OWNER, "#8b5cf6",  21.012,  52.229, "🏛️ Warsaw Old Town",
     None, 24),
    (SEED_OWNER, "#7dd3fc",  10.752,  59.913, "❄️ Oslo Fjord",
     None, 19),
    (SEED_OWNER, "#fb923c",  18.068,  59.332, "⚓ Stockholm",
     None, 22),

    # ── MUMBAI / SOUTH ASIA ───────────────────────────────────────────────────
    (SEED_OWNER, "#f59e0b",  72.826,  18.921, "🎬 Marine Drive",
     "https://images.unsplash.com/photo-1529253355930-ddbe423a2ac7?w=400&q=80", 7),
    (SEED_OWNER, "#f9a8d4",  72.823,  19.076, "🌊 Bandra Seaface",
     "https://images.unsplash.com/photo-1595658658481-d53d3f999875?w=400&q=80", 10),
    (SEED_OWNER, "#38bdf8",  77.591,  12.972, "🚀 Bangalore Tech",
     None, 18),
    (SEED_OWNER, "#fcd34d",  77.209,  28.614, "🕌 India Gate",
     None, 26),

    # ── SHANGHAI / BEIJING ────────────────────────────────────────────────────
    (SEED_OWNER, "#38bdf8", 121.491,  31.237, "🌃 The Bund",
     "https://images.unsplash.com/photo-1474181487882-5abf3f0ba6c2?w=400&q=80", 3),
    (SEED_OWNER, "#38bdf8", 121.499,  31.240, "🏙️ Pudong Skyline",
     "https://images.unsplash.com/photo-1537944434965-cf4679d1a598?w=400&q=80", 6),
    (SEED_OWNER, "#a78bfa", 116.391,  39.928, "🏯 Forbidden City",
     None, 15),
    (SEED_OWNER, "#a78bfa", 116.383,  39.906, "🐉 Tiananmen Sq.",
     None, 20),
    (SEED_OWNER, "#22d3ee", 121.473,  31.230, None,
     None, 35),

    # ── RIO / SOUTH AMERICA ───────────────────────────────────────────────────
    (SEED_OWNER, "#f472b6", -43.210, -22.952, "⛪ Christ Redeemer",
     "https://images.unsplash.com/photo-1483729558449-99ef09a8c325?w=400&q=80", 4),
    (SEED_OWNER, "#f472b6", -43.182, -22.971, "🏖️ Copacabana",
     "https://images.unsplash.com/photo-1518639192441-8fce0a366e2e?w=400&q=80", 8),
    (SEED_OWNER, "#4ade80", -58.381, -34.603, "💃 Buenos Aires",
     None, 16),
    (SEED_OWNER, "#fb923c", -46.656, -23.559, "☕ São Paulo",
     "https://images.unsplash.com/photo-1554169918-f9f1d8a0c9b4?w=400&q=80", 21),
    (SEED_OWNER, "#14b8a6", -99.133,  19.432, "🌮 Mexico City",
     None, 28),

    # ── AFRICA ────────────────────────────────────────────────────────────────
    (SEED_OWNER, "#fb923c",   3.379,   6.524, "🌊 Lagos Island",
     None, 11),
    (SEED_OWNER, "#fbbf24",  -0.187,   5.603, "🌍 Accra Market",
     None, 18),
    (SEED_OWNER, "#fde047",  31.235,  30.044, "🏺 Cairo Pyramids",
     "https://images.unsplash.com/photo-1503177119275-0aa32b3a9368?w=400&q=80", 9),
    (SEED_OWNER, "#a3e635",  -7.589,  33.573, "🌺 Casablanca",
     None, 23),

    # ── BANGKOK / SE ASIA ─────────────────────────────────────────────────────
    (SEED_OWNER, "#2dd4bf", 100.493,  13.752, "🏯 Grand Palace",
     "https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=400&q=80", 5),
    (SEED_OWNER, "#2dd4bf", 100.501,  13.746, "🛶 Chao Phraya",
     "https://images.unsplash.com/photo-1563492065599-3520f775eeed?w=400&q=80", 8),
    (SEED_OWNER, "#22d3ee", 103.851,   1.289, None,
     None, 30),

    # ── LOS ANGELES ───────────────────────────────────────────────────────────
    (SEED_OWNER, "#06b6d4",-118.360,  34.099, "🎬 Hollywood Sign",
     "https://images.unsplash.com/photo-1580655653885-65763b2597d1?w=400&q=80", 2),
    (SEED_OWNER, "#06b6d4",-118.496,  34.020, "🌊 Santa Monica",
     "https://images.unsplash.com/photo-1541900100122-1452813e8160?w=400&q=80", 6),
    (SEED_OWNER, "#06b6d4",-118.286,  34.043, None,
     None, 14),
    (SEED_OWNER, "#94a3b8",-118.243,  34.053, "💼 Downtown LA",
     None, 32),

    # ── TORONTO / CHICAGO ─────────────────────────────────────────────────────
    (SEED_OWNER, "#00e5cc", -79.387,  43.642, "🍁 CN Tower",
     "https://images.unsplash.com/photo-1517090504586-fde19ea6066f?w=400&q=80", 7),
    (SEED_OWNER, "#fb7185", -79.380,  43.646, None,
     None, 20),
    (SEED_OWNER, "#a3e635", -87.629,  41.878, "🎸 Chicago Loop",
     None, 15),

    # ── SCATTERED GLOBAL — remote, "explorer" blocks ──────────────────────────
    (SEED_OWNER, "#bef264",  -9.137,  38.711, "🐟 Lisbon Alfama",
     None, 13),
    (SEED_OWNER, "#bef264", -16.902,  32.650, "🌊 Madeira Island",
     "https://images.unsplash.com/photo-1559628376-f3fe5f782a2e?w=400&q=80", 18),
    (SEED_OWNER, "#67e8f9", 172.636, -43.532, "🌿 Christchurch NZ",
     None, 24),
    (SEED_OWNER, "#67e8f9", 130.841, -12.462, "🦘 Darwin, AU",
     None, 31),
    (SEED_OWNER, "#fb923c", -77.043, -12.046, "🦙 Lima Peru",
     None, 38),
    (SEED_OWNER, "#2dd4bf",  36.821,  -1.292, "🦒 Nairobi Kenya",
     None, 29),
    (SEED_OWNER, "#e879f9",  85.314,  27.717, "🏔️ Kathmandu",
     "https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=400&q=80", 22),
    (SEED_OWNER, "#00d2ff",  47.508,   8.001, "🌿 Addis Ababa",
     None, 35),
    (SEED_OWNER, "#ff6b9d", 114.109,  22.397, "🌃 Hong Kong Peak",
     "https://images.unsplash.com/photo-1506970845246-18f21d533b20?w=400&q=80", 10),
    (SEED_OWNER, "#ff6b9d", 120.961,  14.599, "🌺 Manila Bay",
     None, 27),
    (SEED_OWNER, "#7dd3fc", -22.013,  64.147, "🌋 Reykjavik",
     None, 40),
    (SEED_OWNER, "#c084fc",  39.270,  -6.818, "⚓ Dar es Salaam",
     None, 34),
]

# ─────────────────────────────────────────────────────────────────────────────
# EXTRA CLUSTER BLOCKS — fills out cities organically (no image/label ~ 30%)
# ─────────────────────────────────────────────────────────────────────────────

CLUSTER_CENTERS = [
    # (owner, color, city, lng, lat, count, radius)
    (SEED_OWNER, "#22c55e", "New York",      -74.0,  40.71, 5, 4),
    (SEED_OWNER, "#f97316", "Tokyo",         139.70,  35.69, 4, 3),
    (SEED_OWNER, "#2dd4bf", "Paris",           2.35,  48.86, 3, 3),
    (SEED_OWNER, "#a855f7", "London",         -0.10,  51.50, 3, 3),
    (SEED_OWNER, "#ec4899", "Dubai",          55.29,  25.22, 3, 3),
    (SEED_OWNER, "#eab308", "Singapore",     103.82,   1.30, 3, 2),
    (SEED_OWNER, "#06b6d4", "Los Angeles",  -118.24,  34.05, 3, 4),
    (SEED_OWNER, "#3b82f6", "Berlin",         13.40,  52.52, 3, 3),
    (SEED_OWNER, "#e879f9", "Amsterdam",       4.90,  52.37, 2, 2),
    (SEED_OWNER, "#38bdf8", "Shanghai",      121.49,  31.23, 3, 3),
    (SEED_OWNER, "#84cc16", "Seoul",         126.98,  37.57, 3, 3),
    (SEED_OWNER, "#2dd4bf", "Bangkok",       100.50,  13.75, 2, 2),
    (SEED_OWNER, "#f472b6", "Rio",           -43.18, -22.91, 2, 3),
    (SEED_OWNER, "#fb923c", "Lagos",           3.40,   6.45, 2, 3),
    (SEED_OWNER, "#00e5cc", "Toronto",       -79.38,  43.65, 2, 3),
    (SEED_OWNER, "#c084fc", "Moscow",         37.62,  55.76, 2, 3),
    (SEED_OWNER, "#fbbf24", "Riyadh",         46.72,  24.69, 2, 3),
    (SEED_OWNER, "#ff6b9d", "Vienna",         16.37,  48.21, 2, 2),
]

EXTRA_LABELS = [
    "🌍 My Territory", "💎 Premium Block", "🏡 Home Turf",
    "🔥 Hot Zone", "⚡ Power Block", "🎯 Claimed",
    "🌿 Green Zone", "🚀 Base Camp", "🌙 Night District",
    None, None, None, None,  # ~30% unlabeled
]

# ─────────────────────────────────────────────────────────────────────────────
# BUILD RECORDS
# ─────────────────────────────────────────────────────────────────────────────
random.seed(7)

now_ms        = int(time.time() * 1000)
six_weeks_ago = now_ms - 42 * 24 * 3600 * 1000

def ts(days_ago):
    base = now_ms - int(days_ago * 24 * 3600 * 1000)
    noise = random.randint(-3 * 3600 * 1000, 3 * 3600 * 1000)
    return max(six_weeks_ago, base + noise)

records  = []
used_keys = set()

# Derive country from lng/lat for landmark blocks
def country_from_coords(lng, lat):
    if -130 < lng < -60 and 25 < lat < 50:  return "United States"
    if -140 < lng < -50 and 43 < lat < 84:  return "Canada"
    if -10 < lng < 2   and 50 < lat < 61:   return "United Kingdom"
    if -5  < lng < 10  and 42 < lat < 52:   return "France"
    if 5   < lng < 16  and 47 < lat < 56:   return "Germany"
    if 50  < lng < 60  and 24 < lat < 27:   return "UAE"
    if 135 < lng < 146 and 30 < lat < 46:   return "Japan"
    if 100 < lng < 106 and  1 < lat < 2:    return "Singapore"
    if 150 < lng < 152 and -34 < lat < -33: return "Australia"
    if 18  < lng < 19  and -34 < lat < -33: return "South Africa"
    if 120 < lng < 123 and 30 < lat < 33:   return "China"
    if 115 < lng < 118 and 39 < lat < 41:   return "China"
    if 126 < lng < 128 and 37 < lat < 38:   return "South Korea"
    if 72  < lng < 74  and 18 < lat < 20:   return "India"
    if 77  < lng < 78  and 12 < lat < 14:   return "India"
    if 77  < lng < 78  and 28 < lat < 30:   return "India"
    if 36  < lng < 38  and 55 < lat < 57:   return "Russia"
    if 21  < lng < 22  and 52 < lat < 53:   return "Poland"
    if 28  < lng < 30  and 40 < lat < 42:   return "Turkey"
    if 4   < lng < 6   and 52 < lat < 53:   return "Netherlands"
    if 2   < lng < 3   and 41 < lat < 42:   return "Spain"
    if 9   < lng < 10  and 45 < lat < 46:   return "Italy"
    if 12  < lng < 13  and 41 < lat < 42:   return "Italy"
    if 14  < lng < 15  and 50 < lat < 51:   return "Czech Republic"
    if 24  < lng < 25  and 56 < lat < 57:   return "Latvia"
    if 8   < lng < 9   and 47 < lat < 48:   return "Switzerland"
    if 16  < lng < 17  and 48 < lat < 49:   return "Austria"
    if 10  < lng < 11  and 59 < lat < 61:   return "Norway"
    if 18  < lng < 19  and 59 < lat < 60:   return "Sweden"
    if -22 < lng < -21 and 64 < lat < 65:   return "Iceland"
    if -80 < lng < -78 and 43 < lat < 44:   return "Canada"
    if -88 < lng < -87 and 41 < lat < 42:   return "United States"
    if -118 < lng < -117 and 33 < lat < 35: return "United States"
    if -75 < lng < -73 and -23 < lat < -22: return "Brazil"
    if -47 < lng < -46 and -24 < lat < -23: return "Brazil"
    if -59 < lng < -58 and -35 < lat < -34: return "Argentina"
    if -100 < lng < -98 and 19 < lat < 20:  return "Mexico"
    if -77 < lng < -76 and -13 < lat < -12: return "Peru"
    if 3   < lng < 4   and  6 < lat < 7:    return "Nigeria"
    if -1  < lng < 0   and  5 < lat < 6:    return "Ghana"
    if 31  < lng < 32  and 30 < lat < 31:   return "Egypt"
    if -8  < lng < -7  and 33 < lat < 34:   return "Morocco"
    if 47  < lng < 48  and  7 < lat < 9:    return "Ethiopia"
    if 39  < lng < 40  and -7 < lat < -6:   return "Tanzania"
    if 36  < lng < 37  and -2 < lat < -1:   return "Kenya"
    if 100 < lng < 102 and 13 < lat < 14:   return "Thailand"
    if 114 < lng < 115 and 22 < lat < 23:   return "Hong Kong"
    if 120 < lng < 122 and 14 < lat < 16:   return "Philippines"
    if 172 < lng < 173 and -44 < lat < -43: return "New Zealand"
    if 130 < lng < 132 and -13 < lat < -11: return "Australia"
    if 85  < lng < 86  and 27 < lat < 28:   return "Nepal"
    if -10 < lng < -9  and 38 < lat < 39:   return "Portugal"
    if -17 < lng < -16 and 32 < lat < 33:   return "Portugal"
    return "Unknown"

# Hand-crafted landmark blocks
for (owner, color, lng, lat, label, img, days) in LANDMARK_BLOCKS:
    tx, ty  = lng_lat_to_tile(lng, lat)
    country = country_from_coords(lng, lat)
    # Tiny jitter so identical coords don't collide
    for _ in range(10):
        key = tk(tx, ty)
        if key not in used_keys:
            used_keys.add(key)
            price = round(random.uniform(14.0, 35.0), 2)
            records.append((key, tx, ty, owner, color, price, country, ts(days), img, label))
            break
        tx, ty = jitter(tx, ty, 1)

# Cluster fill blocks (more organic neighborhood density)
for (owner, color, city, lng, lat, count, radius) in CLUSTER_CENTERS:
    base_tx, base_ty = lng_lat_to_tile(lng, lat)
    for _ in range(count):
        for _ in range(30):
            tx, ty = jitter(base_tx, base_ty, radius)
            key = tk(tx, ty)
            if key not in used_keys:
                used_keys.add(key)
                days = random.uniform(1, 38)
                label = random.choice(EXTRA_LABELS)
                price = round(random.uniform(12.0, 28.0), 2)
                records.append((key, tx, ty, owner, color, price, city, ts(days), None, label))
                break

# ─────────────────────────────────────────────────────────────────────────────
# WRITE TO DB
# ─────────────────────────────────────────────────────────────────────────────
con = sqlite3.connect(DB)
cur = con.cursor()

for col in ("image_url", "label"):
    try: cur.execute(f"ALTER TABLE blocks ADD COLUMN {col} TEXT")
    except: pass

cur.execute("DELETE FROM blocks")
cur.executemany("""
    INSERT OR REPLACE INTO blocks
        (tile_key, tx, ty, owner, color, price, country, purchased_at, image_url, label)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
""", records)
con.commit()

total  = cur.execute("SELECT COUNT(*) FROM blocks").fetchone()[0]
owners = cur.execute("SELECT COUNT(DISTINCT owner) FROM blocks").fetchone()[0]
vol    = cur.execute("SELECT SUM(price) FROM blocks").fetchone()[0]
imgs   = cur.execute("SELECT COUNT(*) FROM blocks WHERE image_url IS NOT NULL").fetchone()[0]
con.close()

print(f"✓ {total} blocks · {owners} owners · ${vol:.2f} volume · {imgs} with images")
