/**
 * Algorand — the angular "A": two long parallel diagonals crossed by a
 * shorter counter-diagonal. The brand mark is pure black, so it is drawn in
 * #ffffff here (the teal #00D1B2 is the alternate accent).
 */
export default function AlgorandLogo({ size = 28, className, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
         xmlns="http://www.w3.org/2000/svg" className={className} style={style}
         role="img" aria-label="Algorand logo">
      <g stroke="#FFFFFF" strokeWidth="2.6" strokeLinecap="butt">
        <path d="M6.5 28.5 L16.2 3.5" />
        <path d="M14.4 28.5 L24.1 3.5" />
        <path d="M11.6 13.2 L20.4 28.5" />
      </g>
    </svg>
  )
}
