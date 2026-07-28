/**
 * MultiversX — the angular "X" built from two interlocking chevrons, drawn
 * with mitred corners so it keeps the hexagonal feel of the official mark.
 * Brand teal #23F7DD.
 */
export default function MultiversXLogo({ size = 28, className, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
         xmlns="http://www.w3.org/2000/svg" className={className} style={style}
         role="img" aria-label="MultiversX logo">
      {/* left chevron, pointing right */}
      <polygon fill="#23F7DD" points="4,5.5 9,5.5 18.5,16 9,26.5 4,26.5 13.5,16" />
      {/* right chevron, pointing left */}
      <polygon fill="#23F7DD" points="28,5.5 23,5.5 13.5,16 23,26.5 28,26.5 18.5,16" />
    </svg>
  )
}
