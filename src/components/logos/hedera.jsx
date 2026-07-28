/**
 * Hedera.
 * The circled "H": two vertical bars crossed by two horizontal bars inside a
 * ring. Hedera's mark is black, so it is drawn in #FFFFFF for our dark UI.
 */
export default function HederaLogo({ size = 28, className, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
         xmlns="http://www.w3.org/2000/svg" className={className} style={style}
         role="img" aria-label="Hedera logo">
      <circle cx="16" cy="16" r="12.6" stroke="#FFFFFF" strokeWidth="2.2" />
      <rect x="9.5" y="7.6" width="2.6" height="16.8" fill="#FFFFFF" />
      <rect x="19.9" y="7.6" width="2.6" height="16.8" fill="#FFFFFF" />
      <rect x="9.5" y="12.5" width="13" height="2.3" fill="#FFFFFF" />
      <rect x="9.5" y="17.6" width="13" height="2.3" fill="#FFFFFF" />
    </svg>
  )
}
