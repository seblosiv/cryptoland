import { SITE_HOST } from '../lib/chainProfile.js'
import React, { useEffect, useState, useCallback } from 'react'
import { useViralStore } from '../store/viralStore'
import { useAuthStore } from '../store/authStore'

/**
 * LandDropModal — BeReal × Wordle daily ritual.
 *
 * Each day at a single global UTC time (rotating per date), the drop window
 * opens for 90 seconds. Players choose 1 of 3 mystery tiles. Outcome is a
 * Wordle-style emoji share grid (🎁🟪👑 etc).
 */

function formatMMSS(seconds) {
  const m = Math.max(0, Math.floor(seconds / 60))
  const s = Math.max(0, seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatHHMM(seconds) {
  const h = Math.max(0, Math.floor(seconds / 3600))
  const m = Math.max(0, Math.floor((seconds % 3600) / 60))
  return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`
}

const RARITY_META = {
  common: { color: '#9ca3af', label: 'COMMON',  emoji: '🟩', stamp: '🌍🌍🌍' },
  rare:   { color: '#fbbf24', label: 'RARE',    emoji: '🟨', stamp: '✨✨✨' },
  mythic: { color: '#a78bfa', label: 'MYTHIC',  emoji: '🟪', stamp: '👑👑👑' },
}

export default function LandDropModal() {
  const open       = useViralStore(s => s.dropModalOpen)
  const close      = useViralStore(s => s.closeDropModal)
  const state      = useViralStore(s => s.dropState)
  const claimDrop  = useViralStore(s => s.claimDrop)
  const lastResult = useViralStore(s => s.dropLastResult)
  const claimError = useViralStore(s => s.dropClaimError)
  const loadDrop   = useViralStore(s => s.loadDropState)
  const authUser   = useAuthStore(s => s.user)
  const openAuth   = useAuthStore(s => s.openAuthModal)

  const [now, setNow] = useState(Date.now())
  const [claiming, setClaiming] = useState(false)
  const [copied, setCopied] = useState(false)

  // Live ticking clock
  useEffect(() => {
    if (!open) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [open])

  // Refresh state when modal opens
  useEffect(() => {
    if (open) loadDrop()
  }, [open])

  const onClaim = useCallback(async (idx) => {
    if (!authUser) {
      openAuth?.('login')
      return
    }
    setClaiming(true)
    await claimDrop(idx)
    setClaiming(false)
  }, [authUser, claimDrop, openAuth])

  const onShare = useCallback(async () => {
    if (!lastResult) return
    const text = `🎁 CryptoLand Daily Drop\n${lastResult.share_grid}\nI claimed ${lastResult.country} (${lastResult.rarity}) on ${lastResult.date_utc || state?.date_utc}\nhttps://${SITE_HOST}`
    try {
      if (navigator.share) {
        await navigator.share({ text })
      } else {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch {}
  }, [lastResult, state])

  if (!open) return null

  const status = state?.status
  const secondsToOpen  = Math.max(0, (state?.window_start_ms ?? 0) - now) / 1000
  const secondsToClose = Math.max(0, (state?.window_end_ms ?? 0) - now) / 1000
  const alreadyClaimed = state?.already_claimed
  const tier = state?.founder_tier || 'none'

  return (
    <div
      onClick={close}
      style={{
        position: 'fixed', inset: 0, zIndex: 220,
        background: 'rgba(0,0,0,0.78)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'max(20px, env(safe-area-inset-top)) 20px max(20px, env(safe-area-inset-bottom))',
        overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 440,
          background: '#0f0f0f',
          borderRadius: 22,
          padding: 28,
          animation: 'scale-in 0.32s cubic-bezier(0.34,1.05,0.64,1)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          marginBottom: 20,
        }}>
          <div>
            <div style={{
              fontSize: 10, color: '#6b7280', letterSpacing: '0.18em',
              textTransform: 'uppercase', fontWeight: 600, marginBottom: 6,
            }}>
              DAILY LAND DROP
            </div>
            <h2 style={{
              fontSize: 26, fontWeight: 800, color: '#fafafa',
              letterSpacing: '-0.03em', lineHeight: 1.05, margin: 0,
            }}>
              {status === 'live' && 'Pick a mystery tile'}
              {status === 'upcoming' && 'Drop is coming'}
              {status === 'closed' && 'Drop closed'}
              {!status && 'Loading…'}
            </h2>
          </div>
          <button
            onClick={close}
            aria-label="Close"
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: '#1a1a1a', border: 'none',
              color: '#9ca3af', fontSize: 18, cursor: 'pointer',
            }}
          >×</button>
        </div>

        {/* Tier badge */}
        {authUser && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 999,
            background: '#141414', marginBottom: 16,
            fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
            color: tier === 'founder' ? '#facc15' : tier === 'pioneer' ? '#60a5fa' : '#9ca3af',
            textTransform: 'uppercase',
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />
            {tier === 'none' ? 'SETTLER' : tier} TIER
          </div>
        )}

        {/* Body — depends on status */}
        {alreadyClaimed && !lastResult && (
          <ClaimedView claimed={alreadyClaimed} onShare={onShare} copied={copied} />
        )}

        {lastResult && (
          <ResultView result={lastResult} onShare={onShare} copied={copied} onClose={close} />
        )}

        {!alreadyClaimed && !lastResult && status === 'live' && (
          <PickerView
            secondsLeft={Math.floor(secondsToClose)}
            onClaim={onClaim}
            claiming={claiming}
            error={claimError}
            authed={!!authUser}
            onLogin={() => openAuth?.('login')}
          />
        )}

        {!alreadyClaimed && !lastResult && status === 'upcoming' && (
          <UpcomingView seconds={Math.floor(secondsToOpen)} />
        )}

        {!alreadyClaimed && !lastResult && status === 'closed' && (
          <ClosedView />
        )}

        {/* Footer */}
        <div style={{
          marginTop: 20, paddingTop: 16, borderTop: '1px solid #1f1f1f',
          fontSize: 10, color: '#4b5563',
          letterSpacing: '0.12em', textTransform: 'uppercase',
          textAlign: 'center',
        }}>
          one drop, one chance, one world
        </div>
      </div>
    </div>
  )
}

