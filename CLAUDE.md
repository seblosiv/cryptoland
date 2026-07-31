# CLAUDE.md — CryptoLand

Operating manual for this repo. Read top to bottom before doing anything.

---

## 0. CRITICAL RULES — READ FIRST

### 🔴 Research = self-hosted SearXNG ONLY. NEVER WebSearch / WebFetch.

This applies to **you and every subagent you spawn**. There is no "quick lookup"
exception, no "just checking a version number" exception. The user has flagged this
emphatically and repeatedly.

SearXNG runs as a docker container on the prod box, bound to `127.0.0.1:8888` (not
reachable from this laptop directly — there is no local docker). Query it over SSH:

```bash
ssh sociala-prod 'curl -s "http://127.0.0.1:8888/search?q=<url-encoded-query>&format=json"'
```

Optional `&categories=science`. ~83 engines (brave, duckduckgo, google scholar/cse,
arxiv, pubmed, github), ~1s/query. The box is 2 cores / 4 GB / no swap — **batch
queries sequentially**, do not fan out many parallel SSH sessions. Reference sweep
script on the box: `/root/Taste/research/sweep.py`.

If you spawn a subagent that may need research, tell it this rule explicitly in its
prompt. Subagents do not inherit it automatically.

### 🔴 No glassmorphism. Ever.

The UI is **solid dark**: opaque near-black surfaces (`--bg #0f0f0f`, `--s1 #141414`,
`--s2 #1a1a1a`, `--s3 #222222`, `--s4 #2a2a2a`), white-alpha hairline borders
(`--b0/--b1/--b2`), and a single green accent for active/selected state. It should
read like a native dark mobile app.

`grep -rn "backdrop-filter\|backdrop-blur" src/` returns **zero** — keep it that way.
The user has rejected frosted/blurred/translucent panels repeatedly. Do not
reintroduce them, not even "subtly". See `documentation/styling.md`.

### 🔴 Update `documentation/` after every code change.

Standing user convention. A code change without the matching doc update is an
incomplete change. The relevant file is usually one of `documentation/`
{`architecture`, `backend`, `frontend`, `blockchain`, `multichain`, `auth`,
`styling`, `grants`, `game-mechanics`, `guardian`, `affiliate`, `viral`}`.md`.

### 🔴 Never commit secrets or databases.

- `server/.env` holds **live NOWPayments API key + IPN secret**.
- `cryptoland.db` / `server/cryptoland.db` hold live game and payment data.
- `.gitignore` covers `.env`, `.env.*`, `server/.env*`, `*.db`, `*.sqlite*`,
  `__pycache__/`, `dist`, `dist-*/` — with `!env/` and `!env/.env.*` re-included so
  the **blank** per-chain templates stay committed.

Before any commit: `git diff --cached --name-only` and confirm no `.env`, no `*.db`,
no `__pycache__`. `.gitignore` is a safety net, not a substitute for looking.

---

## 1. What this is

CryptoLand is a geospatial NFT game: a MapLibre world map divided into a
16384 × 16384 (Z14) tile grid where players buy, customize, trade, raid and govern
real-world territory, with AI "Guardian" agents defending it. Frontend is React 19 +
Vite 8 + Zustand 5 + MapLibre GL 5 + Tailwind 4; backend is FastAPI + SQLite
(`aiosqlite`), a single 3.8k-line `server/main.py` plus `guardian.py`,
`price_events.py`, `viral.py`. Crypto payments go through NOWPayments, proxied
server-side so the API key never reaches the browser. The whole thing is built as
**N chain-native bundles from one codebase** (one target chain per build, selected at
build time) so it can be submitted to ~52 blockchain grant and accelerator programs
as a first-class native app on each chain.

---

## 2. Commands

