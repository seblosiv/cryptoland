/**
 * Base — the official Base symbol: a disc with a flat left edge and a
 * horizontal slot carved out of it. One closed path, so the slot reads as
 * negative space with the default nonzero fill rule (no fill-rule needed).
 *
 * Replaces the brand-kit "Square" symbol that previously sat here: that mark is
 * a solid rounded square filling the whole viewBox, which in monochrome
 * currentColor inside the round badge in ChainOnboarding renders as a
 * featureless blob. This is the mark wallets and chain lists use for Base, and
 * it survives being reduced to a single-colour silhouette at 28px.
 */
export default function BaseLogo({ size = 28, className, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         xmlns="http://www.w3.org/2000/svg" className={className} style={style}
         role="img" aria-label="Base logo">
      <path
        d="M11.9997 24C18.6273 24 24 18.6274 24 12C24 5.37258 18.6273 0 11.9997 0C5.71161 0 .551636 4.8385 0 11H15.8867V13H0C.551636 19.1615 5.71161 24 11.9997 24Z"
        fill="currentColor"
      />
    </svg>
  )
}
