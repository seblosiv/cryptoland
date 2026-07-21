import { useEffect, useState } from 'react'
import { useDAOStore } from '../store/daoStore'
import { useWalletStore } from '../store/walletStore'
import { useIsMobile } from '../lib/hooks'

const C_UP = '#4ade80'
const C_DN = '#f87171'
const C_NE = '#60a5fa'

function timeLeft(endsAt) {
  const ms = endsAt - Date.now()
  if (ms <= 0) return 'Ended'
  const d = Math.floor(ms / 86400000)
  const h = Math.floor((ms % 86400000) / 3600000)
  if (d > 0) return `${d}d ${h}h left`
  return `${h}h left`
}

function ProposalCard({ proposal, onVote, voterAddress }) {
  const total = (proposal.votes_for + proposal.votes_against) || 1
  const forPct = Math.round((proposal.votes_for / total) * 100)
  const against = 100 - forPct
  const passed = forPct > 50

  return (
    <div style={{
      padding: '14px', borderRadius: 12,
      background: 'var(--s2)', border: '1px solid var(--b0)',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {/* Title + status */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', lineHeight: 1.4 }}>
          {proposal.title}
        </div>
        <span style={{
          fontSize: 8, fontWeight: 800, flexShrink: 0,
          color: proposal.status === 'active' ? C_UP : 'var(--t4)',
          background: proposal.status === 'active' ? C_UP + '18' : 'var(--s3)',
          padding: '2px 6px', borderRadius: 3, textTransform: 'uppercase',
          fontFamily: 'var(--mono)',
        }}>{proposal.status}</span>
      </div>

      {/* Body */}
      {proposal.body && (
        <div style={{ fontSize: 11, color: 'var(--t3)', lineHeight: 1.6 }}>
          {proposal.body.length > 140 ? proposal.body.slice(0, 140) + '…' : proposal.body}
        </div>
      )}

      {/* Progress bar */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontSize: 9, color: C_UP, fontWeight: 700, fontFamily: 'var(--mono)' }}>
            FOR {proposal.votes_for} ({forPct}%)
          </span>
          <span style={{ fontSize: 9, color: C_DN, fontWeight: 700, fontFamily: 'var(--mono)' }}>
            AGAINST {proposal.votes_against} ({against}%)
          </span>
        </div>
        <div style={{ height: 5, borderRadius: 5, background: 'var(--s4)', overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 5,
            width: `${forPct}%`,
            background: `linear-gradient(90deg, ${C_UP}, ${C_NE})`,
            transition: 'width 0.4s ease',
          }} />
        </div>
      </div>

      {/* Meta */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 9, color: 'var(--t4)', fontFamily: 'var(--mono)' }}>
          by {proposal.author?.slice(0, 12)}… · {timeLeft(proposal.ends_at)}
        </span>
        <span style={{ fontSize: 9, color: 'var(--t4)' }}>
          ID: {proposal.id}
        </span>
      </div>

      {/* Vote buttons */}
      {proposal.status === 'active' && voterAddress && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => onVote(proposal.id, 'for')}
            style={{
              flex: 1, padding: '7px 0', borderRadius: 7,
              background: C_UP + '15', border: `1px solid ${C_UP}30`,
              color: C_UP, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)',
            }}
          >▲ Vote For</button>
          <button
            onClick={() => onVote(proposal.id, 'against')}
            style={{
              flex: 1, padding: '7px 0', borderRadius: 7,
              background: C_DN + '12', border: `1px solid ${C_DN}25`,
              color: C_DN, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)',
            }}
          >▼ Vote Against</button>
        </div>
      )}

      {proposal.status === 'active' && !voterAddress && (
        <div style={{ fontSize: 10, color: 'var(--t4)', textAlign: 'center' }}>
          Connect wallet to vote
        </div>
      )}
    </div>
  )
}

// ── Create proposal form ──────────────────────────────────────────────────────

function CreateProposalForm({ onClose, author }) {
  const [title, setTitle]   = useState('')
  const [body, setBody]     = useState('')
  const [days, setDays]     = useState(7)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)
  const create              = useDAOStore(s => s.createProposal)

  const submit = async () => {
    if (!title.trim()) { setError('Title required'); return }
    if (!author) { setError('Connect wallet to create proposal'); return }
    setSaving(true)
    try {
      await create({
        title,
        body,
        author,
        ends_at: Date.now() + days * 86400000,
      })
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>New Proposal</div>

      <div>
        <label style={{ fontSize: 10, color: 'var(--t3)', display: 'block', marginBottom: 4 }}>Title</label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g. Reduce marketplace fee to 2%"
          style={{
            width: '100%', padding: '9px 12px', borderRadius: 8, boxSizing: 'border-box',
            background: 'var(--s3)', border: '1px solid var(--b0)',
            color: 'var(--t1)', fontSize: 12, fontFamily: 'var(--font)', outline: 'none',
          }}
        />
      </div>

      <div>
        <label style={{ fontSize: 10, color: 'var(--t3)', display: 'block', marginBottom: 4 }}>Description (optional)</label>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Explain the reasoning…"
          rows={4}
          style={{
            width: '100%', padding: '9px 12px', borderRadius: 8, boxSizing: 'border-box',
            background: 'var(--s3)', border: '1px solid var(--b0)',
            color: 'var(--t1)', fontSize: 12, fontFamily: 'var(--font)',
            outline: 'none', resize: 'vertical',
          }}
        />
      </div>

      <div>
        <label style={{ fontSize: 10, color: 'var(--t3)', display: 'block', marginBottom: 4 }}>Duration</label>
        <div style={{ display: 'flex', gap: 6 }}>
          {[3, 7, 14].map(d => (
            <button key={d} onClick={() => setDays(d)} style={{
              flex: 1, padding: '7px 0', borderRadius: 7,
              background: days === d ? 'var(--green-d)' : 'var(--s3)',
              border: `1px solid ${days === d ? 'rgba(74,222,128,0.3)' : 'var(--b0)'}`,
              color: days === d ? 'var(--green)' : 'var(--t3)',
              fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)',
            }}>{d} days</button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ padding: '8px', borderRadius: 7, background: C_DN + '12', fontSize: 10, color: C_DN }}>{error}</div>
      )}

      <button className="btn-hero" onClick={submit} disabled={saving} style={{ height: 40, fontSize: 12 }}>
        {saving ? 'Creating…' : 'Create Proposal →'}
      </button>
    </div>
  )
}

