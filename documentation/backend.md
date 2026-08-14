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

**Runtime:** `uvicorn main:app` (dev: `--reload`)
**Host:** binds to `127.0.0.1` by default (`HOST` env var; was `0.0.0.0` — now
loopback-only unless explicitly overridden).
**Port:** `8000` (`PORT` env var)
**Database:** `./cryptoland.db` (SQLite, relative to `server/`)
**CORS origins:** Configured via `ALLOWED_ORIGINS` env var (comma-separated). Defaults to `*`.
**Rate limiting:** `slowapi` — `POST /blocks` 20/min, `POST /np/payment` 10/min, `POST /auth/register` 5/min, `POST /auth/wallet/nonce` and `/auth/link-wallet-upsert` 20/min, `POST /affiliate/redeem` 10/min.

Copy `server/.env.example` to `server/.env` and fill in `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`, and `SERVER_URL` before running in production. `requirements.txt` includes `eth-account` (used to recover the signer for SIWE wallet auth). Optional dev flag `ALLOW_UNSIGNED_WALLET_AUTH` bypasses wallet-signature verification.

---

## `server/main.py`

### Database Schema

```sql
CREATE TABLE IF NOT EXISTS blocks (
    tile_key      TEXT PRIMARY KEY,        -- "tx:ty" — globally unique across all chains
    tx            INTEGER NOT NULL,
    ty            INTEGER NOT NULL,
    owner         TEXT NOT NULL,
    color         TEXT NOT NULL DEFAULT '#00ff88',
    price         REAL NOT NULL,
    country       TEXT NOT NULL DEFAULT 'Unknown',
    chain         TEXT NOT NULL DEFAULT 'polygon',   -- which chain this build recorded the purchase on
    purchased_at  INTEGER NOT NULL,        -- Unix milliseconds
    image_url     TEXT,                    -- nullable
    label         TEXT                     -- nullable
);

CREATE INDEX IF NOT EXISTS idx_blocks_owner ON blocks(owner);
CREATE INDEX IF NOT EXISTS idx_blocks_chain ON blocks(chain);
```

`tile_key` format: `"tx:ty"` (e.g., `"1024:512"`), coordinates are Z14 (0–16383).
The `chain` column records which chain the recording build targeted (`image_url`,
`label`, and `chain` are all added idempotently on startup for older DBs). Since the
app is one-codebase-per-chain-build, a `tile_key` is unique across every chain — see
[multichain.md](multichain.md).

### Pydantic Models

#### `Block` (response model)
```python
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
```

#### `PurchaseRequest` (request body)
```python
class PurchaseRequest(BaseModel):
    tile_key:       str
    tx:             int
    ty:             int
    owner:          str            # IGNORED — owner is derived from the auth token
    color:          str = "#00ff88"
    price:          float
    country:        str = "Unknown"
    chain:          str = "polygon"
    image_url:      Optional[str] = None
    label:          Optional[str] = None
    ref_code:       Optional[str] = None
    session_id:     Optional[str] = None
    purchase_email: Optional[str] = None
    user_id:        Optional[str] = None
```

### Lifecycle

#### `init_db()` (startup)
Called on startup from the FastAPI `lifespan` context manager (not the deprecated
`@app.on_event`). It creates every table `IF NOT EXISTS` and runs idempotent
`ALTER TABLE` migrations (e.g. adding `blocks.chain`, `payments.price_usd`,
`payments.consumed_at`), normalizes `0x...` wallets to lowercase, and drops legacy
migration tables. `lifespan()` also bootstraps the price-events and viral tables and
starts background loops (`price_events_loop`, `refresh_news`, `agent_feed_loop`).
`_check_zoom_level()` warns on startup if the DB still holds Z11 coordinates
(max coord ≤ 2047) and points to `server/migrations/migrate_z11_to_z14.py`.

### API Endpoints

#### `GET /health`
Health check. Returns database path.