```bash
# Frontend (repo root)
npm run dev                     # vite dev server on :5173, opens browser, proxies API → 127.0.0.1:8000
npm test                        # vitest run — 7 files, 335 tests (incl. cross-chain contract conformance)
npm run test:watch
npm run test:coverage           # v8, scoped to src/lib/nowpayments.js + src/store/gameStore.js
npm run lint                    # eslint . — see §8, ~90 PRE-EXISTING errors
npm run build                   # generic build → dist/
npm run build:chain <chain>     # chain-native build → dist-<chain>/
npm run build:all-chains        # all 27 chain targets

# Per-chain deployment (build + seed + nginx/Caddy config → deploy/out/)
./scripts/deploy-chain.sh <chain> --seed
./scripts/deploy-chain.sh all --seed

# Pre-flight before a submission round: is every chain's RPC reachable FROM A
# BROWSER? (checks response + body + Access-Control-Allow-Origin, exits 1 if any
# chain has no working endpoint). ~50 live calls, deliberately NOT in npm test.
node scripts/check-rpcs.mjs

# Seed one chain's world (chain-correct addresses, realistic retention)
python3 server/seed_chain.py --chain algorand --db server/cryptoland.db --users 120 --reset
npm run preview

# Verify every contract where ALL toolchains exist (prod box: 14 passing, 0 skipped).
# The laptop cannot verify Tezos — ligo ships a Linux-only binary.
./scripts/verify-on-prod.sh

# Contract tests — every chain has an executable suite (436 tests total)
cd contracts        && npx hardhat test          # EVM, 34 — covers all 17 EVM chains
cd contracts/ton    && npm test                  # TON,  9 — REAL TVM via @ton/sandbox
cd contracts/starknet && scarb cairo-test        # 5
cd contracts/sui    && sui move test             # 1
cd contracts/aptos  && aptos move test --named-addresses cryptoland=0x1   # 4
cd contracts/cardano && aiken check              # 4
cd contracts/tezos  && ligo run test test_cryptoland.mligo                # 3
cd contracts/algorand && python3 cryptoland_tile.py                       # self-check
for d in solana/programs/cryptoland-tile near stellar multiversx radix; do
  (cd contracts/$d && cargo test)                # 6 / 5 / 5 / 4 / 5
done
python3 -m pytest server/tests -q                # backend §4 invariants, 23

# Backend (from server/)
pip install -r requirements.txt
uvicorn main:app --reload       # binds 127.0.0.1:8000
python main.py                  # equivalent; honours HOST / PORT env (defaults 127.0.0.1 / 8000)
```

Key backend env (`server/.env`, see `server/.env.example`):

| Var | Meaning |
|---|---|
| `CRYPTOLAND_DB` | Absolute path to this deployment's SQLite file. Defaults to `server/cryptoland.db`. **This is how per-chain deployments get isolated data.** |
| `NOWPAYMENTS_API_KEY` / `NOWPAYMENTS_IPN_SECRET` | Live payment credentials. Never commit. |
| `SERVER_URL` | Public origin used for IPN callbacks. Default `http://127.0.0.1:8000`. |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins; `*` in dev. |
| `ALLOW_UNSIGNED_WALLET_AUTH` | Dev-only escape hatch that skips SIWE signature verification. **Default OFF. Never enable in production.** |
| `HOST` / `PORT` | Only read by the `python main.py` entry point. |

**`eth-account` must be installed** (`eth-account>=0.11,<0.14`, in
`server/requirements.txt`) for wallet-signature auth. It is imported in a `try/except`
at the top of `main.py`; if it is missing and `ALLOW_UNSIGNED_WALLET_AUTH` is off, the
wallet endpoints return **501** rather than silently allowing unverified logins.

---

## 3. Architecture

### 3.1 The per-chain build model

