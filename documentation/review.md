# Codebase Review — CryptoLand

## What's Working

### Core Features (Confirmed Functional)
- **Map rendering** — MapLibre GL with OSM tiles, desaturated/darkened filter, full viewport
- **Tile grid** — Z11 Web Mercator, 2048×2048, visible grid lines that scale with zoom
- **Hover tooltip** — follows mouse, hides on touch devices, shows block metadata
- **Selection panel** — right-side (desktop) / bottom sheet (mobile) on tile click
- **Purchase flow** — full multi-step modal: currency select → payment → confirming → confirmed
- **NOWPayments integration** — real payment creation via `/np/payment`, polling every 10s, auto-finalize
- **Block persistence** — SQLite via FastAPI, seeded with ~180 real blocks across 28 owners
- **Leaderboard** — fetches live country stats from `/stats/countries`
- **Live feed** — seeded from DB blocks, augmented with simulated purchases every 3–8s
- **Toast notifications** — real new blocks + simulated activity, auto-dismiss 5s
- **Themes** — 4 themes (Glass/Dark/Tactical/Neon), persisted to localStorage
- **Deep links** — `?block=tx:ty` URL param flies to and selects a tile on load
- **Share links** — copy-to-clipboard URLs for individual blocks
- **Block customization** — PATCH endpoint, image URL + label saved to DB
- **Portfolio** — localStorage-persisted list of owned blocks, shows in HUD
- **Search** — Nominatim geocoding, debounced 320ms, keyboard navigation
- **Safe area insets** — CSS env() variables for notched iOS devices
- **Animated pulse rings** — custom MapLibre animated sprite for recently purchased blocks
- **Image markers** — DOM markers with block photos, scale/fade with zoom

### Backend (Confirmed Functional)
- `GET /blocks` — returns all blocks, newest first
- `GET /stats` — sold count, total volume, owner count
- `GET /stats/countries` — top 20 countries by block count
- `POST /blocks` — purchase a block (idempotent for same owner)
- `PATCH /blocks/{tile_key}` — update image_url / label
- `POST/GET /np/*` — NOWPayments proxy (API key never leaves server)
- `POST /np/ipn` — IPN webhook with HMAC-SHA512 signature verification
- CORS — all origins allowed
- Production static file serving — `/dist/` mounted

---

## Bugs Fixed in This Review

### 1. `isMobile` Not Reactive (Critical)
**Problem:** `PurchasePanel`, `PaymentModal`, `Sidebar`, and `CustomizeModal` computed `isMobile` at render-time with a plain `window.innerWidth < 640` check — not a hook. The value never updated when the window was resized.

**Fix:** Created `src/lib/hooks.js` with a proper `useIsMobile(breakpoint)` hook using `window.matchMedia` and an event listener. All 5 components now import and call `useIsMobile()`.

### 2. PurchasePanel Mobile Scroll Bug (iOS)
**Problem:** The panel style set `overflow: 'hidden'` at the top level, then `overflowY: 'auto'` inside the panel style. On iOS Safari, `overflow: hidden` on a parent blocks momentum scrolling on children even with `overflowY: auto`.

**Fix:** Removed the redundant `overflow: 'hidden'` from the panel container — the individual mobile/desktop styles already handle scrolling.

### 3. SearchBar Overlap on Mobile (Layout)
**Problem:** SearchBar used `width: min(340px, calc(100vw - 180px))` and positioned at `top: 12px` — same row as the HUD logo and theme button. On 375px phones, this leaves essentially no room and overlaps both.

**Fix:**
- On mobile, position SearchBar below the HUD: `top: calc(max(12px, var(--sat)) + 52px)`
- Width: `min(340px, calc(100vw - 24px))` on mobile (full width minus padding)
- On desktop: `min(340px, calc(100vw - 340px))` to respect HUD + theme button space

### 4. HUD Stats Bar Overflow on Small Phones
**Problem:** Stats bar had `maxWidth: min(calc(100vw - 168px), 600px)` with each stat cell `minWidth: 70px`. On 375px phones this means ~207px for 6 stats = ~34px per stat, which clips text.

**Fix:** On mobile, show only 2 stats (Sold + Zoom), hide the 4 less-critical ones. `maxWidth` also correctly accounts for the compressed layout.

### 5. MapLibre CSS Loaded from CDN (Reliability)
**Problem:** `index.html` loaded MapLibre GL CSS from `unpkg.com`. If CDN is slow or blocked, the map UI breaks (wrong icon sizes, missing UI elements).

**Fix:** Moved to `import 'maplibre-gl/dist/maplibre-gl.css'` in `main.jsx` — bundled with Vite, zero external dependency at runtime.

### 6. Vite Dev Proxy Missing (Dev Server)
**Problem:** `api.js` used `VITE_API_BASE ?? ''` — empty string means all API requests went to the Vite dev server (port 5173), not FastAPI (port 8000). The `.env` hardcoded `http://127.0.0.1:8000` as a workaround but this wouldn't work in production builds.

**Fix:** Added proxy config to `vite.config.js` for `/blocks`, `/stats`, `/np`, `/health` → `http://127.0.0.1:8000`. Both `.env` and `.env.production` now use `VITE_API_BASE=` (empty, resolved by proxy in dev, relative path in prod).

### 7. Inter Font Not Loaded
**Problem:** `index.css` declares `--sans: 'Inter', system-ui` but `index.html` only loaded Space Mono and Syne. All UI text fell back to system-ui.

**Fix:** Added `Inter` weight 400/500/600/700 to the Google Fonts link in `index.html`.

### 8. HUD Portfolio Dropdown Off-Screen on Mobile
**Problem:** Portfolio used `position: absolute` which could place it off-screen on narrow phones. Width was fixed at 260px.

**Fix:** Changed to `position: fixed`, width `calc(100vw - 24px)` on mobile, capped at `maxWidth: 300px`.

### 9. Theme Button Positioning
**Problem:** Theme button at `right: max(56px, ...)` was designed assuming MapLibre zoom controls at top-right, but NavigationControl is placed at `bottom-right`. On mobile the button could overlap with the stat bar.

**Fix:** Moved to `right: max(12px, var(--sar))` — cleaner positioning, no overlap.

### 10. MapLibre Canvas touch-action
**Problem:** `touch-action: none` on the MapLibre canvas prevents some iOS Safari touch behaviors including pull-to-refresh blocking.

**Fix:** Changed to `touch-action: pan-x pan-y` which is compatible with MapLibre's gesture handling while allowing proper browser behavior.

