import { useEffect, useState, useRef, useCallback } from 'react'
import { usePriceStore } from '../store/priceStore'
import { useIsMobile } from '../lib/hooks'
import { useGameStore } from '../store/gameStore'
import { API_BASE, api } from '../lib/api'

const PANEL_W = 260

// ── Severity → visual weight ──────────────────────────────────────────────────
const SEV = {
  high: { bar: 'rgba(255,255,255,0.9)', bg: 'rgba(255,255,255,0.07)', border: 'rgba(255,255,255,0.18)', text: 'rgba(255,255,255,0.95)' },
  med:  { bar: 'rgba(255,255,255,0.45)', bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.09)', text: 'rgba(255,255,255,0.75)' },
  low:  { bar: 'rgba(255,255,255,0.18)', bg: 'transparent', border: 'rgba(255,255,255,0.05)', text: 'rgba(255,255,255,0.5)' },
}

// Game signal type accent colors
const SIG_COLOR = {
  country_war:  '#facc15',
  scarcity:     '#f87171',
  milestone:    '#a78bfa',
  price_surge:  '#34d399',
  streak:       '#fb923c',
  affiliate:    '#60a5fa',
  purchase:     '#4ade80',
}

function timeAgo(ts) {
  if (!ts) return ''
  try {
    const mins = Math.floor((Date.now() - new Date(ts)) / 60000)
    if (mins < 2) return 'now'
    if (mins < 60) return `${mins}m`
    return `${Math.floor(mins/60)}h`
  } catch { return '' }
}

// ── Delta badge ───────────────────────────────────────────────────────────────
function Delta({ value }) {
  if (value === null || value === undefined || value === 0) return null
  const up = value > 0
  return (
    <span style={{
      fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 800,
      color: up ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.4)',
      background: up ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)',
      border: `1px solid ${up ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.07)'}`,
      borderRadius: 3, padding: '1px 5px', flexShrink: 0,
      letterSpacing: '-0.01em',
    }}>
      {up ? '▲' : '▼'} {Math.abs(value).toFixed(0)}%
    </span>
  )
}

const MEDALS = ['🥇', '🥈', '🥉']

// ── Country War scoreboard row ────────────────────────────────────────────────
function WarRow({ sig, rank }) {
  const color = '#facc15'
  const medal = MEDALS[rank] ?? null
  const isTop3 = rank < 3
  const gaining = sig.sub && sig.sub.includes('+')

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 7,
      padding: '6px 10px',
      background: isTop3 ? `rgba(250,204,21,${0.06 - rank * 0.015})` : 'transparent',
      borderBottom: '1px solid rgba(250,204,21,0.07)',
      borderLeft: isTop3 ? `2px solid rgba(250,204,21,${0.5 - rank * 0.13})` : '2px solid transparent',
    }}>
      <span style={{ fontSize: isTop3 ? 13 : 10, width: 18, textAlign: 'center', flexShrink: 0, lineHeight: 1 }}>
        {medal ?? <span style={{ fontSize: 9, color: 'rgba(250,204,21,0.3)', fontFamily: 'var(--mono)' }}>{rank + 1}</span>}
      </span>
      <span style={{ fontSize: 14, flexShrink: 0, lineHeight: 1 }}>{sig.icon}</span>
      <span style={{
        flex: 1, minWidth: 0,
        fontSize: isTop3 ? 11 : 10, fontWeight: isTop3 ? 700 : 500,
        color: isTop3 ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.55)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{sig.text}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <span style={{
          fontSize: 10, fontWeight: 800, fontFamily: 'var(--mono)',
          color: isTop3 ? '#facc15' : 'rgba(250,204,21,0.4)',
        }}>{sig.sub}</span>
        {gaining && (
          <span style={{
            fontSize: 8, fontWeight: 900, color: '#4ade80',
            background: 'rgba(74,222,128,0.12)', borderRadius: 3, padding: '1px 4px',
          }}>+</span>
        )}
      </div>
    </div>
  )
}

