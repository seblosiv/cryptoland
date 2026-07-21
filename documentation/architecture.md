# Architecture

## Overview

CryptoLand is a full-stack web application where users purchase map tiles representing real geographic territory. Each tile is backed by a SQLite record, payments are simulated through a multi-currency crypto flow, and the world map renders via MapLibre GL.

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
│   ├── components/
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
│   │   └── CustomizeModal.jsx  # Block image/label editor
│   ├── lib/
│   │   ├── tiles.js            # Web Mercator math, pricing utilities
│   │   └── api.js              # HTTP client wrapper (auto-attaches Bearer token)
│   └── store/
│       ├── gameStore.js        # Zustand global state store
│       ├── walletStore.js      # Wallet connection + on-chain tiles
│       ├── affiliateStore.js   # Session UUID, ?ref= capture, earnings
│       ├── authStore.js        # Universal auth: token, user, login/register/logout
│       └── userStore.js        # Account dashboard, tiles, guardians
├── server/
│   ├── main.py                 # FastAPI app, routes, DB lifecycle
│   ├── seed.py                 # Database population script
│   └── cryptoland.db           # SQLite database file
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
  → lngLatToTile(lng, lat, z=11)
  → setHoveredKey(key)
  → hover GeoJSON source updated (highlight polygon)
  → HoverTooltip renders at mousePos (if not selected tile)
```

### Click → Purchase

```
Click on map tile
  → lngLatToTile(lng, lat, z=11)
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
  → components/* (all 10)
  → store/gameStore.js
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
