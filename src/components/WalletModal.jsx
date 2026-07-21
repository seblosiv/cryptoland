import { useState, useEffect } from 'react'
import { useWalletStore } from '../store/walletStore'
import { ACTIVE_CHAIN } from '../lib/blockchain/config.js'
import { explorerTxUrl } from '../lib/blockchain/config.js'
import { useIsMobile } from '../lib/hooks'

const C_UP = '#4ade80'
const C_DN = '#f87171'

function shortAddr(a) {
  if (!a) return ''
  return a.length > 12 ? a.slice(0, 6) + '…' + a.slice(-4) : a
}

function timeAgo(ts) {
  const s = (Date.now() - ts) / 1000
  if (s < 60)   return `${Math.floor(s)}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

// ── Wallet option button ───────────────────────────────────────────────────────

function WalletOption({ id, name, icon, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 14px', borderRadius: 10,
        background: disabled ? 'var(--s2)' : 'var(--s2)',
        border: '1px solid var(--b0)',
        cursor: disabled ? 'default' : 'pointer',
        transition: 'background 0.12s, border-color 0.12s',
        opacity: disabled ? 0.45 : 1,
        fontFamily: 'var(--font)',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = 'var(--s3)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'var(--s2)' }}
    >
      <span style={{ fontSize: 22, flexShrink: 0 }}>{icon}</span>
      <div style={{ textAlign: 'left', flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{name}</div>
        <div style={{ fontSize: 10, color: 'var(--t4)', marginTop: 1 }}>
          {disabled ? 'Not detected' : 'Click to connect'}
        </div>
      </div>
      {!disabled && (
        <span style={{ fontSize: 11, color: 'var(--t4)' }}>→</span>
      )}
    </button>
  )
}

// ── Connected view ─────────────────────────────────────────────────────────────

function ConnectedView({ address, chainId, chainName, balance, ownedTiles, txHistory, onDisconnect }) {
  const [tab, setTab] = useState('portfolio')

  return (
    <div>
      {/* Wallet address card */}
      <div style={{
        padding: '14px', borderRadius: 12,
        background: 'var(--s2)', border: '1px solid var(--b0)',
        marginBottom: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: C_UP, boxShadow: `0 0 6px ${C_UP}`,
            }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: C_UP }}>CONNECTED</span>
          </div>
          <div style={{
            fontSize: 9, fontWeight: 700, color: ACTIVE_CHAIN.color,
            background: ACTIVE_CHAIN.color + '18', padding: '2px 7px', borderRadius: 4,
            fontFamily: 'var(--mono)',
          }}>
            {ACTIVE_CHAIN.logo} {chainName || ACTIVE_CHAIN.name}
          </div>
        </div>

        <div style={{
          fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700,
          color: 'var(--t1)', letterSpacing: '-0.02em', marginBottom: 4,
          wordBreak: 'break-all',
        }}>{address}</div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 10, color: 'var(--t3)', fontFamily: 'var(--mono)' }}>
            {balance ?? '…'}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => navigator.clipboard?.writeText(address)}
              style={{
                fontSize: 10, color: 'var(--t3)', background: 'var(--s3)',
                border: 'none', borderRadius: 5, padding: '3px 8px', cursor: 'pointer',
                fontFamily: 'var(--font)',
              }}
            >Copy</button>
            <button
              onClick={onDisconnect}
              style={{
                fontSize: 10, color: C_DN, background: 'rgba(248,113,113,0.1)',
                border: 'none', borderRadius: 5, padding: '3px 8px', cursor: 'pointer',
                fontFamily: 'var(--font)',
              }}
            >Disconnect</button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        {[
          { id: 'portfolio', label: `Portfolio (${ownedTiles.length})` },
          { id: 'history',   label: `History (${txHistory.length})` },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: '6px 0', borderRadius: 7,
            background:  tab === t.id ? 'var(--s3)' : 'none',
            border:      tab === t.id ? '1px solid var(--b0)' : '1px solid transparent',
            color:       tab === t.id ? 'var(--t1)' : 'var(--t3)',
            fontSize:    11, fontWeight: 600, cursor: 'pointer',
            fontFamily:  'var(--font)',
          }}>{t.label}</button>
        ))}
      </div>

      {/* Portfolio tab */}
      {tab === 'portfolio' && (
        <div style={{ maxHeight: 220, overflowY: 'auto' }}>
          {ownedTiles.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', fontSize: 12, color: 'var(--t4)' }}>
              No tiles owned yet.<br />Purchase a tile to mint your first NFT.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {ownedTiles.map(key => (
                <div key={key} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 10px', borderRadius: 8, background: 'var(--s2)',
                }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t2)' }}>
                    Tile {key}
                  </span>
                  <span style={{
                    fontSize: 8, color: C_UP, background: C_UP + '18',
                    padding: '1px 5px', borderRadius: 3, fontWeight: 700,
                  }}>NFT</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* History tab */}
      {tab === 'history' && (
        <div style={{ maxHeight: 220, overflowY: 'auto' }}>
          {txHistory.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', fontSize: 12, color: 'var(--t4)' }}>
              No transactions yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {txHistory.slice(0, 20).map((tx, i) => (
                <div key={i} style={{
                  padding: '8px 10px', borderRadius: 8, background: 'var(--s2)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, color: 'var(--t1)',
                      textTransform: 'capitalize',
                    }}>{tx.type ?? 'Transaction'}</span>
                    <span style={{ fontSize: 9, color: 'var(--t4)', fontFamily: 'var(--mono)' }}>
                      {timeAgo(tx.timestamp)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t3)' }}>
                      {tx.txHash ? shortAddr(tx.txHash) : tx.tileKey ?? ''}
                    </span>
                    {tx.txHash && (
                      <a
                        href={explorerTxUrl(tx.txHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: 9, color: ACTIVE_CHAIN.color, textDecoration: 'none' }}
                      >↗</a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main WalletModal ───────────────────────────────────────────────────────────

export default function WalletModal() {
  const isMobile    = useIsMobile()
  const walletModal = useWalletStore(s => s.walletModal)
  const close       = useWalletStore(s => s.closeWalletModal)
  const connect     = useWalletStore(s => s.connect)
  const disconnect  = useWalletStore(s => s.disconnect)
  const connecting  = useWalletStore(s => s.connecting)
  const error       = useWalletStore(s => s.error)
  const address     = useWalletStore(s => s.address)
  const chainId     = useWalletStore(s => s.chainId)
  const chainName   = useWalletStore(s => s.chainName)
  const balance     = useWalletStore(s => s.balance)
  const ownedTiles  = useWalletStore(s => s.ownedTiles)
  const txHistory   = useWalletStore(s => s.txHistory)

  const [detectedWallets, setDetectedWallets] = useState([])

  useEffect(() => {
    if (!walletModal) return
    // Detect after modal opens (wallet may inject after page load)
    import('../lib/blockchain/index.js').then(bc => {
      setDetectedWallets(bc.detectWallets?.() ?? [])
    }).catch(() => {})
  }, [walletModal])

  if (!walletModal) return null

  const isConnected = !!address

  // Per-family wallet options so every chain build shows its native wallets.
  // Detected wallets (from the adapter's detectWallets()) are merged/prioritized
  // over this static fallback list below.
  const WALLETS_BY_FAMILY = {
    evm: [
      { id: 'metamask',  name: 'MetaMask',        icon: '🦊' },
      { id: 'coinbase',  name: 'Coinbase Wallet', icon: '🔵' },
      { id: 'rabby',     name: 'Rabby',           icon: '🐰' },
      { id: 'injected',  name: 'Browser Wallet',  icon: '🌐' },
    ],
    solana: [
      { id: 'phantom',   name: 'Phantom',  icon: '👻' },
      { id: 'solflare',  name: 'Solflare', icon: '🌟' },
      { id: 'backpack',  name: 'Backpack', icon: '🎒' },
    ],
    ton: [
      { id: 'tonkeeper', name: 'Tonkeeper',       icon: '🔑' },
      { id: 'tonconnect',name: 'TON Connect',     icon: '💎' },
      { id: 'telegram',  name: 'Telegram Wallet', icon: '✈️' },
    ],
    aptos: [
      { id: 'petra',     name: 'Petra',   icon: '🪨' },
      { id: 'martian',   name: 'Martian', icon: '👽' },
      { id: 'pontem',    name: 'Pontem',  icon: '🌉' },
    ],
    sui: [
      { id: 'sui-wallet', name: 'Sui Wallet', icon: '🌊' },
      { id: 'suiet',      name: 'Suiet',      icon: '🩵' },
      { id: 'ethos',      name: 'Ethos',      icon: '⚡' },
    ],
  }
  const allOptions = WALLETS_BY_FAMILY[ACTIVE_CHAIN.family] ?? WALLETS_BY_FAMILY.evm

  const detectedIds = new Set(detectedWallets.map(w => w.id))

  const panelStyle = isMobile ? {
    position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 200,
    background: 'var(--s1)',
    borderRadius: '20px 20px 0 0',
    padding: '0 0 max(20px, var(--sab))',
    animation: 'sheet-up 0.26s cubic-bezier(0.34,1.2,0.64,1)',
    maxHeight: '90dvh', overflowY: 'auto',
  } : {
    position: 'fixed',
    top: '50%', left: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 200,
    background: 'var(--s1)',
    borderRadius: 20,
    width: 'min(420px, calc(100vw - 32px))',
    maxHeight: 'calc(100vh - 80px)',
    overflowY: 'auto',
    boxShadow: 'var(--sh-lg)',
    animation: 'scale-in 0.2s cubic-bezier(0.34,1.05,0.64,1)',
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={close}
        style={{
          position: 'fixed', inset: 0, zIndex: 199,
          background: 'rgba(0,0,0,0.7)',
        }}
      />

      {/* Panel */}
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
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--t1)' }}>
              {isConnected ? 'Wallet' : 'Connect Wallet'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--t4)', marginTop: 1 }}>
              {isConnected ? `${ACTIVE_CHAIN.name} · On-Chain` : `Connect to ${ACTIVE_CHAIN.name}`}
            </div>
          </div>
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

        {/* Body */}
        <div style={{ padding: '14px 18px 18px' }}>
          {isConnected ? (
            <ConnectedView
              address={address}
              chainId={chainId}
              chainName={chainName}
              balance={balance}
              ownedTiles={ownedTiles}
              txHistory={txHistory}
              onDisconnect={() => { disconnect(); close() }}
            />
          ) : (
            <>
              {/* Chain info */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', borderRadius: 8,
                background: ACTIVE_CHAIN.color + '12',
                border: `1px solid ${ACTIVE_CHAIN.color}25`,
                marginBottom: 14,
              }}>
                <span style={{ fontSize: 16 }}>{ACTIVE_CHAIN.logo}</span>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: ACTIVE_CHAIN.color }}>
                    {ACTIVE_CHAIN.name}
                    {ACTIVE_CHAIN.testnet && (
                      <span style={{
                        marginLeft: 6, fontSize: 8, fontWeight: 800,
                        color: C_DN, background: C_DN + '18',
                        padding: '1px 5px', borderRadius: 3,
                      }}>TESTNET</span>
                    )}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--t4)', marginTop: 1 }}>
                    NFT minting · marketplace · on-chain ownership
                  </div>
                </div>
              </div>

              {/* Wallet options */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                {allOptions.map(opt => {
                  const isDetected = detectedIds.has(opt.id) || (opt.id === 'injected' && detectedIds.size > 0)
                  // Show all options; disable undetected ones on desktop
                  return (
                    <WalletOption
                      key={opt.id}
                      {...opt}
                      disabled={!isDetected && typeof window !== 'undefined' && !window.ethereum && !window.solana}
                      onClick={connect}
                    />
                  )
                })}
              </div>

              {/* Error */}
              {error && (
                <div style={{
                  padding: '10px 12px', borderRadius: 8, marginBottom: 10,
                  background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)',
                  fontSize: 11, color: C_DN, lineHeight: 1.5,
                }}>{error}</div>
              )}

              {/* Loading */}
              {connecting && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
                  <div style={{
                    width: 14, height: 14, borderRadius: '50%',
                    border: '2px solid var(--s4)', borderTopColor: C_UP,
                    animation: 'spin 0.8s linear infinite', flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 12, color: 'var(--t3)' }}>Connecting…</span>
                </div>
              )}

              {/* No wallet detected */}
              {detectedWallets.length === 0 && !connecting && (
                <div style={{
                  padding: '10px 12px', borderRadius: 8,
                  background: 'var(--s2)', border: '1px solid var(--b0)',
                  fontSize: 11, color: 'var(--t3)', lineHeight: 1.6,
                  textAlign: 'center',
                }}>
                  No wallet detected. Install{' '}
                  <a href="https://metamask.io" target="_blank" rel="noopener noreferrer"
                    style={{ color: '#f7931a', textDecoration: 'none', fontWeight: 600 }}>MetaMask</a>
                  {' '}or{' '}
                  <a href="https://phantom.app" target="_blank" rel="noopener noreferrer"
                    style={{ color: '#9945ff', textDecoration: 'none', fontWeight: 600 }}>Phantom</a>
                  {' '}to continue.
                </div>
              )}
            </>
          )}

          {/* Footer */}
          <div style={{
            marginTop: 14, fontSize: 9, color: 'var(--t4)',
            textAlign: 'center', lineHeight: 1.6,
          }}>
            By connecting you agree to our Terms of Service.<br />
            Tiles are minted as ERC-721 NFTs on {ACTIVE_CHAIN.name}.
          </div>
        </div>
      </div>
    </>
  )
}
