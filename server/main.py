"""
CryptoLand backend — FastAPI + SQLite (aiosqlite)
Blocks are persisted in ./cryptoland.db — survives restarts forever.
NOWPayments API calls are proxied here to keep the API key server-side.
"""
import asyncio, json, time, hashlib, hmac, os, secrets as _secrets
from contextlib import asynccontextmanager
from pathlib import Path

import aiosqlite
import httpx
from fastapi import FastAPI, HTTPException, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional
from dotenv import load_dotenv
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from guardian import (
    compute_stats, generate_daily_report, resolve_raid,
    resolve_defense, analyze_territory, PERSONALITIES,
    level_from_xp, xp_for_level,
)
from price_events import (
    price_events_loop, get_all_active_events, get_news, refresh_news, build_event_alerts,
    get_events_for_tile, compute_final_multiplier,
    CREATE_TABLE as PRICE_EVENTS_TABLE,
)
from viral import (
    init_viral_tables, build_router as build_viral_router, agent_feed_loop,
)

load_dotenv()

# Each per-chain deployment runs its own backend with its own database, so the
# path is env-configurable (CRYPTOLAND_DB=/srv/cryptoland/algorand.db). Defaults
# to the local dev database.
DB_PATH = Path(os.environ.get("CRYPTOLAND_DB") or (Path(__file__).parent / "cryptoland.db"))
NP_API_KEY = os.environ.get("NOWPAYMENTS_API_KEY", "")
NP_IPN_SECRET = os.environ.get("NOWPAYMENTS_IPN_SECRET", "")
NP_BASE = "https://api.nowpayments.io/v1"
SERVER_URL = os.environ.get("SERVER_URL", "http://127.0.0.1:8000")
# Dev-only escape hatch: when set truthy, wallet auth endpoints skip signature
# verification (SIWE). Default OFF — production requires a valid signature.
ALLOW_UNSIGNED_WALLET_AUTH = os.environ.get("ALLOW_UNSIGNED_WALLET_AUTH", "").lower() in ("1", "true", "yes", "on")

# eth-account is optional at import time. If missing AND unsigned auth is off,
# the wallet-signature endpoints return 501 rather than silently allowing.
try:
    from eth_account.messages import encode_defunct as _encode_defunct
    from eth_account import Account as _EthAccount
    _ETH_ACCOUNT_AVAILABLE = True
except Exception:
    _encode_defunct = None
    _EthAccount = None
    _ETH_ACCOUNT_AVAILABLE = False


def _wallet_nonce_message(wallet: str, nonce: str) -> str:
    """Canonical SIWE-style message the client must sign."""
    return f"CryptoLand wants you to sign in with wallet {wallet}. Nonce: {nonce}"


def _recover_wallet(message: str, signature: str) -> Optional[str]:
    """Recover the signer address from an EVM personal_sign signature. Lowercased, or None on failure."""
    if not _ETH_ACCOUNT_AVAILABLE:
        return None
    try:
        recovered = _EthAccount.recover_message(_encode_defunct(text=message), signature=signature)
        return recovered.strip().lower()
    except Exception:
        return None

