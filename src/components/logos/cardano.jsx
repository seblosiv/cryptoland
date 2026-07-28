/**
 * Cardano — the ADA constellation: a centre node with two concentric rings of
 * smaller dots. Brand blue (#0033AD) is too dark for our near-black surface,
 * so the mark is lifted to a lighter blue.
 */
export default function CardanoLogo({ size = 28, className, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
         xmlns="http://www.w3.org/2000/svg" className={className} style={style}
         role="img" aria-label="Cardano logo">
      <g fill="#4A7FE0">
        <circle cx="16" cy="16" r="3" />
        {/* inner ring — 6 nodes */}
        <circle cx="23.5" cy="16" r="1.75" />
        <circle cx="19.75" cy="9.51" r="1.75" />
        <circle cx="12.25" cy="9.51" r="1.75" />
        <circle cx="8.5" cy="16" r="1.75" />
        <circle cx="12.25" cy="22.49" r="1.75" />
        <circle cx="19.75" cy="22.49" r="1.75" />
      </g>
      <g fill="#4A7FE0" opacity="0.8">
        {/* outer ring — 12 nodes */}
        <circle cx="27.88" cy="12.82" r="1.1" />
        <circle cx="24.7" cy="7.3" r="1.1" />
        <circle cx="19.18" cy="4.12" r="1.1" />
        <circle cx="12.82" cy="4.12" r="1.1" />
        <circle cx="7.3" cy="7.3" r="1.1" />
        <circle cx="4.12" cy="12.82" r="1.1" />
        <circle cx="4.12" cy="19.18" r="1.1" />
        <circle cx="7.3" cy="24.7" r="1.1" />
        <circle cx="12.82" cy="27.88" r="1.1" />
        <circle cx="19.18" cy="27.88" r="1.1" />
        <circle cx="24.7" cy="24.7" r="1.1" />
        <circle cx="27.88" cy="19.18" r="1.1" />
      </g>
    </svg>
  )
}
