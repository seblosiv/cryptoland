/**
 * User Store — CryptoLand
 * ========================
 * Manages the current user's account data:
 *  - Profile (auto-created from wallet address)
 *  - Owned tiles (from DB, enriched)
 *  - Guardians deployed
 *  - Affiliate summary
 *
 * Wallet address IS the identity — no username/password.
 */

import { create } from 'zustand'
import { api } from '../lib/api'

export const useUserStore = create((set, get) => ({
  // ── State ──────────────────────────────────────────────────────────────────
  profile:    null,    // { wallet, created_at, tile_count, guardian_count }
  tiles:      [],      // owned tiles from DB
  guardians:  [],      // deployed guardians
  affiliate:  null,    // { code, total_referrals, total_earned, pending_balance, redeemed }
  loading:    false,
  error:      null,
  accountModalOpen: false,

  // ── Actions ───────────────────────────────────────────────────────────────

  openAccountModal:  () => set({ accountModalOpen: true }),
  closeAccountModal: () => set({ accountModalOpen: false }),

  /** Upsert user on wallet connect, then load full account */
  initUser: async (wallet) => {
    if (!wallet) return
    set({ loading: true, error: null })
    try {
      await api.upsertUser(wallet)
      await get().loadAccount(wallet)
    } catch (err) {
      set({ loading: false, error: err.message })
    }
  },

  /** Shape the raw /account response into store state (shared by both paths). */
  _applyAccount: (data) => {
    // Backend returns { user, tiles, guardians, listings, affiliate }
    const profile = data.user ? {
      ...data.user,
      tile_count:     data.tiles?.length     ?? 0,
      guardian_count: data.guardians?.length ?? 0,
    } : null
    // Normalize affiliate field names
    const aff = data.affiliate ? {
      code:            data.affiliate.code,
      total_referrals: data.affiliate.recent?.length ?? 0,
      total_earned:    data.affiliate.total_earned ?? 0,
      pending_balance: data.affiliate.balance_usd  ?? 0,
      redeemed:        data.affiliate.total_paid   ?? 0,
      recent:          data.affiliate.recent       ?? [],
    } : null
    set({
      profile,
      tiles:     data.tiles     ?? [],
      guardians: data.guardians ?? [],
      affiliate: aff,
      loading:   false,
      error:     null,
    })
  },

  /** Load full account dashboard data by wallet (wallet-authed user). */
  loadAccount: async (wallet) => {
    if (!wallet) return
    set({ loading: true })
    try {
      const data = await api.fetchAccount(wallet)
      get()._applyAccount(data)
    } catch (err) {
      set({ loading: false, error: err.message })
    }
  },

  /** Load the current account via bearer token (email/guest user, no wallet). */
  loadAccountMe: async () => {
    set({ loading: true })
    try {
      const data = await api.fetchAccountMe()
      get()._applyAccount(data)
    } catch (err) {
      set({ loading: false, error: err.message })
    }
  },

  /** Called after a purchase to refresh tile list */
  refreshTiles: async (wallet) => {
    if (!wallet) return
    try {
      const data = await api.fetchAccount(wallet)
      const profile = data.user ? {
        ...data.user,
        tile_count:     data.tiles?.length     ?? 0,
        guardian_count: data.guardians?.length ?? 0,
      } : null
      set({ tiles: data.tiles ?? [], profile: profile ?? get().profile })
    } catch {}
  },

  /** Reset on wallet disconnect */
  reset: () => set({
    profile:   null,
    tiles:     [],
    guardians: [],
    affiliate: null,
    loading:   false,
    error:     null,
  }),
}))
