import { useEffect, useRef, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import { useGameStore } from '../store/gameStore'
import { useGuardianStore } from '../store/guardianStore'
import {
  PURCHASE_ZOOM, lngLatToTile, tilePoly, tileNW, tileCenter, tileKey, tileBasePrice, emptyFC,
} from '../lib/tiles'
import { tinyAddr } from '../lib/addr'
import { ACCENT_UI_HEX, mixWhite } from '../lib/chainProfile'

// ── City-lights palette (low-zoom bloom) ──────────────────────────────────────
// Hue from the chain accent, luminance from the mix toward white — so the glow
// is chain-native on all 29 builds while still reading as light. Kept as ONE
// palette rather than per-tile colours: random per-tile hues turned dense
// clusters into multicoloured static instead of light.
//
// These were fixed greens, which meant the map — the actual product — looked
// identical on every build: a purple Starknet intro handing over to a green
// world. On the default accent the mix reproduces almost exactly the previous
// palette, so the look that was signed off does not regress.
const LIGHT_WARM = mixWhite(0.35)   // outer atmosphere — soft, faint, sells the bloom
const LIGHT_CORE = mixWhite(0.68)   // body of the glow
const LIGHT_HOT  = mixWhite(0.93)   // filament — near-white so each light has a centre

// Interaction affordances (hover, selection, country highlight). The UI variant,
// not the raw accent: these are read against the near-black map, where Cardano's
// and Radix's brand navy is all but invisible.
const ACCENT_MAP = ACCENT_UI_HEX

// ── Map style definitions ─────────────────────────────────────────────────────

const MAP_STYLES = {
  dark: {
    label: 'Dark',
    icon: '🌑',
    sourceDef: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
    },
    paint: {
      'raster-opacity': 0.6,
      'raster-saturation': -1,
      'raster-brightness-min': 0.0,
      'raster-brightness-max': 0.18,
      'raster-contrast': 0.0,
    },
  },
  satellite: {
    label: 'Satellite',
    icon: '🛰',
    sourceDef: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Tiles © Esri',
    },
    // Same dark treatment as OSM — desaturated, brightness crushed to match UI theme
    paint: {
      'raster-opacity': 0.65,
      'raster-saturation': -0.8,
      'raster-brightness-min': 0.0,
      'raster-brightness-max': 0.22,
      'raster-contrast': 0.1,
    },
  },
  hybrid: {
    label: 'Hybrid',
    icon: '🗺',
    sourceDef: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Tiles © Esri',
    },
    // Slightly brighter than satellite so terrain features are still readable
    paint: {
      'raster-opacity': 0.72,
      'raster-saturation': -0.5,
      'raster-brightness-min': 0.0,
      'raster-brightness-max': 0.38,
      'raster-contrast': 0.05,
    },
  },
}

function buildStyle(styleKey) {
  const s = MAP_STYLES[styleKey]
  return {
    version: 8,
    sources: { base: s.sourceDef },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#0f0f0f' } },
      { id: 'base-raster', type: 'raster', source: 'base', paint: s.paint },
    ],
  }
}

function recencyOpacity(purchasedAt) {
  if (!purchasedAt) return 0
  const ageMs = Date.now() - purchasedAt
  if (ageMs < 60_000)         return 1.0   // < 1 min
  if (ageMs < 300_000)        return 0.85  // < 5 min
  if (ageMs < 3_600_000)      return 0.55  // < 1 hr
  if (ageMs < 86_400_000)     return 0.28  // < 1 day
  if (ageMs < 604_800_000)    return 0.12  // < 1 week
  return 0.04
}

function blocksToFC(blocksMap) {
  const features = []
  for (const b of blocksMap.values()) {
    const f = tilePoly(b.tx, b.ty, PURCHASE_ZOOM)
    f.properties = {
      key: b.key, color: b.color, owner: b.owner, country: b.country, price: b.price,
      recency: recencyOpacity(b.purchasedAt),
    }
    features.push(f)
  }
  return { type: 'FeatureCollection', features }
}

/**
 * One point per owned tile — the source behind the low-zoom "city lights" look.
 *
 * At world/country zoom a tile is sub-pixel, so drawing each one as its own
 * coloured polygon turned a dense cluster into multicoloured static. Points +
 * blurred circles let clusters additively bloom into a single glow instead,
 * which is what actual city lights look like from orbit.
 */
function blocksToPoints(blocksMap) {
  const features = []
  for (const b of blocksMap.values()) {
    const [lng, lat] = tileCenter(b.tx, b.ty)
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: { key: b.key, recency: recencyOpacity(b.purchasedAt) },
    })
  }
  return { type: 'FeatureCollection', features }
}

