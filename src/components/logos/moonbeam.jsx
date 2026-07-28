/**
 * Moonbeam — Polkadot's EVM parachain.
 * A crescent moon casting two concentric beams, in brand teal #53CBC9.
 */
export default function MoonbeamLogo({ size = 28, className, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
         xmlns="http://www.w3.org/2000/svg" className={className} style={style}
         role="img" aria-label="Moonbeam logo">
      {/* crescent: outer left semicircle, inner ellipse edge */}
      <path
        d="M16 4.5A11.5 11.5 0 1 0 16 27.5A6.8 11.5 0 1 1 16 4.5Z"
        fill="#53CBC9"
      />
      {/* beams */}
      <path
        d="M20.5 8.5A10 10 0 0 1 20.5 23.5"
        stroke="#53CBC9" strokeWidth="2.1" strokeLinecap="round" opacity="0.8"
      />
      <path
        d="M25.5 12A6.4 6.4 0 0 1 25.5 20"
        stroke="#53CBC9" strokeWidth="2.1" strokeLinecap="round" opacity="0.5"
      />
    </svg>
  )
}
