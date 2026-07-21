"""
Guardian Agent Engine — CryptoLand
===================================
Internal simulation logic for the Guardian Agent system.
No external AI APIs — all analysis is deterministic + seeded RNG.

Phases:
  Phase 1 — Deploy/configure a guardian on an owned tile
  Phase 2 — Raid mini-game: attacker vs defender stat combat
  Phase 3 — Territory profile analysis (internal, image-based scoring)

All public functions are pure / side-effect-free — they compute results
and return dicts. Persistence is handled by the API routes in main.py.
"""

import hashlib
import math
import random
import time
from typing import Optional

# ── Constants ─────────────────────────────────────────────────────────────────

PERSONALITIES = {
    "aggressive": {
        "label":       "Aggressive",
        "description": "High attack, low defense. Raids others for yield.",
        "atk_bonus":   0.35,
        "def_bonus":   -0.10,
        "yield_bonus": 0.20,
        "icon":        "⚔️",
        "color":       "#f87171",
    },
    "balanced": {
        "label":       "Balanced",
        "description": "Solid all-rounder. Steady yield, fair defense.",
        "atk_bonus":   0.10,
        "def_bonus":   0.10,
        "yield_bonus": 0.10,
        "icon":        "⚖️",
        "color":       "#60a5fa",
    },
    "passive": {
        "label":       "Passive",
        "description": "Maximum defense. Earns yield without raiding.",
        "atk_bonus":   -0.10,
        "def_bonus":   0.35,
        "yield_bonus": 0.05,
        "icon":        "🛡️",
        "color":       "#4ade80",
    },
}

LEVEL_XP = [0, 100, 250, 500, 900, 1500, 2400, 3700, 5500, 8000]  # XP needed per level

RAID_MESSAGES_WIN = [
    "Your guardian repelled the attack decisively.",
    "The raider was outmatched. Tile secured.",
    "Guardian held the line. Yield protected.",
    "Intruder neutralized. Territory intact.",
]

RAID_MESSAGES_LOSE = [
    "The raider broke through your defenses.",
    "Guardian overwhelmed. Yield transferred.",
    "Defense failed. Consider upgrading your guardian.",
    "Territory breached. Strengthen your defenses.",
]

RAID_MESSAGES_ATTACK_WIN = [
    "Raid successful. Yield extracted.",
    "Guardian dominated the defense.",
    "Territory raided. Yield secured.",
    "Aggressive tactics paid off.",
]

RAID_MESSAGES_ATTACK_LOSE = [
    "Your raid was repelled.",
    "Defender was too strong. Try a weaker target.",
    "Attack failed. Guardian needs more XP.",
    "Raid unsuccessful. Regroup and retry.",
]

# ── Utility ───────────────────────────────────────────────────────────────────

def _seed_from_key(tile_key: str, salt: str = "") -> int:
    """Stable integer seed derived from tile_key + salt."""
    h = hashlib.sha256(f"{tile_key}{salt}".encode()).hexdigest()
    return int(h[:8], 16)


def _rng(seed: int) -> random.Random:
    rng = random.Random()
    rng.seed(seed)
    return rng


def xp_for_level(level: int) -> int:
    if level <= 0:
        return 0
    if level >= len(LEVEL_XP):
        return LEVEL_XP[-1] + (level - len(LEVEL_XP) + 1) * 3000
    return LEVEL_XP[level]


def level_from_xp(xp: int) -> int:
    for lvl in range(len(LEVEL_XP) - 1, -1, -1):
        if xp >= LEVEL_XP[lvl]:
            return lvl
    return 0


# ── Guardian stats ─────────────────────────────────────────────────────────────

def compute_stats(guardian: dict) -> dict:
    """
    Compute effective ATK / DEF / YIELD from stored guardian data.
    Returns augmented dict with computed fields.
    """
    personality = PERSONALITIES.get(guardian["personality"], PERSONALITIES["balanced"])
    level       = level_from_xp(guardian.get("xp", 0))
    budget      = guardian.get("budget", 10)

    base_atk   = 10 + level * 8 + math.log1p(budget) * 4
    base_def   = 10 + level * 8 + math.log1p(budget) * 4
    base_yield = round(budget * 0.02 * (1 + level * 0.1), 4)

    atk   = round(base_atk   * (1 + personality["atk_bonus"]),   2)
    defn  = round(base_def   * (1 + personality["def_bonus"]),   2)
    yield_ = round(base_yield * (1 + personality["yield_bonus"]), 4)

    return {
        **guardian,
        "level":       level,
        "xp_next":     xp_for_level(level + 1),
        "atk":         atk,
        "def":         defn,
        "daily_yield": yield_,
        "personality_meta": personality,
    }