/**
 * Frame the opening shot on where the world is actually owned — once.
 *
 * The map used to open hardcoded at `center [20,40] / zoom 4`, which is Europe,
 * Türkiye and the Levant and nothing else. The seeded worlds span 58 countries,
 * and the leaderboard sitting on the same screen headlines "United States: 1,075
 * tiles — 1st" — a country that was off-screen. For a game whose pitch is "own
 * the world", the first frame was arguing the opposite.
 *
 * Percentile bounds rather than min/max: a single tile in New Zealand or Alaska
 * would otherwise zoom the camera all the way out to fit one dot. The 2nd–98th
 * percentile frames the body of the distribution and lets the rare outlier fall
 * outside the initial view.
 */
function fitToWorldOnce(map, blocksMap) {
  if (map.__didFitWorld || !blocksMap?.size) return
  map.__didFitWorld = true

  const lngs = [], lats = []
  for (const b of blocksMap.values()) {
    const [lng, lat] = tileCenter(b.tx, b.ty)
    lngs.push(lng); lats.push(lat)
  }
  lngs.sort((a, z) => a - z); lats.sort((a, z) => a - z)
  const at = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))]
  const west = at(lngs, 0.02), east = at(lngs, 0.98)
  const south = at(lats, 0.02), north = at(lats, 0.98)
  if (!(east > west) || !(north > south)) return

  // The market sidebar is an opaque overlay pinned to the left edge, so the
  // usable canvas starts at --market-w, not at 0. Padding only for the chrome
  // put the fitted bounds under the sidebar: the frame was technically correct
  // and the Americas were still invisible behind the signal feed.
  let leftPad = 40
  try {
    const w = parseFloat(getComputedStyle(document.documentElement)
      .getPropertyValue('--market-w'))
    if (Number.isFinite(w) && w > 0) leftPad = w + 40
  } catch { /* no computed style (SSR/tests) — the 40px default is fine */ }

  map.fitBounds([[west, south], [east, north]], {
    padding: { top: 80, bottom: 90, left: leftPad, right: 40 },
    duration: 0,
    maxZoom: 4.5,   // never open closer than the old default
  })
}

// Blocks purchased in last hour — reserved for future pulse/notification use
function recentBlocksPoints(blocksMap) {
  const cutoff = Date.now() - 3_600_000
  const features = []
  for (const b of blocksMap.values()) {
    if (!b.purchasedAt || b.purchasedAt < cutoff) continue
    const [lng, lat] = tileCenter(b.tx, b.ty)
    const ageFraction = Math.max(0, 1 - (Date.now() - b.purchasedAt) / 3_600_000)
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: { key: b.key, color: b.color, ageFraction },
    })
  }
  return { type: 'FeatureCollection', features }
}

function highlightFC(tx, ty) {
  const f = tilePoly(tx, ty, PURCHASE_ZOOM)
  return { type: 'FeatureCollection', features: [f] }
}

function viewportGridFC(map) {
  const zoom = map.getZoom()
  if (zoom < 3) return emptyFC()

  const bounds = map.getBounds()
  const { x: x0, y: y0 } = lngLatToTile(bounds.getWest(),  bounds.getNorth(), PURCHASE_ZOOM)
  const { x: x1, y: y1 } = lngLatToTile(bounds.getEast(),  bounds.getSouth(), PURCHASE_ZOOM)

  const cols = x1 - x0 + 1
  const rows = y1 - y0 + 1
  if (cols * rows > 10000) return emptyFC()

  const features = []
  for (let tx = x0; tx <= x1; tx++) {
    for (let ty = y0; ty <= y1; ty++) {
      features.push(tilePoly(tx, ty, PURCHASE_ZOOM))
    }
  }
  return { type: 'FeatureCollection', features }
}


