import { useEffect, useState } from 'react'
import { useMarketStore } from '../store/marketStore'
import { useWalletStore } from '../store/walletStore'
import { useGameStore } from '../store/gameStore'
import { useIsMobile } from '../lib/hooks'
import { analytics } from '../lib/analytics'
import { ACTIVE_CHAIN } from '../lib/blockchain/config.js'

const C_UP = '#4ade80'
const C_DN = '#f87171'
const C_AC = ACTIVE_CHAIN.color

function timeAgo(ms) {
  const s = (Date.now() - ms) / 1000
  if (s < 60)    return `${Math.floor(s)}s ago`
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

// ── List tile form ─────────────────────────────────────────────────────────────

function ListForm({ tileKey, tileData, onClose }) {
  const [price, setPrice]   = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)
  const listTile            = useMarketStore(s => s.listTile)
  const address             = useWalletStore(s => s.address)

  const submit = async () => {
    if (!price || isNaN(price) || Number(price) < 1) {
      setError('Minimum price is $1'); return
    }
    if (!address) {
      setError('Connect wallet first'); return
    }
    setSaving(true)
    try {
      await listTile(tileKey, address, Number(price), ACTIVE_CHAIN.name)
      analytics.marketplacelist(tileKey, Number(price))
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginBottom: 6 }}>
        List Tile {tileKey} for Sale
      </div>
      <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 16 }}>
        {tileData?.country ?? 'Unknown'} · NFT on {ACTIVE_CHAIN.name}
      </div>

      <label style={{ fontSize: 11, color: 'var(--t3)', display: 'block', marginBottom: 4 }}>
        Asking Price (USD)
      </label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          type="number"
          min={1}
          value={price}
          onChange={e => setPrice(e.target.value)}
          placeholder="e.g. 150"
          style={{
            flex: 1, padding: '9px 12px', borderRadius: 8,
            background: 'var(--s3)', border: '1px solid var(--b0)',
            color: 'var(--t1)', fontSize: 13, fontFamily: 'var(--mono)',
            outline: 'none',
          }}
        />
        <span style={{
          padding: '9px 12px', background: 'var(--s3)',
          border: '1px solid var(--b0)', borderRadius: 8,
          fontSize: 11, color: 'var(--t3)', display: 'flex', alignItems: 'center',
        }}>USD</span>
      </div>

      {price && !isNaN(price) && Number(price) > 0 && (
        <div style={{
          padding: '8px 10px', borderRadius: 7, background: 'var(--s2)',
          fontSize: 10, color: 'var(--t3)', marginBottom: 12, lineHeight: 1.6,
        }}>
          You receive: <strong style={{ color: C_UP }}>${(Number(price) * 0.975).toFixed(2)}</strong>
          <span style={{ color: 'var(--t4)' }}> (after 2.5% protocol fee)</span>
        </div>
      )}

      {error && (
        <div style={{ padding: '8px 10px', borderRadius: 7, background: C_DN + '12', fontSize: 10, color: C_DN, marginBottom: 10 }}>{error}</div>
      )}

      <button
        onClick={submit}
        disabled={saving}
        className="btn-hero"
        style={{ height: 40, fontSize: 13 }}
      >
        {saving ? 'Listing…' : 'List for Sale →'}
      </button>
    </div>
  )
}

// ── Listing card ───────────────────────────────────────────────────────────────

function ListingCard({ listing, onBuy }) {
  const address = useWalletStore(s => s.address)
  const remove  = useMarketStore(s => s.removeListing)
  const isOwn   = address && listing.seller?.toLowerCase() === address.toLowerCase()

  return (
    <div style={{
      padding: '12px 14px', borderRadius: 10,
      background: 'var(--s2)', border: '1px solid var(--b0)',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: listing.color ?? '#4ade80', flexShrink: 0,
          }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t1)' }}>
            {listing.country ?? listing.tile_key}
          </span>
        </div>
        <span style={{
          fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 900,
          color: C_AC, letterSpacing: '-0.02em',
        }}>${listing.price_usd.toFixed(0)}</span>
      </div>

      {/* Meta */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 9, color: 'var(--t4)', fontFamily: 'var(--mono)' }}>
          {listing.tile_key} · {timeAgo(listing.listed_at)}
        </span>
        <span style={{
          fontSize: 8, fontWeight: 700, color: C_AC, background: C_AC + '18',
          padding: '1px 5px', borderRadius: 3, fontFamily: 'var(--mono)',
        }}>NFT · {listing.chain ?? ACTIVE_CHAIN.name}</span>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6 }}>
        {isOwn ? (
          <button
            onClick={() => remove(listing.tile_key, address)}
            style={{
              flex: 1, padding: '7px 0', borderRadius: 7,
              background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)',
              color: C_DN, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)',
            }}
          >Unlist</button>
        ) : (
          <button
            onClick={() => onBuy(listing)}
            style={{
              flex: 1, padding: '7px 0', borderRadius: 7,
              background: C_AC + '18', border: `1px solid ${C_AC}30`,
              color: C_AC, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)',
            }}
          >Buy Now →</button>
        )}
      </div>
    </div>
  )
}

