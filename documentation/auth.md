# Universal Auth System — CryptoLand

## Overview

CryptoLand uses a **universal identity model** where users are identified by a `user_id` UUID that is independent of wallet address or email. Either or both can be linked to one account. This enables:

- **Email + password** accounts (no wallet required)
- **Wallet-only** accounts (auto-created on wallet connect, no password)
- **Guest accounts** (auto-created during tile purchase when an email is provided)
- Any combination of the above — wallet and email can be linked post-hoc

---

## Identity Model

```
users
  user_id      TEXT PRIMARY KEY   -- permanent UUID, never changes
  email        TEXT UNIQUE        -- optional; required for login
  password_hash TEXT              -- PBKDF2 sha256 × 100k rounds
  salt         TEXT               -- random 16-byte hex per user
  wallet       TEXT UNIQUE        -- optional linked wallet
  username     TEXT
  avatar_emoji TEXT DEFAULT '🌍'
  is_guest     INTEGER DEFAULT 0  -- 1 = created during purchase, no password
  created_at   INTEGER
  last_seen    INTEGER

auth_tokens
  token        TEXT PRIMARY KEY   -- 32-byte hex bearer token
  user_id      TEXT
  created_at   INTEGER
  expires_at   INTEGER            -- 30-day rolling TTL
  user_agent   TEXT
```

---

## Token Flow

1. `POST /auth/register` or `POST /auth/login` → returns `{ token, user }`
2. Frontend stores token in `localStorage` as `cl-auth-token`
3. All subsequent requests include `Authorization: Bearer <token>` header
4. `GET /auth/me` → validates token, returns current user
5. `POST /auth/logout` → deletes token server-side

Token TTL is 30 days. A new token is issued on every login.

---

## Account Creation Flows

### 1. Email Registration
User fills in email + password on the Register tab of `AuthModal`.
- `POST /auth/register` → creates account, returns token + user
- Token stored in `localStorage`, user set in `authStore`

### 2. Wallet Connect (wallet-only account) — SIWE-signed
When a wallet connects and no email session exists, the account is created only
after the caller **proves control of the wallet** with a signed nonce (SIWE-style):

1. `POST /auth/wallet/nonce` `{ wallet }` → `{ nonce, message }`. The server stores
   the nonce in `wallet_nonces` and returns the canonical message to sign:
   `CryptoLand wants you to sign in with wallet <wallet>. Nonce: <nonce>`.
2. The wallet signs that message via EVM `personal_sign`.
3. `POST /auth/link-wallet-upsert` `{ wallet, signature, nonce }` → the server
   recovers the signer with `eth-account` and requires it to match `wallet`
   (case-insensitive); the nonce is consumed on use. On success it creates the
   wallet-only account (or returns the existing one) and returns `{ token, user }`.

**Dev bypass:** setting `ALLOW_UNSIGNED_WALLET_AUTH=1` skips signature verification
entirely (local/testing only). If `eth-account` is not installed **and** the bypass
is off, the wallet-signature endpoints return `501` rather than silently allowing.

### 3. Guest Account (purchase flow)
When a non-logged-in user enters an email during tile purchase:
- Frontend stores email in `gameStore.purchaseEmail`
- On finalize, `POST /np/finalize` receives `purchase_email`
- Server creates a `is_guest=1` account with no password
- `guest_account: { user_id, email, is_guest }` is returned in the response
- Frontend shows "Set a password" CTA via `GuestClaimModal`
- `POST /auth/guest-claim` converts guest → full account. **This now requires the
  guest's own bearer token** — the caller must be authenticated as the exact
  `user_id` being claimed, and that account must still be `is_guest=1` (else 403).

### 4. Linking Wallet to Email Account
After email login, when wallet connects:
- `POST /auth/link-wallet` → sets `wallet` on the authenticated user
- If wallet is already linked to another account → conflict error

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | — | Email + password registration |
| POST | `/auth/login` | — | Email + password login |
| GET | `/auth/me` | Bearer | Get current user |
| POST | `/auth/logout` | Bearer | Invalidate token |
| POST | `/auth/wallet/nonce` | — | Issue a SIWE nonce to sign → `{ nonce, message }` |
| POST | `/auth/link-wallet` | Bearer | Link wallet to email account |
| POST | `/auth/link-wallet-upsert` | Signature | Wallet-only account — requires `{ wallet, signature, nonce }` (SIWE); creates or returns existing |
| POST | `/auth/guest-claim` | Bearer (self) | Convert guest account (set password); caller must be the guest being claimed |
| PATCH | `/auth/profile` | Bearer | Update username / avatar / bio |
| GET | `/account/me` | Bearer | Full account dashboard (token auth — preferred) |
| GET | `/account/{wallet}` | Bearer + wallet-match | Full account dashboard; wallet must match caller's own (returns PII), else 403 |

