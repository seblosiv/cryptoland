"""
Dynamic pricing worker — CryptoLand
====================================
Fetches real-world signals from 4 auth-free APIs and stores multipliers
in the price_events table. Called on startup and every 30 minutes.

Sources:
  1. CoinGecko  — BTC/ETH price + 24h change
  2. Open-Meteo — current weather at a tile's lat/lon
  3. Wikipedia  — daily pageviews for city/country articles
  4. REST Countries — GDP tier, population tier (seeded once, refreshed daily)

Multiplier semantics:
  final_price = base_price * product(active multipliers for that tile/country)
"""

import asyncio
import math
import time
import xml.etree.ElementTree as ET
import aiohttp
import aiosqlite
import logging

log = logging.getLogger("price_events")

from pathlib import Path
DB_PATH = Path(__file__).parent / "cryptoland.db"

# ── Schema ─────────────────────────────────────────────────────────────────────

CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS price_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    scope       TEXT NOT NULL,   -- 'global' | 'country:<name>' | 'tile:<tile_key>'
    source      TEXT NOT NULL,   -- 'coingecko' | 'weather' | 'wikipedia' | 'restcountries'
    event_type  TEXT NOT NULL,   -- human-readable label
    multiplier  REAL NOT NULL,   -- e.g. 1.15 = +15%, 0.9 = -10%
    note        TEXT,            -- display string for the UI
    fetched_at  INTEGER NOT NULL,-- unix ms
    expires_at  INTEGER NOT NULL -- unix ms
)
"""

CREATE_NEWS_TABLE = """
CREATE TABLE IF NOT EXISTS news_items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    category   TEXT NOT NULL,  -- 'crypto' | 'realestate'
    title      TEXT NOT NULL,
    source     TEXT NOT NULL,
    pub_date   TEXT,
    fetched_at INTEGER NOT NULL
)
"""

NEWS_FEEDS = [
    ("crypto",      "https://feeds.feedburner.com/CoinDesk",             "CoinDesk"),
    ("crypto",      "https://cointelegraph.com/rss",                      "CoinTelegraph"),
    ("realestate",  "https://news.google.com/rss/search?q=crypto+real+estate+blockchain+NFT+land&hl=en-US&gl=US&ceid=US:en", "Google News"),
]

async def fetch_news(session) -> list[dict]:
    """Fetch headlines from RSS feeds. Returns list of {category, title, source, pub_date}."""
    results = []
    for category, url, source_name in NEWS_FEEDS:
        try:
            async with session.get(url, headers=HEADERS, timeout=aiohttp.ClientTimeout(total=10)) as r:
                text = await r.text()
            root = ET.fromstring(text)
            items = root.findall(".//item")[:6]
            for item in items:
                title = item.findtext("title", "").strip()
                pub   = item.findtext("pubDate", "")
                if title:
                    results.append({
                        "category": category,
                        "title":    title,
                        "source":   source_name,
                        "pub_date": pub,
                    })
        except Exception as e:
            log.warning(f"[News] {source_name} failed: {e}")
    return results

async def refresh_news():
    """Fetch latest news headlines and store in DB."""
    now = int(time.time() * 1000)
    connector = aiohttp.TCPConnector(ssl=False)
    async with aiohttp.ClientSession(connector=connector) as session:
        items = await fetch_news(session)
    if not items:
        return
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(CREATE_NEWS_TABLE)
        await db.execute("DELETE FROM news_items")
        await db.executemany(
            "INSERT INTO news_items (category, title, source, pub_date, fetched_at) VALUES (?,?,?,?,?)",
            [(i["category"], i["title"], i["source"], i["pub_date"], now) for i in items]
        )
        await db.commit()
    log.info(f"[News] Stored {len(items)} headlines")

async def get_news() -> list[dict]:
    """Return all stored news items."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(CREATE_NEWS_TABLE)
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM news_items ORDER BY fetched_at DESC") as cur:
            rows = await cur.fetchall()
    return [dict(r) for r in rows]


