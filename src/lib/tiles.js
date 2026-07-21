// ─── Slippy Map tile math (Web Mercator / EPSG:3857) ─────────────────────────
//
// PURCHASE_ZOOM = 14
// Grid: 16384 × 16384 = 268,435,456 purchasable tiles worldwide
// Each tile ≈ 2.4 km × 2.4 km at equator (smaller toward poles)
// Example: Warsaw (517 km²) spans ~90 tiles at this zoom
//
// Tile coordinate system:
//   x: 0 (left = 180°W) → 16383 (right = 180°E)
//   y: 0 (top = ~85.05°N) → 16383 (bottom = ~85.05°S)
//
// A tile key is the canonical string "tx:ty", always at PURCHASE_ZOOM.

export const PURCHASE_ZOOM = 14
export const GRID_N = Math.pow(2, PURCHASE_ZOOM)   // 16384
export const TOTAL_TILES = GRID_N * GRID_N          // 268,435,456
export const KM_PER_TILE = Math.round(40075 / GRID_N * 10) / 10 // ~2.4 km at equator

// lng/lat → tile {x, y} at given zoom (clamped)
export function lngLatToTile(lng, lat, z) {
  const n = Math.pow(2, z)
  const x = Math.floor((lng + 180) / 360 * n)
  const latRad = lat * Math.PI / 180
  const sinLat = Math.sin(latRad)
  // Guard against poles
  const clampedSin = Math.max(-0.9999, Math.min(0.9999, sinLat))
  const y = Math.floor((0.5 - Math.log((1 + clampedSin) / (1 - clampedSin)) / (4 * Math.PI)) * n)
  return {
    x: Math.max(0, Math.min(n - 1, x)),
    y: Math.max(0, Math.min(n - 1, y)),
  }
}

// tile {x,y,z} → NW corner lng/lat
export function tileNW(tx, ty, z) {
  const n = Math.pow(2, z)
  const lng = tx / n * 360 - 180
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * ty / n)))
  return { lng, lat: latRad * 180 / Math.PI }
}

// tile → exact GeoJSON Polygon (NW→NE→SE→SW→NW)
export function tilePoly(tx, ty, z) {
  const nw = tileNW(tx,     ty,     z)
  const ne = tileNW(tx + 1, ty,     z)
  const se = tileNW(tx + 1, ty + 1, z)
  const sw = tileNW(tx,     ty + 1, z)
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [nw.lng, nw.lat],
        [ne.lng, ne.lat],
        [se.lng, se.lat],
        [sw.lng, sw.lat],
        [nw.lng, nw.lat],
      ]],
    },
    properties: {},
  }
}

// tile center as [lng, lat] — average in Mercator y-space for accuracy
export function tileCenter(tx, ty, z = PURCHASE_ZOOM) {
  const n = Math.pow(2, z)
  // Average tile index then convert — gives true Mercator center
  const cx = tx + 0.5
  const cy = ty + 0.5
  const lng = cx / n * 360 - 180
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * cy / n)))
  return [lng, latRad * 180 / Math.PI]
}

export function tileKey(tx, ty) { return `${tx}:${ty}` }
export function parseKey(key) {
  const [x, y] = key.split(':').map(Number)
  return { tx: x, ty: y }
}

// Minimum tile price — must stay above USDT-TRC20 minimum (~$11.11).
export const MIN_TILE_PRICE_USD = 12.00

// ─── Geo-economic region pricing ─────────────────────────────────────────────
//
// Regions are defined as [lng_min, lng_max, lat_min, lat_max, base, spread]
// base   = floor price for the region in USD
// spread = random range added on top (deterministic per tile)
//
// Price research basis (real-estate $/m² proxies, GDP/capita, crypto adoption):
//   Tier 1 — $45–75:  US West Coast, Western Europe cores, Singapore, Japan
//   Tier 2 — $35–55:  US East/Midwest, Eastern Europe, UAE, Australia, S.Korea
//   Tier 3 — $25–40:  Eastern Europe, Turkey, Brazil metros, China coast, Gulf
//   Tier 4 — $18–30:  Russia, Central Asia, South/SE Asia, Mexico, N.Africa
//   Tier 5 — $12–20:  Sub-Saharan Africa, Central America, inland Asia, Oceania
//
// Regions are checked in order; first match wins.