# ── DB bootstrap ──────────────────────────────────────────────────────────────
async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS blocks (
                tile_key   TEXT PRIMARY KEY,   -- "tx:ty" — globally unique across all chains
                tx         INTEGER NOT NULL,
                ty         INTEGER NOT NULL,
                owner      TEXT NOT NULL,
                color      TEXT NOT NULL DEFAULT '#00ff88',
                price      REAL NOT NULL,
                country    TEXT NOT NULL DEFAULT 'Unknown',
                chain      TEXT NOT NULL DEFAULT 'polygon',
                purchased_at INTEGER NOT NULL   -- unix ms
            )
        """)
        await db.execute("""
            CREATE INDEX IF NOT EXISTS idx_blocks_owner ON blocks(owner)
        """)
        # Add image_url / label / chain columns if they don't exist yet (idempotent migration)
        for col, typedef in [("image_url", "TEXT"), ("label", "TEXT"), ("chain", "TEXT NOT NULL DEFAULT 'polygon'")]:
            try:
                await db.execute(f"ALTER TABLE blocks ADD COLUMN {col} {typedef}")
            except Exception:
                pass  # column already exists
        # chain index must come after the ALTER TABLE that adds the column
        await db.execute("""
            CREATE INDEX IF NOT EXISTS idx_blocks_chain ON blocks(chain)
        """)

        # ── User accounts ──────────────────────────────────────────────────
        # Universal identity: email/password OR wallet — either works alone.
        # Detect the old schema (wallet PRIMARY KEY) vs new (user_id PRIMARY KEY).
        users_info_cur = await db.execute("PRAGMA table_info(users)")
        users_cols = {row[1] for row in await users_info_cur.fetchall()}

        if not users_cols:
            # Fresh DB — create the new schema directly
            await db.execute("""
                CREATE TABLE users (
                    user_id      TEXT PRIMARY KEY,
                    email        TEXT UNIQUE,
                    password_hash TEXT,
                    salt         TEXT,
                    wallet       TEXT UNIQUE,
                    username     TEXT,
                    avatar_emoji TEXT DEFAULT '🌍',
                    bio          TEXT,
                    is_guest     INTEGER DEFAULT 0,
                    created_at   INTEGER NOT NULL,
                    last_seen    INTEGER NOT NULL
                )
            """)
        elif "user_id" not in users_cols:
            # Old schema (wallet PK) — migrate by rename + recreate + copy
            await db.execute("ALTER TABLE users RENAME TO users_legacy")
            await db.execute("""
                CREATE TABLE users (
                    user_id      TEXT PRIMARY KEY,
                    email        TEXT UNIQUE,
                    password_hash TEXT,
                    salt         TEXT,
                    wallet       TEXT UNIQUE,
                    username     TEXT,
                    avatar_emoji TEXT DEFAULT '🌍',
                    bio          TEXT,
                    is_guest     INTEGER DEFAULT 0,
                    created_at   INTEGER NOT NULL,
                    last_seen    INTEGER NOT NULL
                )
            """)
            # Copy legacy rows, generating user_id for each
            await db.execute("""
                INSERT INTO users (user_id, wallet, username, avatar_emoji, bio, created_at, last_seen)
                SELECT lower(hex(randomblob(16))), wallet, username, avatar_emoji, bio, created_at, last_seen
                FROM users_legacy
            """)
            await db.commit()
        else:
            # New schema already in place — just add any missing columns (forward compat)
            for col, definition in [
                ("email",         "TEXT"),
                ("password_hash", "TEXT"),
                ("salt",          "TEXT"),
                ("is_guest",      "INTEGER DEFAULT 0"),
                # Telegram Mini App identity ("tg:<telegram_user_id>")
                ("telegram_id",   "TEXT"),
            ]:
                if col not in users_cols:
                    try:
                        await db.execute(f"ALTER TABLE users ADD COLUMN {col} {definition}")
                    except Exception:
                        pass
        # Unique index so one Telegram account maps to exactly one game account.
        await db.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_telegram ON users(telegram_id) "
            "WHERE telegram_id IS NOT NULL"
        )

        # Auth tokens — each login/session gets a bearer token (30-day TTL)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS auth_tokens (
                token        TEXT PRIMARY KEY,
                user_id      TEXT NOT NULL,
                created_at   INTEGER NOT NULL,
                expires_at   INTEGER NOT NULL,
                user_agent   TEXT
            )
        """)
        await db.execute("CREATE INDEX IF NOT EXISTS idx_tokens_user ON auth_tokens(user_id)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_users_created ON users(created_at)")
        await db.commit()

        # ── Sessions ───────────────────────────────────────────────────────
        # Lightweight session fingerprint — created on first page load, used
        # to bridge anonymous referral landing → eventual wallet connection.
        await db.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                session_id   TEXT PRIMARY KEY,        -- UUID v4, set by client
                wallet       TEXT,                    -- null until wallet connected
                ip_hash      TEXT,                    -- SHA-256(ip) for fraud detection
                user_agent   TEXT,
                ref_code     TEXT,                    -- referral code present at landing
                landed_at    INTEGER NOT NULL,
                wallet_bound_at INTEGER               -- when wallet was linked
            )
        """)
        await db.execute("CREATE INDEX IF NOT EXISTS idx_sessions_wallet ON sessions(wallet)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_sessions_ref ON sessions(ref_code)")
        # Add user_id to sessions for email-based users (migration safe)
        sess_cols_cur = await db.execute("PRAGMA table_info(sessions)")
        sess_cols = {r[1] for r in await sess_cols_cur.fetchall()}
        if "user_id" not in sess_cols:
            await db.execute("ALTER TABLE sessions ADD COLUMN user_id TEXT")
        await db.commit()

        # ── Referral codes ─────────────────────────────────────────────────
        # Each wallet gets exactly one deterministic code on first request.
        await db.execute("""
            CREATE TABLE IF NOT EXISTS referral_codes (
                code         TEXT PRIMARY KEY,        -- e.g. "LAND-A3F9B2"
                wallet       TEXT UNIQUE,             -- linked wallet (nullable for email-only users)
                user_id      TEXT UNIQUE,             -- linked user_id (preferred key)
                created_at   INTEGER NOT NULL
            )
        """)
        # Migration: ensure wallet is nullable and user_id column exists
        rc_cols_cur = await db.execute("PRAGMA table_info(referral_codes)")
        rc_cols_info = await rc_cols_cur.fetchall()
        rc_cols = {r[1]: r for r in rc_cols_info}
        wallet_notnull = rc_cols.get("wallet", (None,None,None,0))[3] == 1  # notnull flag
        needs_migrate = "user_id" not in rc_cols or wallet_notnull
        if needs_migrate:
            await db.execute("ALTER TABLE referral_codes RENAME TO referral_codes_legacy")
            await db.execute("""
                CREATE TABLE referral_codes (
                    code       TEXT PRIMARY KEY,
                    wallet     TEXT UNIQUE,
                    user_id    TEXT UNIQUE,
                    created_at INTEGER NOT NULL
                )
            """)
            await db.execute("""
                INSERT INTO referral_codes (code, wallet, user_id, created_at)
                SELECT code, wallet, user_id, created_at FROM referral_codes_legacy
            """)
            await db.commit()
        await db.execute("CREATE INDEX IF NOT EXISTS idx_refcodes_wallet ON referral_codes(wallet)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_refcodes_user ON referral_codes(user_id)")
        # Back-fill user_id from users table for wallet-keyed rows
        await db.execute("""
            UPDATE referral_codes SET user_id = (
                SELECT user_id FROM users WHERE users.wallet = referral_codes.wallet
            ) WHERE user_id IS NULL AND wallet IS NOT NULL
        """)

        # ── Referral events ────────────────────────────────────────────────
        # One row per purchase that had a valid referral code attached.
        # Migration: referrer_wallet must be nullable (email-only referrers have no wallet).
        # Also add referrer_user_id column for non-wallet users.
        ref_cols_cur = await db.execute("PRAGMA table_info(referrals)")
        ref_cols_info = await ref_cols_cur.fetchall()
        ref_cols = {r[1]: r for r in ref_cols_info}
        ref_wallet_notnull = ref_cols.get("referrer_wallet", (None,None,None,0))[3] == 1
        ref_needs_migrate  = "referrer_user_id" not in ref_cols or ref_wallet_notnull

        if not ref_cols:
            await db.execute("""
                CREATE TABLE referrals (
                    id                INTEGER PRIMARY KEY AUTOINCREMENT,
                    referrer_wallet   TEXT,              -- nullable: email-only referrers have no wallet
                    referrer_user_id  TEXT,              -- preferred key for email/universal users
                    referee_wallet    TEXT,              -- who made the purchase (null = anonymous)
                    referee_session   TEXT NOT NULL,
                    tile_key          TEXT NOT NULL,
                    purchase_usd      REAL NOT NULL,
                    commission_usd    REAL NOT NULL,
                    ref_code          TEXT NOT NULL,
                    status            TEXT NOT NULL DEFAULT 'pending',
                    created_at        INTEGER NOT NULL,
                    credited_at       INTEGER
                )
            """)
        elif ref_needs_migrate:
            await db.execute("ALTER TABLE referrals RENAME TO referrals_legacy")
            await db.execute("""
                CREATE TABLE referrals (
                    id                INTEGER PRIMARY KEY AUTOINCREMENT,
                    referrer_wallet   TEXT,
                    referrer_user_id  TEXT,
                    referee_wallet    TEXT,
                    referee_session   TEXT NOT NULL,
                    tile_key          TEXT NOT NULL,
                    purchase_usd      REAL NOT NULL,
                    commission_usd    REAL NOT NULL,
                    ref_code          TEXT NOT NULL,
                    status            TEXT NOT NULL DEFAULT 'pending',
                    created_at        INTEGER NOT NULL,
                    credited_at       INTEGER
                )
            """)
            # Copy existing rows; back-fill referrer_user_id from users table
            await db.execute("""
                INSERT INTO referrals (id, referrer_wallet, referrer_user_id, referee_wallet,
                    referee_session, tile_key, purchase_usd, commission_usd, ref_code,
                    status, created_at, credited_at)
                SELECT l.id, l.referrer_wallet,
                    (SELECT u.user_id FROM users u WHERE u.wallet = l.referrer_wallet LIMIT 1),
                    l.referee_wallet, l.referee_session, l.tile_key, l.purchase_usd,
                    l.commission_usd, l.ref_code, l.status, l.created_at, l.credited_at
                FROM referrals_legacy l
            """)
            await db.commit()
        await db.execute("CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_wallet)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_referrals_referrer_uid ON referrals(referrer_user_id)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_referrals_referee ON referrals(referee_wallet)")
        await db.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_referrals_tile ON referrals(tile_key)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_referrals_ref_code ON referrals(ref_code)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_referrals_created ON referrals(created_at)")

        # ── Referral balance ledger ────────────────────────────────────────
        # Running totals — keyed by user_id (preferred) or wallet (legacy).
        # Migration: if old table exists with wallet as PK, rebuild with user_id as PK.
        rb_cols_cur = await db.execute("PRAGMA table_info(referral_balance)")
        rb_cols_info = await rb_cols_cur.fetchall()
        rb_cols = {r[1]: r for r in rb_cols_info}
        rb_wallet_pk = rb_cols.get("wallet", (None,None,None,None,None,0))[5] == 1  # pk flag
        if rb_cols and rb_wallet_pk:
            # Old schema: wallet is PK. Migrate to user_id-keyed.
            await db.execute("ALTER TABLE referral_balance RENAME TO referral_balance_legacy")
            await db.execute("""
                CREATE TABLE referral_balance (
                    user_id       TEXT PRIMARY KEY,     -- permanent key
                    wallet        TEXT UNIQUE,           -- optional wallet link
                    balance_usd   REAL NOT NULL DEFAULT 0,
                    total_earned  REAL NOT NULL DEFAULT 0,
                    total_paid    REAL NOT NULL DEFAULT 0,
                    updated_at    INTEGER NOT NULL
                )
            """)
            # Copy legacy rows, back-filling user_id from users table
            await db.execute("""
                INSERT INTO referral_balance (user_id, wallet, balance_usd, total_earned, total_paid, updated_at)
                SELECT COALESCE(u.user_id, l.wallet), l.wallet, l.balance_usd, l.total_earned, l.total_paid, l.updated_at
                FROM referral_balance_legacy l
                LEFT JOIN users u ON u.wallet = l.wallet
            """)
            await db.commit()
        elif not rb_cols:
            await db.execute("""
                CREATE TABLE referral_balance (
                    user_id       TEXT PRIMARY KEY,
                    wallet        TEXT UNIQUE,
                    balance_usd   REAL NOT NULL DEFAULT 0,
                    total_earned  REAL NOT NULL DEFAULT 0,
                    total_paid    REAL NOT NULL DEFAULT 0,
                    updated_at    INTEGER NOT NULL
                )
            """)
        await db.execute("CREATE INDEX IF NOT EXISTS idx_refbal_wallet ON referral_balance(wallet)")
        # Back-fill wallet from users table for any rows missing it
        await db.execute("""
            UPDATE referral_balance SET wallet = (
                SELECT wallet FROM users WHERE users.user_id = referral_balance.user_id
            ) WHERE wallet IS NULL
        """)

        # ── Referral redemptions ───────────────────────────────────────────
        # Tracks balance spend — e.g. applied as discount on a tile purchase.
        await db.execute("""
            CREATE TABLE IF NOT EXISTS referral_redemptions (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                wallet       TEXT NOT NULL,
                tile_key     TEXT NOT NULL,
                amount_usd   REAL NOT NULL,
                redeemed_at  INTEGER NOT NULL
            )
        """)
        # Track NOWPayments payment_id → tile_key mapping for IPN
        await db.execute("""
            CREATE TABLE IF NOT EXISTS payments (
                payment_id  TEXT PRIMARY KEY,
                tile_key    TEXT NOT NULL,
                status      TEXT NOT NULL DEFAULT 'waiting',
                owner       TEXT,
                chain       TEXT NOT NULL DEFAULT 'polygon',
                ref_code    TEXT,
                session_id  TEXT,
                created_at  INTEGER NOT NULL
            )
        """)
        # Add missing columns to payments table (idempotent migration)
        for col, typedef in [
            ("owner",      "TEXT"),
            ("chain",      "TEXT NOT NULL DEFAULT 'polygon'"),
            ("ref_code",   "TEXT"),
            ("session_id", "TEXT"),
        ]:
            try:
                await db.execute(f"ALTER TABLE payments ADD COLUMN {col} {typedef}")
            except Exception:
                pass  # column already exists
        await db.commit()
        # ── NFT mint records ───────────────────────────────────────────────
        await db.execute("""
            CREATE TABLE IF NOT EXISTS nft_mints (
                tile_key    TEXT PRIMARY KEY,
                token_id    TEXT NOT NULL,
                tx_hash     TEXT NOT NULL,
                chain       TEXT NOT NULL DEFAULT 'unknown',
                owner       TEXT NOT NULL,
                minted_at   INTEGER NOT NULL
            )
        """)
        # ── Marketplace listings ───────────────────────────────────────────
        await db.execute("""
            CREATE TABLE IF NOT EXISTS marketplace (
                tile_key    TEXT PRIMARY KEY,
                seller      TEXT NOT NULL,
                price_usd   REAL NOT NULL,
                chain       TEXT,
                token_id    TEXT,
                tx_hash     TEXT,
                listed_at   INTEGER NOT NULL,
                active      INTEGER NOT NULL DEFAULT 1
            )
        """)
        # ── Analytics events ───────────────────────────────────────────────
        await db.execute("""
            CREATE TABLE IF NOT EXISTS analytics_events (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                event       TEXT NOT NULL,
                session_id  TEXT,
                wallet      TEXT,
                tile_key    TEXT,
                properties  TEXT,
                ts          INTEGER NOT NULL
            )
        """)
        await db.execute("""
            CREATE INDEX IF NOT EXISTS idx_analytics_event ON analytics_events(event)
        """)
        await db.execute("""
            CREATE INDEX IF NOT EXISTS idx_analytics_ts ON analytics_events(ts)
        """)
        await db.execute("""
            CREATE INDEX IF NOT EXISTS idx_analytics_session ON analytics_events(session_id)
        """)
        await db.execute("""
            CREATE INDEX IF NOT EXISTS idx_analytics_wallet ON analytics_events(wallet)
        """)
        # ── DAO proposals ──────────────────────────────────────────────────
        await db.execute("""
            CREATE TABLE IF NOT EXISTS dao_proposals (
                id          TEXT PRIMARY KEY,
                title       TEXT NOT NULL,
                body        TEXT NOT NULL,
                author      TEXT NOT NULL,
                votes_for   INTEGER NOT NULL DEFAULT 0,
                votes_against INTEGER NOT NULL DEFAULT 0,
                status      TEXT NOT NULL DEFAULT 'active',
                created_at  INTEGER NOT NULL,
                ends_at     INTEGER NOT NULL
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS dao_votes (
                proposal_id TEXT NOT NULL,
                voter       TEXT NOT NULL,
                vote        TEXT NOT NULL,
                weight      INTEGER NOT NULL DEFAULT 1,
                voted_at    INTEGER NOT NULL,
                PRIMARY KEY (proposal_id, voter)
            )
        """)
        # ── Guardian Agent tables ──────────────────────────────────────────
        await db.execute("""
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
        await db.execute("""
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
        await db.execute("""
            CREATE INDEX IF NOT EXISTS idx_raid_attacker ON raid_log(attacker_tile)
        """)
        await db.execute("""
            CREATE INDEX IF NOT EXISTS idx_raid_defender ON raid_log(defender_tile)
        """)

        # ── Streaks (daily check-in retention loop) ───────────────────────
        await db.execute("""
            CREATE TABLE IF NOT EXISTS streaks (
                user_id          TEXT PRIMARY KEY,
                current_streak   INTEGER NOT NULL DEFAULT 0,
                longest_streak   INTEGER NOT NULL DEFAULT 0,
                last_checkin_day TEXT,                          -- 'YYYY-MM-DD' UTC
                last_checkin_at  INTEGER NOT NULL DEFAULT 0,    -- unix ms
                total_checkins   INTEGER NOT NULL DEFAULT 0
            )
        """)
        await db.execute("""
            CREATE INDEX IF NOT EXISTS idx_streaks_current ON streaks(current_streak DESC)
        """)
        await db.execute("""
            CREATE INDEX IF NOT EXISTS idx_streaks_longest ON streaks(longest_streak DESC)
        """)

        # ── Share cards cache (one per user per day) ──────────────────────
        await db.execute("""
            CREATE TABLE IF NOT EXISTS share_cards (
                card_id      TEXT PRIMARY KEY,                  -- "user_id:YYYY-MM-DD"
                user_id      TEXT NOT NULL,
                day          TEXT NOT NULL,                     -- 'YYYY-MM-DD' UTC
                payload_json TEXT NOT NULL,                     -- serialized card data
                generated_at INTEGER NOT NULL,
                view_count   INTEGER NOT NULL DEFAULT 0,
                share_count  INTEGER NOT NULL DEFAULT 0
            )
        """)
        await db.execute("""
            CREATE INDEX IF NOT EXISTS idx_share_cards_user_day ON share_cards(user_id, day DESC)
        """)

        # ── Wallet sign-in nonces (SIWE challenge/verify) ─────────────────
        await db.execute("""
            CREATE TABLE IF NOT EXISTS wallet_nonces (
                wallet     TEXT NOT NULL,
                nonce      TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )
        """)
        await db.execute("""
            CREATE INDEX IF NOT EXISTS idx_wallet_nonces_wallet ON wallet_nonces(wallet)
        """)
        # payments: single-use consumption marker (idempotent migration)
        try:
            await db.execute("ALTER TABLE payments ADD COLUMN consumed_at INTEGER")
        except Exception:
            pass  # column already exists
        # payments: server-stored expected USD price for amount binding (idempotent)
        try:
            await db.execute("ALTER TABLE payments ADD COLUMN price_usd REAL")
        except Exception:
            pass  # column already exists
        await db.commit()

        # ── Normalize wallet addresses to lowercase (idempotent) ──────────
        await db.execute("UPDATE blocks SET owner = LOWER(owner) WHERE owner LIKE '0x%'")
        await db.execute("UPDATE users SET wallet = LOWER(wallet) WHERE wallet LIKE '0x%' AND wallet IS NOT NULL")
        await db.execute("UPDATE referral_codes SET wallet = LOWER(wallet) WHERE wallet LIKE '0x%' AND wallet IS NOT NULL")
        await db.execute("UPDATE referral_balance SET wallet = LOWER(wallet) WHERE wallet LIKE '0x%' AND wallet IS NOT NULL")
        await db.execute("UPDATE referrals SET referrer_wallet = LOWER(referrer_wallet) WHERE referrer_wallet LIKE '0x%' AND referrer_wallet IS NOT NULL")
        await db.execute("UPDATE referrals SET referee_wallet = LOWER(referee_wallet) WHERE referee_wallet LIKE '0x%' AND referee_wallet IS NOT NULL")
        await db.execute("UPDATE marketplace SET seller = LOWER(seller) WHERE seller LIKE '0x%'")
        await db.execute("UPDATE guardians SET owner = LOWER(owner) WHERE owner LIKE '0x%'")

        # ── Drop migration artifact tables (safe — data already copied) ───
        for legacy_table in ["users_legacy", "referral_codes_legacy", "referrals_legacy", "referral_balance_legacy"]:
            await db.execute(f"DROP TABLE IF EXISTS {legacy_table}")
        await db.commit()
        print("[DB] Wallet addresses normalized · Legacy tables cleaned up")

    print(f"[DB] Ready at {DB_PATH}")

async def _check_zoom_level():
    """Warn on startup if the blocks table still contains Z11 coordinates (max coord ≤ 2047)."""
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("SELECT COUNT(*), MAX(tx), MAX(ty) FROM blocks") as cur:
            row = await cur.fetchone()
    count, max_tx, max_ty = row
    if count and max_tx is not None and max_tx <= 2047 and max_ty <= 2047:
        print(
            f"\n⚠️  WARNING: {count} blocks have Z11 coordinates (max tx={max_tx}, ty={max_ty}).\n"
            f"   The game now uses Z14 (max coord = 16383).\n"
            f"   Run: python3 server/migrations/migrate_z11_to_z14.py\n"
            f"   Or re-seed: python3 server/seed.py\n"
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await _check_zoom_level()
    # Ensure price_events table exists before the loop starts
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(PRICE_EVENTS_TABLE)
        await db.commit()
    # Viral features — agent feed, frame pages, squads, landdrop
    await init_viral_tables(DB_PATH)
    # Start background loops (non-blocking)
    asyncio.create_task(price_events_loop())
    asyncio.create_task(refresh_news())
    asyncio.create_task(agent_feed_loop(DB_PATH))
    yield

# ── App ───────────────────────────────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address)
app = FastAPI(lifespan=lifespan, title="CryptoLand API")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

_allowed_origins_str = os.environ.get("ALLOWED_ORIGINS", "*")
_allowed_origins = (
    ["*"] if _allowed_origins_str == "*"
    else [o.strip() for o in _allowed_origins_str.split(",") if o.strip()]
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Session-ID"],
)

# ── Models ────────────────────────────────────────────────────────────────────
class PurchaseRequest(BaseModel):
    tile_key:       str
    tx:             int
    ty:             int
    owner:          str
    color:          str = "#00ff88"
    price:          float
    country:        str = "Unknown"
    chain:          str = "polygon"
    image_url:      Optional[str] = None
    label:          Optional[str] = None
    ref_code:       Optional[str] = None
    session_id:     Optional[str] = None
    purchase_email: Optional[str] = None   # email for guest account creation
    user_id:        Optional[str] = None   # authenticated user making purchase

class Block(BaseModel):
    tile_key:     str
    tx:           int
    ty:           int
    owner:        str
    color:        str
    price:        float
    country:      str
    chain:        str = "polygon"
    purchased_at: int
    image_url:    Optional[str] = None
    label:        Optional[str] = None

class CreatePaymentRequest(BaseModel):
    tile_key:    str
    usd_amount:  float
    currency:    str   # BTC, ETH, SOL, etc.
    owner:       Optional[str] = None
    chain:       str = "polygon"
    ref_code:    Optional[str] = None
    session_id:  Optional[str] = None

class FinalizeRequest(BaseModel):
    payment_id:      str
    tile_key:        str
    tx:              int
    ty:              int
    owner:           str
    color:           str = "#00ff88"
    price:           float
    country:         str = "Unknown"
    chain:           str = "polygon"
    ref_code:        Optional[str] = None   # affiliate code from client session
    session_id:      Optional[str] = None   # session for fraud checks
    purchase_email:  Optional[str] = None   # email for guest account creation
    user_id:         Optional[str] = None   # if logged-in user is making purchase

# ── Helpers ───────────────────────────────────────────────────────────────────
def np_headers():
    return {"x-api-key": NP_API_KEY, "Content-Type": "application/json"}

async def np_get(path: str, params: dict = None):
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(f"{NP_BASE}{path}", headers=np_headers(), params=params)
    if not r.is_success:
        raise HTTPException(r.status_code, f"NOWPayments error: {r.text}")
    return r.json()

async def np_post(path: str, body: dict):
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(f"{NP_BASE}{path}", headers=np_headers(), json=body)
    if not r.is_success:
        raise HTTPException(r.status_code, f"NOWPayments error: {r.text}")
    return r.json()

# ── Block routes ──────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"ok": True, "db": str(DB_PATH)}

@app.get("/blocks", response_model=list[Block])
async def get_all_blocks(chain: Optional[str] = None, limit: int = 5000, offset: int = 0):
    # Bound the result set so this can never return an unbounded table.
    limit  = max(1, min(int(limit), 20000))
    offset = max(0, int(offset))
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        if chain:
            async with db.execute(
                "SELECT * FROM blocks WHERE chain = ? ORDER BY purchased_at DESC LIMIT ? OFFSET ?",
                (chain, limit, offset)
            ) as cur:
                rows = await cur.fetchall()
        else:
            async with db.execute(
                "SELECT * FROM blocks ORDER BY purchased_at DESC LIMIT ? OFFSET ?",
                (limit, offset)
            ) as cur:
                rows = await cur.fetchall()
    return [dict(r) for r in rows]

@app.get("/blocks/{tile_key:path}", response_model=Block)
async def get_block(tile_key: str):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM blocks WHERE tile_key = ?", (tile_key,)
        ) as cur:
            row = await cur.fetchone()
    if not row:
        raise HTTPException(404, "Block not found")
    return dict(row)

@app.post("/blocks", response_model=Block)
@limiter.limit("20/minute")
async def purchase_block(req: PurchaseRequest, request: Request):
    """
    Record a block purchase. Idempotent — re-purchasing your own block updates color/image/label only.
    Returns 409 if owned by someone else.

    SECURITY: requires auth. The owner is set from the authenticated user (their
    wallet, else user_id); the client-supplied `owner` field is ignored. This is
    the no-payment purchase path — stops free-claiming of other identities.
    """
    # Validate tile coordinates are within Z14 grid
    if not (0 <= req.tx <= 16383 and 0 <= req.ty <= 16383):
        raise HTTPException(400, "Invalid tile coordinates: must be in range 0–16383")
    expected_key = f"{req.tx}:{req.ty}"
    if req.tile_key != expected_key:
        raise HTTPException(400, f"tile_key '{req.tile_key}' does not match tx={req.tx}, ty={req.ty}")

    now_ms = int(time.time() * 1000)

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        user = await _require_auth(request, db)
        # Owner is derived from the caller — never trust req.owner.
        normalized_owner = (user.get("wallet") or user.get("user_id"))
        normalized_owner = _norm_wallet(normalized_owner) if normalized_owner.startswith("0x") else normalized_owner
        await db.execute("BEGIN EXCLUSIVE")
        try:
            async with db.execute(
                "SELECT owner FROM blocks WHERE tile_key = ?", (req.tile_key,)
            ) as cur:
                existing = await cur.fetchone()

            if existing:
                norm_existing = existing["owner"].strip().lower()
                norm_req      = normalized_owner.strip().lower()
                if norm_existing != norm_req:
                    await db.execute("ROLLBACK")
                    raise HTTPException(409, f"Block already owned by {existing['owner']}")

            await db.execute("""
                INSERT INTO blocks (tile_key, tx, ty, owner, color, price, country, chain, purchased_at, image_url, label)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(tile_key) DO UPDATE SET
                    color        = excluded.color,
                    image_url    = excluded.image_url,
                    label        = excluded.label
            """, (req.tile_key, req.tx, req.ty, normalized_owner, req.color,
                  req.price, req.country, req.chain, now_ms, req.image_url, req.label))
            await db.commit()

            async with db.execute(
                "SELECT * FROM blocks WHERE tile_key = ?", (req.tile_key,)
            ) as cur:
                row = await cur.fetchone()
        except HTTPException:
            raise
        except Exception as e:
            await db.execute("ROLLBACK")
            raise HTTPException(500, f"Purchase failed: {str(e)}")

    print(f"[DB] Block purchased: {req.tile_key} → {normalized_owner} @ ${req.price}")

    # ── Affiliate commission ──────────────────────────────────────────────────
    if req.ref_code:
        await _process_referral_commission(
            ref_code=req.ref_code.upper().strip(),
            referee_wallet=normalized_owner if str(normalized_owner).startswith("0x") else None,
            session_id=req.session_id,
            tile_key=req.tile_key,
            purchase_usd=float(req.price),
        )

    return dict(row)

class CustomizeRequest(BaseModel):
    image_url: Optional[str] = None
    label:     Optional[str] = None

@app.patch("/blocks/{tile_key:path}", response_model=Block)
async def customize_block(tile_key: str, req: CustomizeRequest, request: Request):
    """
    Update image_url and/or label for an already-owned block.
    SECURITY: only the tile's DB owner (authenticated) may edit it.
    """
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        user = await _require_auth(request, db)
        async with db.execute("SELECT * FROM blocks WHERE tile_key = ?", (tile_key,)) as cur:
            row = await cur.fetchone()
        if not row:
            raise HTTPException(404, "Block not found")
        if not _owns_block(user, row["owner"]):
            raise HTTPException(403, "You don't own this tile")
        await db.execute(
            "UPDATE blocks SET image_url = ?, label = ? WHERE tile_key = ?",
            (req.image_url, req.label, tile_key),
        )
        await db.commit()
        async with db.execute("SELECT * FROM blocks WHERE tile_key = ?", (tile_key,)) as cur:
            row = await cur.fetchone()
    return dict(row)

@app.get("/stats/countries")
async def get_country_stats():
    """Return block count grouped by country, sorted descending."""
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT country, COUNT(*) as cnt FROM blocks GROUP BY country ORDER BY cnt DESC LIMIT 20"
        ) as cur:
            rows = await cur.fetchall()
    return [{"country": r[0], "blocks": r[1]} for r in rows]

@app.get("/stats")
async def get_stats(chain: Optional[str] = None):
    """
    Global stats. Pass ?chain= to scope to one chain — required when a single
    backend serves several per-chain frontends, so an Algorand build never shows
    Polygon's numbers. Deployments with one DB per chain can omit it.
    """
    async with aiosqlite.connect(DB_PATH) as db:
        if chain:
            sql = ("SELECT COUNT(*), SUM(price), COUNT(DISTINCT owner) "
                   "FROM blocks WHERE chain = ?")
            args = (chain,)
        else:
            sql = "SELECT COUNT(*), SUM(price), COUNT(DISTINCT owner) FROM blocks"
            args = ()
        async with db.execute(sql, args) as cur:
            row = await cur.fetchone()
    return {
        "sold":    row[0] or 0,
        "volume":  round(row[1] or 0, 2),
        "owners":  row[2] or 0,
    }

# ── NOWPayments proxy routes ──────────────────────────────────────────────────

@app.get("/np/status")
async def np_status():
    """Check NOWPayments API availability."""
    return await np_get("/status")

@app.get("/np/currencies")
async def np_currencies():
    """List available currencies from NOWPayments."""
    return await np_get("/currencies")

@app.get("/np/min-amount")
async def np_min_amount(currency_from: str, currency_to: str = "usd"):
    """
    Get minimum payment amount for a currency pair.
    currency_from = crypto ticker (e.g. 'btc')
    currency_to   = fiat or crypto (default 'usd')
    """
    data = await np_get("/min-amount", params={
        "currency_from": currency_from.lower(),
        "currency_to": currency_to.lower(),
    })
    return data

@app.get("/np/estimate")
async def np_estimate(amount: float, currency_from: str, currency_to: str):
    """
    Estimate crypto amount for a given USD amount.
    e.g. ?amount=5.50&currency_from=usd&currency_to=btc
    """
    data = await np_get("/estimate", params={
        "amount": amount,
        "currency_from": currency_from.lower(),
        "currency_to": currency_to.lower(),
    })
    return data

@app.post("/np/payment")
@limiter.limit("10/minute")
async def np_create_payment(req: CreatePaymentRequest, request: Request):
    """
    Create a NOWPayments payment for a tile purchase.
    Returns payment_id, pay_address, pay_amount, pay_currency, expiration_estimate_date.
    """
    # Get current estimate for the crypto amount
    estimate = await np_get("/estimate", params={
        "amount": req.usd_amount,
        "currency_from": "usd",
        "currency_to": req.currency.lower(),
    })
    estimated_amount = estimate.get("estimated_amount")

    # Get minimum amount to validate
    min_data = await np_get("/min-amount", params={
        "currency_from": req.currency.lower(),
        "currency_to": "usd",
    })
    min_amount = min_data.get("min_amount", 0)

    if estimated_amount is not None and float(estimated_amount) < float(min_amount):
        raise HTTPException(
            400,
            f"Amount too low: {estimated_amount} {req.currency.upper()} is below the "
            f"minimum of {min_amount} {req.currency.upper()}. "
            f"Please select a higher-value tile or choose a different currency."
        )

    # Create the actual payment
    payment = await np_post("/payment", {
        "price_amount": req.usd_amount,
        "price_currency": "usd",
        "pay_currency": req.currency.lower(),
        "order_id": req.tile_key,
        "order_description": f"CryptoLand tile {req.tile_key}",
        "ipn_callback_url": f"{SERVER_URL}/np/ipn",
    })

    payment_id = str(payment.get("payment_id", ""))

    # Persist payment → tile_key mapping for IPN reconciliation (include owner for IPN finalize)
    # Store the expected USD price server-side so finalize/IPN can bind the amount.
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            INSERT OR REPLACE INTO payments (payment_id, tile_key, status, created_at, owner, chain, ref_code, session_id, price_usd)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (payment_id, req.tile_key, payment.get("payment_status", "waiting"),
              int(time.time() * 1000), req.owner, req.chain, req.ref_code, req.session_id,
              float(req.usd_amount)))
        await db.commit()

    print(f"[NP] Payment created: {payment_id} for tile {req.tile_key} ({estimated_amount} {req.currency})")
    return payment

@app.get("/np/payment/{payment_id}")
async def np_payment_status(payment_id: str):
    """Poll payment status from NOWPayments."""
    data = await np_get(f"/payment/{payment_id}")

    # Update local DB status
    status = data.get("payment_status", "waiting")
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE payments SET status = ? WHERE payment_id = ?",
            (status, payment_id)
        )
        await db.commit()

    return data

@app.post("/np/finalize")
async def np_finalize(req: FinalizeRequest):
    """
    Called by frontend when payment is confirmed.
    Verifies the payment status with NOWPayments before writing the block.
    """
    # Validate tile coordinates are within Z14 grid
    if not (0 <= req.tx <= 16383 and 0 <= req.ty <= 16383):
        raise HTTPException(400, "Invalid tile coordinates: must be in range 0–16383")
    expected_key = f"{req.tx}:{req.ty}"
    if req.tile_key != expected_key:
        raise HTTPException(400, f"tile_key '{req.tile_key}' does not match tx={req.tx}, ty={req.ty}")

    # ── Bind finalize to the stored payment (tile + amount), enforce single-use ──
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT tile_key, price_usd, consumed_at FROM payments WHERE payment_id = ?",
            (req.payment_id,)
        ) as cur:
            pay_row = await cur.fetchone()
    if not pay_row:
        raise HTTPException(400, "Unknown payment_id")
    if (pay_row["tile_key"] or "") != req.tile_key:
        raise HTTPException(409, "payment/tile mismatch")
    if pay_row["consumed_at"]:
        raise HTTPException(409, "Payment already consumed")
    # Server-stored expected price is authoritative; never trust req.price for the amount check.
    expected_price = float(pay_row["price_usd"]) if pay_row["price_usd"] is not None else 0.0

    payment_data_np = await np_get(f"/payment/{req.payment_id}")
    status = payment_data_np.get("payment_status", "")

    terminal_ok = {"finished", "confirmed", "sending", "partially_paid"}

    # Amount binding: NOWPayments' price_amount is the USD invoice total. It must
    # cover the server-stored expected price (small tolerance for float/rounding).
    # `partially_paid` is treated as insufficient — the USD target was not met.
    reported_paid = float(payment_data_np.get("price_amount", 0) or 0)
    if expected_price > 0 and reported_paid < expected_price * 0.95:
        raise HTTPException(
            402,
            f"Payment insufficient: invoiced ${reported_paid:.2f} of ${expected_price:.2f} required. "
            f"Please send the remaining amount to complete the purchase."
        )
    if status == "partially_paid":
        raise HTTPException(
            402,
            "Partial payment received — please send the remaining amount to complete the purchase."
        )
    if status not in terminal_ok:
        raise HTTPException(
            402,
            f"Payment not yet completed (status: {status}). Please wait for blockchain confirmation."
        )

    now_ms = int(time.time() * 1000)
    normalized_owner = _norm_wallet(req.owner) if req.owner.startswith("0x") else req.owner
    # Write the block using the SERVER-stored price, not the client-supplied price.
    store_price = expected_price if expected_price > 0 else float(req.price)

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        await db.execute("BEGIN EXCLUSIVE")
        try:
            # Re-check consumption inside the transaction (defeats concurrent double-finalize)
            async with db.execute(
                "SELECT consumed_at FROM payments WHERE payment_id = ?", (req.payment_id,)
            ) as cur:
                pay_now = await cur.fetchone()
            if pay_now and pay_now["consumed_at"]:
                await db.execute("ROLLBACK")
                raise HTTPException(409, "Payment already consumed")

            async with db.execute(
                "SELECT owner FROM blocks WHERE tile_key = ?", (req.tile_key,)
            ) as cur:
                existing = await cur.fetchone()

            if existing:
                norm_existing = existing["owner"].strip().lower()
                norm_req      = normalized_owner.strip().lower()
                if norm_existing != norm_req:
                    await db.execute("ROLLBACK")
                    raise HTTPException(409, f"Block already owned by {existing['owner']}")

            await db.execute("""
                INSERT INTO blocks (tile_key, tx, ty, owner, color, price, country, chain, purchased_at, image_url, label)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
                ON CONFLICT(tile_key) DO UPDATE SET
                    color        = excluded.color,
                    purchased_at = excluded.purchased_at
            """, (req.tile_key, req.tx, req.ty, normalized_owner, req.color,
                  store_price, req.country, req.chain, now_ms))
            # Mark the payment consumed in the same transaction that writes the block.
            await db.execute(
                "UPDATE payments SET status = ?, consumed_at = ? WHERE payment_id = ?",
                (status, now_ms, req.payment_id)
            )
            await db.commit()

            async with db.execute(
                "SELECT * FROM blocks WHERE tile_key = ?", (req.tile_key,)
            ) as cur:
                row = await cur.fetchone()
        except HTTPException:
            raise
        except Exception as e:
            await db.execute("ROLLBACK")
            raise HTTPException(500, f"Finalize failed: {str(e)}")

    print(f"[NP] Block finalized: {req.tile_key} → {normalized_owner} @ ${store_price}")

    # ── Guest account creation (email provided during purchase, no account yet) ─
    guest_info = None
    if req.purchase_email and not req.user_id:
        email = req.purchase_email.strip().lower()
        if _re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', email):
            async with aiosqlite.connect(DB_PATH) as db:
                db.row_factory = aiosqlite.Row
                async with db.execute("SELECT user_id FROM users WHERE email = ?", (email,)) as cur:
                    existing_user = await cur.fetchone()
                if not existing_user:
                    now2   = int(time.time() * 1000)
                    uid    = _make_user_id()
                    owner  = _norm_wallet(req.owner) if req.owner.startswith("0x") else req.owner
                    await db.execute(
                        "INSERT INTO users (user_id, email, avatar_emoji, is_guest, created_at, last_seen) VALUES (?,?,'🌍',1,?,?)",
                        (uid, email, now2, now2)
                    )
                    # Link wallet if owner looks like a wallet address
                    if req.owner.startswith("0x") or len(req.owner) > 20:
                        await db.execute("UPDATE users SET wallet = ? WHERE user_id = ?", (_norm_wallet(req.owner), uid))
                    await db.commit()
                    guest_info = {"user_id": uid, "email": email, "is_guest": True}
                    print(f"[Auth] Guest account created for {email} (user_id={uid})")
                else:
                    guest_info = {"user_id": existing_user["user_id"], "email": email, "is_guest": False}

    # ── Affiliate commission ──────────────────────────────────────────────────
    if req.ref_code:
        await _process_referral_commission(
            ref_code=req.ref_code.upper().strip(),
            referee_wallet=_norm_wallet(req.owner) if req.owner not in ("You",) else None,
            session_id=req.session_id,
            tile_key=req.tile_key,
            purchase_usd=store_price,
        )

    result = dict(row)
    if guest_info:
        result["guest_account"] = guest_info
    return result

async def _process_referral_commission(
    ref_code: str,
    referee_wallet: Optional[str],
    session_id: Optional[str],
    tile_key: str,
    purchase_usd: float,
):
    """
    Apply a 30% commission to the referrer's balance.

    Fraud guards:
    1. Code must exist in referral_codes table (not guessable — must be pre-generated).
    2. Referrer ≠ referee (no self-referral).
    3. One commission per tile_key (unique index on referrals.tile_key).
    4. Code format must match LAND-[A-F0-9]{6} (regex validated upstream).
    5. IP deduplication: we store ip_hash in sessions — repeated IPs from
       different wallets within 60s are flagged (future: escalate to blocked).
    """
    now = int(time.time() * 1000)

    if not _re.match(r'^LAND-[A-F0-9]{6}$', ref_code):
        print(f"[Affiliate] Invalid code format: {ref_code}")
        return

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row

        # 1. Look up referrer (may be wallet-keyed or user_id-keyed)
        async with db.execute("SELECT wallet, user_id FROM referral_codes WHERE code = ?", (ref_code,)) as cur:
            code_row = await cur.fetchone()
        if not code_row:
            print(f"[Affiliate] Unknown code: {ref_code}")
            return
        referrer_wallet  = code_row["wallet"]
        referrer_user_id = code_row["user_id"]
        # Use wallet as the balance key; fall back to user_id if no wallet
        referrer_key     = referrer_wallet or referrer_user_id

        # 2. No self-referral
        if referee_wallet and referee_wallet == referrer_wallet:
            print(f"[Affiliate] Self-referral blocked: {referrer_wallet}")
            return

        # 3. Check tile hasn't already generated a commission (unique index guard)
        async with db.execute("SELECT id FROM referrals WHERE tile_key = ?", (tile_key,)) as cur:
            if await cur.fetchone():
                print(f"[Affiliate] Tile {tile_key} already has a referral record")
                return

        # 4. IP velocity fraud check: if same ip_hash purchased ≥3 tiles in last 5 min → flag
        if session_id:
            async with db.execute("SELECT ip_hash FROM sessions WHERE session_id = ?", (session_id,)) as cur:
                sess_row = await cur.fetchone()
            if sess_row and sess_row["ip_hash"]:
                five_min_ago = now - 300_000
                async with db.execute(
                    "SELECT COUNT(*) FROM referrals r JOIN sessions s ON s.session_id = r.referee_session "
                    "WHERE s.ip_hash = ? AND r.created_at > ?",
                    (sess_row["ip_hash"], five_min_ago)
                ) as cur:
                    velocity_count = (await cur.fetchone())[0]
                if velocity_count >= 3:
                    print(f"[Affiliate] IP velocity fraud detected for session {session_id} — commission withheld")
                    return

        # Compute commission in integer cents so repeated accrual doesn't drift.
        commission = _from_cents(int(round(_to_cents(purchase_usd) * COMMISSION_RATE)))

        # 5. Write referral event (referrer_wallet may be null for email-only referrers)
        try:
            await db.execute(
                "INSERT INTO referrals (referrer_wallet, referrer_user_id, referee_wallet, referee_session, tile_key, purchase_usd, commission_usd, ref_code, status, created_at) "
                "VALUES (?,?,?,?,?,?,?,?,'pending',?)",
                (referrer_wallet, referrer_user_id, referee_wallet, session_id or "", tile_key, purchase_usd, commission, ref_code, now)
            )
        except Exception as e:
            if "UNIQUE constraint failed" in str(e):
                print(f"[Affiliate] Duplicate commission attempt for tile {tile_key} — skipped")
                return
            raise

        # 6. Update balance ledger — keyed by user_id (preferred) or wallet
        bal_user_id = referrer_user_id or referrer_wallet   # user_id is PK; never null
        async with db.execute(
            "SELECT balance_usd FROM referral_balance WHERE user_id = ?",
            (bal_user_id,)
        ) as cur:
            bal_row = await cur.fetchone()

        if bal_row:
            await db.execute(
                "UPDATE referral_balance SET balance_usd = balance_usd + ?, total_earned = total_earned + ?, updated_at = ? "
                "WHERE user_id = ?",
                (commission, commission, now, bal_user_id)
            )
        else:
            await db.execute(
                "INSERT INTO referral_balance (user_id, wallet, balance_usd, total_earned, total_paid, updated_at) VALUES (?,?,?,?,0,?)",
                (bal_user_id, referrer_wallet, commission, commission, now)
            )

        # 7. Mark referral as credited
        await db.execute(
            "UPDATE referrals SET status = 'credited', credited_at = ? WHERE tile_key = ?",
            (now, tile_key)
        )

        await db.commit()
        print(f"[Affiliate] Commission ${commission:.2f} credited to {referrer_key} (code {ref_code}, tile {tile_key})")

@app.post("/np/ipn")
async def np_ipn(request: Request, x_nowpayments_sig: Optional[str] = Header(None)):
    """
    NOWPayments Instant Payment Notification webhook.
    Verifies HMAC-SHA512 signature, then auto-finalizes confirmed payments.
    """
    body_bytes = await request.body()

    # Verify IPN signature — FAIL CLOSED. When a secret is configured, a missing
    # OR invalid signature is rejected (401) and the body is never parsed/acted on.
    if NP_IPN_SECRET:
        if not x_nowpayments_sig:
            raise HTTPException(401, "Missing IPN signature")
        expected = hmac.new(
            NP_IPN_SECRET.encode(),
            body_bytes,
            hashlib.sha512
        ).hexdigest()
        if not hmac.compare_digest(expected, x_nowpayments_sig.lower()):
            raise HTTPException(401, "Invalid IPN signature")

    data = json.loads(body_bytes)
    payment_id = str(data.get("payment_id", ""))
    status = data.get("payment_status", "")

    print(f"[IPN] payment_id={payment_id} status={status}")

    terminal_ok = {"finished", "confirmed"}
    if status in terminal_ok and payment_id:
        async with aiosqlite.connect(DB_PATH) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT tile_key, owner, chain, ref_code, session_id, price_usd, consumed_at FROM payments WHERE payment_id = ?",
                (payment_id,)
            ) as cur:
                row = await cur.fetchone()

        if row and not row["consumed_at"]:
            tile_key   = row["tile_key"]
            real_owner = row["owner"] or f"IPN-{payment_id[:8]}"  # fallback only if no owner stored
            chain      = row["chain"] or "polygon"
            ref_code   = row["ref_code"]
            session_id = row["session_id"]
            now_ms     = int(time.time() * 1000)
            tx_str, ty_str = tile_key.split(":")
            tx, ty     = int(tx_str), int(ty_str)
            # Amount binding: use server-stored expected price; verify the NP-reported
            # paid amount covers it (small tolerance). Never trust the IPN body alone.
            expected_price = float(row["price_usd"]) if row["price_usd"] is not None else 0.0
            reported_paid  = float(data.get("price_amount", 0) or 0)
            store_price    = expected_price if expected_price > 0 else reported_paid
            norm_owner  = _norm_wallet(real_owner) if real_owner.startswith("0x") else real_owner

            if expected_price > 0 and reported_paid < expected_price * 0.95:
                print(f"[IPN] Amount mismatch for {payment_id}: paid ${reported_paid:.2f} < expected ${expected_price:.2f} — skipped")
                return {"ok": True}

            async with aiosqlite.connect(DB_PATH) as db:
                db.row_factory = aiosqlite.Row
                await db.execute("BEGIN EXCLUSIVE")
                try:
                    # Re-check consumption inside the transaction (single-use)
                    async with db.execute(
                        "SELECT consumed_at FROM payments WHERE payment_id = ?", (payment_id,)
                    ) as cur:
                        pay_now = await cur.fetchone()
                    if pay_now and pay_now["consumed_at"]:
                        await db.execute("ROLLBACK")
                        return {"ok": True}

                    async with db.execute(
                        "SELECT owner FROM blocks WHERE tile_key = ?", (tile_key,)
                    ) as cur:
                        existing = await cur.fetchone()

                    if not existing:
                        await db.execute("""
                            INSERT INTO blocks
                            (tile_key, tx, ty, owner, color, price, country, chain, purchased_at)
                            VALUES (?, ?, ?, ?, '#00ff88', ?, 'Unknown', ?, ?)
                        """, (tile_key, tx, ty, norm_owner, store_price, chain, now_ms))

                    await db.execute(
                        "UPDATE payments SET status = ?, consumed_at = ? WHERE payment_id = ?",
                        (status, now_ms, payment_id)
                    )
                    await db.commit()
                except Exception:
                    await db.execute("ROLLBACK")
                    raise

            print(f"[IPN] Auto-finalized block {tile_key} → owner={norm_owner}")

            # Process affiliate commission if a ref_code was stored at payment creation
            if ref_code:
                await _process_referral_commission(
                    ref_code=ref_code.upper().strip(),
                    referee_wallet=_norm_wallet(norm_owner) if norm_owner.startswith("0x") else None,
                    session_id=session_id,
                    tile_key=tile_key,
                    purchase_usd=store_price,
                )

    return {"ok": True}

# ── Auth helpers + User accounts ─────────────────────────────────────────────

import hashlib, secrets as _sec, re as _re

COMMISSION_RATE  = 0.30   # 30% of tile purchase price
TOKEN_TTL_MS     = 30 * 24 * 3600 * 1000   # 30 days

def _to_cents(usd) -> int:
    """USD float → integer cents (round-half-to-even avoided; standard rounding)."""
    return int(round(float(usd) * 100))

def _from_cents(cents: int) -> float:
    """Integer cents → USD float with 2 decimals."""
    return round(cents / 100.0, 2)

def _norm_wallet(w: str) -> str:
    return w.strip().lower()

def _make_ref_code(identity: str) -> str:
    """Deterministic 6-char code from wallet or user_id."""
    h = hashlib.sha256(identity.lower().encode()).hexdigest()[:6].upper()
    return f"LAND-{h}"

def _hash_password(password: str, salt: str) -> str:
    """Simple PBKDF2-like: sha256(salt + password) × 100k rounds."""
    dk = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100_000)
    return dk.hex()

def _make_token() -> str:
    return _sec.token_hex(32)

def _make_user_id() -> str:
    return _sec.token_hex(16)

def _safe_user(row: dict) -> dict:
    """Strip sensitive fields before returning to client."""
    return {k: v for k, v in row.items() if k not in ('password_hash', 'salt')}

async def _get_user_from_token(token: str, db) -> Optional[dict]:
    """Validate bearer token, return user row or None."""
    now = int(time.time() * 1000)
    async with db.execute(
        "SELECT t.user_id FROM auth_tokens t WHERE t.token = ? AND t.expires_at > ?",
        (token, now)
    ) as cur:
        t_row = await cur.fetchone()
    if not t_row:
        return None
    async with db.execute("SELECT * FROM users WHERE user_id = ?", (t_row[0],)) as cur:
        row = await cur.fetchone()
    return dict(row) if row else None

async def _require_auth(request: Request, db) -> dict:
    """Extract Bearer token from Authorization header, raise 401 if invalid."""
    auth = request.headers.get("Authorization", "")
    token = auth.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(401, "Authentication required")
    user = await _get_user_from_token(token, db)
    if not user:
        raise HTTPException(401, "Invalid or expired token")
    return user

def _owns_block(user: dict, owner_field: str) -> bool:
    """
    True if the authenticated `user` owns a resource whose stored owner string is
    `owner_field`. The owner field may be a wallet address or a user_id.
    """
    if owner_field is None:
        return False
    owner = str(owner_field).strip().lower()
    wallet = (user.get("wallet") or "").strip().lower()
    uid    = (user.get("user_id") or "").strip().lower()
    return owner != "" and (owner == wallet or owner == uid)

# ── Auth request models ────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email:    str
    password: str
    username: Optional[str] = None

class LoginRequest(BaseModel):
    email:    str
    password: str

class LinkWalletRequest(BaseModel):
    wallet: str

class GuestClaimRequest(BaseModel):
    """Guest user (created during purchase) sets a password to claim their account."""
    user_id:  str
    password: str
    email:    Optional[str] = None   # override if not set yet

class UpdateProfileRequest(BaseModel):
    username:     Optional[str] = None
    avatar_emoji: Optional[str] = None
    bio:          Optional[str] = None

# ── Auth endpoints ─────────────────────────────────────────────────────────────

@app.post("/auth/register")
@limiter.limit("5/minute")
async def register(req: RegisterRequest, request: Request):
    """Create a new account with email + password."""
    email = req.email.strip().lower()
    if not _re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', email):
        raise HTTPException(400, "Invalid email address")
    if len(req.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")

    now      = int(time.time() * 1000)
    user_id  = _make_user_id()
    salt     = _sec.token_hex(16)
    pw_hash  = _hash_password(req.password, salt)
    token    = _make_token()
    username = (req.username or email.split('@')[0])[:32]

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT user_id FROM users WHERE email = ?", (email,)) as cur:
            if await cur.fetchone():
                raise HTTPException(409, "An account with this email already exists")
        await db.execute(
            "INSERT INTO users (user_id, email, password_hash, salt, username, avatar_emoji, is_guest, created_at, last_seen) "
            "VALUES (?,?,?,?,?,'🌍',0,?,?)",
            (user_id, email, pw_hash, salt, username, now, now)
        )
        await db.execute(
            "INSERT INTO auth_tokens (token, user_id, created_at, expires_at, user_agent) VALUES (?,?,?,?,?)",
            (token, user_id, now, now + TOKEN_TTL_MS, request.headers.get("User-Agent","")[:200])
        )
        await db.commit()
        async with db.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)) as cur:
            row = dict(await cur.fetchone())

    return {"token": token, "user": _safe_user(row)}

# ── Telegram Mini App auth ────────────────────────────────────────────────────
# TON's Mini App surface identifies users via `initData`, a signed query string
# the Telegram client injects. The client-side `initDataUnsafe` object must NEVER
# be trusted for identity — only the HMAC-verified raw string below.

TELEGRAM_BOT_TOKEN          = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_INITDATA_MAX_AGE_S = int(os.environ.get("TELEGRAM_INITDATA_MAX_AGE", "86400"))

def _verify_telegram_init_data(init_data: str) -> Optional[dict]:
    """
    Verify Telegram Mini App initData (core.telegram.org/bots/webapps).

        data_check_string = all fields except `hash`, sorted by key,
                            rendered "key=value", joined with "\\n"
        secret_key        = HMAC_SHA256(key="WebAppData", message=<bot_token>)
        valid             = hex(HMAC_SHA256(secret_key, data_check_string)) == hash

    Note the key/message inversion in the secret_key step: the constant string
    "WebAppData" is the KEY and the bot token is the MESSAGE. Doing it the other
    way round is the single most common implementation bug and silently accepts
    nothing (or, worse, is copied from a blog post that has it backwards).

    Returns the parsed fields on success, None on any failure.
    """
    if not init_data or not TELEGRAM_BOT_TOKEN:
        return None
    from urllib.parse import parse_qsl
    try:
        fields = dict(parse_qsl(init_data, keep_blank_values=True, strict_parsing=True))
    except ValueError:
        return None

    received_hash = fields.pop("hash", None)
    if not received_hash:
        return None

    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(fields.items()))
    secret_key = hmac.new(b"WebAppData", TELEGRAM_BOT_TOKEN.encode(), hashlib.sha256).digest()
    expected   = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, received_hash):
        return None

    # Replay protection — reject stale payloads.
    try:
        auth_date = int(fields.get("auth_date", "0"))
    except ValueError:
        return None
    if TELEGRAM_INITDATA_MAX_AGE_S > 0 and (time.time() - auth_date) > TELEGRAM_INITDATA_MAX_AGE_S:
        return None

    return fields

class TelegramAuthRequest(BaseModel):
    init_data: str

@app.post("/auth/telegram")
@limiter.limit("20/minute")
async def auth_telegram(request: Request, req: TelegramAuthRequest):
    """
    Exchange a verified Telegram `initData` string for a CryptoLand session.
    Creates the account on first sight, keyed on the Telegram user id.
    """
    if not TELEGRAM_BOT_TOKEN:
        raise HTTPException(501, "Telegram auth not configured (TELEGRAM_BOT_TOKEN unset)")

    fields = _verify_telegram_init_data(req.init_data)
    if fields is None:
        raise HTTPException(401, "Invalid or expired Telegram initData")

    try:
        tg_user = json.loads(fields.get("user", "{}"))
    except (ValueError, TypeError):
        raise HTTPException(400, "Malformed Telegram user payload")

    # Telegram user ids can exceed 32 bits — keep them as int/str, never int32.
    tg_id = tg_user.get("id")
    if not tg_id:
        raise HTTPException(400, "Telegram payload missing user id")
    tg_key = f"tg:{tg_id}"

    username = (tg_user.get("username")
                or " ".join(filter(None, [tg_user.get("first_name"), tg_user.get("last_name")]))
                or f"tg{tg_id}")[:32]

    now   = int(time.time() * 1000)
    token = _make_token()

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        # `telegram_id` is stored in the wallet column's sibling — we key on a
        # dedicated column added idempotently at startup elsewhere; fall back to
        # matching on username-scoped id for older schemas.
        async with db.execute("SELECT * FROM users WHERE telegram_id = ?", (tg_key,)) as cur:
            row = await cur.fetchone()

        if row is None:
            user_id = _make_user_id()
            await db.execute(
                "INSERT INTO users (user_id, telegram_id, username, avatar_emoji, is_guest, created_at, last_seen) "
                "VALUES (?,?,?,'💎',0,?,?)",
                (user_id, tg_key, username, now, now)
            )
        else:
            user_id = row["user_id"]
            await db.execute("UPDATE users SET last_seen = ? WHERE user_id = ?", (now, user_id))

        await db.execute(
            "INSERT INTO auth_tokens (token, user_id, created_at, expires_at, user_agent) VALUES (?,?,?,?,?)",
            (token, user_id, now, now + TOKEN_TTL_MS, request.headers.get("User-Agent", "")[:200])
        )
        await db.commit()
        async with db.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)) as cur:
            row = dict(await cur.fetchone())

    return {"token": token, "user": _safe_user(row)}

@app.post("/auth/login")
@limiter.limit("10/minute")
async def login(req: LoginRequest, request: Request):
    """Authenticate with email + password, return token."""
    email = req.email.strip().lower()
    now   = int(time.time() * 1000)

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM users WHERE email = ?", (email,)) as cur:
            row = await cur.fetchone()

        if not row or not row["password_hash"]:
            raise HTTPException(401, "Invalid email or password")

        expected = _hash_password(req.password, row["salt"])
        if not hmac.compare_digest(expected, row["password_hash"]):
            raise HTTPException(401, "Invalid email or password")

        token = _make_token()
        await db.execute(
            "INSERT INTO auth_tokens (token, user_id, created_at, expires_at, user_agent) VALUES (?,?,?,?,?)",
            (token, row["user_id"], now, now + TOKEN_TTL_MS, request.headers.get("User-Agent","")[:200])
        )
        await db.execute("UPDATE users SET last_seen = ? WHERE user_id = ?", (now, row["user_id"]))
        await db.commit()

    return {"token": token, "user": _safe_user(dict(row))}

@app.get("/auth/me")
async def get_me(request: Request):
    """Return current user from Bearer token."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        user = await _require_auth(request, db)
    return _safe_user(user)

@app.post("/auth/logout")
async def logout(request: Request):
    """Invalidate current token."""
    auth  = request.headers.get("Authorization", "")
    token = auth.removeprefix("Bearer ").strip()
    if token:
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute("DELETE FROM auth_tokens WHERE token = ?", (token,))
            await db.commit()
    return {"ok": True}

@app.post("/auth/link-wallet")
async def link_wallet(req: LinkWalletRequest, request: Request):
    """Attach a wallet address to an authenticated account."""
    wallet = _norm_wallet(req.wallet)
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        user = await _require_auth(request, db)

        # Check wallet not already on another account
        async with db.execute("SELECT user_id FROM users WHERE wallet = ? AND user_id != ?", (wallet, user["user_id"])) as cur:
            if await cur.fetchone():
                raise HTTPException(409, "This wallet is already linked to another account")

        await db.execute("UPDATE users SET wallet = ?, last_seen = ? WHERE user_id = ?",
                         (wallet, int(time.time() * 1000), user["user_id"]))
        await db.commit()
        async with db.execute("SELECT * FROM users WHERE user_id = ?", (user["user_id"],)) as cur:
            row = dict(await cur.fetchone())

    return {"ok": True, "user": _safe_user(row)}

class WalletNonceRequest(BaseModel):
    wallet: str

async def _verify_wallet_ownership(wallet: str, signature: Optional[str], nonce: Optional[str], db) -> None:
    """
    Prove the caller controls `wallet` via a SIWE-style signed nonce.
    - If ALLOW_UNSIGNED_WALLET_AUTH is on (dev only) → skip verification entirely.
    - If eth-account is unavailable → 501 (never silently allow).
    - Otherwise the nonce must exist for this wallet, the signature must recover
      to `wallet` (case-insensitive), and the nonce is consumed (deleted) on use.
    Raises HTTPException on failure; returns None on success.
    """
    if ALLOW_UNSIGNED_WALLET_AUTH:
        return
    if not _ETH_ACCOUNT_AVAILABLE:
        raise HTTPException(501, "wallet signature verification unavailable")
    if not signature or not nonce:
        raise HTTPException(401, "signature and nonce required")

    async with db.execute(
        "SELECT rowid FROM wallet_nonces WHERE wallet = ? AND nonce = ?",
        (wallet, nonce)
    ) as cur:
        nonce_row = await cur.fetchone()
    if not nonce_row:
        raise HTTPException(401, "invalid or expired nonce")

    message   = _wallet_nonce_message(wallet, nonce)
    recovered = _recover_wallet(message, signature)
    if not recovered or recovered != wallet:
        raise HTTPException(401, "signature does not match wallet")

    # Consume the nonce (single use) regardless of downstream success.
    await db.execute("DELETE FROM wallet_nonces WHERE wallet = ? AND nonce = ?", (wallet, nonce))
    await db.commit()


@app.post("/auth/wallet/nonce")
@limiter.limit("20/minute")
async def wallet_nonce(req: WalletNonceRequest, request: Request):
    """Issue a random nonce for a wallet to sign (SIWE challenge). Returns {nonce, message}."""
    wallet = _norm_wallet(req.wallet)
    nonce  = _sec.token_hex(16)
    now    = int(time.time() * 1000)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO wallet_nonces (wallet, nonce, created_at) VALUES (?,?,?)",
            (wallet, nonce, now)
        )
        await db.commit()
    return {"nonce": nonce, "message": _wallet_nonce_message(wallet, nonce)}


class LinkWalletUpsertRequest(BaseModel):
    wallet:    str
    signature: Optional[str] = None
    nonce:     Optional[str] = None

@app.post("/auth/link-wallet-upsert")
@limiter.limit("20/minute")
async def link_wallet_upsert(req: LinkWalletUpsertRequest, request: Request):
    """
    Called when wallet connects but user has no email account yet.
    Creates a wallet-only account (or returns existing). Always returns {token, user}.

    SECURITY: requires proof of wallet ownership — a nonce (from /auth/wallet/nonce)
    signed via EVM personal_sign, passed as {signature, nonce}. Bypassable only when
    ALLOW_UNSIGNED_WALLET_AUTH is set (dev/test).
    """
    wallet = _norm_wallet(req.wallet)
    now    = int(time.time() * 1000)
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        await _verify_wallet_ownership(wallet, req.signature, req.nonce, db)
        async with db.execute("SELECT * FROM users WHERE wallet = ?", (wallet,)) as cur:
            row = await cur.fetchone()
        if row:
            user_id = dict(row)["user_id"]
            await db.execute("UPDATE users SET last_seen = ? WHERE wallet = ?", (now, wallet))
        else:
            user_id = _make_user_id()
            await db.execute(
                "INSERT INTO users (user_id, wallet, avatar_emoji, is_guest, created_at, last_seen) VALUES (?,?,'🌍',0,?,?)",
                (user_id, wallet, now, now)
            )
        # Always issue a fresh token
        token = _make_token()
        await db.execute(
            "INSERT INTO auth_tokens (token, user_id, created_at, expires_at, user_agent) VALUES (?,?,?,?,?)",
            (token, user_id, now, now + TOKEN_TTL_MS, request.headers.get("User-Agent", "")[:200])
        )
        await db.commit()
        async with db.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)) as cur:
            row = dict(await cur.fetchone())
    return {"token": token, "user": _safe_user(row)}

