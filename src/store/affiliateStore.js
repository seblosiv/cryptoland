/**
 * Affiliate Store — CryptoLand
 * =============================
 * Manages:
 *  - Anonymous session UUID (created on page load, persisted to localStorage)
 *  - ?ref= landing param capture and localStorage persistence
 *  - Affiliate code fetch (once wallet is connected)
 *  - Earnings / stats
 */

import { create } from 'zustand'
import { api } from '../lib/api'

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

function loadOrCreateSession() {
  try {
    const saved = localStorage.getItem('cl-session-id')
    if (saved) return saved
    const id = generateUUID()
    localStorage.setItem('cl-session-id', id)
    return id
  } catch {
    return generateUUID()
  }
}

function captureLandingRef() {
  try {
    const params = new URLSearchParams(window.location.search)
    const ref = params.get('ref')
    if (ref && /^LAND-[A-F0-9]{6}$/.test(ref)) {
      localStorage.setItem('cl-ref-code', ref)
      return ref
    }
    return localStorage.getItem('cl-ref-code') ?? null
  } catch {
    return null
  }
}

// ── Store ─────────────────────────────────────────────────────────────────────

const SESSION_ID = loadOrCreateSession()
const LANDING_REF = captureLandingRef()

export const useAffiliateStore = create((set, get) => ({
  // ── State ──────────────────────────────────────────────────────────────────
  sessionId:   SESSION_ID,
  landingRef:  LANDING_REF,       // ?ref= code captured at landing
  myCode:      null,              // this wallet's referral code
  stats:       null,              // affiliate stats from server
  leaderboard: [],
  loading:     false,
  initialized: false,             // session registered with server

  // ── Actions ───────────────────────────────────────────────────────────────

  /** Register session with server (call once on app load) */
  initSession: async () => {
    if (get().initialized) return
    const { sessionId, landingRef } = get()
    try {
      await api.createSession(sessionId, null, landingRef, null)
      set({ initialized: true })
    } catch {
      // non-critical — don't block app load
      set({ initialized: true })
    }
  },

  /** Bind session to wallet after connect — call from walletStore.connect */
  bindWallet: async (wallet) => {
    const { sessionId } = get()
    try {
      await api.bindSessionWallet(sessionId, wallet)
    } catch {
      // non-critical
    }
  },

  /** Load affiliate code — uses token auth if logged in, wallet as fallback */
  loadMyCode: async (wallet) => {
    try {
      const hasToken = !!localStorage.getItem('cl-auth-token')
      const data = hasToken
        ? await api.fetchAffiliateCodeMe()
        : wallet ? await api.fetchAffiliateCode(wallet) : null
      if (data?.code) set({ myCode: data.code })
    } catch {
      if (wallet) {
        try {
          const data = await api.fetchAffiliateCode(wallet)
          if (data?.code) set({ myCode: data.code })
        } catch {}
      }
    }
  },

  /** Load full affiliate stats for dashboard — token auth preferred */
  loadStats: async (wallet) => {
    set({ loading: true })
    try {
      const hasToken = !!localStorage.getItem('cl-auth-token')
      const [raw, leaderboard] = await Promise.all([
        hasToken ? api.fetchAffiliateStatsMe() : wallet ? api.fetchAffiliateStats(wallet) : Promise.resolve({}),
        api.fetchAffiliateLeaderboard(),
      ])
      const stats = {
        pending_balance:  raw.balance_usd   ?? 0,
        total_earned:     raw.total_earned  ?? 0,
        redeemed:         raw.total_paid    ?? 0,
        total_referrals:  raw.referrals?.length ?? 0,
        leaderboard_rank: raw.leaderboard_rank,
        last_referral_at: raw.referrals?.[0]?.created_at ?? null,
      }
      set({ stats, leaderboard, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  /** Get the referral URL for sharing */
  getReferralUrl: () => {
    const { myCode } = get()
    if (!myCode) return null
    const base = window.location.origin + window.location.pathname
    return `${base}?ref=${myCode}`
  },

  /** Clear ref code from localStorage (after redemption or explicit clear) */
  clearLandingRef: () => {
    try { localStorage.removeItem('cl-ref-code') } catch {}
    set({ landingRef: null })
  },
}))