**Response:**
```json
{ "ok": true, "db": "./cryptoland.db" }
```

---

#### `GET /blocks`
Returns purchased blocks, newest first. **Paginated** — the result set is always
bounded so this can never return an unbounded table.

**Query params:**
- `chain` — optional; filter to a single chain (`WHERE chain = ?`)
- `limit` — default `5000`, clamped to `[1, 20000]`
- `offset` — default `0`

**Response:** `Block[]`

**SQL:**
```sql
SELECT * FROM blocks [WHERE chain = ?] ORDER BY purchased_at DESC LIMIT ? OFFSET ?
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
Purchase a tile atomically (the no-payment claim path). Protected by `BEGIN EXCLUSIVE`
transaction.

**Auth:** **required** (Bearer). The owner is derived from the authenticated user
(their wallet, else `user_id`); the client-supplied `owner` field is **ignored**. This
stops free-claiming of tiles under another identity.

**Request body:** `PurchaseRequest`

**Rate limit:** 20 requests/minute per IP.

**Logic:**
1. Validate coords: `tile_key` must equal `"{tx}:{ty}"`, both 0–16383 → `400` if mismatch.
2. `_require_auth(request, db)` → derive owner from the token (never from `req.owner`);
   `0x...` addresses lowercased, non-hex owners (user_ids) left as-is.
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

#### `GET /feed/signals`

Composite signal feed for the live ticker — recent purchases, the Country War
scoreboard, scarcity, milestones, price surges, streaks, affiliate events.

**Query params:**
- `chain` — optional; scopes every underlying `blocks` query to one chain.

Scoping matters as much here as on `/blocks` and `/stats`. Unscoped, a shared
backend streamed every chain's rows into every build's ticker — the **Injective**
build was rendering `account_rdx12g5sszy…`, a **Radix** address, on its own page.
The frontend always passes it: `api.fetchSignals()` defaults to
`CHAIN_SCOPE` (see [multichain.md](multichain.md#one-constant-not-five)).

#### `_shorten(owner)` — chain-aware address truncation

Used by the feed to render an owner. The original returned the string untouched
unless it started with `0x`, so every non-EVM owner went in at full length and was
clipped mid-string by CSS — a 65-char Radix or 58-char Cardano address in an
EVM-shaped UI is exactly the tell a reviewer of that chain notices.

It is now a port of `shortAddr()` in `src/lib/addr.js` and must stay in step with
it:

- head length adapts to the chain's own prefix (`account_rdx`, `addr1`, `erd1`,
  `tz1`, `EQ`, `0x`), so the result still reads as that chain's address —
  `addr1qwzt…4yky`, `account_rdx12…0q7x`, `erd1l8q2…6n6h`;
- NEAR/ENS names are returned **whole** — `sable5867.near` is an identity, not a
  hash, and chopping its middle destroys the thing worth showing;
- anything already short is left alone.

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

### Native wallet payments

`GET /chain/pay-info` · `POST /chain/quote` · `POST /chain/verify`, plus the
`chain_quotes` table. Pay for a tile in the chain's own token from the user's
own wallet, verified against that chain's RPC before the tile is written.

Full write-up, invariants and per-chain status:
**[native-payments.md](native-payments.md)**. Two things to know here:

- The price is computed **server-side** from `tile_pricing.py`. The rail below
  does not do this — see the warning on `POST /np/payment`.
- Only the `evm` family has a verifier today (21 chains). Other families report
  `enabled: false` from `/chain/pay-info` and fall back to NOWPayments.

---

### NOWPayments Integration

#### `POST /np/payment`
Creates a NOWPayments payment intent and stores metadata for IPN fulfillment.

> ⚠️ **`price_usd` originates from the client.** `req.usd_amount` is stored as
> the authoritative price that `/np/finalize` and `/np/ipn` later validate
> against. The binding is real, but the number is whatever the browser sent, so
> a crafted request can create a payment for a $76 tile at $0.50. The native
> rail deliberately does not repeat this — it prices tiles from
> `tile_pricing.py` and ignores client price fields entirely. Closing this here
> means calling the same function.

**Rate limit:** 10 requests/minute per IP.

**Request body:** `CreatePaymentRequest`
```python
class CreatePaymentRequest(BaseModel):
    tile_key:    str
    usd_amount:  float
    currency:    str        # e.g. "usdttrc20"
    owner:       Optional[str] = None
    chain:       str = "polygon"
    ref_code:    Optional[str] = None
    session_id:  Optional[str] = None