def build_event_alerts(price_events: list, news_items: list) -> list[dict]:
    """
    Convert raw signals into dramatic alert cards for the UI.
    Each alert has: type, severity, headline, subline, delta, scope, source_icon
    """
    alerts = []
    now_ms = int(time.time() * 1000)

    # ── Crypto market alert ───────────────────────────────────────────────────
    cg = next((e for e in price_events if e.get("source") == "coingecko"), None)
    if cg:
        note = cg.get("note", "")
        btcM = __import__("re").search(r"BTC \$([\d,]+) \(([^)]+)\)", note)
        mktM = __import__("re").search(r"Market ([+-][\d.]+)%", note)
        domM = __import__("re").search(r"BTC dom ([\d.]+)%", note)
        btc_price = btcM.group(1) if btcM else "—"
        btc_chg   = btcM.group(2) if btcM else "+0%"
        mkt_chg   = float(mktM.group(1)) if mktM else 0
        btc_dom   = domM.group(1) if domM else "—"
        mult = cg.get("multiplier", 1.0)
        up   = mult >= 1
        severity = "high" if abs(mult - 1) > 0.05 else "low"
        alerts.append({
            "type": "crypto", "severity": severity,
            "icon": "₿",
            "headline": f"BTC ${btc_price}  {btc_chg}",
            "subline": f"Market {mkt_chg:+.1f}% · BTC dom {btc_dom}%",
            "delta": round((mult - 1) * 100, 2),
            "scope": "global", "ts": now_ms,
        })

    # ── Trending coins ────────────────────────────────────────────────────────
    tr = next((e for e in price_events if e.get("source") == "coingecko_trending"), None)
    if tr:
        note = tr.get("note", "").replace("Trending: ", "")
        coins = note.split(" · ")[:3]
        if coins:
            alerts.append({
                "type": "trending", "severity": "low",
                "icon": "🔥",
                "headline": "Trending  " + "  ·  ".join(coins),
                "subline": "CoinGecko 24h movers",
                "delta": 0, "scope": "global", "ts": now_ms,
            })

    # ── Weather shocks — only notable ones ────────────────────────────────────
    WEATHER_DRAMA = {
        "Thunderstorm ⛈️": ("STORM WARNING", "Extreme weather suppressing tile demand"),
        "Heavy rain 🌧️":   ("HEAVY RAIN",    "Adverse conditions detected"),
        "Fog 🌫️":          ("FOG ALERT",     "Low visibility conditions"),
        "Snow ❄️":         ("SNOWSTORM",     "Severe weather event in region"),
        "Clear skies ☀️":  ("CLEAR SKIES",   "Ideal conditions boosting activity"),
    }
    weather_evs = [e for e in price_events if e.get("source") == "weather"]
    weather_evs.sort(key=lambda x: abs(x.get("multiplier", 1) - 1), reverse=True)
    for e in weather_evs[:5]:
        note    = e.get("note", "")
        country = e.get("scope", "").replace("country:", "")
        mult    = e.get("multiplier", 1.0)
        if abs(mult - 1) < 0.01:
            continue
        cond = note.split(" · ")[0]
        tempM = __import__("re").search(r"([-\d]+)°C", note)
        temp  = tempM.group(1) + "°C" if tempM else ""
        drama = WEATHER_DRAMA.get(cond, (cond.upper(), "Weather event detected"))
        severity = "high" if abs(mult - 1) >= 0.15 else "med" if abs(mult - 1) >= 0.05 else "low"
        alerts.append({
            "type": "weather", "severity": severity,
            "icon": "⛈️" if mult < 1 else "☀️",
            "headline": f"{drama[0]}  ·  {country}",
            "subline": f"{temp}  ·  {drama[1]}",
            "delta": round((mult - 1) * 100, 2),
            "scope": e.get("scope", ""), "ts": now_ms,
        })

    # ── Wikipedia attention spikes ─────────────────────────────────────────────
    wiki_evs = [e for e in price_events if e.get("source") == "wikipedia" and e.get("multiplier", 1) > 1.08]
    wiki_evs.sort(key=lambda x: x.get("multiplier", 1), reverse=True)
    for e in wiki_evs[:4]:
        country = e.get("scope", "").replace("country:", "")
        mult    = e.get("multiplier", 1.0)
        note    = e.get("note", "")
        viewM   = __import__("re").search(r"([\d,]+) views", note)
        views   = viewM.group(1) if viewM else "—"
        severity = "high" if mult >= 1.25 else "med"
        alerts.append({
            "type": "attention", "severity": severity,
            "icon": "📡",
            "headline": f"SURGE  ·  {country}",
            "subline": f"{views} Wikipedia searches today",
            "delta": round((mult - 1) * 100, 2),
            "scope": e.get("scope", ""), "ts": now_ms,
        })

    # ── News headlines (top 8, interleaved) ───────────────────────────────────
    for item in news_items[:8]:
        cat  = item.get("category", "crypto")
        title = item.get("title", "")
        src   = item.get("source", "")
        pub   = item.get("pub_date", "")
        alerts.append({
            "type": "news", "severity": "low",
            "icon": "₿" if cat == "crypto" else "🏠",
            "headline": title,
            "subline": src,
            "delta": None,
            "scope": "global",
            "ts": now_ms,
            "pub_date": pub,
        })

    return alerts