// ── Buy confirmation ──────────────────────────────────────────────────────────

function BuyConfirm({ listing, onClose }) {
  const address   = useWalletStore(s => s.address)
  const openWallet = useWalletStore(s => s.openWalletModal)

  if (!address) {
    return (
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 8 }}>Connect Wallet to Buy</div>
        <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 16 }}>
          You need a connected wallet to purchase tiles on-chain.
        </div>
        <button className="btn-hero" onClick={openWallet}>Connect Wallet →</button>
      </div>
    )
  }

  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 4 }}>
        Confirm Purchase
      </div>
      <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 16 }}>
        Tile {listing.tile_key} · {listing.country}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
        {[
          { l: 'Price', v: `$${listing.price_usd.toFixed(2)}` },
          { l: 'Protocol Fee (2.5%)', v: `$${(listing.price_usd * 0.025).toFixed(2)}` },
          { l: 'Chain', v: listing.chain ?? ACTIVE_CHAIN.name },
          { l: 'NFT Standard', v: 'ERC-721' },
        ].map(({ l, v }) => (
          <div key={l} style={{ padding: '8px 10px', borderRadius: 7, background: 'var(--s2)' }}>
            <div style={{ fontSize: 9, color: 'var(--t4)', marginBottom: 2 }}>{l}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t1)', fontFamily: 'var(--mono)' }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{
        padding: '10px 12px', borderRadius: 8, marginBottom: 12,
        background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)',
        fontSize: 10, color: '#fbbf24', lineHeight: 1.6,
      }}>
        ⚠️ On-chain purchase requires your wallet to sign a transaction and pay gas fees on {listing.chain ?? ACTIVE_CHAIN.name}.
      </div>

      <button
        className="btn-hero"
        onClick={() => {
          analytics.marketplaceBuy(listing.tile_key, listing.price_usd)
          alert('On-chain buy: connect to deployed contract at ' + (ACTIVE_CHAIN.contractAddress ?? 'not yet deployed'))
          onClose()
        }}
      >Confirm Purchase →</button>
    </div>
  )
}

// ── Main MarketplaceModal ─────────────────────────────────────────────────────

