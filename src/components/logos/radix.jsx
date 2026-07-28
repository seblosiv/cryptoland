/**
 * Radix — official Radix Icon (the "√" radical mark).
 * Source: radixdlt.com/radix-brand-pack → "Radix-Icon-SVG.svg". Source viewBox
 * preserved. Monochromed: the solid backing rect, the drop-shadow filter node
 * and its defs are removed, and the glyph fill becomes currentColor.
 */
export default function RadixLogo({ size = 28, className, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 400 400" fill="none"
         xmlns="http://www.w3.org/2000/svg" className={className} style={style}
         role="img" aria-label="Radix logo">
      <path d="M170.912 306.613C166.762 306.613 162.817 304.63 160.343 301.216L108.688 229.63H75V203.567H115.352C119.542 203.567 123.467 205.57 125.92 208.964L168.132 267.447L232.543 120.309C234.628 115.566 239.309 112.5 244.481 112.5H325V138.563H253.005L182.85 298.804C180.969 303.097 176.942 306.04 172.281 306.531C171.852 306.592 171.382 306.613 170.912 306.613Z" fill="currentColor" />
    </svg>
  )
}
