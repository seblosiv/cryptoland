/**
 * Oasys — Japanese gaming L1.
 * A stylised "O" built from angular segments (octagonal ring) around a solid
 * oasis droplet, in brand blue #0F62FE.
 */
export default function OasysLogo({ size = 28, className, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
         xmlns="http://www.w3.org/2000/svg" className={className} style={style}
         role="img" aria-label="Oasys logo">
      <polygon
        points="27.1,20.6 20.6,27.1 11.4,27.1 4.9,20.6 4.9,11.4 11.4,4.9 20.6,4.9 27.1,11.4"
        stroke="#0F62FE" strokeWidth="3.2" strokeLinejoin="round"
      />
      <polygon points="16,10.4 21.6,16 16,21.6 10.4,16" fill="#0F62FE" />
    </svg>
  )
}