const GEO_REGIONS = [
  // ── Tier 1 — Premium (~$45–75) ───────────────────────────────────────────
  // US West Coast (California, Pacific NW)
  { lngMin: -125, lngMax: -114, latMin:  32, latMax:  50, base: 48, spread: 28 },
  // US Northeast corridor (NYC, Boston, DC)
  { lngMin:  -80, lngMax:  -68, latMin:  38, latMax:  46, base: 50, spread: 26 },
  // UK & Ireland
  { lngMin:  -11, lngMax:    3, latMin:  49, latMax:  61, base: 46, spread: 24 },
  // Benelux + Switzerland
  { lngMin:    3, lngMax:   11, latMin:  46, latMax:  54, base: 48, spread: 22 },
  // Germany + Austria
  { lngMin:    6, lngMax:   18, latMin:  47, latMax:  55, base: 44, spread: 22 },
  // Nordics (Norway, Sweden, Denmark, Finland)
  { lngMin:    4, lngMax:   32, latMin:  55, latMax:  72, base: 44, spread: 20 },
  // France
  { lngMin:   -5, lngMax:    8, latMin:  43, latMax:  51, base: 42, spread: 22 },
  // Singapore city-state
  { lngMin:  103, lngMax:  105, latMin:   1, latMax:   2, base: 52, spread: 20 },
  // Japan (Honshu core)
  { lngMin:  130, lngMax:  142, latMin:  33, latMax:  37, base: 44, spread: 22 },
  // Tokyo metro
  { lngMin:  138, lngMax:  141, latMin:  35, latMax:  36, base: 56, spread: 18 },

  // ── Tier 2 — Strong (~$32–55) ────────────────────────────────────────────
  // US Midwest & South (Chicago, Texas metros)
  { lngMin: -105, lngMax:  -75, latMin:  29, latMax:  48, base: 36, spread: 20 },
  // Canada (major metros)
  { lngMin: -100, lngMax:  -70, latMin:  43, latMax:  52, base: 34, spread: 18 },
  // Spain & Portugal
  { lngMin:  -10, lngMax:    5, latMin:  36, latMax:  44, base: 32, spread: 18 },
  // Italy
  { lngMin:    7, lngMax:   19, latMin:  37, latMax:  47, base: 32, spread: 18 },
  // Poland, Czech Republic, Hungary
  { lngMin:   14, lngMax:   24, latMin:  47, latMax:  55, base: 30, spread: 16 },
  // UAE (Dubai, Abu Dhabi)
  { lngMin:   51, lngMax:   57, latMin:  22, latMax:  26, base: 42, spread: 22 },
  // Australia (east coast)
  { lngMin:  144, lngMax:  154, latMin: -38, latMax: -27, base: 38, spread: 20 },
  // South Korea
  { lngMin:  126, lngMax:  130, latMin:  35, latMax:  38, base: 38, spread: 18 },
  // Israel
  { lngMin:   34, lngMax:   36, latMin:  29, latMax:  34, base: 34, spread: 16 },

  // ── Tier 3 — Moderate (~$22–38) ──────────────────────────────────────────
  // Russia (Moscow + St. Petersburg region)
  { lngMin:   35, lngMax:   44, latMin:  55, latMax:  61, base: 26, spread: 14 },
  // Turkey (Istanbul + Ankara)
  { lngMin:   26, lngMax:   36, latMin:  37, latMax:  42, base: 24, spread: 14 },
  // China coast (Shanghai, Beijing, Shenzhen)
  { lngMin:  113, lngMax:  122, latMin:  22, latMax:  41, base: 28, spread: 16 },
  // Gulf states (Saudi Arabia, Qatar, Kuwait)
  { lngMin:   43, lngMax:   58, latMin:  22, latMax:  32, base: 28, spread: 14 },
  // Brazil southeast (São Paulo, Rio)
  { lngMin:  -48, lngMax:  -40, latMin: -24, latMax: -18, base: 26, spread: 14 },
  // Romania, Bulgaria, Balkans
  { lngMin:   20, lngMax:   30, latMin:  42, latMax:  48, base: 22, spread: 12 },
  // Baltic states (Estonia, Latvia, Lithuania)
  { lngMin:   21, lngMax:   28, latMin:  54, latMax:  60, base: 26, spread: 12 },
  // Greece
  { lngMin:   20, lngMax:   27, latMin:  35, latMax:  42, base: 24, spread: 12 },
  // Mexico (Mexico City, Monterrey)
  { lngMin: -100, lngMax:  -96, latMin:  19, latMax:  26, base: 22, spread: 12 },
  // Argentina (Buenos Aires)
  { lngMin:  -60, lngMax:  -56, latMin: -35, latMax: -32, base: 22, spread: 10 },
  // Japan (secondary — Osaka, other)
  { lngMin:  130, lngMax:  142, latMin:  31, latMax:  45, base: 36, spread: 16 },

  // ── Tier 4 — Developing (~$14–24) ────────────────────────────────────────
  // Russia (rest)
  { lngMin:   27, lngMax:  180, latMin:  50, latMax:  75, base: 16, spread: 10 },
  // Ukraine, Belarus
  { lngMin:   22, lngMax:   40, latMin:  46, latMax:  53, base: 18, spread: 10 },
  // India (major metros)
  { lngMin:   72, lngMax:   88, latMin:  18, latMax:  29, base: 20, spread: 12 },
  // China (interior)
  { lngMin:   98, lngMax:  113, latMin:  22, latMax:  42, base: 18, spread: 10 },
  // Southeast Asia (Thailand, Vietnam, Malaysia)
  { lngMin:   98, lngMax:  109, latMin:   5, latMax:  21, base: 18, spread: 10 },
  // Indonesia (Java)
  { lngMin:  106, lngMax:  115, latMin:  -9, latMax:  -5, base: 16, spread:  8 },
  // Egypt / North Africa
  { lngMin:   25, lngMax:   37, latMin:  22, latMax:  32, base: 18, spread: 10 },
  // South Africa (Johannesburg, Cape Town)
  { lngMin:   18, lngMax:   32, latMin: -35, latMax: -25, base: 20, spread: 10 },
  // Colombia, Peru, Chile
  { lngMin:  -78, lngMax:  -65, latMin: -56, latMax:   8, base: 18, spread:  8 },
  // Morocco, Algeria, Tunisia
  { lngMin:  -10, lngMax:   15, latMin:  28, latMax:  38, base: 16, spread:  8 },
  // Kazakhstan, Central Asia
  { lngMin:   50, lngMax:   90, latMin:  36, latMax:  56, base: 14, spread:  8 },
  // Pakistan
  { lngMin:   60, lngMax:   78, latMin:  23, latMax:  37, base: 14, spread:  8 },
  // Bangladesh
  { lngMin:   88, lngMax:   93, latMin:  20, latMax:  27, base: 14, spread:  6 },
  // Philippines
  { lngMin:  117, lngMax:  127, latMin:   5, latMax:  20, base: 16, spread:  8 },

  // ── Tier 5 — Frontier (~$12–18) ──────────────────────────────────────────
  // Sub-Saharan Africa
  { lngMin:  -18, lngMax:   52, latMin: -35, latMax:  16, base: 12, spread:  6 },
  // Central America & Caribbean
  { lngMin:  -90, lngMax:  -60, latMin:   8, latMax:  24, base: 12, spread:  6 },
  // Rest of South America
  { lngMin:  -82, lngMax:  -35, latMin: -60, latMax:  12, base: 12, spread:  6 },
  // Myanmar, Laos, Cambodia
  { lngMin:   92, lngMax:  107, latMin:   9, latMax:  29, base: 12, spread:  6 },
  // Oceania / Pacific islands
  { lngMin:  130, lngMax:  180, latMin: -50, latMax:  20, base: 12, spread:  6 },
  // Mongolia, inland East Asia
  { lngMin:   88, lngMax:  125, latMin:  42, latMax:  55, base: 12, spread:  6 },
  // Greenland, Arctic
  { lngMin: -180, lngMax:  180, latMin:  72, latMax:  90, base: 12, spread:  4 },
  // Antarctica
  { lngMin: -180, lngMax:  180, latMin: -90, latMax: -60, base: 12, spread:  4 },
]

// Returns the geo-economic region record for a lat/lng, or null for default.
export function geoRegion(lng, lat) {
  for (const r of GEO_REGIONS) {
    if (lng >= r.lngMin && lng < r.lngMax && lat >= r.latMin && lat < r.latMax) {
      return r
    }
  }
  return { base: 12, spread: 6 }  // ocean / unclassified
}

// Deterministic price for an unowned tile — geo-aware, stable across renders.
// Final price = region.base + (hash * region.spread)
// Always ≥ MIN_TILE_PRICE_USD so USDT-TRC20 (~$11.11 min) always clears.
export function tileBasePrice(tx, ty) {
  const { lng, lat } = tileNW(tx, ty, PURCHASE_ZOOM)
  const region = geoRegion(lng, lat)
  const hash   = ((tx * 1619 + ty * 2971) >>> 0) % 1000 / 1000
  const price  = region.base + hash * region.spread
  return parseFloat(Math.max(MIN_TILE_PRICE_USD, price).toFixed(2))
}

export function emptyFC() { return { type: 'FeatureCollection', features: [] } }