# ── WMO weather code → effect ──────────────────────────────────────────────────

WMO_EFFECTS = {
    # (multiplier, label)
    range(0,  2):  (1.05,  "Clear skies ☀️"),
    range(2,  3):  (1.02,  "Partly cloudy"),
    range(3,  4):  (0.98,  "Overcast"),
    range(45, 58): (0.92,  "Fog ⚠️"),
    range(51, 68): (0.95,  "Rain 🌧️"),
    range(71, 78): (0.90,  "Snow ❄️"),
    range(80, 83): (0.93,  "Rain showers"),
    range(85, 87): (0.88,  "Heavy snow ❄️"),
    range(95, 100):(0.82,  "Thunderstorm ⛈️"),
}

def wmo_effect(code):
    for r, effect in WMO_EFFECTS.items():
        if code in r:
            return effect
    return (1.0, "Calm weather")

# ── GDP tier → multiplier ──────────────────────────────────────────────────────

GDP_TIERS = [
    (5e12,  1.30, "Mega-economy 🏦"),
    (1e12,  1.18, "Major economy"),
    (2e11,  1.10, "Large economy"),
    (5e10,  1.03, "Mid economy"),
    (0,     0.95, "Emerging market"),
]

def gdp_multiplier(gdp):
    for threshold, mult, label in GDP_TIERS:
        if gdp >= threshold:
            return mult, label
    return 0.95, "Emerging market"

# ── Wikipedia pageview thresholds ─────────────────────────────────────────────

def wiki_multiplier(views):
    if views > 50_000: return 1.40, f"Trending globally 🔥 ({views:,} views)"
    if views > 20_000: return 1.25, f"High attention 📈 ({views:,} views)"
    if views > 8_000:  return 1.12, f"Active interest ({views:,} views)"
    if views > 2_000:  return 1.05, f"Moderate traffic ({views:,} views)"
    return 1.0, f"Normal traffic ({views:,} views)"

# ── Fetch helpers ──────────────────────────────────────────────────────────────

HEADERS = {
    "User-Agent": "CryptoLand/1.0 (blockchain-land-registry; contact@xono.ai)",
    "Accept": "application/json",
}

async def fetch_coingecko(session):
    url = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true&include_market_cap=true"
    async with session.get(url, headers=HEADERS, timeout=aiohttp.ClientTimeout(total=10)) as r:
        return await r.json()

async def fetch_coingecko_global(session):
    url = "https://api.coingecko.com/api/v3/global"
    async with session.get(url, headers=HEADERS, timeout=aiohttp.ClientTimeout(total=10)) as r:
        d = await r.json()
        return d.get("data", {})

async def fetch_coingecko_trending(session):
    url = "https://api.coingecko.com/api/v3/search/trending"
    async with session.get(url, headers=HEADERS, timeout=aiohttp.ClientTimeout(total=10)) as r:
        d = await r.json()
        return d.get("coins", [])

async def fetch_weather(session, lat, lon):
    url = (
        f"https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat:.4f}&longitude={lon:.4f}"
        f"&current=temperature_2m,weathercode,windspeed_10m,precipitation"
        f"&forecast_days=1"
    )
    async with session.get(url, headers=HEADERS, timeout=aiohttp.ClientTimeout(total=8)) as r:
        return await r.json()

