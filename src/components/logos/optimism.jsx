/**
 * Optimism — the "OP" glyph on the red disc.
 * The O is a ring; the P is a bowl with a stem dropping from its lower-left.
 * Drawn as strokes, so no font is involved.
 */
export default function OptimismLogo({ size = 28, className, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
         xmlns="http://www.w3.org/2000/svg" className={className} style={style}
         role="img" aria-label="Optimism logo">
      <circle cx="16" cy="16" r="14" fill="#FF0420" />
      {/* O */}
      <circle cx="11.2" cy="15.6" r="3.3" stroke="#ffffff" strokeWidth="2.4" />
      {/* P — bowl + stem */}
      <circle cx="20.8" cy="14.4" r="3.1" stroke="#ffffff" strokeWidth="2.4" />
      <path
        d="M18.6 16.8 L17.7 21.4"
        stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round"
      />
    </svg>
  )
}
