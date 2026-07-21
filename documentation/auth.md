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

### 2. Wallet Connect (wallet-only account)
When a wallet connects and no email session exists:
- `POST /auth/link-wallet-upsert` → creates wallet-only account if none exists, or returns existing
- Token stored, user set in `authStore`

### 3. Guest Account (purchase flow)
When a non-logged-in user enters an email during tile purchase:
- Frontend stores email in `gameStore.purchaseEmail`
- On finalize, `POST /np/finalize` receives `purchase_email`
- Server creates a `is_guest=1` account with no password
- `guest_account: { user_id, email, is_guest }` is returned in the response
- Frontend shows "Set a password" CTA via `GuestClaimModal`
- `POST /auth/guest-claim` converts guest → full account

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
| POST | `/auth/link-wallet` | Bearer | Link wallet to email account |
| POST | `/auth/link-wallet-upsert` | — | Wallet-only account (creates or returns existing) |
| POST | `/auth/guest-claim` | — | Convert guest account (set password) |
| PATCH | `/auth/profile` | Bearer | Update username / avatar / bio |
| GET | `/account/me` | Bearer | Full account dashboard (token auth) |
| GET | `/account/{wallet}` | — | Full account dashboard (wallet, backwards compat) |

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
