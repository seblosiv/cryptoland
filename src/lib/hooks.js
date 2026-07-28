import { useState, useEffect } from 'react'

export function useIsMobile(breakpoint = 640) {
  return useMediaMax(breakpoint)
}

/**
 * True below 1600px — a laptop, not a phone.
 *
 * The HUD stat strip has to share the top bar with a fixed, centred, 360px
 * search field. Between 640 and 1600 there is room for the strip but not for
 * all six cells, so they were clipped mid-glyph ("21…", "~2.4…") with the
 * scrollbar hidden, i.e. no way to tell anything was missing. Below this width
 * the two cells that carry no traction (a constant tile size, and a percentage
 * that reads 0.0001%) are dropped so the ones a reviewer cares about — sold,
 * volume, owners — stay whole.
 */
export function useIsNarrow(breakpoint = 1600) {
  return useMediaMax(breakpoint)
}

function useMediaMax(breakpoint) {
  const [matches, setMatches] = useState(() => window.innerWidth < breakpoint)

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const handler = (e) => setMatches(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [breakpoint])

  return matches
}
