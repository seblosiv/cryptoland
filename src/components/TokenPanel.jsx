import { useEffect } from 'react'
import { useTokenStore, TOKEN_SYMBOL, TOKEN_SUPPLY } from '../store/tokenStore'
import { useWalletStore } from '../store/walletStore'
import { useDAOStore } from '../store/daoStore'
import { useIsMobile } from '../lib/hooks'
import { ACTIVE_CHAIN } from '../lib/blockchain/config.js'

const C_UP  = '#4ade80'
const C_AC  = '#a78bfa'  // $CLND color

export default function TokenPanel() {
  const isMobile     = useIsMobile()
  const tokenModal   = useTokenStore(s => s.tokenModal)
  const close        = useTokenStore(s => s.closeTokenModal)
  const loadStaking  = useTokenStore(s => s.loadStaking)
  const tilesOwned   = useTokenStore(s => s.tilesOwned)
  const stakeAmount  = useTokenStore(s => s.stakeAmount)
  const pendingYield = useTokenStore(s => s.pendingYield)
  const apyEstimate  = useTokenStore(s => s.apyEstimate)
  const loading      = useTokenStore(s => s.loading)
  const address      = useWalletStore(s => s.address)
  const openWallet   = useWalletStore(s => s.openWalletModal)
  const openDAO      = useDAOStore(s => s.openDAOModal)

  useEffect(() => {
    if (tokenModal && address) loadStaking(address)
  }, [tokenModal, address])

  if (!tokenModal) return null

  const panelStyle = isMobile ? {
    position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 200,
    background: 'var(--s1)', borderRadius: '10px 10px 0 0',
    maxHeight: '90dvh', overflowY: 'auto',
    paddingBottom: 'max(20px, var(--sab))',
    animation: 'sheet-up 0.26s cubic-bezier(0.34,1.2,0.64,1)',
  } : {
    position: 'fixed',
    top: '50%', left: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 200,
    background: 'var(--s1)', borderRadius: 10,
    width: 'min(460px, calc(100vw - 32px))',
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
          borderRadius: isMobile ? '10px 10px 0 0' : '10px 10px 0 0',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 900,
                color: C_AC, letterSpacing: '-0.02em',
              }}>$CLND</span>
              <span style={{
                fontSize: 8, fontWeight: 800, color: '#fbbf24',
                background: 'rgba(251,191,36,0.12)', padding: '2px 6px', borderRadius: 2,
              }}>PRE-TGE</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--t4)', marginTop: 1 }}>
              CryptoLand Token · {(TOKEN_SUPPLY / 1e6).toFixed(0)}M supply · {ACTIVE_CHAIN.name}
            </div>
          </div>
          <button
            onClick={close}
            style={{ background: 'var(--s3)', border: 'none', color: 'var(--t2)', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >×</button>
        </div>

        <div style={{ padding: '14px 18px' }}>
          {!address ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🪙</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginBottom: 6 }}>Connect Wallet to View Balance</div>
              <div style={{ fontSize: 11, color: 'var(--t3)', lineHeight: 1.6, marginBottom: 16 }}>
                Your $CLND balance is calculated from your on-chain tile holdings.
              </div>
              <button className="btn-hero" onClick={openWallet}>Connect Wallet →</button>
            </div>
          ) : loading ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--t4)', fontSize: 11 }}>Loading…</div>
          ) : (
            <>
              {/* Balance card */}
              <div style={{
                padding: '16px', borderRadius: 7,
                background: `linear-gradient(135deg, ${C_AC}12, rgba(0,0,0,0))`,
                border: `1px solid ${C_AC}25`,
                marginBottom: 16, textAlign: 'center',
              }}>
                <div style={{ fontSize: 10, color: 'var(--t4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
                  Your $CLND Balance
                </div>
                <div style={{
                  fontFamily: 'var(--mono)', fontSize: 36, fontWeight: 900,
                  color: C_AC, letterSpacing: '-0.03em', lineHeight: 1,
                }}>{stakeAmount.toLocaleString()}</div>
                <div style={{ fontSize: 10, color: 'var(--t4)', marginTop: 6 }}>
                  {tilesOwned} tiles × 100 $CLND each
                </div>
              </div>

              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                {[
                  { l: 'Pending Yield', v: `${pendingYield.toFixed(1)} $CLND`, col: C_UP },
                  { l: 'APY Estimate',  v: apyEstimate,                         col: '#fbbf24' },
                  { l: 'Voting Power',  v: `${stakeAmount.toLocaleString()} votes`, col: C_AC },
                  { l: 'Tier',         v: stakeAmount >= 10000 ? 'Whale 🐋' : stakeAmount >= 1000 ? 'Holder 💎' : 'Starter 🌱', col: 'var(--t2)' },
                ].map(({ l, v, col }) => (
                  <div key={l} style={{ padding: '10px 12px', borderRadius: 4, background: 'var(--s2)' }}>
                    <div style={{ fontSize: 9, color: 'var(--t4)', marginBottom: 3 }}>{l}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 800, color: col }}>{v}</div>
                  </div>
                ))}
              </div>

              {/* How to earn */}
              <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                HOW TO EARN $CLND
              </div>
              {[
                ['🏔️', 'Own Tiles',       '100 $CLND per tile passively staked'],
                ['⚔️', 'Deploy Guardian', 'Guardian budget × 5% yield per epoch'],
                ['🏪', 'Marketplace',     '2.5% of trading fees → $CLND stakers'],
                ['🗳️', 'Governance',      'Participate in DAO proposals for bonus yield'],
              ].map(([icon, label, desc]) => (
                <div key={label} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 0',
                  borderBottom: '1px solid var(--b0)',
                }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)' }}>{label}</div>
                    <div style={{ fontSize: 9, color: 'var(--t4)', marginTop: 1 }}>{desc}</div>
                  </div>
                </div>
              ))}

              {/* TGE notice */}
              <div style={{
                marginTop: 16, padding: '10px 12px', borderRadius: 4,
                background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.15)',
                fontSize: 10, color: '#fbbf24', lineHeight: 1.6,
              }}>
                <strong>Pre-TGE Notice:</strong> Balances are off-chain and will be snapshotted at Token Generation Event.
                Smart contract + exchange listing pending security audit completion.
              </div>

              {/* DAO button */}
              <button
                onClick={() => { close(); openDAO() }}
                style={{
                  width: '100%', marginTop: 12, padding: '11px 0', borderRadius: 4,
                  background: C_AC + '15', border: `1px solid ${C_AC}30`,
                  color: C_AC, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)',
                }}
              >Open DAO Governance →</button>
            </>
          )}
        </div>
      </div>
    </>
  )
}