const FLAG_MAP = {
  'France':'🇫🇷','Germany':'🇩🇪','United Kingdom':'🇬🇧','USA':'🇺🇸','United States':'🇺🇸',
  'Spain':'🇪🇸','Italy':'🇮🇹','Poland':'🇵🇱','Netherlands':'🇳🇱','Belgium':'🇧🇪',
  'Switzerland':'🇨🇭','Austria':'🇦🇹','Czech Republic':'🇨🇿','Hungary':'🇭🇺',
  'Portugal':'🇵🇹','Sweden':'🇸🇪','Norway':'🇳🇴','Denmark':'🇩🇰','Finland':'🇫🇮',
  'Romania':'🇷🇴','Ukraine':'🇺🇦','Russia':'🇷🇺','Turkey':'🇹🇷','Greece':'🇬🇷',
  'Japan':'🇯🇵','China':'🇨🇳','South Korea':'🇰🇷','India':'🇮🇳','Australia':'🇦🇺',
  'Brazil':'🇧🇷','Canada':'🇨🇦','Mexico':'🇲🇽','Argentina':'🇦🇷','Colombia':'🇨🇴',
  'Egypt':'🇪🇬','South Africa':'🇿🇦','Nigeria':'🇳🇬','Kenya':'🇰🇪',
  'Saudi Arabia':'🇸🇦','UAE':'🇦🇪','Israel':'🇮🇱','Iran':'🇮🇷',
  'Thailand':'🇹🇭','Vietnam':'🇻🇳','Indonesia':'🇮🇩','Philippines':'🇵🇭','Malaysia':'🇲🇾',
  'Singapore':'🇸🇬','New Zealand':'🇳🇿','Pakistan':'🇵🇰','Bangladesh':'🇧🇩',
  'Slovakia':'🇸🇰','Croatia':'🇭🇷','Serbia':'🇷🇸','Bulgaria':'🇧🇬','Slovenia':'🇸🇮',
  'Lithuania':'🇱🇹','Latvia':'🇱🇻','Estonia':'🇪🇪','Belarus':'🇧🇾','Moldova':'🇲🇩',
  'Luxembourg':'🇱🇺','Ireland':'🇮🇪','Morocco':'🇲🇦','Algeria':'🇩🇿','Tunisia':'🇹🇳',
  'Iraq':'🇮🇶','Jordan':'🇯🇴','Lebanon':'🇱🇧','Kuwait':'🇰🇼','Qatar':'🇶🇦',
  'Chile':'🇨🇱','Peru':'🇵🇪','Venezuela':'🇻🇪','Ecuador':'🇪🇨','Bolivia':'🇧🇴',
  'Cuba':'🇨🇺','Guatemala':'🇬🇹','Kazakhstan':'🇰🇿','Uzbekistan':'🇺🇿',
  'Azerbaijan':'🇦🇿','Georgia':'🇬🇪','Armenia':'🇦🇲',
}

// Large pool of varied emojis — nature, space, urban, symbols, creatures
const EMOJI_POOL = [
  '🏔️','🌋','🏝️','🌊','🌿','🌵','🌴','🏜️','🗻','🌾',
  '🦁','🐺','🦊','🐉','🦅','🐋','🦈','🦋','🐺','🦎',
  '🚀','🛸','⭐','🌙','☄️','🪐','🌌','💫','🔭','🛰️',
  '🏰','🗼','⛩️','🕌','🏯','🗽','🎭','🏛️','⛪','🕍',
  '💎','👑','⚔️','🛡️','🔮','🧿','🗝️','🏆','⚡','🔱',
  '🌈','❄️','🔥','💧','🌪️','⚡','🌊','🌑','🌕','🌞',
  '🦺','🎯','🎲','♟️','🎰','🎸','🎺','🎻','🥁','🪗',
  '🧬','⚗️','🔬','💡','🧲','⚙️','🔩','🛠️','🔑','🗺️',
  '🍄','🌺','🌸','🌻','🌹','🪷','🌼','🪸','🎋','🎍',
  '🐉','🦄','🦖','🦕','🐊','🦏','🐘','🦒','🐆','🦓',
]

// Fast deterministic hash from tile key string
function tileHash(key, offset = 0) {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i) + offset
    h = (h * 16777619) >>> 0
  }
  return h
}

function blockEmoji(block) {
  // If we have a real country with a flag, use it
  if (block.country && block.country !== 'Uncharted Territory') {
    for (const [k, v] of Object.entries(FLAG_MAP)) {
      if (block.country.includes(k)) return v
    }
  }
  // Otherwise pick deterministically from the pool using tile key
  const h = tileHash(block.key, 7)
  return EMOJI_POOL[h % EMOJI_POOL.length]
}

// 64px sprite — head-only is all that fits, but a NEAR/ENS name stays readable.
const shortOwner = (owner) => tinyAddr(owner, 10) || '???'

// Background pattern styles — picked per tile
const BG_STYLES = ['solid', 'diagonal', 'dots', 'grid', 'radial', 'scanline']

