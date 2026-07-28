/**
 * Beam — Merit Circle's gaming chain.
 * Angular forward-slash beam: one bold parallelogram streak trailed by a
 * lighter one, in brand yellow #FFD200.
 */
export default function BeamLogo({ size = 28, className, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
         xmlns="http://www.w3.org/2000/svg" className={className} style={style}
         role="img" aria-label="Beam logo">
      <polygon points="13.5,3.5 25,3.5 15.5,28.5 4,28.5" fill="#FFD200" />
      <polygon
        points="26,3.5 29.5,3.5 20,28.5 16.5,28.5"
        fill="#FFD200" opacity="0.55"
      />
    </svg>
  )
}