@app.post("/auth/guest-claim")
@limiter.limit("5/minute")
async def guest_claim(req: GuestClaimRequest, request: Request):
    """
    Guest user (created during purchase with just email) sets a password
    to convert their account from guest → full account.

    SECURITY: the caller must be authenticated as the exact guest account being
    claimed (its session token), and that account must still be a guest.
    """
    if len(req.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")

    now  = int(time.time() * 1000)
    salt = _sec.token_hex(16)
    pw_hash = _hash_password(req.password, salt)

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        caller = await _require_auth(request, db)
        if caller["user_id"] != req.user_id:
            raise HTTPException(403, "You can only claim your own guest account")
        async with db.execute("SELECT * FROM users WHERE user_id = ?", (req.user_id,)) as cur:
            row = await cur.fetchone()
        if not row:
            raise HTTPException(404, "Account not found")
        if not row["is_guest"]:
            raise HTTPException(403, "Account is not a guest account")

        updates = ["password_hash = ?", "salt = ?", "is_guest = 0", "last_seen = ?"]
        vals    = [pw_hash, salt, now]

        if req.email and not row["email"]:
            email = req.email.strip().lower()
            async with db.execute("SELECT user_id FROM users WHERE email = ? AND user_id != ?", (email, req.user_id)) as cur:
                if await cur.fetchone():
                    raise HTTPException(409, "Email already in use")
            updates.append("email = ?"); vals.append(email)

        vals.append(req.user_id)
        await db.execute(f"UPDATE users SET {', '.join(updates)} WHERE user_id = ?", vals)

        token = _make_token()
        await db.execute(
            "INSERT INTO auth_tokens (token, user_id, created_at, expires_at) VALUES (?,?,?,?)",
            (token, req.user_id, now, now + TOKEN_TTL_MS)
        )
        await db.commit()
        async with db.execute("SELECT * FROM users WHERE user_id = ?", (req.user_id,)) as cur:
            row = dict(await cur.fetchone())

    return {"token": token, "user": _safe_user(row)}

@app.patch("/auth/profile")
async def update_profile(req: UpdateProfileRequest, request: Request):
    """Update display name, avatar, bio."""
    now = int(time.time() * 1000)
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        user = await _require_auth(request, db)
        updates, vals = ["last_seen = ?"], [now]
        if req.username is not None:
            updates.append("username = ?"); vals.append(req.username[:32])
        if req.avatar_emoji is not None:
            updates.append("avatar_emoji = ?"); vals.append(req.avatar_emoji)
        if req.bio is not None:
            updates.append("bio = ?"); vals.append(req.bio[:200])
        vals.append(user["user_id"])
        await db.execute(f"UPDATE users SET {', '.join(updates)} WHERE user_id = ?", vals)
        await db.commit()
        async with db.execute("SELECT * FROM users WHERE user_id = ?", (user["user_id"],)) as cur:
            row = dict(await cur.fetchone())
    return _safe_user(row)

# ── Legacy wallet-only user endpoints (kept for backwards compat) ─────────────

class UserProfileRequest(BaseModel):
    wallet:       str
    username:     Optional[str] = None
    avatar_emoji: Optional[str] = None
    bio:          Optional[str] = None

class SessionRequest(BaseModel):
    session_id: str
    ref_code:   Optional[str] = None
    user_agent: Optional[str] = None

class BindWalletRequest(BaseModel):
    session_id: str
    wallet:     str
    signature:  Optional[str] = None
    nonce:      Optional[str] = None

@app.post("/users/upsert")
async def upsert_user(req: UserProfileRequest, request: Request):
    """Create or update a wallet-only user. Called when wallet connects."""
    wallet = _norm_wallet(req.wallet)
    now    = int(time.time() * 1000)
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM users WHERE wallet = ?", (wallet,)) as cur:
            existing = await cur.fetchone()
        if existing:
            updates, vals = [], []
            if req.username is not None:  updates.append("username = ?");     vals.append(req.username[:32])
            if req.avatar_emoji is not None: updates.append("avatar_emoji = ?"); vals.append(req.avatar_emoji)
            if req.bio is not None:        updates.append("bio = ?");          vals.append(req.bio[:200])
            updates.append("last_seen = ?"); vals.append(now)
            vals.append(wallet)
            await db.execute(f"UPDATE users SET {', '.join(updates)} WHERE wallet = ?", vals)
        else:
            user_id = _make_user_id()
            await db.execute(
                "INSERT INTO users (user_id, wallet, username, avatar_emoji, bio, is_guest, created_at, last_seen) VALUES (?,?,?,?,?,0,?,?)",
                (user_id, wallet, req.username, req.avatar_emoji or '🌍', req.bio, now, now)
            )
        await db.commit()
        async with db.execute("SELECT * FROM users WHERE wallet = ?", (wallet,)) as cur:
            row = await cur.fetchone()
    return _safe_user(dict(row))

@app.get("/users/{wallet}")
async def get_user(wallet: str):
    w = _norm_wallet(wallet)
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM users WHERE wallet = ?", (w,)) as cur:
            row = await cur.fetchone()
    if not row:
        raise HTTPException(404, "User not found")
    return _safe_user(dict(row))

async def _build_account_dashboard(db, wallet: Optional[str] = None, user_row: Optional[dict] = None) -> dict:
    """
    Build the full account dashboard for either a wallet address or a user row.
    Supports: wallet-only users, email users with linked wallet, email-only users.
    """
    # Resolve user row
    if user_row is None and wallet:
        w = _norm_wallet(wallet)
        async with db.execute("SELECT * FROM users WHERE wallet = ?", (w,)) as cur:
            r = await cur.fetchone()
        user_row = dict(r) if r else None
        # Also accept owner-field tiles (owner stored as wallet string)
        owner_key = w
    elif user_row:
        owner_key = user_row.get("wallet") or ""
    else:
        return {"user": None, "tiles": [], "guardians": [], "listings": [], "affiliate": {}}

    # Tiles: match by linked wallet OR by user_id stored in owner field
    tiles = []
    if owner_key:
        async with db.execute(
            "SELECT tile_key, tx, ty, country, color, price, chain, purchased_at, image_url, label FROM blocks WHERE LOWER(owner) = ?",
            (owner_key,)
        ) as cur:
            tiles = [dict(r) for r in await cur.fetchall()]

    # Guardians
    guardians = []
    if owner_key:
        async with db.execute(
            "SELECT tile_key, personality, xp FROM guardians WHERE LOWER(owner) = ?", (owner_key,)
        ) as cur:
            guardians = [dict(r) for r in await cur.fetchall()]

    # Affiliate: keyed by wallet or user_id
    aff_key  = owner_key or (user_row.get("user_id") if user_row else None)
    code_row = balance_row = None
    recent_refs = []
    if aff_key:
        async with db.execute("SELECT code FROM referral_codes WHERE wallet = ?", (aff_key,)) as cur:
            code_row = await cur.fetchone()
        async with db.execute("SELECT * FROM referral_balance WHERE wallet = ?", (aff_key,)) as cur:
            balance_row = await cur.fetchone()
        async with db.execute(
            "SELECT referee_wallet, tile_key, purchase_usd, commission_usd, status, created_at "
            "FROM referrals WHERE referrer_wallet = ? ORDER BY created_at DESC LIMIT 20",
            (aff_key,)
        ) as cur:
            recent_refs = [dict(r) for r in await cur.fetchall()]

    # Marketplace listings
    listings = []
    if owner_key:
        async with db.execute(
            "SELECT tile_key, price_usd, listed_at FROM marketplace WHERE LOWER(seller) = ? AND active = 1",
            (owner_key,)
        ) as cur:
            listings = [dict(r) for r in await cur.fetchall()]

    safe_user = _safe_user(user_row) if user_row else None
    return {
        "user":      safe_user,
        "tiles":     tiles,
        "guardians": guardians,
        "listings":  listings,
        "affiliate": {
            "code":         code_row["code"] if code_row else None,
            "balance_usd":  float(balance_row["balance_usd"]) if balance_row else 0.0,
            "total_earned": float(balance_row["total_earned"]) if balance_row else 0.0,
            "total_paid":   float(balance_row["total_paid"]) if balance_row else 0.0,
            "recent":       recent_refs,
        },
    }

@app.get("/account/me")
async def get_my_account(request: Request):
    """Full account dashboard for the authenticated user (email or wallet)."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        user = await _require_auth(request, db)
        return await _build_account_dashboard(db, user_row=dict(user))

@app.get("/account/{wallet}")
async def get_account_dashboard(wallet: str, request: Request):
    """
    Full account dashboard — wallet address lookup.
    SECURITY: requires auth and the requested wallet to match the caller's own
    wallet (this returns PII). Use /account/me for the token-based path.
    """
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        user = await _require_auth(request, db)
        if _norm_wallet(wallet) != _norm_wallet(user["wallet"] or ""):
            raise HTTPException(403, "Forbidden")
        return await _build_account_dashboard(db, wallet=wallet)

# ── Sessions ──────────────────────────────────────────────────────────────────

@app.post("/sessions")
async def create_session(req: SessionRequest, request: Request):
    """
    Called on first page load. Stores session_id + optional ref_code.
    IP is hashed — never stored in plaintext.
    """
    ip_raw   = request.client.host if request.client else "unknown"
    ip_hash  = hashlib.sha256(ip_raw.encode()).hexdigest()[:16]
    now      = int(time.time() * 1000)
    sid      = req.session_id

    # Validate session_id is UUID-ish (36 chars) to prevent injection
    if not sid or len(sid) > 64 or not _re.match(r'^[a-zA-Z0-9\-_]+$', sid):
        raise HTTPException(400, "Invalid session_id")

    async with aiosqlite.connect(DB_PATH) as db:
        # Upsert — second load with same session_id just updates last seen
        async with db.execute("SELECT session_id FROM sessions WHERE session_id = ?", (sid,)) as cur:
            existing = await cur.fetchone()
        if not existing:
            await db.execute(
                "INSERT INTO sessions (session_id, ip_hash, user_agent, ref_code, landed_at) VALUES (?,?,?,?,?)",
                (sid, ip_hash, (req.user_agent or "")[:256], req.ref_code, now)
            )
            await db.commit()
    return {"ok": True, "session_id": sid}

@app.post("/sessions/bind-wallet")
@limiter.limit("20/minute")
async def bind_wallet_to_session(req: BindWalletRequest, request: Request):
    """
    Called when a wallet connects. Links the session → wallet so anonymous
    referral tracking gets attributed to the now-known wallet.

    SECURITY: requires proof of wallet ownership (SIWE nonce + signature) before
    binding/creating the wallet account. Bypassable only when ALLOW_UNSIGNED_WALLET_AUTH.
    """
    wallet = _norm_wallet(req.wallet)
    now    = int(time.time() * 1000)
    async with aiosqlite.connect(DB_PATH) as db:
        await _verify_wallet_ownership(wallet, req.signature, req.nonce, db)
        await db.execute(
            "UPDATE sessions SET wallet = ?, wallet_bound_at = ? WHERE session_id = ?",
            (wallet, now, req.session_id)
        )
        await db.commit()

    # Auto-create user profile if not exists (must include user_id — it is the PK)
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("SELECT user_id FROM users WHERE wallet = ?", (wallet,)) as cur:
            u = await cur.fetchone()
        if not u:
            new_user_id = _make_user_id()
            await db.execute(
                "INSERT OR IGNORE INTO users (user_id, wallet, avatar_emoji, is_guest, created_at, last_seen) "
                "VALUES (?,?,?,0,?,?)",
                (new_user_id, wallet, '🌍', now, now)
            )
            await db.commit()

    return {"ok": True}

# ── Affiliate system ──────────────────────────────────────────────────────────

async def _upsert_affiliate_code(db, *, wallet: Optional[str] = None, user_id: Optional[str] = None) -> str:
    """
    Get or create a referral code for a user, keyed by user_id (preferred) or wallet.
    Code is deterministic: SHA-256 of the identity string, so it's stable across DB rebuilds.
    """
    identity = user_id or wallet
    if not identity:
        raise ValueError("user_id or wallet required")
    code = _make_ref_code(identity)
    now  = int(time.time() * 1000)

    # Check if user already has a code (by user_id or wallet)
    if user_id:
        async with db.execute("SELECT code FROM referral_codes WHERE user_id = ?", (user_id,)) as cur:
            row = await cur.fetchone()
    else:
        async with db.execute("SELECT code FROM referral_codes WHERE wallet = ?", (wallet,)) as cur:
            row = await cur.fetchone()

    if not row:
        # Also check if a wallet-keyed row exists for this user (legacy migration)
        if user_id and wallet:
            async with db.execute("SELECT code FROM referral_codes WHERE wallet = ?", (wallet,)) as cur:
                legacy = await cur.fetchone()
            if legacy:
                # Back-fill user_id onto existing wallet row
                await db.execute("UPDATE referral_codes SET user_id = ? WHERE wallet = ?", (user_id, wallet))
                await db.commit()
                return legacy["code"]
        # New row
        try:
            await db.execute(
                "INSERT INTO referral_codes (code, wallet, user_id, created_at) VALUES (?,?,?,?)",
                (code, wallet, user_id, now)
            )
            await db.commit()
        except Exception:
            pass  # unique constraint — another process beat us
    return row["code"] if row else code


@app.get("/affiliate/code/me")
async def get_affiliate_code_me(request: Request):
    """Token-authenticated: get or create affiliate code for the logged-in user."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        user = await _require_auth(request, db)
        code = await _upsert_affiliate_code(db, wallet=user["wallet"], user_id=user["user_id"])
    return {"code": code, "link": f"?ref={code}", "user_id": user["user_id"], "wallet": user["wallet"]}


@app.get("/affiliate/stats/me")
async def get_affiliate_stats_me(request: Request):
    """Token-authenticated: full affiliate stats for the logged-in user."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        user = await _require_auth(request, db)
        uid  = user["user_id"]
        w    = user["wallet"]

        async with db.execute(
            "SELECT * FROM referral_balance WHERE user_id = ? OR (user_id IS NULL AND wallet = ?)",
            (uid, w)
        ) as cur:
            bal = await cur.fetchone()

        # Look up this user's referral code
        async with db.execute(
            "SELECT code FROM referral_codes WHERE user_id = ? OR wallet = ?",
            (uid, w or "")
        ) as cur:
            code_row = await cur.fetchone()
        code = code_row["code"] if code_row else None

        referrals = []
        if code:
            async with db.execute(
                "SELECT referee_wallet, purchase_usd, commission_usd, created_at FROM referrals WHERE ref_code = ? ORDER BY created_at DESC LIMIT 20",
                (code,)
            ) as cur:
                referrals = [dict(r) for r in await cur.fetchall()]

        return {
            "code":           code,
            "balance_usd":    float(bal["balance_usd"])   if bal else 0.0,
            "total_earned":   float(bal["total_earned"])  if bal else 0.0,
            "total_paid":     float(bal["total_paid"])    if bal else 0.0,
            "referrals":      referrals,
        }


@app.get("/affiliate/code/{wallet}")
async def get_or_create_affiliate_code(wallet: str, request: Request):
    """
    Returns the affiliate code for a wallet, creating it if needed.
    Code is deterministic from wallet so it's always the same even if DB is lost.
    SECURITY: requires auth + wallet match (use /affiliate/code/me otherwise).
    """
    w    = _norm_wallet(wallet)
    now  = int(time.time() * 1000)
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        user = await _require_auth(request, db)
        if w != _norm_wallet(user["wallet"] or ""):
            raise HTTPException(403, "Forbidden")
        # Look up user_id for this wallet to associate properly
        async with db.execute("SELECT user_id FROM users WHERE wallet = ?", (w,)) as cur:
            u = await cur.fetchone()
        uid  = u["user_id"] if u else None
        code = await _upsert_affiliate_code(db, wallet=w, user_id=uid)
    return {
        "code":   code,
        "link":   f"?ref={code}",
        "wallet": w,
    }

@app.get("/affiliate/stats/{wallet}")
async def get_affiliate_stats(wallet: str, request: Request):
    """
    Full affiliate stats for a wallet — totals, recent referrals, leaderboard rank.
    SECURITY: requires auth + wallet match (use /affiliate/stats/me otherwise).
    """
    w = _norm_wallet(wallet)
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        user = await _require_auth(request, db)
        if w != _norm_wallet(user["wallet"] or ""):
            raise HTTPException(403, "Forbidden")

        # Balance
        async with db.execute("SELECT * FROM referral_balance WHERE wallet = ?", (w,)) as cur:
            bal = await cur.fetchone()

        # All referral events
        async with db.execute(
            "SELECT * FROM referrals WHERE referrer_wallet = ? ORDER BY created_at DESC",
            (w,)
        ) as cur:
            refs = [dict(r) for r in await cur.fetchall()]

        # Breakdown by status
        async with db.execute(
            "SELECT status, COUNT(*), SUM(commission_usd) FROM referrals WHERE referrer_wallet = ? GROUP BY status",
            (w,)
        ) as cur:
            rows = await cur.fetchall()
        by_status = {r[0]: {"count": r[1], "commission": r[2] or 0} for r in rows}

        # Leaderboard rank
        async with db.execute(
            "SELECT wallet, total_earned FROM referral_balance ORDER BY total_earned DESC"
        ) as cur:
            lb = await cur.fetchall()
        rank = next((i + 1 for i, r in enumerate(lb) if r[0] == w), None)

    return {
        "wallet":        w,
        "balance_usd":   float(bal["balance_usd"])  if bal else 0.0,
        "total_earned":  float(bal["total_earned"]) if bal else 0.0,
        "total_paid":    float(bal["total_paid"])   if bal else 0.0,
        "referrals":     refs,
        "by_status":     by_status,
        "leaderboard_rank": rank,
        "total_referrers":  len(lb),
    }

@app.get("/affiliate/leaderboard")
async def affiliate_leaderboard(limit: int = 20):
    """Top affiliates by total earnings."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT b.wallet, b.total_earned, b.balance_usd, u.username, u.avatar_emoji, COUNT(r.id) as total_refs "
            "FROM referral_balance b "
            "LEFT JOIN users u ON u.wallet = b.wallet "
            "LEFT JOIN referrals r ON r.referrer_wallet = b.wallet "
            "GROUP BY b.wallet ORDER BY b.total_earned DESC LIMIT ?",
            (min(limit, 100),)
        ) as cur:
            rows = await cur.fetchall()
    return [dict(r) for r in rows]

