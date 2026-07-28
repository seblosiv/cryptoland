/**
 * Ronin — Sky Mavis gaming chain.
 * Angular katana-guard shield: hexagonal outline with a solid inner core.
 * Brand blue #1273EA.
 */
export default function RoninLogo({ size = 28, className, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
         xmlns="http://www.w3.org/2000/svg" className={className} style={style}
         role="img" aria-label="Ronin logo">
      <polygon
        points="16,2.8 27.2,8.4 27.2,18.4 16,29.2 4.8,18.4 4.8,8.4"
        stroke="#1273EA" strokeWidth="2.2" strokeLinejoin="round"
      />
      <polygon
        points="16,9.6 21.4,12.3 21.4,17.4 16,22.4 10.6,17.4 10.6,12.3"
        fill="#1273EA"
      />
    </svg>
  )
}
