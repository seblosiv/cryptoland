/**
 * MultiversX — official "X" symbol.
 * Source: MultiversX Media Kit (files.multiversx.com/MultiversX-Media-Kit.zip),
 * "MultiversX Logo/x-dark.svg". Single path, source viewBox preserved; the only
 * change is the solid fill becoming currentColor.
 */
export default function MultiversXLogo({ size = 28, className, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 37" fill="none"
         xmlns="http://www.w3.org/2000/svg" className={className} style={style}
         role="img" aria-label="MultiversX logo">
      <path d="M26.6389 18.408L48.0001 6.93761L44.4089 0L24.8488 7.95166C24.3452 8.15668 23.7868 8.15668 23.2831 7.95166L3.72305 0L0.131836 6.93761L21.493 18.408L0.131836 29.8783L3.72305 36.8159L23.2831 28.8642C23.7868 28.6592 24.3452 28.6592 24.8488 28.8642L44.4089 36.8159L48.0001 29.8783L26.6389 18.408Z" fill="currentColor" />
    </svg>
  )
}
