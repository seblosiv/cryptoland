/**
 * Base — official symbol ("The Square") from the Base brand kit.
 * Source: github.com/base/brand-kit → logo/TheSquare/Digital/Base_square_black.svg
 * (the brand-kit README labels this file the "Symbol"; the Basemark is the wordmark).
 * Path data verbatim; the single flat fill becomes currentColor.
 */
export default function BaseLogo({ size = 28, className, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1280 1280" fill="none"
         xmlns="http://www.w3.org/2000/svg" className={className} style={style}
         role="img" aria-label="Base logo">
      <path
        d="M0,101.12c0-34.64,0-51.95,6.53-65.28,6.25-12.76,16.56-23.07,29.32-29.32C49.17,0,66.48,0,101.12,0h1077.76c34.63,0,51.96,0,65.28,6.53,12.75,6.25,23.06,16.56,29.32,29.32,6.52,13.32,6.52,30.64,6.52,65.28v1077.76c0,34.63,0,51.96-6.52,65.28-6.26,12.75-16.57,23.06-29.32,29.32-13.32,6.52-30.65,6.52-65.28,6.52H101.12c-34.64,0-51.95,0-65.28-6.52-12.76-6.26-23.07-16.57-29.32-29.32-6.53-13.32-6.53-30.65-6.53-65.28V101.12Z"
        fill="currentColor"
      />
    </svg>
  )
}