One codebase → one `VITE_CHAIN` per build → a chain-native bundle in `dist-<chain>/`.
There is **no runtime chain switcher** and that is deliberate (see
`documentation/multichain.md` → "Why build-time-per-subdomain beats runtime hostname
detection").

`scripts/build-chain.sh <chain>` copies `env/.env.<chain>` → `.env.production`, then
runs `npx vite build --outDir dist-<chain>`. `env/` holds one **blank** template per
target (they are dotfiles — list them with `ls -A env/`), currently **31**:

```
EVM      polygon avalanche base arbitrum ronin bnb optimism scroll celo moonbeam
         beam oasys skale hedera injective mantle taiko rootstock flare
non-EVM  solana ton aptos sui starknet cardano near stellar algorand multiversx
         radix tezos
```

Ownership is **DB-canonical**: within a build, the SQLite `blocks` table is the source
of truth and the `chain` column records which chain wrote the row. The chain is a
payment rail plus an optional on-chain anchor — not the ledger of record.

### 3.2 Chain config (`src/lib/blockchain/config.js`)

`defineChain(key, cfg)` is a factory that derives per-chain env var names from the
chain key (upper-cased, `-` → `_`) and applies defaults:

| Env var | Purpose |
|---|---|
| `VITE_CONTRACT_<KEY>` | NFT contract / module / package address. Blank ⇒ mint stays stubbed. |
| `VITE_MARKETPLACE_<KEY>` | Marketplace contract address (optional). |
| `VITE_TOKEN_<KEY>` | `$CLND` token address (optional). |
| `VITE_RPC_<KEY>` | Override the default public RPC with a paid endpoint — **no code change needed**. |

Selection: `ACTIVE_CHAIN_KEY = VITE_CHAIN if it's a CHAINS key else 'polygon-amoy'`
(safe fallback so a misconfigured build still boots). Also exported:
`ACTIVE_CHAIN`, `ACTIVE_CHAIN_FAMILY`, `ACTIVE_CHAIN_CANONICAL`, `CHAINS`,
`MAINNET_CHAINS`, `CHAIN_FAMILIES`, `CHAIN_CANONICAL_NAMES` (identity map),
`chainById()`, `explorerTxUrl()`, `explorerNFTUrl()`.

`vite.config.js` marks every optional per-chain wallet SDK **external** — they are
dynamically imported at runtime only by the family that needs them, so a build does
not fail when a package that chain does not use isn't installed.

### 3.3 The adapter interface

`src/lib/blockchain/index.js` dynamically imports `adapters/<family>.js` for
`ACTIVE_CHAIN.family` and re-exports its interface. **Consumers always
`import { … } from '../lib/blockchain'` — never from an adapter directly.**

Every adapter must export all 24 of:

```
connect  disconnect  getAddress  getChainId  switchChain
signMessage  signPurchase
mintTile  listForSale  unlistTile  buyTile
ownerOf  getTileData  getOwnedTokenIds  totalSupply  waitForTx
onAccountsChanged  onChainChanged  onDisconnect  removeListeners
detectWallets  tileTokenId  tokenIdToTile  ADAPTER_TYPE
```

`src/test/chains.test.js` **enforces this** — it parses every
`src/lib/blockchain/adapters/*.js` (excluding `_*`) for exported names and fails on any
missing symbol, asserts every chain entry has every required field, asserts EVM chain
ids are numeric and unique, asserts an adapter file exists for every family in
`CHAIN_FAMILIES`, and asserts the tokenId encoding matches the Solidity contract.

> **A new chain is NOT done until `npm test` passes.** A missing export silently
> yields `undefined` from the destructure in `index.js` and only explodes at call time,
> on that one chain's build. This has already happened once (`solana.js` was missing
> `getAddress`, `switchChain`, `tileTokenId`, `tokenIdToTile`).

`adapters/_shared.js` holds the pieces every non-EVM adapter reuses:
`tileTokenId` / `tokenIdToTile` (bit-packed `(BigInt(tx) << 15n) | BigInt(ty)`,
**the same scheme as `evm.js` and `contracts/CryptoLandTile.sol`**),
`hasContract()` = `Boolean(ACTIVE_CHAIN.contractAddress)`, and `mintStub(reason)` =
`{ txHash: null, tokenId: null, minted: false, reason }`.

Adding a chain: (1) `CHAINS` entry in `config.js`; (2) if EVM, nothing else — `evm.js`
covers it; (3) if a new family, write `adapters/<family>.js` and register it in the
`ADAPTERS` map in `index.js`; (4) add `env/.env.<chain>`; (5) add the key to the
`CHAINS=(…)` array in `scripts/build-chain.sh`; (6) `npm test`.

### 3.4 The presentation layer

