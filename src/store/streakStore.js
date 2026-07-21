/**
 * Streak Store — CryptoLand
 * ==========================
 * Daily check-in retention loop. Snapchat/Wordle/BeReal-style streak
 * counter that drives daily return. Streaks ≥ 7 also surface a public
 * 🔥 badge on the user's tiles.
 *
 * See documentation/viral-strategy.md § Streak Empire
 */

import { create } from 'zustand'
import { api } from '../lib/api'

export const useStreakStore = create((set, get) => ({
  // ── Local user streak state ────────────────────────────────────────────────
  current: 0,
  longest: 0,
  total: 0,
  badge: null,
  checkedInToday: false,
  lastCheckinDay: null,
  loading: false,
  loaded: false,

  // ── Global data (leaderboard + map badges) ─────────────────────────────────
  leaderboard: [],
  ownerStreaks: new Map(),  // wallet/user_id → { streak, badge }

  /** Pull the current user's streak (silent fail if unauthenticated). */
  loadMine: async () => {
    if (get().loading) return
    set({ loading: true })
    try {
      const r = await api.fetchMyStreak()
      set({
        current: r.current_streak ?? 0,
        longest: r.longest_streak ?? 0,
        total: r.total_checkins ?? 0,
        badge: r.badge,
        checkedInToday: !!r.checked_in_today,
        lastCheckinDay: r.last_checkin_day,
        loaded: true,
        loading: false,
      })
    } catch {
      set({ loading: false, loaded: true })
    }
  },

  /** Check in for the day — idempotent. Returns the response. */
  checkin: async () => {
    try {
      const r = await api.streakCheckin()
      set({
        current: r.current_streak,
        longest: r.longest_streak,
        total: r.total_checkins,
        badge: r.badge,
        checkedInToday: true,
        lastCheckinDay: r.last_checkin_day,
      })
      return r
    } catch (err) {
      return { error: err.message }
    }
  },

  /** Top streaks globally — for leaderboard tile. */
  loadLeaderboard: async () => {
    try {
      const list = await api.fetchStreakLeaderboard(25)
      set({ leaderboard: list })
    } catch { /* silent */ }
  },

  /** All wallets/user_ids with streak ≥ 7 — used by Map for badges. */
  loadOwners: async () => {
    try {
      const list = await api.fetchStreakOwners()
      const m = new Map()
      for (const r of list) {
        if (r.wallet) m.set(r.wallet.toLowerCase(), { streak: r.streak, badge: r.badge })
        if (r.user_id) m.set(r.user_id, { streak: r.streak, badge: r.badge })
      }
      set({ ownerStreaks: m })
    } catch { /* silent */ }
  },

  /** Reset on logout. */
  reset: () => set({
    current: 0, longest: 0, total: 0, badge: null,
    checkedInToday: false, lastCheckinDay: null, loaded: false,
  }),
}))
