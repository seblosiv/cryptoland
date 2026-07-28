const BASE = import.meta.env.VITE_API_BASE ?? ''

// Exported so components doing raw fetches (LiveFeed, MarketSidebar) resolve
// against the same API origin — otherwise off-origin deployments silently lose
// those endpoints.
export const API_BASE = BASE

function _getToken() {
  try { return localStorage.getItem('cl-auth-token') } catch { return null }
}

async function req(method, path, body, opts = {}) {
  const headers = {}
  if (body) headers["Content-Type"] = "application/json"
  const token = opts.token ?? _getToken()
  if (token) headers["Authorization"] = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? `HTTP ${res.status}`)
  }
  return res.json()
}

// Tile keys contain ":" which must be encoded in URL path segments
const tk = (key) => encodeURIComponent(key)

export const api = {
  /** Load all purchased blocks from DB (optionally scoped to one chain) */
  fetchBlocks: (chain = null) =>
    req("GET", chain ? `/blocks?chain=${encodeURIComponent(chain)}` : "/blocks"),

  /** Record a purchase — returns the saved block */
  purchaseBlock: (data) => req("POST", "/blocks", data),

  /** Global stats */
  fetchStats: (chain = null) =>
    req("GET", chain ? `/stats?chain=${encodeURIComponent(chain)}` : "/stats"),

  /** Country leaderboard */
  fetchCountryStats: (chain = null) =>
    req("GET", chain ? `/stats/countries?chain=${encodeURIComponent(chain)}` : "/stats/countries"),

  /** Update image_url / label on an owned block */
  customizeBlock: (tileKey, data) => req("PATCH", `/blocks/${tileKey}`, data),

  // ── Guardian Agent API ─────────────────────────────────────────────────────

  /** All deployed guardians — lightweight (tile_key, personality, level) */
  fetchGuardiansSummary: () => req("GET", "/guardians/summary"),

  /** Available personality definitions */
  fetchPersonalities: () => req("GET", "/guardian/personalities"),

  /** Full guardian data with computed stats for one tile */
  fetchGuardian: (tileKey) => req("GET", `/guardian/${tk(tileKey)}`),

  /** Deploy or reconfigure a guardian */
  deployGuardian: (data) => req("POST", "/guardian", data),

  /** Remove a guardian from a tile (ownership derived from bearer token) */
  removeGuardian: (tileKey) =>
    req("DELETE", `/guardian/${tk(tileKey)}`),

  /** Simulated daily activity reports */
  fetchGuardianReports: (tileKey, days = 3) =>
    req("GET", `/guardian-report?tile_key=${tk(tileKey)}&days=${days}`),

  /** Execute a raid */
  performRaid: (data) => req("POST", "/guardian/raid", data),

  /** Raid history for a tile */
  fetchRaidHistory: (tileKey, limit = 10) =>
    req("GET", `/guardian-raids?tile_key=${tk(tileKey)}&limit=${limit}`),

  /** Phase 3: territory profile analysis */
  fetchTerritoryProfile: (tileKey) =>
    req("GET", `/guardian-profile?tile_key=${tk(tileKey)}`),

  // ── Dynamic Pricing API ────────────────────────────────────────────────────

  /** All active price events (for MarketSidebar) */
  fetchPriceEvents: () => req("GET", "/price-events"),

  /** Dynamic multiplier + breakdown for a specific tile */
  fetchTilePriceContext: (tileKey, country, basePrice) =>
    req("GET", `/tile-price-context?tile_key=${tk(tileKey)}&country=${encodeURIComponent(country)}&base_price=${basePrice}`),

  // ── NFT API ────────────────────────────────────────────────────────────────

  /** Record an on-chain NFT mint */
  recordNFTMint: (tileKey, txHash, tokenId, chain = 'unknown', owner = '') =>
    req("POST", "/nft/mint", { tile_key: tileKey, tx_hash: txHash, token_id: String(tokenId), chain, owner }),

  /** Get NFT info for a tile */
  fetchNFTInfo: (tileKey) => req("GET", `/nft/${tk(tileKey)}`),

  // ── Marketplace API ───────────────────────────────────────────────────────

  /** All active marketplace listings */
  fetchMarketListings: (limit = 50, offset = 0) =>
    req("GET", `/marketplace?limit=${limit}&offset=${offset}`),

  /** Marketplace stats */
  fetchMarketStats: () => req("GET", "/marketplace/stats"),

  /** Create a marketplace listing */
  createMarketListing: (data) => req("POST", "/marketplace/list", data),

  /** Remove a marketplace listing (seller derived from bearer token) */
  removeMarketListing: (tileKey) =>
    req("DELETE", `/marketplace/${tk(tileKey)}`),

  // ── DAO API ────────────────────────────────────────────────────────────────

  /** Active DAO proposals */
  fetchDAOProposals: (status = 'active') =>
    req("GET", `/dao/proposals?status=${status}`),

  /** Create a DAO proposal */
  createDAOProposal: (data) => req("POST", "/dao/proposals", data),

  /** Cast a vote */
  castDAOVote: (data) => req("POST", "/dao/vote", data),

  /** Get votes for a proposal */
  fetchDAOVotes: (proposalId) => req("GET", `/dao/votes/${proposalId}`),

  // ── Token / Staking API ───────────────────────────────────────────────────

  /** Staking balance + pending yield for a wallet */
  fetchStaking: (wallet) => req("GET", `/token/staking/${encodeURIComponent(wallet)}`),

  // ── Auth API ───────────────────────────────────────────────────────────────

  /** Register with email + password */
  register: (email, password, username) =>
    req("POST", "/auth/register", { email, password, username }),

  /** Login with email + password — returns { token, user } */
  login: (email, password) =>
    req("POST", "/auth/login", { email, password }),

  /** Get current user from bearer token */
  me: () => req("GET", "/auth/me"),

  /** Logout — invalidates token server-side */
  logout: () => req("POST", "/auth/logout"),

  /** Link a wallet to the authenticated account */
  linkWallet: (wallet) => req("POST", "/auth/link-wallet", { wallet }),

  /** Request a SIWE-style nonce to sign for wallet auth — returns { nonce, message } */
  walletNonce: (wallet) => req("POST", "/auth/wallet/nonce", { wallet }),

  /**
   * Create wallet-only account or return existing — returns { token, user }.
   * Requires a signature over the nonce message (proof of wallet control).
   */
  linkWalletUpsert: (wallet, signature, nonce) =>
    req("POST", "/auth/link-wallet-upsert", { wallet, signature, nonce }),

  /** Convert guest account to full account (set password) */
  guestClaim: (userId, password, username) =>
    req("POST", "/auth/guest-claim", { user_id: userId, password, username }),

  /** Update profile fields */
  updateProfile: (data) => req("PATCH", "/auth/profile", data),

  // ── User / Account API ────────────────────────────────────────────────────

  /** Upsert user record on wallet connect (legacy — prefer linkWalletUpsert) */
  upsertUser: (wallet) => req("POST", "/users/upsert", { wallet }),

  /** Full account data: profile, tiles, guardians, affiliate (token-auth preferred) */
  fetchAccountMe: () => req("GET", "/account/me"),

  /** Full account data by wallet (backwards compat) */
  fetchAccount: (wallet) => req("GET", `/account/${encodeURIComponent(wallet)}`),

  // ── Session API ────────────────────────────────────────────────────────────

  /** Create anonymous session (call on page load) */
  createSession: (sessionId, _unused, refCode = null) =>
    req("POST", "/sessions", {
      session_id: sessionId,
      ref_code:   refCode   ?? undefined,
      user_agent: navigator.userAgent?.slice(0, 200) ?? undefined,
    }),

  /** Bind session to wallet after connect */
  bindSessionWallet: (sessionId, wallet) =>
    req("POST", "/sessions/bind-wallet", { session_id: sessionId, wallet }),

  // ── Affiliate API ─────────────────────────────────────────────────────────

  /** Get or create referral code — token auth, works for any logged-in user */
  fetchAffiliateCodeMe: () => req("GET", "/affiliate/code/me"),

  /** Full affiliate stats — token auth, works for any logged-in user */
  fetchAffiliateStatsMe: () => req("GET", "/affiliate/stats/me"),

  /** Get or create referral code for a wallet (legacy / no-token fallback) */
  fetchAffiliateCode: (wallet) => req("GET", `/affiliate/code/${encodeURIComponent(wallet)}`),

  /** Full affiliate stats for a wallet (legacy / no-token fallback) */
  fetchAffiliateStats: (wallet) => req("GET", `/affiliate/stats/${encodeURIComponent(wallet)}`),

  /** Top affiliates leaderboard */
  fetchAffiliateLeaderboard: () => req("GET", "/affiliate/leaderboard"),

  /** Validate a referral code (returns { valid, referrer_wallet }) */
  validateAffiliateCode: (code) => req("GET", `/affiliate/validate/${encodeURIComponent(code)}`),

  /** Redeem affiliate earnings (cash-out full or partial balance) */
  redeemAffiliateEarnings: (wallet, amount = null) =>
    req("POST", "/affiliate/redeem", { wallet, amount_usd: amount }),

  // ── Streak / daily check-in (viral retention loop) ────────────────────────

  /** Record today's check-in (idempotent within UTC day) */
  streakCheckin: () => req("POST", "/streak/checkin"),

  /** Current user streak status */
  fetchMyStreak: () => req("GET", "/streak/me"),

  /** Top streaks globally */
  fetchStreakLeaderboard: (limit = 25) =>
    req("GET", `/streak/leaderboard?limit=${limit}`),

  /** All wallets with active streaks ≥ 7 (for map badges) */
  fetchStreakOwners: () => req("GET", "/streak/owners"),

  // ── Empire Cards (Wordle-grid-for-land share artifact) ────────────────────

  /** Fetch / generate today's card for the logged-in user */
  fetchMyEmpireCard: () => req("GET", "/share/card/me"),

  /** Public card by handle (used for share preview pages) */
  fetchPublicEmpireCard: (handle) =>
    req("GET", `/share/card/${encodeURIComponent(handle)}`),

  /** Increment share count when user shares the card */
  incrementShareCount: (handle) =>
    req("POST", `/share/card/${encodeURIComponent(handle)}/share`),

  /** Full public empire snapshot for the /u/{handle} page */
  fetchPublicEmpire: (handle) =>
    req("GET", `/empire/${encodeURIComponent(handle)}`),

  // ── Personal place onboarding (Find your home) ────────────────────────────

  /** Search for a real-world place (Nominatim-backed) */
  searchPlace: (q, limit = 6) =>
    req("GET", `/search/place?q=${encodeURIComponent(q)}&limit=${limit}`),

  // ── Viral features (2026 frontier) ────────────────────────────────────────

  /** Public global feed of Guardian agent thoughts */
  fetchAgentFeed: (limit = 30) =>
    req("GET", `/agents/feed?limit=${limit}`),

  /** Per-tile guardian recent thoughts */
  fetchAgentRecent: (tileKey, limit = 5) =>
    req("GET", `/agents/${tk(tileKey)}/recent?limit=${limit}`),

  /** Owner publishes a custom Guardian post (auth required) */
  postAgentThought: (tileKey, body) =>
    req("POST", `/agents/${tk(tileKey)}/post`, body),

  /** Today's Daily LandDrop state */
  fetchDropToday: () => req("GET", "/drop/today"),

  /** Claim today's LandDrop with a choice index (0,1,2) */
  claimDrop: (choice_idx) => req("POST", "/drop/claim", { choice_idx }),

  /** Recent global LandDrop feed */
  fetchDropFeed: (limit = 20) => req("GET", `/drop/feed?limit=${limit}`),

  /** Squad — create */
  createSquad: (name) => req("POST", "/squads/create", { name }),

  /** Squad — join by code */
  joinSquad: (code) => req("POST", "/squads/join", { code }),

  /** Squad — leave current squad */
  leaveSquad: () => req("POST", "/squads/leave"),

  /** Squad — get current user's squad */
  fetchMySquad: () => req("GET", "/squads/me"),

  /** Squad — top leaderboard */
  fetchSquadLeaderboard: () => req("GET", "/squads/leaderboard/top"),

  /** Frame share URL — for a public tile share */
  tileFrameUrl: (tileKey) => {
    const base = (typeof window !== 'undefined') ? window.location.origin : ''
    return `${base}/t/${tileKey}`
  },
}
