/**
 * brand.mjs — the XONO mark, for the generated static pages.
 *
 * The apex, /about and the 33 decks are built by scripts that emit raw HTML, so
 * they cannot import the React component in src/components/logos/_xono.jsx.
 * This is the same geometry expressed as strings, kept here so the marks are
 * defined ONCE for every generated surface rather than pasted into each builder.
 *
 * Whenever _xono.jsx changes, change this too — `npm test` includes a parity
 * check (src/test/brand.test.js) that fails if the two drift.
 *
 * The mark is a high-contrast Didone: thick stems, hairline thins, flat cut
 * serifs, wide tracking. The accent falls on the FINAL O only — one accented
 * letter reads as a full stop; two split the eye and the word looks decorated.
 */

const W = 352
const H = 100

/** The 15 paths, grouped by letter so one letter can take the accent.
 *  Generated from the verified source geometry — do NOT hand-edit: an earlier
 *  hand-transcription got the O counters wrong (inner radius 16 became 16.5 and
 *  the arc sweep flipped), which rendered both O.s as near-solid blobs. */
const X = [
  "M14 16 l13 0 L66 84 l-13 0 Z",
  "M64.1 16 l1.9 0 L15.9 84 l-1.9 0 Z",
  "M11.5 16 h18 v1.7 h-18 Z",
  "M50.5 82.3 h18 v1.7 h-18 Z",
  "M56.05 16 h18 v1.7 h-18 Z",
  "M5.949999999999999 82.3 h18 v1.7 h-18 Z",
]
const O1 = [
  "M100 50 A29 35.2 0 0 1 158 50 A29 35.2 0 0 1 100 50 ZM113 50 A16 33.300000000000004 0 0 0 145 50 A16 33.300000000000004 0 0 0 113 50 Z",
]
const N = [
  "M192 16 h13 L246 84 h-13 Z",
  "M192 16 h1.9 v68 h-1.9 Z",
  "M244.1 16 h1.9 v68 h-1.9 Z",
  "M183.95 16 h18 v1.7 h-18 Z",
  "M183.95 82.3 h18 v1.7 h-18 Z",
  "M236.05 16 h18 v1.7 h-18 Z",
  "M236.05 82.3 h18 v1.7 h-18 Z",
]
const O2 = [
  "M280 50 A29 35.2 0 0 1 338 50 A29 35.2 0 0 1 280 50 ZM293 50 A16 33.300000000000004 0 0 0 325 50 A16 33.300000000000004 0 0 0 293 50 Z",
]

const paths = (arr, fill) =>
  arr.map((d) => `<path d="${d}"${fill ? ` fill="${fill}"` : ''}/>`).join('')

/**
 * The XONO wordmark as an inline SVG string.
 *
 * @param {number} height   rendered height in px; width follows the ratio
 * @param {string} base     colour of X, O, N
 * @param {string} accent   colour of the final O; pass the same as `base` for mono
 */
export function xonoWordmark({ height = 22, base = '#fff', accent = '#4ade80', style = '' } = {}) {
  return `<svg viewBox="0 0 ${W} ${H}" fill-rule="evenodd" role="img" aria-label="XONO"`
    + ` style="height:${height}px;width:auto;display:block;${style}">`
    + paths(X, base) + paths(O1, base) + paths(N, base) + paths(O2, accent)
    + '</svg>'
}

/**
 * The glyph — a Didone O with the X inside. For favicons and anywhere the
 * wordmark's hairlines would disappear (below ~18px).
 */
export function xonoGlyph({ size = 24, base = '#fff', accent = '#4ade80', style = '' } = {}) {
  const S = 100, c = 50, rx = 34, ry = 40, ix = 23, iy = 37.8, arm = 15, xs = 7.5
  return `<svg viewBox="0 0 ${S} ${S}" fill-rule="evenodd" role="img" aria-label="XONO"`
    + ` style="width:${size}px;height:${size}px;display:block;${style}">`
    + `<path fill="${accent}" d="M${c - rx} ${c} A${rx} ${ry} 0 0 1 ${c + rx} ${c}`
    + ` A${rx} ${ry} 0 0 1 ${c - rx} ${c} Z M${c - ix} ${c} A${ix} ${iy} 0 0 0 ${c + ix} ${c}`
    + ` A${ix} ${iy} 0 0 0 ${c - ix} ${c} Z"/>`
    + `<path fill="${base}" d="M${c - arm} ${c - arm} l${xs} 0 L${c + arm} ${c + arm} l${-xs} 0 Z"/>`
    + `<path fill="${base}" d="M${c + arm - 1.6} ${c - arm} l1.6 0 L${c - arm + 1.6} ${c + arm} l-1.6 0 Z"/>`
    + '</svg>'
}

/** Accent that survives a WHITE background — #4ade80 is tuned for dark only. */
export const ACCENT_ON_LIGHT = '#16a34a'
export const ACCENT_ON_DARK = '#4ade80'
export const WORDMARK_RATIO = W / H