`src/config/profiles.js` is **data only**: one declarative override entry per chain
(`tagline`, `pitch`, `connectLabel`, sometimes `wallets` / `features` / `accent`).
`src/lib/chainProfile.js` merges `PROFILES[ACTIVE_CHAIN_KEY] ?? {}` over neutral
defaults derived from the chain's `CHAINS` entry, plus `WALLETS_BY_FAMILY` fallbacks
for all 13 families. **Import the merged `PROFILE` from `chainProfile.js` — never
`PROFILES` directly.**

`applyProfileTheme()` writes, once at boot:

```
--chain-accent      = PROFILE.accent
--chain-accent-dim  = PROFILE.accent + '22'      # string concat ⇒ accent MUST be 6-digit #rrggbb
data-chain          = ACTIVE_CHAIN_KEY            # CSS hook [data-chain="ton"]
data-family         = ACTIVE_CHAIN.family         # CSS hook [data-family="evm"]
```

> **Theming = ACCENT colour + COPY only.** Never a different visual language, never a
> new surface treatment, never per-chain CSS files or per-chain components. A chain
> with no `PROFILES` entry is not broken — it renders neutral CryptoLand branding in
> that chain's own colour. Universality is preserved by construction.

Two profiles override `accent` to `#ffffff` on purpose: `skale`/`skale-europa`
(`#000000` vanishes on dark) and `hedera` (`#222222` is unreadable on dark).

### 3.5 Deployment: two models

1. **One DB per chain (preferred).** Each deployment runs its own backend with
   `CRYPTOLAND_DB=/srv/cryptoland/<chain>.db`. Ownership cannot collide across chains,
   and `GET /metrics/grant` on that deployment reports exactly that chain's numbers —
   which is what a grant report asks for. `VITE_SCOPE_TO_CHAIN` stays unset.
2. **One shared backend.** Set `VITE_SCOPE_TO_CHAIN=1` in that build's env. The store
   (`src/store/gameStore.js`, `loadBlocksFromServer`) then passes
   `ACTIVE_CHAIN_CANONICAL` as the `chain` query param to `/blocks` and `/stats`, so an
   Algorand build never renders Polygon's tiles or stats. Without it, every per-chain
   frontend would show the same shared world.

Each `dist-<chain>/` is a plain static bundle (SPA rewrite: unknown paths →
`index.html`). Set `VITE_API_BASE` in `env/.env.<chain>` **before** building.

---

## 4. Security invariants — DO NOT REGRESS

| Invariant | Why |
|---|---|
| **SIWE wallet auth: nonce → sign → recover, nonce is single-use.** `POST /auth/wallet/nonce` issues `token_hex(16)` stored in `wallet_nonces`; `_verify_wallet_ownership()` requires the nonce to exist for that wallet, recovers the signer from the personal_sign signature (case-insensitive compare), and **deletes the nonce regardless of downstream success**. | Without single-use nonces a captured signature replays forever. Without `eth-account` the path returns 501, never "allow". |
| **Every mutating endpoint derives identity from the Bearer token and ignores client-supplied `owner` / `seller` / `voter` / `weight`.** `_require_auth(request, db)` is called inside the handler; `POST /purchase` sets owner from `user.wallet ?? user.user_id`; marketplace list/unlist 403s a `seller` that isn't the caller; DAO vote ignores `voter` and computes `weight` server-side from tiles owned (min 1); affiliate redeem 403s a `wallet` that isn't the caller's. | These fields exist in the request models only for backwards compatibility. Trusting any one of them is free identity theft — free tile claiming, selling someone else's tile, or vote stuffing. |
| **`POST /np/finalize` binds `payment_id` to tile AND amount, and is single-use.** Validates `0 ≤ tx,ty ≤ 16383` and that `tile_key == f"{tx}:{ty}"`; looks up the stored payment; 409 on tile mismatch; 409 if `consumed_at` is set; 402 if the NOWPayments-reported `price_amount` is below 95% of the **server-stored** `price_usd`; re-checks consumption inside a `BEGIN EXCLUSIVE` transaction. The block is written with the server-stored price, never `req.price`. | Otherwise one $1 payment finalizes any tile at any price, repeatedly. |
| **`POST /np/ipn` fails CLOSED.** When `NOWPAYMENTS_IPN_SECRET` is set, a missing signature → 401 and an invalid HMAC-SHA512 (over the raw body, `hmac.compare_digest`) → 401 — **the body is never parsed or acted on** before verification. | An open webhook mints free tiles for anyone who can POST. |
| **Telegram `initData` HMAC: `secret_key = HMAC_SHA256(key=b"WebAppData", message=<bot_token>)`, then compare `HMAC_SHA256(secret_key, data_check_string)`.** The key/message inversion is the single most common implementation bug; `main.py` documents it inline at the call site. `initDataUnsafe` is never trusted. | Getting it backwards makes every forged `initData` validate. |
| **Money math in integer cents.** `_to_cents()` / `_from_cents()`; affiliate commission is `_from_cents(round(_to_cents(usd) * COMMISSION_RATE))`; redeem compares and subtracts in cents. | Float accrual drifts, and a drifting balance ledger is a payout bug. |
| **Server binds `127.0.0.1` by default** (`HOST` env, default `"127.0.0.1"`). | The backend holds payment credentials and the full DB; it goes behind a reverse proxy, never straight onto `0.0.0.0`. |

