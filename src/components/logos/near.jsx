/**
 * NEAR — rounded square containing the angular "N": two verticals joined by a
 * steep diagonal. Brand mark is monochrome, so it is drawn white on dark.
 */
export default function NearLogo({ size = 28, className, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
         xmlns="http://www.w3.org/2000/svg" className={className} style={style}
         role="img" aria-label="NEAR Protocol logo">
      <rect x="3.6" y="3.6" width="24.8" height="24.8" rx="7.2"
            stroke="#FFFFFF" strokeWidth="2.2" fill="none" />
      <path d="M11 22.2 V9.8 L21 22.2 V9.8"
            stroke="#FFFFFF" strokeWidth="2.4" fill="none" strokeLinejoin="miter" />
    </svg>
  )
}
