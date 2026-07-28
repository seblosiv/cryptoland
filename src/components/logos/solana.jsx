/**
 * Solana — three slanted bars, purple → green brand gradient.
 * The middle bar leans the opposite way, as in the official mark.
 */
export default function SolanaLogo({ size = 28, className, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
         xmlns="http://www.w3.org/2000/svg" className={className} style={style}
         role="img" aria-label="Solana logo">
      <defs>
        <linearGradient id="clnd-sol" x1="3" y1="26" x2="29" y2="6"
                        gradientUnits="userSpaceOnUse">
          <stop stopColor="#9945FF" />
          <stop offset="1" stopColor="#14F195" />
        </linearGradient>
      </defs>
      <g fill="url(#clnd-sol)">
        {/* top bar — leans right */}
        <polygon points="7.6,6 29,6 24.4,10.6 3,10.6" />
        {/* middle bar — leans left */}
        <polygon points="3,13.7 24.4,13.7 29,18.3 7.6,18.3" />
        {/* bottom bar — leans right */}
        <polygon points="7.6,21.4 29,21.4 24.4,26 3,26" />
      </g>
    </svg>
  )
}