Also: `slowapi` rate limits are applied per endpoint (e.g. `20/minute` on `/purchase`);
`/blocks` bounds `limit` to 20000 so it can never return an unbounded table; CORS
allows only `Authorization`, `Content-Type`, `X-Session-ID` headers.

---

## 5. Chains — the real numbers

`src/lib/blockchain/config.js` defines **59 chain entries = 33 mainnet + 26 testnet,
across 13 adapter families**. 35 entries (21 mainnet) are `family: 'evm'` and share the
single `adapters/evm.js`.

> **Mantle, Taiko, Rootstock and Flare were added 2026-07-31** purely to reach four
> open grant programmes we had no chain for. Because they are EVM, the entire
> integration was a `CHAINS` entry, an `env/` template and a build target — no
> adapter, no contract, no tests beyond the parameterised ones that picked them up
> automatically (335 → 351). Every id and RPC was verified against a live
> `eth_chainId` with an Origin header before being committed.
>
> They have **no logomark yet** (`src/components/logos/`), so they render the
> neutral mark in their own accent — which the design system tolerates by
> construction. Families: `evm`, `solana`, `ton`, `aptos`, `sui`, `starknet`,
`cardano`, `near`, `stellar`, `algorand`, `multiversx`, `radix`, `tezos`.

Build targets are **27** — every mainnet chain except `ethereum` (a general EVM target
with no named grant) and `skale-europa` (the SKALE grant build is the Nebula hub).

**Deliberately NOT shipped** — each has a `NOTE` comment in `config.js` where the entry
would otherwise sit; read it before "adding the missing chain":

- **Kadena** — organization ceased operations Oct 2025, Chainweb EVM never reached
  mainnet, the documented testnet host no longer resolves, and Kadena has no entry in
  `ethereum-lists/chains`. Grant program #39 is not actionable.
- **Aztec** — per Aztec's own docs: unaudited with "critical bugs expected",
  under-constrained circuits, privacy not guaranteed, state does not survive rollup
  upgrades, no standard NFT contract, and **no arbitrary-message signing** — so
  `signMessage` / `signPurchase` and therefore our wallet login cannot work at all.
- **Celestia** — a data-availability layer, not a wallet chain. Program #32 needs a
  sovereign-rollup narrative, not a deployment.

**SKALE testnets are unreachable** (proxy host has no A records; a sibling host serves
an unrelated TLS cert), so only the two mainnet hubs are configured: Nebula Gaming Hub
(`1482601649`) and Europa (`2046399126`). Both are `gasless: true` — sFUEL is a
valueless faucet token, so suppress all fee UI on those builds.

Other verified corrections already baked into config (do not "fix" them back):
Injective's canonical EVM is **1776**, not the dead Caldera inEVM 2525; Celo's
Alfajores (44787) is decommissioned in favour of **Celo Sepolia 11142220**; Tezos
Ghostnet is gone, replaced by **Shadownet**; Hedera's explorer uses `/transaction/`;
Beam is a subnet-evm that mints blocks on demand so `blockTime` is not a UX timeout.

