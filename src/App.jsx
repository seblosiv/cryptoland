import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useGameStore } from './store/gameStore'
import { useGuardianStore } from './store/guardianStore'
import { lngLatToTile, tileKey, tileCenter, tileBasePrice } from './lib/tiles'
import { PURCHASE_ZOOM } from './store/gameStore'
import GameMap from './components/Map'
import HUD from './components/HUD'
import PurchasePanel from './components/PurchasePanel'
import PaymentModal from './components/PaymentModal'
import LiveFeed from './components/LiveFeed'
import { MapTooltip } from './components/HoverTooltip'
import Sidebar from './components/Sidebar'
import SearchBar from './components/SearchBar'
import CustomizeModal from './components/CustomizeModal'
import GuardianModal from './components/GuardianModal'
import RaidModal from './components/RaidModal'
import MarketSidebar from './components/MarketSidebar'
import WalletModal from './components/WalletModal'
import MarketplaceModal from './components/MarketplaceModal'
import DAOModal from './components/DAOModal'
import TokenPanel from './components/TokenPanel'
import AccountModal from './components/AccountModal'
import AuthModal from './components/AuthModal'
import EmpireCard from './components/EmpireCard'
import PublicEmpire from './components/PublicEmpire'
import EcosystemPage from './components/EcosystemPage'
import PersonalPlaceOnboarding from './components/PersonalPlaceOnboarding'
import AgentFeedPanel from './components/AgentFeedPanel'
import LandDropModal from './components/LandDropModal'
import SquadPanel from './components/SquadPanel'
import { useWalletStore } from './store/walletStore'
import { useDAOStore } from './store/daoStore'
import { useTokenStore } from './store/tokenStore'
import { useUserStore } from './store/userStore'
import { useAffiliateStore } from './store/affiliateStore'
import { useAuthStore } from './store/authStore'
import { useStreakStore } from './store/streakStore'
import { analytics } from './lib/analytics'
import { applyProfileTheme } from './lib/chainProfile.js'
import ChainOnboarding from './components/ChainOnboarding'

