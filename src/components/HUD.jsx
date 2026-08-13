import { useState, useEffect, useRef } from 'react'
import { useGameStore, TOTAL_TILES, PURCHASE_ZOOM } from '../store/gameStore'
import { KM_PER_TILE } from '../lib/tiles'
import { useIsMobile, useIsNarrow } from '../lib/hooks'
import { useWalletStore } from '../store/walletStore'
import { useUserStore } from '../store/userStore'
import { useAuthStore } from '../store/authStore'
import { useStreakStore } from '../store/streakStore'
import { useShareStore } from '../store/shareStore'
import { ACTIVE_CHAIN } from '../lib/blockchain/config.js'
import TileCertificate from './TileCertificate'
import { AgentFeedChip } from './AgentFeedPanel'
import { LandDropChip } from './LandDropModal'
import { SquadChip } from './SquadPanel'

export default function HUD() {
  const blocks   = useGameStore(s => s.blocks)
  const zoom     = useGameStore(s => s.zoom)
  const stats    = useGameStore(s => s.stats)
  const myBlocks = useGameStore(s => s.myBlocks)
  const isMobile = useIsMobile()
  const isNarrow = useIsNarrow()

  const openWallet    = useWalletStore(s => s.openWalletModal)
  const walletAddress = useWalletStore(s => s.address)
  const shortAddress  = useWalletStore(s => s.shortAddress)
  const ownedTiles    = useWalletStore(s => s.ownedTiles)
  const openAccount   = useUserStore(s => s.openAccountModal)

  const authUser      = useAuthStore(s => s.user)
  const openAuthModal = useAuthStore(s => s.openAuthModal)

  const streakCurrent     = useStreakStore(s => s.current)
  const checkedInToday    = useStreakStore(s => s.checkedInToday)
  const streakLoaded      = useStreakStore(s => s.loaded)
  const doCheckin         = useStreakStore(s => s.checkin)
  const openShareCard     = useShareStore(s => s.openMine)

  const [streakBurst, setStreakBurst] = useState(false)
  const handleStreakClick = async () => {
    if (!authUser && !walletAddress) { openAuthModal?.(); return }
    if (checkedInToday) {
      // Open share card if already checked in
      openShareCard()
      return
    }
    const r = await doCheckin()
    if (r && !r.error) {
      setStreakBurst(true)
      setTimeout(() => setStreakBurst(false), 1200)
    }
  }

  const soldCount = stats.sold || blocks.size
  const totalVol  = stats.volume || 0
  const pct       = ((soldCount / TOTAL_TILES) * 100).toFixed(4)

  const [showPortfolio, setShowPortfolio] = useState(false)
  const [showEmpire, setShowEmpire]       = useState(false)
  const myList = [...myBlocks].map(k => blocks.get(k)).filter(Boolean)

  // Empire stats
  const myCountries  = new Set(myList.map(b => b?.country).filter(Boolean))
  const myTotalValue = myList.reduce((sum, b) => sum + parseFloat(b?.price || '0'), 0)

  return (
    <>
      {/* Top bar */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0,
        zIndex: 10,
        display: 'flex',
        alignItems: 'flex-start',
        flexWrap: 'nowrap',
        gap: 8,
        padding: `max(14px, calc(var(--sat) + 10px)) max(14px, var(--sar)) 0 max(14px, var(--sal))`,
        pointerEvents: 'none',
        overflow: 'visible',
      }}>

        {/* Logo */}
        <div style={{
          pointerEvents: 'auto',
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 16px',
          background: 'var(--s2)',
          // Every button in this bar already carries a hairline; these two
          // containers did not, so the top chrome read as two different systems.
          border: '1px solid var(--b0)',
          borderRadius: 'var(--r-pill)',
          flexShrink: 0,
          boxShadow: 'var(--sh-sm)',
        }}>
          <div className="live-dot" />
          <span style={{
            fontFamily: 'var(--font)', fontWeight: 800,
            fontSize: 14, letterSpacing: '-0.03em', color: 'var(--t1)',
          }}>
            {/* --chain-accent-ui, not --chain-accent: this is 14px text on a dark
                surface, and the raw brand hex is under 2:1 on Cardano and Radix.
                Onboarding paints the wordmark in the accent, so using green here
                made the brand colour change the moment you entered the map. */}
            CRYPTO<span style={{ color: 'var(--chain-accent-ui, var(--green))' }}>LAND</span>
          </span>
        </div>

        {/* Stats */}
        <div style={{
          pointerEvents: 'auto',
          display: 'flex', alignItems: 'stretch',
          background: 'var(--s2)',
          border: '1px solid var(--b0)',
          borderRadius: 'var(--r-pill)',
          overflowX: 'auto', overflowY: 'hidden',
          scrollbarWidth: 'none', flexShrink: 1, minWidth: 0,
          // SearchBar is fixed, centred, and up to 360px wide, so it owns the
          // band from 50vw-180px to 50vw+180px. `100vw - 520px` did not account
          // for that and the search field covered the OWNERS / ~2.4KM / ZOOM
          // cells at 1280, 1440 and 1600 — the traction numbers, buried under a
          // search box, on every laptop. Stop the strip short of that band
          // instead: 180px (half the field) + 16px gap + ~200px logo cluster.
          maxWidth: isMobile ? 'calc(100vw - 190px)' : 'min(520px, calc(50vw - 396px))',
          boxShadow: 'var(--sh-sm)',
        }}>
          <StatCell v={soldCount.toLocaleString()} l="Sold" />
          {!isNarrow && <StatCell v={`${pct}%`} l="Claimed" />}
          {!isMobile && <StatCell v={`$${Number(totalVol).toLocaleString('en',{maximumFractionDigits:0})}`} l="Volume" />}
          {!isMobile && <StatCell v={stats.owners || new Set([...blocks.values()].map(b=>b.owner)).size} l="Owners" />}
          {!isNarrow && <StatCell v={`Z${PURCHASE_ZOOM}`} l={`~${KM_PER_TILE}km`} />}
          <StatCell v={zoom.toFixed(1)} l="Zoom" />

          {myBlocks.size > 0 && (
            <button
              onClick={() => setShowPortfolio(p => !p)}
              style={{
                padding: '10px 16px', flexShrink: 0,
                background: showPortfolio ? 'var(--green-d)' : 'transparent',
                border: 'none',
                borderLeft: '1px solid var(--b0)',
                cursor: 'pointer', transition: 'background 0.12s',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 2, WebkitTapHighlightColor: 'transparent',
                borderRadius: '0 var(--r-pill) var(--r-pill) 0',
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--mono)', letterSpacing: '-0.02em', lineHeight: 1 }}>
                {myBlocks.size}
              </span>
              <span className="label" style={{ color: 'var(--green)' }}>Mine</span>
            </button>
          )}
        </div>

        {/* Right-side buttons — pushed to far right with margin-left: auto */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'flex-start', flexShrink: 0, pointerEvents: 'auto' }}>

          {/* Sign In button — shown when not logged in */}
          {!authUser && (
            <button
              onClick={() => openAuthModal('login')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '0 14px', height: 42, flexShrink: 0,
                background: 'var(--s2)',
                border: '1px solid var(--b0)',
                borderRadius: 'var(--r-pill)',
                color: 'var(--t2)',
                fontSize: 12, fontWeight: 600, fontFamily: 'var(--font)',
                cursor: 'pointer', boxShadow: 'var(--sh-sm)',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span style={{ fontSize: 14 }}>◎</span>
              {!isMobile && <span>Sign In</span>}
            </button>
          )}

          {/* Account button — shown when logged in */}
          {authUser && (
            <button
              onClick={openAccount}
              title={authUser.email || authUser.username || 'Account'}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '0 12px', height: 42, flexShrink: 0,
                background: 'var(--s2)',
                border: '1px solid var(--b0)',
                borderRadius: 'var(--r-pill)',
                color: 'var(--t1)',
                fontSize: 12, fontWeight: 600, fontFamily: 'var(--font)',
                cursor: 'pointer', boxShadow: 'var(--sh-sm)',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span style={{ fontSize: 17, lineHeight: 1 }}>{authUser.avatar_emoji || '◈'}</span>
              {!isMobile && (
                <span style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {authUser.username || authUser.email?.split('@')[0] || 'Account'}
                </span>
              )}
            </button>
          )}

          {/* ── 2026 frontier viral chips ── */}
          {!isMobile && <LandDropChip />}
          {!isMobile && <AgentFeedChip />}
          {!isMobile && (authUser || walletAddress) && <SquadChip />}

          {/* Mobile-compact versions: just an icon button each */}
          {isMobile && <LandDropChip />}
          {isMobile && (authUser || walletAddress) && <SquadChip />}

          {/* Streak / daily check-in chip — only visible when authenticated */}
          {(authUser || walletAddress) && streakLoaded && (
            <button
              onClick={handleStreakClick}
              title={checkedInToday
                ? `Day ${streakCurrent} — tap to share your empire`
                : `Check in to start a streak`}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '0 12px', height: 42, flexShrink: 0,
                background: checkedInToday ? 'rgba(251, 146, 60, 0.12)' : 'var(--s2)',
                border: `1px solid ${checkedInToday ? '#fb923c' : 'var(--b0)'}`,
                borderRadius: 'var(--r-pill)',
                color: checkedInToday ? '#fb923c' : 'var(--t2)',
                fontSize: 12, fontWeight: 700, fontFamily: 'var(--font)',
                cursor: 'pointer', boxShadow: 'var(--sh-sm)',
                WebkitTapHighlightColor: 'transparent',
                transform: streakBurst ? 'scale(1.08)' : 'scale(1)',
                transition: 'transform 0.4s cubic-bezier(0.34,1.56,0.64,1)',
              }}
            >
              <span style={{ fontSize: 14, lineHeight: 1 }}>{checkedInToday ? '🔥' : '✓'}</span>
              {!isMobile && (
                <span>{streakCurrent > 0 ? `${streakCurrent}d` : 'Check in'}</span>
              )}
            </button>
          )}

          {/* Share Empire Card button — visible to logged-in users */}
          {(authUser || walletAddress) && (
            <button
              onClick={openShareCard}
              title="Share my Empire Card"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '0 12px', height: 42, flexShrink: 0,
                background: 'var(--s2)',
                border: '1px solid var(--b0)',
                borderRadius: 'var(--r-pill)',
                color: 'var(--t2)',
                fontSize: 12, fontWeight: 700, fontFamily: 'var(--font)',
                cursor: 'pointer', boxShadow: 'var(--sh-sm)',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span style={{ fontSize: 14, lineHeight: 1 }}>↗</span>
              {!isMobile && <span>Share</span>}
            </button>
          )}

          {/* Wallet button */}
          <button
            onClick={openWallet}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '0 14px', height: 42, flexShrink: 0,
              background: walletAddress ? 'var(--green-d)' : 'var(--s2)',
              border: `1px solid ${walletAddress ? 'rgba(74,222,128,0.25)' : 'var(--b0)'}`,
              borderRadius: 'var(--r-pill)',
              color: walletAddress ? 'var(--green)' : 'var(--t2)',
              fontSize: 12, fontWeight: 700, fontFamily: 'var(--font)',
              cursor: 'pointer', boxShadow: 'var(--sh-sm)',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span style={{ fontSize: 13 }}>{walletAddress ? ACTIVE_CHAIN.logo : '🔗'}</span>
            {!isMobile && (
              <span>{walletAddress ? shortAddress : 'Connect'}</span>
            )}
            {walletAddress && ownedTiles.length > 0 && (
              <span style={{
                fontSize: 9, fontWeight: 800, fontFamily: 'var(--mono)',
                color: 'var(--green)', background: 'rgba(74,222,128,0.15)',
                borderRadius: 4, padding: '1px 5px', marginLeft: 2,
              }}>{ownedTiles.length}</span>
            )}
          </button>

        </div>{/* end right-side buttons */}
      </div>{/* end top bar */}

      {/* My Empire widget — bottom-left, visible when logged in with tiles */}
      {myBlocks.size > 0 && !isMobile && (
        <div style={{
          position: 'fixed',
          left: 'calc(var(--market-w, 0px) + 14px)',
          bottom: 'calc(var(--feed-h) + 14px)',
          zIndex: 16,
          pointerEvents: 'auto',
        }}>
          <button
            onClick={() => setShowEmpire(e => !e)}
            style={{
              display: 'flex', alignItems: 'center', gap: 9,
              padding: '9px 14px',
              background: 'var(--s2)',
              border: '1px solid rgba(74,222,128,0.2)',
              borderRadius: 'var(--r-pill)',
              cursor: 'pointer', boxShadow: 'var(--sh-sm)',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span style={{ fontSize: 15, lineHeight: 1 }}>👑</span>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', lineHeight: 1 }}>Your Empire</span>
              <span style={{ fontSize: 10, color: 'var(--t3)', fontFamily: 'var(--mono)', lineHeight: 1 }}>
                {myBlocks.size} tile{myBlocks.size !== 1 ? 's' : ''} · {myCountries.size} countr{myCountries.size !== 1 ? 'ies' : 'y'} · ${myTotalValue.toFixed(0)}
              </span>
            </div>
            <span style={{ fontSize: 10, color: 'var(--t3)', marginLeft: 2 }}>{showEmpire ? '▾' : '▸'}</span>
          </button>

          {showEmpire && (
            <>
              <div onClick={() => setShowEmpire(false)} style={{ position: 'fixed', inset: 0, zIndex: -1 }} />
              <div className="panel" style={{
                position: 'absolute', bottom: 'calc(100% + 8px)', left: 0,
                width: 240, borderRadius: 14,
                animation: 'scale-in 0.18s cubic-bezier(0.34,1.4,0.64,1)',
                padding: '12px 14px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t1)' }}>👑 My Empire</span>
                  <button onClick={() => setShowEmpire(false)} style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
                  {[
                    [myBlocks.size, 'Tiles'],
                    [myCountries.size, 'Countries'],
                    [`$${myTotalValue.toFixed(0)}`, 'Value'],
                  ].map(([v, l]) => (
                    <div key={l} style={{ padding: '8px 6px', background: 'var(--s2)', borderRadius: 9, textAlign: 'center' }}>
                      <div style={{ fontSize: 14, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--green)', lineHeight: 1, marginBottom: 3 }}>{v}</div>
                      <div className="label">{l}</div>
                    </div>
                  ))}
                </div>
                {myCountries.size > 0 && (
                  <div style={{ fontSize: 10, color: 'var(--t3)', lineHeight: 1.6 }}>
                    {[...myCountries].slice(0, 5).join(' · ')}{myCountries.size > 5 ? ` +${myCountries.size - 5} more` : ''}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Portfolio dropdown */}
      {showPortfolio && myBlocks.size > 0 && (
        <>
          <div
            onClick={() => setShowPortfolio(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 18 }}
          />
          <div className="panel" style={{
            position: 'fixed',
            top: 'calc(max(14px, var(--sat)) + 58px)',
            right: 'max(14px, var(--sar))',
            zIndex: 19,
            width: isMobile ? 'calc(100vw - 28px)' : 280,
            maxHeight: isMobile ? '60dvh' : 360,
            overflowY: 'auto',
            borderRadius: 16,
            animation: 'scale-in 0.2s cubic-bezier(0.34,1.4,0.64,1)',
          }}>
            <div style={{
              padding: '14px 16px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              borderBottom: '1px solid var(--b0)',
              position: 'sticky', top: 0, zIndex: 1,
              background: 'var(--s1)',
              borderRadius: '16px 16px 0 0',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="live-dot" />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>My Blocks</span>
              </div>
              <button
                onClick={() => setShowPortfolio(false)}
                style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4 }}
              >×</button>
            </div>

            {myList.length === 0 && (
              <div style={{ padding: '32px 18px', textAlign: 'center', color: 'var(--t3)', fontSize: 13 }}>
                No blocks loaded yet
              </div>
            )}

            {myList.map(b => <PortfolioRow key={b.key} block={b} onClose={() => setShowPortfolio(false)} />)}

            {myBlocks.size > myList.length && (
              <div style={{ padding: '12px 18px', textAlign: 'center', fontSize: 11, color: 'var(--t3)' }}>
                {myBlocks.size - myList.length} more not yet loaded
              </div>
            )}
          </div>
        </>
      )}
    </>
  )
}

function StatCell({ v, l, flash }) {
  const [lit, setLit] = useState(false)
  const prev = useRef(v)

  useEffect(() => {
    if (v !== prev.current) {
      prev.current = v
      setLit(true)
      const t = setTimeout(() => setLit(false), 700)
      return () => clearTimeout(t)
    }
  }, [v])

  return (
    <div style={{
      padding: '10px 16px', flexShrink: 0,
      borderRight: '1px solid var(--b0)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
      background: lit ? 'rgba(74,222,128,0.08)' : 'transparent',
      transition: 'background 0.5s ease',
    }}>
      {/* .figure carries the mono face, tabular figures and optical tracking.
          Tabular matters here specifically: these counters change while you are
          looking at them, and proportional digits shift width underneath. */}
      <span className="figure" style={{
        fontSize: 13, fontWeight: 700,
        color: lit ? 'var(--green)' : 'var(--t1)',
        whiteSpace: 'nowrap',
        transition: 'color 0.4s ease',
      }}>{v}</span>
      <span className="label label-c">{l}</span>
    </div>
  )
}

function PortfolioRow({ block, onClose }) {
  const setSelectedKey     = useGameStore(s => s.setSelectedKey)
  const openCustomizeModal = useGameStore(s => s.openCustomizeModal)
  const [copied, setCopied]   = useState(false)
  const [showCert, setShowCert] = useState(false)

  const shareUrl = `${window.location.origin}${window.location.pathname}?block=${block.key}`

  const copy = (e) => {
    e.stopPropagation()
    navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <>
      {showCert && (
        <TileCertificate block={block} shareUrl={shareUrl} onClose={() => setShowCert(false)} />
      )}
      <div
        onClick={() => { setSelectedKey(block.key); onClose() }}
        style={{
          padding: '12px 16px',
          display: 'flex', alignItems: 'center', gap: 10,
          borderBottom: '1px solid var(--b0)',
          cursor: 'pointer', transition: 'background 0.1s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--s2)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <div style={{
          width: 8, height: 8,
          borderRadius: '50%',
          background: block.color,
          flexShrink: 0,
        }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {block.country}
          </div>
          <div style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'var(--mono)', marginTop: 1 }}>
            {block.key} · ${block.price}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button
            onClick={e => { e.stopPropagation(); openCustomizeModal(block.key) }}
            title="Customize"
            style={iconBtn}
          >✎</button>
          <button onClick={copy} title="Copy link" style={{ ...iconBtn, color: copied ? 'var(--green)' : undefined }}>
            {copied ? '✓' : '⎘'}
          </button>
          <button
            onClick={e => { e.stopPropagation(); setShowCert(true) }}
            title="View certificate"
            style={iconBtn}
          >🪪</button>
        </div>
      </div>
    </>
  )
}

const iconBtn = {
  width: 28, height: 28, borderRadius: 8,
  background: 'var(--s3)', border: 'none',
  color: 'var(--t2)', cursor: 'pointer', fontSize: 12,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'background 0.1s', WebkitTapHighlightColor: 'transparent',
}
