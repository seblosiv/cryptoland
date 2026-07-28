/**
 * Stellar — the classic "orbit" mark: a solid core with two crossing
 * elliptical orbital paths. Stellar's own mark is monochrome black, so it is
 * drawn in #ffffff to survive our near-black surfaces.
 */
export default function StellarLogo({ size = 28, className, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
         xmlns="http://www.w3.org/2000/svg" className={className} style={style}
         role="img" aria-label="Stellar logo">
      <g stroke="#FFFFFF" strokeWidth="1.7" fill="none">
        <ellipse cx="16" cy="16" rx="13.2" ry="5.8" transform="rotate(28 16 16)" />
        <ellipse cx="16" cy="16" rx="13.2" ry="5.8" transform="rotate(-28 16 16)" />
      </g>
      <circle cx="16" cy="16" r="4.3" fill="#FFFFFF" />
    </svg>
  )
}