---

## 6. Grant work

> 🔑 **`deploy/apex/programs.mjs` is now the single source of truth for all 52
> programmes** — status, deadline, evidence quote and the date that status was last
> verified. It renders into `xono.ai/status` and exports `programs.csv`. Update it
> there, not in prose. As of 2026-07-31: **60 programmes** — 42 open, 3 rolling,
> 1 restructuring, 2 by-proposal, 2 no-form, 8 dead, 2 blocked. **45 actionable,
> nothing unknown.**
>
> The list is NOT fixed. 52 was one July dossier; diffing against five grant
> aggregators surfaced 83 names it never mentioned, 8 of which verified open —
> four of them EVM chains, which for us is a `CHAINS` entry, not an integration.
> Re-run the aggregator diff each round (`documentation/program-requirements.md` §16).
>
> A second rule, learned the hard way: **a foundation that shuts a grants council
> rarely stops funding — it renames.** Always ask "what replaced it?" before
> writing a programme off. That question alone revived Base (→ Base Batches,
> $10k + a shot at $50k, and its startup track explicitly fits a pre-seed team
> that has raised <$250k), Algorand (→ xGov) and Animoca (→ the $10M Minds
> programme). See `documentation/program-requirements.md` §15.
>
> The decisive research technique is **Discourse governance forums**
> (`/search.json?q=grant`), not marketing pages: funding a programme requires a
> public proposal, so a forum cannot go quietly stale the way a landing page can.
> Absence of grant threads is itself evidence a programme is gone. See
> `documentation/program-requirements.md` §14.

**`documentation/grants.md` carries the per-programme strategy notes** — chain
requirement, max amount, equity, readiness, and §0 "status corrections" (TON grants
paused, Optimism Retro Funding paused, Gitcoin restructured onto Giveth, etc.). Do not
re-derive any of it; update it if you learn something new (via SearXNG).

`GET /metrics/grant?days=30` supplies the traction numbers to cite: DAU/WAU/MAU, a
daily activity timeseries, D1/D7 retention, purchase + volume totals, per-chain
breakdown, engagement depth. Cite real output, never estimates.

> 🔑 **Deployer-key warning.** Both **Avalanche Retro9000** and **Optimism OP Atlas**
> require the **ORIGINAL deployer address to sign a message** to claim ownership of
> your contracts. A throwaway or lost deployer key permanently and unrecoverably
> forfeits attribution — and therefore the grant. Use a retained, backed-up deployer
> key, one per project, never shared across factories, and record it before deploying
> anything on any chain.

---

## 7. State of play

Done and working:

- Full game loop against the DB: map, tile purchase (crypto via NOWPayments and a
  no-payment path), customization, marketplace, guardians/raids, DAO voting, affiliate
  commissions, token panel, viral/squad/drop features, search, empire pages.
- Auth: email/password (PBKDF2-SHA256, 100k iterations), guest accounts, SIWE wallet
  sign-in, Telegram Mini App `initData` verification.
- 55 chain entries / 13 adapter families / 27 chain build targets, all adapters
  contract-tested. Per-chain presentation layer with profiles for every mainnet chain.
- Grant matrix for 52 programs; `/metrics/grant`; conversion-funnel instrumentation
  (`page_view → tile_click → purchase_open → payment_start → payment_confirmed`, plus
  `nft_mint`, `guardian_deploy`, `raid_launched`).