async def fetch_wiki_views(session, article):
    """Fetch yesterday's pageviews for an English Wikipedia article."""
    import datetime
    yesterday = (datetime.date.today() - datetime.timedelta(days=1)).strftime("%Y%m%d")
    url = (
        f"https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article"
        f"/en.wikipedia/all-access/all-agents/{article}/daily/{yesterday}/{yesterday}"
    )
    async with session.get(url, headers=HEADERS, timeout=aiohttp.ClientTimeout(total=8)) as r:
        if r.status == 404:
            return 0
        d = await r.json()
        return d["items"][0]["views"] if d.get("items") else 0

async def fetch_country_gdp(session, iso2):
    url = f"https://api.worldbank.org/v2/country/{iso2}/indicator/NY.GDP.MKTP.CD?format=json&mrv=1"
    async with session.get(url, headers=HEADERS, timeout=aiohttp.ClientTimeout(total=10)) as r:
        d = await r.json()
        try:
            return d[1][0]["value"] or 0
        except Exception:
            return 0

# ── Country → Wikipedia article mapping (common names) ────────────────────────

COUNTRY_WIKI = {
    "United Kingdom": "London",
    "United States":  "New_York_City",
    "Germany":        "Berlin",
    "France":         "Paris",
    "Japan":          "Tokyo",
    "Australia":      "Sydney",
    "Brazil":         "São_Paulo",
    "Canada":         "Toronto",
    "Singapore":      "Singapore",
    "United Arab Emirates": "Dubai",
    "South Korea":    "Seoul",
    "India":          "Mumbai",
    "Netherlands":    "Amsterdam",
    "Switzerland":    "Zurich",
    "Poland":         "Warsaw",
    "Nigeria":        "Lagos",
    "China":          "Beijing",
    "Russia":         "Moscow",
    "Mexico":         "Mexico_City",
    "Argentina":      "Buenos_Aires",
    "South Africa":   "Johannesburg",
    "Turkey":         "Istanbul",
    "Indonesia":      "Jakarta",
    "Egypt":          "Cairo",
    "Saudi Arabia":   "Riyadh",
    "Thailand":       "Bangkok",
}

COUNTRY_ISO2 = {
    "United Kingdom": "GB", "United States": "US", "Germany": "DE",
    "France": "FR", "Japan": "JP", "Australia": "AU", "Brazil": "BR",
    "Canada": "CA", "Singapore": "SG", "United Arab Emirates": "AE",
    "South Korea": "KR", "India": "IN", "Netherlands": "NL",
    "Switzerland": "CH", "Poland": "PL", "Nigeria": "NG", "China": "CN",
    "Russia": "RU", "Mexico": "MX", "Argentina": "AR", "South Africa": "ZA",
    "Turkey": "TR", "Indonesia": "ID", "Egypt": "EG", "Saudi Arabia": "SA",
    "Thailand": "TH",
}

# ── Main refresh function ──────────────────────────────────────────────────────

