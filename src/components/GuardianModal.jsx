/**
 * GuardianModal — CryptoLand
 * ===========================
 * Full-screen modal for the Guardian Agent system.
 * Three tabs mapping to the three phases:
 *   "deploy"   — Phase 1: deploy / configure guardian
 *   "reports"  — Phase 1: daily activity feed + stats
 *   "profile"  — Phase 3: territory intelligence analysis
 *
 * Raid flow is handled separately in RaidModal.jsx.
 * This component is shown when the user clicks "Deploy Guardian"
 * or the guardian shield button on their owned tile.
 */

import { useState, useEffect } from 'react'
import { useGuardianStore } from '../store/guardianStore'
import { useGameStore } from '../store/gameStore'
import { api } from '../lib/api'

const TABS = [
  { id: 'deploy',  label: 'Guardian' },
  { id: 'reports', label: 'Reports'  },
  { id: 'profile', label: 'Intel'    },
]

export default function GuardianModal() {
  const { guardianModal, closeGuardianModal, personalities, loadPersonalities,
          deployGuardian, removeGuardian, loadReports, loadProfile,
          reportCache, profileCache, loading, error } = useGuardianStore()
  const blocks  = useGameStore(s => s.blocks)
  const myBlocks = useGameStore(s => s.myBlocks)

  const { open, tileKey, tab: initialTab } = guardianModal
  const [tab, setTab]                 = useState(initialTab || 'deploy')
  const [guardian, setGuardian]       = useState(null)
  const [personality, setPersonality] = useState('balanced')
  const [budget, setBudget]           = useState(10)
  const [deploying, setDeploying]     = useState(false)
  const [deployError, setDeployError] = useState(null)
  const [removing, setRemoving]       = useState(false)

  const block = tileKey ? blocks.get(tileKey) : null

  // Load personalities + existing guardian data when modal opens
  useEffect(() => {
    if (!open || !tileKey) return
    setTab(initialTab || 'deploy')
    setDeployError(null)
    loadPersonalities()

    api.fetchGuardian(tileKey)
      .then(g => {
        setGuardian(g)
        setPersonality(g.personality)
        setBudget(g.budget)
      })
      .catch(() => {
        setGuardian(null)
        setPersonality('balanced')
        setBudget(10)
      })
  }, [open, tileKey])

  // Load reports when switching to that tab
  useEffect(() => {
    if (tab === 'reports' && tileKey && guardian) loadReports(tileKey)
  }, [tab, tileKey, guardian])

  // Load profile when switching to intel tab
  useEffect(() => {
    if (tab === 'profile' && tileKey && block) loadProfile(tileKey)
  }, [tab, tileKey, block])

  if (!open) return null

  const reports = reportCache.get(tileKey) ?? []
  const profile = profileCache.get(tileKey) ?? null

  const isMine   = tileKey ? myBlocks.has(tileKey) : false
  const hasGuard = Boolean(guardian)

  async function handleDeploy() {
    if (!tileKey || !block) return
    setDeploying(true)
    setDeployError(null)
    try {
      const g = await deployGuardian({
        tileKey,
        owner:       block.owner,
        personality,
        budget:      parseFloat(budget),
      })
      setGuardian(g)
    } catch (err) {
      setDeployError(err.message)
    } finally {
      setDeploying(false)
    }
  }

  async function handleRemove() {
    if (!tileKey || !block) return
    setRemoving(true)
    try {
      await removeGuardian(tileKey, block.owner)
      setGuardian(null)
    } catch { }
    setRemoving(false)
  }

  const personalityList = Object.entries(personalities)
  const selectedP = personalities[personality] ?? {}

  return (
    <div
      onClick={closeGuardianModal}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480,
          background: 'var(--s1)',
          borderRadius: '20px 20px 0 0',
          maxHeight: '90dvh',
          display: 'flex', flexDirection: 'column',
          animation: 'sheet-up 0.28s cubic-bezier(0.34,1.2,0.64,1)',
        }}
      >
        {/* Drag handle */}
        <div style={{ padding: '12px 0 0', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--s4)' }} />
        </div>

        {/* Header */}
        <div style={{
          padding: '14px 18px 0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10,
              background: hasGuard ? `${selectedP.color ?? 'var(--green)'}20` : 'var(--s3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16,
            }}>
              {hasGuard ? (selectedP.icon ?? '🛡️') : '🛡️'}
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)', letterSpacing: '-0.01em' }}>
                Guardian Agent
              </div>
              <div style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'var(--mono)', marginTop: 1 }}>
                {block?.country ?? tileKey}
              </div>
            </div>
          </div>
          <button
            onClick={closeGuardianModal}
            style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 4 }}
          >×</button>
        </div>

        {/* Guardian status badge */}
        {hasGuard && (
          <div style={{ padding: '10px 18px 0', flexShrink: 0 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', borderRadius: 10,
              background: `${selectedP.color ?? 'var(--green)'}12`,
              border: `1px solid ${selectedP.color ?? 'var(--green)'}25`,
            }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: selectedP.color ?? 'var(--green)',
                animation: 'pulse-dot 2.4s ease-in-out infinite',
              }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: selectedP.color ?? 'var(--green)' }}>
                {selectedP.icon} {selectedP.label ?? guardian.personality} · Level {guardian.level ?? 0}
              </span>
              <span style={{ fontSize: 11, color: 'var(--t3)', marginLeft: 'auto', fontFamily: 'var(--mono)' }}>
                {guardian.xp ?? 0} / {guardian.xp_next ?? 100} XP
              </span>
            </div>
          </div>
        )}

        {/* Tab bar */}
        <div style={{
          padding: '12px 18px 0',
          display: 'flex', gap: 4,
          flexShrink: 0,
          borderBottom: '1px solid var(--b0)',
        }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '7px 14px',
                borderRadius: '8px 8px 0 0',
                border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 600, fontFamily: 'var(--font)',
                background: tab === t.id ? 'var(--s2)' : 'transparent',
                color: tab === t.id ? 'var(--t1)' : 'var(--t3)',
                transition: 'color 0.15s, background 0.15s',
                marginBottom: -1,
                borderBottom: tab === t.id ? '2px solid var(--green)' : '2px solid transparent',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Scrollable tab content */}
        <div style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch', flex: 1, padding: '16px 18px 24px' }}>
          {tab === 'deploy' && (
            <DeployTab
              guardian={guardian}
              isMine={isMine}
              personality={personality}
              setPersonality={setPersonality}
              budget={budget}
              setBudget={setBudget}
              personalityList={personalityList}
              personalities={personalities}
              onDeploy={handleDeploy}
              onRemove={handleRemove}
              deploying={deploying}
              removing={removing}
              deployError={deployError}
            />
          )}
          {tab === 'reports' && (
            <ReportsTab guardian={guardian} reports={reports} loading={loading} />
          )}
          {tab === 'profile' && (
            <ProfileTab profile={profile} loading={loading} />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Deploy Tab (Phase 1) ───────────────────────────────────────────────────────

function DeployTab({
  guardian, isMine,
  personality, setPersonality,
  budget, setBudget,
  personalityList, personalities,
  onDeploy, onRemove,
  deploying, removing, deployError,
}) {
  const selectedP = personalities[personality] ?? {}
  const hasGuard  = Boolean(guardian)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Stats row (if deployed) */}
      {hasGuard && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {[
            ['ATK', guardian.atk?.toFixed(1) ?? '—', '#f87171'],
            ['DEF', guardian.def?.toFixed(1) ?? '—', '#60a5fa'],
            ['$/day', guardian.daily_yield?.toFixed(3) ?? '—', '#4ade80'],
          ].map(([l, v, c]) => (
            <div key={l} style={{
              padding: '12px 8px', borderRadius: 10, textAlign: 'center',
              background: 'var(--s2)',
            }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 17, fontWeight: 700, color: c, letterSpacing: '-0.02em', lineHeight: 1 }}>{v}</div>
              <div className="label" style={{ marginTop: 4 }}>{l}</div>
            </div>
          ))}
        </div>
      )}

      {/* Personality picker */}
      <div>
        <div className="label" style={{ marginBottom: 8 }}>Personality</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {personalityList.map(([key, p]) => (
            <button
              key={key}
              onClick={() => isMine && setPersonality(key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '11px 14px', borderRadius: 12,
                border: `1px solid ${personality === key ? `${p.color}40` : 'var(--b0)'}`,
                background: personality === key ? `${p.color}10` : 'var(--s2)',
                cursor: isMine ? 'pointer' : 'default',
                transition: 'border 0.15s, background 0.15s',
                textAlign: 'left', width: '100%',
              }}
            >
              <span style={{ fontSize: 18, flexShrink: 0 }}>{p.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: personality === key ? p.color : 'var(--t1)' }}>
                  {p.label}
                </div>
                <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2, lineHeight: 1.4 }}>
                  {p.description}
                </div>
              </div>
              {personality === key && (
                <div style={{ width: 18, height: 18, borderRadius: '50%', background: p.color, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#000', fontWeight: 700 }}>✓</div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Budget slider */}
      {isMine && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span className="label">Defense Budget</span>
            <span style={{ fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--green)' }}>${budget}</span>
          </div>
          <input
            type="range" min="1" max="500" step="1"
            value={budget}
            onChange={e => setBudget(Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--green)', cursor: 'pointer' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--t4)' }}>$1 min</span>
            <span style={{ fontSize: 10, color: 'var(--t4)' }}>Higher budget = stronger stats</span>
            <span style={{ fontSize: 10, color: 'var(--t4)' }}>$500 max</span>
          </div>
        </div>
      )}

      {deployError && (
        <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(248,113,113,0.08)', fontSize: 12, color: 'var(--red)' }}>
          {deployError}
        </div>
      )}

      {isMine ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn"
            style={{ flex: 1, opacity: deploying ? 0.6 : 1 }}
            onClick={onDeploy}
            disabled={deploying}
          >
            {deploying ? 'Deploying…' : hasGuard ? '↻ Update Guardian' : '🛡️ Deploy Guardian'}
          </button>
          {hasGuard && (
            <button
              onClick={onRemove}
              disabled={removing}
              style={{
                padding: '0 14px', borderRadius: 12,
                background: 'rgba(248,113,113,0.08)',
                border: '1px solid rgba(248,113,113,0.15)',
                color: 'var(--red)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                opacity: removing ? 0.5 : 1,
              }}
            >
              {removing ? '…' : 'Remove'}
            </button>
          )}
        </div>
      ) : (
        <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--s2)', textAlign: 'center', fontSize: 13, color: 'var(--t3)' }}>
          You must own this tile to deploy a guardian
        </div>
      )}
    </div>
  )
}

