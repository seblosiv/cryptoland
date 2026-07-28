/**
 * BNB Chain — the four-diamond cluster.
 * A centre diamond with four satellites at N/E/S/W, separated by thin gaps.
 */
export default function BnbLogo({ size = 28, className, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
         xmlns="http://www.w3.org/2000/svg" className={className} style={style}
         role="img" aria-label="BNB Chain logo">
      <g fill="#F0B90B">
        <polygon points="16,3.9 19.5,7.4 16,10.9 12.5,7.4" />
        <polygon points="24.6,12.5 28.1,16 24.6,19.5 21.1,16" />
        <polygon points="16,21.1 19.5,24.6 16,28.1 12.5,24.6" />
        <polygon points="7.4,12.5 10.9,16 7.4,19.5 3.9,16" />
        <polygon points="16,11.8 20.2,16 16,20.2 11.8,16" />
      </g>
    </svg>
  )
}
