/**
 * XONO — the company wordmark and its standalone glyph.
 *
 * Underscore-prefixed so `logoFor()` never resolves it as a chain: this is the
 * PARENT brand, and the chain marks in this directory are its children. The
 * conventions still apply — monochrome `currentColor`, pure paths, no fonts,
 * no filters — so it tints and scales exactly like the rest of the system.
 *
 * ── Why it is drawn, not set in a typeface ───────────────────────────────────
 * A wordmark set in a webfont is not a logo: it depends on that font loading,
 * shifts between platforms, and cannot be reduced to a single glyph. These are
 * geometric paths on a strict grid, so the mark is identical everywhere, works
 * at 14px in a nav and at 2000px on a deck, and needs nothing to load.
 *
 * ── The idea ────────────────────────────────────────────────────────────────
 * XONO is X · O · N · O — two crosses of diagonals bracketing two rings. The
 * product is a world divided into square tiles, so every letter is built from
 * the same square cell: the O is a ring inscribed in it, the X its two
 * diagonals, the N its two verticals plus one diagonal. Same cell, same stroke
 * weight, same optical rhythm — the letters read as a system rather than as
 * type, which is the same argument the chain marks make.
 *
 * Strokes are drawn as strokes (not outlined paths) with `vectorEffect:
 * non-scaling-stroke` deliberately NOT set: the weight must scale with the
 * mark, or it thickens into a blob when it is small and hairlines when large.
 *
 * ── Optical corrections, which are the whole job ────────────────────────────
 * Round shapes read smaller than flat ones at the same measured height, so each
 * O overshoots the X and N by ~2% and carries a slightly lighter stroke — a ring
 * at the same weight as a straight stem looks heavier, because more of its
 * length sits at the extremes. Both are standard type corrections.
 *
 * These numbers were MEASURED against renders, not eyeballed. The first attempt
 * used r = 9.6 "for a 4% overshoot" and was actually 10.4% too SHORT: a ring's
 * visual height is (2r + stroke), and I had compared it against the wrong
 * reference. The word sagged in the middle. See RING_R below.
 */

/** Cell geometry, shared by every letter so the rhythm is exact. */
const PAD = 4            // keeps strokes off the viewBox edge — they clip otherwise
const CELL = 22          // letter box
const GAP = 9            // space between letters
const STROKE = 2.6       // stem weight
const RING_STROKE = 2.45 // rings slightly lighter — see header

// MEASURED, not guessed. A ring's visual height is (2r + strokeWidth); the X
// and N occupy (CELL + STROKE) = 24.6. An r of 9.6 made the O 10.4% SHORTER
// than its neighbours — the word visibly sagged in the middle. 11.32 puts the
// O at +2% overshoot, which is the standard correction for round caps against
// flat ones.
const RING_R = 11.32
// The N's diagonal stops short of both stem tops. Meeting them turns the
// counters into a solid triangle at small sizes — it read as a filled wedge.
const N_INSET = 3.2

const x0 = (i) => PAD + i * (CELL + GAP)

/**
 * The full XONO wordmark.
 *
 * `size` drives HEIGHT (as with every mark here); width follows the aspect
 * ratio, so it drops into a nav row without measuring anything.
 */
export function XonoWordmark({ size = 28, className, style, title = 'XONO' }) {
  const w = PAD * 2 + CELL * 4 + GAP * 3
  const h = PAD * 2 + CELL
  const y0 = PAD
  const y1 = PAD + CELL
  const cy = (y0 + y1) / 2
  const n = x0(2)
  return (
    <svg
      height={size}
      width={size * (w / h)}
      viewBox={`0 0 ${w} ${h}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      role="img"
      aria-label={title}
    >
      {/* X — the cell's two diagonals, corner to corner. */}
      <path
        d={`M${x0(0)} ${y0} L${x0(0) + CELL} ${y1} M${x0(0) + CELL} ${y0} L${x0(0)} ${y1}`}
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinecap="square"
      />

      {/* O — a ring inscribed in the cell, drawn slightly oversized. */}
      <circle
        cx={x0(1) + CELL / 2}
        cy={cy}
        r={RING_R}
        stroke="currentColor"
        strokeWidth={RING_STROKE}
      />

      {/* N — two stems plus a diagonal drawn separately, so the diagonal can be
          inset at both ends and the counters stay open. */}
      <path d={`M${n} ${y1} L${n} ${y0}`} stroke="currentColor"
            strokeWidth={STROKE} strokeLinecap="square" />
      <path d={`M${n + CELL} ${y1} L${n + CELL} ${y0}`} stroke="currentColor"
            strokeWidth={STROKE} strokeLinecap="square" />
      <path d={`M${n} ${y0 + N_INSET} L${n + CELL} ${y1 - N_INSET}`}
            stroke="currentColor" strokeWidth={STROKE} strokeLinecap="butt" />

      {/* O */}
      <circle
        cx={x0(3) + CELL / 2}
        cy={cy}
        r={RING_R}
        stroke="currentColor"
        strokeWidth={RING_STROKE}
      />
    </svg>
  )
}

/**
 * The standalone glyph — an X inside a ring, for a favicon, an avatar, or
 * anywhere the full word would be illegible.
 *
 * It is the first and last letters of XONO collapsed into one figure, which is
 * why it reads as the same brand rather than as an unrelated icon. Square
 * viewBox so it centres in a round or square container without adjustment.
 */
export function XonoGlyph({ size = 28, className, style, title = 'XONO' }) {
  const S = 48
  const c = S / 2
  const r = 20.5
  const arm = 9.4     // diagonal reach — kept clear of the ring's inner edge
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${S} ${S}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      role="img"
      aria-label={title}
    >
      <circle cx={c} cy={c} r={r} stroke="currentColor" strokeWidth="2.6" />
      <path
        d={`M${c - arm} ${c - arm} L${c + arm} ${c + arm}
            M${c + arm} ${c - arm} L${c - arm} ${c + arm}`}
        stroke="currentColor"
        strokeWidth="2.9"
        strokeLinecap="square"
      />
    </svg>
  )
}

export default XonoWordmark