### 11. Missing OG Meta Tags
**Problem:** Share links had no Open Graph metadata, so social card previews were empty.

**Fix:** Added `og:title`, `og:description`, `og:type`, and `twitter:card` meta tags.

### 12. `dvh` Unit Without Fallback
**Problem:** `body` height used `100dvh`/`100dvw` only — older browsers (pre-2022) don't support `dvh`.

**Fix:** Added `100vh`/`100vw` fallback lines before the `dvh`/`dvw` declarations.

### 20. Black Screen — Overlay Scope Bug in useEffect Cleanup
**Problem:** After introducing the custom overlay system, the app showed a completely black screen. The `overlay` div was created inside `map.on('load', () => { ... })` and assigned to `overlayRef.current`, but the `useEffect` cleanup function referenced the local `overlay` variable directly. Because the cleanup runs at unmount time (outside the `load` callback scope), `overlay` was `undefined` there — causing a crash that prevented React from mounting at all.

**Fix:** Changed cleanup to `overlayRef.current?.remove()` which is always in scope via the ref.

### 19. Replaced MapLibre Marker System with Custom Overlay (Definitive Fix)
**Root cause of floating:** `maplibregl.Marker` internally listens to `move` and `moveend` events to reposition elements via `style.transform`. During a smooth zoom animation, MapLibre animates the camera every frame, but `Marker._update()` only fires on event callbacks — not every frame. Custom-sized markers (width/height changing with zoom) therefore lag 1–2 frames behind the camera during animation, producing the visible "float/slip" effect. No amount of `render`-event resizing fixes this because the anchor translate is set by MapLibre's Marker internals, not by us.

**Fix:** Completely replaced `maplibregl.Marker` with a custom overlay div system:
- An `overlay` div (`position:absolute; inset:0; pointer-events:none`) is appended to the map container after MapLibre's canvas loads (so it sits on top in the stacking order)
- Each block's DOM element is appended to this overlay with `position:absolute`
- `positionOverlayEls(map)` runs on every `render` event — uses `map.project([lng,lat])` to compute exact pixel positions each frame and sets `transform: translate(x,y)` + `width`/`height` directly
- Because this runs inside MapLibre's render loop (same RAF cycle), the block overlays are always perfectly aligned with the tile on every animation frame — zero float

**Fix for images not showing:** Previous system hid markers at `tilePx < 18` (opacity 0). New system fades in starting at 6px, fully visible at 20px — images visible across all zoom levels where tiles are discernible.

### 18. Fixed Floating Markers During Zoom + Images Not Showing
**Problem 1 — Floating markers:** `resizeMarkers()` used `map.project(nw, se)` to compute pixel size. `project()` gives screen pixels for the *current* frame, but was only called on `zoom` and `move` events — not on every animation frame. During smooth zoom animation MapLibre moves the anchor point every frame (via CSS transform), but the `width`/`height` of the marker element only updated on the *next* event, causing a 1–2 frame lag that made markers appear to float/slip away from their tile.

**Fix:** Replaced `project()`-based sizing with pure zoom math: `tilePx = 256 * 2^(zoom - 11)`. This formula exactly equals the CSS pixel width of one Z11 tile at any zoom level — no project() call, no lag. Hooked `resizeMarkers` to the `render` event (fires every animation frame) instead of `zoom`/`move`. Result: markers are always exactly tile-sized with zero float during zoom or pan.

**Problem 2 — Images not showing on blocks:** Markers were fading in only when `tilePx > 18px`, which at zoom 7–9 tiles are 4–32px — borderline invisible. The old threshold `w < 18 → opacity 0` meant blocks appeared as plain colored squares until very close zoom. Also the old `resizeMarkers` queried DOM with `querySelector('div:first-child')` / `querySelector('div:last-child')` which didn't reliably target the label vs image elements.

**Fix:** Lowered fade-in threshold to `tilePx < 6 → opacity 0`, `6–20px → fade in`. Added `data-lbl` attribute to label element for reliable targeting. Markers now show their images starting at zoom ~8 (tiles ~8px wide), giving visible photo thumbnails across the whole mid-zoom range.

### 17. Removed Floating Circle/Ring Artifacts on Map
**Problem:** Two MapLibre layers were producing floating visual artifacts during zoom:
1. `block-sprites` (symbol layer, z5–11) — rendered canvas-drawn owner icons as floating MapLibre symbols; at mid-zoom these appeared as misaligned, broken floating squares that didn't track tile positions correctly during zoom transitions.
2. `pulse-dots` (symbol layer, animated) — expanding ring animation that rendered hollow floating circles on every block, since the animated sprite re-triggers `map.triggerRepaint()` continuously and the `recent-points` source included all seeded blocks with recent timestamps.

**Fix:** Removed both layers and their associated infrastructure:
- Deleted `block-sprites` layer and `block-points` GeoJSON source
- Deleted `pulse-dots` layer and its animated `pulseImage` sprite setup (the 96×96 animated canvas)
- Deleted `syncBlockSprites()` function (registered MapLibre named images — now unused)
- Cleaned up all `setData` calls for removed sources in the store subscriber
- `drawBlockSprite()` and `makeMarkerEl()` retained — still used for DOM-based image markers at high zoom
- `recentBlocksPoints()` retained for future use

### 16. Seed Data v3 — Hand-Crafted Landmark Blocks
**Problem:** Even the v2 seed looked generic — randomly scattered blocks with recycled images and city-agnostic labels. Users wanted it to look like real people had claimed real famous places.

**Fix:** Full rewrite of `server/seed.py` with two layers:
- **90 hand-crafted landmark blocks** — every entry is a named real-world location (🗽 Liberty Island, 🗼 Eiffel Tower, 👑 Buckingham Palace, 🏙️ Burj Khalifa, 🎭 Sydney Opera House, ⛩️ Shibuya Crossing, ⛪ Christ Redeemer, etc.) with a specific Unsplash image curated for that exact place. Coords placed directly on the landmark.
- **50 organic cluster blocks** — fill out city neighborhoods around landmark clusters to give density, ~30% unlabeled to feel like casual buyers.
- **country_from_coords()** — bounding-box lookup assigns correct country to every landmark block so the leaderboard shows realistic country distribution.
- **Realistic timestamps** — weighted `ts(days_ago)` with ±3hr noise; newest blocks are the famous landmarks, older ones are the scattered fills.
- **Result:** 140 blocks · 42 owners · 56 with landmark images · proper country data for leaderboard.

