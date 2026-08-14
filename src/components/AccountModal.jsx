import { useState, useEffect, useCallback } from 'react'
import { useUserStore } from '../store/userStore'
import { useAffiliateStore } from '../store/affiliateStore'
import { useWalletStore } from '../store/walletStore'
import { useAuthStore } from '../store/authStore'
import { useGameStore } from '../store/gameStore'
import { useGuardianStore } from '../store/guardianStore'
import { useIsMobile } from '../lib/hooks'
import { api } from '../lib/api'
import { shortAddr } from '../lib/addr'

// ── Shared helpers ────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const TABS = [
  { id: 'tiles',     label: 'My Tiles' },
  { id: 'guardians', label: 'Guardians' },
  { id: 'affiliate', label: 'Affiliate' },
]

// ── Tiles tab ─────────────────────────────────────────────────────────────────

function TilesTab({ tiles, wallet }) {
  const setSelectedKey     = useGameStore(s => s.setSelectedKey)
  const openCustomizeModal = useGameStore(s => s.openCustomizeModal)
  const closeModal         = useUserStore(s => s.closeAccountModal)

  if (!tiles.length) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🗺</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)', marginBottom: 6 }}>
          No tiles yet
        </div>
        <div style={{ fontSize: 12, color: 'var(--t3)', lineHeight: 1.6 }}>
          Purchase a tile on the map to start building your territory.
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ padding: '12px 18px 8px', fontSize: 11, color: 'var(--t3)' }}>
        {tiles.length} tile{tiles.length !== 1 ? 's' : ''} owned
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {tiles.map(tile => (
          <div
            key={tile.tile_key}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '11px 18px',
              borderBottom: '1px solid var(--b0)',
              cursor: 'pointer',
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--s2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            onClick={() => {
              setSelectedKey(tile.tile_key)
              closeModal()
            }}
          >
            <div style={{
              width: 10, height: 10, borderRadius: 2,
              background: tile.color ?? '#4ade80',
              flexShrink: 0, boxShadow: `0 0 4px ${tile.color ?? '#4ade80'}80`,
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', display: 'flex', alignItems: 'center', gap: 6 }}>
                {tile.country ?? 'Unknown'}
                {tile.label && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, color: 'var(--green)',
                    background: 'rgba(74,222,128,0.12)', padding: '1px 5px', borderRadius: 2,
                  }}>{tile.label}</span>
                )}
              </div>
              <div style={{ fontSize: 10, color: 'var(--t3)', fontFamily: 'var(--mono)', marginTop: 1 }}>
                {tile.tile_key} · ${tile.price}
                {tile.purchased_at && <span> · {fmtDate(tile.purchased_at)}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              {tile.image_url && (
                <img
                  src={tile.image_url}
                  alt=""
                  style={{ width: 28, height: 28, borderRadius: 3, objectFit: 'cover' }}
                />
              )}
              <button
                onClick={e => { e.stopPropagation(); openCustomizeModal(tile.tile_key); closeModal() }}
                title="Customize"
                style={iconBtn}
              >✎</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Guardians tab ─────────────────────────────────────────────────────────────

function GuardiansTab({ guardians }) {
  const openGuardianModal = useGuardianStore(s => s.openGuardianModal)
  const closeModal        = useUserStore(s => s.closeAccountModal)

  if (!guardians.length) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🛡</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)', marginBottom: 6 }}>
          No guardians deployed
        </div>
        <div style={{ fontSize: 12, color: 'var(--t3)', lineHeight: 1.6 }}>
          Select a tile you own on the map and deploy a guardian to protect your territory.
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ padding: '12px 18px 8px', fontSize: 11, color: 'var(--t3)' }}>
        {guardians.length} guardian{guardians.length !== 1 ? 's' : ''} deployed
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {guardians.map(g => (
          <div
            key={g.tile_key}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '11px 18px',
              borderBottom: '1px solid var(--b0)',
              cursor: 'pointer',
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--s2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            onClick={() => { openGuardianModal?.(g.tile_key); closeModal() }}
          >
            <div style={{ fontSize: 22, flexShrink: 0, lineHeight: 1 }}>{g.personality_icon ?? '🛡'}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>
                {g.personality_name ?? 'Guardian'} · Lv{g.level ?? 1}
              </div>
              <div style={{ fontSize: 10, color: 'var(--t3)', fontFamily: 'var(--mono)', marginTop: 1 }}>
                {g.tile_key}
                {g.wins != null && (
                  <span> · {g.wins}W {g.losses}L</span>
                )}
              </div>
            </div>
            <div style={{
              fontSize: 9, fontWeight: 700,
              color: g.for_sale ? 'var(--green)' : 'var(--t4)',
              background: g.for_sale ? 'rgba(74,222,128,0.12)' : 'var(--s2)',
              padding: '2px 7px', borderRadius: 2,
            }}>
              {g.for_sale ? 'For Sale' : 'Active'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Affiliate tab ─────────────────────────────────────────────────────────────

function AffiliateTab({ wallet }) {
  const myCode      = useAffiliateStore(s => s.myCode)
  const stats       = useAffiliateStore(s => s.stats)
  const leaderboard = useAffiliateStore(s => s.leaderboard)
  const loading     = useAffiliateStore(s => s.loading)
  const loadMyCode  = useAffiliateStore(s => s.loadMyCode)
  const loadStats   = useAffiliateStore(s => s.loadStats)
  const getReferralUrl = useAffiliateStore(s => s.getReferralUrl)
  const authUser    = useAuthStore(s => s.user)

  const [copied, setCopied] = useState(false)
  const [redeeming, setRedeeming] = useState(false)
  const [redeemMsg, setRedeemMsg] = useState(null)

  // Load on mount for any logged-in user (email or wallet)
  useEffect(() => {
    if (!authUser && !wallet) return
    loadMyCode(wallet)
    loadStats(wallet)
  }, [authUser?.user_id, wallet])

  const referralUrl = getReferralUrl()

  const copy = useCallback(() => {
    if (!referralUrl) return
    navigator.clipboard?.writeText(referralUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [referralUrl])

  const redeem = useCallback(async () => {
    if (!wallet || !stats?.pending_balance || stats.pending_balance <= 0) return
    setRedeeming(true)
    setRedeemMsg(null)
    try {
      await api.redeemAffiliateEarnings(wallet, stats.pending_balance)
      setRedeemMsg('Redemption submitted! Payout will be processed within 24h.')
      loadStats(wallet)
    } catch (err) {
      setRedeemMsg(`Error: ${err.message}`)
    } finally {
      setRedeeming(false)
    }
  }, [wallet, stats])

  return (
    <div>
      {/* Your referral code */}
      <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--b0)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
          Your Referral Link
        </div>

        {!myCode ? (
          <div style={{ fontSize: 12, color: 'var(--t3)', fontStyle: 'italic' }}>
            {loading ? 'Loading…' : 'Sign in to get your referral link'}
          </div>
        ) : (
          <>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 12px', borderRadius: 5,
              background: 'var(--s2)', border: '1px solid var(--b0)',
              marginBottom: 8,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, color: 'var(--t4)', marginBottom: 2 }}>Referral Code</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: 'var(--green)', letterSpacing: '0.05em' }}>
                  {myCode}
                </div>
              </div>
            </div>

            {referralUrl && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', borderRadius: 5,
                background: 'var(--s2)', border: '1px solid var(--b0)',
                marginBottom: 10,
              }}>
                <div style={{
                  flex: 1, minWidth: 0,
                  fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t3)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {referralUrl}
                </div>
                <button
                  onClick={copy}
                  style={{
                    flexShrink: 0, padding: '5px 12px', borderRadius: 4,
                    background: copied ? 'rgba(74,222,128,0.15)' : 'var(--s3)',
                    border: `1px solid ${copied ? 'rgba(74,222,128,0.3)' : 'var(--b0)'}`,
                    color: copied ? 'var(--green)' : 'var(--t2)',
                    fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    fontFamily: 'var(--font)', transition: 'all 0.15s',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {copied ? '✓ Copied' : 'Copy Link'}
                </button>
              </div>
            )}

            <div style={{ fontSize: 10, color: 'var(--t4)', lineHeight: 1.6 }}>
              Earn <strong style={{ color: 'var(--green)' }}>30% commission</strong> on every tile purchase
              made through your referral link. Commissions are paid in USD-equivalent.
            </div>
          </>
        )}
      </div>

      {/* Earnings summary */}
      {stats && (
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--b0)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
            Earnings
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
            {[
              { label: 'Total Earned', value: `$${(stats.total_earned ?? 0).toFixed(2)}`, color: 'var(--green)' },
              { label: 'Pending', value: `$${(stats.pending_balance ?? 0).toFixed(2)}`, color: 'var(--t1)' },
              { label: 'Referrals', value: stats.total_referrals ?? 0, color: 'var(--t1)' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                padding: '10px 8px', borderRadius: 5, textAlign: 'center',
                background: 'var(--s2)', border: '1px solid var(--b0)',
              }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700, color, letterSpacing: '-0.02em', lineHeight: 1, marginBottom: 4 }}>
                  {value}
                </div>
                <div style={{ fontSize: 9, color: 'var(--t4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {label}
                </div>
              </div>
            ))}
          </div>

          {(stats.pending_balance ?? 0) > 0 && (
            <>
              <button
                onClick={redeem}
                disabled={redeeming}
                style={{
                  width: '100%', padding: '10px 0', borderRadius: 5,
                  background: redeeming ? 'var(--s2)' : 'rgba(74,222,128,0.15)',
                  border: '1px solid rgba(74,222,128,0.3)',
                  color: 'var(--green)', fontSize: 12, fontWeight: 700,
                  cursor: redeeming ? 'wait' : 'pointer',
                  fontFamily: 'var(--font)', transition: 'background 0.15s',
                }}
              >
                {redeeming ? 'Processing…' : `Redeem $${(stats.pending_balance ?? 0).toFixed(2)}`}
              </button>
              {redeemMsg && (
                <div style={{ fontSize: 11, color: redeemMsg.startsWith('Error') ? '#f87171' : 'var(--green)', marginTop: 8, textAlign: 'center' }}>
                  {redeemMsg}
                </div>
              )}
            </>
          )}

          {stats.last_referral_at && (
            <div style={{ marginTop: 10, fontSize: 10, color: 'var(--t4)' }}>
              Last referral: {fmtDate(stats.last_referral_at)}
              {stats.redeemed > 0 && <span> · ${stats.redeemed.toFixed(2)} redeemed</span>}
            </div>
          )}
        </div>
      )}

      {/* Leaderboard */}
      {leaderboard.length > 0 && (
        <div style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
            Top Affiliates
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {leaderboard.slice(0, 5).map((entry, i) => {
              const isMe = entry.wallet?.toLowerCase() === wallet?.toLowerCase()
              return (
                <div key={entry.wallet} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px', borderRadius: 4,
                  background: isMe ? 'rgba(74,222,128,0.08)' : 'var(--s2)',
                  border: `1px solid ${isMe ? 'rgba(74,222,128,0.2)' : 'var(--b0)'}`,
                }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: 3, flexShrink: 0,
                    background: i === 0 ? 'rgba(250,204,21,0.15)' : i === 1 ? 'rgba(148,163,184,0.15)' : i === 2 ? 'rgba(180,83,9,0.15)' : 'var(--s3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 800,
                    color: i === 0 ? '#facc15' : i === 1 ? '#94a3b8' : i === 2 ? '#b45309' : 'var(--t4)',
                  }}>
                    {i + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: isMe ? 'var(--green)' : 'var(--t2)', fontWeight: isMe ? 700 : 400 }}>
                      {isMe ? 'You' : shortAddr(entry.wallet)}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t1)', fontFamily: 'var(--mono)' }}>
                    ${(entry.total_earned ?? 0).toFixed(2)}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--t4)', minWidth: 32, textAlign: 'right' }}>
                    {entry.total_refs ?? 0} refs
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main AccountModal ─────────────────────────────────────────────────────────

export default function AccountModal() {
  const isMobile    = useIsMobile()
  const close       = useUserStore(s => s.closeAccountModal)
  const profile     = useUserStore(s => s.profile)
  const tiles       = useUserStore(s => s.tiles)
  const guardians   = useUserStore(s => s.guardians)
  const loading     = useUserStore(s => s.loading)
  const loadAccount   = useUserStore(s => s.loadAccount)
  const loadAccountMe = useUserStore(s => s.loadAccountMe)
  const wallet      = useWalletStore(s => s.address)
  const shortAddress = useWalletStore(s => s.shortAddress)
  const authUser    = useAuthStore(s => s.user)
  const logout      = useAuthStore(s => s.logout)

  // Load account data on mount. Prefer the wallet dashboard when a wallet is
  // connected; otherwise (email/guest login) load via bearer token so the
  // dashboard isn't empty for wallet-less accounts.
  useEffect(() => {
    if (wallet) loadAccount(wallet)
    else if (authUser) loadAccountMe()
  }, [wallet, authUser?.user_id])

  const [tab, setTab] = useState('tiles')

  const panelStyle = isMobile ? {
    position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 200,
    background: 'var(--s1)',
    borderRadius: '10px 10px 0 0',
    maxHeight: '90dvh', overflowY: 'auto',
    animation: 'sheet-up 0.26s cubic-bezier(0.34,1.2,0.64,1)',
  } : {
    position: 'fixed',
    top: '50%', left: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 200,
    background: 'var(--s1)',
    borderRadius: 10,
    width: 'min(520px, calc(100vw - 32px))',
    maxHeight: 'calc(100vh - 80px)',
    overflowY: 'auto',
    boxShadow: 'var(--sh-lg)',
    animation: 'scale-in 0.2s cubic-bezier(0.34,1.05,0.64,1)',
    display: 'flex',
    flexDirection: 'column',
  }

  return (
    <>
      <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 199, background: 'rgba(0,0,0,0.7)' }} />

      <div style={panelStyle}>
        {isMobile && <div className="drag-handle" style={{ paddingTop: 8 }} />}

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 18px 0',
          position: 'sticky', top: 0, background: 'var(--s1)', zIndex: 1,
          borderRadius: isMobile ? '10px 10px 0 0' : '10px 10px 0 0',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {authUser && (
              <div style={{ fontSize: 26, lineHeight: 1 }}>{authUser.avatar_emoji || '◈'}</div>
            )}
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--t1)' }}>
                {authUser?.username || authUser?.email?.split('@')[0] || 'Account'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                {authUser?.email && (
                  <span style={{ fontSize: 10, color: 'var(--t4)', fontFamily: 'var(--mono)' }}>{authUser.email}</span>
                )}
                {wallet && (
                  <span style={{ fontSize: 10, color: 'var(--t4)', fontFamily: 'var(--mono)' }}>{shortAddress}</span>
                )}
                {authUser?.is_guest === 1 && (
                  <span style={{ fontSize: 9, color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '1px 6px', borderRadius: 2, fontWeight: 700 }}>Guest</span>
                )}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {authUser && (
              <button
                onClick={() => { logout(); close() }}
                title="Sign out"
                style={{
                  background: 'var(--s3)', border: 'none', color: 'var(--t3)',
                  borderRadius: 4, padding: '4px 10px',
                  cursor: 'pointer', fontSize: 10, fontWeight: 600,
                  fontFamily: 'var(--font)',
                }}
              >Sign out</button>
            )}
            <button
              onClick={close}
              style={{
                background: 'var(--s3)', border: 'none', color: 'var(--t2)',
                borderRadius: '50%', width: 28, height: 28,
                cursor: 'pointer', fontSize: 14, lineHeight: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >×</button>
          </div>
        </div>

        {/* Summary stats */}
        {profile && (
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
            gap: 8, padding: '12px 18px 0',
          }}>
            {[
              { v: profile.tile_count ?? tiles.length, l: 'Tiles' },
              { v: profile.guardian_count ?? guardians.length, l: 'Guardians' },
              { v: profile.tile_count > 0 ? `$${((tiles.reduce((s, t) => s + (t.price || 0), 0))).toFixed(0)}` : '$0', l: 'Invested' },
            ].map(({ v, l }) => (
              <div key={l} style={{
                padding: '10px 8px', borderRadius: 5, textAlign: 'center',
                background: 'var(--s2)', border: '1px solid var(--b0)',
              }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 17, fontWeight: 700, color: 'var(--t1)', letterSpacing: '-0.02em', lineHeight: 1, marginBottom: 4 }}>
                  {v}
                </div>
                <div style={{ fontSize: 9, color: 'var(--t4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {l}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div style={{
          display: 'flex', gap: 4,
          padding: '12px 18px 0',
          position: 'sticky', top: 42, background: 'var(--s1)', zIndex: 1,
        }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1, padding: '7px 0', borderRadius: 4,
                background:  tab === t.id ? 'var(--s3)' : 'none',
                border:      tab === t.id ? '1px solid var(--b0)' : '1px solid transparent',
                color:       tab === t.id ? 'var(--t1)' : 'var(--t3)',
                fontSize:    12, fontWeight: 600, cursor: 'pointer',
                fontFamily:  'var(--font)', transition: 'all 0.12s',
              }}
            >
              {t.label}
              {t.id === 'tiles' && tiles.length > 0 && (
                <span style={{
                  marginLeft: 5, fontSize: 9, fontWeight: 800, fontFamily: 'var(--mono)',
                  color: tab === 'tiles' ? 'var(--green)' : 'var(--t4)',
                  background: tab === 'tiles' ? 'rgba(74,222,128,0.15)' : 'var(--s3)',
                  padding: '1px 5px', borderRadius: 2,
                }}>{tiles.length}</span>
              )}
              {t.id === 'guardians' && guardians.length > 0 && (
                <span style={{
                  marginLeft: 5, fontSize: 9, fontWeight: 800, fontFamily: 'var(--mono)',
                  color: tab === 'guardians' ? 'var(--green)' : 'var(--t4)',
                  background: tab === 'guardians' ? 'rgba(74,222,128,0.15)' : 'var(--s3)',
                  padding: '1px 5px', borderRadius: 2,
                }}>{guardians.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1 }}>
          {loading && !profile ? (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%',
                border: '2px solid var(--s4)', borderTopColor: 'var(--green)',
                animation: 'spin 0.8s linear infinite',
                margin: '0 auto 12px',
              }} />
              <div style={{ fontSize: 12, color: 'var(--t3)' }}>Loading account…</div>
            </div>
          ) : (!wallet && !authUser) ? (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>◎</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)', marginBottom: 6 }}>
                Not signed in
              </div>
              <div style={{ fontSize: 12, color: 'var(--t3)' }}>
                Sign in or connect your wallet to view your account.
              </div>
            </div>
          ) : (
            <>
              {tab === 'tiles'     && <TilesTab tiles={tiles} wallet={wallet} />}
              {tab === 'guardians' && <GuardiansTab guardians={guardians} />}
              {tab === 'affiliate' && <AffiliateTab wallet={wallet} />}
            </>
          )}
        </div>

        <div style={{ height: 'max(16px, var(--sab))' }} />
      </div>
    </>
  )
}

const iconBtn = {
  width: 28, height: 28, borderRadius: 4,
  background: 'var(--s3)', border: 'none',
  color: 'var(--t2)', cursor: 'pointer', fontSize: 12,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'background 0.1s', WebkitTapHighlightColor: 'transparent',
  flexShrink: 0,
}