export default function MarketplaceModal() {
  const isMobile  = useIsMobile()
  const listings  = useMarketStore(s => s.listings)
  const stats     = useMarketStore(s => s.stats)
  const loading   = useMarketStore(s => s.loading)
  const listModal = useMarketStore(s => s.listModal)
  const buyModal  = useMarketStore(s => s.buyModal)
  const load      = useMarketStore(s => s.loadListings)
  const openBuy   = useMarketStore(s => s.openBuyModal)
  const closeBuy  = useMarketStore(s => s.closeBuyModal)
  const closeList = useMarketStore(s => s.closeListModal)

  const [show, setShow] = useState(false)

  useEffect(() => {
    if (show) load()
  }, [show])

  const panelStyle = isMobile ? {
    position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 50,
    background: 'var(--s1)', borderRadius: '20px 20px 0 0',
    maxHeight: '85dvh', overflowY: 'auto',
    paddingBottom: 'max(20px, var(--sab))',
    animation: 'sheet-up 0.26s cubic-bezier(0.34,1.2,0.64,1)',
  } : {
    position: 'fixed',
    top: '50%', left: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 50,
    background: 'var(--s1)', borderRadius: 20,
    width: 'min(540px, calc(100vw - 32px))',
    maxHeight: 'calc(100vh - 80px)', overflowY: 'auto',
    boxShadow: 'var(--sh-lg)',
    animation: 'scale-in 0.2s cubic-bezier(0.34,1.05,0.64,1)',
  }

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setShow(v => !v)}
        style={{
          position: 'fixed',
          right: 'calc(max(14px, var(--sar)))',
          bottom: 'calc(var(--feed-h) + max(12px, var(--sab)))',
          zIndex: 20,
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '0 14px', height: 42,
          background: show ? 'var(--green-d)' : 'var(--s2)',
          border: `1px solid ${show ? 'rgba(74,222,128,0.3)' : 'var(--b0)'}`,
          borderRadius: 'var(--r-pill)',
          color: show ? 'var(--green)' : 'var(--t2)',
          fontSize: 12, fontWeight: 700, fontFamily: 'var(--font)',
          cursor: 'pointer', boxShadow: 'var(--sh-sm)',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <span style={{ fontSize: 13 }}>🏪</span>
        <span>Market</span>
        {stats.listings > 0 && (
          <span style={{
            fontSize: 9, fontWeight: 800, fontFamily: 'var(--mono)',
            color: 'var(--green)', background: 'rgba(74,222,128,0.15)',
            borderRadius: 4, padding: '1px 5px',
          }}>{stats.listings}</span>
        )}
      </button>

      {/* Sub-modals */}
      {listModal && (
        <>
          <div onClick={closeList} style={{ position: 'fixed', inset: 0, zIndex: 199, background: 'rgba(0,0,0,0.7)' }} />
          <div style={{ ...panelStyle, zIndex: 200 }}>
            <div style={{ padding: '16px 18px' }}>
              <ListForm tileKey={listModal.tileKey} tileData={listModal.tileData} onClose={closeList} />
            </div>
          </div>
        </>
      )}

      {buyModal && (
        <>
          <div onClick={closeBuy} style={{ position: 'fixed', inset: 0, zIndex: 199, background: 'rgba(0,0,0,0.7)' }} />
          <div style={{ ...panelStyle, zIndex: 200 }}>
            <div style={{ padding: '16px 18px' }}>
              <BuyConfirm listing={buyModal} onClose={closeBuy} />
            </div>
          </div>
        </>
      )}

      {/* Main marketplace panel */}
      {show && (
        <>
          <div onClick={() => setShow(false)} style={{ position: 'fixed', inset: 0, zIndex: 49, background: 'rgba(0,0,0,0.6)' }} />
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
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--t1)' }}>Tile Marketplace</div>
                <div style={{ fontSize: 10, color: 'var(--t4)', marginTop: 1 }}>
                  {stats.listings} listings · ${stats.total_value.toLocaleString()} total · ERC-721 NFTs
                </div>
              </div>
              <button
                onClick={() => setShow(false)}
                style={{ background: 'var(--s3)', border: 'none', color: 'var(--t2)', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >×</button>
            </div>

            <div style={{ padding: '14px 18px' }}>
              {/* Stats row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
                {[
                  { l: 'Listings',    v: stats.listings },
                  { l: 'Total Value', v: `$${(stats.total_value || 0).toLocaleString('en', { maximumFractionDigits: 0 })}` },
                  { l: 'Avg Price',   v: `$${(stats.avg_price || 0).toFixed(0)}` },
                ].map(({ l, v }) => (
                  <div key={l} style={{ padding: '10px 8px', borderRadius: 9, background: 'var(--s2)', textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 800, color: 'var(--t1)', letterSpacing: '-0.03em', lineHeight: 1, marginBottom: 3 }}>{v}</div>
                    <div className="label">{l}</div>
                  </div>
                ))}
              </div>

              {loading && (
                <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--t4)', fontSize: 11 }}>Loading listings…</div>
              )}

              {!loading && listings.length === 0 && (
                <div style={{ padding: '32px 0', textAlign: 'center' }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>🏪</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t2)', marginBottom: 6 }}>No listings yet</div>
                  <div style={{ fontSize: 11, color: 'var(--t4)', lineHeight: 1.6 }}>
                    Own a tile? List it for sale to other players.<br />
                    Connect your wallet and click a tile you own.
                  </div>
                </div>
              )}

              {!loading && listings.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
                  {listings.map(l => (
                    <ListingCard key={l.tile_key} listing={l} onBuy={openBuy} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}