- **Chain-native onboarding**: `ChainOnboarding` (3-step flow) + `ChainHero` (six CSS
  motifs: `grid`/`mesh`/`rays`/`orbit`/`waves`/`hex`) + `src/components/logos/` (28
  inline SVG logomarks, **monochrome and painted with `currentColor`** so `ChainMark`
  tints them via the chain accent — that uniformity is what makes 29 builds read as
  one design system). Copy, accent, wallets, fee note and a player-facing
  `grantAngle` all come from `src/config/profiles.js`, plus two fields that carry the
  native signal: `onboarding.nativeTerm` (what a tile IS in that ecosystem's own
  vocabulary — "an Algorand Standard Asset (ASA)", "a Move object", "an FA2 token";
  **must match what we actually deploy** — Hedera says "an ERC-721 NFT on Hedera",
  not an HTS NFT) and `onboarding.chainStat` (`{ value, label }`, one true checkable
  fact grounded in `config.js` — **never TPS, user counts or funding figures**). All
  29 mainnet profiles set `connectLabel`, `hero` and a full `onboarding` block; see
  `documentation/multichain.md` → "Chain-native onboarding" / "The logomark system".
- **Per-chain deployment**: `scripts/deploy-chain.sh` stages a bundle, a seeded DB, an
  nginx block and a Caddyfile entry per subdomain, with a stable backend port per chain.
- **Per-chain seed data**: `server/seed_chain.py` — chain-correct addresses, real city
  clustering, long-tail holdings, and retention modelled per user (~D1 42% / D7 27%).
  All 29 chains are seeded locally so no build shows an empty map.
- **Per-chain link previews**: a vite plugin rewrites `<title>` + OG/Twitter tags at
  build time from `config.js` / `profiles.js`.
- `LICENSE` (MIT) and `public/{terms,privacy}.html` — the latter two are referenced by
  `tonconnect-manifest.json` and previously 404'd.
- `npm test` green: 6 files, **250 tests**. All 27 chain build targets clean.
- **Derived accent palette.** `applyProfileTheme()` writes `--chain-accent` (brand
  hex, for fills), `--chain-accent-ink` (a label readable ON it) and
  `--chain-accent-ui` (the accent lightened only as far as needed to clear 4.5:1
  on `--s1`). Four brand colours were unreadable as body text — Cardano 1.82:1,
  Radix 1.87:1, Stellar 2.91:1, Base 3.20:1 — and deriving beats hand-overriding
  because it survives chain #30. `src/test/theme.test.js` (90 assertions) fails
  the build on an unreadable accent. **Use `-ui` for text, `-ink` for a label on
  the accent, plain `--chain-accent` only for fills.**
- **Scoping is one constant.** `CHAIN_SCOPE` in `src/lib/api.js` is the single
  derivation of `VITE_SCOPE_TO_CHAIN ? ACTIVE_CHAIN_CANONICAL : null`, and every
  scoped helper defaults to it. `VITE_SCOPE_TO_CHAIN=1` now ships in all 27 `env/`
  templates (a no-op under one-DB-per-chain, required against a shared backend).
- **The map is chain-native.** City lights are `mixWhite(0.35/0.68/0.93)` from the
  accent — hue from the chain, luminance from the mix, so a navy accent still
  reads as light. Interaction affordances take `ACCENT_UI_HEX`. `fitToWorldOnce()`
  frames the opening shot on the 2nd–98th percentile of tile positions, padded
  past the market sidebar.

Known gaps — be honest about these, do not paper over them:

- **Mainnet is unfunded — but testnet verification is DONE for Stellar.** The
  contract is live on Stellar testnet
  (`CBVB7GK65CN2KB4NMQ3CGC6LIHFQU7IZ46KWZTUHKAFLO4BT6EBB4FFW`) with **18/18 checks
  passing**, including the one that cannot be unit-tested: `withdraw` paying a
  *separate cold wallet* (10000 → 10010 XLM) while the owner gained only gas. See
  `documentation/contract-audit.md` and `deploy/apex/deployments.mjs`.
  > **Testnets are free.** Treating "nothing deployed" as blocked on funding was
  > wrong — *mainnet* is blocked on funding; verification never was. Deploy every
  > remaining chain to its testnet before asking for money.
  >
  > It immediately caught a defect no test could: the `wasm32-unknown-unknown`
  > artifact is **rejected** by the Soroban host ("reference-types not enabled").
  > Soroban needs `wasm32v1-none`. **A green test suite is not a deployable
  > artifact** — assume NEAR, Radix and MultiversX have their own version of this.
