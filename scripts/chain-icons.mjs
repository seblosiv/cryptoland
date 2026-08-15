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
 * THE MARK. The XONO glyph — a Didone O with the X inside, the first and last
 * letters of the company name. Every subdomain carries it in that chain's own
 * accent, so 32 favicons read as one family.
 *
 * (Previously: one filled tile on a grid — the product reduced to its smallest
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
   The XONO glyph: a Didone O with the X set inside it — the first and last
   letters of the company name locked together. Replaces the earlier
   grid-with-a-tile mark, which was generic and tied the 32 subdomains to
   nothing.

   Drawn on a 100-unit box to match deploy/apex/brand.mjs exactly, so the
   favicon and the wordmark are the same drawing at different sizes.

   The ring takes the chain's accent; the X stays white. That is the same
   single-accent logic as the wordmark, and it means every subdomain gets a
   favicon in its OWN colour while remaining recognisably one family. */
const RING = { cx: 50, cy: 50, rx: 34, ry: 40, ix: 23, iy: 37.8 }
const ARM = 15          // X reach from centre
const XW = 7.5          // thick stroke of the X — the Didone contrast
const XT = 1.6          // hairline stroke

/* Contrast does not survive a favicon.
   Rendered at 32px the 1.6-unit hairline collapses to under half a pixel: the
   X reads as a single slash and the mark stops being an X at all. Below 48px
   the two strokes are therefore equalised — the SHAPE (X inside O) is what has
   to survive at that size, not the type detail. Verified by magnifying the
   actual 32px output, not by assuming. */
/* Verified by magnifying real output at 16/32/48/96, not by assuming:
     >= 96  full Didone contrast — the hairline is over a pixel wide
     32-95  both strokes equalised; the hairline still collapses at 48
     <= 24  the X blurs into the ring, so it is dropped entirely and the mark
            becomes a solid accent ring. A recognisable O beats an illegible X.
   The shape is what must survive at favicon size, not the type detail. */
const strokesFor = (size) => {
  if (!size || size >= 96) return [XW, XT]
  if (size <= 24) return [0, 0]
  return [5.2, 5.2]
}

export function markSVG({ accent, bg = 'none', ink = '#ffffff', size = null }) {
  const { cx, cy, rx, ry, ix, iy } = RING
  const [w1, w2] = strokesFor(size)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <rect width="100" height="100" fill="${bg}"/>
  <path fill="${accent}" fill-rule="evenodd"
        d="M${cx - rx} ${cy} A${rx} ${ry} 0 0 1 ${cx + rx} ${cy} A${rx} ${ry} 0 0 1 ${cx - rx} ${cy} Z
           M${cx - ix} ${cy} A${ix} ${iy} 0 0 0 ${cx + ix} ${cy} A${ix} ${iy} 0 0 0 ${cx - ix} ${cy} Z"/>
  ${w1 > 0 ? `<path fill="${ink}" d="M${cx - ARM} ${cy - ARM} l${w1} 0 L${cx + ARM} ${cy + ARM} l${-w1} 0 Z"/>` : ''}
  ${w2 > 0 ? `<path fill="${ink}" d="M${cx + ARM - w2} ${cy - ARM} l${w2} 0 L${cx - ARM + w2} ${cy + ARM} l${-w2} 0 Z"/>` : ''}
</svg>
`
}

const hex = h => {
  const s = String(h).replace('#', '')
  const f = s.length === 3 ? s.split('').map(c => c + c).join('') : s
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)]
}

/** Draw the glyph into RGBA with no native dependency.
 *
 *  The previous version filled axis-aligned rectangles only, which is why the
 *  old mark was a grid: rectangles are all it could express. The glyph needs an
 *  ellipse and two slanted strokes, so both are added as primitives here.
 *
 *  Curved edges are supersampled 2x2. The original note — that a blurred mark
 *  at 16px is unrecognisable — is right about BLUR, but an unantialiased curve
 *  at 16px reads as a jagged blob, which is worse. Straight edges still land on
 *  whole pixels. */
function rasterise(size, { accent, bg, ink }) {
  const buf = Buffer.alloc(size * size * 4)
  const A = hex(accent), I = hex(ink), B = bg && bg !== 'none' ? hex(bg) : null
  const k = size / 100
  const SS = 2                       // supersample factor for curved edges
  const { cx, cy, rx, ry, ix, iy } = RING
  const [w1, w2] = strokesFor(size)

  const inEllipse = (x, y, ex, ey) => {
    const dx = (x - cx) / ex, dy = (y - cy) / ey
    return dx * dx + dy * dy <= 1
  }
  // Point-in-parallelogram for the X strokes, expressed as two half-planes.
  const inStroke = (x, y, x0, y0, x1, y1, w) => {
    const vx = x1 - x0, vy = y1 - y0
    const len = Math.hypot(vx, vy)
    const t = ((x - x0) * vx + (y - y0) * vy) / (len * len)
    if (t < 0 || t > 1) return false
    const px = x0 + vx * t, py = y0 + vy * t
    return Math.hypot(x - px, y - py) <= w / 2
  }

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let ringHits = 0, inkHits = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const ux = (px + (sx + 0.5) / SS) / k
          const uy = (py + (sy + 0.5) / SS) / k
          if ((w1 > 0 && inStroke(ux, uy, cx - ARM, cy - ARM, cx + ARM, cy + ARM, w1)) ||
              (w2 > 0 && inStroke(ux, uy, cx + ARM, cy - ARM, cx - ARM, cy + ARM, w2))) {
            inkHits++
          } else if (inEllipse(ux, uy, rx, ry) && !inEllipse(ux, uy, ix, iy)) {
            ringHits++
          }
        }
      }
      const total = SS * SS
      const i = (py * size + px) * 4
      if (B) { buf[i] = B[0]; buf[i + 1] = B[1]; buf[i + 2] = B[2]; buf[i + 3] = 255 }
      if (inkHits) {
        const a = Math.round((inkHits / total) * 255)
        blend(buf, i, I, a)
      } else if (ringHits) {
        blend(buf, i, A, Math.round((ringHits / total) * 255))
      }
    }
  }
  return buf
}

/** Source-over composite, so an antialiased edge sits on the background
 *  instead of punching a hole in it. */
function blend(buf, i, [r, g, b], a) {
  if (a >= 255) { buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255; return }
  const dst = buf[i + 3]
  const out = a + dst * (1 - a / 255)
  if (out <= 0) return
  buf[i] = Math.round((r * a + buf[i] * dst * (1 - a / 255)) / out)
  buf[i + 1] = Math.round((g * a + buf[i + 1] * dst * (1 - a / 255)) / out)
  buf[i + 2] = Math.round((b * a + buf[i + 2] * dst * (1 - a / 255)) / out)
  buf[i + 3] = Math.round(out)
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
 * @param {{chain:string,name:string,accent:string,bg?:string,ink?:string}} opts
 */
export function writeChainIcons(outDir, { chain, name, accent, bg = '#000000', ink = '#ffffff' }) {
  mkdirSync(join(outDir, 'icons'), { recursive: true })

  // Tab icon: transparent ground so it sits correctly in light and dark chrome.
  writeFileSync(join(outDir, 'favicon.svg'), markSVG({ accent, bg: 'none', ink }))
  // Maskable/PWA art keeps its own ground, because the OS crops it.
  writeFileSync(join(outDir, 'icon.svg'), markSVG({ accent, bg, ink }))

  const png = {}
  for (const s of PNG_SIZES) {
    png[s] = encodePNG(s, rasterise(s, { accent, bg, ink }))
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
