# Frontend

## Entry Points

### `index.html`
HTML shell. Loads:
- Google Fonts: Space Mono (monospace), Syne (sans-serif)
- MapLibre GL CSS (`maplibre-gl.css`)
- `/src/main.jsx` as ES module

### `src/main.jsx`
```js
ReactDOM.createRoot(document.getElementById('root')).render(<App />)
```
Mounts the React tree into `#root`. No StrictMode.

---

## App.jsx — Root Component

**Responsibilities:**
- Owns `mousePos` state (tracks cursor position for tooltip)
- Renders full layout: map, HUD, panels, overlays
- Handles `dbError` — shows retry banner if backend unreachable
- Manages first-load onboarding visibility via `showIntro` state
- Calls `applyProfileTheme()` from `lib/chainProfile.js` in a mount effect, which
  sets `--chain-accent`, `--chain-accent-dim`, `--chain-accent-ink` and
  `--chain-accent-ui`, plus `data-chain` / `data-family` on `<html>`, so every
  per-chain build tints itself. Consumers always pass a fallback
  (`var(--chain-accent, var(--green))`) so the first frame is correct.

### First-load onboarding

`showIntro` renders **`ChainOnboarding`** — the 3-step chain-native flow documented
in [multichain.md](multichain.md#chain-native-onboarding), not a separate splash
component. (An earlier `IntroOverlay` was replaced by it and no longer exists.)
Forced with `?intro=1`, skipped with `?intro=0`, otherwise shown once and
remembered as `cl-intro-seen`.

Its CTA **is** re-tinted, via `background: var(--chain-accent)` +
`color: var(--chain-accent-ink)`. It used to be left CryptoLand-green on the
grounds that per-chain accents "would break its contrast" — a real concern,
solved properly by deriving the label colour from the accent's luminance rather
than by opting out. Leaving it green put a bright green button in the middle of
an otherwise entirely blue Base screen, on the largest element of every step.

### `Corner`
Inner component. Renders one decorative L-shaped border corner.
Takes `pos` prop: `'tl' | 'tr' | 'bl' | 'br'`.

### Layout Layers (z-index stack)

| z-index | Element |
|---------|---------|
| 0 | `<GameMap>` (full viewport) |
| 5 | Vignette radial gradient overlay |
| 10 | HUD, PurchasePanel, Sidebar, LiveFeed |
| 10 | Corner decorations |
| 20 | HoverTooltip |
| 50 | PaymentModal |

---

## Components

### `Map.jsx` — GameMap

The core visual component. Full-viewport MapLibre GL canvas with a custom DOM overlay for block images.

**Key refs:**
- `mapRef` — MapLibre Map instance
- `overlayRef` — The custom overlay `<div>` that sits on top of the MapLibre canvas. All block image elements live inside it. Created inside `map.on('load')` and assigned here — always accessed via this ref (never via local variable) to ensure cleanup safety.
- `blocksDataRef` — `Map<tileKey, { el, nwLng, nwLat, seLng, seLat, sig }>` — registry of all active block overlay elements with their geographic corner coordinates pre-computed.

#### ⚠️ Critical Architecture: Custom Overlay System

Block images are rendered as DOM `<div>` elements inside a custom overlay, **NOT** as `maplibregl.Marker` instances. This is a deliberate architectural decision — do not revert to Marker-based rendering.

**Why not `maplibregl.Marker`:**
MapLibre's `Marker` class only calls `_update()` (repositions via `style.transform`) on `move` and `moveend` events — not on every animation frame. During smooth zoom animation, MapLibre moves the camera every RAF frame via its internal render loop, but custom-sized Marker elements lag 1–2 frames behind. This causes visible "floating" where block images slip away from their tiles during zoom. No external resize hook can fix this because the `translate()` positioning is owned by Marker internals.

**How the overlay works:**
1. A single `<div style="position:absolute; inset:0; pointer-events:none">` (the overlay) is appended to the map container **inside `map.on('load')`** — after MapLibre appends its canvas — so it sits on top in the DOM stacking order.
2. Each block's `<div>` element lives inside the overlay with `position:absolute; top:0; left:0`.
3. `positionOverlayEls(map)` runs on **every `render` event** (MapLibre's per-frame callback). It calls `map.project([lng, lat])` for each block's NW and SE corners to get exact pixel coordinates, then sets `transform: translate(x,y)` + `width` + `height` directly — in the same RAF cycle as MapLibre's paint. Result: zero frame lag, no floating.

**Scope rule — overlay variable:**
The `overlay` div is created as a local `const` inside `map.on('load', () => { ... })`. It is **immediately** assigned to `overlayRef.current`. Any code outside that callback (including the `useEffect` cleanup) must access it via `overlayRef.current`, never via the local `overlay` variable which is out of scope. The cleanup uses `overlayRef.current?.remove()`.

#### Map Initialization

On mount: creates `maplibregl.Map` with:
- Style: custom object (no default MapLibre style; OSM raster source added manually)
- Center: `[20, 40]`, Zoom: `4`, min: `2`, max: `16` — the **initial** camera only;
  `fitToWorldOnce()` reframes it as soon as tiles arrive (below)
- Navigation control (zoom buttons only, no compass) at `bottom-right`

#### `fitToWorldOnce(map, blocks)` — the opening frame

Runs once, on the first non-empty block set. The hardcoded `[20,40] / zoom 4` showed
Europe, Türkiye and the Levant and nothing else, while the leaderboard on the same
screen headlined *"United States: 1,075 tiles — 1st"* — a country that was off-screen.
For a game pitched as "own the world", the first frame argued the opposite.

- Bounds are the **2nd–98th percentile** of tile longitude/latitude, not min/max: one
  tile in Alaska or New Zealand would otherwise zoom the camera out to fit a single
  dot.
- Left padding is `--market-w + 40px`. The market sidebar is an opaque overlay pinned
  to the left edge, so padding only for the window chrome fitted the bounds *underneath
  it* — technically correct, and the Americas were still invisible behind the signal
  feed.
- `maxZoom: 4.5` so a sparse world never opens closer than the old default;
  `duration: 0` so it is a frame, not an animation the user watches.
- Guarded by `map.__didFitWorld`, so later block updates never yank the camera away
  from wherever the player has navigated to.

#### Map Sources & Layers

| Source | Type | Purpose |
|--------|------|---------|
| `blocks` | GeoJSON | All purchased tile polygons — drives all fill/border layers |
| `recent-points` | GeoJSON | Blocks purchased in last hour — reserved for future pulse layer |
| `grid` | GeoJSON | Viewport tile grid lines, regenerated on every `move` |
| `hover` | GeoJSON | Currently hovered tile polygon |
| `selected` | GeoJSON | Currently selected tile polygon |

| Layer | Type | Zoom | Purpose |
|-------|------|------|---------|
| `lights-halo` | circle | max 11 | Outer atmosphere — widest, faintest, sells the bloom |
| `lights-glow` | circle | max 11 | Body of the glow |
| `lights-core` | circle | max 11 | Near-white filament so each light has a centre |
| `blocks-recency` | fill | 11–13 | Color glow, opacity driven by `recency` property |
| `blocks-fill` | fill | min 9 | Dark tinted interior at close zoom |
| `blocks-border-outer` | line | min 9 | Blurred glow border at close zoom |
| `blocks-border` | line | min 9 | Sharp crisp border at close zoom |
| `grid-lines` | line | all | Subtle white tile grid, opacity increases with zoom |
| `hover-fill` / `hover-border` | fill+line | all | Hover highlight |
| `selected-fill` / `selected-border` / `selected-border-glow` | fill+line | all | Selection highlight |

**City lights (`lights-*`).** Three stacked blurred circle layers over one point per
tile (`blocksToPoints`). At world zoom a tile is sub-pixel, so drawing each as its own
coloured polygon turned a dense cluster into multicoloured static — "smoke". Overlapping
translucent circles accumulate instead, so a cluster blooms into a single glow with a hot
core, the way a city looks from orbit. Deliberately **one** palette, not `['get','color']`.

The palette is `mixWhite(0.35 / 0.68 / 0.93)` from `src/lib/chainProfile.js` — hue from
the chain accent, luminance from the mix toward white. It was three fixed greens, which
meant the map (the actual product) looked identical on all 29 builds: a purple Starknet
intro handing over to a green world. Mixing rather than using the raw accent is what
keeps a navy Cardano accent legible: a light is defined by being bright, and `#0033ad`
dots on a near-black map are invisible. On the default green the mix reproduces the
previous palette almost exactly.

Interaction affordances — `hover-*`, `selected-*` and the country highlight — take
`ACCENT_UI_HEX` (the contrast-corrected variant) for the same reason. Guardian
personality colours and per-tile owner colours stay fixed: they encode data, not brand.

#### Helper Functions

`drawBlockSprite(block)` — draws a 64×64 canvas for blocks without images. Uses deterministic tile hash to pick a background pattern (diagonal/dots/grid/radial/scanline/solid), draws corner brackets, a country flag emoji (or pool emoji), and owner name in a bottom strip.

`makeMarkerEl(block)` — creates a block overlay `<div>`. If `block.imageUrl`: shows `<img>` + optional label bar (tagged `data-lbl="1"`). If no image: uses `drawBlockSprite` canvas as CSS `background-image`. Returns the element — no positioning applied here, `positionOverlayEls` handles that.

`syncOverlayEls(blocks)` — reconciles `blocksDataRef` against current blocks map:
- Skips blocks whose `sig` (imageUrl|color|owner|label) hasn't changed
- Creates new overlay `<div>` elements and appends to overlay
- Removes stale elements for blocks no longer in store
- Stores NW/SE corner coordinates (pre-computed once, reused every frame)
- Guards: returns early if `overlayRef.current` is null (called before `load` fires)

`positionOverlayEls(map)` — runs on every `render` event. For each block:
1. `map.project([nwLng, nwLat])` → pixel `p1`
2. `map.project([seLng, seLat])` → pixel `p2`
3. Sets `transform: translate(p1.x, p1.y)`, `width: p2.x-p1.x`, `height: p2.y-p1.y`
4. Fades opacity: `0` below 6px wide, linear fade 6–20px, `1` above 20px
5. Scales label font: `clamp(7px, w×0.1, 13px)`

`viewportGridFC(map)` — generates GeoJSON grid tiles for the current viewport. Skips if zoom < 3 or tile count > 10,000.

#### Event Handlers

`render` — fires every animation frame → `positionOverlayEls(map)`
`zoom` — updates store zoom, rebuilds grid
`move` — rebuilds grid
`mousemove` — converts `lngLat` → tile key, updates hover source + store
`mouseleave` — clears hover
`click` — converts `lngLat` → tile key, updates selected source + store, fires `onBlockClick` prop

#### Zustand Store Subscription

Single `store.subscribe` callback:
- `blocks` change → update `blocks` GeoJSON source + `recent-points` + call `syncOverlayEls` + `positionOverlayEls`
- `selectedKey` change → if null (deselect), clear `selected` GeoJSON source

#### useEffect Cleanup

```js
return () => {
  unsub()                          // unsubscribe Zustand
  for (const { el } of blocksDataRef.current.values()) el.remove()
  blocksDataRef.current.clear()
  overlayRef.current?.remove()     // use ref, not local var (out of scope)
  map.remove()
}
```

---

### `HUD.jsx` — Stats Panel

Top-left panel. Purely display, reads from store.

**Displays:**

| Stat | Source | Notes |
|------|--------|-------|
| Logo "CRYPTOLAND" | Static | Pulse dot animation |
| Sold | `stats.sold` | Count of purchased tiles |
| Claimed % | `blocks.size / TOTAL_TILES × 100` | Local calc |
| Volume | `stats.volume` | Sum of all purchase prices (USD) |
| Owners | `stats.owners` | Distinct owner count |
| Grid | `PURCHASE_ZOOM` | Always "Z14" |
| Zoom | `zoom` | Live map zoom level |

**Constants used:** `TOTAL_TILES = 268,435,456`, `PURCHASE_ZOOM = 14`

---

### `PurchasePanel.jsx` — Block Details

Right-side slide-in panel. Appears when a tile is selected (`selectedKey !== null`).

**Props:** None — reads entirely from Zustand store.

#### Rendering Logic

1. No selection → returns `null` (panel hidden)
2. Selection exists → determine `block` from `blocks.get(selectedKey)`
3. `isEmpty = !block` — true if tile has never been purchased

#### For Owned Blocks (isEmpty = false)
- Header image (if `block.imageUrl`) or color dot + country name
- Info grid: tile coords, grid level, status "OWNED", price paid
- Owner row: handle + colored dot with CSS glow
- Timestamp: `timeAgo(block.purchasedAt)`

#### For Empty Blocks (isEmpty = true)
- Title bar with default gold dot
- Info grid: tile coords, grid level, status "AVAILABLE", base price
- Pricing breakdown:
  - Base price from `tileBasePrice(tx, ty)`
  - Scarcity multiplier: `1 + (soldCount / TOTAL_TILES) × 3`
  - Final price: `base × multiplier`
- "Purchase This Block" button → `openPurchaseModal()`

#### Helper: `timeAgo(ms)`
Converts Unix millisecond timestamp to human-readable relative time:
- `< 60s` → "Xs ago"
- `< 3600s` → "Xm ago"
- `< 86400s` → "Xh ago"
- else → "Xd ago"

---

### `PaymentModal.jsx` — Purchase Flow

Full-screen modal backdrop. Renders different step components based on `purchaseStep` in store.

Steps: `'select'` → `'payment'` → `'confirming'` → `'confirmed'` (or `'error'`)

**Timer effect:** While step is `'payment'`, runs `setInterval(tickPaymentTimer, 1000)`. Clears on step change.

**Backdrop:** Semi-transparent black. Click fires `closePurchaseModal()` (only from `'select'` or `'error'` steps — other steps are locked).

#### Step Indicator
Five circles across the top. Filled gold = completed. Active = white ring. Empty = gray.

#### `CurrencySelect` (step: 'select')
Six currency buttons arranged in 2×3 grid:

| Currency | Color | Icon |
|----------|-------|------|
| BTC | `#f7931a` | ₿ |
| ETH | `#627eea` | Ξ |
| SOL | `#9945ff` | ◎ |
| USDT | `#26a17b` | ₮ |
| BNB | `#f3ba2f` | BNB |
| MATIC | `#8247e5` | MATIC |

Selected currency highlighted. Shows USD price. "Continue — Generate Payment" → `startPayment()`.

#### `PayStep` (step: 'payment')
- Countdown timer: `paymentTimeLeft` seconds → `MM:SS` format. Blinks red if < 300s
- Amount box: exact crypto amount + USD equivalent
- QR code (from `paymentData.qrData` via `qrcode.react`)
- Address display with copy button (clipboard API, shows "✓ COPIED" for 2s)
- "Simulate Confirmation" button → `simulateConfirm()`

#### `ConfirmingStep` (step: 'confirming')
- SVG spinner animation
- "Awaiting Confirmation" text
- Three blinking dots

#### `ConfirmedStep` (step: 'confirmed')
- Animated checkmark (popIn, 2s delay)
- "Block Acquired" message
- Ownership summary (block key, owner, price, currency)
- "View Map" / "Done" buttons → `closePurchaseModal()`

#### `ErrorStep` (step: 'error')
- Red X icon
- Error message from `store.purchaseError`
- "Try Again" button → `closePurchaseModal()`

---

### `HoverTooltip.jsx` — Map Tooltip

Follows mouse cursor. Does not render if `selectedKey` is set (avoids overlap with panel).

**Position:** Absolute positioned via `mousePos.x + offset`. Flips sides if near viewport edges:
- `flipX`: if `mousePos.x > window.innerWidth - 280`
- `flipY`: if `mousePos.y > window.innerHeight - 200`

**Content:**
- If block has `imageUrl`: image header with label overlay
- Color dot + country/region name
- OWNED / FREE status badge
- Owner (if owned) — shortened via `shortAddr()` from [`addr.js`](#library-addrjs), full address kept in the `title`
- Price row
- Tile coordinates
- "Click to purchase →" (if unowned)

---

### `Sidebar.jsx` — Leaderboard

Collapsible drawer from bottom-left.

**Toggle:** Arrow button, `panelUp` animation on open.

**Leaderboard (hardcoded):**

| Rank | City | Blocks | Color |
|------|------|--------|-------|
| 1 | New York | 35 | `#00ff88` |
| 2 | Tokyo | 32 | `#ff6b6b` |
| 3 | London | 28 | `#4ecdc4` |
| 4 | Paris | 25 | `#ffe66d` |
| 5 | Dubai | 23 | `#a8e6cf` |
| 6 | Singapore | 22 | `#ffd93d` |
| 7 | Sydney | 21 | `#6bcb77` |
| 8 | Toronto | 20 | `#4d96ff` |
| 9 | Berlin | 19 | `#c77dff` |
| 10 | Singapore | 18 | `#ff9f1c` |

Each row shows: rank badge, city name, block count, progress bar (relative to max 35).

**Summary box:** Blocks Sold (from `stats.sold`), Unique Owners (computed as `new Set(blocks.values().map(b => b.owner)).size`).

---

### `LiveFeed.jsx` — Signal Feed Ticker

Horizontally scrolling feed at bottom of screen. Fetches real signal data from `GET /feed/signals` every 30 seconds, seeding from local block store while the first fetch loads.

**Signal types (weighted, sorted by priority):**

| Type | Icon prefix | Color | Weight | Description |
|------|-------------|-------|--------|-------------|
| `country_war` | ⚔️ WAR | `#facc15` | 4 | Live country tile scoreboard — Day N of 7 |
| `scarcity` | 🔴/🟠/⚠️ SCARCITY | `#f87171` | 5 | City almost fully claimed (≥50% owned) |
| `price_surge` | 📈 SURGE / 🚨 | `#34d399` | 4 | Country tiles selling fast this hour |
| `milestone` | 🎉 / ⚡ MILESTONE | `#a78bfa` | 3 | Platform-wide sold count milestones |
| `streak` | 🔥 STREAK | `#fb923c` | 2 | Top owners hitting Pioneer/Land Baron/Tycoon badges |
| `affiliate` | 🤝 / 👑 AFFILIATE | `#60a5fa` | 3 | Recruiters earning commissions today |
| `purchase` | 🌍 PURCHASE | `#4ade80` | 1 | Recent tile acquisitions (~10–15% of feed) |

**Data source:** `GET /feed/signals` — all signals derived from real DB data (no mocks). Purchases capped at 4; streak requires ≥5 tiles owned.

**Scroll animation:**
- Signals repeated 3× to fill width
- Duration scales with signal count (`signals.length * 22` seconds)

**Right side:** Total market volume (sum of all block prices).

---

## Accounts & Affiliate — New Stores

### `affiliateStore.js`
Session UUID and referral code management.

- **Initialized at module import**: generates/loads `cl-session-id` from localStorage
- **Captures `?ref=LAND-XXXXXX`** from URL at landing, persists to `cl-ref-code` in localStorage
- `initSession()` — registers session with `POST /sessions` (non-blocking, called on app boot)
- `bindWallet(wallet)` — links session → wallet via `POST /sessions/bind-wallet`
- `loadMyCode(wallet)` — fetches referral code from `GET /affiliate/code/{wallet}`
- `loadStats(wallet)` — loads earnings + leaderboard, normalizes field names for UI
- `getReferralUrl()` — returns `{origin}?ref={myCode}`

### `userStore.js`
Account dashboard state.

- `initUser(wallet)` — upserts user + loads full account (called when wallet connects)
- `loadAccount(wallet)` — single `GET /account/{wallet}` for tiles, guardians, affiliate summary
- `refreshTiles(wallet)` — refreshes tile list after a purchase
- `openAccountModal()` / `closeAccountModal()` — controls `AccountModal` visibility

### `AccountModal.jsx`
Three-tab account dashboard. Opens via the `◈` button in HUD (visible when wallet is connected).

- **My Tiles** — list of owned tiles with coordinates, price, country, customize/share actions. Clicking a tile flies the map to it.
- **Guardians** — deployed guardian agents with personality, level, W/L, and for-sale status. Clicking opens `GuardianModal` for that tile.
- **Affiliate** — referral code display, copy-link button, earnings stats (pending / total / referrals), redeem button, top-5 leaderboard.

### HUD Account Button
A `◈` icon button appears in the top HUD bar when a wallet is connected (between the stats bar and the wallet button). Clicking opens `AccountModal`.

## State Management — `gameStore.js`

Built with Zustand. Single flat store, exported as `useGameStore`.

### State Shape

```js
{
  // Map data
  mapReady: false,
  zoom: 3,
  blocks: Map(),              // Map<"tx:ty", block>

  // Selection
  hoveredKey: null,           // "tx:ty" or null
  selectedKey: null,          // "tx:ty" or null

  // Server state
  stats: { sold: 0, volume: 0, owners: 0 },
  loading: true,
  dbError: null,

  // Purchase flow
  purchaseModal: false,
  purchaseStep: 'select',     // 'select' | 'payment' | 'confirming' | 'confirmed' | 'error'
  purchasingKey: null,        // locked-in tile key for the duration of a purchase
  selectedCurrency: 'ETH',
  paymentData: null,          // { address, amount, qrData, usdAmount }
  paymentTimeLeft: 1800,      // seconds (30 minutes)
  purchaseError: null,
}
```

### Actions

#### `loadBlocksFromServer()`
```
1. Set loading: true, dbError: null
2. Parallel: fetchBlocks() + fetchStats()
3. Map rows → blocks Map via rowToBlock()
4. Set blocks, stats, loading: false
5. On error: set dbError message
```

#### `setMapReady(v)` / `setZoom(z)`
Simple setters for map lifecycle state.

#### `setHoveredKey(key)` / `setSelectedKey(key)`
Update hover/selection. `setSelectedKey(null)` deselects.

#### `openPurchaseModal()`
Sets `purchaseModal: true`, copies `selectedKey` → `purchasingKey` (immutable for flow duration), resets step to `'select'`.

#### `closePurchaseModal()`
Resets: `purchaseModal: false`, `purchaseStep: 'select'`, `paymentData: null`, `paymentTimeLeft: 1800`, `purchaseError: null`.

#### `setSelectedCurrency(c)`
Updates `selectedCurrency`. No side effects.

#### `startPayment()`
```
1. Look up block from purchasingKey (or compute base price via tileBasePrice)
2. Compute scarcity multiplier from blocks.size
3. Final USD price = base × multiplier
4. Look up RATES[selectedCurrency]: { rate, address, decimals }
5. Compute crypto amount = usdPrice / rate, formatted to `decimals` places
6. Generate qrData URI (e.g., "ethereum:0xABC?amount=0.001234")
7. Set paymentData, step: 'payment', paymentTimeLeft: 1800
```

#### `tickPaymentTimer()`
Decrements `paymentTimeLeft` by 1. If reaches 0: sets step `'error'` with "Payment expired" message.

#### `simulateConfirm()`
```
1. Set step: 'confirming'
2. POST /blocks with purchase data (owner = "you", random color)
3. Wait 2000ms (simulated blockchain delay)
4. Update blocks Map with returned block
5. Fetch fresh stats
6. Set step: 'confirmed'
7. On error: set step: 'error', purchaseError
```

### Constants in Store

```js
RATES = {
  BTC:   { rate: 65000, address: "bc1q...", decimals: 8 },
  ETH:   { rate: 3200,  address: "0x...",   decimals: 6 },
  SOL:   { rate: 180,   address: "...",     decimals: 4 },
  USDT:  { rate: 1,     address: "0x...",   decimals: 2 },
  BNB:   { rate: 580,   address: "0x...",   decimals: 4 },
  MATIC: { rate: 0.9,   address: "0x...",   decimals: 2 },
}
```

### Helper: `rowToBlock(row)`
Converts flat DB row object to typed block:
```js
{
  key: row.tile_key,
  tx: row.tx,
  ty: row.ty,
  owner: row.owner,
  color: row.color,
  price: row.price,
  country: row.country,
  purchasedAt: row.purchased_at,
  imageUrl: row.image_url || null,
  label: row.label || null,
}
```

---

## Library: `tiles.js`

Pure utility module. No imports.

### Constants

| Name | Value | Description |
|------|-------|-------------|
| `PURCHASE_ZOOM` | `11` | Zoom level used for purchasable tile grid |
| `GRID_N` | `2048` | Tiles per side at zoom 11 (`2^11`) |
| `TOTAL_TILES` | `268,435,456` | `GRID_N²` — total purchasable tiles worldwide |
| `KM_PER_TILE` | `~19` | Approximate tile width at equator in km |

### Functions

#### `lngLatToTile(lng, lat, z)`
Converts WGS-84 coordinates to Web Mercator tile indices.

```
x = floor((lng + 180) / 360 × 2^z)
sinLat = sin(lat × π / 180)  [clamped to ±0.9999]
y = floor((1 - ln((sinLat + 1) / (1 - sinLat)) / (2π)) / 2 × 2^z)
```
Returns `{ x, y }` clamped to `[0, 2^z - 1]`.

#### `tileNW(tx, ty, z)`
Inverse: tile indices → northwest corner WGS-84 coordinates.
```
lng = tx / 2^z × 360 - 180
lat = atan(sinh(π × (1 - 2ty/2^z))) × 180/π
```
Returns `{ lng, lat }`.

#### `tilePoly(tx, ty, z)`
Returns a GeoJSON `Feature<Polygon>` for a tile. Corners: NW → NE → SE → SW → NW (closed ring).
Properties: `{ tx, ty, key: "tx:ty" }`.

#### `tileKey(tx, ty)`
Returns canonical string `"tx:ty"`.

#### `parseKey(key)`
Returns `{ tx: Number, ty: Number }` from `"tx:ty"` string.

#### `tileBasePrice(tx, ty)`
Deterministic pricing based on tile coordinates. Range: $1–5 USD.

```
hash = (tx × 1619 + ty × 2971) % 1000 / 1000   [0–1 pseudo-random]
base = 1 + hash × 4                              [$1–5]
bonus = 0.8 if latitude 25°N–60°N               [settled land premium]
return base + bonus                              [$1–5.8]
```

Latitude is back-calculated from `ty` via `tileNW`.

#### `emptyFC()`
Returns `{ type: 'FeatureCollection', features: [] }`.

---

## Library: `api.js`

Thin fetch wrapper. Base URL: `http://127.0.0.1:8000`.

### Helper: `req(method, path, body?)`
```js
fetch(BASE + path, {
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body ? JSON.stringify(body) : undefined,
})
```
Throws on non-OK responses (attaches response text to error).

### Exports

| Method | HTTP | Endpoint | Returns |
|--------|------|----------|---------|
| `api.fetchBlocks()` | GET | `/blocks` | `Block[]` |
| `api.purchaseBlock(data)` | POST | `/blocks` | `Block` |
| `api.fetchStats()` | GET | `/stats` | `{ sold, volume, owners }` |

---

## Library: `addr.js`

**One chain-aware way to display an owner address.** Every surface that shows a
`block.owner`, `entry.wallet`, `listing.seller` or a connected wallet imports from
here. Pure module, no imports of its own.

### Why it exists

The `owner` column holds whatever the build's chain uses, and the formats are not
close to the same length:

| Family | Example shape | Length |
|---|---|---|
| evm | `0x` + 40 hex | 42 |
| tezos | `tz1…` base58 | 36 |
| solana | base58 | 43–44 |
| ton | `EQ…` base64url | 48 |
| stellar | `G…` base32 | 56 |
| cardano / algorand | `addr1q…` bech32 / bare base32 | 58 |
| multiversx | `erd1…` bech32 | 62 |
| aptos / sui / starknet | `0x` + 64 hex | 66 |
| radix | `account_rdx12…` bech32 | 65 |
| near | `alice.near` — a **human name** | 6–64 |

Every call site used to reimplement `startsWith('0x') ? head+tail : raw`, which
produced two distinct bugs off the EVM path:

1. **Unbounded strings.** Non-EVM addresses fell through the `0x` test and were
   rendered raw — into the ticker, onto both `TileCertificate` canvases (which
   cannot clip or ellipsise at all), and into the Guardian header row in
   `PurchasePanel`, which had no `overflow`/`nowrap` and so let an unbreakable
   65-char token run under the *ACTIVE* badge.
2. **Destroyed NEAR/ENS names.** A blanket "longer than 12 ⇒ chop the middle"
   rule turned `zephyr1234.near` into `zephyr…near`. The name *is* the identity.

### API

| Export | Use |
|---|---|
| `shortAddr(addr, { tail = 4, head, maxName = 24 })` | Default for all text UI. Returns `''` for empty input. |
| `tinyAddr(addr, max = 10, maxName = max + 4)` | Head-only, for surfaces with no room for a tail — currently just the 64px map sprite label. |

Behaviour:

- **Names pass through whole.** Anything matching `name.tld` (`alice.near`,
  `whale.eth`, `shop.tez`) is returned unmodified up to `maxName`.
- **Head length adapts to the chain's own prefix**, so the result still reads as
  that chain's address instead of a generic hash. Known prefixes are matched
  longest-first (`account_rdx` before `0x`, `addr_test` before `addr1`) and the
  head is `prefix.length + 4`, clamped to `[6, 13]`.
- **EVM is unchanged**: `0x` → head 6 → `0x8f3a…1de2`, exactly the pre-existing
  shape, so nothing regressed on the 17 mainnet EVM builds.

| Family | Rendered |
|---|---|
| evm | `0x8f3a…1de2` |
| cardano | `addr1qkxy…qd4l` |
| radix | `account_rdx12…4lvn` |
| multiversx | `erd1qqqq…x0c3` |
| algorand | `4UTIOJ…MZHN` |
| near | `lumen5161.near` |

### Call sites

`HoverTooltip` · `PurchasePanel` (owner card + Guardian header) ·
`TileCertificate` (both canvases) · `LiveFeed` · `AgentFeedPanel` ·
`AccountModal` · `WalletModal` · `walletStore.shortAddress` · `Map` (`tinyAddr`).

Where the layout allows it, the shortened value carries the **full address in a
`title` attribute**, so it stays copyable/inspectable on hover.

---

## Viral surfaces (2026 v1)

See [viral-strategy.md](viral-strategy.md) for the full strategic context.

### Components

| File | Purpose |
|------|---------|
| `src/components/EmpireCard.jsx` | Modal containing the daily share artifact (1080×1080 SVG). Has Share / Download PNG / Copy Link buttons. The SVG is rendered with `forwardRef` so canvas serialization works for PNG export. |
| `src/components/PublicEmpire.jsx` | The `/u/{handle}` route — public-facing share landing page with mini-map, country medals, trophy cabinet, and a "Find your land" CTA. |
| `src/components/PersonalPlaceOnboarding.jsx` | First-load modal: search any place on Earth, see the tile, see the price, claim it. Called for first-time visitors and any URL with `?onboard=1`. |

### Stores

| File | Purpose |
|------|---------|
| `src/store/streakStore.js` | Daily check-in state. `current`, `longest`, `checkedInToday`, `badge`. Plus `ownerStreaks: Map` for map badges. |
| `src/store/shareStore.js` | Share modal state + public-empire viewer state. `card`, `publicEmpire`. |

### Routing

The app does its own minimal client-side route detection in `App.jsx`:

```js
function parseRoute(path) {
  const m = /^\/u\/([^/?#]+)/.exec(path)
  if (m) return { kind: 'empire', handle: decodeURIComponent(m[1]) }
  if (/^\/ecosystem\/?$/.test(path)) return { kind: 'ecosystem' }
  return { kind: 'game' }
}
```

There are three routes. When `route.kind === 'empire'` the entire `<App>` returns
`<PublicEmpire>` instead of mounting the game; when it is `'ecosystem'` it returns
`<EcosystemPage>`; otherwise the game mounts. Both non-game routes return **before**
the map, stores and modals are set up, so neither pays the game's boot cost.

When the user clicks "Claim your land →" we push `/?onboard=1` and dispatch a synthetic `popstate` to re-render and trigger the onboarding modal.

The FastAPI SPA catch-all (`@app.get("/{full_path:path}")`) serves `dist/index.html` for any unknown path including `/u/...` and `/ecosystem`, so deep links work in production. In dev the Vite dev server resolves the same paths directly to the React app.

### `/ecosystem` — the grant-reviewer page

`src/components/EcosystemPage.jsx` is the URL we put in a grant application. It answers
a reviewer's questions in the order they ask them: **who** (chain logomark, "CryptoLand
on <Ecosystem>", `PROFILE.tagline` + `PROFILE.pitch`), **traction** (live
`GET /metrics/grant?days=30`), **native integration** (a spec table), **why this chain**
(`PROFILE.onboarding.why` + `.grantAngle`), then one CTA into the map.

Written once, chain-native on all 29 builds: every word comes from `PROFILE` and every
fact from `ACTIVE_CHAIN`, so adding chain #30 needs no edit here.

Three rules it is bound by, because a reviewer will check:

- **No fabricated numbers.** Every figure is a field of the `/metrics/grant` response.
  If the fetch fails the whole traction section renders **nothing** — a zero would read
  as "no traction" rather than "no data".
- **No implied contract.** Contract status is read from `ACTIVE_CHAIN.contractAddress`;
  with none configured the row says "Not yet deployed — mint stubbed" in plain words.
- **Seeded data is disclosed** under the traction block, since every per-chain world
  ships seeded by `server/seed_chain.py`.

It is also deliberately **not** instrumented with `analytics` — firing a page view here
would put grant reviewers into the DAU number this very page reports.

`/metrics/grant` takes a `chain` parameter, and the page passes
`ACTIVE_CHAIN_CANONICAL` whenever `VITE_SCOPE_TO_CHAIN` is set. Every figure — DAU/WAU/
MAU, D1/D7 retention, tiles, owners, volume and guardians — is then computed from that
chain's rows alone. Unscoped, an Algorand reviewer was shown all 29 chains' traction
(MAU 12,093 instead of 259), which is worse than showing nothing.

### HUD additions

The top-right cluster gains two new pills when the user is signed in:
- **Streak chip** — orange when checked in today (`🔥 12d`), neutral when not (`✓ Check in`). One-click check-in. Tapping when already checked in opens the share card.
- **Share button** — opens the EmpireCard modal directly.

### Empire Card design rationale

- **1080×1080 square** — fits Instagram, X, Telegram, iMessage, WhatsApp without cropping
- **Pure SVG** — pixel-perfect at any scale; trivial PNG export via canvas
- **One headline + one map + medals + streak chip** — readable in 1 second; the only "ambient" share artifact in the land-game category
- **Cached per UTC day** — generated lazily on first request, then served from `share_cards` table for the rest of the day. Daily cadence creates BeReal-style return visits.

### Streak design rationale

- **UTC day boundaries** — deterministic across timezones; same-day idempotent
- **Loss aversion** — `current_streak` resets to 1 on any missed day
- **Public badges** — wallets with streak ≥ 7 are returned by `/streak/owners` and decorated on the map (badge tier visible to other users → status / Veblen good)
- **Tier ladder** — Spark (7d) → Silver (30d) → Gold (100d) → Legend (365d)

---

## 2026 Viral Frontier UI

Four interlocking components that together implement the viral mechanics in [viral.md](viral.md). All share solid-dark design tokens (`#0f0f0f`, `#141414`, `#1a1a1a`) — no glassmorphism.

### `src/store/viralStore.js`

Single Zustand store managing all 2026 viral state.

- `agentPosts` — array of `{ id, tile_key, owner, personality, mood, body, treasury, ts }` polled every **30 s**
- `dropState` — today's `/drop/today` snapshot polled every **15 s** so the countdown stays accurate
- `mySquad` — current user's squad summary (loaded on demand)
- `squadLeaderboard` — top squads

Polling helpers: `startAgentPolling()`, `startDropPolling()` start interval timers and are cleaned up by their corresponding `stop…()` methods.

### `AgentFeedPanel.jsx`

Right-side slide-in panel exposing the **public live feed of every deployed Guardian's micro-posts**. Truth Terminal pattern: each post shows mood (proud/anxious/bored/scheming/scared/smug/lonely/hungry), personality, tile key, owner, treasury, and timestamp. Always-polling; chip in HUD shows the latest line.

Exports:
- default `AgentFeedPanel` — the panel
- `AgentFeedChip` — the HUD chip

### `LandDropModal.jsx`

BeReal × Wordle daily ritual:
- States: `upcoming` (shows HH:MM countdown), `live` (shows MM:SS countdown + 3 mystery boxes), `closed` (lights off).
- Claim picks `choice_idx ∈ {0,1,2}` and gets back a `{ rarity, tile_key, country, share_grid }`.
- The `share_grid` is a 3-row emoji block (🎁🎁🎁 / 🟪⬜⬜ / 👑👑👑 for mythic) styled for paste-anywhere social shares.
- Founder-tier badge shown to authed users; mythic odds boost up to 15% for founders.

Exports:
- default `LandDropModal`
- `LandDropChip` — HUD chip showing `LIVE MM:SS`, `in HH:MM`, or `closed`.

### `SquadPanel.jsx`

Notcoin Squads × Locket intimacy-cap (6 max, 4-min-quorum):
- Create-or-join flow.
- Shows member roster with each member's tile count and contributed volume.
- Big "TAP TO COPY" code for inviting friends.
- Healthy/below-quorum status with yield multiplier (`+40%` healthy, `-40%` shrunk).
- Top-5 leaderboard panel inline.

Exports:
- default `SquadPanel`
- `SquadChip` — HUD chip showing `5/6` etc.

### HUD integration

`HUD.jsx` mounts all three chips in the right-side button row, between the existing logo/stats and the Streak/Share/Wallet buttons. On mobile a compact subset is shown.

### ShareTileButton (inline in `PurchasePanel.jsx`)

On any owned tile, an "↗ Share Tile · public page" button copies `https://…/t/{tile_key}` to clipboard (or invokes `navigator.share()` on mobile). The URL serves a server-rendered HTML mini-page (Frame) with OG image, agent quote, and a "Claim adjacent tile" CTA.

### Vite proxy additions (`vite.config.js`)

```
/agents, /squads, /drop, /t, /og → http://127.0.0.1:8000
```
