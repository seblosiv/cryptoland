/**
 * Celo.
 * The signature double circle: one filled disc overlapping one open ring,
 * in Celo's bright yellow-green #FCFF52.
 */
export default function CeloLogo({ size = 28, className, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
         xmlns="http://www.w3.org/2000/svg" className={className} style={style}
         role="img" aria-label="Celo logo">
      <circle cx="11.6" cy="16" r="7.4" fill="#FCFF52" />
      <circle cx="20.4" cy="16" r="7.4" stroke="#FCFF52" strokeWidth="2.4" />
    </svg>
  )
}