// ── Sub-views ────────────────────────────────────────────────────────────────

function PickerView({ secondsLeft, onClaim, claiming, error, authed, onLogin }) {
  return (
    <div>
      <div style={{
        background: '#141414',
        borderRadius: 14, padding: '12px 16px',
        marginBottom: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 11, color: '#9ca3af', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Window closes in
        </span>
        <span style={{
          fontFamily: 'ui-monospace, monospace', fontSize: 18, fontWeight: 700,
          color: secondsLeft < 30 ? '#f87171' : '#fafafa',
        }}>
          {formatMMSS(secondsLeft)}
        </span>
      </div>

      <p style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.55, marginBottom: 18 }}>
        Three sealed tiles. One is yours. Higher Founder tier = better odds at <strong style={{ color: '#a78bfa' }}>Mythic</strong>.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 18 }}>
        {[0, 1, 2].map(i => (
          <button
            key={i}
            disabled={claiming}
            onClick={() => onClaim(i)}
            style={{
              aspectRatio: '3 / 4',
              background: '#141414',
              border: '1px solid #1f1f1f',
              borderRadius: 14,
              cursor: claiming ? 'wait' : 'pointer',
              transition: 'all 0.18s ease',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              padding: 14,
            }}
            onMouseOver={(e) => !claiming && (e.currentTarget.style.background = '#1a1a1a')}
            onMouseOut={(e) => (e.currentTarget.style.background = '#141414')}
          >
            <span style={{ fontSize: 42 }}>🎁</span>
            <span style={{
              fontSize: 11, color: '#9ca3af', marginTop: 8,
              letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600,
            }}>
              Tile {i + 1}
            </span>
          </button>
        ))}
      </div>

      {!authed && (
        <button
          onClick={onLogin}
          style={{
            width: '100%', height: 48,
            background: '#fafafa', color: '#0a0a0a',
            border: 'none', borderRadius: 12,
            fontSize: 14, fontWeight: 700, cursor: 'pointer',
            marginBottom: 8,
          }}
        >
          Sign in to claim
        </button>
      )}

      {error && (
        <div style={{
          padding: '10px 14px', background: 'rgba(248,113,113,0.08)',
          border: '1px solid rgba(248,113,113,0.2)',
          borderRadius: 10, fontSize: 12, color: '#fca5a5',
        }}>
          {error}
        </div>
      )}
    </div>
  )
}

function ResultView({ result, onShare, copied, onClose }) {
  const meta = RARITY_META[result.rarity] || RARITY_META.common
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 56, marginBottom: 8 }}>{meta.emoji}</div>
      <div style={{
        fontSize: 10, color: meta.color, letterSpacing: '0.2em',
        fontWeight: 700, marginBottom: 8,
      }}>{meta.label} DROP</div>
      <h3 style={{
        fontSize: 22, fontWeight: 800, color: '#fafafa',
        letterSpacing: '-0.02em', margin: 0, marginBottom: 6,
      }}>
        {result.country}
      </h3>
      <div style={{
        fontFamily: 'ui-monospace, monospace', fontSize: 11,
        color: '#6b7280', letterSpacing: '0.06em', marginBottom: 18,
      }}>tile {result.tile_key}</div>

      <pre style={{
        background: '#141414',
        border: '1px solid #1f1f1f',
        borderRadius: 12,
        padding: '14px 16px',
        fontFamily: 'ui-monospace, monospace',
        fontSize: 26, lineHeight: 1.35, letterSpacing: '0.08em',
        color: '#fafafa', textAlign: 'center', margin: 0, marginBottom: 16,
        whiteSpace: 'pre-wrap',
      }}>{result.share_grid}</pre>

      <button
        onClick={onShare}
        style={{
          width: '100%', height: 48,
          background: '#fafafa', color: '#0a0a0a',
          border: 'none', borderRadius: 12,
          fontSize: 14, fontWeight: 700, cursor: 'pointer',
          marginBottom: 8,
        }}
      >
        {copied ? '✓ Copied to clipboard' : 'Share my drop'}
      </button>
      <button
        onClick={onClose}
        style={{
          width: '100%', height: 44,
          background: '#1a1a1a', color: '#e5e5e5',
          border: 'none', borderRadius: 12,
          fontSize: 13, fontWeight: 500, cursor: 'pointer',
        }}
      >
        Close
      </button>
    </div>
  )
}

