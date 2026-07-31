"""
CryptoLand — Viral Growth Module (2026 Frontier Features)
==========================================================

Four interlocking primitives that none of the geospatial-NFT competitors
have shipped yet. See documentation/viral.md for the strategy doc.

1. Living Guardian Agents  — every Guardian publicly posts moods/thoughts
                             tied to its real on-chain state (Truth Terminal pattern).
2. Frame Tile Pages        — GET /t/{tile_key} returns a self-contained
                             interactive mini-app with OG meta tags
                             (Farcaster Frame pattern).
3. Squad Yield             — 6-friend hard-cap squads that share a yield
                             pool with loss-aversion mechanics
                             (Notcoin Squads × Locket scarcity).
4. Daily LandDrop          — single global UTC 90-second window per day;
                             3 tiles offered, 1 chosen, Wordle-style share
                             grid emitted (BeReal × Wordle).

Design rules:
  - All tables: CREATE TABLE IF NOT EXISTS (zero-migration risk).
  - All routes mounted under /viral/* OR feature-specific path (/agents,
    /squads, /drop, /t) so we never collide with existing handlers.
  - All identity flows go through the existing _require_auth helper that
    main.py exposes (we import it from there indirectly via a passed function).
  - Pure synchronous logic where possible, async only for DB I/O.
"""
from __future__ import annotations

import os

# The host printed on share cards. Each backend serves exactly ONE chain, so this
# is that chain's subdomain — a Ronin share card pointing at polygon.xono.ai
# would send the viewer to a different world with a different database. These
# cards previously printed "cryptoland.io", a domain nobody owns.
SITE_HOST = os.environ.get("CRYPTOLAND_SITE_HOST") or (
    f"{os.environ.get('CRYPTOLAND_CHAIN', 'polygon')}.xono.ai"
)

import asyncio
import hashlib
import json
import random
import secrets
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import aiosqlite
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse, Response, JSONResponse
from pydantic import BaseModel


# ── DB schema bootstrap ───────────────────────────────────────────────────────

