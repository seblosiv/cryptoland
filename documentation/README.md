# CryptoLand Documentation

> **Own the World** — A blockchain-based geospatial land registry game.
> Buy real Earth map tiles with crypto. **268,435,456 blocks** (Z14, 16384 × 16384).
> One owner each.

## Where to start if you are new

Read [`../CLAUDE.md`](../CLAUDE.md) at the repo root first — it is the short orientation
for anyone (or any agent) touching the code: conventions, invariants, and the rules that
must not be broken. Then read [architecture.md](architecture.md) for how the pieces fit
together, and [grants.md](grants.md) for *why* the codebase is shaped the way it is —
one codebase producing N chain-native builds, because the product is submitted to 52
blockchain grant programs. Almost every architectural decision in this repo traces back
to that constraint.

After that, pick the doc for the area you are changing from the index below.

---

## Documentation index

### Start here

| File | Contents |
|------|----------|
| [architecture.md](architecture.md) | System overview, tech stack, data flow, component tree — the map of everything else |
| [review.md](review.md) | Full codebase review — what works, bugs fixed, known limitations |
| [game-mechanics.md](game-mechanics.md) | The Z14 tile grid, geo-economic pricing, purchase flow, currencies |

### Architecture

| File | Contents |
|------|----------|
| [backend.md](backend.md) | FastAPI server, SQLite schema, every REST endpoint, accounts + affiliate internals |
| [frontend.md](frontend.md) | React components, Zustand store, lib utilities, entry points |
| [auth.md](auth.md) | Universal identity model — `user_id` UUID, email / wallet / guest accounts, linking |
| [blockchain.md](blockchain.md) | Chain-agnostic adapter pattern, `CryptoLandTile.sol`, SIWE wallet auth |
| [styling.md](styling.md) | Design tokens, the solid-dark theme, CSS classes, animations (**no glassmorphism**) |
| [map-overlay.md](map-overlay.md) | How purchased block images render on the map — and why `maplibregl.Marker` was abandoned |

### Multichain & grants

| File | Contents |
|------|----------|
| [multichain.md](multichain.md) | One codebase → N chain-native builds: adapters, chain profiles, deployment topology, per-chain deploy steps |
| [grants.md](grants.md) | The 52-program matrix — chain requirements, status corrections, non-chain gates, the on-chain-impact gap |
| [submitting-grants.md](submitting-grants.md) | The practical playbook: prerequisites, per-application checklist, recommended order, application copy, tracker |

### Features

| File | Contents |
|------|----------|
| [guardian.md](guardian.md) | Guardian Agent system — autonomous AI agents that defend tiles, earn yield, and raid |
| [affiliate.md](affiliate.md) | 30% commission affiliate program — codes, referral tracking, 5-layer fraud prevention |

### Reference

| File | Contents |
|------|----------|
| [viral-strategy.md](viral-strategy.md) | 2026/27 viral strategy — competitive intelligence and the growth thesis |
| [viral.md](viral.md) | **Frontier edition** — reverse-engineered 2024–2026 viral primitives + the 4 mechanics shipped |

---

## Quick Start

```bash
# Terminal 1 — Backend (FastAPI + SQLite)
cd server
pip install -r requirements.txt
uvicorn main:app --reload

# Terminal 2 — Frontend (Vite + React)
npm install
npm run dev
```

Frontend: `http://localhost:5173`
Backend: `http://127.0.0.1:8000`
API docs: `http://127.0.0.1:8000/docs`

> The Vite dev server proxies every API path (`/blocks`, `/stats`, `/np`, `/health`,
> `/guardian*`, `/marketplace`, `/nft`, `/dao`, `/token`, `/auth`, `/account`,
> `/analytics`, `/price-events`, `/news`, `/alerts`, …) to the FastAPI backend — no CORS
> issues in dev. The full list is in `vite.config.js`.

