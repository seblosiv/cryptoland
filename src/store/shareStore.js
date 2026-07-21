/**
 * Share Store — CryptoLand
 * =========================
 * EmpireCard daily-share artifact. The card is the viral payload —
 * one PNG/SVG per user per UTC day, regenerated server-side, cached.
 *
 * See documentation/viral-strategy.md § LandShare Daily Card
 */

import { create } from 'zustand'
import { api } from '../lib/api'

export const useShareStore = create((set) => ({
  // ── Modal state ────────────────────────────────────────────────────────────
  open: false,            // is the share modal currently visible
  card: null,             // current card payload (own or someone else's)
  loading: false,
  error: null,

  // ── Public empire viewer state (used by /u/{handle} pages) ─────────────────
  publicEmpire: null,
  publicLoading: false,
  publicError: null,

  /** Open the share modal — pulls (or generates) today's card for the logged-in user. */
  openMine: async () => {
    set({ open: true, loading: true, error: null, card: null })
    try {
      const card = await api.fetchMyEmpireCard()
      set({ card, loading: false })
    } catch (err) {
      set({ error: err.message, loading: false })
    }
  },

  /** Open the share modal showing a public card for the given handle. */
  openPublic: async (handle) => {
    set({ open: true, loading: true, error: null, card: null })
    try {
      const card = await api.fetchPublicEmpireCard(handle)
      set({ card, loading: false })
    } catch (err) {
      set({ error: err.message, loading: false })
    }
  },

  close: () => set({ open: false, error: null }),

  /** Notify backend that the user shared the card (for analytics). */
  recordShare: async (handle) => {
    if (!handle) return
    try { await api.incrementShareCount(handle) } catch { /* silent */ }
  },

  /** Load the full public empire snapshot for /u/{handle} pages. */
  loadPublicEmpire: async (handle) => {
    set({ publicLoading: true, publicError: null, publicEmpire: null })
    try {
      const data = await api.fetchPublicEmpire(handle)
      set({ publicEmpire: data, publicLoading: false })
    } catch (err) {
      set({ publicError: err.message, publicLoading: false })
    }
  },
}))