# ── Daily report simulation ───────────────────────────────────────────────────

_REPORT_EVENTS = [
    "Scouted 3 neighboring tiles.",
    "Intercepted a low-level probe.",
    "Reinforced perimeter defenses.",
    "Collected passive yield.",
    "Detected suspicious activity nearby.",
    "Territory status: stable.",
    "Patrolled sector boundaries.",
    "No threats detected this cycle.",
    "Minor border skirmish repelled.",
    "Yield optimization applied.",
]

def generate_daily_report(guardian: dict, day_offset: int = 0) -> dict:
    """
    Generate a simulated 24h activity report for a guardian.
    day_offset=0 is today, 1 is yesterday, etc.
    """
    stats  = compute_stats(guardian)
    seed   = _seed_from_key(guardian["tile_key"], f"report_{day_offset}")
    rng    = _rng(seed)

    raids_defended = rng.randint(0, max(0, int(stats["def"] / 5)))
    yield_earned   = round(stats["daily_yield"] * rng.uniform(0.85, 1.15), 4)
    events         = rng.sample(_REPORT_EVENTS, min(3, len(_REPORT_EVENTS)))

    ts = int(time.time() * 1000) - day_offset * 86_400_000

    return {
        "tile_key":       guardian["tile_key"],
        "day_offset":     day_offset,
        "timestamp_ms":   ts,
        "raids_defended": raids_defended,
        "yield_earned":   yield_earned,
        "events":         events,
        "level":          stats["level"],
    }


# ── Raid resolution ───────────────────────────────────────────────────────────

def resolve_raid(
    attacker_guardian: dict,
    defender_guardian: Optional[dict],
    defender_tile_key: str,
    raid_budget: float,
) -> dict:
    """
    Resolve a raid attempt.

    attacker_guardian: full guardian dict (with personality, xp, budget)
    defender_guardian: guardian dict if tile has one, else None
    defender_tile_key: the tile being raided
    raid_budget:       USD amount attacker stakes on this raid

    Returns a result dict with outcome, xp_gain, yield_stolen, message.
    """
    seed = _seed_from_key(
        f"{attacker_guardian['tile_key']}→{defender_tile_key}",
        str(int(time.time() / 300))  # 5-minute buckets — same result within window
    )
    rng = _rng(seed)

    atk_stats = compute_stats(attacker_guardian)

    # Defender stats — unguarded tiles have baseline resistance
    if defender_guardian:
        def_stats = compute_stats(defender_guardian)
        def_power = def_stats["def"]
    else:
        # Unguarded: weak resistance proportional to tile price
        def_power = 5.0

    atk_power = atk_stats["atk"] + math.log1p(raid_budget) * 6
    noise     = rng.uniform(0.75, 1.25)
    atk_roll  = atk_power * noise
    def_roll  = def_power * rng.uniform(0.75, 1.25)

    attacker_wins = atk_roll > def_roll
    margin        = abs(atk_roll - def_roll) / max(atk_roll, def_roll)

    if attacker_wins:
        if defender_guardian:
            yield_stolen = round(
                (def_stats["daily_yield"] * margin * rng.uniform(0.3, 0.8)), 4
            )
        else:
            yield_stolen = round(raid_budget * 0.05 * margin, 4)
        xp_gain = int(20 + margin * 40)
        msg_pool = RAID_MESSAGES_ATTACK_WIN
    else:
        yield_stolen = 0.0
        xp_gain      = int(5 + margin * 10)
        msg_pool     = RAID_MESSAGES_ATTACK_LOSE

    return {
        "attacker_tile":  attacker_guardian["tile_key"],
        "defender_tile":  defender_tile_key,
        "attacker_wins":  attacker_wins,
        "atk_roll":       round(atk_roll, 2),
        "def_roll":       round(def_roll, 2),
        "margin_pct":     round(margin * 100, 1),
        "yield_stolen":   yield_stolen,
        "xp_gain":        xp_gain,
        "message":        rng.choice(msg_pool),
        "timestamp_ms":   int(time.time() * 1000),
    }


