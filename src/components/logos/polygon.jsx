/**
 * Polygon — the interlocking chevron hexagon.
 * Two mirrored chevrons that almost close into a hexagon, leaving the
 * signature gaps at the left and right points.
 */
export default function PolygonLogo({ size = 28, className, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
         xmlns="http://www.w3.org/2000/svg" className={className} style={style}
         role="img" aria-label="Polygon logo">
      <path
        d="M5 14.2 L10.6 4.5 L21.4 4.5 L27 14.2"
        stroke="#8247E5" strokeWidth="3.3"
        strokeLinecap="round" strokeLinejoin="round"
      />
      <path
        d="M27 17.8 L21.4 27.5 L10.6 27.5 L5 17.8"
        stroke="#8247E5" strokeWidth="3.3"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  )
}
