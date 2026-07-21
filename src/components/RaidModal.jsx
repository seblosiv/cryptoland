/**
 * RaidModal — CryptoLand Phase 2
 * ================================
 * Lets a guardian owner raid a neighboring tile.
 * Flow:
 *   select   → user picks defender tile + raid budget
 *   resolving → waiting for server
 *   result   → win/loss animation + stats
 *
 * Opened from PurchasePanel when viewing an enemy tile (with guardian).
 * Attacker must have their own guardian deployed.
 */

import { useState } from 'react'
import { useGuardianStore } from '../store/guardianStore'
import { useGameStore } from '../store/gameStore'

export default function RaidModal() {
  const { raidModal, closeRaidModal, performRaid, raidResult, error } = useGuardianStore()
  const blocks = useGameStore(s => s.blocks)

  const { open, attackerKey, step } = raidModal
  const [raidBudget, setRaidBudget] = useState(5)
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState(null)

  if (!open) return null

  const attackerBlock  = attackerKey ? blocks.get(attackerKey) : null
  const defenderKey    = raidModal.defenderKey ?? null
  const defenderBlock  = defenderKey ? blocks.get(defenderKey) : null

  async function handleRaid() {
    if (!attackerKey || !defenderKey) return
    setSubmitting(true)
    setLocalError(null)
    try {
      await performRaid({
        attackerTile: attackerKey,
        defenderTile: defenderKey,
        raidBudget:   parseFloat(raidBudget),
      })
    } catch (err) {
      setLocalError(err.message)
      setSubmitting(false)
    }
  }

  const displayError = localError || error

  return (
    <div
      onClick={closeRaidModal}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.88)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480,
          background: 'var(--s1)',
          borderRadius: '20px 20px 0 0',
          padding: '0 0 max(24px, env(safe-area-inset-bottom))',
          animation: 'sheet-up 0.28s cubic-bezier(0.34,1.2,0.64,1)',
        }}
      >
        {/* Drag handle */}
        <div style={{ padding: '12px 0 0', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--s4)' }} />
        </div>

        {/* Header */}
        <div style={{ padding: '14px 18px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)', letterSpacing: '-0.01em' }}>
              ⚔️ Raid Territory
            </div>
            <div style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'var(--mono)', marginTop: 1 }}>
              Phase 2 · Guardian Mini-game
            </div>
          </div>
          <button
            onClick={closeRaidModal}
            style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 4 }}
          >×</button>
        </div>

        <div style={{ padding: '0 18px 0' }}>
          {step === 'select' && (
            <SelectStep
              attackerBlock={attackerBlock}
              attackerKey={attackerKey}
              defenderBlock={defenderBlock}
              defenderKey={defenderKey}
              raidBudget={raidBudget}
              setRaidBudget={setRaidBudget}
              onRaid={handleRaid}
              submitting={submitting}
              error={displayError}
            />
          )}
          {step === 'resolving' && <ResolvingStep />}
          {step === 'result' && raidResult && (
            <ResultStep result={raidResult} onClose={closeRaidModal} />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Select Step ────────────────────────────────────────────────────────────────

function SelectStep({ attackerBlock, attackerKey, defenderBlock, defenderKey, raidBudget, setRaidBudget, onRaid, submitting, error }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Combatants */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 10, alignItems: 'center' }}>
        <TileCard label="Your tile" tileKey={attackerKey} block={attackerBlock} color="var(--green)" />
        <div style={{ fontSize: 20, textAlign: 'center', color: 'var(--t3)', userSelect: 'none' }}>⚔</div>
        <TileCard label="Target" tileKey={defenderKey} block={defenderBlock} color="#f87171" />
      </div>

      {/* Budget */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span className="label">Raid Budget</span>
          <span style={{ fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 700, color: '#f87171' }}>${raidBudget}</span>
        </div>
        <input
          type="range" min="1" max="200" step="1"
          value={raidBudget}
          onChange={e => setRaidBudget(Number(e.target.value))}
          style={{ width: '100%', accentColor: '#f87171', cursor: 'pointer' }}
        />
        <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 4 }}>
          Higher budget increases your attack power but is staked on the raid.
        </div>
      </div>

      {error && (
        <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(248,113,113,0.08)', fontSize: 12, color: 'var(--red)' }}>
          {error}
        </div>
      )}

      <button
        className="btn"
        style={{ width: '100%', background: '#f871711a', color: '#f87171', border: '1px solid #f8717130', opacity: submitting ? 0.6 : 1 }}
        onClick={onRaid}
        disabled={submitting || !defenderKey}
      >
        {submitting ? 'Preparing raid…' : '⚔️ Execute Raid'}
      </button>

      <p style={{ fontSize: 11, color: 'var(--t3)', textAlign: 'center' }}>
        Your guardian earns XP win or lose. Defender also earns XP.
      </p>
    </div>
  )
}

function TileCard({ label, tileKey, block, color }) {
  return (
    <div style={{
      padding: '10px', borderRadius: 10,
      background: 'var(--s2)',
      border: `1px solid ${color}20`,
      textAlign: 'center',
    }}>
      <div className="label" style={{ marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 700, color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {block?.country ?? (tileKey ?? 'None')}
      </div>
      <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 3, fontFamily: 'var(--mono)' }}>
        {tileKey ?? '—'}
      </div>
    </div>
  )
}

// ── Resolving Step ─────────────────────────────────────────────────────────────

function ResolvingStep() {
  return (
    <div style={{ padding: '48px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <div style={{
        width: 52, height: 52, borderRadius: '50%',
        border: '2px solid var(--s4)',
        borderTopColor: '#f87171',
        animation: 'spin 0.7s linear infinite',
      }} />
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t2)' }}>Resolving raid…</div>
      <div style={{ fontSize: 11, color: 'var(--t3)' }}>Guardian combat in progress</div>
    </div>
  )
}

// ── Result Step ────────────────────────────────────────────────────────────────

function ResultStep({ result, onClose }) {
  const won = result.attacker_wins

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 8 }}>
      {/* Outcome banner */}
      <div style={{
        padding: '20px 16px',
        borderRadius: 14,
        background: won ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.08)',
        border: `1px solid ${won ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)'}`,
        textAlign: 'center',
        animation: 'scale-in 0.3s cubic-bezier(0.34,1.05,0.64,1)',
      }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>{won ? '🏆' : '💀'}</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: won ? 'var(--green)' : 'var(--red)', letterSpacing: '-0.02em' }}>
          {won ? 'Raid Successful' : 'Raid Failed'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 6, lineHeight: 1.5 }}>
          {result.message}
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <StatBox label="Your ATK Roll" value={result.atk_roll?.toFixed(1)} color="#f87171" />
        <StatBox label="Def Roll"      value={result.def_roll?.toFixed(1)}  color="#60a5fa" />
        <StatBox label="Yield Stolen"  value={`$${result.yield_stolen?.toFixed(3)}`} color={won ? '#4ade80' : 'var(--t3)'} />
        <StatBox label="XP Gained"     value={`+${result.attacker_xp_gain}`} color="#a78bfa" />
      </div>

      <button className="btn" style={{ width: '100%' }} onClick={onClose}>
        Done
      </button>
    </div>
  )
}

function StatBox({ label, value, color }) {
  return (
    <div style={{ padding: '11px 12px', borderRadius: 10, background: 'var(--s2)' }}>
      <div className="label" style={{ marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color, fontFamily: 'var(--mono)', letterSpacing: '-0.02em' }}>{value}</div>
    </div>
  )
}
