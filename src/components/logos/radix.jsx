/**
 * Radix — the angular "R" prism: a stem, a faceted bowl and a diagonal leg
 * reading as overlapping planes. Radix blue is #052CC0, which disappears on
 * #141414, so the primary here is the lighter #3B6BF5 with a paler plane.
 */
export default function RadixLogo({ size = 28, className, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
         xmlns="http://www.w3.org/2000/svg" className={className} style={style}
         role="img" aria-label="Radix logo">
      {/* stem */}
      <rect x="4.5" y="4" width="5" height="24" fill="#3B6BF5" />
      {/* faceted bowl */}
      <polygon fill="#3B6BF5" points="9.5,4 22,4 26.5,9.5 20,15 9.5,15" />
      {/* diagonal leg, the overlapping plane */}
      <polygon fill="#7FA0FF" points="14.5,14 21.5,14 27,28 20,28" />
    </svg>
  )
}