### npm scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server on :5173 with the API proxy |
| `npm run build` | Generic production build → `dist/` |
| `npm run build:chain <chain>` | Chain-native build → `dist-<chain>/` (`scripts/build-chain.sh`) |
| `npm run build:all-chains` | Build all 27 chain targets |
| `npm test` | Vitest, single run |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:coverage` | Vitest with v8 coverage |
| `npm run lint` | ESLint |
| `npm run preview` | Preview the built `dist/` |

### Per-chain builds

CryptoLand ships as **one codebase that produces N chain-native builds** — each
deployment targets a single chain via `VITE_CHAIN` at build time. See
[multichain.md](multichain.md).

```bash
npm run build:chain base        # → dist-base/
npm run build:chain solana      # → dist-solana/
npm run build:all-chains        # every chain in scripts/build-chain.sh
```

`scripts/build-chain.sh` stages `env/.env.<chain>` → `.env.production`, then runs
`vite build --outDir dist-<chain>`. There are **27 build targets**, one env template
each.

> ⚠️ The files in `env/` are **dotfiles** — plain `ls env/` shows nothing. Use `ls -A env/`.

---

## Environment

| File | Purpose |
|------|---------|
| `.env` | Dev: `VITE_API_BASE=` (empty — the Vite proxy handles routing) |
| `.env.production` | Prod build input — **overwritten** by `build:chain` from `env/.env.<chain>` |
| `.env.example` | Master reference: every `VITE_*` variable, documented |
| `env/.env.<chain>` | 27 per-chain templates (dotfiles) — `VITE_CHAIN`, `VITE_CONTRACT_<CHAIN>`, `VITE_MARKETPLACE_<CHAIN>`, `VITE_TOKEN_<CHAIN>`, `VITE_API_BASE` |
| `server/.env` | `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`, `SERVER_URL` |

### Backend environment variables

| Variable | Purpose |
|---|---|
| `CRYPTOLAND_DB` | **Path to this deployment's SQLite DB.** Each per-chain deployment runs its own backend with its own database. Defaults to `server/cryptoland.db` when unset — so leaving it unset silently shares the dev DB |
| `NOWPAYMENTS_API_KEY` / `NOWPAYMENTS_IPN_SECRET` | NOWPayments credentials (server-proxied — never shipped to the client) |
| `SERVER_URL` | Public origin used for payment callbacks (default `http://127.0.0.1:8000`) |
| `ALLOW_UNSIGNED_WALLET_AUTH` | Dev-only escape hatch that skips SIWE signature verification. **Off by default — leave it off in production** |

```bash
# A per-chain deployment's backend
cd server
CRYPTOLAND_DB=/srv/cryptoland/base.db uvicorn main:app --host 0.0.0.0 --port 8000
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Zustand 5, MapLibre GL 5, Tailwind CSS 4 |
| Build | Vite 8 |
| QR codes | qrcode.react |
| Backend | FastAPI, aiosqlite, Pydantic, slowapi (rate limiting), eth-account (SIWE) |
| Database | SQLite (`server/cryptoland.db`, or `$CRYPTOLAND_DB`) |
| Payments | NOWPayments — 9 currencies (USDT-TRC20, BTC, ETH, SOL, BNB, POL, XRP, LTC, TRX) |
| Blockchain | 13 adapter families over 29 mainnet + 26 testnet chain entries |
| Map tiles | OpenStreetMap (via MapLibre) |
| Geocoding | Nominatim (search bar) |

---

## Seed the Database

```bash
cd server
python3 seed.py            # ~180 blocks across 42 fictional owners in major world cities
python3 seed_guardians.py  # guardian agents for the seeded blocks
```

---

## Run Tests

```bash
npm test
```

Vitest + MSW. `src/test/` covers the payment flow (`gameStore.test.js`), the NOWPayments
API client (`nowpayments.test.js`), and adapter-interface conformance across every chain
family (`chains.test.js`) — the last one is what makes it impossible to half-add a chain.

---

## Production Build

```bash
npm run build                 # generic build → dist/
cd server && uvicorn main:app # serves dist/ as static + the API on one origin
```

FastAPI serves `dist/assets/` statically and `dist/index.html` as the SPA catch-all.

> The static mount is hardcoded to `<repo>/dist`. For a chain-native deployment, either
> host `dist-<chain>/` on a static host (with an SPA rewrite) and point `VITE_API_BASE` at
> the API origin, or symlink `dist-<chain>/` → `dist/` to serve both from one origin. See
> [multichain.md → Deployment topology](multichain.md#deployment-topology).