```

**Logic:**
- Calls NOWPayments API to create payment, returns full NP response.
- Stores `owner`, `chain`, `ref_code`, `session_id`, and the expected `price_usd`
  (= `usd_amount`) in the `payments` table so finalize/IPN can bind the amount.
- Uses `SERVER_URL` env var for IPN callback URL (must be publicly accessible in production).

#### `POST /np/finalize`
Called by the frontend when a payment is confirmed. Verifies status with NOWPayments,
then writes the block inside a `BEGIN EXCLUSIVE` transaction.

**Payment binding (security):**
- Looks up the stored `payments` row by `payment_id`; requires `payments.tile_key ==
  req.tile_key` (else `409` "payment/tile mismatch").
- **Single-use:** rejects if `consumed_at` is already set (re-checked inside the
  transaction to defeat concurrent double-finalize); marks the payment consumed in the
  same transaction that writes the block.
- **Amount binding:** uses the server-stored `payments.price_usd` (never `req.price`)
  as the authoritative amount; the NOWPayments-reported paid amount must cover it (95%
  tolerance) or `402`.
- `partially_paid` is treated as **insufficient** (`402`), not success.

#### `POST /np/ipn`
IPN webhook called by NOWPayments when payment status changes.

**Logic:**
- Verifies HMAC-SHA512 signature using `NOWPAYMENTS_IPN_SECRET`. **Fails closed** —
  a missing or invalid signature is rejected (never processed).
- Applies the same `payment_id ↔ tile ↔ amount` binding, single-use, and server-stored
  price checks as `/np/finalize`.
- Looks up `owner`, `chain`, `ref_code`, `session_id` from the stored `payments` row to
  use the real owner (never fabricates one).
- Calls `_process_referral_commission()` with ref_code and session_id for affiliate
  credit (commission math is done in integer cents).

---

### `payments` Table

```sql
CREATE TABLE IF NOT EXISTS payments (
    payment_id  TEXT PRIMARY KEY,          -- NOWPayments payment_id
    tile_key    TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'waiting',
    owner       TEXT,                       -- tile owner after purchase
    chain       TEXT NOT NULL DEFAULT 'polygon',
    ref_code    TEXT,                       -- affiliate ref code if present
    session_id  TEXT,                       -- session UUID for affiliate tracking
    created_at  INTEGER NOT NULL,
    price_usd   REAL,                        -- server-stored expected USD price (amount binding)
    consumed_at INTEGER                      -- set once finalized — enforces single-use
)
```

`price_usd` and `consumed_at` are added idempotently on startup. `price_usd` is the
authoritative expected amount (finalize/IPN never trust a client-supplied price);
`consumed_at` makes each payment single-use so a payment can't be replayed to write two
blocks.

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

## Auth & Authorization (security hardening)

### Wallet sign-in (SIWE)

- **`POST /auth/wallet/nonce`** `{ wallet }` → `{ nonce, message }`. Issues a random
  16-byte nonce stored in the `wallet_nonces` table and returns the canonical message
  to sign. Rate-limited 20/min.
- **`POST /auth/link-wallet-upsert`** now requires `{ wallet, signature, nonce }`. The
  server recovers the signer via `eth-account` (`_verify_wallet_ownership` →
  `_recover_wallet`) and requires a match; the nonce is consumed on use. Creates or
  returns the wallet-only account and issues a token. `POST /sessions/bind-wallet`
  uses the same verification.
- `ALLOW_UNSIGNED_WALLET_AUTH=1` bypasses verification (dev/test only). If
  `eth-account` is unavailable and the bypass is off → `501` (never silently allows).
- **`wallet_nonces`** table: `(wallet TEXT, nonce TEXT, created_at INTEGER)` with an
  index on `wallet`.

### Guest claim

- **`POST /auth/guest-claim`** requires the guest's own bearer token; the caller's
  `user_id` must equal the claimed account's, and it must still be `is_guest=1` (else
  `403`).

### Authorization derived from the token (not the request body)

These mutating endpoints now require a bearer token and take the acting identity from
it — client-supplied `owner`/`seller`/`voter`/`weight` are ignored or rejected:

| Endpoint | Rule |
|----------|------|
| `POST /blocks`, `PATCH /blocks/{tile_key}` | owner = authed user; edits require DB ownership (`_owns_block`) |
| `POST /guardian`, `DELETE /guardian/{tile_key}` | must own the tile |
| `POST /marketplace/list`, `DELETE /marketplace/{tile_key}` | must own the tile; stored seller = caller |
| `POST /dao/vote` | voter = authed user; weight = tiles owned (min 1) |
| `POST /affiliate/redeem` | always applies to the caller's own balance |
| `GET /account/{wallet}`, `/affiliate/*/{wallet}` | require auth **and** wallet-match (prefer `/me` variants) |

## Security Notes

- Server binds to `127.0.0.1` by default (`HOST` env; was `0.0.0.0`).
- `server/.env`, `*.db`, `__pycache__/`, and `dist-*/` are git-ignored; `env/` per-chain
  templates and `.env.example` are committed. Never commit API keys.
- All `0x...` wallet addresses are stored lowercase — `_norm_wallet()` applied on all writes.
- `BEGIN EXCLUSIVE` transactions prevent double-purchase race conditions.
- `ON CONFLICT DO UPDATE` on `blocks` protects `price`, `owner`, `chain`, `country` from being overwritten on re-customization.
- UNIQUE index on `referrals(tile_key)` prevents duplicate affiliate commissions per tile.
- Payment finalize/IPN bind `payment_id ↔ tile ↔ amount`, are single-use
  (`payments.consumed_at`), use the server-stored `payments.price_usd`, and the IPN
  fails closed on a missing/invalid signature.
- Money math uses integer cents (`_to_cents` / `_from_cents`) so the affiliate ledger
  doesn't drift.

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

## `CRYPTOLAND_DB` must be read by every module that opens the database

`price_events.py` hardcoded `Path(__file__).parent / "cryptoland.db"` and
ignored `CRYPTOLAND_DB`. Every per-chain unit sets that variable
(`Environment=CRYPTOLAND_DB=/srv/cryptoland/%i/%i.db`) and keeps its database
outside the shared app directory, so `aiosqlite.connect()` raised
`sqlite3.OperationalError: unable to open database file` and **`/price-events`
and `/alerts` returned 500 on all 32 subdomains**.

The 500 was the visible half. The other half is worse: had that file existed,
all 32 chains would have shared one `price_events` table — the exact cross-chain
bleed the per-chain deployment model exists to prevent, and the thing a grant
reviewer is most likely to catch.

`viral.py` is the pattern to copy: it takes `db_path` as a parameter from
`main.py` and never resolves a path itself. **If a module opens the database, it
either receives the path or resolves it exactly as `main.py` does** —
`Path(os.environ.get("CRYPTOLAND_DB") or (Path(__file__).parent / "cryptoland.db"))`.

> Restarting all 32 units at once makes every subdomain 502 for ~20s while they
> come up. That is expected on a shared box; check `is-active` and re-test
> rather than reading the 502 as a failed fix.