@app.get("/affiliate/validate/{code}")
async def validate_ref_code(code: str):
    """Check if a referral code is valid. Called on landing."""
    if not code or not _re.match(r'^LAND-[A-F0-9]{6}$', code.upper()):
        return {"valid": False}
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT wallet FROM referral_codes WHERE code = ?", (code.upper(),)
        ) as cur:
            row = await cur.fetchone()
    if not row:
        return {"valid": False}
    return {"valid": True, "referrer_wallet": row[0]}

# ── Referral redemption ───────────────────────────────────────────────────────

class RedemptionRequest(BaseModel):
    wallet:     str
    amount_usd: Optional[float] = None  # explicit amount, or None = redeem full balance
    amount:     Optional[float] = None  # alias (frontend may send either)
    tile_key:   Optional[str]   = None  # optional — set when used as purchase discount

@app.post("/affiliate/redeem")
@limiter.limit("10/minute")
async def redeem_referral_balance(req: RedemptionRequest, request: Request):
    """
    Redeem affiliate earnings. Two modes:
    1. Cash-out: no amount = full balance. tile_key optional.
    2. Purchase discount: tile_key + amount_usd.

    SECURITY: requires auth; the redeem always applies to the AUTHED user's own
    wallet/balance. A client-supplied wallet that differs from the caller's → 403.
    All arithmetic is in integer cents so the ledger doesn't drift.
    """
    now    = int(time.time() * 1000)

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        user   = await _require_auth(request, db)
        wallet = _norm_wallet(user["wallet"] or "")
        if not wallet:
            raise HTTPException(400, "Authenticated account has no wallet")
        # Reject client-supplied wallet that isn't the caller's own.
        if req.wallet and _norm_wallet(req.wallet) != wallet:
            raise HTTPException(403, "Can only redeem your own balance")

        async with db.execute("SELECT balance_usd FROM referral_balance WHERE wallet = ?", (wallet,)) as cur:
            bal = await cur.fetchone()

        current_cents = _to_cents(bal["balance_usd"]) if bal else 0

        # Resolve amount — support both field names, fallback to full balance
        req_amount = req.amount_usd if req.amount_usd is not None else req.amount
        if req_amount is None:
            redeem_cents = current_cents
        else:
            redeem_cents = _to_cents(req_amount)

        if redeem_cents <= 0:
            raise HTTPException(400, "Nothing to redeem")
        if redeem_cents > current_cents:
            raise HTTPException(
                400,
                f"Insufficient balance (have ${_from_cents(current_cents):.2f}, want ${_from_cents(redeem_cents):.2f})"
            )

        new_cents     = current_cents - redeem_cents
        redeem_amount = _from_cents(redeem_cents)
        new_balance   = _from_cents(new_cents)

        await db.execute(
            "UPDATE referral_balance SET balance_usd = ?, total_paid = total_paid + ?, updated_at = ? WHERE wallet = ?",
            (new_balance, redeem_amount, now, wallet)
        )
        await db.execute(
            "INSERT INTO referral_redemptions (wallet, tile_key, amount_usd, redeemed_at) VALUES (?,?,?,?)",
            (wallet, req.tile_key or "cashout", redeem_amount, now)
        )
        await db.commit()

    return {"ok": True, "redeemed_usd": redeem_amount, "new_balance_usd": new_balance}

