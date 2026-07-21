# Architecture

## Overview

CryptoLand is a full-stack web application where users purchase map tiles representing real geographic territory. Each tile is backed by a SQLite record, payments are **real** multi-currency crypto payments processed through NOWPayments (server-proxied), and the world map renders via MapLibre GL. Tiles use a Z14 grid (16384×16384 = 268,435,456 purchasable tiles; `PURCHASE_ZOOM = 14` in `src/lib/tiles.js`).

The app is built as **one codebase that produces N chain-native builds** — each deployment sets `VITE_CHAIN` to target a single blockchain. See [multichain.md](multichain.md).

```
Browser (React SPA)  ←→  FastAPI (Python)  ←→  SQLite DB
       ↕
  MapLibre GL (OSM tiles)
```

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend framework | React | 19.2.5 |
| Build tool | Vite | 8.0.10 |
| State management | Zustand | 5.0.12 |
| Map renderer | MapLibre GL | 5.24.0 |
| Styling | Tailwind CSS | 4.2.4 |
| QR codes | qrcode.react | 4.2.0 |
| Backend framework | FastAPI | latest |
| Database | SQLite (aiosqlite) | latest |
| Data validation | Pydantic | latest |

## Directory Structure

```
Game/
├── src/                        # Frontend React application
│   ├── main.jsx                # React entry point (ReactDOM.createRoot)
│   ├── App.jsx                 # Root component, layout, intro overlay
│   ├── index.css               # Global styles, design tokens, animations
│   ├── components/             # ~26 components (.jsx), including:
│   │   ├── Map.jsx             # MapLibre map container + tile grid rendering
│   │   ├── HUD.jsx             # Top-left stats panel + account/wallet buttons
│   │   ├── PurchasePanel.jsx   # Right-side selected tile details
│   │   ├── PaymentModal.jsx    # Multi-step purchase flow modal
│   │   ├── HoverTooltip.jsx    # Mouse-follow tile tooltip
│   │   ├── Sidebar.jsx         # Left-bottom leaderboard drawer
│   │   ├── LiveFeed.jsx        # Bottom scrolling purchase ticker
│   │   ├── AccountModal.jsx    # Account dashboard (tiles, guardians, affiliate)
│   │   ├── AuthModal.jsx       # Login / register / guest-claim modal
│   │   ├── WalletModal.jsx     # Wallet connect / portfolio
│   │   ├── CustomizeModal.jsx  # Block image/label editor
│   │   ├── MarketplaceModal.jsx, MarketSidebar.jsx   # Peer-to-peer tile market
│   │   ├── GuardianModal.jsx, RaidModal.jsx, SquadPanel.jsx, AgentFeedPanel.jsx
│   │   ├── DAOModal.jsx, TokenPanel.jsx, LandDropModal.jsx, PersonalPlaceOnboarding.jsx
│   │   ├── EmpireCard.jsx, PublicEmpire.jsx, TileCertificate.jsx
│   │   └── SearchBar.jsx, PaymentModal.jsx, PurchaseToast.jsx
│   ├── lib/
│   │   ├── tiles.js            # Web Mercator math (PURCHASE_ZOOM = 14), pricing
│   │   ├── api.js              # HTTP client wrapper (auto-attaches Bearer token)
│   │   ├── nowpayments.js      # NOWPayments status label helpers
│   │   ├── analytics.js, hooks.js
│   │   └── blockchain/         # Chain adapters — see multichain.md
│   │       ├── config.js       # CHAINS registry + active-chain selection
│   │       ├── index.js        # Loads active family's adapter, re-exports interface
│   │       ├── adapters/       # evm.js, solana.js, ton.js, aptos.js, sui.js, _shared.js
│   │       └── contracts/abi.json
│   └── store/                  # ~13 Zustand stores:
│       ├── gameStore.js        # Global state, purchase flow, blocks Map
│       ├── walletStore.js      # Wallet connection + on-chain tiles
│       ├── authStore.js        # Universal auth: token, user, authReady gate
│       ├── userStore.js        # Account dashboard, tiles, guardians
│       ├── affiliateStore.js   # Session UUID, ?ref= capture, earnings
│       ├── marketStore.js, guardianStore.js, daoStore.js, tokenStore.js
│       ├── priceStore.js, streakStore.js, shareStore.js, viralStore.js
├── server/
│   ├── main.py                 # FastAPI app, routes, DB lifecycle, auth, NOWPayments
│   ├── guardian.py             # Guardian-agent stats / raids / reports
│   ├── viral.py                # Agent feed, squads, land-drops, frame/OG pages
│   ├── price_events.py         # Background price-event + news loop
│   ├── migrations/             # migrate_z11_to_z14.py (Z11 → Z14 coordinate migration)
│   ├── seed.py, seed_guardians.py    # Database population scripts
│   ├── requirements.txt        # Includes eth-account (SIWE signature recovery)
│   └── cryptoland.db           # SQLite database file
├── contracts/                  # EVM smart contract (CryptoLandTile.sol) + Hardhat
├── env/                        # Per-chain build templates (.env.<chain>) — see multichain.md
├── scripts/build-chain.sh      # Per-chain build (dist-<chain>/)
├── .env.example                # Master env reference
├── public/
│   ├── favicon.svg
│   └── icons.svg               # Sprite sheet for currency icons
├── index.html                  # HTML entry, Google Fonts, MapLibre CSS
├── package.json
├── vite.config.js
└── eslint.config.js
```

## Data Flow

### Application Boot

