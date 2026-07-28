/**
 * Tezos — the tez sign "ꜩ" drawn geometrically: a vertical stem that hooks
 * right at the foot, a crossbar, and the diagonal stroke through the stem.
 * Brand blue #2C7DF7.
 */
export default function TezosLogo({ size = 28, className, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
         xmlns="http://www.w3.org/2000/svg" className={className} style={style}
         role="img" aria-label="Tezos logo">
      <g stroke="#2C7DF7" strokeWidth="2.8" strokeLinecap="round"
         strokeLinejoin="round" fill="none">
        {/* stem + foot hook */}
        <path d="M15 3.5 V20 a5.5 5.5 0 0 0 6.8 5.3" />
        {/* crossbar */}
        <path d="M8.8 11 H21.6" />
        {/* diagonal through the stem */}
        <path d="M9.2 25.5 L18.4 13.2" />
      </g>
    </svg>
  )
}