# ── Guardian routes ───────────────────────────────────────────────────────────

class DeployGuardianRequest(BaseModel):
    tile_key:    str
    owner:       Optional[str] = None   # ignored — owner is derived from the tile's DB record
    personality: str = "balanced"
    budget:      float = 10.0

class UpgradeGuardianRequest(BaseModel):
    personality: Optional[str] = None
    budget:      Optional[float] = None

class RaidRequest(BaseModel):
    attacker_tile: str
    defender_tile: str
    raid_budget:   float = 5.0

async def _get_guardian_row(db, tile_key: str):
    async with db.execute(
        "SELECT * FROM guardians WHERE tile_key = ?", (tile_key,)
    ) as cur:
        return await cur.fetchone()

def _row_to_guardian(row) -> dict:
    g = dict(row)
    return compute_stats(g)

@app.get("/guardian/personalities")
async def get_personalities():
    """List available guardian personalities with stats."""
    return PERSONALITIES

@app.get("/guardian/{tile_key:path}")
async def get_guardian(tile_key: str):
    """Get a tile's guardian with computed stats. 404 if no guardian deployed."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        row = await _get_guardian_row(db, tile_key)
    if not row:
        raise HTTPException(404, "No guardian deployed on this tile")
    return _row_to_guardian(row)

@app.post("/guardian")
async def deploy_guardian(req: DeployGuardianRequest, request: Request):
    """
    Deploy or reconfigure a guardian on an owned tile.
    SECURITY: requires auth; the tile's DB owner must be the authenticated user.
    The client-supplied `owner` field is ignored for authorization.
    """
    if req.personality not in PERSONALITIES:
        raise HTTPException(400, f"Unknown personality: {req.personality}")
    if req.budget < 1:
        raise HTTPException(400, "Minimum budget is $1")

    now_ms = int(time.time() * 1000)
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        user = await _require_auth(request, db)
        # Verify tile is owned by the authenticated user (compare against DB owner)
        async with db.execute(
            "SELECT owner FROM blocks WHERE tile_key = ?", (req.tile_key,)
        ) as cur:
            block = await cur.fetchone()
        if not block:
            raise HTTPException(404, "Tile not found — purchase it first")
        if not _owns_block(user, block["owner"]):
            raise HTTPException(403, "You don't own this tile")
        guardian_owner = block["owner"]

        existing = await _get_guardian_row(db, req.tile_key)
        if existing:
            # Keep existing XP when reconfiguring
            await db.execute("""
                UPDATE guardians
                SET personality = ?, budget = ?, updated_at = ?
                WHERE tile_key = ?
            """, (req.personality, req.budget, now_ms, req.tile_key))
        else:
            await db.execute("""
                INSERT INTO guardians (tile_key, owner, personality, budget, xp, deployed_at, updated_at)
                VALUES (?, ?, ?, ?, 0, ?, ?)
            """, (req.tile_key, guardian_owner, req.personality, req.budget, now_ms, now_ms))

        await db.commit()
        db.row_factory = aiosqlite.Row
        row = await _get_guardian_row(db, req.tile_key)

    print(f"[Guardian] Deployed on {req.tile_key} → {req.personality} budget=${req.budget}")
    return _row_to_guardian(row)

@app.delete("/guardian/{tile_key:path}")
async def remove_guardian(tile_key: str, request: Request):
    """
    Remove a guardian from a tile.
    SECURITY: requires auth; only the tile's DB owner may remove its guardian.
    """
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        user = await _require_auth(request, db)
        row = await _get_guardian_row(db, tile_key)
        if not row:
            raise HTTPException(404, "No guardian on this tile")
        # Verify ownership against the block's real DB owner.
        async with db.execute("SELECT owner FROM blocks WHERE tile_key = ?", (tile_key,)) as cur:
            block = await cur.fetchone()
        owner_field = block["owner"] if block else dict(row)["owner"]
        if not _owns_block(user, owner_field):
            raise HTTPException(403, "You don't own this guardian")
        await db.execute("DELETE FROM guardians WHERE tile_key = ?", (tile_key,))
        await db.commit()
    return {"ok": True, "tile_key": tile_key}

@app.get("/guardian-report")
async def get_guardian_report(tile_key: str, days: int = 3):
    """Get simulated daily activity reports for the last N days."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        row = await _get_guardian_row(db, tile_key)
    if not row:
        raise HTTPException(404, "No guardian deployed on this tile")
    guardian = dict(row)
    reports = [generate_daily_report(guardian, day_offset=i) for i in range(min(days, 7))]
    return reports

