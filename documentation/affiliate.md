# Affiliate System — CryptoLand

## Overview

CryptoLand runs a **30% commission affiliate program** built directly into the platform. **Any logged-in user can become an affiliate** — no wallet required. Users with email-only accounts, wallet-only accounts, or linked accounts all get a referral code the moment they log in.

When a new user purchases a tile through a referral link, the affiliate earns 30% of the purchase price. Commissions are credited to the referrer's balance immediately, keyed by `user_id` (not wallet address).

There are no signups, API keys, or third-party platforms — the entire system runs on the CryptoLand backend.

---

## How It Works

### 1. Landing

A visitor arrives at:
```
https://cryptoland.io/?ref=LAND-A3F9B2
```

The frontend (`affiliateStore.js`) captures the `ref=` parameter and stores it in `localStorage` with the key `cl-ref-code`. It is kept even if the user closes and reopens the browser.

### 2. Session Creation

On every page load, the frontend:
1. Generates (or loads from `localStorage`) a UUID session ID (`cl-session-id`)
2. Calls `POST /sessions` with:
   - `session_id` — the UUID
   - `ref_code` — the referral code present at landing (if any)
   - `user_agent` — for basic fingerprinting

The server stores the session with a server-side IP hash. This bridges the gap between "landed via referral link" and "eventually purchased".

### 3. Getting a Referral Code

Any logged-in user can get their referral code via `GET /affiliate/code/me` (bearer token auth).
The code is deterministic from the user's `user_id`: `LAND-{SHA256(user_id)[:6].upper()}`.

For wallet-connected users without a token, the legacy endpoint `GET /affiliate/code/{wallet}` still works.

The frontend (`affiliateStore.js` `loadMyCode`) calls:
- Token auth path (preferred): `GET /affiliate/code/me`
- Wallet-only fallback: `GET /affiliate/code/{wallet}`

### 4. Purchase

When a tile purchase is finalized (`POST /np/finalize` or `POST /blocks`):
- The `ref_code` and `session_id` from the frontend are included in the request
- The backend runs `_process_referral_commission()` with fraud guards (see below)
- On success: a row is inserted into `referrals`, and `referral_balance` is updated — keyed by `user_id`

### 5. Earnings

Affiliates can view their earnings in the **Account modal → Affiliate tab**:
- Total earned (lifetime)
- Pending balance (not yet redeemed)
- Total referrals
- Top affiliates leaderboard

Redemption is requested via `POST /affiliate/redeem`. Payouts are processed manually within 24h.

---

## Referral Code Format

```
LAND-{SHA256(user_id_or_wallet)[:6].upper()}
```

- Always 11 characters: `LAND-` + 6 hex digits (A–F, 0–9)
- Deterministic from `user_id` — stable across sessions
- Not guessable without the original identity (SHA-256 preimage resistance)
- Created on-demand on first `/affiliate/code/me` or `/affiliate/code/{wallet}` request

---

## Commission Structure

| Metric | Value |
|--------|-------|
| Commission rate | 30% of tile purchase price |
| Payment currency | USD-equivalent |
| Payout | Manual, within 24h of redemption request |
| Minimum redemption | Any positive balance |

Commission is calculated from `purchase_usd × 0.30` and stored with 2 decimal places.

---

## Fraud Prevention

Five layers of protection run on every referral attribution attempt:

### Guard 1 — Code Format Validation
```python
re.match(r'^LAND-[A-F0-9]{6}$', code)
```
Rejects malformed codes immediately — no DB lookup needed.

### Guard 2 — Code Must Exist
The code is looked up in `referral_codes`. A valid-format code that was never registered is silently rejected (no error to the buyer).

### Guard 3 — No Self-Referral
```python
if referrer_wallet and referrer_wallet == referee_wallet:
    return  # silently drop
```
A user cannot earn commission on their own purchases.

### Guard 4 — One Commission Per Tile
```sql
CREATE UNIQUE INDEX idx_referrals_tile ON referrals(tile_key)
```
The DB enforces that a tile can only generate one referral event. Attempted duplicate insertion silently fails.

### Guard 5 — IP Velocity Check
```python
# ≥ 3 purchases from the same IP hash within 5 minutes → reject
count = SELECT COUNT(*) FROM referrals r
        JOIN sessions s ON s.session_id = r.referee_session
        WHERE s.ip_hash = ? AND r.created_at > (now - 5min)
if count >= 3: return
```
Protects against one person creating many wallets and buying tiles rapidly to farm commissions.

---

## Database Schema

### `referral_codes`
```sql
code       TEXT PRIMARY KEY          -- e.g. "LAND-A3F9B2"
wallet     TEXT UNIQUE               -- nullable: email-only users have no wallet
user_id    TEXT UNIQUE               -- preferred key (any logged-in user)
created_at INTEGER
```

