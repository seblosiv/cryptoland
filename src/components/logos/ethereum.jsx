/**
 * Ethereum — the faceted octahedron.
 * Four faces: left pair in the light tint, right pair in the base brand blue,
 * meeting at the waist so the "belt" reads without drawing it.
 */
export default function EthereumLogo({ size = 28, className, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
         xmlns="http://www.w3.org/2000/svg" className={className} style={style}
         role="img" aria-label="Ethereum logo">
      {/* upper half */}
      <polygon points="16,2.4 7.2,16.6 16,21.4" fill="#9BABF2" />
      <polygon points="16,2.4 24.8,16.6 16,21.4" fill="#627EEA" />
      {/* lower half */}
      <polygon points="7.2,18.4 16,23.2 16,29.6" fill="#9BABF2" />
      <polygon points="24.8,18.4 16,23.2 16,29.6" fill="#627EEA" />
    </svg>
  )
}