// ── Country War header card ───────────────────────────────────────────────────
function WarCard({ signals }) {
  if (!signals.length) return null
  return (
    <div style={{
      borderRadius: 10, overflow: 'hidden',
      border: '1px solid rgba(250,204,21,0.18)',
      background: 'rgba(250,204,21,0.04)',
      marginBottom: 4,
    }}>
      <div style={{
        padding: '7px 10px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(250,204,21,0.08)',
        borderBottom: '1px solid rgba(250,204,21,0.12)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11 }}>⚔️</span>
          <span style={{ fontSize: 9, fontWeight: 900, color: '#facc15', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Country War
          </span>
        </div>
        <span style={{ fontSize: 8, fontFamily: 'var(--mono)', color: 'rgba(250,204,21,0.5)', fontWeight: 700 }}>LIVE</span>
      </div>
      {signals.map((s, i) => <WarRow key={i} sig={s} rank={i} />)}
    </div>
  )
}

// ── Scarcity fire alarm ───────────────────────────────────────────────────────
function ScarcityAlarm({ sig, onBuyNow }) {
  // Single-row, no per-card CTA. The aggregate panel header carries the
  // single "Explore market" button instead — avoids visual screaming.
  return (
    <div
      onClick={onBuyNow}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 10px',
        marginBottom: 4,
        borderRadius: 10,
        background: 'rgba(248,113,113,0.06)',
        border: '1px solid rgba(248,113,113,0.16)',
        cursor: 'pointer',
        transition: 'background 0.15s ease',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(248,113,113,0.10)'}
      onMouseLeave={e => e.currentTarget.style.background = 'rgba(248,113,113,0.06)'}
    >
      <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>{sig.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 11, fontWeight: 600,
          color: 'rgba(252,165,165,0.95)', lineHeight: 1.35,
          overflow: 'hidden', textOverflow: 'ellipsis',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>
          {sig.text}
        </div>
      </div>
      <span style={{ fontSize: 10, color: 'rgba(248,113,113,0.55)', flexShrink: 0, fontWeight: 700 }}>→</span>
    </div>
  )
}

// ── Standard game signal card ─────────────────────────────────────────────────
function GameCard({ sig, flash }) {
  const color = SIG_COLOR[sig.type] || '#9ca3af'

  return (
    <div style={{
      display: 'flex', gap: 9, padding: '7px 0',
      borderBottom: `1px solid ${color}18`,
      animation: flash ? 'alert-flash 0.5s ease' : 'none',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0, width: 20 }}>
        <div style={{ width: 2, height: 22, borderRadius: 1, background: color, opacity: 0.7, flexShrink: 0 }} />
        <span style={{ fontSize: 12, lineHeight: 1 }}>{sig.icon}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 5, marginBottom: sig.sub ? 2 : 0 }}>
          <span style={{
            fontSize: 10, fontWeight: 700,
            color: 'rgba(255,255,255,0.88)',
            lineHeight: 1.35,
            overflow: 'hidden',
            display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            textOverflow: 'ellipsis',
          }}>
            {sig.text}
          </span>
        </div>
        {sig.sub && (
          <div style={{ fontSize: 8, fontFamily: 'var(--mono)', color: `${color}99`, lineHeight: 1.4, fontWeight: 700 }}>
            {sig.sub}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Market/weather alert card ─────────────────────────────────────────────────
function AlertCard({ alert, flash }) {
  const sev = SEV[alert.severity] || SEV.low
  const isNews = alert.type === 'news'
  const ago = isNews ? timeAgo(alert.pub_date) : null

  return (
    <div style={{
      display: 'flex', gap: 9, padding: '8px 0',
      borderBottom: '1px solid rgba(255,255,255,0.045)',
      animation: flash ? 'alert-flash 0.5s ease' : 'none',
      transition: 'opacity 0.3s',
    }}>
      {/* Left: severity bar + icon */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0, width: 20 }}>
        <div style={{
          width: 2, height: isNews ? 10 : 28, borderRadius: 1,
          background: sev.bar, flexShrink: 0,
        }} />
        <span style={{ fontSize: isNews ? 9 : 11, lineHeight: 1 }}>{alert.icon}</span>
      </div>

      {/* Right: content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 5, marginBottom: isNews ? 0 : 2 }}>
          <span style={{
            fontSize: 10, fontWeight: isNews ? 400 : 700,
            color: sev.text, lineHeight: 1.35,
            overflow: 'hidden',
            display: '-webkit-box', WebkitLineClamp: isNews ? 2 : 1,
            WebkitBoxOrient: 'vertical',
            textOverflow: 'ellipsis',
            letterSpacing: isNews ? 'normal' : '0.01em',
          }}>
            {alert.headline}
          </span>
          <Delta value={alert.delta} />
        </div>
        {!isNews && alert.subline && (
          <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)', lineHeight: 1.4 }}>
            {alert.subline}
          </div>
        )}
        {isNews && (
          <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.2)', marginTop: 2, display: 'flex', gap: 5 }}>
            <span>{alert.subline}</span>
            {ago && <span>· {ago}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Section divider ───────────────────────────────────────────────────────────
function Divider({ label, color }) {
  return (
    <div style={{
      fontSize: 7, fontWeight: 900,
      color: color ? `${color}70` : 'rgba(255,255,255,0.18)',
      textTransform: 'uppercase', letterSpacing: '0.16em',
      padding: '10px 0 4px',
      borderTop: `1px solid ${color ? `${color}20` : 'rgba(255,255,255,0.05)'}`,
      marginTop: 2,
    }}>{label}</div>
  )
}

// ── Live dot ──────────────────────────────────────────────────────────────────
function LiveDot({ active }) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: 6, height: 6, flexShrink: 0 }}>
      {active && <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(255,255,255,0.3)', animation: 'ping 2s ease infinite' }} />}
      <span style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '50%', background: active ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.2)' }} />
    </span>
  )
}

async function fetchGameSignals() {
  // Scoped — see api.CHAIN_SCOPE.
  try {
    return await api.fetchSignals()
  } catch { return [] }
}

// ── Main sidebar ──────────────────────────────────────────────────────────────
export default function MarketSidebar() {
  const isMobile        = useIsMobile()
  const events          = usePriceStore(s => s.events)
  const loading         = usePriceStore(s => s.loading)
  const lastFetched     = usePriceStore(s => s.lastFetched)
  const loadEvents      = usePriceStore(s => s.loadEvents)
  const openPurchaseModal = useGameStore(s => s.openPurchaseModal)
  const selectedKey     = useGameStore(s => s.selectedKey)

  const [alerts, setAlerts]         = useState([])
  const [gameSignals, setGameSignals] = useState([])
  const [flashIds, setFlashIds]     = useState(new Set())
  const prevCount                   = useRef(0)

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/alerts`)
      if (!res.ok) return
      const data = await res.json()
      if (data.length > prevCount.current && prevCount.current > 0) {
        const newFlash = new Set(data.slice(0, data.length - prevCount.current).map((_, i) => i))
        setFlashIds(newFlash)
        setTimeout(() => setFlashIds(new Set()), 800)
      }
      prevCount.current = data.length
      setAlerts(data)
    } catch {}
  }, [])

  const refreshGameSignals = useCallback(async () => {
    const data = await fetchGameSignals()
    if (data.length > 0) { setGameSignals(data) }
  }, [])

  useEffect(() => {
    loadEvents(); fetchAlerts(); refreshGameSignals()
    const p = setInterval(() => { const {events:ev}=usePriceStore.getState(); loadEvents(ev.length===0) }, 30_000)
    const a = setInterval(fetchAlerts, 3 * 60_000)
    const g = setInterval(refreshGameSignals, 30_000)
    return () => { clearInterval(p); clearInterval(a); clearInterval(g) }
  }, [loadEvents, fetchAlerts, refreshGameSignals])

  useEffect(() => {
    const root = document.documentElement
    if (isMobile) root.style.removeProperty('--market-w')
    else root.style.setProperty('--market-w', `${PANEL_W}px`)
    return () => root.style.removeProperty('--market-w')
  }, [isMobile])

  const isLive = lastFetched && Date.now() - lastFetched < 90_000

  // Game signal sections
  const warSignals       = gameSignals.filter(s => s.type === 'country_war')
  const scarcitySignals  = gameSignals.filter(s => s.type === 'scarcity')
  const surgeSignals     = gameSignals.filter(s => s.type === 'price_surge')
  const milestoneSignals = gameSignals.filter(s => s.type === 'milestone')
  const streakSignals    = gameSignals.filter(s => s.type === 'streak')
  const affiliateSignals = gameSignals.filter(s => s.type === 'affiliate')

  // Financial data (capped — shown last, de-emphasized)
  const cryptoAlerts  = alerts.filter(a => ['crypto','trending'].includes(a.type)).slice(0, 2)
  const weatherAlerts = alerts.filter(a => ['weather','attention'].includes(a.type)).slice(0, 3)
  const newsAlerts    = alerts.filter(a => a.type === 'news').slice(0, 3)

  const totalGameSignals = gameSignals.length
  const totalMarketAlerts = alerts.length

  if (isMobile) {
    return <MobileMarket
      alerts={alerts} gameSignals={gameSignals} loading={loading}
      loadEvents={loadEvents} fetchAlerts={fetchAlerts}
      refreshGameSignals={refreshGameSignals}
      isLive={isLive} flashIds={flashIds}
    />
  }

  return (
    <div style={{
      position: 'fixed', left: 0,
      top: 'calc(max(14px, calc(var(--sat) + 10px)) + 42px + 8px)',
      bottom: 'var(--feed-h)',
      width: PANEL_W, zIndex: 15,
      display: 'flex', flexDirection: 'column',
      background: '#0b0d10',
      borderRight: '1px solid rgba(255,255,255,0.06)',
      overflow: 'hidden',
      fontFamily: 'var(--font)',
    }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{
        padding: '7px 13px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <LiveDot active={isLive} />
          <span style={{ fontSize: 9, fontWeight: 900, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>
            Signal Feed
          </span>
          {totalGameSignals > 0 && (
            <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.18)', fontFamily: 'var(--mono)' }}>
              {totalGameSignals + totalMarketAlerts} events
            </span>
          )}
        </div>
        <button
          onClick={() => { loadEvents(true); fetchAlerts(); refreshGameSignals() }}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)', cursor: 'pointer', fontSize: 12, padding: 0, lineHeight: 1 }}
          title="Refresh"
        >{loading ? '…' : '↻'}</button>
      </div>

      {/* ── Scrollable event log ────────────────────────────────────────── */}
      <div style={{
        flex: 1, overflowY: 'auto', overflowX: 'hidden',
        padding: '0 13px 12px',
        scrollbarWidth: 'none',
      }}>

        {totalGameSignals === 0 && totalMarketAlerts === 0 && (
          <div style={{ padding: '32px 0', textAlign: 'center', fontSize: 8, color: 'rgba(255,255,255,0.15)' }}>
            {loading ? 'Connecting…' : 'No signals'}
          </div>
        )}

        {/* ── Country War — live sports leaderboard ─────────────────── */}
        {warSignals.length > 0 && <WarCard signals={warSignals} />}

        {/* ── Scarcity — fire alarm cards ───────────────────────────── */}
        {scarcitySignals.map((s, i) => (
          <ScarcityAlarm key={i} sig={s} onBuyNow={openPurchaseModal} />
        ))}

        {/* ── Price surge ───────────────────────────────────────────── */}
        {surgeSignals.length > 0 && (
          <>
            <Divider label="📈 Surging Now" color="#34d399" />
            {surgeSignals.map((s, i) => <GameCard key={i} sig={s} flash={false} />)}
          </>
        )}

        {/* ── Milestones ────────────────────────────────────────────── */}
        {milestoneSignals.length > 0 && (
          <>
            <Divider label="🎉 Milestones" color="#a78bfa" />
            {milestoneSignals.map((s, i) => <GameCard key={i} sig={s} flash={false} />)}
          </>
        )}

        {/* ── Streaks ───────────────────────────────────────────────── */}
        {streakSignals.length > 0 && (
          <>
            <Divider label="🔥 Land Barons" color="#fb923c" />
            {streakSignals.map((s, i) => <GameCard key={i} sig={s} flash={false} />)}
          </>
        )}

        {/* ── Affiliate leaderboard ─────────────────────────────────── */}
        {affiliateSignals.length > 0 && (
          <>
            <Divider label="🤝 Recruiters" color="#60a5fa" />
            {affiliateSignals.map((s, i) => <GameCard key={i} sig={s} flash={false} />)}
          </>
        )}

        {/* ── Markets (capped at 2, de-emphasized) ─────────────────── */}
        {cryptoAlerts.length > 0 && (
          <>
            <Divider label="Markets" />
            {cryptoAlerts.map((a, i) => <AlertCard key={i} alert={a} flash={false} />)}
          </>
        )}

        {/* ── World events (capped at 3) ────────────────────────────── */}
        {weatherAlerts.length > 0 && (
          <>
            <Divider label="World events · tile price effects" />
            {weatherAlerts.map((a, i) => <AlertCard key={i} alert={a} flash={false} />)}
          </>
        )}

        {/* ── News (capped at 3) ────────────────────────────────────── */}
        {newsAlerts.length > 0 && (
          <>
            <Divider label="News" />
            {newsAlerts.map((a, i) => <AlertCard key={i} alert={a} flash={false} />)}
          </>
        )}
      </div>
    </div>
  )
}

// ── Mobile ────────────────────────────────────────────────────────────────────
function MobileMarket({ alerts, gameSignals, loading, loadEvents, fetchAlerts, refreshGameSignals, isLive, flashIds }) {
  const [open, setOpen] = useState(false)
  const openPurchaseModal = useGameStore(s => s.openPurchaseModal)

  const warSignals       = gameSignals.filter(s => s.type === 'country_war')
  const scarcitySignals  = gameSignals.filter(s => s.type === 'scarcity')
  const surgeSignals     = gameSignals.filter(s => s.type === 'price_surge')
  const milestoneSignals = gameSignals.filter(s => s.type === 'milestone')
  const streakSignals    = gameSignals.filter(s => s.type === 'streak')
  const affiliateSignals = gameSignals.filter(s => s.type === 'affiliate')

  const cryptoAlerts  = alerts.filter(a => ['crypto','trending'].includes(a.type)).slice(0, 2)
  const weatherAlerts = alerts.filter(a => ['weather','attention'].includes(a.type)).slice(0, 3)
  const newsAlerts    = alerts.filter(a => a.type === 'news').slice(0, 3)

  const topScarcity = scarcitySignals[0]
  const topWar      = warSignals[0]
  const topColor    = topScarcity ? '#f87171' : topWar ? '#facc15' : null
  const topIcon     = topScarcity ? topScarcity.icon : topWar ? '⚔️' : null

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed',
          left: 'max(14px, var(--sal))',
          bottom: 'calc(var(--feed-h) + max(12px, var(--sab)))',
          zIndex: 20,
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '0 12px', height: 36,
          background: topScarcity ? 'rgba(248,113,113,0.12)' : 'var(--s2)',
          border: topScarcity ? '1px solid rgba(248,113,113,0.3)' : '1px solid var(--b0)',
          borderRadius: 'var(--r-pill)',
          color: topScarcity ? '#f87171' : 'var(--t2)', fontSize: 11, fontWeight: 700,
          cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
        }}
      >
        <LiveDot active={isLive} />
        <span>Signals</span>
        {topIcon && <span style={{ fontSize: 11 }}>{topIcon}</span>}
      </button>

      {open && <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 24, background: 'rgba(0,0,0,0.65)' }} />}
      {open && (
        <div style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 25,
          maxHeight: '78dvh', display: 'flex', flexDirection: 'column',
          borderRadius: '16px 16px 0 0', background: '#0b0d10',
          animation: 'sheet-up 0.24s cubic-bezier(0.34,1.2,0.64,1)',
        }}>
          <div className="drag-handle" style={{ paddingTop: 8, flexShrink: 0 }} />
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 16px' }}>
            {warSignals.length > 0 && <WarCard signals={warSignals} />}
            {scarcitySignals.map((s, i) => (
              <ScarcityAlarm key={i} sig={s} onBuyNow={() => { setOpen(false); openPurchaseModal() }} />
            ))}
            {surgeSignals.length > 0 && (
              <><Divider label="📈 Surging Now" color="#34d399" />{surgeSignals.map((s,i)=><GameCard key={i} sig={s} flash={false}/>)}</>
            )}
            {milestoneSignals.length > 0 && (
              <><Divider label="🎉 Milestones" color="#a78bfa" />{milestoneSignals.map((s,i)=><GameCard key={i} sig={s} flash={false}/>)}</>
            )}
            {streakSignals.length > 0 && (
              <><Divider label="🔥 Land Barons" color="#fb923c" />{streakSignals.map((s,i)=><GameCard key={i} sig={s} flash={false}/>)}</>
            )}
            {affiliateSignals.length > 0 && (
              <><Divider label="🤝 Recruiters" color="#60a5fa" />{affiliateSignals.map((s,i)=><GameCard key={i} sig={s} flash={false}/>)}</>
            )}
            {cryptoAlerts.length > 0 && (
              <><Divider label="Markets" />{cryptoAlerts.map((a,i)=><AlertCard key={i} alert={a} flash={false}/>)}</>
            )}
            {weatherAlerts.length > 0 && (
              <><Divider label="World events · tile prices" />{weatherAlerts.map((a,i)=><AlertCard key={i} alert={a} flash={false}/>)}</>
            )}
            {newsAlerts.length > 0 && (
              <><Divider label="News" />{newsAlerts.map((a,i)=><AlertCard key={i} alert={a} flash={false}/>)}</>
            )}
          </div>
        </div>
      )}
    </>
  )
}