function ClaimedView({ claimed, onShare, copied }) {
  const meta = RARITY_META[claimed.rarity] || RARITY_META.common
  return (
    <div style={{ textAlign: 'center', padding: '8px 0' }}>
      <div style={{ fontSize: 48, marginBottom: 10 }}>{meta.emoji}</div>
      <div style={{
        fontSize: 10, color: meta.color, letterSpacing: '0.2em',
        fontWeight: 700, marginBottom: 8,
      }}>YOU ALREADY CLAIMED</div>
      <h3 style={{
        fontSize: 20, fontWeight: 800, color: '#fafafa',
        margin: 0, marginBottom: 6,
      }}>{claimed.country}</h3>
      <div style={{
        fontFamily: 'ui-monospace, monospace', fontSize: 11,
        color: '#6b7280', letterSpacing: '0.06em', marginBottom: 16,
      }}>tile {claimed.tile_key}</div>
      <p style={{ color: '#9ca3af', fontSize: 13, lineHeight: 1.5, marginBottom: 16 }}>
        Come back tomorrow at the same UTC time for a new drop.
      </p>
      <button
        onClick={onShare}
        style={{
          width: '100%', height: 44,
          background: '#1a1a1a', color: '#e5e5e5',
          border: 'none', borderRadius: 12,
          fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}
      >
        {copied ? '✓ Copied' : 'Share again'}
      </button>
    </div>
  )
}

function UpcomingView({ seconds }) {
  return (
    <div style={{ padding: '16px 0' }}>
      <div style={{
        background: '#141414', borderRadius: 14, padding: '18px 18px',
        textAlign: 'center', marginBottom: 14,
      }}>
        <div style={{ fontSize: 10, color: '#9ca3af', letterSpacing: '0.18em', marginBottom: 8 }}>
          DROP OPENS IN
        </div>
        <div style={{
          fontFamily: 'ui-monospace, monospace', fontSize: 36, fontWeight: 700,
          color: '#fafafa', letterSpacing: '-0.02em',
        }}>
          {formatHHMM(seconds)}
        </div>
      </div>
      <p style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.55, textAlign: 'center', margin: 0 }}>
        Every day. Same global moment. 90 seconds. Three tiles. One yours.
      </p>
    </div>
  )
}

function ClosedView() {
  return (
    <div style={{ padding: '16px 0', textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>🌙</div>
      <h3 style={{ fontSize: 18, fontWeight: 700, color: '#fafafa', marginBottom: 8 }}>
        Today's drop has closed
      </h3>
      <p style={{ color: '#9ca3af', fontSize: 13, lineHeight: 1.5 }}>
        Tomorrow's window will open at a different rotating UTC time.
      </p>
    </div>
  )
}

// ── HUD chip ─────────────────────────────────────────────────────────────────

export function LandDropChip() {
  const open  = useViralStore(s => s.openDropModal)
  const state = useViralStore(s => s.dropState)
  const start = useViralStore(s => s.startDropPolling)
  const stop  = useViralStore(s => s.stopDropPolling)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    start()
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => { stop(); clearInterval(t) }
  }, [])

  const status = state?.status
  let label, color = 'var(--t3)'
  if (status === 'live') {
    const left = Math.max(0, Math.floor(((state?.window_end_ms ?? 0) - now) / 1000))
    label = formatMMSS(left)
    color = 'var(--green)'
  } else if (status === 'upcoming') {
    const left = Math.max(0, Math.floor(((state?.window_start_ms ?? 0) - now) / 1000))
    // Compact: "6h" or "47m" rather than "06h 00m"
    label = left > 3600
      ? `${Math.floor(left / 3600)}h`
      : `${Math.floor(left / 60)}m`
    color = '#fbbf24'
  } else if (status === 'closed') {
    label = 'closed'
  } else {
    label = '—'
  }

  const claimed = state?.already_claimed
  return (
    <button
      onClick={open}
      title="Daily LandDrop"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        height: 42, padding: '0 14px',
        background: 'var(--s2)',
        border: '1px solid var(--b0)',
        borderRadius: 'var(--r-pill)',
        color: 'var(--t2)',
        fontSize: 12, fontWeight: 700, fontFamily: 'var(--font)',
        cursor: 'pointer',
        boxShadow: 'var(--sh-sm)',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span style={{ fontSize: 14, lineHeight: 1 }}>{claimed ? '✅' : '🎁'}</span>
      <span>Drop</span>
      <span style={{
        color, fontFamily: 'var(--mono)', fontSize: 11,
        fontWeight: 800, letterSpacing: '0.02em',
      }}>{label}</span>
    </button>
  )
}
