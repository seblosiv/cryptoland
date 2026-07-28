/**
 * Injective.
 * Angular prism "I": slanted serif bars and stem, filled with Injective's
 * cyan → blue gradient (#00F2FE → #0082FA).
 */
export default function InjectiveLogo({ size = 28, className, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
         xmlns="http://www.w3.org/2000/svg" className={className} style={style}
         role="img" aria-label="Injective logo">
      <defs>
        <linearGradient id="clnd-injective-grad" x1="4" y1="2" x2="28" y2="30"
                        gradientUnits="userSpaceOnUse">
          <stop stopColor="#00F2FE" />
          <stop offset="1" stopColor="#0082FA" />
        </linearGradient>
      </defs>
      <g fill="url(#clnd-injective-grad)">
        <polygon points="9,3.5 27,3.5 24,9.5 6,9.5" />
        <polygon points="13.5,9.5 22.5,9.5 19.5,22.5 10.5,22.5" />
        <polygon points="8,22.5 26,22.5 23,28.5 5,28.5" />
      </g>
    </svg>
  )
}