def resolve_defense(
    defender_guardian: dict,
    attacker_power: float,
    attacker_tile: str,
) -> dict:
    """
    Record a defense outcome for the tile owner (called alongside resolve_raid).
    Returns defender xp gain and log message.
    """
    def_stats = compute_stats(defender_guardian)
    seed      = _seed_from_key(f"{attacker_tile}→{defender_guardian['tile_key']}", "def")
    rng       = _rng(seed)

    defender_wins = def_stats["def"] >= attacker_power
    xp_gain       = int(15 + (def_stats["def"] / max(1, attacker_power)) * 10)
    msg_pool      = RAID_MESSAGES_WIN if defender_wins else RAID_MESSAGES_LOSE

    return {
        "defender_tile": defender_guardian["tile_key"],
        "defender_wins": defender_wins,
        "xp_gain":       xp_gain,
        "message":       rng.choice(msg_pool),
    }


# ── Territory profile (Phase 3 — internal analysis) ───────────────────────────

_STRATEGIC_TAGS = [
    "High-density zone", "Border territory", "Ocean gateway",
    "Mountain stronghold", "River crossing", "Trade corridor",
    "Resource hotspot", "Cultural nexus", "Tech cluster", "Frontier land",
]

_RISK_LEVELS = ["Low", "Medium", "Elevated", "High", "Critical"]

_ADVERTISING_SECTORS = [
    "Travel & Tourism", "Crypto & Web3", "Real Estate", "Gaming",
    "Finance", "Lifestyle", "Energy", "Infrastructure",
]

def analyze_territory(
    tile_key: str,
    tx: int,
    ty: int,
    country: str,
    label: Optional[str],
    image_url: Optional[str],
    price: float,
    blocks_nearby: int,
) -> dict:
    """
    Internal territory profile analysis — no external AI.
    Uses deterministic scoring based on coordinates, label, price, and density.

    Returns a profile dict suitable for display in Phase 3 UI.
    """
    seed    = _seed_from_key(tile_key, "profile_v1")
    rng     = _rng(seed)

    # Strategic score: mix of price (proxy for desirability), density, label presence
    label_bonus      = 15 if label else 0
    image_bonus      = 10 if image_url else 0
    density_score    = min(40, blocks_nearby * 2)
    price_score      = min(30, math.log1p(price) * 8)
    strategic_score  = int(label_bonus + image_bonus + density_score + price_score + rng.randint(5, 20))
    strategic_score  = min(99, strategic_score)

    # Risk level based on density (more neighbors = more contested)
    risk_idx  = min(4, blocks_nearby // 3)
    risk      = _RISK_LEVELS[risk_idx]

    # Tags: pick 2–3 deterministically
    tag_seed = _seed_from_key(tile_key, "tags")
    tag_rng  = _rng(tag_seed)
    tags     = tag_rng.sample(_STRATEGIC_TAGS, 2 + (1 if strategic_score > 60 else 0))

    # Suggested rent price
    rent_suggested = round(price * rng.uniform(0.08, 0.18), 2)

    # Best advertising sector
    ad_sector = rng.choice(_ADVERTISING_SECTORS)

    # Latitude / longitude tier: equatorial vs polar affects tourism
    # ty=1024 = equator in Z11 Web Mercator
    lat_offset = abs(ty - 1024) / 1024.0
    climate    = "Tropical" if lat_offset < 0.15 else ("Temperate" if lat_offset < 0.45 else "Polar")

    return {
        "tile_key":        tile_key,
        "strategic_score": strategic_score,
        "risk_level":      risk,
        "tags":            tags,
        "climate_zone":    climate,
        "rent_suggested":  rent_suggested,
        "ad_sector":       ad_sector,
        "country":         country or "Unknown",
        "has_label":       bool(label),
        "has_image":       bool(image_url),
        "nearby_owned":    blocks_nearby,
        "analysis_note":   (
            f"Territory in {country or 'unknown region'} scores {strategic_score}/99 strategically. "
            f"Classified as {risk.lower()} risk with {climate.lower()} climate. "
            f"Recommended for {ad_sector.lower()} advertising at ${rent_suggested}/day."
        ),
    }