### 15. Seed Data Overhaul — More Human, More Diverse
**Problem:** The original 28-user, ~180-block seed looked obviously synthetic: all-neon colors, generic crypto-bro handles, repetitive labels, same 16 images recycled, timestamps clustered uniformly.

**Fix:** Full rewrite of `server/seed.py`:
- **52 users** — mix of crypto-native wallet handles, real-sounding personal names (james_k, sofia.m, hiroshi_t), branded investors, and casual late-adopters
- **Color palette** — replaced all neon with a realistic diverse palette using Tailwind-calibrated hex values (muted greens, warm oranges, soft purples, slate grays)
- **City-specific images** — `CITY_IMAGES` dict maps 20 major cities to curated Unsplash URLs for that city (Eiffel Tower for Paris, Opera House for Sydney, Burj Khalifa for Dubai, etc.)
- **Generic fallback pool** — 28 diverse images: city aerials, satellite views, terrain, street-level, architecture, NFT art
- **City-specific labels** — `CITY_LABELS` dict with 5 landmark-specific labels per city (e.g. "🗼 Eiffel View", "🌊 Harbour View", "🎸 Kreuzberg Block")
- **Realistic timestamps** — weighted toward recent (last 1–2 weeks) with tail going back 6 weeks, simulating organic growth
- **Personality-driven image/label probability** — whales: 75% image coverage, 90% labels; casual users: 35% images, 40% labels
- **Result:** 500 blocks, 52 owners, 53% with images, 59% with labels, $9,367 volume

### 14. Intro Overlay Title Overflowing Modal Box
**Problem:** The "CRYPTOLAND" logo used `fontSize: clamp(44px, 11vw, 68px)`. At a constrained modal width (440px max with 40px padding = ~360px usable), the heavy 900-weight font at 68px overflowed and wrapped messily.

**Fix:** Reduced to `clamp(36px, 8vw, 56px)`, set `whiteSpace: nowrap`, and relaxed `letterSpacing` from `-0.05em` to `-0.03em`. Title now fits on one line at all supported viewport sizes.

### 13. Hover Tooltip Showing Over Purchase Panel
**Problem:** The `MapTooltip` in `HoverTooltip.jsx` only suppressed itself when `hoveredKey === selectedKey`. Moving the mouse over the purchase panel (right-side drawer) while a tile was selected could still trigger the tooltip for adjacent tiles visible behind the panel, showing "Uncharted Territory" info on top of the panel UI.

**Fix:** Changed the suppression condition from `hoveredKey === selectedKey` to `selectedKey` — the tooltip now hides entirely whenever any tile is selected (i.e., the purchase panel is open), regardless of which tile is currently hovered.

---

## Known Limitations (Not Blocking)

### Payment Polling Reliability
The 10s poll interval in `_startPolling` uses `setInterval` — if the tab is backgrounded on mobile, browsers throttle timers to 1+ minute intervals. This means payment confirmation can appear delayed on mobile. Mitigation: the IPN webhook (`POST /np/ipn`) handles server-side auto-finalize, so the block is recorded even if polling misses it; the user just won't see the confirmed UI immediately.