function parseRoute(path) {
  const m = /^\/u\/([^/?#]+)/.exec(path || '')
  if (m) return { kind: 'empire', handle: decodeURIComponent(m[1]) }
  if (/^\/ecosystem\/?$/.test(path || '')) return { kind: 'ecosystem' }
  return { kind: 'game' }
}

export default function App() {
  const selectBlock            = useGameStore(s => s.setSelectedKey)
  const loadBlocksFromServer   = useGameStore(s => s.loadBlocksFromServer)
  const dbError                = useGameStore(s => s.dbError)
  const customizeModal         = useGameStore(s => s.customizeModal)
  const loadGuardiansSummary   = useGuardianStore(s => s.loadGuardiansSummary)
  const loadPersonalities      = useGuardianStore(s => s.loadPersonalities)
  const guardianModalOpen      = useGuardianStore(s => s.guardianModal.open)
  const raidModalOpen          = useGuardianStore(s => s.raidModal.open)
  const tryReconnect           = useWalletStore(s => s.tryReconnect)
  const walletAddress          = useWalletStore(s => s.address)
  const daoModalOpen           = useDAOStore(s => s.daoModal)
  const tokenModalOpen         = useTokenStore(s => s.tokenModal)
  const accountModalOpen       = useUserStore(s => s.accountModalOpen)
  const initUser               = useUserStore(s => s.initUser)
  const initSession            = useAffiliateStore(s => s.initSession)
  const bindWallet             = useAffiliateStore(s => s.bindWallet)
  const loadMyCode             = useAffiliateStore(s => s.loadMyCode)
  const tryRestoreAuth         = useAuthStore(s => s.tryRestoreAuth)
  const authModalOpen          = useAuthStore(s => s.authModalOpen)
  const loginWithWallet        = useAuthStore(s => s.loginWithWallet)
  const authUser               = useAuthStore(s => s.user)
  const authReady              = useAuthStore(s => s.authReady)
  const linkWalletAuth         = useAuthStore(s => s.linkWallet)
  const loadMyStreak           = useStreakStore(s => s.loadMine)
  const loadStreakOwners       = useStreakStore(s => s.loadOwners)
  const [mousePos, setMousePos] = useState(null)
  // Intro overlay — only on first visit ever. Skip on subsequent loads so we
  // don't bombard returning visitors with popups.
  const [showIntro, setShowIntro] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      // Allow forcing via ?intro=1, or skip via ?intro=0
      if (params.get('intro') === '1') return true
      if (params.get('intro') === '0') return false
      // Skip if user has visited before
      if (localStorage.getItem('cl-intro-seen')) return false
    } catch {}
    return true
  })
  // Simple URL-driven routing — `/u/{handle}` shows the public empire viewer.
  const [route, setRoute] = useState(() => parseRoute(window.location.pathname))
  // Onboarding — only explicit opt-in via ?onboard=1, never auto-shown.
  // First-visit users already see the intro overlay; we don't stack a second
  // popup. The onboarding flow can be reached later via a HUD button if needed.
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      if (params.has('onboard')) return true
    } catch {}
    return false
  })
  const flyToRef = useRef(null)

  // Chain theming: push the active profile's accent into CSS custom properties
  // once at boot, so every var(--chain-accent) consumer tints per deployment.
  useEffect(() => { applyProfileTheme() }, [])

  // Listen for back/forward + custom navigation events
  useEffect(() => {
    const onPop = () => {
      setRoute(parseRoute(window.location.pathname))
      try {
        const params = new URLSearchParams(window.location.search)
        if (params.has('onboard')) setShowOnboarding(true)
      } catch {}
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // Boot: restore auth token from localStorage, then boot session
  useEffect(() => {
    tryRestoreAuth()
    initSession()
  }, [])

  // Streak: load on auth change, refresh map badges on boot
  useEffect(() => {
    if (authUser || walletAddress) loadMyStreak()
  }, [authUser?.user_id, walletAddress])
  useEffect(() => { loadStreakOwners() }, [])

  // When wallet connects: link to auth account (or create wallet-only account)
  // Also bind session and load affiliate code
  useEffect(() => {
    if (!walletAddress) return
    // Wait until the stored session has been restored before deciding whether
    // to link the wallet to an existing account or create a wallet-only one.
    // Otherwise a wallet that resolves before /auth/me can mint a wallet-only
    // token that clobbers the real session.
    if (!authReady) return
    initUser(walletAddress)
    bindWallet(walletAddress)
    loadMyCode(walletAddress)
    if (authUser) {
      linkWalletAuth(walletAddress).catch(() => {})
    } else {
      loginWithWallet(walletAddress).catch(() => {})
    }
  }, [walletAddress, authReady])

  // When email user logs in (no wallet): load their affiliate code too
  useEffect(() => {
    if (!authUser || walletAddress) return   // wallet path handled above
    loadMyCode(null)
  }, [authUser?.user_id])

  useEffect(() => {
    // Boot: load blocks + guardian summaries + personalities + wallet reconnect in parallel
    tryReconnect()
    Promise.all([
      loadBlocksFromServer(),
      loadGuardiansSummary(),
      loadPersonalities(),
    ]).then(() => {
      const params = new URLSearchParams(window.location.search)
      const blockParam = params.get('block')
      if (blockParam && /^\d+:\d+$/.test(blockParam)) {
        const [tx, ty] = blockParam.split(':').map(Number)
        selectBlock(blockParam)
        const tryFly = (attempts = 0) => {
          if (flyToRef.current) {
            const [lng, lat] = tileCenter(tx, ty)
            flyToRef.current(lng, lat, 13)
          } else if (attempts < 20) setTimeout(() => tryFly(attempts + 1), 200)
        }
        tryFly()
      }
    })
  }, [])

  const handleMouseMove   = useCallback((e) => setMousePos({ x: e.clientX, y: e.clientY }), [])
  const handleTouchStart  = useCallback(() => setMousePos(null), [])
  const handleBlockClick  = useCallback((info) => {
    selectBlock(info.key)
    analytics.tileClick(info.key, info.country ?? '')
  }, [selectBlock])

  // ── Route: /u/{handle} → public empire viewer ────────────────────────────
  if (route.kind === 'empire') {
    return <PublicEmpire handle={route.handle} />
  }

  // ── Route: /ecosystem → grant-reviewer landing page ──────────────────────
  if (route.kind === 'ecosystem') {
    return <EcosystemPage />
  }

  const dismissOnboarding = () => {
    setShowOnboarding(false)
    try { localStorage.setItem('cl-onboard-seen', '1') } catch { /* localStorage unavailable */ }
  }

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      onMouseMove={handleMouseMove}
      onTouchStart={handleTouchStart}
    >
      <GameMap onBlockClick={handleBlockClick} flyToRef={flyToRef} />

      <HUD />
      <SearchBar onFlyTo={(lng, lat) => flyToRef.current?.(lng, lat, 13)} />
      <PurchasePanel />
      <Sidebar />
      <MarketSidebar />
      <LiveFeed />
      <MapTooltip mousePos={mousePos} />
      <PaymentModal />
      {customizeModal && <CustomizeModal />}
      {guardianModalOpen && <GuardianModal />}
      {raidModalOpen && <RaidModal />}
      <WalletModal />
      <MarketplaceModal />
      {daoModalOpen     && <DAOModal />}
      {tokenModalOpen   && <TokenPanel />}
      {accountModalOpen && <AccountModal />}
      {authModalOpen    && <AuthModal />}
      {/* 2026 frontier viral panels */}
      <AgentFeedPanel />
      <LandDropModal />
      <SquadPanel />
      <EmpireCard />
      {showOnboarding && (
        <PersonalPlaceOnboarding onClose={dismissOnboarding} flyToRef={flyToRef} />
      )}

      {dbError && (
        <div style={{
          position: 'fixed',
          top: 'max(80px, calc(80px + var(--sat)))',
          left: '50%', transform: 'translateX(-50%)',
          zIndex: 100,
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 16px',
          background: 'var(--s2)',
          border: '1px solid rgba(248,113,113,0.2)',
          borderRadius: 12,
          boxShadow: 'var(--sh-md)',
          maxWidth: 'calc(100vw - 32px)',
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--red)', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--t2)' }}>Backend unreachable</span>
          <button onClick={loadBlocksFromServer} className="btn-ghost" style={{ height: 32, padding: '0 14px', fontSize: 12, borderRadius: 8 }}>
            Retry
          </button>
        </div>
      )}

      {showIntro && (
        <ChainOnboarding onEnter={() => {
          try { localStorage.setItem('cl-intro-seen', '1') } catch {}
          setShowIntro(false)
        }} />
      )}
    </div>
  )
}
