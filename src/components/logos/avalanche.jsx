/**
 * Avalanche — the white "A" peak on the red mark.
 * Big left wedge + detached lower-right triangle: the two shapes read as an
 * "A" with the notch cut out, exactly like the AVAX glyph.
 */
export default function AvalancheLogo({ size = 28, className, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
         xmlns="http://www.w3.org/2000/svg" className={className} style={style}
         role="img" aria-label="Avalanche logo">
      <rect x="0" y="0" width="32" height="32" rx="7" fill="#E84142" />
      <g transform="translate(16 16) scale(0.8) translate(-16 -16)">
        <polygon points="15.4,4.6 20.2,13.2 10.0,27.2 3.0,27.2" fill="#ffffff" />
        <polygon points="23.8,16.6 29.0,27.2 18.6,27.2" fill="#ffffff" />
      </g>
    </svg>
  )
}