function drawBlockSprite(block) {
  const S = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = S
  const ctx = canvas.getContext('2d')

  const h1 = tileHash(block.key, 1)
  const h2 = tileHash(block.key, 3)
  const bgStyle = BG_STYLES[h1 % BG_STYLES.length]
  const c = block.color

  // Base fill
  ctx.fillStyle = '#111'
  ctx.fillRect(0, 0, S, S)

  // Background pattern — each tile gets its own look
  if (bgStyle === 'diagonal') {
    ctx.strokeStyle = c + '28'
    ctx.lineWidth = 1
    for (let i = -S; i < S * 2; i += 6) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + S, S); ctx.stroke()
    }
  } else if (bgStyle === 'dots') {
    ctx.fillStyle = c + '30'
    const spacing = 8 + (h2 % 4) * 2
    for (let x = spacing / 2; x < S; x += spacing) {
      for (let y = spacing / 2; y < S; y += spacing) {
        ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill()
      }
    }
  } else if (bgStyle === 'grid') {
    ctx.strokeStyle = c + '22'
    ctx.lineWidth = 0.5
    const gs = 8 + (h2 % 3) * 4
    for (let i = 0; i <= S; i += gs) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, S); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(S, i); ctx.stroke()
    }
  } else if (bgStyle === 'radial') {
    const grad = ctx.createRadialGradient(S/2, S/2, 0, S/2, S/2, S * 0.7)
    grad.addColorStop(0, c + '40')
    grad.addColorStop(1, c + '06')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, S, S)
  } else if (bgStyle === 'scanline') {
    ctx.fillStyle = c + '18'
    for (let y = 0; y < S; y += 3) {
      ctx.fillRect(0, y, S, 1.5)
    }
  } else {
    // solid tint
    ctx.fillStyle = c + '1e'
    ctx.fillRect(0, 0, S, S)
  }

  // Corner accent marks (like UI corner brackets)
  const cs = 7
  ctx.strokeStyle = c
  ctx.lineWidth = 1.5
  ctx.lineCap = 'square'
  // top-left
  ctx.beginPath(); ctx.moveTo(2, 2 + cs); ctx.lineTo(2, 2); ctx.lineTo(2 + cs, 2); ctx.stroke()
  // top-right
  ctx.beginPath(); ctx.moveTo(S - 2 - cs, 2); ctx.lineTo(S - 2, 2); ctx.lineTo(S - 2, 2 + cs); ctx.stroke()
  // bottom-left
  ctx.beginPath(); ctx.moveTo(2, S - 2 - cs); ctx.lineTo(2, S - 2); ctx.lineTo(2 + cs, S - 2); ctx.stroke()
  // bottom-right
  ctx.beginPath(); ctx.moveTo(S - 2 - cs, S - 2); ctx.lineTo(S - 2, S - 2); ctx.lineTo(S - 2, S - 2 - cs); ctx.stroke()

  // Central emoji
  const emoji = blockEmoji(block)
  ctx.font = '24px serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(emoji, S / 2, S * 0.43)

  // Owner name — bottom strip with translucent bg
  const owner = shortOwner(block.owner)
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(0, S - 14, S, 14)
  ctx.font = 'bold 7px monospace'
  ctx.fillStyle = c
  ctx.textBaseline = 'bottom'
  ctx.textAlign = 'center'
  ctx.fillText(owner, S / 2, S - 2)

  return canvas
}

// PERSONALITY_COLORS maps personality → border color for shield badge
const PERSONALITY_COLORS = { aggressive: '#f87171', balanced: '#60a5fa', passive: '#4ade80' }

