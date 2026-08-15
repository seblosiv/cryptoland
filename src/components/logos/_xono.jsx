/**
 * XONO — the company wordmark, cut as a high-contrast Didone.
 *
 * Underscore-prefixed so `logoFor()` never resolves it as a chain: this is the
 * PARENT brand. Monochrome `currentColor`, filled paths, no fonts, no filters —
 * so it tints and scales like every other mark in this directory.
 *
 * ── Why a Didone, not the geometric monoline this replaces ──────────────────
 * The first attempt was a monoline geometric wordmark: even stroke weight,
 * circle-and-diagonal letterforms. That vocabulary is the default of every
 * 2015-era startup and reads as cheap however carefully it is drawn.
 *
 * The premium register is the Didone — thick stems against hairline thins, flat
 * unbracketed serifs, vertical stress. It is what Vogue, Dior and Bulgari use,
 * and it signals luxury precisely because extreme contrast is unforgiving: it
 * only survives if the drawing is exact.
 *
 * Drawn as filled paths rather than set in a typeface: nothing to load, no
 * platform substitution, identical everywhere, no licence.
 *
 * ── The three things that make it read expensive ────────────────────────────
 * 1. CONTRAST — stems are ~7x the hairlines. Less contrast slides toward Times
 *    and reads as a document rather than a mark.
 * 2. TRACKING — letters sit 34 units apart on a 68 cap height, which is very
 *    wide. Luxury logotypes breathe; tight setting reads as body copy. This is
 *    the single biggest difference between a word and a mark.
 * 3. SERIFS slightly wider than the stems they cap, which is what makes a
 *    Didone look cut rather than drawn.
 *
 * The O overshoots the cap line by 1.2 units top and bottom — round shapes read
 * short against flat terminals. Measured against renders, not guessed: the
 * monoline draft got this wrong in the other direction and the word sagged.
 *
 * WARNING: contrast is the idea and also the constraint. Below ~18px the
 * hairlines thin out. Use XonoGlyph for favicons and very small nav rows.
 */

/** The full XONO wordmark. `size` drives HEIGHT; width follows the ratio. */
export function XonoWordmark({ size = 28, className, style, title = 'XONO' }) {
  const w = 352
  const h = 100
  return (
    <svg
      height={size}
      width={size * (w / h)}
      viewBox={`0 0 ${w} ${h}`}
      fill="currentColor"
      fillRule="evenodd"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      role="img"
      aria-label={title}
    >
      <path d="M14 16 l13 0 L66 84 l-13 0 Z" />
      <path d="M64.1 16 l1.9 0 L15.9 84 l-1.9 0 Z" />
      <path d="M11.5 16 h18 v1.7 h-18 Z" />
      <path d="M50.5 82.3 h18 v1.7 h-18 Z" />
      <path d="M56.05 16 h18 v1.7 h-18 Z" />
      <path d="M5.949999999999999 82.3 h18 v1.7 h-18 Z" />
      <path d="M100 50 A29 35.2 0 0 1 158 50 A29 35.2 0 0 1 100 50 ZM113 50 A16 33.300000000000004 0 0 0 145 50 A16 33.300000000000004 0 0 0 113 50 Z" />
      <path d="M192 16 h13 L246 84 h-13 Z" />
      <path d="M192 16 h1.9 v68 h-1.9 Z" />
      <path d="M244.1 16 h1.9 v68 h-1.9 Z" />
      <path d="M183.95 16 h18 v1.7 h-18 Z" />
      <path d="M183.95 82.3 h18 v1.7 h-18 Z" />
      <path d="M236.05 16 h18 v1.7 h-18 Z" />
      <path d="M236.05 82.3 h18 v1.7 h-18 Z" />
      <path d="M280 50 A29 35.2 0 0 1 338 50 A29 35.2 0 0 1 280 50 ZM293 50 A16 33.300000000000004 0 0 0 325 50 A16 33.300000000000004 0 0 0 293 50 Z" />
    </svg>
  )
}

/**
 * The standalone glyph — a Didone O with the X set inside it.
 *
 * The wordmark cannot survive a 16px favicon: its hairlines disappear. This
 * carries the same vocabulary (vertical stress, high contrast, flat serifs) in
 * a form that holds as a silhouette, and it is literally the first and last
 * letters of XONO locked together.
 */
export function XonoGlyph({ size = 28, className, style, title = 'XONO' }) {
  const S = 100
  const c = S / 2
  const rx = 34
  const ry = 40
  const stem = 11
  const hair = 2.2
  const ix = rx - stem
  const iy = ry - hair
  const arm = 15
  const xs = 7.5      // the inner X keeps the ring's contrast: thick \ , thin /
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${S} ${S}`}
      fill="currentColor"
      fillRule="evenodd"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      role="img"
      aria-label={title}
    >
      <path d={`M${c - rx} ${c} A${rx} ${ry} 0 0 1 ${c + rx} ${c} A${rx} ${ry} 0 0 1 ${c - rx} ${c} Z M${c - ix} ${c} A${ix} ${iy} 0 0 0 ${c + ix} ${c} A${ix} ${iy} 0 0 0 ${c - ix} ${c} Z`} />
      <path d={`M${c - arm} ${c - arm} l${xs} 0 L${c + arm} ${c + arm} l${-xs} 0 Z`} />
      <path d={`M${c + arm - 1.6} ${c - arm} l1.6 0 L${c - arm + 1.6} ${c + arm} l${-1.6} 0 Z`} />
    </svg>
  )
}

export default XonoWordmark