async def refresh_price_events():
    now = int(time.time() * 1000)
    one_hour  = 3_600_000
    six_hours = 6 * one_hour
    one_day   = 24 * one_hour

    events = []  # list of (scope, source, event_type, multiplier, note, fetched_at, expires_at)

    # ssl=False: macOS Python doesn't have system CAs by default; safe for public read-only APIs
    connector = aiohttp.TCPConnector(ssl=False)
    async with aiohttp.ClientSession(connector=connector) as session:

        # ── 1. CoinGecko — BTC/ETH prices + global market data + trending ────────
        try:
            cg, cg_global, cg_trending = await asyncio.gather(
                fetch_coingecko(session),
                fetch_coingecko_global(session),
                fetch_coingecko_trending(session),
                return_exceptions=True,
            )
            if isinstance(cg, Exception): cg = {}
            if isinstance(cg_global, Exception): cg_global = {}
            if isinstance(cg_trending, Exception): cg_trending = []

            btc_change  = cg.get("bitcoin",  {}).get("usd_24h_change", 0) or 0
            eth_change  = cg.get("ethereum", {}).get("usd_24h_change", 0) or 0
            btc_price   = cg.get("bitcoin",  {}).get("usd", 0) or 0
            eth_price   = cg.get("ethereum", {}).get("usd", 0) or 0
            btc_mcap    = cg.get("bitcoin",  {}).get("usd_market_cap", 0) or 0
            eth_mcap    = cg.get("ethereum", {}).get("usd_market_cap", 0) or 0

            mkt_change  = cg_global.get("market_cap_change_percentage_24h_usd", 0) or 0
            btc_dom     = cg_global.get("market_cap_percentage", {}).get("btc", 0) or 0
            total_mcap  = cg_global.get("total_market_cap", {}).get("usd", 0) or 0

            # Composite crypto sentiment: weighted avg BTC 70% + ETH 30%
            sentiment = btc_change * 0.7 + eth_change * 0.3
            mult = 1.0 + max(-0.20, min(0.30, sentiment / 100 * 1.5))
            direction = "↑" if sentiment > 0 else "↓"
            mcap_str = f"${total_mcap/1e12:.2f}T" if total_mcap >= 1e12 else f"${total_mcap/1e9:.0f}B"
            note = (
                f"BTC ${btc_price:,.0f} ({btc_change:+.1f}%) · "
                f"ETH ${eth_price:,.0f} ({eth_change:+.1f}%) · "
                f"Market {mkt_change:+.1f}% · Cap {mcap_str} · BTC dom {btc_dom:.1f}%"
            )
            events.append(("global", "coingecko", "Crypto market", round(mult, 4), note, now, now + one_hour))
            log.info(f"[CoinGecko] BTC={btc_price} change={btc_change:+.2f}% mkt_change={mkt_change:+.2f}% mult={mult:.4f}")

            # Trending coins as extra global signal (info only, no multiplier)
            trending_names = []
            for coin_wrap in cg_trending[:5]:
                item = coin_wrap.get("item", {})
                sym  = item.get("symbol", "")
                pct  = item.get("data", {}).get("price_change_percentage_24h", {}).get("usd", 0) or 0
                if sym:
                    trending_names.append(f"{sym} {pct:+.1f}%")
            if trending_names:
                trend_note = "Trending: " + " · ".join(trending_names)
                events.append(("global", "coingecko_trending", "Trending coins", 1.0, trend_note, now, now + one_hour))
                log.info(f"[CoinGecko Trending] {trend_note}")

        except Exception as e:
            log.warning(f"[CoinGecko] failed: {e}")

        # ── 2. Open-Meteo — weather for each unique country lat/lon ────────────
        # Use representative coords per country (capital city)
        COUNTRY_COORDS = {
            "United Kingdom":       (51.51, -0.13),
            "United States":        (40.71, -74.01),
            "Germany":              (52.52, 13.40),
            "France":               (48.85, 2.35),
            "Japan":                (35.68, 139.69),
            "Australia":            (-33.87, 151.21),
            "Brazil":               (-23.55, -46.63),
            "Canada":               (43.65, -79.38),
            "Singapore":            (1.35, 103.82),
            "United Arab Emirates": (25.20, 55.27),
            "South Korea":          (37.57, 126.98),
            "India":                (19.08, 72.88),
            "Netherlands":          (52.37, 4.90),
            "Switzerland":          (47.38, 8.54),
            "Poland":               (52.23, 21.01),
            "Nigeria":              (6.45, 3.39),
            "China":                (39.91, 116.39),
            "Russia":               (55.75, 37.62),
            "Mexico":               (19.43, -99.13),
            "Turkey":               (41.01, 28.95),
        }
        weather_tasks = {
            country: fetch_weather(session, lat, lon)
            for country, (lat, lon) in COUNTRY_COORDS.items()
        }
        weather_results = await asyncio.gather(*weather_tasks.values(), return_exceptions=True)
        for country, result in zip(weather_tasks.keys(), weather_results):
            if isinstance(result, Exception):
                continue
            try:
                code = result["current"]["weathercode"]
                temp = result["current"]["temperature_2m"]
                mult, label = wmo_effect(code)
                note = f"{label} · {temp:.0f}°C"
                events.append((f"country:{country}", "weather", "Weather", round(mult, 4), note, now, now + one_hour))
            except Exception as e:
                log.debug(f"[Weather] {country} parse error: {e}")

        # ── 3. Wikipedia pageviews — city attention signal ────────────────────
        wiki_tasks = {
            country: fetch_wiki_views(session, article)
            for country, article in COUNTRY_WIKI.items()
        }
        wiki_results = await asyncio.gather(*wiki_tasks.values(), return_exceptions=True)
        for country, result in zip(wiki_tasks.keys(), wiki_results):
            if isinstance(result, Exception) or result == 0:
                continue
            mult, note = wiki_multiplier(result)
            events.append((f"country:{country}", "wikipedia", "Wiki attention", round(mult, 4), note, now, now + one_day))

        # ── 4. World Bank GDP — structural country multiplier (1/day) ─────────
        # Refresh GDP (structural; changes rarely but cheap enough to do every 10min)
        gdp_tasks = {
            country: fetch_country_gdp(session, iso2)
            for country, iso2 in COUNTRY_ISO2.items()
        }
        gdp_results = await asyncio.gather(*gdp_tasks.values(), return_exceptions=True)
        for country, result in zip(gdp_tasks.keys(), gdp_results):
            if isinstance(result, Exception) or not result:
                continue
            mult, label = gdp_multiplier(result)
            note = f"{label} · GDP ${result/1e12:.1f}T" if result >= 1e12 else f"{label} · GDP ${result/1e9:.0f}B"
            events.append((f"country:{country}", "worldbank", "GDP tier", round(mult, 4), note, now, now + one_day))

    # ── Persist to DB ─────────────────────────────────────────────────────────
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(CREATE_TABLE)
        # Delete expired events and stale entries for scopes we're refreshing
        await db.execute("DELETE FROM price_events WHERE expires_at < ?", (now,))
        # Delete old entries from same sources (avoid duplicates on re-run)
        for source in ("coingecko", "coingecko_trending", "weather", "wikipedia", "worldbank"):
            await db.execute("DELETE FROM price_events WHERE source = ?", (source,))
        await db.executemany(
            "INSERT INTO price_events (scope, source, event_type, multiplier, note, fetched_at, expires_at) VALUES (?,?,?,?,?,?,?)",
            events
        )
        await db.commit()

    log.info(f"[PriceEvents] Stored {len(events)} events")
    return events


