# CryptoLand Documentation

> **Own the World** — A blockchain-based geospatial land registry game.
> Buy real Earth map tiles with crypto. 4,194,304 blocks. One owner each.

## Documentation Index

| File | Contents |
|------|----------|
| [review.md](review.md) | Full codebase review — what works, bugs fixed, known limitations |
| [architecture.md](architecture.md) | System overview, tech stack, data flow, component tree |
| [backend.md](backend.md) | FastAPI server, database schema, API endpoints |
| [frontend.md](frontend.md) | React components, Zustand store, lib utilities |
| [game-mechanics.md](game-mechanics.md) | Tile grid, pricing model, purchase flow, currencies |
| [styling.md](styling.md) | Design tokens, themes, CSS classes, animations |
| [viral.md](viral.md) | **2026/27 viral playbook** — reverse-engineered competitor analysis + 10 unfair-advantage features + the 4 frontier mechanics shipped |

## Quick Start

```bash
# Terminal 1 — Backend (FastAPI + SQLite)
cd server && uvicorn main:app --reload

# Terminal 2 — Frontend (Vite + React)
npm run dev
```

Frontend: `http://localhost:5173`  
Backend: `http://127.0.0.1:8000`  
API docs: `http://127.0.0.1:8000/docs`

> The Vite dev server proxies all `/blocks`, `/stats`, `/np`, `/health` requests to the FastAPI backend — no CORS issues in dev.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Zustand, MapLibre GL 5, Tailwind CSS 4 |
| Build | Vite 8 |
| QR codes | qrcode.react |
| Backend | FastAPI, aiosqlite, Pydantic |
| Database | SQLite (`server/cryptoland.db`) |
| Payments | NOWPayments (9 currencies) |
| Map tiles | OpenStreetMap (via MapLibre) |
| Geocoding | Nominatim (search bar) |

## Seed the Database

```bash
cd server && python3 seed.py
```

Inserts ~180 blocks across 28 fictional owners in major world cities.

## Run Tests

```bash
npm test
```

Vitest + MSW. Covers payment flow (gameStore) and NOWPayments API client.

## Environment

| File | Purpose |
|------|---------|
| `.env` | Dev: `VITE_API_BASE=` (empty — Vite proxy handles routing) |
| `.env.production` | Prod: `VITE_API_BASE=` (relative URLs, FastAPI serves `/dist`) |
| `server/.env` | `NOWPAYMENTS_API_KEY` + `NOWPAYMENTS_IPN_SECRET` |

## Production Build

```bash
npm run build         # outputs to dist/
cd server && uvicorn main:app  # serves dist/ as static + API
```

FastAPI serves `dist/assets/` statically and `dist/index.html` as SPA catch-all.