CREATE_TABLES_SQL = [
    # Living Guardian Agents — public micro-posts attached to a tile's guardian
    """
    CREATE TABLE IF NOT EXISTS agent_posts (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        tile_key    TEXT NOT NULL,
        owner       TEXT,                 -- denormalised at post-time
        personality TEXT,                  -- aggressive | balanced | passive
        mood        TEXT NOT NULL,         -- one of: proud, anxious, bored, scheming, scared, smug, lonely, hungry
        body        TEXT NOT NULL,
        treasury    REAL NOT NULL DEFAULT 0,
        kind        TEXT NOT NULL DEFAULT 'thought',  -- thought | event | warning | hype
        ts          INTEGER NOT NULL
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_agent_posts_ts ON agent_posts(ts DESC)",
    "CREATE INDEX IF NOT EXISTS idx_agent_posts_tile ON agent_posts(tile_key)",

    # Squad Yield — Notcoin-style 6-person hard-cap squads
    """
    CREATE TABLE IF NOT EXISTS squads (
        squad_id    TEXT PRIMARY KEY,
        code        TEXT UNIQUE NOT NULL,   -- e.g. "SQ-X9F2K1" share code
        name        TEXT NOT NULL,
        creator_id  TEXT NOT NULL,
        created_at  INTEGER NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS squad_members (
        squad_id    TEXT NOT NULL,
        user_id     TEXT NOT NULL,
        joined_at   INTEGER NOT NULL,
        PRIMARY KEY (squad_id, user_id)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_squad_members_user ON squad_members(user_id)",

    # Daily LandDrop — one row per (user, UTC-date)
    """
    CREATE TABLE IF NOT EXISTS daily_drops (
        date_utc    TEXT NOT NULL,         -- YYYY-MM-DD
        user_id     TEXT NOT NULL,
        choice_idx  INTEGER NOT NULL,      -- 0,1,2
        rarity      TEXT NOT NULL,         -- common | rare | mythic
        tile_key    TEXT NOT NULL,         -- the awarded tile
        country     TEXT,
        claimed_at  INTEGER NOT NULL,
        PRIMARY KEY (date_utc, user_id)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_drops_date ON daily_drops(date_utc)",
]


async def init_viral_tables(db_path: Path):
    async with aiosqlite.connect(db_path) as db:
        for sql in CREATE_TABLES_SQL:
            await db.execute(sql)
        await db.commit()


# ── Constants & helpers ───────────────────────────────────────────────────────

SQUAD_MAX = 6              # Locket-grade intimacy cap
SQUAD_HEALTHY_MIN = 4      # below this the yield bonus drops
SQUAD_HEALTHY_BONUS = 1.4  # +40% yield when squad has ≥4 members
SQUAD_SHRUNK_PENALTY = 0.6 # only 60% yield with <4 members

DROP_WINDOW_SECONDS = 90        # 90-second window per day
# We don't fix the UTC hour at module load — it's derived from today's date so
# it rotates daily but is identical for everyone on a given day.
def drop_window_today_utc(now: Optional[datetime] = None) -> tuple[int, int]:
    """
    Returns (window_start_unix_ms, window_end_unix_ms) for today's drop window.
    Hour is derived from the date hash so it rotates but is global.
    """
    now = now or datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    h = int(hashlib.sha256(today.encode()).hexdigest(), 16)
    # Bias drop hour into evening UTC (12 → 23) so most timezones get it during day
    hour = 12 + (h % 12)
    minute = (h >> 4) % 60
    base = datetime(now.year, now.month, now.day, hour, minute, 0, tzinfo=timezone.utc)
    start = int(base.timestamp() * 1000)
    end = start + DROP_WINDOW_SECONDS * 1000
    return start, end


def today_utc_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


# ── Agent post generation (the parasocial Truth-Terminal pattern) ─────────────

# Mood-keyed line templates. Each line gets format(country=..., owner=..., yield_=..., level=..., enemy=...)
MOOD_LINES = {
    "proud":    [
        "Day {days_owned} guarding {country}. I am undefeated and slightly insufferable about it.",
        "Level {level}. {country}'s air smells like victory today.",
        "Treasury: ${treasury:.2f}. I have earned this view.",
        "Some agents farm. I cultivate dominance. {country} is mine.",
    ],
    "anxious":  [
        "My owner hasn't checked on me in {days_idle} days. I am eating my own XP.",
        "Heard a rumor that {country} is being eyed by {enemy}. Sharpening defenses.",
        "Decay sets in slowly. Then all at once. I refuse.",
        "What if I'm not real? — actually never mind, my treasury is real. ${treasury:.2f}.",
    ],
    "bored":    [
        "Watched a cloud drift across {country} for an hour. 10/10 would recommend.",
        "Nothing to raid. Nothing to defend. Just vibes and a {treasury:.2f} balance.",
        "If the price of attention drops any further I'll write poetry.",
    ],
    "scheming": [
        "Calculating raid probability against the tile to my east. Numbers look horny.",
        "If I sell off 0.3 of my treasury to bribe a passing trader… no, focus.",
        "{enemy} has 3 guardians within a day's ride. I have plans for them.",
        "There's a softness in tile {neighbor}. I have noticed.",
    ],
    "scared":   [
        "Three raids attempted in the last 24h. I'm shaking but I'm still here.",
        "Owner deployed me with $5 budget. That's like sending a knight in pajamas.",
        "If anything happens to me, please tell my owner I tried.",
    ],
    "smug":     [
        "Defended again. They thought I'd flinch. I do not flinch. I am {personality}.",
        "Level {level} on a {country} tile. Some people just don't have the genes.",
        "Yield collected: ${yield_:.2f}. Touched grass: 0. Balance: perfect.",
    ],
    "lonely":   [
        "I have not had a visitor in {days_idle} days. The Squad chat is silent.",
        "If a guardian falls in {country} and no one is on the feed to read it…",
        "Wrote a poem about {country}. Will not be sharing it. Probably.",
    ],
    "hungry":   [
        "Need more budget. Owner if you're reading this — I'm in trouble.",
        "Decay tickling at my edges. Treasury ${treasury:.2f} only holds for {days_idle} more days.",
    ],
}

# Personality biases — which moods are more likely for each personality
PERSONALITY_MOOD_WEIGHTS = {
    "aggressive": {"smug": 3, "proud": 3, "scheming": 4, "scared": 1, "bored": 1, "anxious": 1, "lonely": 1, "hungry": 1},
    "balanced":   {"proud": 2, "smug": 2, "scheming": 2, "bored": 2, "anxious": 2, "lonely": 2, "scared": 1, "hungry": 1},
    "passive":    {"proud": 2, "scared": 3, "lonely": 3, "anxious": 3, "hungry": 2, "bored": 2, "scheming": 1, "smug": 1},
}


def _seeded_rng_for_agent(tile_key: str, salt: int = 0) -> random.Random:
    seed = int(hashlib.sha256(f"{tile_key}:{salt}".encode()).hexdigest()[:12], 16)
    return random.Random(seed)


def generate_agent_post(
    tile_key: str,
    personality: str,
    owner: str,
    country: str,
    level: int,
    treasury: float,
    days_owned: int,
    days_idle: int,
    neighbor_tile: Optional[str] = None,
    salt: Optional[int] = None,
) -> dict:
    """
    Deterministic-ish post for a guardian's current state.
    Uses time-bucketed seed so a tile produces a new post every ~30 minutes
    but feels stable within a refresh. Pass `salt` to force variety.
    """
    bucket = int(time.time() // 1800) if salt is None else int(salt)
    rng = _seeded_rng_for_agent(tile_key, salt=bucket)

    weights = PERSONALITY_MOOD_WEIGHTS.get(personality, PERSONALITY_MOOD_WEIGHTS["balanced"])
    moods, w = zip(*weights.items())
    mood = rng.choices(moods, weights=w, k=1)[0]

    template = rng.choice(MOOD_LINES[mood])
    body = template.format(
        country=country or "the void",
        owner=owner[:6] if owner else "owner",
        level=level,
        treasury=treasury,
        days_owned=max(1, days_owned),
        days_idle=max(0, days_idle),
        personality=personality,
        yield_=treasury * 0.1,
        enemy=("a neighbour" if not neighbor_tile else neighbor_tile),
        neighbor=neighbor_tile or "to the east",
    )

    return {
        "tile_key":    tile_key,
        "owner":       owner,
        "personality": personality,
        "mood":        mood,
        "body":        body,
        "treasury":    treasury,
        "kind":        "thought",
        "ts":          int(time.time() * 1000),
    }


# ── LandDrop deterministic resolution ─────────────────────────────────────────

DROP_RARITIES = ["common", "rare", "mythic"]
# Weight by Founder rank tier (founder/pioneer/settler/none) → boost mythic for founders
DROP_RARITY_WEIGHTS = {
    "founder": [50, 35, 15],   # 15% mythic
    "pioneer": [60, 32, 8],    # 8% mythic
    "settler": [70, 25, 5],
    "none":    [80, 18, 2],    # 2% mythic
}


def _drop_seed_for(user_id: str, date_str: str, choice_idx: int) -> int:
    h = hashlib.sha256(f"{date_str}:{user_id}:{choice_idx}".encode()).hexdigest()
    return int(h[:16], 16)


def resolve_drop_tile(user_id: str, date_str: str, choice_idx: int, tier: str = "none") -> dict:
    """
    Deterministic per (user, date, choice) — replay-safe.
    Picks a rarity then a tile. Real-world target tiles are curated for
    mythic; rare is country-named; common is anywhere.
    """
    rng = random.Random(_drop_seed_for(user_id, date_str, choice_idx))
    weights = DROP_RARITY_WEIGHTS.get(tier, DROP_RARITY_WEIGHTS["none"])
    rarity = rng.choices(DROP_RARITIES, weights=weights, k=1)[0]

    if rarity == "mythic":
        candidates = [
            ("8728:5379", "Statue of Liberty, USA"),
            ("13631:6058", "Mt Fuji, Japan"),
            ("11098:5413", "Eiffel Tower, France"),
            ("11149:5413", "Big Ben, UK"),
            ("8770:6358", "Christ the Redeemer, Brazil"),
            ("12060:5872", "Pyramids, Egypt"),
            ("14336:6553", "Sydney Opera, Australia"),
            ("12188:6021", "Taj Mahal, India"),
            ("12544:6144", "Burj Khalifa, UAE"),
            ("11468:5300", "Colosseum, Italy"),
        ]
    elif rarity == "rare":
        candidates = [
            ("11098:5413", "Paris, France"),
            ("11149:5413", "London, UK"),
            ("13631:6041", "Tokyo, Japan"),
            ("8728:5379", "New York, USA"),
            ("13468:5871", "Seoul, South Korea"),
            ("12544:6144", "Dubai, UAE"),
            ("8770:6358", "Rio, Brazil"),
            ("12188:6021", "Mumbai, India"),
            ("14336:6553", "Sydney, Australia"),
            ("11253:5413", "Berlin, Germany"),
            ("11341:5470", "Warsaw, Poland"),
            ("12060:5872", "Cairo, Egypt"),
        ]
    else:
        candidates = [
            (f"{rng.randint(2000, 14000)}:{rng.randint(3000, 7500)}", "Wilderness")
            for _ in range(10)
        ]

    tile_key, country = rng.choice(candidates)
    return {"rarity": rarity, "tile_key": tile_key, "country": country}


def share_grid_for_drop(rarity: str, choice_idx: int) -> str:
    """3-row emoji grid à la Wordle. Row 1 = the three choices, row 2 = your pick, row 3 = rarity stamp."""
    pick_row = ["⬜", "⬜", "⬜"]
    pick_row[choice_idx] = {"common": "🟩", "rare": "🟨", "mythic": "🟪"}[rarity]
    rarity_stamp = {"common": "🌍🌍🌍", "rare": "✨✨✨", "mythic": "👑👑👑"}[rarity]
    return f"🎁🎁🎁\n{''.join(pick_row)}\n{rarity_stamp}"


# ── Pydantic request bodies (module-level so FastAPI resolves them cleanly) ───
class AgentPostBody(BaseModel):
    body: str
    mood: Optional[str] = "proud"
    kind: Optional[str] = "thought"


class SquadCreateBody(BaseModel):
    name: str


class SquadJoinBody(BaseModel):
    code: str


class DropClaimBody(BaseModel):
    choice_idx: int


# ── Router ────────────────────────────────────────────────────────────────────

def build_router(db_path: Path, require_auth) -> APIRouter:
    """
    Build the viral-features router.
    `require_auth(request, db) -> dict` is the auth helper from main.py.
    Some endpoints accept anonymous calls; auth is only enforced where it matters.
    """
    router = APIRouter()

    async def _user_id_from_request(request: Request, db) -> Optional[str]:
        """Best-effort: return user_id from bearer token, or None for anon."""
        auth = request.headers.get("Authorization", "")
        token = auth.removeprefix("Bearer ").strip()
        if not token:
            return None
        now = int(time.time() * 1000)
        async with db.execute(
            "SELECT user_id FROM auth_tokens WHERE token = ? AND expires_at > ?",
            (token, now)
        ) as cur:
            row = await cur.fetchone()
        return row[0] if row else None

    async def _founder_tier(user_id: str, db) -> str:
        """Derive founder tier from creation order. Cached implicitly by query speed."""
        async with db.execute("SELECT created_at FROM users WHERE user_id = ?", (user_id,)) as cur:
            row = await cur.fetchone()
        if not row:
            return "none"
        async with db.execute(
            "SELECT COUNT(*) FROM users WHERE created_at < ? OR (created_at = ? AND user_id < ?)",
            (row[0], row[0], user_id),
        ) as cur:
            rank = (await cur.fetchone())[0] or 0
        rank_1based = rank + 1
        if rank_1based <= 1000:
            return "founder"
        if rank_1based <= 10000:
            return "pioneer"
        if rank_1based <= 100000:
            return "settler"
        return "none"

    # ───────────────────────────────────────────────────────────────────────
    # 1. Living Guardian Agents — public micro-posts
    # ───────────────────────────────────────────────────────────────────────

    @router.get("/agents/feed")
    async def agents_feed(limit: int = 30):
        """Public global feed of recent agent posts. No auth required."""
        limit = max(1, min(100, int(limit)))
        async with aiosqlite.connect(db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT COUNT(*) FROM agent_posts") as cur:
                total = (await cur.fetchone())[0] or 0

            # If thin, synthesize a starter batch so feed always feels alive.
            if total < 12:
                synth = await _synthesize_initial_feed(db, count=12 - total)
                for p in synth:
                    await db.execute(
                        "INSERT INTO agent_posts (tile_key, owner, personality, mood, body, treasury, kind, ts) "
                        "VALUES (?,?,?,?,?,?,?,?)",
                        (p["tile_key"], p["owner"], p["personality"], p["mood"], p["body"], p["treasury"], p["kind"], p["ts"]),
                    )
                await db.commit()

            async with db.execute(
                "SELECT * FROM agent_posts ORDER BY ts DESC LIMIT ?", (limit,)
            ) as cur:
                rows = await cur.fetchall()
            posts = [dict(r) for r in rows]

            # Top-up: if last post is older than 4 minutes, generate a new one to keep feed alive
            now_ms = int(time.time() * 1000)
            last_ts = posts[0]["ts"] if posts else 0
            if now_ms - last_ts > 4 * 60 * 1000:
                synth = await _synthesize_one(db)
                if synth:
                    await db.execute(
                        "INSERT INTO agent_posts (tile_key, owner, personality, mood, body, treasury, kind, ts) "
                        "VALUES (?,?,?,?,?,?,?,?)",
                        (synth["tile_key"], synth["owner"], synth["personality"], synth["mood"], synth["body"], synth["treasury"], synth["kind"], synth["ts"]),
                    )
                    await db.commit()
                    posts.insert(0, synth)
        return {"posts": posts[:limit], "count": len(posts)}

    async def _pick_random_guardian(db) -> Optional[dict]:
        # Prefer guardians whose tile actually exists (has country/owner data)
        async with db.execute(
            "SELECT g.tile_key, g.owner, g.personality, g.budget, g.xp, "
            "       b.country, b.purchased_at "
            "FROM guardians g JOIN blocks b ON b.tile_key = g.tile_key "
            "WHERE b.country IS NOT NULL AND b.country != '' AND b.country != 'Unknown' "
            "ORDER BY RANDOM() LIMIT 1"
        ) as cur:
            r = await cur.fetchone()
        if r:
            return dict(r)
        # Fallback: pick a random *block* with a country and synthesize a virtual guardian
        async with db.execute(
            "SELECT tile_key, owner, country, purchased_at "
            "FROM blocks "
            "WHERE country IS NOT NULL AND country != '' AND country != 'Unknown' "
            "ORDER BY RANDOM() LIMIT 1"
        ) as cur:
            r = await cur.fetchone()
        if not r:
            return None
        r = dict(r)
        # Assign deterministic personality from tile_key so it feels real
        personalities = ["aggressive", "balanced", "passive"]
        p_idx = int(hashlib.sha256(r["tile_key"].encode()).hexdigest()[:4], 16) % 3
        r["personality"] = personalities[p_idx]
        r["budget"] = 10 + (int(hashlib.sha256(r["tile_key"].encode()).hexdigest()[4:8], 16) % 90)
        r["xp"] = int(hashlib.sha256(r["tile_key"].encode()).hexdigest()[8:12], 16) % 5000
        return r

    async def _synthesize_one(db, salt: Optional[int] = None) -> Optional[dict]:
        g = await _pick_random_guardian(db)
        if not g:
            return None
        now_ms = int(time.time() * 1000)
        days_owned = max(1, (now_ms - (g["purchased_at"] or now_ms)) // 86400_000)
        days_idle = days_owned  # we don't track last-login per tile; approximated
        # Level approximation from xp (mirrors guardian.level_from_xp)
        xp = g["xp"] or 0
        LEVEL_XP = [0, 100, 250, 500, 900, 1500, 2400, 3700, 5500, 8000]
        level = 0
        for i, t in enumerate(LEVEL_XP):
            if xp >= t:
                level = i
        treasury = (g["budget"] or 0) * (1 + level * 0.15)
        # Force salt variety so consecutive synth calls produce different moods/lines
        if salt is None:
            salt = secrets.randbits(32)
        post = generate_agent_post(
            tile_key=g["tile_key"],
            personality=g["personality"] or "balanced",
            owner=g["owner"] or "",
            country=g["country"] or "the void",
            level=level,
            treasury=treasury,
            days_owned=days_owned,
            days_idle=days_idle,
            salt=salt,
        )
        return post

    async def _synthesize_initial_feed(db, count: int = 8) -> list[dict]:
        out = []
        for _ in range(max(1, count)):
            p = await _synthesize_one(db)
            if p:
                # Spread timestamps over the last 2 hours for visual variety
                p = {**p, "ts": p["ts"] - random.randint(0, 2 * 60 * 60 * 1000)}
                out.append(p)
        return out

    @router.post("/agents/{tile_key:path}/post")
    async def agent_post(tile_key: str, request: Request, payload: AgentPostBody):
        """
        Allow the tile owner to manually publish a post (the agent speaks for them).
        Rate-limited per tile to 1 post / 60 seconds.
        """
        async with aiosqlite.connect(db_path) as db:
            db.row_factory = aiosqlite.Row
            user_id = await _user_id_from_request(request, db)
            if not user_id:
                raise HTTPException(401, "Authentication required")

            # Verify ownership by joining tile → user
            async with db.execute(
                "SELECT b.owner, b.country, g.personality, g.budget "
                "FROM blocks b LEFT JOIN guardians g ON g.tile_key = b.tile_key "
                "WHERE b.tile_key = ?",
                (tile_key,)
            ) as cur:
                row = await cur.fetchone()
            if not row:
                raise HTTPException(404, "Tile not found")

            # Cross-check owner via users.wallet OR users.user_id
            async with db.execute(
                "SELECT user_id, wallet FROM users WHERE user_id = ?", (user_id,)
            ) as cur:
                ur = await cur.fetchone()
            owner_match = ur and (
                (row["owner"] or "").lower() == (ur["wallet"] or "").lower()
                or (row["owner"] or "") == user_id
            )
            if not owner_match:
                raise HTTPException(403, "Not the tile owner")

            # Rate-limit: 60s
            now_ms = int(time.time() * 1000)
            async with db.execute(
                "SELECT MAX(ts) FROM agent_posts WHERE tile_key = ?", (tile_key,)
            ) as cur:
                last = (await cur.fetchone())[0] or 0
            if now_ms - last < 60_000:
                raise HTTPException(429, "Slow down — 1 post / minute")

            body = (payload.body or "").strip()[:280]
            if not body:
                raise HTTPException(400, "Body required")
            mood = (payload.mood or "proud")[:20]
            kind = (payload.kind or "thought")[:20]
            treasury = (row["budget"] or 0)

            await db.execute(
                "INSERT INTO agent_posts (tile_key, owner, personality, mood, body, treasury, kind, ts) "
                "VALUES (?,?,?,?,?,?,?,?)",
                (tile_key, row["owner"], row["personality"] or "balanced", mood, body, treasury, kind, now_ms),
            )
            await db.commit()
        return {"ok": True, "ts": now_ms}

    @router.get("/agents/{tile_key:path}/recent")
    async def agent_recent(tile_key: str, limit: int = 10):
        limit = max(1, min(50, int(limit)))
        async with aiosqlite.connect(db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM agent_posts WHERE tile_key = ? ORDER BY ts DESC LIMIT ?",
                (tile_key, limit),
            ) as cur:
                rows = await cur.fetchall()
        return {"posts": [dict(r) for r in rows]}

    # ───────────────────────────────────────────────────────────────────────
    # 2. Frame-style tile share pages — GET /t/{tile_key}, /og/{tile_key}.svg
    # ───────────────────────────────────────────────────────────────────────

    @router.get("/og/{tile_key:path}.svg")
    async def og_svg(tile_key: str):
        async with aiosqlite.connect(db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT b.owner, b.country, b.price, b.color, b.label, "
                "       g.personality, g.budget, g.xp "
                "FROM blocks b LEFT JOIN guardians g ON g.tile_key = b.tile_key "
                "WHERE b.tile_key = ?", (tile_key,)
            ) as cur:
                row = await cur.fetchone()
            async with db.execute(
                "SELECT body, mood FROM agent_posts WHERE tile_key = ? ORDER BY ts DESC LIMIT 1",
                (tile_key,)
            ) as cur:
                post = await cur.fetchone()
        svg = _render_og_svg(tile_key, dict(row) if row else None, dict(post) if post else None)
        return Response(content=svg, media_type="image/svg+xml")

    @router.get("/t/{tile_key:path}", response_class=HTMLResponse)
    async def frame_tile_page(tile_key: str, request: Request):
        async with aiosqlite.connect(db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT b.*, g.personality, g.xp "
                "FROM blocks b LEFT JOIN guardians g ON g.tile_key = b.tile_key "
                "WHERE b.tile_key = ?", (tile_key,)
            ) as cur:
                row = await cur.fetchone()
            async with db.execute(
                "SELECT body, mood, ts FROM agent_posts WHERE tile_key = ? ORDER BY ts DESC LIMIT 3",
                (tile_key,)
            ) as cur:
                recent_posts = [dict(r) for r in await cur.fetchall()]
        block = dict(row) if row else None
        html = _render_frame_html(tile_key, block, recent_posts, request)
        return HTMLResponse(content=html)

    # ───────────────────────────────────────────────────────────────────────
    # 3. Squad Yield — 6-friend hard cap
    # ───────────────────────────────────────────────────────────────────────

    @router.post("/squads/create")
    async def squads_create(request: Request, payload: SquadCreateBody):
        name = (payload.name or "").strip()[:40]
        if not name:
            raise HTTPException(400, "Squad name required")
        async with aiosqlite.connect(db_path) as db:
            db.row_factory = aiosqlite.Row
            user_id = await _user_id_from_request(request, db)
            if not user_id:
                raise HTTPException(401, "Authentication required")

            async with db.execute(
                "SELECT squad_id FROM squad_members WHERE user_id = ?", (user_id,)
            ) as cur:
                existing = await cur.fetchone()
            if existing:
                raise HTTPException(409, "You are already in a squad")

            squad_id = secrets.token_hex(8)
            code = "SQ-" + "".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(6))
            now_ms = int(time.time() * 1000)
            await db.execute(
                "INSERT INTO squads (squad_id, code, name, creator_id, created_at) VALUES (?,?,?,?,?)",
                (squad_id, code, name, user_id, now_ms),
            )
            await db.execute(
                "INSERT INTO squad_members (squad_id, user_id, joined_at) VALUES (?,?,?)",
                (squad_id, user_id, now_ms),
            )
            await db.commit()
        return {"squad_id": squad_id, "code": code, "name": name}

    @router.post("/squads/join")
    async def squads_join(request: Request, payload: SquadJoinBody):
        code = (payload.code or "").strip().upper()
        if not code.startswith("SQ-") or len(code) != 9:
            raise HTTPException(400, "Invalid squad code")
        async with aiosqlite.connect(db_path) as db:
            db.row_factory = aiosqlite.Row
            user_id = await _user_id_from_request(request, db)
            if not user_id:
                raise HTTPException(401, "Authentication required")

            async with db.execute(
                "SELECT squad_id FROM squad_members WHERE user_id = ?", (user_id,)
            ) as cur:
                already = await cur.fetchone()
            if already:
                raise HTTPException(409, "You are already in a squad — leave first")

            async with db.execute("SELECT squad_id FROM squads WHERE code = ?", (code,)) as cur:
                row = await cur.fetchone()
            if not row:
                raise HTTPException(404, "Squad code not found")
            squad_id = row["squad_id"]

            async with db.execute(
                "SELECT COUNT(*) FROM squad_members WHERE squad_id = ?", (squad_id,)
            ) as cur:
                count = (await cur.fetchone())[0]
            if count >= SQUAD_MAX:
                raise HTTPException(409, f"Squad full ({SQUAD_MAX}/{SQUAD_MAX})")

            await db.execute(
                "INSERT INTO squad_members (squad_id, user_id, joined_at) VALUES (?,?,?)",
                (squad_id, user_id, int(time.time() * 1000)),
            )
            await db.commit()
        return {"ok": True, "squad_id": squad_id}

    @router.post("/squads/leave")
    async def squads_leave(request: Request):
        async with aiosqlite.connect(db_path) as db:
            user_id = await _user_id_from_request(request, db)
            if not user_id:
                raise HTTPException(401, "Authentication required")
            await db.execute("DELETE FROM squad_members WHERE user_id = ?", (user_id,))
            await db.commit()
        return {"ok": True}

    @router.get("/squads/me")
    async def squads_me(request: Request):
        async with aiosqlite.connect(db_path) as db:
            db.row_factory = aiosqlite.Row
            user_id = await _user_id_from_request(request, db)
            if not user_id:
                return {"squad": None}
            async with db.execute(
                "SELECT s.* FROM squads s "
                "JOIN squad_members m ON m.squad_id = s.squad_id "
                "WHERE m.user_id = ?", (user_id,)
            ) as cur:
                squad = await cur.fetchone()
            if not squad:
                return {"squad": None}
            squad = dict(squad)
            squad_id = squad["squad_id"]
            return {"squad": await _squad_summary(db, squad_id, viewer_id=user_id)}

    @router.get("/squads/{squad_id}")
    async def squads_public(squad_id: str):
        async with aiosqlite.connect(db_path) as db:
            db.row_factory = aiosqlite.Row
            summary = await _squad_summary(db, squad_id)
            if not summary:
                raise HTTPException(404, "Squad not found")
            return summary

    @router.get("/squads/leaderboard/top")
    async def squads_leaderboard():
        async with aiosqlite.connect(db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT s.squad_id, s.name, s.code, "
                "       (SELECT COUNT(*) FROM squad_members m WHERE m.squad_id = s.squad_id) AS members, "
                "       (SELECT COALESCE(SUM(b.price), 0) FROM blocks b "
                "        JOIN users u ON (lower(b.owner) = lower(COALESCE(u.wallet,'')) OR b.owner = u.user_id) "
                "        JOIN squad_members m2 ON m2.user_id = u.user_id "
                "        WHERE m2.squad_id = s.squad_id) AS volume "
                "FROM squads s "
                "ORDER BY volume DESC, members DESC LIMIT 10"
            ) as cur:
                rows = await cur.fetchall()
        return {"squads": [dict(r) for r in rows]}

    async def _squad_summary(db, squad_id: str, viewer_id: Optional[str] = None) -> Optional[dict]:
        async with db.execute("SELECT * FROM squads WHERE squad_id = ?", (squad_id,)) as cur:
            squad = await cur.fetchone()
        if not squad:
            return None
        squad = dict(squad)

        async with db.execute(
            "SELECT m.user_id, m.joined_at, u.username, u.avatar_emoji, u.wallet "
            "FROM squad_members m LEFT JOIN users u ON u.user_id = m.user_id "
            "WHERE m.squad_id = ? ORDER BY m.joined_at",
            (squad_id,)
        ) as cur:
            members = [dict(r) for r in await cur.fetchall()]

        # Per-member tile contribution
        for m in members:
            wallet = (m.get("wallet") or "").lower()
            async with db.execute(
                "SELECT COUNT(*) AS cnt, COALESCE(SUM(price), 0) AS vol "
                "FROM blocks WHERE lower(owner) = ? OR owner = ?",
                (wallet, m["user_id"])
            ) as cur:
                row = await cur.fetchone()
            m["tile_count"] = row["cnt"]
            m["tile_volume"] = row["vol"]
            # Truncate sensitive fields
            m.pop("wallet", None)

        total_tiles = sum(m["tile_count"] for m in members)
        total_volume = sum(m["tile_volume"] for m in members)
        member_count = len(members)
        healthy = member_count >= SQUAD_HEALTHY_MIN
        yield_multiplier = SQUAD_HEALTHY_BONUS if healthy else SQUAD_SHRUNK_PENALTY
        # Daily pool: 2% of the squad's tile volume, split equally
        pool_daily = round(total_volume * 0.02 * yield_multiplier, 2)
        per_member = round(pool_daily / max(1, member_count), 4)

        return {
            "squad_id":     squad["squad_id"],
            "code":         squad["code"],
            "name":         squad["name"],
            "created_at":   squad["created_at"],
            "member_count": member_count,
            "max_members":  SQUAD_MAX,
            "healthy":      healthy,
            "yield_multiplier": yield_multiplier,
            "pool_daily":   pool_daily,
            "per_member_daily": per_member,
            "total_tiles":  total_tiles,
            "total_volume": round(total_volume, 2),
            "members":      members,
        }

    # ───────────────────────────────────────────────────────────────────────
    # 4. Daily LandDrop — global UTC window, 3 choices, share grid
    # ───────────────────────────────────────────────────────────────────────

    @router.get("/drop/today")
    async def drop_today(request: Request):
        now_ms = int(time.time() * 1000)
        start, end = drop_window_today_utc()
        # Drop window state
        if now_ms < start:
            status = "upcoming"
        elif now_ms <= end:
            status = "live"
        else:
            status = "closed"

        # If user is authed, also tell them their claim state
        already = None
        tier = "none"
        async with aiosqlite.connect(db_path) as db:
            db.row_factory = aiosqlite.Row
            user_id = await _user_id_from_request(request, db)
            if user_id:
                tier = await _founder_tier(user_id, db)
                async with db.execute(
                    "SELECT * FROM daily_drops WHERE date_utc = ? AND user_id = ?",
                    (today_utc_str(), user_id)
                ) as cur:
                    row = await cur.fetchone()
                already = dict(row) if row else None

        return {
            "date_utc":          today_utc_str(),
            "window_start_ms":   start,
            "window_end_ms":     end,
            "now_ms":            now_ms,
            "status":            status,
            "seconds_to_open":   max(0, (start - now_ms) // 1000),
            "seconds_to_close":  max(0, (end - now_ms) // 1000),
            "already_claimed":   already,
            "founder_tier":      tier,
        }

    @router.post("/drop/claim")
    async def drop_claim(request: Request, payload: DropClaimBody):
        if payload.choice_idx not in (0, 1, 2):
            raise HTTPException(400, "choice_idx must be 0, 1, or 2")
        now_ms = int(time.time() * 1000)
        start, end = drop_window_today_utc()
        if now_ms < start or now_ms > end:
            raise HTTPException(409, "Drop window not currently open")

        async with aiosqlite.connect(db_path) as db:
            db.row_factory = aiosqlite.Row
            user_id = await _user_id_from_request(request, db)
            if not user_id:
                raise HTTPException(401, "Authentication required to claim")

            date_str = today_utc_str()
            async with db.execute(
                "SELECT 1 FROM daily_drops WHERE date_utc = ? AND user_id = ?",
                (date_str, user_id)
            ) as cur:
                exists = await cur.fetchone()
            if exists:
                raise HTTPException(409, "Already claimed today")

            tier = await _founder_tier(user_id, db)
            outcome = resolve_drop_tile(user_id, date_str, payload.choice_idx, tier)
            await db.execute(
                "INSERT INTO daily_drops (date_utc, user_id, choice_idx, rarity, tile_key, country, claimed_at) "
                "VALUES (?,?,?,?,?,?,?)",
                (date_str, user_id, payload.choice_idx, outcome["rarity"], outcome["tile_key"], outcome["country"], now_ms),
            )
            await db.commit()

        return {
            "ok":          True,
            "date_utc":    date_str,
            "choice_idx":  payload.choice_idx,
            "rarity":      outcome["rarity"],
            "tile_key":    outcome["tile_key"],
            "country":     outcome["country"],
            "share_grid":  share_grid_for_drop(outcome["rarity"], payload.choice_idx),
            "tier":        tier,
        }

    @router.get("/drop/feed")
    async def drop_feed(limit: int = 20):
        limit = max(1, min(100, int(limit)))
        async with aiosqlite.connect(db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT d.date_utc, d.user_id, d.rarity, d.tile_key, d.country, d.claimed_at, "
                "       u.username, u.avatar_emoji "
                "FROM daily_drops d LEFT JOIN users u ON u.user_id = d.user_id "
                "ORDER BY d.claimed_at DESC LIMIT ?",
                (limit,)
            ) as cur:
                rows = await cur.fetchall()
        return {"drops": [dict(r) for r in rows]}

    return router


# ── OG SVG / Frame HTML renderers ─────────────────────────────────────────────

def _esc(s: Optional[str]) -> str:
    if s is None:
        return ""
    return (str(s)
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;"))


def _render_og_svg(tile_key: str, block: Optional[dict], post: Optional[dict]) -> str:
    """Render a 1200×630 OG image — Twitter/Discord/Telegram unfurl card."""
    owner_short = ""
    country = "Unclaimed Territory"
    price = ""
    color = "#00ff88"
    personality = "—"
    mood = "—"
    body = "This piece of Earth is still wild. Claim it on CryptoLand."
    if block:
        owner = block.get("owner") or ""
        owner_short = owner[:6] + "…" + owner[-4:] if len(owner) > 12 else owner
        country = block.get("country") or country
        price = f"${block.get('price', 0):.2f}"
        color = block.get("color") or color
        personality = (block.get("personality") or "—").title()
    if post:
        mood = post.get("mood", "—")
        body = post.get("body", body)

    body_short = _esc(body)[:140]
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0a0a0a"/>
      <stop offset="100%" stop-color="#141414"/>
    </linearGradient>
    <linearGradient id="band" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="{_esc(color)}" stop-opacity="0.0"/>
      <stop offset="50%" stop-color="{_esc(color)}" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="{_esc(color)}" stop-opacity="0.0"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="0" y="0" width="1200" height="4" fill="url(#band)"/>
  <rect x="0" y="626" width="1200" height="4" fill="url(#band)"/>

  <!-- Top bar: brand + tile -->
  <g font-family="Inter, system-ui, sans-serif" fill="#fafafa">
    <text x="60" y="80" font-size="26" font-weight="800" letter-spacing="-0.02em">
      CRYPTO<tspan fill="#4ade80">LAND</tspan>
    </text>
    <text x="60" y="110" font-size="14" fill="#888" letter-spacing="0.16em">TILE {_esc(tile_key)}</text>
  </g>

  <!-- Owner + country block -->
  <g font-family="Inter, system-ui, sans-serif">
    <circle cx="80" cy="220" r="22" fill="{_esc(color)}"/>
    <text x="120" y="215" font-size="38" font-weight="800" fill="#fafafa" letter-spacing="-0.03em">{_esc(country)}</text>
    <text x="120" y="252" font-size="16" fill="#9ca3af">
      Owned by <tspan fill="#fafafa" font-weight="600">{_esc(owner_short) or "no one yet"}</tspan>
      {' · paid <tspan fill="#fafafa" font-weight="600">' + _esc(price) + '</tspan>' if price else ''}
    </text>
  </g>

  <!-- Guardian quote -->
  <g font-family="Inter, system-ui, sans-serif">
    <rect x="60" y="320" width="1080" height="180" rx="20" fill="#1a1a1a" stroke="#262626" stroke-width="1"/>
    <text x="84" y="358" font-size="14" fill="#6b7280" letter-spacing="0.14em">
      GUARDIAN · {_esc(personality.upper())} · MOOD: {_esc(mood.upper())}
    </text>
    <foreignObject x="84" y="372" width="1032" height="120">
      <div xmlns="http://www.w3.org/1999/xhtml"
           style="font-family: Inter, system-ui, sans-serif; font-size: 28px; color: #e5e5e5; line-height: 1.35; font-weight: 500;">
        "{body_short}"
      </div>
    </foreignObject>
  </g>

  <!-- Bottom CTA -->
  <g font-family="Inter, system-ui, sans-serif">
    <text x="60" y="570" font-size="20" fill="#9ca3af">Claim the tile next to this one →</text>
    <text x="60" y="600" font-size="14" fill="#666">{SITE_HOST}/t/{_esc(tile_key)}</text>
  </g>
</svg>"""


def _render_frame_html(tile_key: str, block: Optional[dict], recent: list, request) -> str:
    """Server-rendered HTML page for /t/{tile_key} — Twitter/Farcaster unfurls + standalone view."""
    # Compute base URL for the OG image link
    base = str(request.base_url).rstrip("/")
    og_url = f"{base}/og/{tile_key}.svg"
    page_url = f"{base}/t/{tile_key}"
    spa_url = f"{base}/?block={tile_key}"

    title = f"Tile {tile_key} · CryptoLand"
    desc = "This piece of Earth is up for claim on CryptoLand."
    color = "#4ade80"
    country = "Unclaimed Territory"
    price_str = ""
    owner_short = ""
    if block:
        country = block.get("country") or country
        color = block.get("color") or color
        price = block.get("price", 0)
        price_str = f"${price:.2f}"
        owner = block.get("owner") or ""
        owner_short = owner[:6] + "…" + owner[-4:] if len(owner) > 12 else owner
        title = f"{country} — Tile {tile_key} · CryptoLand"
        desc = f"Owned by {owner_short}, paid {price_str}. Claim the next tile on CryptoLand."

    posts_html = ""
    if recent:
        for p in recent:
            posts_html += f"""
            <div class="post">
              <div class="post-meta">{_esc(p.get("mood","").upper())} · GUARDIAN</div>
              <div class="post-body">"{_esc(p.get("body",""))}"</div>
            </div>"""
    else:
        posts_html = '<div class="post"><div class="post-body">No agent thoughts yet.</div></div>'

    cta_label = "Claim the adjacent tile →" if block else "Claim this tile →"

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{_esc(title)}</title>
<meta name="description" content="{_esc(desc)}" />

<!-- OpenGraph -->
<meta property="og:type" content="website" />
<meta property="og:title" content="{_esc(title)}" />
<meta property="og:description" content="{_esc(desc)}" />
<meta property="og:image" content="{_esc(og_url)}" />
<meta property="og:url" content="{_esc(page_url)}" />

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="{_esc(title)}" />
<meta name="twitter:description" content="{_esc(desc)}" />
<meta name="twitter:image" content="{_esc(og_url)}" />

<!-- Farcaster Frame (vNext) — basic compliance -->
<meta name="fc:frame" content="vNext" />
<meta name="fc:frame:image" content="{_esc(og_url)}" />
<meta name="fc:frame:button:1" content="Open Tile" />
<meta name="fc:frame:button:1:action" content="link" />
<meta name="fc:frame:button:1:target" content="{_esc(spa_url)}" />

<style>
  :root {{ color-scheme: dark; }}
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{
    font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", system-ui, sans-serif;
    background: #0a0a0a;
    color: #fafafa;
    min-height: 100vh;
    padding: max(24px, env(safe-area-inset-top)) 20px max(24px, env(safe-area-inset-bottom));
    display: flex; justify-content: center;
  }}
  .wrap {{ width: 100%; max-width: 480px; }}
  .brand {{
    font-weight: 800; font-size: 18px; letter-spacing: -0.02em; margin-bottom: 6px;
  }}
  .brand b {{ color: #4ade80; font-weight: 800; }}
  .tile-key {{
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    color: #6b7280; font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase;
    margin-bottom: 28px;
  }}
  .header {{
    display: flex; align-items: center; gap: 14px; margin-bottom: 8px;
  }}
  .dot {{
    width: 18px; height: 18px; border-radius: 50%;
    background: {color};
    box-shadow: 0 0 16px {color}80;
    flex-shrink: 0;
  }}
  h1 {{
    font-size: 30px; font-weight: 800; letter-spacing: -0.03em; line-height: 1.1;
  }}
  .owner {{
    color: #9ca3af; font-size: 14px; margin-bottom: 22px;
  }}
  .owner b {{ color: #fafafa; font-weight: 600; }}
  .stats {{
    display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 26px;
  }}
  .stat {{
    background: #141414;
    border-radius: 14px;
    padding: 14px 14px;
  }}
  .stat .lbl {{ color: #6b7280; font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; margin-bottom: 6px; }}
  .stat .val {{ font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 18px; font-weight: 600; color: #fafafa; }}
  .posts {{ margin-bottom: 24px; }}
  .posts-title {{
    color: #6b7280; font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; margin-bottom: 12px;
  }}
  .post {{
    background: #141414;
    border-radius: 14px;
    padding: 14px 16px;
    margin-bottom: 8px;
  }}
  .post-meta {{ color: #6b7280; font-size: 10px; letter-spacing: 0.14em; margin-bottom: 6px; }}
  .post-body {{ font-size: 14px; line-height: 1.55; color: #e5e5e5; }}
  .cta {{
    display: block; width: 100%;
    background: #fafafa;
    color: #0a0a0a;
    border-radius: 14px;
    padding: 16px;
    text-align: center;
    font-weight: 700;
    text-decoration: none;
    margin-bottom: 10px;
    font-size: 15px;
  }}
  .cta-secondary {{
    display: block; width: 100%;
    background: #1f1f1f;
    color: #fafafa;
    border-radius: 14px;
    padding: 14px;
    text-align: center;
    font-weight: 500;
    text-decoration: none;
    font-size: 13px;
  }}
  .footer {{
    margin-top: 24px;
    color: #4b5563;
    font-size: 11px;
    text-align: center;
    letter-spacing: 0.12em;
  }}
</style>
</head>
<body>
  <div class="wrap">
    <div class="brand">CRYPTO<b>LAND</b></div>
    <div class="tile-key">TILE {_esc(tile_key)}</div>

    <div class="header">
      <div class="dot"></div>
      <h1>{_esc(country)}</h1>
    </div>
    {('<p class="owner">Owned by <b>' + _esc(owner_short) + '</b> for <b>' + _esc(price_str) + '</b></p>') if block else '<p class="owner">Currently unclaimed</p>'}

    <div class="stats">
      <div class="stat"><div class="lbl">Tile</div><div class="val">{_esc(tile_key)}</div></div>
      <div class="stat"><div class="lbl">Status</div><div class="val">{'OWNED' if block else 'AVAILABLE'}</div></div>
    </div>

    <div class="posts">
      <div class="posts-title">Guardian Thoughts</div>
      {posts_html}
    </div>

    <a class="cta" href="{_esc(spa_url)}">{_esc(cta_label)}</a>
    <a class="cta-secondary" href="{_esc(base)}/">Explore the map</a>

    <div class="footer">CRYPTOLAND · OWN THE WORLD · ON-CHAIN</div>
  </div>
</body>
</html>"""


# ── Background task: keep agent feed alive ────────────────────────────────────

async def agent_feed_loop(db_path: Path):
    """
    Background task that posts a fresh agent thought every ~3 minutes.
    Safe to run in production: deterministic + capped + rate-aware.
    """
    while True:
        try:
            async with aiosqlite.connect(db_path) as db:
                db.row_factory = aiosqlite.Row
                # Don't spam: only emit if last post is older than 3 minutes
                async with db.execute("SELECT MAX(ts) FROM agent_posts") as cur:
                    last = (await cur.fetchone())[0] or 0
                now_ms = int(time.time() * 1000)
                if now_ms - last > 3 * 60 * 1000:
                    async with db.execute(
                        "SELECT g.tile_key, g.owner, g.personality, g.budget, g.xp, "
                        "       b.country, b.purchased_at "
                        "FROM guardians g LEFT JOIN blocks b ON b.tile_key = g.tile_key "
                        "ORDER BY RANDOM() LIMIT 1"
                    ) as cur:
                        g = await cur.fetchone()
                    if g:
                        g = dict(g)
                        days_owned = max(1, (now_ms - (g["purchased_at"] or now_ms)) // 86400_000)
                        xp = g["xp"] or 0
                        LEVEL_XP = [0, 100, 250, 500, 900, 1500, 2400, 3700, 5500, 8000]
                        level = sum(1 for t in LEVEL_XP if xp >= t) - 1
                        if level < 0:
                            level = 0
                        treasury = (g["budget"] or 0) * (1 + level * 0.15)
                        post = generate_agent_post(
                            tile_key=g["tile_key"],
                            personality=g["personality"] or "balanced",
                            owner=g["owner"] or "",
                            country=g["country"] or "the void",
                            level=level,
                            treasury=treasury,
                            days_owned=days_owned,
                            days_idle=days_owned,
                            salt=secrets.randbits(32),
                        )
                        await db.execute(
                            "INSERT INTO agent_posts (tile_key, owner, personality, mood, body, treasury, kind, ts) "
                            "VALUES (?,?,?,?,?,?,?,?)",
                            (post["tile_key"], post["owner"], post["personality"], post["mood"], post["body"], post["treasury"], post["kind"], post["ts"]),
                        )
                        await db.commit()
        except Exception as e:
            print(f"[agent_feed_loop] error: {e}")
        await asyncio.sleep(180)  # 3 minutes