@app.post("/guardian/raid")
async def perform_raid(req: RaidRequest):
    """
    Execute a raid: attacker_tile guardian attacks defender_tile.
    Requires attacker tile to have a guardian.
    Returns raid result + updated XP for both sides.
    """
    if req.attacker_tile == req.defender_tile:
        raise HTTPException(400, "Cannot raid your own tile")
    if req.raid_budget < 1:
        raise HTTPException(400, "Minimum raid budget is $1")

    now_ms = int(time.time() * 1000)

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row

        # Load attacker guardian
        atk_row = await _get_guardian_row(db, req.attacker_tile)
        if not atk_row:
            raise HTTPException(404, "Deploy a guardian on your tile before raiding")

        # Load defender guardian (optional)
        def_row = await _get_guardian_row(db, req.defender_tile)

        attacker_g  = dict(atk_row)
        defender_g  = dict(def_row) if def_row else None

        # Resolve raid
        raid_result = resolve_raid(attacker_g, defender_g, req.defender_tile, req.raid_budget)

        # Apply XP to attacker
        new_atk_xp = attacker_g.get("xp", 0) + raid_result["xp_gain"]
        await db.execute(
            "UPDATE guardians SET xp = ?, updated_at = ? WHERE tile_key = ?",
            (new_atk_xp, now_ms, req.attacker_tile)
        )

        # Apply XP to defender (if guarded)
        def_xp_gain = 0
        if defender_g:
            def_result  = resolve_defense(defender_g, raid_result["atk_roll"], req.attacker_tile)
            def_xp_gain = def_result["xp_gain"]
            new_def_xp  = defender_g.get("xp", 0) + def_xp_gain
            await db.execute(
                "UPDATE guardians SET xp = ?, updated_at = ? WHERE tile_key = ?",
                (new_def_xp, now_ms, req.defender_tile)
            )

        # Log the raid
        await db.execute("""
            INSERT INTO raid_log
            (attacker_tile, defender_tile, attacker_wins, yield_stolen,
             atk_roll, def_roll, margin_pct, message, timestamp_ms)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            req.attacker_tile, req.defender_tile,
            int(raid_result["attacker_wins"]),
            raid_result["yield_stolen"],
            raid_result["atk_roll"], raid_result["def_roll"],
            raid_result["margin_pct"], raid_result["message"],
            now_ms,
        ))
        await db.commit()

    print(f"[Raid] {req.attacker_tile} → {req.defender_tile} | win={raid_result['attacker_wins']} yield={raid_result['yield_stolen']}")
    return {
        **raid_result,
        "attacker_xp_gain": raid_result["xp_gain"],
        "defender_xp_gain": def_xp_gain,
    }

@app.get("/guardian-raids")
async def get_raid_history(tile_key: str, limit: int = 10):
    """Recent raid history for a tile (as attacker or defender)."""
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("""
            SELECT * FROM raid_log
            WHERE attacker_tile = ? OR defender_tile = ?
            ORDER BY timestamp_ms DESC LIMIT ?
        """, (tile_key, tile_key, min(limit, 50))) as cur:
            rows = await cur.fetchall()
    cols = ["id","attacker_tile","defender_tile","attacker_wins","yield_stolen",
            "atk_roll","def_roll","margin_pct","message","timestamp_ms"]
    return [dict(zip(cols, r)) for r in rows]

@app.get("/guardian-profile")
async def get_territory_profile(tile_key: str):
    """
    Phase 3: Internal territory analysis — strategic score, risk, ad suggestions.
    """
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM blocks WHERE tile_key = ?", (tile_key,)) as cur:
            block = await cur.fetchone()
        if not block:
            raise HTTPException(404, "Block not found")
        b = dict(block)

        # Count owned blocks in a ~5-tile radius
        tx, ty = b["tx"], b["ty"]
        async with db.execute("""
            SELECT COUNT(*) FROM blocks
            WHERE tx BETWEEN ? AND ? AND ty BETWEEN ? AND ? AND tile_key != ?
        """, (tx - 5, tx + 5, ty - 5, ty + 5, tile_key)) as cur:
            nearby_row = await cur.fetchone()
        blocks_nearby = nearby_row[0] if nearby_row else 0

    profile = analyze_territory(
        tile_key=tile_key,
        tx=b["tx"], ty=b["ty"],
        country=b.get("country", ""),
        label=b.get("label"),
        image_url=b.get("image_url"),
        price=float(b["price"]),
        blocks_nearby=blocks_nearby,
    )
    return profile

@app.get("/guardians/summary")
async def get_guardians_summary():
    """List all deployed guardians (for map display — tile_key + personality only)."""
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT tile_key, personality, xp FROM guardians"
        ) as cur:
            rows = await cur.fetchall()
    return [
        {
            "tile_key":    r[0],
            "personality": r[1],
            "level":       level_from_xp(r[2]),
        }
        for r in rows
    ]

# ── Dynamic Pricing API ───────────────────────────────────────────────────────

@app.get("/price-events")
async def list_price_events():
    """All active price events — for the MarketSidebar news feed."""
    events = await get_all_active_events()
    return events

@app.get("/news")
async def list_news():
    """Latest crypto + real estate headlines from RSS feeds."""
    return await get_news()

@app.post("/news/refresh")
async def force_news_refresh():
    await refresh_news()
    return {"ok": True}

@app.get("/alerts")
async def list_alerts():
    """All signals as dramatic event alerts for the market sidebar."""
    events = await get_all_active_events()
    news   = await get_news()
    return build_event_alerts(events, news)

@app.get("/tile-price-context")
async def tile_price_context(tile_key: str, country: str = "Unknown", base_price: float = 12.0):
    """
    Returns dynamic multiplier + breakdown for a specific tile.
    Used by PurchasePanel for unowned tiles.
    """
    events = await get_events_for_tile(tile_key, country)
    multiplier = compute_final_multiplier(events)
    final_price = round(base_price * multiplier, 2)
    return {
        "tile_key":    tile_key,
        "country":     country,
        "base_price":  base_price,
        "multiplier":  multiplier,
        "final_price": final_price,
        "delta_pct":   round((multiplier - 1.0) * 100, 2),
        "events":      events,
    }

# ── NFT mint record ───────────────────────────────────────────────────────────

class NFTMintRecord(BaseModel):
    tile_key: str
    tx_hash:  str
    token_id: str
    chain:    str = "unknown"
    owner:    str

@app.post("/nft/mint")
async def record_nft_mint(data: NFTMintRecord):
    """Record an on-chain NFT mint after payment confirmation."""
    now = int(time.time() * 1000)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            INSERT OR REPLACE INTO nft_mints (tile_key, token_id, tx_hash, chain, owner, minted_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (data.tile_key, data.token_id, data.tx_hash, data.chain, data.owner, now))
        await db.commit()
    return {"ok": True, "tile_key": data.tile_key, "tx_hash": data.tx_hash}

@app.get("/nft/{tile_key:path}")
async def get_nft_info(tile_key: str):
    """Return on-chain NFT info for a tile (if minted)."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM nft_mints WHERE tile_key = ?", (tile_key,)) as cur:
            row = await cur.fetchone()
    if not row:
        return {"minted": False}
    return {"minted": True, **dict(row)}

# ── Marketplace ────────────────────────────────────────────────────────────────

class MarketListing(BaseModel):
    tile_key:  str
    seller:    str
    price_usd: float
    chain:     Optional[str] = None
    token_id:  Optional[str] = None

