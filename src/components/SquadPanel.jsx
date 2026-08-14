import React, { useEffect, useState } from 'react'
import { useViralStore } from '../store/viralStore'
import { useAuthStore } from '../store/authStore'

/**
 * SquadPanel — Notcoin Squads × Locket 20-friend cap mechanic.
 *
 * Hard ceiling of 6 members. <4 members = -40% yield, ≥4 = +40%.
 * The whole point: pressure friends to recruit, not strangers.
 */

const MAX_MEMBERS = 6
const HEALTHY_MIN = 4

export default function SquadPanel() {
  const open    = useViralStore(s => s.squadPanelOpen)
  const close   = useViralStore(s => s.closeSquadPanel)
  const squad   = useViralStore(s => s.mySquad)
  const lb      = useViralStore(s => s.squadLeaderboard)
  const loading = useViralStore(s => s.squadLoading)
  const error   = useViralStore(s => s.squadError)
  const create  = useViralStore(s => s.createSquad)
  const join    = useViralStore(s => s.joinSquad)
  const leave   = useViralStore(s => s.leaveSquad)
  const load    = useViralStore(s => s.loadMySquad)
  const loadLb  = useViralStore(s => s.loadSquadLeaderboard)
  const authed  = useAuthStore(s => !!s.user)
  const openAuth = useAuthStore(s => s.openAuthModal)

  const [mode, setMode] = useState('none')  // 'none' | 'create' | 'join'
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (open) {
      load()
      loadLb()
    }
  }, [open])

  if (!open) return null

  const handleCreate = async () => {
    if (!name.trim() || busy) return
    setBusy(true)
    const r = await create(name.trim())
    setBusy(false)
    if (r.ok) {
      setName(''); setMode('none')
    }
  }

  const handleJoin = async () => {
    if (!code.trim() || busy) return
    setBusy(true)
    const r = await join(code.trim().toUpperCase())
    setBusy(false)
    if (r.ok) {
      setCode(''); setMode('none')
    }
  }

  const handleLeave = async () => {
    if (busy) return
    if (!window.confirm('Leave squad? Your tile yield bonus will drop and your squad-mates will be angry.')) return
    setBusy(true)
    await leave()
    setBusy(false)
  }

  const copyCode = async () => {
    if (!squad?.code) return
    try {
      await navigator.clipboard.writeText(squad.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {}
  }

  return (
    <div
      onClick={close}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'max(20px, env(safe-area-inset-top)) 20px max(20px, env(safe-area-inset-bottom))',
        overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480,
          background: '#0f0f0f',
          borderRadius: 10,
          padding: 26,
          animation: 'scale-in 0.32s cubic-bezier(0.34,1.05,0.64,1)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{
              fontSize: 10, color: '#6b7280', letterSpacing: '0.18em',
              textTransform: 'uppercase', fontWeight: 600, marginBottom: 6,
            }}>SQUAD YIELD</div>
            <h2 style={{
              fontSize: 24, fontWeight: 800, color: '#fafafa',
              letterSpacing: '-0.03em', lineHeight: 1.05, margin: 0,
            }}>
              {squad ? squad.name : 'No Squad'}
            </h2>
          </div>
          <button
            onClick={close}
            style={{
              width: 32, height: 32, borderRadius: 4,
              background: '#1a1a1a', border: 'none',
              color: '#9ca3af', fontSize: 18, cursor: 'pointer',
            }}
          >×</button>
        </div>

        {!authed && (
          <div style={{
            padding: 20, background: '#141414', borderRadius: 7,
            textAlign: 'center',
          }}>
            <p style={{ color: '#9ca3af', fontSize: 13, lineHeight: 1.55, marginBottom: 14 }}>
              Sign in to form a Squad. Max 6 friends. Below 4 = yield penalty.
            </p>
            <button
              onClick={() => openAuth?.('login')}
              style={{
                width: '100%', height: 44,
                background: '#fafafa', color: '#0a0a0a',
                border: 'none', borderRadius: 6,
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}
            >Sign in</button>
          </div>
        )}

        {authed && !squad && (
          <NoSquadView
            mode={mode} setMode={setMode}
            name={name} setName={setName}
            code={code} setCode={setCode}
            busy={busy}
            error={error}
            onCreate={handleCreate} onJoin={handleJoin}
          />
        )}

        {authed && squad && (
          <SquadView squad={squad} onLeave={handleLeave} onCopy={copyCode} copied={copied} />
        )}

        {/* Leaderboard */}
        {authed && lb && lb.length > 0 && (
          <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid #1f1f1f' }}>
            <div style={{
              fontSize: 10, color: '#6b7280', letterSpacing: '0.16em',
              textTransform: 'uppercase', fontWeight: 600, marginBottom: 10,
            }}>TOP SQUADS</div>
            {lb.slice(0, 5).map((s, i) => (
              <div key={s.squad_id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 0',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    width: 20, height: 20, borderRadius: 3,
                    background: '#141414', color: '#9ca3af',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700,
                  }}>{i + 1}</span>
                  <span style={{ fontSize: 13, color: '#e5e5e5', fontWeight: 500 }}>{s.name}</span>
                  <span style={{ fontSize: 10, color: '#4b5563' }}>· {s.members} member{s.members === 1 ? '' : 's'}</span>
                </div>
                <span style={{
                  fontFamily: 'ui-monospace, monospace', fontSize: 11,
                  color: '#4ade80', fontWeight: 600,
                }}>
                  ${(s.volume || 0).toFixed(0)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sub-views ────────────────────────────────────────────────────────────────

function NoSquadView({ mode, setMode, name, setName, code, setCode, busy, error, onCreate, onJoin }) {
  return (
    <div>
      <p style={{ color: '#9ca3af', fontSize: 13, lineHeight: 1.55, marginBottom: 16 }}>
        A Squad is up to <strong style={{ color: '#fafafa' }}>6 friends</strong>. Members share a daily yield pool.
        Drop below 4 members and yield drops 40%. Keep it tight.
      </p>

      {mode === 'none' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button
            onClick={() => setMode('create')}
            style={{
              height: 48, background: '#fafafa', color: '#0a0a0a',
              border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >Create Squad</button>
          <button
            onClick={() => setMode('join')}
            style={{
              height: 48, background: '#1a1a1a', color: '#fafafa',
              border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >Join with code</button>
        </div>
      )}

      {mode === 'create' && (
        <div>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Squad name…"
            maxLength={30}
            autoFocus
            style={{
              width: '100%', height: 48, marginBottom: 10,
              padding: '0 16px',
              background: '#141414', border: '1px solid #1f1f1f',
              borderRadius: 6, color: '#fafafa', fontSize: 14,
              outline: 'none',
            }}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button
              onClick={() => setMode('none')}
              style={{
                height: 44, background: '#1a1a1a', color: '#9ca3af',
                border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer',
              }}
            >Back</button>
            <button
              disabled={!name.trim() || busy}
              onClick={onCreate}
              style={{
                height: 44,
                background: name.trim() ? '#fafafa' : '#262626',
                color: name.trim() ? '#0a0a0a' : '#6b7280',
                border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 700,
                cursor: name.trim() ? 'pointer' : 'not-allowed',
              }}
            >{busy ? 'Creating…' : 'Create'}</button>
          </div>
        </div>
      )}

      {mode === 'join' && (
        <div>
          <input
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            placeholder="SQ-XXXXXX"
            maxLength={9}
            autoFocus
            style={{
              width: '100%', height: 48, marginBottom: 10,
              padding: '0 16px',
              background: '#141414', border: '1px solid #1f1f1f',
              borderRadius: 6,
              color: '#fafafa', fontSize: 14,
              fontFamily: 'ui-monospace, monospace', letterSpacing: '0.1em',
              outline: 'none',
            }}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button
              onClick={() => setMode('none')}
              style={{
                height: 44, background: '#1a1a1a', color: '#9ca3af',
                border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer',
              }}
            >Back</button>
            <button
              disabled={!code.trim() || busy}
              onClick={onJoin}
              style={{
                height: 44,
                background: code.trim() ? '#fafafa' : '#262626',
                color: code.trim() ? '#0a0a0a' : '#6b7280',
                border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 700,
                cursor: code.trim() ? 'pointer' : 'not-allowed',
              }}
            >{busy ? 'Joining…' : 'Join'}</button>
          </div>
        </div>
      )}

      {error && (
        <div style={{
          marginTop: 12, padding: '10px 14px',
          background: 'rgba(248,113,113,0.08)',
          border: '1px solid rgba(248,113,113,0.2)',
          borderRadius: 5, fontSize: 12, color: '#fca5a5',
        }}>{error}</div>
      )}
    </div>
  )
}

function SquadView({ squad, onLeave, onCopy, copied }) {
  const healthyColor = squad.healthy ? '#4ade80' : '#f87171'
  const bonusPct = Math.round((squad.yield_multiplier - 1) * 100)
  const bonusSign = bonusPct >= 0 ? '+' : ''
  return (
    <div>
      {/* Status / yield */}
      <div style={{
        background: '#141414', borderRadius: 7, padding: 16, marginBottom: 12,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 10, color: '#6b7280', letterSpacing: '0.16em', textTransform: 'uppercase' }}>
            Status
          </span>
          <span style={{
            fontSize: 11, color: healthyColor, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
          }}>
            {squad.healthy ? 'HEALTHY' : 'BELOW QUORUM'}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <Stat label="Members" value={`${squad.member_count}/${MAX_MEMBERS}`} />
          <Stat label="Yield" value={`${bonusSign}${bonusPct}%`} color={healthyColor} />
          <Stat label="Daily pool" value={`$${(squad.pool_daily || 0).toFixed(2)}`} color="#4ade80" />
        </div>
      </div>

      {/* Code share */}
      <button
        onClick={onCopy}
        style={{
          width: '100%',
          background: '#141414', border: '1px solid #1f1f1f',
          borderRadius: 6, padding: '12px 16px',
          marginBottom: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer',
          color: '#fafafa',
        }}
      >
        <span style={{
          fontFamily: 'ui-monospace, monospace', fontSize: 16, fontWeight: 700,
          letterSpacing: '0.08em',
        }}>{squad.code}</span>
        <span style={{
          fontSize: 11, color: copied ? '#4ade80' : '#9ca3af',
          textTransform: 'uppercase', letterSpacing: '0.14em', fontWeight: 600,
        }}>
          {copied ? '✓ COPIED' : 'TAP TO COPY'}
        </span>
      </button>

      {/* Members */}
      <div style={{ marginBottom: 16 }}>
        <div style={{
          fontSize: 10, color: '#6b7280', letterSpacing: '0.16em',
          textTransform: 'uppercase', fontWeight: 600, marginBottom: 8,
        }}>Members</div>
        {squad.members.map(m => (
          <div key={m.user_id} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 0',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>{m.avatar_emoji || '🌍'}</span>
              <span style={{ fontSize: 13, color: '#fafafa', fontWeight: 500 }}>
                {m.username || `user_${m.user_id.slice(0, 6)}`}
              </span>
            </div>
            <span style={{
              fontFamily: 'ui-monospace, monospace', fontSize: 11,
              color: '#9ca3af',
            }}>
              {m.tile_count} tile{m.tile_count === 1 ? '' : 's'} · ${(m.tile_volume || 0).toFixed(2)}
            </span>
          </div>
        ))}
        {/* Empty slots */}
        {Array.from({ length: Math.max(0, HEALTHY_MIN - squad.members.length) }).map((_, i) => (
          <div key={`empty-${i}`} style={{
            padding: '8px 0', color: '#4b5563', fontSize: 12,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 18, opacity: 0.4 }}>⬡</span>
            <span style={{ fontStyle: 'italic' }}>
              Need {HEALTHY_MIN - squad.members.length - i} more for full yield
            </span>
          </div>
        ))}
      </div>

      <button
        onClick={onLeave}
        style={{
          width: '100%', height: 40,
          background: 'transparent', color: '#f87171',
          border: '1px solid rgba(248,113,113,0.2)', borderRadius: 5,
          fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}
      >Leave Squad</button>
    </div>
  )
}

function Stat({ label, value, color = '#fafafa' }) {
  return (
    <div>
      <div style={{
        fontSize: 9, color: '#6b7280', letterSpacing: '0.14em',
        textTransform: 'uppercase', marginBottom: 4,
      }}>{label}</div>
      <div style={{
        fontFamily: 'ui-monospace, monospace', fontSize: 16, fontWeight: 700,
        color,
      }}>{value}</div>
    </div>
  )
}

// ── HUD chip ─────────────────────────────────────────────────────────────────

export function SquadChip() {
  const open    = useViralStore(s => s.openSquadPanel)
  const squad   = useViralStore(s => s.mySquad)
  const load    = useViralStore(s => s.loadMySquad)
  const authed  = useAuthStore(s => !!s.user)

  useEffect(() => {
    if (authed) load()
  }, [authed])

  const label = squad ? `${squad.member_count}/${MAX_MEMBERS}` : 'Join'
  const color = squad
    ? (squad.healthy ? 'var(--green)' : '#f87171')
    : 'var(--t3)'

  return (
    <button
      onClick={open}
      title="Squad Yield"
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
      <span style={{ fontSize: 14, lineHeight: 1 }}>⬢</span>
      <span>Squad</span>
      <span style={{
        color, fontFamily: 'var(--mono)', fontSize: 11,
        fontWeight: 800, letterSpacing: '0.02em',
      }}>{label}</span>
    </button>
  )
}
