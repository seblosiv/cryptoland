/**
 * chain-icons.mjs — the per-chain icon set, generated at build time.
 *
 * WHY THIS EXISTS. Every chain build was shipping `public/favicon.svg`, which
 * is a purple lightning bolt from an unrelated project — 9.5 KB of gaussian
 * blur filters, in a design system whose first rule is that nothing blurs. And
 * `manifest.json` pointed at `/icons/icon-*.png`, a directory that has never
 * existed: the SPA rewrite answered every one of those requests with
 * index.html, so each "icon" was 3.6 KB of HTML served as image/png. Install
 * the app and you got a broken tile; share it and you got nothing.
 *
 * THE MARK. One filled tile on a grid — the product reduced to its smallest
 * true statement, the same mark the apex homepage uses. It has to survive 16px
 * in a browser tab, so it is three elements: ground, two hairlines each way,
 * one solid square. Drawn on a 64-unit grid so every edge lands on a whole
 * pixel at 16, 32, 48, 96, 128, 192 and 512.
 *
 * The tile takes the chain's accent. That is the same rule the in-app
 * logomarks follow (monochrome art, tinted by accent), and it means 32 open
 * tabs are told apart by colour rather than by reading 32 identical titles.
 *
 * NO RASTERISER DEPENDENCY. The mark is flat colour on axis-aligned rectangles,
 * so it is rasterised into an RGBA buffer here and PNG-encoded with zlib, which
 * ships with node. Nothing here needs a browser, a canvas or a native module —
 * it produces byte-identical output on the laptop, the box and CI.
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/* ── the mark, as geometry ──────────────────────────────────────────────────
   64-unit grid. Lines at 24 and 44 with a 2-unit stroke; the claimed tile is
   the 20×20 square they enclose. */
const GRID = [24, 44]
const STROKE = 2
const TILE = { x: 24, y: 24, w: 20, h: 20 }

export function markSVG({ accent, bg = 'none', grid = '#8a8a8e' }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" fill="${bg}"/>
  <g stroke="${grid}" stroke-width="${STROKE}" shape-rendering="crispEdges">
    <path d="M${GRID[0]} 0 V64 M${GRID[1]} 0 V64 M0 ${GRID[0]} H64 M0 ${GRID[1]} H64"/>
  </g>
  <rect x="${TILE.x}" y="${TILE.y}" width="${TILE.w}" height="${TILE.h}" fill="${accent}"/>
</svg>
`
}

const hex = h => {
  const s = String(h).replace('#', '')
  const f = s.length === 3 ? s.split('').map(c => c + c).join('') : s
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)]
}

/** Flat rectangles into RGBA. No antialiasing wanted — a blurred mark at 16px
 *  is a mark nobody recognises, and every edge is on a whole pixel by design. */
function rasterise(size, { accent, bg, grid }) {
  const buf = Buffer.alloc(size * size * 4)          // transparent by default
  const s = size / 64
  const put = (x0, y0, x1, y1, [r, g, b], a = 255) => {
    const X0 = Math.max(0, Math.round(x0 * s)), X1 = Math.min(size, Math.round(x1 * s))
    const Y0 = Math.max(0, Math.round(y0 * s)), Y1 = Math.min(size, Math.round(y1 * s))
    for (let y = Y0; y < Y1; y++) {
      for (let x = X0; x < X1; x++) {
        const i = (y * size + x) * 4
        buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a
      }
    }
  }

  if (bg) put(0, 0, 64, 64, hex(bg))
  const gc = hex(grid)
  for (const g of GRID) {
    put(g - STROKE / 2, 0, g + STROKE / 2, 64, gc)   // vertical
    put(0, g - STROKE / 2, 64, g + STROKE / 2, gc)   // horizontal
  }
  put(TILE.x, TILE.y, TILE.x + TILE.w, TILE.y + TILE.h, hex(accent))
  return buf
}

/* ── PNG ──────────────────────────────────────────────────────────────────── */
const CRC = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()
const crc32 = b => {
  let c = -1
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

export function encodePNG(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8      // bit depth
  ihdr[9] = 6      // colour type: RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  // One filter byte (0 = None) in front of each scanline.
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** ICO can embed PNG payloads directly at these sizes, so no BMP encoder. */
export function encodeICO(entries) {
  const head = Buffer.alloc(6)
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(entries.length, 4)
  let offset = 6 + entries.length * 16
  const dir = [], body = []
  for (const { size, png } of entries) {
    const d = Buffer.alloc(16)
    d.writeUInt8(size >= 256 ? 0 : size, 0)
    d.writeUInt8(size >= 256 ? 0 : size, 1)
    d.writeUInt16LE(1, 4); d.writeUInt16LE(32, 6)
    d.writeUInt32LE(png.length, 8)
    d.writeUInt32LE(offset, 12)
    offset += png.length
    dir.push(d); body.push(png)
  }
  return Buffer.concat([head, ...dir, ...body])
}

/* Sizes: Google indexes multiples of 48; 180 is what Safari pins; 192/512 are
   the PWA install icons the manifest has been promising all along. */
const PNG_SIZES = [16, 32, 48, 72, 96, 128, 180, 192, 512]

/**
 * Write the whole set into a built bundle.
 * @param {string} outDir  the dist directory to write into
 * @param {{chain:string,name:string,accent:string,bg?:string,grid?:string}} opts
 */
export function writeChainIcons(outDir, { chain, name, accent, bg = '#0f0f0f', grid = '#3a3a3c' }) {
  mkdirSync(join(outDir, 'icons'), { recursive: true })

  // Tab icon: transparent ground so it sits correctly in light and dark chrome.
  writeFileSync(join(outDir, 'favicon.svg'), markSVG({ accent, bg: 'none', grid: '#8a8a8e' }))
  // Maskable/PWA art keeps its own ground, because the OS crops it.
  writeFileSync(join(outDir, 'icon.svg'), markSVG({ accent, bg, grid }))

  const png = {}
  for (const s of PNG_SIZES) {
    png[s] = encodePNG(s, rasterise(s, { accent, bg, grid }))
    writeFileSync(join(outDir, 'icons', `icon-${s}.png`), png[s])
  }
  // iOS looks for this exact path when a page ships no apple-touch-icon link.
  writeFileSync(join(outDir, 'apple-touch-icon.png'), png[180])
  writeFileSync(join(outDir, 'favicon.ico'),
    encodeICO([16, 32, 48].map(size => ({ size, png: png[size] }))))

  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify({
    name: `CryptoLand on ${name}`,
    short_name: 'CryptoLand',
    description: 'Own real Earth territory on-chain — 268,435,456 tiles.',
    start_url: '/',
    display: 'standalone',
    background_color: bg,
    theme_color: accent,
    icons: [
      ...[72, 96, 128, 192, 512].map(s => ({
        src: `/icons/icon-${s}.png`, sizes: `${s}x${s}`, type: 'image/png', purpose: 'any',
      })),
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }, null, 2) + '\n')

  return { chain, accent, sizes: PNG_SIZES.length }
}