> `POST /sessions/bind-wallet` also verifies wallet ownership via the same
> `{ signature, nonce }` SIWE flow before binding a wallet to a session.

---

## Frontend Files

| File | Role |
|------|------|
| `src/store/authStore.js` | Token storage, user state, login/register/logout/guestClaim actions |
| `src/components/AuthModal.jsx` | Login + register tabs; `GuestClaimModal` export for purchase flow |
| `src/lib/api.js` | `register`, `login`, `me`, `logout`, `linkWallet`, `linkWalletUpsert`, `guestClaim`, `updateProfile` |

### authStore state

```js
{
  user:          null,      // { user_id, email, wallet, username, avatar_emoji, is_guest, ... }
  token:         null,      // bearer token (also in localStorage)
  loading:       false,
  error:         null,
  authModalOpen: false,
  authModalTab:  'login',   // 'login' | 'register'
}
```

### Key actions

| Action | Description |
|--------|-------------|
| `tryRestoreAuth()` | Called on boot — loads token from localStorage, calls `/auth/me` |
| `login(email, pass)` | POST /auth/login, stores token, sets user |
| `register(email, pass, username)` | POST /auth/register, stores token, sets user |
| `logout()` | POST /auth/logout, clears token + user |
| `loginWithWallet(wallet)` | POST /auth/link-wallet-upsert, used on wallet connect |
| `linkWallet(wallet)` | POST /auth/link-wallet, links wallet to existing email account |
| `guestClaim(userId, pass, username)` | POST /auth/guest-claim, converts guest account |
| `setGuestUser(userData, token)` | Stores guest account returned during purchase |

---

## Boot Sequence

```
App mounts
  → tryRestoreAuth()          # restores session from localStorage token
  → initSession()             # creates anonymous affiliate session UUID

wallet connects
  → if authUser: linkWallet(wallet)          # attach wallet to email account
  → else: loginWithWallet(wallet)            # create/fetch wallet-only account
  → initUser(wallet)                         # load userStore profile + tiles
  → bindWallet(sessionId, wallet)            # affiliate session binding
  → loadMyCode(wallet)                       # load referral code
```

---

## Security Notes

- Passwords are hashed with PBKDF2: `hashlib.pbkdf2_hmac('sha256', pw.encode(), salt.encode(), 100_000)`
- Salts are 16-byte random hex per user
- Tokens are 32-byte random hex (`secrets.token_hex(32)`)
- `_safe_user()` strips `password_hash` and `salt` before returning user data
- No plaintext passwords ever stored or returned
- Token expiry: 30 days from issue

### Wallet-auth hardening (SIWE)

- Wallet sign-in requires a signed nonce. `POST /auth/wallet/nonce` issues a random
  16-byte nonce (stored in the `wallet_nonces` table); the wallet signs the canonical
  message; `link-wallet-upsert` / `sessions/bind-wallet` recover the signer via
  `eth-account` (`_recover_wallet` → `Account.recover_message(encode_defunct(...))`)
  and require it to equal the claimed wallet. The nonce is consumed on use.
- `ALLOW_UNSIGNED_WALLET_AUTH` env flag bypasses verification for dev/test only.
- If `eth-account` is unavailable and the bypass is off → `501` (never silently allow).

### Authorization on mutating endpoints (identity derived from the token)

The following now **require a bearer token** and derive the acting identity from it —
client-supplied `owner` / `seller` / `voter` / `weight` fields are ignored or rejected:

- `POST /blocks`, `PATCH /blocks/{tile_key}` — owner = the authed user; edits require
  DB ownership (`_owns_block`).
- `POST /guardian`, `DELETE /guardian/{tile_key}` — must own the tile.
- `POST /marketplace/list`, `DELETE /marketplace/{tile_key}` — must own the tile;
  stored seller is the caller's identity.
- `POST /dao/vote` — voter = authed user; weight = number of tiles owned (min 1).
- `POST /affiliate/redeem` — always applies to the caller's own balance.
- `GET /account/{wallet}`, `/affiliate/*/{wallet}` — require auth **and** the wallet to
  match the caller's own (prefer the `/me` variants).
- `/np/finalize` and `/np/ipn` bind `payment_id ↔ tile ↔ amount`, are single-use
  (`payments.consumed_at`), use the server-stored `payments.price_usd`, and the IPN
  fails **closed** on a missing/invalid signature.