@app.get("/marketplace")
async def list_marketplace(limit: int = 50, offset: int = 0):
    """All active marketplace listings."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("""
            SELECT m.*, b.country, b.color, b.owner as block_owner, b.image_url, b.label
            FROM marketplace m
            LEFT JOIN blocks b ON b.tile_key = m.tile_key
            WHERE m.active = 1
            ORDER BY m.listed_at DESC
            LIMIT ? OFFSET ?
        """, (limit, offset)) as cur:
            rows = await cur.fetchall()
    return [dict(r) for r in rows]

@app.post("/marketplace/list")
async def create_listing(data: MarketListing, request: Request):
    """
    List a tile for sale on the marketplace.
    SECURITY: requires auth; the caller must be the tile's DB owner. The stored
    seller is the caller's identity — a client-supplied seller that differs → 403.
    """
    now = int(time.time() * 1000)
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        user = await _require_auth(request, db)
        async with db.execute("SELECT owner FROM blocks WHERE tile_key = ?", (data.tile_key,)) as cur:
            block = await cur.fetchone()
        if not block:
            raise HTTPException(404, "Tile not found")
        # Caller must own the tile in the DB.
        if not _owns_block(user, block["owner"]):
            raise HTTPException(403, "Not tile owner")
        # A supplied seller that isn't the caller's own identity is rejected.
        if data.seller and not _owns_block(user, data.seller):
            raise HTTPException(403, "seller must be your own identity")
        seller = block["owner"]   # authoritative — the real DB owner
        await db.execute("""
            INSERT OR REPLACE INTO marketplace (tile_key, seller, price_usd, chain, token_id, listed_at, active)
            VALUES (?, ?, ?, ?, ?, ?, 1)
        """, (data.tile_key, seller, data.price_usd, data.chain, data.token_id, now))
        await db.commit()
    return {"ok": True, "tile_key": data.tile_key, "price_usd": data.price_usd}

@app.delete("/marketplace/{tile_key:path}")
async def remove_listing(tile_key: str, request: Request):
    """
    Remove a marketplace listing.
    SECURITY: requires auth; the caller must be the listing's seller (which is the
    tile's DB owner). Authorization is checked against the caller's identity, not
    a client-supplied seller param.
    """
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        user = await _require_auth(request, db)
        async with db.execute("SELECT seller FROM marketplace WHERE tile_key = ? AND active = 1", (tile_key,)) as cur:
            row = await cur.fetchone()
        if not row:
            raise HTTPException(404, "Listing not found")
        if not _owns_block(user, row["seller"]):
            raise HTTPException(403, "Not listing owner")
        await db.execute("UPDATE marketplace SET active = 0 WHERE tile_key = ?", (tile_key,))
        await db.commit()
    return {"ok": True}

@app.get("/marketplace/stats")
async def marketplace_stats():
    """Aggregate marketplace statistics."""
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("SELECT COUNT(*), SUM(price_usd), AVG(price_usd) FROM marketplace WHERE active = 1") as cur:
            count, total, avg = await cur.fetchone()
    return {"listings": count or 0, "total_value": round(total or 0, 2), "avg_price": round(avg or 0, 2)}

# ── Analytics ──────────────────────────────────────────────────────────────────

class AnalyticsEvent(BaseModel):
    event:      str
    session_id: Optional[str] = None
    wallet:     Optional[str] = None
    tile_key:   Optional[str] = None
    properties: Optional[dict] = None

@app.post("/analytics/event")
async def track_event(data: AnalyticsEvent):
    """Ingest a frontend analytics event."""
    import json
    now = int(time.time() * 1000)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            INSERT INTO analytics_events (event, session_id, wallet, tile_key, properties, ts)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (data.event, data.session_id, data.wallet, data.tile_key,
              json.dumps(data.properties) if data.properties else None, now))
        await db.commit()
    return {"ok": True}

@app.get("/analytics/funnel")
async def analytics_funnel():
    """Conversion funnel: page view → tile click → payment start → confirmed."""
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("SELECT event, COUNT(*) as n FROM analytics_events GROUP BY event ORDER BY n DESC") as cur:
            rows = await cur.fetchall()
    events = {row[0]: row[1] for row in rows}
    funnel = [
        {"step": "Page Views",       "count": events.get("page_view", 0)},
        {"step": "Tile Clicks",       "count": events.get("tile_click", 0)},
        {"step": "Purchase Opens",    "count": events.get("purchase_open", 0)},
        {"step": "Payments Started",  "count": events.get("payment_start", 0)},
        {"step": "Payments Confirmed","count": events.get("payment_confirmed", 0)},
    ]
    return {"funnel": funnel, "all_events": events}

# ── Grant metrics ─────────────────────────────────────────────────────────────
# Nearly every grant program in documentation/grants.md is metrics-aware:
# retroactive rounds (Optimism RetroPGF, Avalanche Retro9000) score measurable
# on-chain impact; traction-gated grants (Aptos, Starknet Growth, MultiversX,
# SafePal, BNB MVB) ask for DAU/MAU/retention/tx counts. This endpoint produces
# those numbers in one call so an application can cite real data instead of
# estimates. Read-only and safe to expose; it aggregates, never returns PII.

@app.get("/metrics/grant")
async def grant_metrics(days: int = 30):
    """
    Aggregate traction metrics for grant applications.

    days — trailing window for the activity timeseries (1..365, default 30).
    Returns DAU/WAU/MAU, retention, purchase + volume totals, a per-chain
    breakdown (the multichain story), and engagement depth.
    """
    days = max(1, min(int(days), 365))
    now_ms = int(time.time() * 1000)
    day_ms = 86_400_000
    window_start = now_ms - days * day_ms

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row

        async def scalar(sql, args=()):
            async with db.execute(sql, args) as cur:
                row = await cur.fetchone()
            return (row[0] if row and row[0] is not None else 0)

        # ── Active users. Prefer wallet identity, fall back to session id, so
        # the count is meaningful before wallets are connected.
        actor = "COALESCE(NULLIF(wallet,''), session_id)"
        dau = await scalar(
            f"SELECT COUNT(DISTINCT {actor}) FROM analytics_events WHERE ts >= ?",
            (now_ms - day_ms,))
        wau = await scalar(
            f"SELECT COUNT(DISTINCT {actor}) FROM analytics_events WHERE ts >= ?",
            (now_ms - 7 * day_ms,))
        mau = await scalar(
            f"SELECT COUNT(DISTINCT {actor}) FROM analytics_events WHERE ts >= ?",
            (now_ms - 30 * day_ms,))

        # ── Daily activity timeseries over the window.
        async with db.execute(f"""
            SELECT CAST((? - ts) / ? AS INTEGER) AS days_ago,
                   COUNT(DISTINCT {actor})       AS actives,
                   COUNT(*)                      AS events
            FROM analytics_events
            WHERE ts >= ?
            GROUP BY days_ago ORDER BY days_ago
        """, (now_ms, day_ms, window_start)) as cur:
            ts_rows = await cur.fetchall()
        timeseries = [
            {"days_ago": r["days_ago"], "active_users": r["actives"], "events": r["events"]}
            for r in ts_rows
        ]

        # ── Retention: of the actors first seen 7+ days ago, how many returned
        # at least 24h after their first event.
        async with db.execute(f"""
            SELECT {actor} AS a, MIN(ts) AS first_ts, MAX(ts) AS last_ts
            FROM analytics_events
            WHERE {actor} IS NOT NULL
            GROUP BY a
        """) as cur:
            cohort = await cur.fetchall()
        eligible = [r for r in cohort if r["first_ts"] <= now_ms - day_ms]
        returned_d1 = [r for r in eligible if r["last_ts"] - r["first_ts"] >= day_ms]
        eligible_7 = [r for r in cohort if r["first_ts"] <= now_ms - 7 * day_ms]
        returned_d7 = [r for r in eligible_7 if r["last_ts"] - r["first_ts"] >= 7 * day_ms]
        def pct(num, den):
            return round(100.0 * len(num) / len(den), 1) if den else 0.0

        # ── Economy / on-chain-relevant totals.
        total_tiles   = await scalar("SELECT COUNT(*) FROM blocks")
        total_owners  = await scalar("SELECT COUNT(DISTINCT owner) FROM blocks")
        total_volume  = await scalar("SELECT SUM(price) FROM blocks")
        window_tiles  = await scalar("SELECT COUNT(*) FROM blocks WHERE purchased_at >= ?", (window_start,))
        window_volume = await scalar("SELECT SUM(price) FROM blocks WHERE purchased_at >= ?", (window_start,))
        nft_mints     = await scalar("SELECT COUNT(*) FROM nft_mints")

        # ── Per-chain breakdown — the multichain deployment story funders want.
        async with db.execute("""
            SELECT chain,
                   COUNT(*)               AS tiles,
                   COUNT(DISTINCT owner)  AS owners,
                   COALESCE(SUM(price),0) AS volume
            FROM blocks GROUP BY chain ORDER BY tiles DESC
        """) as cur:
            chain_rows = await cur.fetchall()
        by_chain = [
            {"chain": r["chain"], "tiles": r["tiles"], "owners": r["owners"],
             "volume_usd": round(r["volume"], 2)}
            for r in chain_rows
        ]

        # ── Engagement depth (shows it's a game, not a mint).
        guardians = await scalar("SELECT COUNT(*) FROM guardians")
        accounts  = await scalar("SELECT COUNT(*) FROM users")

    return {
        "generated_at": now_ms,
        "window_days":  days,
        "users": {
            "dau": dau, "wau": wau, "mau": mau,
            "registered_accounts": accounts,
            "retention_d1_pct": pct(returned_d1, eligible),
            "retention_d7_pct": pct(returned_d7, eligible_7),
        },
        "economy": {
            "tiles_sold_total":   total_tiles,
            "unique_owners":      total_owners,
            "volume_usd_total":   round(total_volume, 2),
            "tiles_sold_window":  window_tiles,
            "volume_usd_window":  round(window_volume, 2),
            "nft_mints_onchain":  nft_mints,
        },
        "by_chain":   by_chain,
        "engagement": {"guardians_deployed": guardians},
        "timeseries": timeseries,
    }

# ── DAO ────────────────────────────────────────────────────────────────────────

class DAOProposal(BaseModel):
    id:      Optional[str] = None
    title:   str
    body:    str
    author:  str
    ends_at: int   # unix ms

class DAOVote(BaseModel):
    proposal_id: str
    voter:       Optional[str] = None   # ignored — voter is the authenticated user
    vote:        str   # 'for' | 'against'
    weight:      int = 1                 # ignored — weight is computed server-side

@app.get("/dao/proposals")
async def list_proposals(status: str = "active"):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM dao_proposals WHERE status = ? ORDER BY created_at DESC", (status,)
        ) as cur:
            rows = await cur.fetchall()
    return [dict(r) for r in rows]

@app.post("/dao/proposals")
async def create_proposal(data: DAOProposal):
    import uuid
    pid = data.id or str(uuid.uuid4())[:8]
    now = int(time.time() * 1000)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            INSERT INTO dao_proposals (id, title, body, author, created_at, ends_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (pid, data.title, data.body, data.author, now, data.ends_at))
        await db.commit()
    return {"ok": True, "id": pid}

@app.post("/dao/vote")
async def cast_vote(data: DAOVote, request: Request):
    """
    Cast a DAO vote.
    SECURITY: requires auth. The voter is the authenticated user; client-supplied
    `voter` and `weight` are ignored. Weight is computed server-side as the number
    of tiles the caller owns (minimum 1).
    """
    if data.vote not in ("for", "against"):
        raise HTTPException(400, "vote must be 'for' or 'against'")
    now = int(time.time() * 1000)
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        user  = await _require_auth(request, db)
        voter = _norm_wallet(user["wallet"]) if user.get("wallet") else user["user_id"]
        # Weight = number of tiles owned by this user (by wallet or user_id), min 1.
        async with db.execute(
            "SELECT COUNT(*) FROM blocks WHERE LOWER(owner) = ? OR LOWER(owner) = ?",
            (voter, (user.get("user_id") or "").lower())
        ) as cur:
            owned = (await cur.fetchone())[0] or 0
        weight = max(1, owned)
        # Upsert vote
        await db.execute("""
            INSERT OR REPLACE INTO dao_votes (proposal_id, voter, vote, weight, voted_at)
            VALUES (?, ?, ?, ?, ?)
        """, (data.proposal_id, voter, data.vote, weight, now))
        # Recount
        async with db.execute(
            "SELECT vote, SUM(weight) FROM dao_votes WHERE proposal_id = ? GROUP BY vote",
            (data.proposal_id,)
        ) as cur:
            counts = {row[0]: row[1] for row in await cur.fetchall()}
        await db.execute("""
            UPDATE dao_proposals SET votes_for = ?, votes_against = ? WHERE id = ?
        """, (counts.get("for", 0), counts.get("against", 0), data.proposal_id))
        await db.commit()
    return {"ok": True, "votes_for": counts.get("for", 0), "votes_against": counts.get("against", 0)}

@app.get("/dao/votes/{proposal_id}")
async def get_votes(proposal_id: str):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM dao_votes WHERE proposal_id = ?", (proposal_id,)) as cur:
            rows = await cur.fetchall()
    return [dict(r) for r in rows]

# ── Token staking (off-chain ledger, pre-TGE) ─────────────────────────────────

@app.get("/token/staking/{wallet}")
async def get_staking(wallet: str):
    """Get staking balance and pending yield for a wallet."""
    async with aiosqlite.connect(DB_PATH) as db:
        # Count tiles owned by this wallet
        async with db.execute(
            "SELECT COUNT(*), SUM(price) FROM blocks WHERE LOWER(owner) = LOWER(?)", (wallet,)
        ) as cur:
            count, volume = await cur.fetchone()
        # Guardian yield
        async with db.execute(
            "SELECT SUM(budget * 0.05) FROM guardians WHERE LOWER(owner) = LOWER(?)", (wallet,)
        ) as cur:
            guardian_yield = (await cur.fetchone())[0] or 0
    tiles      = count or 0
    tile_stake = tiles * 100   # 100 $CLND per owned tile
    yield_clnd = round(guardian_yield, 2)
    return {
        "wallet":       wallet,
        "tiles_owned":  tiles,
        "stake_clnd":   tile_stake,
        "pending_yield": yield_clnd,
        "apy_estimate": "12-18%",
        "note":         "Pre-TGE: balances are off-chain. Token launch pending audit."
    }

# ── Signal Feed ───────────────────────────────────────────────────────────────

# City bounding boxes for "almost owned" scarcity signals
# [name, flag, lng_min, lng_max, lat_min, lat_max, total_tiles_approx]
_CITY_BOXES = [
    ("Manhattan",       "🗽", -74.02, -73.93, 40.70, 40.85,  120),
    ("Central London",  "🇬🇧", -0.20,   0.00, 51.48, 51.55,  100),
    ("Central Paris",   "🇫🇷",  2.28,   2.42, 48.82, 48.91,   80),
    ("Central Tokyo",   "🇯🇵", 139.69, 139.80, 35.65, 35.72,   90),
    ("Central Seoul",   "🇰🇷", 126.96, 127.05, 37.53, 37.58,   60),
    ("Singapore",       "🇸🇬", 103.80, 104.00,  1.25,  1.40,   70),
    ("Dubai Marina",    "🇦🇪",  55.12,  55.20, 25.07, 25.12,   50),
    ("São Paulo Centro","🇧🇷", -46.68, -46.60, -23.56,-23.52,  60),
    ("Sydney CBD",      "🇦🇺", 151.19, 151.23, -33.89,-33.85,  50),
    ("Bangkok Central", "🇹🇭", 100.49, 100.54,  13.72,  13.77,  60),
    ("Warsaw Centre",   "🇵🇱",  20.99,  21.05, 52.22,  52.27,  50),
    ("Istanbul Centre", "🇹🇷",  28.95,  29.02, 41.00,  41.04,  55),
    ("Mumbai CST",      "🇮🇳",  72.82,  72.88, 18.93,  18.98,  55),
    ("Lagos Island",    "🇳🇬",   3.39,   3.45,  6.42,   6.47,  45),
    ("Manila",          "🇵🇭", 120.96, 121.02, 14.57,  14.62,  55),
]

# Country flag lookup
_FLAGS = {
    "United States": "🇺🇸", "United Kingdom": "🇬🇧", "France": "🇫🇷",
    "Germany": "🇩🇪", "Japan": "🇯🇵", "South Korea": "🇰🇷", "China": "🇨🇳",
    "Australia": "🇦🇺", "Canada": "🇨🇦", "Brazil": "🇧🇷", "India": "🇮🇳",
    "Singapore": "🇸🇬", "UAE": "🇦🇪", "Poland": "🇵🇱", "Turkey": "🇹🇷",
    "Philippines": "🇵🇭", "Indonesia": "🇮🇩", "Thailand": "🇹🇭", "Vietnam": "🇻🇳",
    "Mexico": "🇲🇽", "Argentina": "🇦🇷", "Nigeria": "🇳🇬", "South Africa": "🇿🇦",
    "Egypt": "🇪🇬", "Pakistan": "🇵🇰", "Bangladesh": "🇧🇩", "Russia": "🇷🇺",
    "Ukraine": "🇺🇦", "Romania": "🇷🇴", "Greece": "🇬🇷", "Spain": "🇪🇸",
    "Italy": "🇮🇹", "Netherlands": "🇳🇱", "Sweden": "🇸🇪", "Norway": "🇳🇴",
    "Switzerland": "🇨🇭", "Belgium": "🇧🇪", "Israel": "🇮🇱", "Saudi Arabia": "🇸🇦",
    "Qatar": "🇶🇦", "Kazakhstan": "🇰🇿", "Malaysia": "🇲🇾", "Unknown": "🌍",
}

_FLAGS_SHORT = {
    "US": "🇺🇸", "UK": "🇬🇧", "FR": "🇫🇷", "DE": "🇩🇪", "JP": "🇯🇵",
    "KR": "🇰🇷", "CN": "🇨🇳", "AU": "🇦🇺", "CA": "🇨🇦", "BR": "🇧🇷",
    "IN": "🇮🇳", "SG": "🇸🇬", "AE": "🇦🇪", "PL": "🇵🇱", "TR": "🇹🇷",
    "PH": "🇵🇭", "ID": "🇮🇩", "TH": "🇹🇭", "VN": "🇻🇳", "MX": "🇲🇽",
    "AR": "🇦🇷", "NG": "🇳🇬", "ZA": "🇿🇦", "EG": "🇪🇬", "RU": "🇷🇺",
    "UA": "🇺🇦", "ES": "🇪🇸", "IT": "🇮🇹", "NL": "🇳🇱", "SE": "🇸🇪",
}

def _flag(country: str) -> str:
    return _FLAGS.get(country) or _FLAGS_SHORT.get(country.upper()) or "🌍"

def _shorten(owner: str) -> str:
    if owner.startswith("0x") and len(owner) > 12:
        return f"{owner[:6]}…{owner[-4:]}"
    return owner

@app.get("/feed/signals")
async def feed_signals():
    """
    Composite signal feed for the live ticker.
    Returns a list of signal objects ready to render.
    Signal types: purchase, country_war, scarcity, milestone,
                  price_surge, streak, affiliate
    """
    now_ms  = int(time.time() * 1000)
    hour_ms = 3_600_000
    day_ms  = 86_400_000

    signals = []

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row

        # ── 1. Recent purchases (kept to 10–15% of feed) ─────────────────────
        async with db.execute(
            "SELECT tile_key, owner, country, price, purchased_at, color FROM blocks "
            "ORDER BY purchased_at DESC LIMIT 4"
        ) as cur:
            recent = await cur.fetchall()
        for r in recent:
            signals.append({
                "type":    "purchase",
                "icon":    _flag(r["country"]),
                "text":    f"{_shorten(r['owner'])} claimed {r['country']}",
                "sub":     f"${r['price']:.2f}",
                "color":   r["color"],
                "ts":      r["purchased_at"],
                "weight":  1,
            })

        # ── 2. Country War scoreboard ─────────────────────────────────────────
        # Exclude non-country values (city names, test data, short codes)
        _EXCLUDED = {'Unknown','Test','New York','Tokyo','London','Paris','Seoul',
                     'Sydney','Dubai','Berlin','Warsaw','Bangkok','Singapore City',
                     'US','UK','FR','DE','JP','KR'}
        async with db.execute(
            "SELECT country, COUNT(*) as cnt, SUM(price) as vol "
            "FROM blocks WHERE country NOT IN ('Unknown','Test') AND country != '' "
            "AND LENGTH(country) > 3 "
            "GROUP BY country ORDER BY cnt DESC LIMIT 10"
        ) as cur:
            war_rows_raw = await cur.fetchall()
        war_rows = [r for r in war_rows_raw if r["country"] not in _EXCLUDED][:6]

        if war_rows:
            total_sold = sum(r["cnt"] for r in war_rows)
            war_day  = ((now_ms // day_ms) % 7) + 1   # cycles 1–7
            leader   = war_rows[0]
            for i, r in enumerate(war_rows[:6]):
                gap = leader["cnt"] - r["cnt"]
                if i == 0:
                    sub = f"{r['cnt']} tiles — LEADING"
                    icon = "🥇"
                elif i == 1:
                    sub = f"{r['cnt']} tiles — 2nd, closing fast" if gap < 80 else f"{r['cnt']} tiles — 2nd"
                    icon = "🥈"
                elif i == 2:
                    sub = f"{r['cnt']} tiles — needs {gap} to catch up"
                    icon = "🥉"
                else:
                    sub = f"{r['cnt']} tiles — #{i+1}"
                    icon = _flag(r["country"])
                signals.append({
                    "type":    "country_war",
                    "icon":    icon,
                    "label":   f"⚔️ COUNTRY WAR — Day {war_day} of 7",
                    "text":    f"{_flag(r['country'])} {r['country']}: {sub}",
                    "color":   "#facc15",
                    "ts":      now_ms,
                    "weight":  4,
                })

        # ── 3. Scarcity: country-level density signals ────────────────────────
        # Approximate purchasable tiles per country (Z14, rough geographic area)
        COUNTRY_CAPACITY = {
            "United States": 3200, "Russia": 4800, "Canada": 3600,
            "China": 2800, "Brazil": 2400, "Australia": 2200,
            "India": 1200, "Argentina": 1400, "Kazakhstan": 1600,
            "Algeria": 800, "Saudi Arabia": 700, "Mexico": 600,
            "Indonesia": 700, "Sudan": 600, "Libya": 500,
            "Iran": 600, "Mongolia": 700, "Peru": 600,
            "France": 250, "Germany": 200, "Turkey": 280,
            "Spain": 240, "Sweden": 280, "Norway": 240,
            "Japan": 200, "United Kingdom": 150, "Italy": 180,
            "South Korea": 90, "Poland": 160, "Ukraine": 280,
            "Singapore": 12, "UAE": 40, "Israel": 18,
            "Netherlands": 30, "Belgium": 25, "Switzerland": 25,
            "Philippines": 120, "Vietnam": 140, "Thailand": 200,
            "Malaysia": 160, "Bangladesh": 80, "Pakistan": 400,
            "Egypt": 400, "Nigeria": 360, "South Africa": 480,
            "Kenya": 360, "Ethiopia": 480, "Ghana": 180,
            "New Zealand": 200, "Colombia": 400, "Chile": 400,
        }
        async with db.execute(
            "SELECT country, COUNT(*) as cnt, MAX(price) as max_p "
            "FROM blocks GROUP BY country ORDER BY cnt DESC LIMIT 20"
        ) as cur:
            country_counts = await cur.fetchall()

        for r in country_counts:
            country = r["country"]
            if country in ("Unknown", "Test") or not country:
                continue
            capacity = COUNTRY_CAPACITY.get(country, 500)
            pct = min(99, int(r["cnt"] / capacity * 100))
            remaining = max(0, capacity - r["cnt"])
            if pct >= 3:   # show as soon as 3% is taken — it's meaningful at scale
                if pct >= 15:
                    icon = "🔴"
                    urgency = f"Only {remaining:,} tiles left!"
                elif pct >= 8:
                    icon = "🟠"
                    urgency = f"{remaining:,} tiles remaining"
                else:
                    icon = "⚠️"
                    urgency = f"{r['cnt']} tiles claimed so far"
                signals.append({
                    "type":  "scarcity",
                    "icon":  icon,
                    "text":  f"{_flag(country)} {country} is {pct}% claimed — {urgency}",
                    "color": "#f87171" if pct >= 15 else "#fb923c" if pct >= 8 else "#fbbf24",
                    "ts":    now_ms,
                    "weight": 5 if pct >= 8 else 3,
                })

        # ── 4. Milestones ──────────────────────────────────────────────────────
        async with db.execute("SELECT COUNT(*), SUM(price), COUNT(DISTINCT owner), COUNT(DISTINCT country) FROM blocks") as cur:
            total_tiles, total_vol, total_owners, total_countries = await cur.fetchone()
        total_tiles   = total_tiles or 0
        total_vol     = total_vol or 0
        total_owners  = total_owners or 0
        total_countries = total_countries or 0

        # Global milestone — emit highest crossed threshold only
        for milestone in [10000, 5000, 2500, 1000, 500, 250, 100, 50]:
            if total_tiles >= milestone:
                signals.append({
                    "type":  "milestone",
                    "icon":  "🎉",
                    "text":  f"CryptoLand hit {milestone:,} tiles sold across {total_countries} countries",
                    "color": "#a78bfa",
                    "ts":    now_ms,
                    "weight": 3,
                })
                break

        # Tiles in last hour
        async with db.execute(
            "SELECT COUNT(*), SUM(price) FROM blocks WHERE purchased_at > ?", (now_ms - hour_ms,)
        ) as cur:
            tiles_1h, vol_1h = await cur.fetchone()
        tiles_1h = tiles_1h or 0
        vol_1h   = vol_1h or 0
        if tiles_1h >= 3:
            mins = 60 // max(1, tiles_1h)
            signals.append({
                "type":  "milestone",
                "icon":  "⚡",
                "text":  f"{tiles_1h} tiles claimed in the last hour — one every {mins} min",
                "color": "#fbbf24",
                "ts":    now_ms,
                "weight": 3,
            })

        # ── 5. Price surge: recent activity or all-time top movers ──────────────
        # Try last-hour first; if quiet, use last-7-days; then all-time top
        for window_ms, window_label, min_cnt in [
            (hour_ms,      "this hour",  2),
            (day_ms,       "today",      3),
            (7 * day_ms,   "this week",  4),
            (None,         "all time",   5),
        ]:
            sql = (
                "SELECT country, COUNT(*) as cnt, SUM(price) as vol, MAX(price) as max_p "
                "FROM blocks WHERE purchased_at > ? GROUP BY country HAVING cnt >= ? ORDER BY cnt DESC LIMIT 4"
                if window_ms else
                "SELECT country, COUNT(*) as cnt, SUM(price) as vol, MAX(price) as max_p "
                "FROM blocks GROUP BY country HAVING cnt >= ? ORDER BY vol DESC LIMIT 4"
            )
            params = (now_ms - window_ms, min_cnt) if window_ms else (min_cnt,)
            async with db.execute(sql, params) as cur:
                surges = await cur.fetchall()
            surges = [r for r in surges if r["country"] not in ("Unknown", "Test")]
            if surges:
                for r in surges:
                    signals.append({
                        "type":  "price_surge",
                        "icon":  "📈",
                        "text":  f"{_flag(r['country'])} {r['country']} — {r['cnt']} tiles sold {window_label}",
                        "sub":   f"${r['vol']:.0f} volume · avg ${r['vol']/r['cnt']:.0f}/tile",
                        "color": "#34d399",
                        "ts":    now_ms,
                        "weight": 4,
                    })
                break  # found results — don't fall through

        # High-value individual tiles (top 4 by price)
        async with db.execute(
            "SELECT country, owner, price, purchased_at FROM blocks "
            "WHERE country NOT IN ('Unknown','Test') ORDER BY price DESC LIMIT 4"
        ) as cur:
            expensive = await cur.fetchall()
        for r in expensive:
            if r["price"] >= 35:
                signals.append({
                    "type":  "price_surge",
                    "icon":  "🚨",
                    "text":  f"{_flag(r['country'])} {r['country']} tile at ${r['price']:.0f} — premium zone",
                    "sub":   f"Owned by {_shorten(r['owner'])}",
                    "color": "#f87171",
                    "ts":    r["purchased_at"],
                    "weight": 3,
                })

        # ── 6. Streak: top owners by tile count (only meaningful thresholds) ─────
        async with db.execute(
            "SELECT owner, COUNT(*) as cnt, SUM(price) as vol FROM blocks "
            "GROUP BY owner HAVING cnt >= 5 ORDER BY cnt DESC LIMIT 5"
        ) as cur:
            top_owners = await cur.fetchall()

        milestones_map = {5: "Pioneer", 10: "Land Baron", 25: "Tycoon", 50: "Mogul", 100: "Emperor"}
        for r in top_owners:
            for threshold in sorted(milestones_map.keys(), reverse=True):
                if r["cnt"] >= threshold:
                    badge = milestones_map[threshold]
                    signals.append({
                        "type":  "streak",
                        "icon":  "🔥",
                        "text":  f"{_shorten(r['owner'])} owns {r['cnt']} tiles — '{badge}' status",
                        "sub":   f"${r['vol']:.0f} invested",
                        "color": "#fb923c",
                        "ts":    now_ms,
                        "weight": 2,
                    })
                    break

        # ── 7. Affiliate leaderboard visibility ────────────────────────────────
        async with db.execute("""
            SELECT b.wallet, b.total_earned, COUNT(r.id) as refs_today
            FROM referral_balance b
            LEFT JOIN referrals r ON r.referrer_wallet = b.wallet
                AND r.created_at > ?
            GROUP BY b.wallet
            HAVING b.total_earned > 0 OR refs_today > 0
            ORDER BY refs_today DESC, b.total_earned DESC
            LIMIT 5
        """, (now_ms - day_ms,)) as cur:
            aff_rows = await cur.fetchall()
        for r in aff_rows:
            if r["refs_today"] and r["refs_today"] > 0:
                signals.append({
                    "type":  "affiliate",
                    "icon":  "🤝",
                    "text":  f"{_shorten(r['wallet'])} recruited {r['refs_today']} new landowner{'s' if r['refs_today'] != 1 else ''} today",
                    "sub":   f"${r['total_earned']:.0f} earned total",
                    "color": "#60a5fa",
                    "ts":    now_ms,
                    "weight": 3,
                })
            elif r["total_earned"] and r["total_earned"] >= 50:
                signals.append({
                    "type":  "affiliate",
                    "icon":  "👑",
                    "text":  f"Top recruiter {_shorten(r['wallet'])} — ${r['total_earned']:.0f} in commissions",
                    "color": "#60a5fa",
                    "ts":    now_ms,
                    "weight": 2,
                })

    # Sort: higher weight first, then most recent
    signals.sort(key=lambda s: (-s["weight"], -s["ts"]))
    return signals

# ════════════════════════════════════════════════════════════════════════════
# VIRAL FEATURES — Streaks, Empire Cards, Public Empire, Place Search
# See documentation/viral-strategy.md
# ════════════════════════════════════════════════════════════════════════════

import datetime as _dt
import math as _math

def _utc_day(now_ms: Optional[int] = None) -> str:
    ts = (now_ms / 1000) if now_ms else time.time()
    return _dt.datetime.utcfromtimestamp(ts).strftime("%Y-%m-%d")

def _yesterday_of(day: str) -> str:
    d = _dt.datetime.strptime(day, "%Y-%m-%d")
    return (d - _dt.timedelta(days=1)).strftime("%Y-%m-%d")

def _z14_lnglat_for_tile(tx: int, ty: int) -> tuple:
    """NW corner lng/lat for a Z14 tile (matches frontend tileNW)."""
    n = 16384
    lng = (tx / n) * 360 - 180
    lat = _math.degrees(_math.atan(_math.sinh(_math.pi * (1 - 2 * ty / n))))
    return lng, lat

# ── Streaks ──────────────────────────────────────────────────────────────────

class StreakCheckinResponse(BaseModel):
    current_streak:   int
    longest_streak:   int
    total_checkins:   int
    last_checkin_day: Optional[str]
    incremented:      bool   # True if this checkin advanced the streak
    badge:            Optional[str]  # cosmetic tier label

def _streak_badge(streak: int) -> Optional[str]:
    if streak >= 365: return "Legend"
    if streak >= 100: return "Gold"
    if streak >= 30:  return "Silver"
    if streak >= 7:   return "Spark"
    return None

@app.post("/streak/checkin", response_model=StreakCheckinResponse)
@limiter.limit("10/minute")
async def streak_checkin(request: Request):
    """Record a daily check-in. Idempotent within the same UTC day."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        user = await _require_auth(request, db)
        uid = user["user_id"]
        today = _utc_day()
        now_ms = int(time.time() * 1000)

        async with db.execute("SELECT * FROM streaks WHERE user_id = ?", (uid,)) as cur:
            row = await cur.fetchone()

        if row is None:
            await db.execute(
                "INSERT INTO streaks (user_id, current_streak, longest_streak, "
                "last_checkin_day, last_checkin_at, total_checkins) VALUES (?,?,?,?,?,?)",
                (uid, 1, 1, today, now_ms, 1)
            )
            await db.commit()
            return StreakCheckinResponse(
                current_streak=1, longest_streak=1, total_checkins=1,
                last_checkin_day=today, incremented=True,
                badge=_streak_badge(1),
            )

        last_day = row["last_checkin_day"]
        cur_streak = row["current_streak"] or 0
        longest = row["longest_streak"] or 0
        totals = row["total_checkins"] or 0
        incremented = False

        if last_day == today:
            # already checked in today — no-op
            pass
        elif last_day == _yesterday_of(today):
            cur_streak += 1
            totals += 1
            incremented = True
        else:
            # streak broken
            cur_streak = 1
            totals += 1
            incremented = True

        if cur_streak > longest:
            longest = cur_streak

        await db.execute(
            "UPDATE streaks SET current_streak=?, longest_streak=?, last_checkin_day=?, "
            "last_checkin_at=?, total_checkins=? WHERE user_id=?",
            (cur_streak, longest, today, now_ms, totals, uid)
        )
        await db.commit()
        return StreakCheckinResponse(
            current_streak=cur_streak, longest_streak=longest, total_checkins=totals,
            last_checkin_day=today, incremented=incremented,
            badge=_streak_badge(cur_streak),
        )