function makeMarkerEl(block, guardian) {
  const el = document.createElement('div')
  el.dataset.key = block.key
  Object.assign(el.style, {
    boxSizing: 'border-box',
    overflow: 'hidden',
    position: 'relative',
    pointerEvents: 'none',
    borderRadius: '2px',
    border: `1.5px solid ${block.color}`,
    background: `${block.color}18`,
    willChange: 'width, height',
  })

  if (block.imageUrl) {
    const img = document.createElement('img')
    img.src = block.imageUrl
    img.alt = ''
    Object.assign(img.style, {
      width: '100%', height: '100%',
      objectFit: 'cover', display: 'block',
      filter: 'saturate(0.8) brightness(0.85)',
    })
    img.onerror = () => { el.style.backgroundImage = `url(${drawBlockSprite(block).toDataURL()})`;
                          el.style.backgroundSize = 'cover'; img.remove() }
    el.appendChild(img)
    if (block.label) {
      const lbl = document.createElement('div')
      lbl.dataset.lbl = '1'
      lbl.textContent = block.label
      Object.assign(lbl.style, {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '2px 4px',
        background: 'linear-gradient(transparent,rgba(0,0,0,0.92))',
        fontSize: '8px', fontFamily: "'Space Mono',monospace",
        color: '#fff', whiteSpace: 'nowrap',
        overflow: 'hidden', textOverflow: 'ellipsis',
        lineHeight: '1.3',
      })
      el.appendChild(lbl)
    }
  } else {
    // Canvas sprite: emoji + owner name + pattern background
    const sprite = drawBlockSprite(block)
    Object.assign(el.style, {
      backgroundImage: `url(${sprite.toDataURL()})`,
      backgroundSize: 'cover',
      border: 'none',
    })
  }

  // Shield badge — shown on tiles with a deployed guardian
  if (guardian) {
    const shieldColor = PERSONALITY_COLORS[guardian.personality] ?? '#4ade80'
    const badge = document.createElement('div')
    badge.dataset.shield = '1'
    Object.assign(badge.style, {
      position: 'absolute', top: '2px', right: '2px',
      width: '30%', height: '30%',
      minWidth: '8px', minHeight: '8px',
      maxWidth: '16px', maxHeight: '16px',
      borderRadius: '2px',
      background: `${shieldColor}cc`,
      border: `1px solid ${shieldColor}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '8px', lineHeight: '1',
      zIndex: '2',
    })
    badge.textContent = '🛡'
    el.appendChild(badge)
  }

  return el
}


// ── Simulated viewer presence ─────────────────────────────────────────────────
// Generates stable pseudo-random viewer dots around areas with blocks.
// Fully client-side — no server needed. Dots drift slowly to feel alive.

function generatePresenceDots(blocksMap, count = 12) {
  const blockArray = [...blocksMap.values()]
  if (!blockArray.length) return []
  const dots = []
  const n = 2 ** PURCHASE_ZOOM
  for (let i = 0; i < count; i++) {
    const h = ((i * 2971 + 37) >>> 0)
    const b = blockArray[h % blockArray.length]
    // Tile center in lng/lat
    const tileFrac = ((h * 1619) >>> 0) % 100 / 100
    const lng = ((b.tx + 0.5 + tileFrac * 0.8 - 0.4) / n) * 360 - 180
    const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * (b.ty + 0.5) / n)))
    const lat = latRad * 180 / Math.PI + (((h * 3571) >>> 0) % 100) * 0.003 - 0.15
    dots.push({ id: i, lng, lat, color: b.color })
  }
  return dots
}

export default function GameMap({ onBlockClick, flyToRef }) {
  const containerRef  = useRef(null)
  const overlayRef    = useRef(null)   // custom overlay div — sits on top of canvas
  const mapRef        = useRef(null)
  const hoveredKeyRef = useRef(null)
  const selectedKeyRef = useRef(null)
  // key → { el, nwLng, nwLat, seLng, seLat, sig }
  const blocksDataRef   = useRef(new Map())
  const presenceDotsRef = useRef([])
  const presenceElsRef  = useRef(new Map())

  const store         = useGameStore
  const guardianStore = useGuardianStore

  const [mapStyle, setMapStyle] = useState('dark')

  const switchStyle = useCallback((key) => {
    const map = mapRef.current
    if (!map || key === mapStyle) return
    setMapStyle(key)
    const s = MAP_STYLES[key]
    if (!map.getSource('base')) return
    // Remove existing base layer + source
    map.removeLayer('base-raster')
    map.removeSource('base')
    // Re-add with new tiles, inserted before the first game layer so it renders
    // beneath all blocks, grid, hover, and selection layers
    map.addSource('base', s.sourceDef)
    map.addLayer(
      { id: 'base-raster', type: 'raster', source: 'base', paint: s.paint },
      'block-dots'   // "insert before block-dots" = below all game layers
    )
  }, [mapStyle])

  // Build/update the block element registry — no DOM positioning here
  function syncOverlayEls(blocks) {
    const overlay   = overlayRef.current
    if (!overlay) return
    const guardians = guardianStore.getState().guardians
    const seen = new Set()
    for (const block of blocks.values()) {
      seen.add(block.key)
      const guardian = guardians.get(block.key) ?? null
      const sig = `${block.imageUrl}|${block.color}|${block.owner}|${block.label}|${guardian?.personality ?? ''}`
      const existing = blocksDataRef.current.get(block.key)
      if (existing && existing.sig === sig) continue

      // Remove old element if sig changed
      existing?.el.remove()

      const nw = tileNW(block.tx,     block.ty,     PURCHASE_ZOOM)
      const se = tileNW(block.tx + 1, block.ty + 1, PURCHASE_ZOOM)
      const el = makeMarkerEl(block, guardian)
      Object.assign(el.style, {
        position: 'absolute',
        top: '0', left: '0',
        pointerEvents: 'none',
        overflow: 'hidden',
        willChange: 'transform',
      })
      overlay.appendChild(el)
      blocksDataRef.current.set(block.key, {
        el,
        nwLng: nw.lng, nwLat: nw.lat,
        seLng: se.lng, seLat: se.lat,
        sig,
      })
    }
    // Remove stale elements
    for (const [key, entry] of blocksDataRef.current) {
      if (!seen.has(key)) { entry.el.remove(); blocksDataRef.current.delete(key) }
    }
  }

  // Called on every render frame — positions every block el exactly over its tile
  function positionOverlayEls(map) {
    for (const { el, nwLng, nwLat, seLng, seLat } of blocksDataRef.current.values()) {
      const p1 = map.project([nwLng, nwLat])
      const p2 = map.project([seLng, seLat])
      const x = p1.x
      const y = p1.y
      const w = Math.max(1, p2.x - p1.x)
      const h = Math.max(1, p2.y - p1.y)
      el.style.transform = `translate(${x}px,${y}px)`
      el.style.width  = `${w}px`
      el.style.height = `${h}px`
      el.style.opacity = w < 6 ? '0' : w < 20 ? String((w - 6) / 14) : '1'
      const lbl = el.querySelector('[data-lbl]')
      if (lbl) lbl.style.fontSize = `${Math.max(7, Math.min(13, w * 0.1))}px`
    }
  }

  function syncPresenceDots(map, overlay) {
    const zoom = map.getZoom()
    // Only show at zoom 4–12 where clusters make sense
    if (zoom < 4 || zoom > 13) {
      for (const el of presenceElsRef.current.values()) el.style.display = 'none'
      return
    }
    for (const dot of presenceDotsRef.current) {
      let el = presenceElsRef.current.get(dot.id)
      if (!el) {
        el = document.createElement('div')
        Object.assign(el.style, {
          position: 'absolute', top: '0', left: '0',
          width: '8px', height: '8px',
          borderRadius: '50%',
          pointerEvents: 'none',
          willChange: 'transform',
          zIndex: '1',
          border: '1.5px solid rgba(0,0,0,0.4)',
          transition: 'opacity 0.6s',
        })
        overlay.appendChild(el)
        presenceElsRef.current.set(dot.id, el)
      }
      el.style.display = 'block'
      el.style.background = dot.color || '#4ade80'
      el.style.opacity = zoom < 6 ? '0.5' : '0.75'
      // Slight drift using sine of time + dot id
      const drift = Math.sin(Date.now() / 4000 + dot.id) * 6
      const p = map.project([dot.lng + drift * 0.001, dot.lat + drift * 0.0008])
      el.style.transform = `translate(${p.x - 4}px,${p.y - 4}px)`
    }
  }

  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildStyle('dark'),
      center: [20, 40],
      zoom: 4,
      minZoom: 2,
      maxZoom: 16,
      attributionControl: false,
    })
    mapRef.current = map

    map.on('load', () => {
      // Overlay appended after MapLibre canvas so it sits on top in the stacking order
      const overlay = document.createElement('div')
      Object.assign(overlay.style, {
        position: 'absolute', inset: '0',
        pointerEvents: 'none', overflow: 'hidden',
      })
      containerRef.current.appendChild(overlay)
      overlayRef.current = overlay

      map.addSource('blocks', { type: 'geojson', data: blocksToFC(store.getState().blocks) })
      map.addSource('recent-points', { type: 'geojson', data: recentBlocksPoints(store.getState().blocks) })
      map.addSource('grid', { type: 'geojson', data: emptyFC() })
      map.addSource('hover', { type: 'geojson', data: emptyFC() })
      map.addSource('selected', { type: 'geojson', data: emptyFC() })

      // ── Z2-Z11: CITY LIGHTS ────────────────────────────────────────────────
      // Three stacked blurred circle layers on one point per tile. Overlapping
      // translucent circles accumulate, so a dense cluster blooms into a single
      // warm glow with a hot core — the way a city looks from orbit.
      //
      // Deliberately ONE colour, not ['get','color']: per-tile random colours
      // made a cluster read as multicoloured static ("smoke") rather than light.
      map.addSource('block-points', { type: 'geojson', data: blocksToPoints(store.getState().blocks) })

      // 1. Far outer atmosphere — very soft, very faint, sells the bloom.
      map.addLayer({
        id: 'lights-halo', type: 'circle', source: 'block-points',
        maxzoom: 11,
        paint: {
          'circle-color': LIGHT_WARM,
          'circle-blur': 1,
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 9, 5, 15, 8, 26, 11, 34],
          'circle-opacity': ['interpolate', ['linear'], ['zoom'], 2, 0.1, 6, 0.13, 10, 0.1, 11, 0],
        },
      })
      // 2. Mid glow — the body of the light.
      map.addLayer({
        id: 'lights-glow', type: 'circle', source: 'block-points',
        maxzoom: 11,
        paint: {
          'circle-color': LIGHT_CORE,
          'circle-blur': 0.85,
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 3.5, 5, 6, 8, 11, 11, 15],
          'circle-opacity': ['interpolate', ['linear'], ['zoom'], 2, 0.3, 6, 0.38, 10, 0.3, 11, 0],
        },
      })
      // 3. Hot core — a small near-white point so each light has a filament.
      //    Recent claims burn brighter, which makes activity legible at a glance.
      map.addLayer({
        id: 'lights-core', type: 'circle', source: 'block-points',
        maxzoom: 11,
        paint: {
          'circle-color': LIGHT_HOT,
          'circle-blur': 0.35,
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 1, 5, 1.6, 8, 2.6, 11, 3.4],
          'circle-opacity': [
            'interpolate', ['linear'], ['zoom'],
            2,  ['+', 0.5, ['*', ['get', 'recency'], 0.45]],
            8,  ['+', 0.6, ['*', ['get', 'recency'], 0.4]],
            11, 0,
          ],
        },
      })

      // ── Z8-Z12: recency pulse — recent tiles glow brighter ─────────────────
      map.addLayer({
        id: 'blocks-recency', type: 'fill', source: 'blocks',
        // Starts at 11, where the city-lights layers fade out. It paints
        // per-tile colours, so overlapping the lights range put stray coloured
        // specks in among the glow — the exact "smoke" effect the lights fixed.
        minzoom: 11, maxzoom: 13,
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': [
            'interpolate', ['linear'], ['zoom'],
            11, ['*', ['get', 'recency'], 0.55],
            13, ['*', ['get', 'recency'], 0.25],
          ],
        },
      })

      // ── Z10+: solid tinted fill — rich territory color ─────────────────────
      map.addLayer({
        id: 'blocks-fill', type: 'fill', source: 'blocks',
        minzoom: 9,
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0, 10, 0.22, 12, 0.28, 14, 0.32],
        },
      })

      // ── Close-zoom glow border ─────────────────────────────────────────────
      map.addLayer({
        id: 'blocks-border-outer', type: 'line', source: 'blocks',
        minzoom: 9,
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 2, 11, 5, 14, 8],
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0, 10, 0.35, 12, 0.22],
          'line-blur': 6,
        },
      })
      map.addLayer({
        id: 'blocks-border', type: 'line', source: 'blocks',
        minzoom: 9,
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.5, 11, 2, 14, 2.5],
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0, 10, 1],
        },
      })

      // ── Tile grid — visible only at zoom ≥12 (Z14 tiles are small enough) ──
      map.addLayer({
        id: 'grid-lines', type: 'line', source: 'grid',
        minzoom: 12,
        paint: {
          'line-color': 'rgba(255,255,255,0.09)',
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.4, 14, 0.8, 16, 1.2],
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0.12, 14, 0.22, 16, 0.32],
        },
      })

      // ── Hover — subtle fill + sharp border ────────────────────────────────
      map.addLayer({
        id: 'hover-fill', type: 'fill', source: 'hover',
        paint: { 'fill-color': ACCENT_MAP, 'fill-opacity': 0.07 },
      })
      map.addLayer({
        id: 'hover-border', type: 'line', source: 'hover',
        paint: { 'line-color': ACCENT_MAP, 'line-width': 1, 'line-opacity': 0.5 },
      })

      // ── Selection — green fill + glowing border ────────────────────────────
      map.addLayer({
        id: 'selected-fill', type: 'fill', source: 'selected',
        paint: { 'fill-color': ACCENT_MAP, 'fill-opacity': 0.12 },
      })
      map.addLayer({
        id: 'selected-border-glow', type: 'line', source: 'selected',
        paint: { 'line-color': ACCENT_MAP, 'line-width': 6, 'line-opacity': 0.2, 'line-blur': 4 },
      })
      map.addLayer({
        id: 'selected-border', type: 'line', source: 'selected',
        paint: { 'line-color': ACCENT_MAP, 'line-width': 1.5, 'line-opacity': 1 },
      })

      // ── Block image overlay ───────────────────────────────────────────────
      syncOverlayEls(store.getState().blocks)
      positionOverlayEls(map)

      // ── Viewer presence dots ──────────────────────────────────────────────
      presenceDotsRef.current = generatePresenceDots(store.getState().blocks, 15)
      syncPresenceDots(map, overlay)

      store.getState().setMapReady(true)

      // Expose flyTo for SearchBar and deep-link
      if (flyToRef) {
        flyToRef.current = (lng, lat, zoom = 12) => {
          map.flyTo({ center: [lng, lat], zoom, duration: 1200 })
        }
      }
    })

    function updateGrid() {
      map.getSource('grid')?.setData(viewportGridFC(map))
    }

    // positionOverlayEls runs on every render frame — perfectly tracks zoom/pan animation
    map.on('render', () => {
      positionOverlayEls(map)
      if (overlayRef.current) syncPresenceDots(map, overlayRef.current)
    })
    map.on('zoom',   () => { store.getState().setZoom(map.getZoom()); updateGrid() })
    map.on('move',   () => updateGrid())
    map.on('load',   updateGrid)

    map.on('mousemove', (e) => {
      const { lng, lat } = e.lngLat
      const { x: tx, y: ty } = lngLatToTile(lng, lat, PURCHASE_ZOOM)
      const key = tileKey(tx, ty)
      if (hoveredKeyRef.current === key) return
      hoveredKeyRef.current = key

      map.getSource('hover')?.setData(highlightFC(tx, ty))
      map.getCanvas().style.cursor = 'crosshair'

      const owned = store.getState().blocks.get(key) ?? null
      store.getState().setHoveredKey(key)

      // A mousemove can land before the hover layers are added, or after a
      // style reload drops them. setPaintProperty throws "Cannot style
      // non-existing layer" in that window, so guard on the layer existing —
      // the getSource call above was already optional-chained for this reason.
      const hoverColor = owned?.color ?? ACCENT_MAP
      if (map.getLayer('hover-fill')) {
        map.setPaintProperty('hover-fill', 'fill-color',   hoverColor)
        map.setPaintProperty('hover-fill', 'fill-opacity', owned ? 0.1 : 0.06)
      }
      if (map.getLayer('hover-border')) {
        map.setPaintProperty('hover-border', 'line-color', hoverColor)
      }
    })

    // 'mouseout' is the map-level canvas-exit event; 'mouseleave' only fires
    // when qualified with a layer id, so it never cleared the hover state here.
    map.on('mouseout', () => {
      hoveredKeyRef.current = null
      map.getSource('hover')?.setData(emptyFC())
      map.getCanvas().style.cursor = ''
      store.getState().setHoveredKey(null)
    })

    map.on('click', (e) => {
      const { lng, lat } = e.lngLat
      const { x: tx, y: ty } = lngLatToTile(lng, lat, PURCHASE_ZOOM)
      const key = tileKey(tx, ty)
      selectedKeyRef.current = key
      map.getSource('selected')?.setData(highlightFC(tx, ty))

      const owned = store.getState().blocks.get(key) ?? null
      const price = owned?.price ?? tileBasePrice(tx, ty)
      const color = owned?.color ?? ACCENT_MAP

      map.setPaintProperty('selected-fill',        'fill-color', color)
      map.setPaintProperty('selected-border-glow', 'line-color', color)
      map.setPaintProperty('selected-border',      'line-color', color)

      store.getState().setSelectedKey(key)
      onBlockClick?.({ tx, ty, key, owner: owned?.owner ?? null, country: owned?.country ?? 'Uncharted Territory', price, color, isEmpty: !owned })
    })

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')

    // Blocks usually arrive after 'load', so the subscription below does the
    // framing — but cover the case where the store was already populated (a
    // cached fetch, or a remount) and no change event will ever fire.
    fitToWorldOnce(map, store.getState().blocks)

    let prevBlocks     = store.getState().blocks
    let prevSelectedKey = store.getState().selectedKey

    const unsub = store.subscribe((state) => {
      if (state.blocks !== prevBlocks) {
        prevBlocks = state.blocks
        map.getSource('blocks')?.setData(blocksToFC(state.blocks))
        map.getSource('block-points')?.setData(blocksToPoints(state.blocks))
        map.getSource('recent-points')?.setData(recentBlocksPoints(state.blocks))
        fitToWorldOnce(map, state.blocks)
        if (map.isStyleLoaded()) {
          syncOverlayEls(state.blocks)
          positionOverlayEls(map)
          presenceDotsRef.current = generatePresenceDots(state.blocks, 15)
        }
      }
      if (state.selectedKey !== prevSelectedKey) {
        prevSelectedKey = state.selectedKey
        if (!state.selectedKey) {
          map.getSource('selected')?.setData(emptyFC())
          selectedKeyRef.current = null
        }
      }
    })

    // Guardian shields are drawn by syncOverlayEls from guardianStore, but the
    // block subscription above only fires on block changes. Guardians load in
    // parallel and often resolve after blocks (or after deploy/remove), so
    // re-sync the overlays whenever the guardian set changes.
    let prevGuardians = guardianStore.getState().guardians
    const unsubGuardians = guardianStore.subscribe((gState) => {
      if (gState.guardians !== prevGuardians) {
        prevGuardians = gState.guardians
        if (map.isStyleLoaded()) {
          syncOverlayEls(store.getState().blocks)
          positionOverlayEls(map)
        }
      }
    })

    return () => {
      unsub()
      unsubGuardians()
      for (const { el } of blocksDataRef.current.values()) el.remove()
      blocksDataRef.current.clear()
      for (const el of presenceElsRef.current.values()) el.remove()
      presenceElsRef.current.clear()
      overlayRef.current?.remove()
      map.remove()
    }
  }, [])

  return (
    <>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      <StyleSwitcher current={mapStyle} onChange={switchStyle} />
    </>
  )
}

// ── Map style switcher ────────────────────────────────────────────────────────

function StyleSwitcher({ current, onChange }) {
  return (
    <div style={{
      position: 'absolute',
      bottom: 'calc(var(--feed-h) + 60px)',
      right: 'max(14px, var(--sar))',
      zIndex: 15,
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      background: 'var(--s2)',
      borderRadius: 'var(--r-md)',
      overflow: 'hidden',
      boxShadow: 'var(--sh-md)',
    }}>
      {Object.entries(MAP_STYLES).map(([key, def]) => {
        const active = key === current
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            title={def.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '9px 13px',
              background: active ? 'var(--green-d)' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
              transition: 'background 0.12s',
              borderLeft: active ? '2px solid var(--green)' : '2px solid transparent',
            }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--s3)' }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
          >
            <span style={{ fontSize: 13, lineHeight: 1 }}>{def.icon}</span>
            <span style={{
              fontSize: 11, fontWeight: active ? 700 : 500,
              color: active ? 'var(--green)' : 'var(--t2)',
              fontFamily: 'var(--font)',
              whiteSpace: 'nowrap',
            }}>{def.label}</span>
          </button>
        )
      })}
    </div>
  )
}