### `referrals`
```sql
id                INTEGER PRIMARY KEY
referrer_wallet   TEXT                -- nullable for email-only referrers
referrer_user_id  TEXT                -- preferred identity key
referee_wallet    TEXT                -- who purchased (null if anon)
referee_session   TEXT                -- session_id at purchase time
tile_key          TEXT UNIQUE         -- one commission per tile (UNIQUE INDEX)
purchase_usd      REAL
commission_usd    REAL                -- purchase_usd × 0.30
status            TEXT                -- 'credited' | 'paid'
created_at        INTEGER
credited_at       INTEGER
```

### `referral_balance`
```sql
user_id      TEXT PRIMARY KEY        -- permanent PK (user_id or wallet for legacy rows)
wallet       TEXT UNIQUE             -- nullable for email-only users
balance_usd  REAL DEFAULT 0         -- pending (not yet redeemed)
total_earned REAL DEFAULT 0         -- lifetime earned
total_paid   REAL DEFAULT 0         -- lifetime redeemed
updated_at   INTEGER
```

### `sessions`
```sql
session_id      TEXT PRIMARY KEY   -- UUID v4, client-generated
wallet          TEXT               -- null until wallet connects
user_id         TEXT               -- null until email user logs in
ip_hash         TEXT               -- SHA-256(ip)[:16]
user_agent      TEXT
ref_code        TEXT               -- referral code at landing
landed_at       INTEGER            -- unix ms
wallet_bound_at INTEGER            -- when wallet was linked
```

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET`  | `/affiliate/code/me` | Bearer token | Get or create code for any logged-in user |
| `GET`  | `/affiliate/stats/me` | Bearer token | Full stats for any logged-in user |
| `GET`  | `/affiliate/code/{wallet}` | None | Legacy: get/create code by wallet |
| `GET`  | `/affiliate/stats/{wallet}` | None | Legacy: stats by wallet |
| `GET`  | `/affiliate/leaderboard` | None | Top affiliates by earnings |
| `GET`  | `/affiliate/validate/{code}` | None | Check if a code is valid |
| `POST` | `/affiliate/redeem` | None | Request payout of pending balance |
| `POST` | `/sessions` | None | Create anonymous session on page load |
| `POST` | `/sessions/bind-wallet` | None | Bind session → wallet on connect |

---

## Frontend Integration

### Stores

**`src/store/affiliateStore.js`**
- Creates/loads `sessionId` from `localStorage` on import
- Captures `?ref=LAND-XXXXXX` from URL on landing
- `initSession()` — registers session with server (called on app boot)
- `bindWallet(wallet)` — links session → wallet on connect
- `loadMyCode(wallet)` — uses token auth if logged in, wallet fallback if not
- `loadStats(wallet)` — uses token auth if logged in, wallet fallback if not
- `getReferralUrl()` — returns shareable URL with `?ref=` param

**`src/store/authStore.js`**
- `tryRestoreAuth()` — restores token from localStorage on boot
- `loginWithWallet(wallet)` — creates wallet-only account (via `/auth/link-wallet-upsert`)
- `register()` / `login()` — email + password flow

**`src/store/userStore.js`** (legacy, still used for wallet-only flows)
- `initUser(wallet)` — upserts user on wallet connect

### Components

**`src/components/AccountModal.jsx`** — Full account dashboard with tabs:
- **My Tiles** — owned tiles
- **Guardians** — deployed guardians
- **Affiliate** — referral code (works for any logged-in user), earnings stats, leaderboard

### Boot Sequence (App.jsx)

```
1. tryRestoreAuth()         — restore token from localStorage
2. affiliateStore.initSession()  — register anonymous session
3. loadBlocksFromServer()   — map data
4. loadGuardiansSummary()   — guardian overlay
   ──── wallet connect event ────
5. initUser(wallet)         — upsert user
6. bindWallet(wallet)       — link session → wallet
7. loadMyCode(wallet)       — fetch referral code (token auth preferred)
   ──── email login event ────
8. loadMyCode(null)         — fetch code via token (no wallet needed)
```

---

## Security Notes

- **user_id = Identity**: Referral codes and balances are keyed by `user_id`, not wallet address. This means email-only users are first-class affiliates.
- **Server-side IP**: IP addresses are hashed (SHA-256) on the server. The client never sends IPs.
- **Code non-guessability**: The 6-hex-digit space is 16^6 = ~16.7M combinations. With DB validation required, brute force is not feasible.
- **No self-referral bypass**: Checked against referee's wallet address.
- **Idempotent tile index**: Even if the client sends the same referral code twice, the `UNIQUE` constraint on `referrals(tile_key)` prevents double crediting at the DB level.
- **No client-side balance manipulation**: All commission math runs server-side. The client only sends `ref_code` and `session_id`; the server computes the amount from its own `purchase_usd` value.
