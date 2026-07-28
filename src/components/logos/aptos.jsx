/**
 * Aptos — outlined circle with the stylised "A": two horizontal bars, the
 * upper one broken by an angular notch. Brand mark is monochrome, so it is
 * drawn white for the near-black UI.
 */
export default function AptosLogo({ size = 28, className, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
         xmlns="http://www.w3.org/2000/svg" className={className} style={style}
         role="img" aria-label="Aptos logo">
      <g stroke="#FFFFFF" strokeWidth="2.2" fill="none">
        <circle cx="16" cy="16" r="12.4" />
        {/* upper bar with the angular notch */}
        <path d="M6.4 12.7 H13.1 L15.5 9.6 L17.9 12.7 H25.6" />
        {/* lower bar */}
        <path d="M6.4 19.6 H25.6" />
      </g>
    </svg>
  )
}
