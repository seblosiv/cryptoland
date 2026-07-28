/**
 * ChainStatus — live chain-head badge
 * ====================================
 * A quiet inline badge showing the CURRENT head of the chain this build
 * targets, read from that chain's own RPC (see src/lib/chainStatus.js). It is
 * the one element on screen a reviewer can verify independently: open that
 * chain's explorer, compare the number, watch both advance.
 *
 * Rules it obeys:
 *  - Renders NOTHING when the read fails. No zero state, no "connecting…",
 *    no error text. An honest absence beats a fabricated number.
 *  - Never blocks first paint: the fetch is fired from an effect, after paint,
 *    and the badge simply appears once (if) real data lands.
 *  - Refreshes every 30s and clears its timer on unmount. Skips ticks while
 *    the tab is hidden — a backgrounded tab has no one to show a number to.
 *  - Tolerates a BLIP but not staleness. Public RPCs occasionally drop a
 *    single request (rate limits, a flaky hop). Blanking the badge on the
 *    first miss makes a working chain look broken — observed live against
 *    Base. So a good reading survives up to MAX_MISSES consecutive failures
 *    (~90s) and is then dropped, because a height that stopped advancing is
 *    no longer evidence of a live connection. The number shown is always one
 *    genuinely read from the chain; it is never carried past that window.
 *
 * Styling is deliberately minimal and reuses the existing `.live-dot` class;
 * the only per-chain visual is the accent colour, matching the rest of the
 * presentation layer.
 */

import { useEffect, useRef, useState } from 'react'
import { fetchChainStatus, formatHeight } from '../lib/chainStatus.js'

const ACCENT = 'var(--chain-accent, var(--green))'
const REFRESH_MS = 30_000
/** Consecutive failed refreshes tolerated before the badge is withdrawn. */
const MAX_MISSES = 3

export default function ChainStatus({ style }) {
  const [status, setStatus] = useState(null)
  const misses = useRef(0)

  useEffect(() => {
    let alive = true

    const tick = async () => {
      // Nothing to update for a hidden tab; the next visible tick refreshes it.
      if (typeof document !== 'undefined' && document.hidden) return
      // fetchChainStatus never rejects; .catch is pure belt-and-braces.
      const next = await fetchChainStatus().catch(() => null)
      if (!alive) return
      if (next?.ok) {
        misses.current = 0
        setStatus(next)
      } else if (++misses.current >= MAX_MISSES) {
        // Too stale to call it live any more — withdraw it entirely.
        setStatus(null)
      }
    }

    tick()
    const timer = setInterval(tick, REFRESH_MS)

    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  // Failure, or not back yet — render nothing at all.
  if (!status?.ok) return null

  const from = status.extra?.rpcHost
  const title = from
    ? `${status.extra?.chain ?? ''} — live ${status.label.toLowerCase()} ${formatHeight(status.height)}, read from ${from}`.trim()
    : undefined

  return (
    <div
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        padding: '6px 11px',
        borderRadius: 999,
        background: 'var(--s2)',
        border: '1px solid var(--b0)',
        animation: 'fade-in .3s ease',
        ...style,
      }}
    >
      <span className="live-dot" style={{ background: ACCENT }} />
      <span
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 11.5,
          fontWeight: 700,
          letterSpacing: '-0.01em',
          color: ACCENT,
          whiteSpace: 'nowrap',
        }}
      >
        {status.label} #{formatHeight(status.height)}
      </span>
    </div>
  )
}