// ── Main DAOModal ─────────────────────────────────────────────────────────────

export default function DAOModal() {
  const isMobile  = useIsMobile()
  const daoModal  = useDAOStore(s => s.daoModal)
  const close     = useDAOStore(s => s.closeDAOModal)
  const proposals = useDAOStore(s => s.proposals)
  const loading   = useDAOStore(s => s.loading)
  const load      = useDAOStore(s => s.loadProposals)
  const vote      = useDAOStore(s => s.vote)
  const address   = useWalletStore(s => s.address)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (daoModal) load()
  }, [daoModal])

  if (!daoModal) return null

  const panelStyle = isMobile ? {
    position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 200,
    background: 'var(--s1)', borderRadius: '20px 20px 0 0',
    maxHeight: '90dvh', overflowY: 'auto',
    paddingBottom: 'max(20px, var(--sab))',
    animation: 'sheet-up 0.26s cubic-bezier(0.34,1.2,0.64,1)',
  } : {
    position: 'fixed',
    top: '50%', left: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 200,
    background: 'var(--s1)', borderRadius: 20,
    width: 'min(500px, calc(100vw - 32px))',
    maxHeight: 'calc(100vh - 80px)', overflowY: 'auto',
    boxShadow: 'var(--sh-lg)',
    animation: 'scale-in 0.2s cubic-bezier(0.34,1.05,0.64,1)',
  }

  return (
    <>
      <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 199, background: 'rgba(0,0,0,0.7)' }} />
      <div style={panelStyle}>
        {isMobile && <div className="drag-handle" style={{ paddingTop: 8 }} />}

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 18px 12px',
          borderBottom: '1px solid var(--b0)',
          position: 'sticky', top: 0, background: 'var(--s1)', zIndex: 1,
          borderRadius: isMobile ? '20px 20px 0 0' : '20px 20px 0 0',
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--t1)' }}>DAO Governance</div>
            <div style={{ fontSize: 10, color: 'var(--t4)', marginTop: 1 }}>
              {proposals.filter(p => p.status === 'active').length} active · vote with your $CLND balance
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {address && !creating && (
              <button
                onClick={() => setCreating(true)}
                style={{
                  padding: '5px 10px', borderRadius: 7,
                  background: 'var(--green-d)', border: '1px solid rgba(74,222,128,0.3)',
                  color: 'var(--green)', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)',
                }}
              >+ Propose</button>
            )}
            <button
              onClick={close}
              style={{ background: 'var(--s3)', border: 'none', color: 'var(--t2)', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >×</button>
          </div>
        </div>

        <div style={{ padding: '14px 18px' }}>
          {creating ? (
            <CreateProposalForm author={address} onClose={() => setCreating(false)} />
          ) : (
            <>
              {/* How it works */}
              <div style={{
                padding: '10px 12px', borderRadius: 9,
                background: C_NE + '08', border: `1px solid ${C_NE}20`,
                marginBottom: 16, fontSize: 10, color: 'var(--t3)', lineHeight: 1.7,
              }}>
                <strong style={{ color: 'var(--t2)' }}>Voting power:</strong> 1 vote per owned tile (pre-TGE).
                Post-token-launch: 1 $CLND = 1 vote. Proposals pass at &gt;50% majority after voting period.
              </div>

              {loading && (
                <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--t4)', fontSize: 11 }}>Loading proposals…</div>
              )}

              {!loading && proposals.length === 0 && (
                <div style={{ padding: '32px 0', textAlign: 'center' }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>🗳️</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t2)', marginBottom: 6 }}>No proposals yet</div>
                  <div style={{ fontSize: 11, color: 'var(--t4)' }}>
                    {address ? 'Click "+ Propose" to create the first proposal.' : 'Connect wallet to create and vote on proposals.'}
                  </div>
                </div>
              )}

              {!loading && proposals.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {proposals.map(p => (
                    <ProposalCard key={p.id} proposal={p} onVote={vote} voterAddress={address} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