- **Three chains are live on testnet; 31/31 on-chain checks pass.** Stellar
  (`CBVB7GK65…`), **EVM on Oasys** (`0x52785B7e…` — the same bytecode all 17 EVM
  chains use), and NEAR (`cryptoland-ms86s8tc.testnet`).
  > 🔴 The EVM deployment found a bug **39 unit tests had missed**:
  > `tokenIdFromKey` had no bounds check, so `tokenIdFromKey(0, 32768)` and
  > `tokenIdFromKey(1, 0)` **both returned 32768** — one id, two tiles — and
  > `claimTile` accepted any raw uint256, making `2^200` claimable. Fixed, with
  > 5 regression tests. **Three deployments have now produced three defects no
  > test could reach. Deploy early.**
- **The other 20 testnets are faucet-blocked, not code-blocked.** Oasys was the
  only EVM faucet without a captcha, login, mainnet-balance or puzzle gate; NEAR's
  helper funds an account from a plain POST; Solana devnet is globally degraded.
  See `deploy/apex/deployments.mjs` for the per-chain reason.
- **On-chain activity is ~1 tx per purchase**, which is structurally uncompetitive
  for retroactive rounds (Retro9000 ranks by AVAX burned by your contracts; OP's
  template wanted ≥1,000 tx / ≥420 addresses / ≥10 active days over 180 days).
  Competing needs recurring gameplay moved on-chain — a product decision, written up
  in `documentation/grants.md` §7. Not a config change.
- **Seeded data is demo data.** All 27 chains are seeded so no build looks empty, and
  `/stats` returns 27 genuinely distinct triples — but those owners are generated
  addresses. Say plainly in any application which numbers are seeded and which are
  organic. A reviewer who discovers the difference on their own is a lost grant.
- **94 ESLint errors + 27 warnings are pre-existing, not regressions**: 58
  `no-unused-vars`, 18 `no-empty`, plus `react-hooks` warnings. `npm run lint` is not
  a clean gate — compare counts before/after your change rather than expecting zero.
- **Public RPCs rot and it is invisible.** `scripts/check-rpcs.mjs` checks response +
  body + CORS across 52 endpoints. It has already caught six Ankr endpoints returning
  HTTP 200 with a JSON-RPC error body, a Cloudflare 521, an NXDOMAIN, Polygon's own
  primary answering 401, and — most recently — **Sui deprecating JSON-RPC on public
  fullnodes entirely**. It is a manual pre-flight: **run it before every submission**.
- **Cardano's live badge is a CERTIFIED height, not the tip.** Koios sends no
  `Access-Control-Allow-Origin`, so the browser cannot read it; the badge uses Mithril
  (`statusUrl`), which lags ~100 blocks and is labelled as such. Do not "fix" the
  label to say live.
- **Stale docs to distrust:** `.env.example` lists only the original 11 chains (the
  per-chain templates in `env/` are current — they are dotfiles, so use `ls -A env/`).
  `documentation/` was swept 2026-07-25 and again 2026-07-31; treat it as current, and
  if you find a contradiction, **the code wins and the doc needs fixing**.
- **No public git remote yet.** `LICENSE` (MIT) exists; Gitcoin/Giveth QF (#2) needs
  the repo actually published.

Recent history (`git log --oneline`, newest first): `812d6af` per-chain link previews +
legal pages + licence · `d6fbe03` per-chain seed data + subdomain deploy tooling ·
`cba0a78` 28 SVG logomarks + 3-step chain-native onboarding · `6db046b` CLAUDE.md +
submission playbook + doc accuracy sweep · `5d90c81` per-chain deployment isolation ·
`d0fbb56` 8 non-EVM adapters + presentation layer · `67103be` initial commit.

Suggested next steps, in order of leverage: publish the repo (the licence is done —
this unblocks #2/#34 framing), deploy and verify one contract with a **retained**
deployer key on the cheapest target and flip `VITE_CONTRACT_<CHAIN>`, then move daily
check-in on-chain to start accruing the activity retroactive rounds actually score.
Deployment mechanics live in [documentation/deployment.md](documentation/deployment.md);
which programme to target is in [documentation/submitting-grants.md](documentation/submitting-grants.md).
