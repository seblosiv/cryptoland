/**
 * Beam — Merit Circle's gaming chain. Official brand mark: a hollow chevron
 * triangle with an inner apex triangle, crossed by four light beams.
 * Monochrome — real path data, badge circle removed, the original's colour
 * separation re-expressed as opacity on currentColor.
 */
export default function BeamLogo({ size = 28, className, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 47 47" fill="none"
         xmlns="http://www.w3.org/2000/svg" className={className} style={style}
         role="img" aria-label="Beam logo">
      <g fillRule="evenodd" transform="translate(4.1228 6.1842)">
        <polygon
          points="19.267 22.103 27.137 22.103 19.269 8.4701 19.269 8.4717 19.269 0.2084 34.689 26.49 19.267 26.49"
          fill="currentColor"
        />
        <polygon
          points="19.266 22.103 19.267 26.49 3.8436 26.49 19.264 0.2084 19.265 8.4717 19.264 8.4701 11.396 22.103"
          fill="currentColor" opacity="0.7"
        />
        <polygon
          points="19.267 11.854 24.145 20.51 19.267 20.501"
          fill="currentColor"
        />
        <polygon
          points="19.267 11.854 19.267 20.501 14.388 20.51"
          fill="currentColor" opacity="0.7"
        />
        <polygon
          points="0.2239 9.1789 19.267 17.048 19.267 18.149 0.2239 13.428"
          fill="currentColor" opacity="0.4"
        />
        <polygon
          points="38.309 5.879 19.267 17.048 19.267 17.35 38.309 9.4936"
          fill="currentColor" opacity="0.45"
        />
        <polygon
          points="38.309 9.6452 19.267 17.368 19.267 17.835 38.309 12.956"
          fill="currentColor" opacity="0.5"
        />
        <polygon
          points="38.294 16.733 19.267 18.148 19.267 17.835 38.294 13.113"
          fill="currentColor" opacity="0.25"
        />
      </g>
    </svg>
  )
}
