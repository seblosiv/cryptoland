/**
 * Celo — official brand mark.
 * The even-odd glyph: the square with the "C" aperture carved out of it. The
 * yellow backing disc from the source is dropped so the knockout reads.
 */
export default function CeloLogo({ size = 28, className, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 2500 2500" fill="none"
         xmlns="http://www.w3.org/2000/svg" className={className} style={style}
         role="img" aria-label="Celo logo">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="currentColor"
        d="M1949.3,546.2H550.7v1407.7h1398.7v-491.4h-232.1c-80,179.3-260.1,304.1-466.2,304.1c-284.1,0-514.2-233.6-514.2-517.5c0-284,230.1-515.6,514.2-515.6c210.1,0,390.2,128.9,470.2,312.1h228.1V546.2z"
      />
    </svg>
  )
}