@app.get("/streak/me")
async def get_my_streak(request: Request):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        user = await _require_auth(request, db)
        async with db.execute("SELECT * FROM streaks WHERE user_id = ?", (user["user_id"],)) as cur:
            row = await cur.fetchone()
        if not row:
            return {
                "current_streak": 0, "longest_streak": 0, "total_checkins": 0,
                "last_checkin_day": None, "checked_in_today": False, "badge": None,
            }
        today = _utc_day()
        return {
            "current_streak": row["current_streak"],
            "longest_streak": row["longest_streak"],
            "total_checkins": row["total_checkins"],
            "last_checkin_day": row["last_checkin_day"],
            "checked_in_today": row["last_checkin_day"] == today,
            "badge": _streak_badge(row["current_streak"]),
        }

@app.get("/streak/leaderboard")
async def streak_leaderboard(limit: int = 25):
    limit = max(1, min(100, limit))
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("""
            SELECT s.user_id, s.current_streak, s.longest_streak, s.total_checkins,
                   u.username, u.avatar_emoji, u.wallet
            FROM streaks s
            LEFT JOIN users u ON u.user_id = s.user_id
            WHERE s.current_streak > 0
            ORDER BY s.current_streak DESC, s.longest_streak DESC
            LIMIT ?
        """, (limit,)) as cur:
            rows = await cur.fetchall()
        return [
            {
                "user_id":        r["user_id"],
                "username":       r["username"] or _shorten(r["wallet"] or r["user_id"]),
                "avatar_emoji":   r["avatar_emoji"] or "🌍",
                "current_streak": r["current_streak"],
                "longest_streak": r["longest_streak"],
                "total_checkins": r["total_checkins"],
                "badge":          _streak_badge(r["current_streak"]),
            }
            for r in rows
        ]

@app.get("/streak/owners")
async def streak_owners():
    """All wallets/user_ids with active streaks ≥ 7 — used by Map.jsx for badges."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("""
            SELECT u.wallet, u.user_id, s.current_streak
            FROM streaks s
            JOIN users u ON u.user_id = s.user_id
            WHERE s.current_streak >= 7
        """) as cur:
            rows = await cur.fetchall()
        return [
            {
                "wallet": r["wallet"],
                "user_id": r["user_id"],
                "streak": r["current_streak"],
                "badge": _streak_badge(r["current_streak"]),
            }
            for r in rows
        ]

# ── Empire Cards (Wordle-grid for land) ──────────────────────────────────────

async def _compute_empire_card(db, user_row: dict) -> dict:
    """Build a fresh empire card payload for a user."""
    uid = user_row["user_id"]
    wallet = (user_row.get("wallet") or "").lower()
    today = _utc_day()
    now_ms = int(time.time() * 1000)

    # Determine identity keys to look up tiles by
    owner_keys = []
    if wallet:
        owner_keys.append(wallet)
    owner_keys.append(uid)
    placeholders = ",".join("?" * len(owner_keys))

    # All tiles owned
    async with db.execute(
        f"SELECT tile_key, tx, ty, country, price, color, purchased_at "
        f"FROM blocks WHERE LOWER(owner) IN ({placeholders}) ORDER BY purchased_at DESC",
        tuple(owner_keys)
    ) as cur:
        tiles = [dict(r) for r in await cur.fetchall()]

    total_value = sum(float(t["price"]) for t in tiles)
    countries = {}
    for t in tiles:
        c = t.get("country") or "Unknown"
        countries.setdefault(c, []).append(t)

    # Top 3 countries by tile count
    country_medals = sorted(
        [{"country": c, "count": len(v), "value": sum(float(x["price"]) for x in v)}
         for c, v in countries.items()],
        key=lambda x: (-x["count"], -x["value"])
    )[:3]

    # Yesterday delta — tiles bought in last 24h
    one_day_ms = 24 * 3600 * 1000
    delta_24h_count = sum(1 for t in tiles if (now_ms - int(t["purchased_at"])) <= one_day_ms)
    delta_24h_value = sum(float(t["price"]) for t in tiles if (now_ms - int(t["purchased_at"])) <= one_day_ms)

    # Compact tile dots for the world-map render: lng/lat + color
    dots = []
    for t in tiles[:500]:
        lng, lat = _z14_lnglat_for_tile(int(t["tx"]), int(t["ty"]))
        dots.append({"lng": round(lng, 4), "lat": round(lat, 4),
                     "color": t.get("color") or "#00ff88",
                     "value": float(t["price"])})

    # Streak
    streak_row = None
    async with db.execute("SELECT * FROM streaks WHERE user_id = ?", (uid,)) as cur:
        streak_row = await cur.fetchone()
    streak = dict(streak_row) if streak_row else {"current_streak": 0, "longest_streak": 0}

    headline = _empire_headline(len(tiles), len(country_medals), total_value, delta_24h_count)
    return {
        "day":              today,
        "user_id":          uid,
        "username":         user_row.get("username") or _shorten(wallet or uid),
        "avatar_emoji":     user_row.get("avatar_emoji") or "🌍",
        "wallet":           wallet,
        "tile_count":       len(tiles),
        "country_count":    len(countries),
        "total_value":      round(total_value, 2),
        "delta_24h_count":  delta_24h_count,
        "delta_24h_value":  round(delta_24h_value, 2),
        "country_medals":   country_medals,
        "dots":             dots,
        "current_streak":   int(streak.get("current_streak") or 0),
        "longest_streak":   int(streak.get("longest_streak") or 0),
        "streak_badge":     _streak_badge(int(streak.get("current_streak") or 0)),
        "headline":         headline,
        "share_url":        f"/u/{(user_row.get('username') or uid)}",
        "generated_at":     now_ms,
    }

def _empire_headline(tile_count: int, country_count: int, total_value: float, delta_count: int) -> str:
    if tile_count == 0:
        return "No tiles yet — claim your first piece of Earth."
    parts = [f"{tile_count} tile{'s' if tile_count != 1 else ''}"]
    if country_count > 1:
        parts.append(f"{country_count} countries")
    parts.append(f"${total_value:,.0f} net worth")
    if delta_count > 0:
        parts.append(f"+{delta_count} today")
    return " · ".join(parts)

@app.get("/share/card/me")
async def my_empire_card(request: Request):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        user = await _require_auth(request, db)
        today = _utc_day()
        card_id = f"{user['user_id']}:{today}"

        async with db.execute("SELECT payload_json FROM share_cards WHERE card_id = ?", (card_id,)) as cur:
            row = await cur.fetchone()
        if row:
            return json.loads(row["payload_json"])

        payload = await _compute_empire_card(db, dict(user))
        await db.execute(
            "INSERT INTO share_cards (card_id, user_id, day, payload_json, generated_at) "
            "VALUES (?,?,?,?,?)",
            (card_id, user["user_id"], today, json.dumps(payload), int(time.time() * 1000))
        )
        await db.commit()
        return payload

@app.get("/share/card/{handle}")
async def public_empire_card(handle: str):
    """Public card by username — used for share-link previews."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        # Resolve username → user_id (also accept user_id directly)
        async with db.execute(
            "SELECT * FROM users WHERE username = ? OR user_id = ? LIMIT 1",
            (handle, handle)
        ) as cur:
            user = await cur.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="Handle not found")
        today = _utc_day()
        card_id = f"{user['user_id']}:{today}"
        async with db.execute("SELECT payload_json FROM share_cards WHERE card_id = ?", (card_id,)) as cur:
            row = await cur.fetchone()
        if row:
            payload = json.loads(row["payload_json"])
            await db.execute(
                "UPDATE share_cards SET view_count = view_count + 1 WHERE card_id = ?",
                (card_id,)
            )
            await db.commit()
            return payload
        payload = await _compute_empire_card(db, dict(user))
        await db.execute(
            "INSERT INTO share_cards (card_id, user_id, day, payload_json, generated_at, view_count) "
            "VALUES (?,?,?,?,?,1)",
            (card_id, user["user_id"], today, json.dumps(payload), int(time.time() * 1000))
        )
        await db.commit()
        return payload

@app.post("/share/card/{handle}/share")
async def increment_share_count(handle: str):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT user_id FROM users WHERE username = ? OR user_id = ? LIMIT 1",
            (handle, handle)
        ) as cur:
            user = await cur.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="Handle not found")
        today = _utc_day()
        card_id = f"{user['user_id']}:{today}"
        await db.execute(
            "UPDATE share_cards SET share_count = share_count + 1 WHERE card_id = ?",
            (card_id,)
        )
        await db.commit()
        return {"ok": True}

# ── Public Empire (the share landing page) ───────────────────────────────────

@app.get("/empire/{handle}")
async def public_empire_page(handle: str):
    """Full public empire snapshot — drives the /u/{handle} share landing page."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM users WHERE username = ? OR user_id = ? LIMIT 1",
            (handle, handle)
        ) as cur:
            user = await cur.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="Empire not found")
        user_dict = dict(user)
        uid = user_dict["user_id"]
        wallet = (user_dict.get("wallet") or "").lower()

        # Tiles
        owner_keys = []
        if wallet:
            owner_keys.append(wallet)
        owner_keys.append(uid)
        placeholders = ",".join("?" * len(owner_keys))
        async with db.execute(
            f"SELECT tile_key, tx, ty, country, price, color, image_url, label, purchased_at "
            f"FROM blocks WHERE LOWER(owner) IN ({placeholders}) ORDER BY purchased_at DESC",
            tuple(owner_keys)
        ) as cur:
            tiles = [dict(r) for r in await cur.fetchall()]

        # Add lng/lat to each tile (for client-side map render)
        for t in tiles:
            lng, lat = _z14_lnglat_for_tile(int(t["tx"]), int(t["ty"]))
            t["lng"] = round(lng, 5)
            t["lat"] = round(lat, 5)

        # Streak
        async with db.execute("SELECT * FROM streaks WHERE user_id = ?", (uid,)) as cur:
            srow = await cur.fetchone()
        streak = dict(srow) if srow else {"current_streak": 0, "longest_streak": 0, "total_checkins": 0}

        # Trophy: first to own a tile in N countries
        countries = {}
        for t in tiles:
            c = t.get("country") or "Unknown"
            countries.setdefault(c, 0)
            countries[c] += 1

        total_value = sum(float(t["price"]) for t in tiles)
        # Highest-priced tile
        top_tile = max(tiles, key=lambda x: float(x["price"])) if tiles else None

        # Trophy cabinet
        trophies = []
        if len(tiles) >= 1:   trophies.append({"icon": "🏁", "label": "First Tile"})
        if len(tiles) >= 10:  trophies.append({"icon": "🏘", "label": "10 Tiles"})
        if len(tiles) >= 50:  trophies.append({"icon": "🏛", "label": "Land Baron"})
        if len(tiles) >= 100: trophies.append({"icon": "👑", "label": "Tycoon"})
        if len(countries) >= 3:  trophies.append({"icon": "🌎", "label": f"{len(countries)} Countries"})
        if len(countries) >= 10: trophies.append({"icon": "🌍", "label": "Global Holder"})
        if streak["current_streak"] >= 7:  trophies.append({"icon": "🔥", "label": f"{streak['current_streak']}-day Streak"})
        if streak["current_streak"] >= 30: trophies.append({"icon": "💎", "label": "30-day Streak"})
        if streak["current_streak"] >= 100: trophies.append({"icon": "🏆", "label": "100-day Streak"})

        return {
            "user": {
                "user_id":      uid,
                "username":     user_dict.get("username") or _shorten(wallet or uid),
                "avatar_emoji": user_dict.get("avatar_emoji") or "🌍",
                "bio":          user_dict.get("bio"),
                "wallet":       wallet,
                "created_at":   user_dict.get("created_at"),
            },
            "tiles":         tiles,
            "tile_count":    len(tiles),
            "country_count": len(countries),
            "country_breakdown": [{"country": c, "count": n} for c, n in
                                  sorted(countries.items(), key=lambda x: -x[1])[:10]],
            "total_value":   round(total_value, 2),
            "top_tile":      top_tile,
            "streak":        {
                "current": streak["current_streak"],
                "longest": streak["longest_streak"],
                "total":   streak["total_checkins"],
                "badge":   _streak_badge(streak["current_streak"]),
            },
            "trophies":      trophies,
        }

# ── Personal place onboarding (Nominatim search proxy) ───────────────────────

_NOMINATIM_BASE = "https://nominatim.openstreetmap.org"
_PLACE_SEARCH_HEADERS = {"User-Agent": "CryptoLand/1.0 (place-search)"}

@app.get("/search/place")
@limiter.limit("30/minute")
async def search_place(request: Request, q: str, limit: int = 6):
    """Proxy to Nominatim — find your home, school, favorite spot."""
    q = (q or "").strip()
    if not q or len(q) < 2:
        return []
    limit = max(1, min(10, limit))
    async with httpx.AsyncClient(timeout=8.0) as client:
        try:
            r = await client.get(
                f"{_NOMINATIM_BASE}/search",
                params={"q": q, "format": "json", "limit": limit, "addressdetails": 1},
                headers=_PLACE_SEARCH_HEADERS,
            )
            r.raise_for_status()
            results = r.json()
        except Exception:
            return []
    out = []
    for item in results:
        try:
            lng = float(item["lon"])
            lat = float(item["lat"])
        except Exception:
            continue
        # Compute Z14 tile
        n = 16384
        tx = int((lng + 180) / 360 * n)
        sin_lat = _math.sin(_math.radians(lat))
        ty = int((1 - _math.log((1 + sin_lat) / (1 - sin_lat)) / (2 * _math.pi)) / 2 * n)
        out.append({
            "name":         item.get("display_name", q),
            "short_name":   item.get("name") or item.get("display_name", q).split(",")[0],
            "lng":          lng,
            "lat":          lat,
            "tx":           tx,
            "ty":           ty,
            "tile_key":     f"{tx}:{ty}",
            "place_type":   item.get("type"),
            "country":      (item.get("address") or {}).get("country"),
            "country_code": ((item.get("address") or {}).get("country_code") or "").upper(),
        })
    return out

# ── Viral router (2026 frontier features) ────────────────────────────────────
# Must be registered BEFORE the SPA catch-all so /t/{tile_key} and /og/* are
# served as actual content, not the SPA shell.
app.include_router(build_viral_router(DB_PATH, _require_auth))

# ── Static frontend (production) ──────────────────────────────────────────────
DIST = Path(__file__).parent.parent / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/favicon.svg")
    async def favicon():
        return FileResponse(DIST / "favicon.svg")

    @app.get("/icons.svg")
    async def icons_svg():
        return FileResponse(DIST / "icons.svg")

    # SPA catch-all — must be last
    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str):
        return FileResponse(
            DIST / "index.html",
            headers={"Cache-Control": "no-store, no-cache, must-revalidate"},
        )

if __name__ == "__main__":
    import uvicorn
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("main:app", host=host, port=port, reload=False)
