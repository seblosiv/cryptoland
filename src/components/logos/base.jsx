/**
 * Base — the "almost-circle": a disc with a flat vertical cut on the right.
 * One arc plus the closing chord; nothing else needed.
 */
export default function BaseLogo({ size = 28, className, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
         xmlns="http://www.w3.org/2000/svg" className={className} style={style}
         role="img" aria-label="Base logo">
      <path
        d="M23.5 5.38 A13 13 0 1 0 23.5 26.62 Z"
        fill="#0052FF"
      />
    </svg>
  )
}
