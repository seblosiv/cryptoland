/**
 * TON — brand blue disc with the faceted downward "T" gem, folded down the
 * centre line (the fold is drawn in the disc colour, so no extra fills).
 */
export default function TonLogo({ size = 28, className, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
         xmlns="http://www.w3.org/2000/svg" className={className} style={style}
         role="img" aria-label="TON logo">
      <circle cx="16" cy="16" r="13" fill="#0098EA" />
      {/* faceted gem: flat top edge, single point at the bottom */}
      <path d="M8.6 11.1 H23.4 L16 23.7 Z" fill="#FFFFFF" />
      {/* centre fold */}
      <path d="M16 11.1 V23.7" stroke="#0098EA" strokeWidth="1.15" />
    </svg>
  )
}