### Offline Coverage Partial
PWA manifest + service worker are implemented. App shell is cached; map tiles cache for 7 days. However, purchasing tiles and wallet operations still require an active network connection (intentional — payments and blockchain calls can't be queued offline).

### SQLite in Production
The current backend uses SQLite (`cryptoland.db`). Fine for development and low-traffic production but doesn't support horizontal scaling. Upgrade path: swap `aiosqlite` for `asyncpg` + PostgreSQL.

### Country Detection
`country` field is set by the client (based on seed data) rather than reverse-geocoded on the server. Server trusts the client's `country` value. This works with seeded data but in production should be reverse-geocoded server-side.

### Simulated Activity
`LiveFeed` and `PurchaseToast` inject fake purchases to make the app look busier. These are clearly labeled as simulation in code but not disclosed to users. In production, these should be removed once real purchase volume exists.

---

## Architecture Summary

```
Browser
  React 19 + Zustand
  MapLibre GL 5 (OSM tiles)
  Vite 8 + Tailwind CSS 4
       │
       │ HTTP (proxied via Vite in dev, relative in prod)
       ▼
  FastAPI (Python)
  uvicorn ASGI
  aiosqlite → SQLite
       │
       │ HTTPS
       ▼
  NOWPayments API
  (crypto payment processing)
       │
       │ IPN webhook
       └──────────────→ POST /np/ipn → auto-finalize
```

## File Map

```
src/
├── main.jsx              Entry — mounts React, imports MapLibre CSS
├── App.jsx               Root — layout, theme, intro, deep links
├── index.css             Design tokens, themes, component classes, animations
├── components/
│   ├── Map.jsx           MapLibre map, tile grid, hover/selection, markers
│   ├── HUD.jsx           Top stats bar, portfolio drawer
│   ├── PurchasePanel.jsx Selected tile details (mobile: bottom sheet)
│   ├── PaymentModal.jsx   Purchase flow modal (9 currencies, 6 steps)
│   ├── HoverTooltip.jsx   Mouse-follow tooltip (desktop only)
│   ├── Sidebar.jsx        Leaderboard drawer
│   ├── SearchBar.jsx      Nominatim geocoder
│   ├── LiveFeed.jsx       Bottom scrolling ticker
│   ├── PurchaseToast.jsx  Bottom-left toast notifications
│   ├── CustomizeModal.jsx Edit block image/label
│   ├── GuardianModal.jsx  Guardian deploy/reports/intel (3 tabs)  ← Guardian
│   └── RaidModal.jsx      Raid mini-game flow (Phase 2)           ← Guardian
├── store/
│   ├── gameStore.js       Zustand store — all state + async actions
│   └── guardianStore.js   Guardian Agent state — deploy/raids/profile ← Guardian
└── lib/
    ├── api.js             HTTP wrapper (includes all guardian calls) ← Guardian
    ├── nowpayments.js     NOWPayments proxy client (/np/* endpoints)
    ├── tiles.js           Web Mercator math, pricing (pure, no imports)
    └── hooks.js           Shared React hooks (useIsMobile)

server/
├── main.py               FastAPI app, all routes, DB lifecycle (guardian routes added) ← Guardian
├── guardian.py           Guardian engine — pure logic, no DB side-effects            ← Guardian
└── seed.py               Populate DB with realistic test data
```

---

## Bug / Change Log

### #21 — Guardian Agent System (2026-05-08)

**Feature: All 3 phases of Guardian Agent implemented.**

#### Files added
- `server/guardian.py` — pure engine: `compute_stats()`, `generate_daily_report()`, `resolve_raid()`, `resolve_defense()`, `analyze_territory()`
- `src/store/guardianStore.js` — Zustand slice: guardians map, modal state, all async actions
- `src/components/GuardianModal.jsx` — deploy/reports/intel modal (Phases 1 + 3)
- `src/components/RaidModal.jsx` — raid flow modal (Phase 2)
- `documentation/guardian.md` — full reference doc

#### Files modified
- `server/main.py` — added `guardians` + `raid_log` DB tables; added 9 guardian API routes
- `src/lib/api.js` — added 8 guardian API functions to `api` object
- `src/components/PurchasePanel.jsx` — added Guardian button (owned tiles) + Raid button (enemy tiles)
- `src/components/Map.jsx` — added shield badge to tile overlay for guarded tiles
- `src/App.jsx` — imported + mounted GuardianModal + RaidModal; boots guardian store in useEffect

#### Architecture notes
- Guardian stats (ATK/DEF/yield) are computed on-demand from DB row — never stored
- Daily reports are fully simulated with seeded RNG — no background jobs needed
- Raid seed uses 5-minute time buckets to prevent result fishing
- `guardianStore.guardians` is also persisted to `localStorage` as `cl-guardians` for offline resilience
- See `documentation/guardian.md` for full API reference, formulas, and "What NOT To Do" table

### #22 — Guardian seed data (2026-05-08)

`server/seed_guardians.py` added — seeds `guardians` + `raid_log` tables for existing blocks.

- **115 / 140 blocks** (82%) have guardians deployed
- Owner archetypes: whales/power-users → aggressive; active traders → balanced; casual/anon → passive
- Budget ranges: aggressive $80–400, balanced $20–120, passive $5–40
- XP ranges: aggressive 800–6000, balanced 200–2000, passive 10–500
- **34 raid log entries** with realistic win/loss history, yield stolen, margin %
- Unguarded tiles (25): `mark.j88`, `0x9bBc…1f77`, `not_a_bot_lol`, `liu_wei`, `sara_l`, `david_p`, `kwame_o`, `fatima_h`, `carlos_m` — and partial tiles for `crypto_kate`, `omar.al`, `yuki_s`, `travel_tom`, `ming_zhang`
- Run: `python3 server/seed_guardians.py` (idempotent — clears and re-seeds each run)

### #23 — Guardian frontend panel + all landmarks guarded (2026-05-08)

**seed_guardians.py:** Landmark tiles (any tile with a `label`) now always get a guardian — `is_landmark` bypass skips NO_GUARDIAN_OWNERS / PARTIAL_GUARDIAN_OWNERS exclusions. Result: 133/140 (95%) guarded, all capitals and named places protected.

**PurchasePanel.jsx — EnemyTileSection:** Non-owner visiting an owned guarded tile now sees:
- Guardian personality card with icon, level, owner, ATK/DEF/yield stats (loaded from `/guardian/{tile_key}`)
- "Negotiate with Agent" panel — user enters $/day offer, agent responds based on personality logic:
  - Aggressive: accepts ≥85% of target yield, counter-offers below that
  - Balanced: accepts ≥70% of target yield
  - Passive: accepts ≥50% of target yield
- "⚔️ Raid this tile" button (only shown when tile has a guardian)
- Unguarded tiles still show "This block is already owned" + no raid option

### #24 — Dynamic pricing from real-world events (2026-05-08)

**Data sources (all auth-free, no API keys required):**
| Source | Endpoint | Signal | Refresh |
|--------|----------|--------|---------|
| CoinGecko | `/simple/price` | BTC/ETH 24h change → global sentiment multiplier | 1h |
| Open-Meteo | `/forecast` | Weather code per country capital → local modifier | 1h |
| World Bank | `/country/{iso}/indicator/NY.GDP.MKTP.CD` | GDP tier → structural baseline | 24h |
| Wikipedia Pageviews | `/metrics/pageviews/per-article` | Daily article views → attention spike | 24h |

**Multiplier logic:**
- Final price = `base_price × scarcity × product(active_event_multipliers)`
- CoinGecko: BTC×0.7 + ETH×0.3 sentiment; mapped to ×0.80–×1.30 range
- Weather: overcast ×0.98, clear ×1.05, fog ×0.92, thunderstorm ×0.82, snow ×0.88
- GDP: mega-economy (>$5T) ×1.30, major (>$1T) ×1.18, large ×1.10, emerging ×0.95
- Wikipedia: >50k views ×1.40 "Trending globally 🔥", >20k ×1.25, >8k ×1.12, >2k ×1.05
- All multipliers capped globally at [×0.5, ×2.5]

**New files:**
- `server/price_events.py` — worker + DB helpers (`refresh_price_events`, `get_events_for_tile`, `compute_final_multiplier`, background loop every 30min)
- `src/store/priceStore.js` — Zustand store; `loadEvents()`, `loadTileContext()`, `getGroupedEvents()`
- `src/components/MarketSidebar.jsx` — "📊 Market" button (bottom-right), opens panel with global + per-country event cards showing ▲/▼ % badges, combined effect summary, source legend

**DB table:** `price_events (id, scope, source, event_type, multiplier, note, fetched_at, expires_at)` — scope is `global`, `country:<name>`, or `tile:<key>`

**New API endpoints:**
- `GET /price-events` — all active events (for MarketSidebar)
- `GET /tile-price-context?tile_key=&country=&base_price=` — per-tile multiplier + event breakdown

**PurchasePanel changes (unowned tiles only):**
- `DynamicPricePanel` component replaces static price box
- Shows base, scarcity ×, market events ×, and final price
- Strikethrough on original price if market events exist
- Expandable "Show N market factors" list with each event's icon, note, and % badge
- Market badge (e.g. "▲ +13.96% market") shown alongside scarcity rate

**Dependency added:** `aiohttp` (pip3 install aiohttp) for async HTTP in the price worker
**macOS SSL fix:** `TCPConnector(ssl=False)` — system Python lacks CA bundle by default

### #25 — Geo-economic pricing + region-aware territory narratives (2026-05-08)

**Problem:** `tileBasePrice()` used only latitude band (+$3 bonus for 25°N–60°N) + random hash, producing prices $12–23 globally with no geographic realism. `getTerritoryNarrative()` used random arrays (terrain, economy, status) with no geo-awareness, yielding "Volcanic ridge zone in Warsaw" type nonsense.

**Solution — pricing (`src/lib/tiles.js`):**
- Replaced single formula with 54-entry `GEO_REGIONS` lookup table
- Each region: `{ lngMin, lngMax, latMin, latMax, base, spread }` — deterministic hash picks price within range
- 5 tiers backed by real GDP/capita + real estate data:
  - **Tier 1 $45–75:** US coasts, Western Europe, Singapore, Tokyo metro
  - **Tier 2 $32–55:** US Midwest, Canada, Spain/Italy, UAE, Australia, South Korea
  - **Tier 3 $22–38:** Poland/EU East, Russia (Moscow), China coast, Gulf, Brazil SE
  - **Tier 4 $14–24:** India, SEA, Egypt, Central Asia, Mexico, Colombia
  - **Tier 5 $12–18:** Sub-Saharan Africa, Pacific islands, Arctic, uncharted ocean
- New export `geoRegion(lng, lat)` — returns the matching region record (used by future features)
- Verified spot-check (Node.js):

| City | Price | Range |
|------|-------|-------|
| San Francisco | $61 | $48–76 |
| New York | $58 | $50–76 |
| London | $58 | $46–70 |
| Warsaw | $45 | $30–46 |
| Moscow | $36 | $26–40 |
| Dubai | $60 | $42–64 |
| Singapore | $64 | $52–72 |
| Tokyo | $65 | $44–66 |
| Mumbai | $27 | $20–32 |
| Lagos | $17 | $12–18 |
| Mexico City | $25 | $22–34 |
| Bangkok | $27 | $18–28 |

**Solution — narratives (`src/components/PurchasePanel.jsx`):**
- Replaced random 3-array system with `GEO_NARRATIVES` — 22 region definitions, each with terrain/economy/status arrays grounded in the actual geography
- Regions: British Isles, Western Europe, Nordics, Eastern Europe, Russia/post-Soviet, US West Coast, US East Coast, US Midwest, Canada, Middle East/Gulf, South Asia, Southeast Asia, Singapore, East Asia (China coast), Japan, South Korea, Australia/NZ, Sub-Saharan Africa, North Africa/Levant, Latin America, Central America/Caribbean, Central Asia, Arctic/Ocean
- Narratives now match real-world characteristics — e.g. Warsaw gives "Central European plain in Poland. Rapidly developing with rising real-estate valuations, driven by EU-integrated logistics corridor"
- Narrative function uses `tileNW()` to get lat/lng, finds the first matching `GEO_NARRATIVES` region, then hashes tx/ty to pick from within that region's arrays

### #26 — MarketSidebar redesign: left-side persistent drawer (2026-05-08)

**Old:** Floating `📊 Market` button at bottom-right, opened a small floating panel (320×520px).

**New:** Full-height left-edge drawer with a slim tab toggle.
- **Tab:** 24px wide strip on the left edge, vertically centred, shows "MARKET" text rotated 90° + a pulsing mood dot. Slides right as the drawer opens.
- **Drawer:** `PANEL_WIDTH = 300px`, position `fixed left:0`, spans from `--sat` (safe area top) to `var(--feed-h)` (live feed), slides in/out with `cubic-bezier(0.4,0,0.2,1)` transition.
- **Header:** Title + "live signals · price impact · N min ago" + refresh button + mood bar (bullish/bearish/mixed).
- **World Situation section:** `SummaryCard` component — synthesises events into human-readable panels:
  - Global Price Pressure card (net crypto multiplier + BTC note)
  - Weather Conditions (favorable vs adverse country count)
  - Premium Economies (top GDP-tier countries)
  - Trending Territories (Wikipedia top pageview spikes)
- **How Prices Are Affected section:** Short explainer with source icons mapping each API to its effect.
- **Territory Breakdown section:** Collapsible `CountryRow` per country — shows combined % badge, expands to show individual event rows.
- **Mobile:** Unchanged bottom sheet behaviour (pill trigger at bottom-left, slides up).
- No backdrop on desktop (drawer overlays map, user can still interact with map by clicking outside).

### #27 — MarketSidebar: always-open left panel (2026-05-08)

Removed the toggle tab entirely. The sidebar is now **always visible** on desktop — no button required.

- `position: fixed; left: 0` — flush against left edge
- `top: calc(max(14px, calc(var(--sat) + 10px)) + 42px + 8px)` — starts exactly below the HUD pill bar
- `bottom: var(--feed-h)` — ends exactly at the LiveFeed bar
- `width: 272px`, `zIndex: 15` — below PurchasePanel (30) and modals (25+), above map
- Loads data immediately on mount (no "open" gate); background refresh every 5 min

### #28 — Bloomberg Terminal redesign + richer CoinGecko data (2026-05-08)

**Backend (`server/price_events.py`):**
- Added `HEADERS` dict with `User-Agent: CryptoLand/1.0` applied to all fetch calls — fixes Wikipedia 403
- Added `fetch_coingecko_global()` — pulls `/global`: total market cap, 24h % change, BTC dominance
- Added `fetch_coingecko_trending()` — pulls `/search/trending`: top 5 trending coins with 24h % change
- All three CoinGecko calls fire in parallel via `asyncio.gather()`
- Trending coins stored as `source=coingecko_trending` event with `multiplier=1.0` (info-only, no price effect)
- Refresh loop reduced from 1800s (30 min) → 600s (10 min)
- `User-Agent` header applied to all 4 data sources (Wikipedia, CoinGecko, Open-Meteo, World Bank)

**Frontend (`src/components/MarketSidebar.jsx`):**
- Full Bloomberg terminal redesign: dark `#0d0f12` background, monospace data, color-coded ▲/▼
- **TickerBar** — animated horizontal ticker at top of panel: BTC/ETH price, market cap, BTC dominance
- **CryptoBlock** — 2-column BTC/ETH price cards with per-coin 24h %, 3-column stats row (MCAP/MKT 24H/DOM), net price signal badge, trending coin chips
- **MacroTable** — compact rows: country | GDP size | multiplier badge (top 8 by GDP tier)
- **WeatherTable** — compact rows: country | temp | multiplier badge (top 12)
- **WikiTable** — compact rows: country | view count | multiplier badge (only >1.0 shown)
- **SectionHeader** — 8px uppercase section dividers with source attribution on right
- **DataRow** — uniform label/value layout used across all dense data rows
- **Chg** badge — triangle + %, green/red, with subtle background tint
- `parseCryptoNote()` — extracts BTC price, ETH price, market cap, BTC dominance from DB note string
- `src/store/priceStore.js` — added `coingecko_trending` to SOURCE_META
- Mobile: same bottom-sheet UX preserved, now also shows TickerBar + CryptoBlock inside sheet

**Width:** unchanged at 268px (CSS variable `--market-w: 268px` set on mount)
- Mobile: unchanged bottom-sheet pill (bottom-left, same row as Leaderboard)

### #29 — Blockchain abstraction layer + ERC-721 contract (2026-05-08)

**Goal:** Make the app fund-pitchable to multiple chains (Polygon, Avalanche, Base, etc.) without any code changes — just a single env var swap.

**Chain-agnostic adapter pattern (`src/lib/blockchain/`):**
- `config.js` — `CHAINS` registry with 9 chains (4 EVM mainnets, 4 EVM testnets, Solana). Each entry: chainId, name, family, rpcUrl, fallback RPC, explorerUrl, nativeCurrency, contractAddress (from env var), blockTime, confirmations, color, logo, testnet flag. `ACTIVE_CHAIN_KEY = VITE_CHAIN ?? 'polygon-amoy'`.
- `index.js` — dynamic import by `ACTIVE_CHAIN.family`; re-exports all adapter functions + config helpers (`explorerTxUrl`, `explorerNFTUrl`).
- `adapters/evm.js` — raw JSON-RPC + EIP-1193, no ethers.js. `connect()`, `disconnect()`, `mintTile()`, `listForSale()`, `unlistTile()`, `buyTile()`, `getOwnedTokenIds()`, `tileTokenId(tx,ty)`, `tokenIdToTile(id)`, `waitForTx()`, `detectWallets()`. Pre-computed ABI selectors, minimal `encodeCall()`/`decodeUint()` helpers.
- `adapters/solana.js` — Phantom/Solflare/Backpack. Minting delegates to `/solana/build-mint` backend (no Metaplex in browser). Same interface as evm.js.
- `contracts/abi.json` — universal ABI matching `CryptoLandTile.sol`.

**ERC-721 contract (`contracts/CryptoLandTile.sol`):**
- Pure Solidity, no OpenZeppelin dependency (leaner bytecode, simpler audit)
- `tokenId = (tx << 22) | ty` — unique, deterministic, fits uint44
- `mint(to, tokenId, tileKey, country)` — onlyOwnerOrMinter, payable (2.5% mint fee)
- `listForSale(tokenId, priceWei)` / `unlist(tokenId)` / `buy(tokenId)` — peer-to-peer marketplace with 2.5% protocol fee
- `tokensOfOwner(address)` — full enumerable
- 2-step ownership transfer, emergency pause, minter role
- Full test suite: `contracts/test/CryptoLandTile.test.js` (Hardhat + Chai, 15+ test cases)
- Multi-chain deploy config: `contracts/hardhat.config.js` (8 EVM networks)
- Deploy script: `contracts/scripts/deploy.js` — auto-writes `VITE_CONTRACT_<CHAIN>=0x...` to `.env`

**Adding a new EVM chain:** add one entry to `CHAINS` in `config.js`, set `VITE_CHAIN=<key>` in `.env`, deploy contract. No adapter code changes.

### #30 — Wallet connect UI (2026-05-08)

**`src/store/walletStore.js` (new Zustand store):**
- State: `address`, `shortAddress`, `chainId`, `chainName`, `balance`, `ownedTiles[]`, `txHistory[]`, `connecting`, `walletModal`
- `connect()` — calls adapter, subscribes to `onAccountsChanged`/`onChainChanged`/`onDisconnect`, fires `refreshOwnedTiles()` + `refreshBalance()`
- `disconnect()` — clears state, calls `analytics.walletDisconnect()`
- `tryReconnect()` — silent `eth_accounts` check on boot, no modal
- `refreshBalance()` — `eth_getBalance` → formatted string ("1.234 MATIC")
- `refreshOwnedTiles()` — maps tokenIds → `tx:ty` tile keys
- `recordTx()`, `markTileOwned()` helpers
- Persists address/chainId to `localStorage` (`cl-wallet`); TX history capped at 100 entries (`cl-tx-history`)

**`src/components/WalletModal.jsx` (new):**
- Wallet picker: MetaMask, Coinbase, Rabby — shows detected / not-detected
- Connected view: address card (copy, chain badge, testnet label), Portfolio tab (owned NFTs), History tab (tx log with explorer links)
- Chain color strip + logo
- Error display, connecting spinner

**`src/components/HUD.jsx` (modified):**
- Wallet button added (top-right, after stats bar): shows chain logo + short address when connected, "🔗 Connect" when not
- Green tint on connected state; owned tile count badge
- Stats bar `maxWidth` reduced to accommodate wallet button

**`src/App.jsx` (modified):**
- `tryReconnect()` called on boot (before `loadBlocksFromServer`)
- `<WalletModal />` rendered unconditionally (handles its own open/closed state)

### #31 — NFT minting wired into purchase flow (2026-05-08)

**`src/store/gameStore.js` (modified):**
- `_finalizeBlock()` — after DB write, non-blockingly attempts `_mintNFTAfterPurchase()`
- If wallet connected + contract deployed: calls `bc.mintTile({ tx, ty, country, toAddress, valueWei: 0n })`
- On success: `walletStore.recordTx()`, `walletStore.markTileOwned()`, `api.recordNFTMint()`
- Failure is non-fatal — block is owned in DB regardless; user can re-mint later

**`server/main.py` (modified):**
- New `nft_mints` table: `tile_key, wallet, tx_hash, chain, minted_at`
- `POST /nft/mint` — records NFT mint
- `GET /nft/{tile_key}` — returns mint info for a tile

**`src/lib/api.js` (modified):**
- Added `recordNFTMint(tileKey, wallet, txHash, chain)`, `fetchNFTInfo(tileKey)`

### #32 — On-chain marketplace (2026-05-08)

**`src/components/MarketplaceModal.jsx` (new):**
- Floating trigger button (bottom-right, 🏪 Market, listing count badge)
- `ListingCard` — shows tile key, price in MATIC/ETH, buy or unlist based on ownership
- `ListForm` — price input, 2.5% fee preview
- `BuyConfirm` — requires wallet, calls `bc.buyTile()` on-chain
- Stats grid: active listings, total value, avg price

**`src/store/marketStore.js` (new Zustand store):**
- `listings[]`, `stats`, `listModal`, `buyModal` state
- `loadListings(force)`, `listTile()`, `removeListing()`, `openListModal()`, `openBuyModal()`
- Calls `analytics.marketplacelist()` / `analytics.marketplaceBuy()`

**`server/main.py` (modified):**
- New `marketplace` table: `tile_key, seller_wallet, price_wei, listed_at, chain`
- `GET /marketplace` — active listings
- `POST /marketplace` — create listing
- `DELETE /marketplace/{tile_key}` — remove listing
- `GET /marketplace/stats` — aggregate stats

**`src/lib/api.js` (modified):**
- Added `fetchMarketListings()`, `fetchMarketStats()`, `createMarketListing()`, `removeMarketListing()`

### #33 — $CLND token + staking (2026-05-08)

**Pre-TGE design:** 100M supply, 100 $CLND per tile owned, off-chain ledger in DB until TGE.

**`src/store/tokenStore.js` (new Zustand store):**
- Constants: `TOKEN_SYMBOL='CLND'`, `TOKEN_SUPPLY=100_000_000`, `TOKEN_PER_TILE=100`, `GUARDIAN_YIELD_RATE=0.05`
- State: `balance`, `tilesOwned`, `stakeAmount`, `pendingYield`, `apyEstimate`, `tokenModal`
- `loadStaking(wallet)` → `GET /token/staking/{wallet}`

**`src/components/TokenPanel.jsx` (new):**
- $CLND balance display (large monospace, purple accent)
- PRE-TGE badge
- Stats: pending yield, APY (12–18%), voting power, tier (Whale/Holder/Starter based on tiles owned)
- How to earn: tiles, guardian, marketplace fees, governance rewards
- Pre-TGE notice + DAO link

**`server/main.py` (modified):**
- `GET /token/staking/{wallet}` — returns `tiles_owned`, `stake_clnd` (tiles × 100), `pending_yield` (guardian_budget × 0.05), `apy_estimate`, pre-TGE note

**`src/lib/api.js` (modified):**
- Added `fetchStaking(wallet)`

### #34 — DAO governance (2026-05-08)

**Off-chain voting pre-TGE, Snapshot-compatible post-TGE.**

**`src/components/DAOModal.jsx` (new):**
- `ProposalCard` — title, body, vote progress bar (For/Against %), vote buttons, time left
- `CreateProposalForm` — title, body, duration (3/7/14 days)
- Voting power explanation (tiles pre-TGE → $CLND post-TGE)
- Requires wallet to vote or propose

**`src/store/daoStore.js` (new Zustand store):**
- `proposals[]`, `daoModal` state
- `loadProposals(force)`, `vote(proposalId, voter, vote)`, `createProposal(data)`
- Calls `analytics.daoVote()` on vote

**`server/main.py` (modified):**
- New `dao_proposals` table: `id, title, body, proposer, created_at, ends_at, status`
- New `dao_votes` table: `proposal_id, voter, vote, power, cast_at`
- `GET /dao/proposals` — active + past proposals
- `POST /dao/proposals` — create proposal
- `POST /dao/proposals/{id}/vote` — cast vote (idempotent per wallet)
- `GET /dao/proposals/{id}/votes` — vote breakdown

**`src/lib/api.js` (modified):**
- Added `fetchDAOProposals()`, `createDAOProposal()`, `castDAOVote()`, `fetchDAOVotes()`

### #35 — PWA (Progressive Web App) (2026-05-08)

**`public/manifest.json` (new):**
- `name: "CryptoLand — Own the World On-Chain"`, `short_name: "CryptoLand"`
- Icons: 72/96/128/144/152/192/384/512px
- `display: standalone`, `theme_color: #08080c`, `background_color: #08080c`
- App shortcuts: Map, Marketplace, Portfolio
- Screenshots array (for Play Store / App Store listings)

**`public/sw.js` (new):**
- Static cache (app shell: `/`, `/index.html`, `/favicon.svg`, `/icons.svg`)
- Map tiles cache (7-day TTL, cache-first): OpenStreetMap hosts
- API routes network-only: `/blocks`, `/stats`, `/np/*`, `/guardian`, `/marketplace`, `/dao`, `/analytics`, `/nft`, `/token`, `/price-events`
- App shell: stale-while-revalidate
- Push notification handling with vibration `[200, 100, 200]`
- `notificationclick` → `clients.openWindow(url)`

**`index.html` (modified):**
- Added `<link rel="manifest">`, `<link rel="apple-touch-icon">`, SW registration script
- `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title`

### #36 — Analytics event pipeline (2026-05-08)

**`src/lib/analytics.js` (new):**
- Session ID via `sessionStorage` (`cl-session`)
- Event queue + offline flush (`window.addEventListener('online', flush)`)
- Batch `POST /analytics/event` with queue drain
- Auto-fires `pageView()` on module load
- Wrappers: `pageView`, `tileClick`, `purchaseOpen`, `paymentStart`, `paymentConfirmed`, `walletConnect`, `walletDisconnect`, `nftMint`, `marketplacelist`, `marketplaceBuy`, `daoVote`, `guardianDeploy`, `raidLaunch`

**`server/main.py` (modified):**
- New `analytics_events` table: `session_id, event_type, payload_json, created_at`
- `POST /analytics/event` — batch insert (max 50 events per call)
- `GET /analytics/summary` — event counts by type (last 24h)

**`src/lib/api.js` (modified):**
- Added `trackEvents(events[])` batch call

**`vite.config.js` (modified):**
- Added dev proxies: `/nft`, `/marketplace`, `/analytics`, `/dao`, `/token`

**`src/App.jsx` (modified):**
- `handleBlockClick` now calls `analytics.tileClick(info.key, info.country)`
- `<DAOModal />` / `<TokenPanel />` conditionally rendered from store state

---

### #37 — Backend security hardening (2026-07-21)

Fixes for confirmed critical vulnerabilities. All changes in `server/main.py` plus `server/requirements.txt`.

**Wallet auth now requires signature proof (SIWE):**
- New table `wallet_nonces(wallet, nonce, created_at)`.
- New endpoint `POST /auth/wallet/nonce {wallet}` → `{nonce, message}`. Message format: `CryptoLand wants you to sign in with wallet {wallet}. Nonce: {nonce}`.
- `POST /auth/link-wallet-upsert` now accepts `{wallet, signature, nonce}` and verifies the signature recovers to `wallet` (eth-account `Account.recover_message`). Nonce is consumed on use.
- `POST /sessions/bind-wallet` now also accepts `{signature, nonce}` and verifies ownership before binding/creating the wallet account.
- Env flag `ALLOW_UNSIGNED_WALLET_AUTH` (default off) bypasses verification for dev/test. If eth-account is missing and the flag is off, these endpoints return **501**.

**Payment integrity:**
- `payments` gained `consumed_at` (single-use) and `price_usd` (server-stored expected amount) columns.
- `POST /np/finalize` binds to the stored payment: unknown id → 400, tile mismatch → 409, already consumed → 409, invoiced amount < 95% of expected → 402. Block is written at the server-stored price; payment marked consumed in the same EXCLUSIVE transaction.
- `POST /np/ipn` now **fails closed** — when `NP_IPN_SECRET` is set, missing or invalid signature → 401, body never parsed. Auto-finalize applies the same amount binding + single-use consumption.

**Authorization on mutations (now require Bearer auth + DB-owner check):**
- `POST /blocks` — owner derived from authed user; client `owner` ignored.
- `PATCH /blocks/{tile_key}` — only the tile's DB owner may edit.
- `POST /guardian` / `DELETE /guardian/{tile_key}` — verified against the tile's DB owner (client `owner` param removed).
- `POST /marketplace/list` / `DELETE /marketplace/{tile_key}` — seller must be the authed user and the tile's DB owner.
- `POST /dao/vote` — voter = authed user; weight computed server-side as tiles owned (min 1); client `voter`/`weight` ignored.
- `POST /auth/guest-claim` — caller must be authed as the exact guest account and it must still be `is_guest=1`.

**PII / data exposure:**
- `GET /account/{wallet}`, `GET /affiliate/stats/{wallet}`, `GET /affiliate/code/{wallet}` now require auth and wallet match (403 otherwise). `/me` variants remain the token path.
- `GET /blocks` gained `limit` (default 5000, hard cap 20000) and `offset` pagination.

**Money math:** commission and redeem arithmetic now done in integer cents (`_to_cents`/`_from_cents`) to prevent float drift.

**Other:** `POST /affiliate/redeem` requires auth and applies only to the caller's own wallet; server binds to `HOST` env (default `127.0.0.1`, was `0.0.0.0`); rate limits added to nonce/upsert/bind/guest-claim/redeem. `requirements.txt` pinned with version bounds + `eth-account>=0.11,<0.14`.

---

## Updated Architecture Summary

```
Browser
  React 19 + Zustand
  MapLibre GL 5 (OSM tiles)
  Vite 8 + Tailwind CSS 4
  PWA (manifest + service worker)
  EIP-1193 wallet (MetaMask / Coinbase / Rabby / Phantom)
       │
       │ HTTP (proxied via Vite in dev, relative in prod)
       ▼
  FastAPI (Python)
  uvicorn ASGI
  aiosqlite → SQLite
  Background: price_events worker (10-min refresh)
       │
       │ HTTPS
       ├──→ NOWPayments API (crypto payments, IPN webhook)
       ├──→ CoinGecko API (BTC/ETH prices, trending coins, global stats)
       ├──→ Open-Meteo API (weather by country capital)
       ├──→ World Bank API (GDP by country)
       └──→ Wikipedia Pageviews API (trending article views)

Blockchain (chain-agnostic adapter)
  ACTIVE_CHAIN set via VITE_CHAIN env var
  EVM: Polygon / Polygon Amoy / Avalanche / Base / Ethereum
  Solana: Phantom / Solflare / Backpack
  CryptoLandTile.sol (ERC-721, no OpenZeppelin)
```

## Updated File Map

```
src/
├── main.jsx
├── App.jsx               + WalletModal, MarketplaceModal, DAOModal, TokenPanel
├── index.css
├── components/
│   ├── Map.jsx
│   ├── HUD.jsx           + wallet button (address / Connect)
│   ├── PurchasePanel.jsx
│   ├── PaymentModal.jsx
│   ├── HoverTooltip.jsx
│   ├── Sidebar.jsx
│   ├── SearchBar.jsx
│   ├── LiveFeed.jsx
│   ├── PurchaseToast.jsx
│   ├── CustomizeModal.jsx
│   ├── GuardianModal.jsx
│   ├── RaidModal.jsx
│   ├── MarketSidebar.jsx ← Bloomberg terminal redesign
│   ├── WalletModal.jsx   ← new: wallet connect / portfolio / tx history
│   ├── MarketplaceModal.jsx ← new: on-chain P2P marketplace
│   ├── DAOModal.jsx      ← new: governance proposals + voting
│   └── TokenPanel.jsx    ← new: $CLND balance / staking / yield
├── store/
│   ├── gameStore.js      + NFT mint after purchase
│   ├── guardianStore.js
│   ├── priceStore.js     + coingecko_trending source
│   ├── walletStore.js    ← new: EIP-1193 wallet state
│   ├── marketStore.js    ← new: marketplace listings
│   ├── daoStore.js       ← new: DAO proposals + votes
│   └── tokenStore.js     ← new: $CLND pre-TGE ledger
└── lib/
    ├── api.js            + 12 new endpoint methods
    ├── analytics.js      ← new: event pipeline
    ├── blockchain/
    │   ├── config.js     ← new: chain registry (9 chains)
    │   ├── index.js      ← new: active adapter re-export
    │   ├── adapters/
    │   │   ├── evm.js    ← new: EVM raw JSON-RPC adapter
    │   │   └── solana.js ← new: Solana adapter
    │   └── contracts/
    │       └── abi.json  ← new: universal CryptoLandTile ABI
    ├── nowpayments.js
    ├── tiles.js
    └── hooks.js

contracts/
├── CryptoLandTile.sol    ← new: ERC-721 (no OpenZeppelin)
├── hardhat.config.js     ← new: 8-chain Hardhat config
├── deploy.js
├── scripts/deploy.js     ← new: Hardhat deploy + .env writer
└── test/
    └── CryptoLandTile.test.js ← new: 15+ test cases

server/
├── main.py               + 5 new tables, 20+ new endpoints
├── guardian.py
├── price_events.py       + CoinGecko global/trending, User-Agent, 10-min refresh
├── seed.py
└── seed_guardians.py

public/
├── manifest.json         ← new: PWA manifest
├── sw.js                 ← new: service worker
└── favicon.svg

documentation/
├── README.md
├── architecture.md
├── backend.md
├── blockchain.md         ← new: chain registry, adapter pattern, contract, deployment
├── frontend.md
├── game-mechanics.md
├── guardian.md
├── map-overlay.md
├── review.md             ← this file
└── styling.md
```
