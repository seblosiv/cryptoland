/**
 * Sui — the water droplet: pointed apex, round belly, in Sui brand blue.
 */
export default function SuiLogo({ size = 28, className, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
         xmlns="http://www.w3.org/2000/svg" className={className} style={style}
         role="img" aria-label="Sui logo">
      <path
        d="M16 2.8 C16 2.8 25.6 14.4 25.6 20 A9.6 9.6 0 0 1 6.4 20 C6.4 14.4 16 2.8 16 2.8 Z"
        fill="#4DA2FF"
      />
      {/* inner highlight — keeps the droplet reading as volume at 28px */}
      <path
        d="M16 8.4 C16 8.4 21.6 15.6 21.6 19.4 A5.6 5.6 0 0 1 10.4 19.4 C10.4 15.6 16 8.4 16 8.4 Z"
        fill="#FFFFFF"
        opacity="0.22"
      />
    </svg>
  )
}
