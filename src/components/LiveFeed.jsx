import { useEffect, useState, useRef } from 'react'
import { useGameStore } from '../store/gameStore'
import { api } from '../lib/api'
import { shortAddr } from '../lib/addr'

function timeAgo(ts) {
  const d = (Date.now() - ts) / 1000
  if (d < 60)   return `${Math.floor(d)}s ago`
  if (d < 3600) return `${Math.floor(d / 60)}m ago`
  return `${Math.floor(d / 3600)}h ago`
}

const TYPE_COLORS = {
  country_war:  '#facc15',
  scarcity:     '#f87171',
  milestone:    '#a78bfa',
  price_surge:  '#34d399',
  streak:       '#fb923c',
  affiliate:    '#60a5fa',
  purchase:     '#4ade80',
}

// Pill label for each signal type shown on hover / as prefix
const TYPE_LABEL = {
  country_war:  'War',
  scarcity:     'Scarcity',
  milestone:    'Milestone',
  price_surge:  'Surge',
  streak:       'Streak',
  affiliate:    'Affiliate',
  purchase:     'Purchase',
}

async function fetchSignals() {
  // api.fetchSignals() carries CHAIN_SCOPE, so a shared backend never streams
  // another chain's owners into this build's ticker.
  try {
    return await api.fetchSignals()
  } catch {
    return []
  }
}

// Seed some purchase signals from local store while first API fetch loads
function seedFromBlocks(blocks) {
  return [...blocks.values()]
    .sort((a, b) => b.purchasedAt - a.purchasedAt)
    .slice(0, 6)
    .map(b => ({
      type:   'purchase',
      icon:   '🌍',
      // shortAddr covers every chain — the old test only shortened 0x…, so on
      // Cardano / Algorand / Radix builds a 58–65 char address was pasted whole
      // into the ticker.
      text:   `${shortAddr(b.owner) || '?'} claimed ${b.country || 'tile'}`,
      sub:    `$${parseFloat(b.price).toFixed(2)}`,
      color:  b.color || '#4ade80',
      ts:     b.purchasedAt,
      weight: 1,
    }))
}

export default function LiveFeed() {
  const blocks = useGameStore(s => s.blocks)
  const [signals, setSignals] = useState(() => seedFromBlocks(blocks))
  const tickerRef = useRef(null)

  // Fetch signals from backend every 30s
  useEffect(() => {
    let active = true
    async function load() {
      const data = await fetchSignals()
      if (active && data.length > 0) setSignals(data)
    }
    load()
    const id = setInterval(load, 30_000)
    return () => { active = false; clearInterval(id) }
  }, [])

  const totalVol = [...blocks.values()].reduce((s, b) => s + parseFloat(b.price || 0), 0)

  // Double the array — CSS ticker animation goes translateX(-50%) so exactly 2× fills seamlessly
  const repeated = signals.length > 0
    ? [...signals, ...signals]
    : []

  // ~22s per signal — keeps a comfortable reading pace
  const duration = Math.max(60, signals.length * 22)

  return (
    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10, height: 'var(--feed-h)' }}>
      <div style={{
        height: '100%', display: 'flex', alignItems: 'center', overflow: 'hidden',
        background: 'var(--s1)',
        borderTop: '1px solid var(--b0)',
        paddingLeft:  `calc(var(--market-w, 0px) + max(0px, var(--sal)))`,
        paddingRight: 'max(0px, var(--sar))',
      }}>

        {/* LIVE badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '0 14px', height: '100%', flexShrink: 0,
          borderRight: '1px solid var(--b0)',
        }}>
          <div className="live-dot" />
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--green)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Live
          </span>
        </div>

        {/* Ticker */}
        <div ref={tickerRef} style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
          <div style={{
            display: 'flex', alignItems: 'center', whiteSpace: 'nowrap',
            animation: `ticker ${duration}s linear infinite`,
          }}>
            {repeated.map((sig, i) => (
              <SignalChip key={`${sig.type}-${i}`} sig={sig} />
            ))}
          </div>
        </div>

        {/* Vol + country war leader summary */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '0 14px', height: '100%', flexShrink: 0,
          borderLeft: '1px solid var(--b0)',
        }}>
          <span className="label">Vol</span>
          <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 11, color: 'var(--t1)', letterSpacing: '-0.01em' }}>
            ${totalVol.toLocaleString('en', { maximumFractionDigits: 0 })}
          </span>
        </div>
      </div>
    </div>
  )
}

function SignalChip({ sig }) {
  const accentColor = TYPE_COLORS[sig.type] || '#9ca3af'

  // Country war signals get a special "scoreboard row" style
  if (sig.type === 'country_war') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 18px', fontSize: 11 }}>
        {/* War label prefix — shown once per group via icon === '🥇' */}
        {sig.icon === '🥇' && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginRight: 3 }}>
            <i style={{ width: 5, height: 5, background: '#facc15', flexShrink: 0 }} />
            <span className="label">Country war</span>
          </span>
        )}
        <span style={{ color: 'var(--t1)', fontWeight: 600 }}>{sig.text}</span>
        <span style={{ color: 'var(--b1)', padding: '0 4px' }}>·</span>
      </span>
    )
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0 14px', fontSize: 11 }}>
      {/* Type mark + label. sig.icon is not drawn: the label already names the
          kind, and for scarcity the icon is a blob picked from the very same
          thresholds as the colour. */}
      <i style={{ width: 5, height: 5, background: accentColor, flexShrink: 0 }} />
      <span className="label" style={{ flexShrink: 0 }}>
        {TYPE_LABEL[sig.type] || sig.type}
      </span>

      {/* Main text */}
      <span style={{ color: 'var(--t2)', fontWeight: 500 }}>{sig.text}</span>

      {/* Sub text */}
      {sig.sub && (
        <>
          <span style={{ color: 'var(--t4)', fontSize: 9 }}>·</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: accentColor, fontWeight: 700 }}>{sig.sub}</span>
        </>
      )}

      {/* Timestamp for purchase signals */}
      {sig.type === 'purchase' && (
        <span style={{ color: 'var(--t4)', fontSize: 9 }}>{timeAgo(sig.ts)}</span>
      )}

      <span style={{ color: 'var(--b1)', padding: '0 4px' }}>·</span>
    </span>
  )
}
