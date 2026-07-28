export default function EthereumLogo({ size = 28, className, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         xmlns="http://www.w3.org/2000/svg" className={className} style={style}
         role="img" aria-label="Ethereum logo">
      {/* upper diamond */}
      <path d="M12.056 0L4.69 12.223l7.365 4.354 7.365-4.35L12.056 0z"
            fill="currentColor" />
      {/* lower chevron */}
      <path d="M11.944 17.97L4.58 13.62 11.943 24l7.37-10.38-7.372 4.35h.003z"
            fill="currentColor" opacity="0.55" />
    </svg>
  )
}
