/**
 * Starknet — angular four-point star in brand salmon, with a navy inner facet
 * that reads as depth against the near-black surface.
 */
export default function StarknetLogo({ size = 28, className, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
         xmlns="http://www.w3.org/2000/svg" className={className} style={style}
         role="img" aria-label="Starknet logo">
      {/* concave diamond — the star silhouette */}
      <polygon
        points="16,2.6 19.7,12.3 29.4,16 19.7,19.7 16,29.4 12.3,19.7 2.6,16 12.3,12.3"
        fill="#EC796B"
      />
      {/* inner facet */}
      <polygon points="16,10.6 18.1,16 16,21.4 13.9,16" fill="#0C0C4F" />
    </svg>
  )
}
