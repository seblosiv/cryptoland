/**
 * SKALE — the angular "S" as three stacked parallelogram segments stepping
 * right-to-left, which is what gives the mark its layered / high-speed read.
 * The brand mark is black, so it is drawn in #ffffff on our dark surfaces.
 */
export default function SkaleLogo({ size = 28, className, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
         xmlns="http://www.w3.org/2000/svg" className={className} style={style}
         role="img" aria-label="SKALE logo">
      <g fill="#FFFFFF">
        <polygon points="11,4.5 27,4.5 23.5,10 7.5,10" />
        <polygon points="9,12.5 25,12.5 21.5,18 5.5,18" />
        <polygon points="7,20.5 23,20.5 19.5,26 3.5,26" />
      </g>
    </svg>
  )
}