// ── Reports Tab (Phase 1) ──────────────────────────────────────────────────────

function ReportsTab({ guardian, reports, loading }) {
  if (!guardian) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', fontSize: 13, color: 'var(--t3)' }}>
        Deploy a guardian first to receive activity reports.
      </div>
    )
  }

  if (loading) return <Spinner />

  if (reports.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', fontSize: 13, color: 'var(--t3)' }}>
        No reports yet — reports generate daily.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {reports.map((r, i) => (
        <div key={i} style={{
          borderRadius: 12,
          background: 'var(--s2)',
          overflow: 'hidden',
        }}>
          {/* Report header */}
          <div style={{
            padding: '10px 13px',
            borderBottom: '1px solid var(--b0)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t1)' }}>
              {i === 0 ? 'Today' : i === 1 ? 'Yesterday' : `${i} days ago`}
            </span>
            <span style={{ fontSize: 10, color: 'var(--t3)', fontFamily: 'var(--mono)' }}>
              Lv.{r.level}
            </span>
          </div>

          {/* Stats */}
          <div style={{ padding: '10px 13px', display: 'flex', gap: 16 }}>
            <StatPill label="Raids repelled" value={r.raids_defended} color="#60a5fa" />
            <StatPill label="Yield earned"   value={`$${r.yield_earned}`} color="#4ade80" />
          </div>

          {/* Events */}
          <div style={{ padding: '0 13px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {r.events.map((ev, j) => (
              <div key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                <span style={{ color: 'var(--t4)', fontSize: 10, marginTop: 2, flexShrink: 0 }}>›</span>
                <span style={{ fontSize: 11, color: 'var(--t2)', lineHeight: 1.5 }}>{ev}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function StatPill({ label, value, color }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 700, color, letterSpacing: '-0.02em' }}>{value}</div>
      <div className="label" style={{ marginTop: 2 }}>{label}</div>
    </div>
  )
}

// ── Profile / Intel Tab (Phase 3) ──────────────────────────────────────────────

function ProfileTab({ profile, loading }) {
  if (loading) return <Spinner />

  if (!profile) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', fontSize: 13, color: 'var(--t3)' }}>
        Loading territory intelligence…
      </div>
    )
  }

  const scoreColor = profile.strategic_score > 70 ? '#4ade80' : profile.strategic_score > 40 ? '#fbbf24' : '#f87171'
  const riskColor  = { Low: '#4ade80', Medium: '#fbbf24', Elevated: '#fb923c', High: '#f87171', Critical: '#e879f9' }[profile.risk_level] ?? '#f87171'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Score */}
      <div style={{
        padding: '16px', borderRadius: 12,
        background: 'var(--s2)',
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', flexShrink: 0,
          background: `conic-gradient(${scoreColor} ${profile.strategic_score * 3.6}deg, var(--s4) 0)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%',
            background: 'var(--s2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column',
          }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 800, color: scoreColor, lineHeight: 1 }}>{profile.strategic_score}</span>
            <span style={{ fontSize: 8, color: 'var(--t3)', letterSpacing: '0.05em' }}>/ 99</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginBottom: 4 }}>Strategic Score</div>
          <div style={{ fontSize: 11, color: 'var(--t2)', lineHeight: 1.55 }}>
            {profile.analysis_note}
          </div>
        </div>
      </div>

      {/* Tags */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {profile.tags.map(tag => (
          <span key={tag} style={{
            padding: '4px 10px', borderRadius: 99,
            background: 'var(--s3)', fontSize: 11, color: 'var(--t2)', fontWeight: 500,
          }}>{tag}</span>
        ))}
        <span style={{
          padding: '4px 10px', borderRadius: 99,
          background: 'var(--s3)', fontSize: 11, color: 'var(--t2)', fontWeight: 500,
        }}>{profile.climate_zone}</span>
      </div>

      {/* Metrics grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <MetricCard label="Risk Level"    value={profile.risk_level}     color={riskColor} />
        <MetricCard label="Nearby Owned"  value={`${profile.nearby_owned} tiles`} color="var(--t2)" />
        <MetricCard label="Suggested Rent" value={`$${profile.rent_suggested}/day`} color="#4ade80" />
        <MetricCard label="Best Ad Sector" value={profile.ad_sector}     color="var(--t2)" />
      </div>

      {/* Advertising CTA */}
      <div style={{
        padding: '12px 14px', borderRadius: 10,
        background: 'rgba(74,222,128,0.06)',
        border: '1px solid rgba(74,222,128,0.12)',
        fontSize: 12, color: 'var(--t2)', lineHeight: 1.6,
      }}>
        <strong style={{ color: 'var(--green)' }}>Rent your territory</strong>
        {' '}at ${profile.rent_suggested}/day to advertisers in the {profile.ad_sector} sector.
        Deploy a guardian to automatically collect rent while you're away.
      </div>
    </div>
  )
}

function MetricCard({ label, value, color }) {
  return (
    <div style={{ padding: '11px 12px', borderRadius: 10, background: 'var(--s2)' }}>
      <div className="label" style={{ marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: color ?? 'var(--t1)', fontFamily: 'var(--mono)' }}>{value}</div>
    </div>
  )
}

function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        border: '2px solid var(--s4)',
        borderTopColor: 'var(--green)',
        animation: 'spin 0.9s linear infinite',
      }} />
    </div>
  )
}
