/**
 * Arbitrum — the angular "A" on the navy disc.
 * The A is a hollow chevron split down the middle: pale left half, bright
 * Arbitrum blue right half.
 */
export default function ArbitrumLogo({ size = 28, className, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
         xmlns="http://www.w3.org/2000/svg" className={className} style={style}
         role="img" aria-label="Arbitrum logo">
      <circle cx="16" cy="16" r="14" fill="#213147" />
      <polygon points="16,6.6 6.4,25.4 10.8,25.4 16,13.6" fill="#9DCCED" />
      <polygon points="16,6.6 25.6,25.4 21.2,25.4 16,13.6" fill="#12AAFF" />
    </svg>
  )
}