```
1. App mounts → useEffect calls loadBlocksFromServer()
2. loadBlocksFromServer() fires two parallel requests:
     GET /blocks  → all purchased tile records
     GET /stats   → aggregate { sold, volume, owners }
3. rows mapped via rowToBlock() → blocks Map<tileKey, block>
4. Zustand store updated: blocks, stats, loading: false
5. MapLibre map init (useEffect in Map.jsx):
   a. maplibregl.Map created, attaches to containerRef div
   b. map.on('load') fires:
      - overlay div created, appended to container (after canvas — sits on top)
      - overlayRef.current = overlay
      - GeoJSON sources + all layers added
      - syncOverlayEls(blocks) — creates block image divs in overlay
      - positionOverlayEls(map) — initial positioning pass
      - map.on('render') → positionOverlayEls every frame (zero-lag alignment)
   c. store.subscribe: blocks/selectedKey changes → update sources + overlay
```

### Hover Interaction

```
Mouse move on map
  → lngLatToTile(lng, lat, z=PURCHASE_ZOOM=14)
  → setHoveredKey(key)
  → hover GeoJSON source updated (highlight polygon)
  → HoverTooltip renders at mousePos (if not selected tile)
```

### Click → Purchase

```
Click on map tile
  → lngLatToTile(lng, lat, z=PURCHASE_ZOOM=14)
  → setSelectedKey(key)
  → onBlockClick callback fires with block metadata
  → PurchasePanel renders right-side details
  → User clicks "Purchase This Block"
  → openPurchaseModal() locks in purchasingKey
  → PaymentModal mounts (step = 'select')
  → User picks currency → startPayment()
  → POST /np/payment → NOWPayments creates real payment
  → step = 'payment': shows QR code, address, 30min countdown
  → _startPolling(paymentId) polls every 10s
  → On STATUS_SUCCESS: _finalizeBlock()
    → POST /np/finalize → server verifies + writes block to DB
    → blocks Map updated in-memory → map re-renders new polygon
    → step = 'confirmed' → success UI
  → On STATUS_FAILED: step = 'error'
  → Server-side: IPN webhook auto-finalizes independently
```

### Backend Failure

```
loadBlocksFromServer() catches network/HTTP error
  → dbError set in store
  → App renders error banner ("Retry" button)
  → User retries → loadBlocksFromServer() called again
```

## Component Tree

```
<App>
  ├─ <IntroOverlay>          Splash screen shown once per session
  ├─ <Corner> ×4             Decorative corner borders
  ├─ <GameMap>               Full-viewport map (z-index 0)
  ├─ vignette div            Radial gradient overlay (z-index 5)
  ├─ <HUD>                   Top stats + portfolio drawer (z-index 10)
  ├─ <SearchBar>             Top-center geocoder (z-index 20)
  ├─ <PurchasePanel>         Right-side / bottom sheet details (z-index 30)
  ├─ <Sidebar>               Left-bottom leaderboard drawer (z-index 25)
  ├─ <LiveFeed>              Bottom scrolling ticker (z-index 10)
  ├─ <MapTooltip>            Follows mouse — desktop only (z-index 80)
  ├─ <PaymentModal>          Multi-step purchase modal (z-index 200)
  ├─ <CustomizeModal>        Block image/label editor (z-index 200)
  └─ <PurchaseToast>         Bottom-left toast stack (z-index 40)
```

## Module Dependencies

```
App.jsx
  → components/* (~26 components)
  → store/gameStore.js, store/authStore.js
  → lib/tiles.js

Map.jsx (GameMap)
  → lib/tiles.js (tileNW, tileCenter, tilePoly, lngLatToTile, tileKey, tileBasePrice, emptyFC, PURCHASE_ZOOM)
  → store/gameStore.js
  Note: Uses custom DOM overlay (not maplibregl.Marker) for block images.
        positionOverlayEls() runs on every MapLibre 'render' event.
        See documentation/frontend.md § Map.jsx for full design rationale.

PurchasePanel.jsx, PaymentModal.jsx, CustomizeModal.jsx
Sidebar.jsx, SearchBar.jsx
  → store/gameStore.js
  → lib/hooks.js (useIsMobile)

PaymentModal.jsx
  → lib/nowpayments.js (statusLabel)
  → qrcode.react (QRCodeSVG)

HoverTooltip.jsx
  → store/gameStore.js
  → lib/tiles.js (tileBasePrice)

HUD.jsx, LiveFeed.jsx, PurchaseToast.jsx
  → store/gameStore.js

Sidebar.jsx
  → store/gameStore.js
  → lib/api.js (fetchCountryStats)

gameStore.js
  → lib/api.js
  → lib/tiles.js
  → lib/nowpayments.js

api.js, nowpayments.js
  → (native fetch only)

tiles.js, hooks.js
  → (no imports)
```

## Payments

Payments are **real**, not simulated. The frontend never holds the NOWPayments API
key — all NOWPayments calls are proxied through the FastAPI backend (`/np/*`). A
purchase creates a real payment intent (`POST /np/payment`), the buyer sends crypto
to the returned address, and the block is written on confirmation (`POST /np/finalize`,
or the server-side IPN webhook `POST /np/ipn`, whichever fires first). Finalize/IPN
bind `payment_id ↔ tile ↔ amount`, are single-use, and use the server-stored price.
See [backend.md](backend.md).

## Multichain

CryptoLand is **one codebase that produces N chain-native builds**. Each deployment
sets `VITE_CHAIN` to target a single blockchain; the backend DB is the canonical
ownership record within that build, and an on-chain contract (deployed later) anchors
ownership + optional NFT mint. Chain-specific logic is isolated in
`src/lib/blockchain/` behind a uniform adapter interface (families: `evm`, `solana`,
`ton`, `aptos`, `sui`). Until a chain's `VITE_CONTRACT_<CHAIN>` is set, purchases work
off the DB and the on-chain mint is stubbed. Full detail — the 13 grant targets,
adapter interface, and deploy steps — is in [multichain.md](multichain.md).
