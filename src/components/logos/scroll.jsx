/**
 * Scroll — zkEVM.
 * Unrolled parchment: cream sheet (#FFEEDA) between two curled rolls, with
 * ruled lines in the darker parchment accent (#EBC28E). Cream is the primary
 * because it is what reads on our near-black surfaces.
 */
export default function ScrollLogo({ size = 28, className, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
         xmlns="http://www.w3.org/2000/svg" className={className} style={style}
         role="img" aria-label="Scroll logo">
      {/* sheet */}
      <rect x="9" y="6.5" width="14" height="19" rx="2.2" fill="#FFEEDA" />
      {/* curled ends */}
      <rect x="4.4" y="6.5" width="5.2" height="19" rx="2.6" fill="#EBC28E" />
      <rect x="22.4" y="6.5" width="5.2" height="19" rx="2.6" fill="#EBC28E" />
      {/* ruled lines */}
      <path
        d="M12.4 12.6h7.2M12.4 16h7.2M12.4 19.4h4.6"
        stroke="#EBC28E" strokeWidth="1.5" strokeLinecap="round"
      />
    </svg>
  )
}
