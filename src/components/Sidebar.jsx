import { useState, useEffect } from 'react'
import { useGameStore } from '../store/gameStore'
import { api } from '../lib/api'
import { ACTIVE_CHAIN_CANONICAL } from '../lib/blockchain/config.js'
import { useIsMobile } from '../lib/hooks'

const PALETTE = ['#A78BFA','#60A5FA','#34D399','#F472B6','#FB923C','#FBBF24','#38BDF8','#E879F9','#4ADE80','#F87171']

export default function Sidebar() {
  const [open, setOpen]           = useState(false)
  const [countries, setCountries] = useState([])
  const [loading, setLoading]     = useState(false)
  const blocks    = useGameStore(s => s.blocks)
  const soldCount = blocks.size
  const isMobile  = useIsMobile()

  useEffect(() => {
    if (!open) return
    setLoading(true)
    // Scope to this build's chain when several per-chain frontends share one
    // backend — otherwise the leaderboard shows every chain's totals and
    // contradicts this build's own "tiles sold" counter.
    api.fetchCountryStats(import.meta.env.VITE_SCOPE_TO_CHAIN ? ACTIVE_CHAIN_CANONICAL : null)
      .then(d => setCountries(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open])

  const maxBlocks = countries[0]?.blocks ?? 1

  return (
    <>
      {/* Trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed',
          left: 'calc(var(--market-w, 0px) + max(14px, var(--sal)))',
          bottom: 'calc(var(--feed-h) + max(12px, var(--sab)))',
          zIndex: 20,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '0 16px',
          height: 42,
          background: open ? 'var(--green-d)' : 'var(--s2)',
          border: 'none',
          borderRadius: 'var(--r-pill)',
          color: open ? 'var(--green)' : 'var(--t2)',
          fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)',
          cursor: 'pointer',
          transition: 'background 0.15s, color 0.15s',
          boxShadow: 'var(--sh-sm)',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <svg width="14" height="11" viewBox="0 0 14 11" fill="none">
          <rect y="0"   width="14" height="1.5" rx="0.75" fill="currentColor"/>
          <rect y="4.5" width="10" height="1.5" rx="0.75" fill="currentColor"/>
          <rect y="9"   width="14" height="1.5" rx="0.75" fill="currentColor"/>
        </svg>
        Leaderboard
      </button>

      {/* Mobile backdrop */}
      {open && isMobile && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 24, background: 'rgba(0,0,0,0.7)' }}
        />
      )}

      {/* Panel */}
      {open && (
        <div className="panel" style={isMobile ? {
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 25,
          maxHeight: '72dvh', overflowY: 'auto', WebkitOverflowScrolling: 'touch',
          borderRadius: '20px 20px 0 0',
          paddingBottom: 'max(0px, var(--sab))',
          animation: 'sheet-up 0.28s cubic-bezier(0.34,1.2,0.64,1)',
        } : {
          position: 'fixed',
          left: 'calc(var(--market-w, 0px) + max(14px, var(--sal)))',
          bottom: 'calc(var(--feed-h) + 60px)',
          zIndex: 25,
          width: 280, maxHeight: 460, overflowY: 'auto',
          borderRadius: 18,
          animation: 'fade-up 0.2s ease',
        }}>
          {isMobile && <div className="drag-handle" />}

          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 16px',
            borderBottom: '1px solid var(--b0)',
            position: 'sticky', top: 0, zIndex: 1,
            background: 'var(--s1)',
            borderRadius: isMobile ? '20px 20px 0 0' : '18px 18px 0 0',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="live-dot" />
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', letterSpacing: '-0.01em' }}>Top Countries</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4 }}
            >×</button>
          </div>

          {/* Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid var(--b0)' }}>
            {[
              { n: soldCount.toLocaleString(),  l: 'Blocks Sold' },
              { n: new Set([...blocks.values()].map(b=>b.owner)).size, l: 'Owners' },
            ].map(({ n, l }, i) => (
              <div key={l} style={{
                padding: '14px', textAlign: 'center',
                borderRight: i === 0 ? '1px solid var(--b0)' : 'none',
              }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 800, color: 'var(--t1)', letterSpacing: '-0.04em', lineHeight: 1 }}>{n}</div>
                <div className="label" style={{ marginTop: 4 }}>{l}</div>
              </div>
            ))}
          </div>

          {/* Loading */}
          {loading && (
            <div style={{ padding: '32px', display: 'flex', justifyContent: 'center' }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                border: '2px solid var(--s4)',
                borderTopColor: 'var(--green)',
                animation: 'spin 0.9s linear infinite',
              }} />
            </div>
          )}

          {!loading && countries.length === 0 && (
            <div style={{ padding: '28px 16px', textAlign: 'center', fontSize: 13, color: 'var(--t3)' }}>
              No blocks sold yet
            </div>
          )}

          {!loading && countries.map((c, i) => {
            const color = PALETTE[i % PALETTE.length]
            return (
              <div
                key={c.country}
                style={{ padding: '11px 16px', borderBottom: '1px solid var(--b0)', transition: 'background 0.1s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--s2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                      background: 'var(--s3)',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 800,
                      color: i < 3 ? color : 'var(--t3)',
                    }}>{i + 1}</span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
                      {c.country}
                    </span>
                  </div>
                  <span style={{
                    fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--t2)',
                    flexShrink: 0,
                  }}>{c.blocks}</span>
                </div>
                <div style={{ height: 3, borderRadius: 3, background: 'var(--s4)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 3,
                    width: `${(c.blocks / maxBlocks) * 100}%`,
                    background: color, opacity: 0.7,
                    transition: 'width 0.5s ease',
                  }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