async def get_events_for_tile(tile_key: str, country: str) -> list[dict]:
    """Return all active events relevant to a tile (global + country-scoped)."""
    now = int(time.time() * 1000)
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        await db.execute(CREATE_TABLE)
        async with db.execute("""
            SELECT * FROM price_events
            WHERE expires_at > ?
              AND (scope = 'global' OR scope = ? OR scope = ?)
            ORDER BY source
        """, (now, f"country:{country}", f"tile:{tile_key}")) as cur:
            rows = await cur.fetchall()
    return [dict(r) for r in rows]


async def get_all_active_events() -> list[dict]:
    """Return all active events (for the sidebar)."""
    now = int(time.time() * 1000)
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        await db.execute(CREATE_TABLE)
        async with db.execute("""
            SELECT * FROM price_events
            WHERE expires_at > ?
            ORDER BY fetched_at DESC
        """, (now,)) as cur:
            rows = await cur.fetchall()
    return [dict(r) for r in rows]


def compute_final_multiplier(events: list[dict]) -> float:
    """Multiply all active event multipliers together, capped at [0.5, 2.5]."""
    result = 1.0
    for e in events:
        result *= e["multiplier"]
    return round(max(0.5, min(2.5, result)), 4)


# ── Background loop ────────────────────────────────────────────────────────────

async def price_events_loop():
    """Runs forever — refresh price events every 10 min, news every 15 min."""
    news_tick = 0
    while True:
        try:
            await refresh_price_events()
        except Exception as e:
            log.error(f"[PriceEvents] refresh error: {e}")
        try:
            if news_tick % 3 == 0:  # every 3rd tick = ~30 min for news (RSS rate-limit friendly)
                await refresh_news()
        except Exception as e:
            log.error(f"[News] refresh error: {e}")
        news_tick += 1
        await asyncio.sleep(600)  # 10 min
