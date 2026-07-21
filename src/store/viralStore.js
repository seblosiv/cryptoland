/**
 * Viral Store — CryptoLand 2026 frontier features
 * ================================================
 * Centralises state for:
 *   - Living Guardian Agent feed (public, polled)
 *   - Daily LandDrop (timer + claim state + last result)
 *   - Squads (current squad summary, leaderboard)
 *   - Public agent feed panel open/closed state
 *
 * Polling cadence:
 *   - agent feed:  every 30s (live drama)
 *   - drop state:  every 15s (so countdown stays sync'd)
 *   - squad:       on demand (no poll — refresh after actions)
 */

import { create } from 'zustand'
import { api } from '../lib/api'

const POLL_AGENT_FEED_MS = 30_000
const POLL_DROP_MS = 15_000

export const useViralStore = create((set, get) => ({
  // ── Agent feed ─────────────────────────────────────────────────────────────
  agentPosts:        [],
  agentLoading:      false,
  agentError:        null,
  agentPanelOpen:    false,
  _agentPollTimer:   null,

  loadAgentFeed: async () => {
    set({ agentLoading: true })
    try {
      const data = await api.fetchAgentFeed(40)
      set({ agentPosts: data.posts || [], agentLoading: false, agentError: null })
    } catch (e) {
      set({ agentError: e.message || 'Failed to load agent feed', agentLoading: false })
    }
  },

  startAgentPolling: () => {
    const prev = get()._agentPollTimer
    if (prev) clearInterval(prev)
    get().loadAgentFeed()
    const t = setInterval(() => get().loadAgentFeed(), POLL_AGENT_FEED_MS)
    set({ _agentPollTimer: t })
  },

  stopAgentPolling: () => {
    const prev = get()._agentPollTimer
    if (prev) clearInterval(prev)
    set({ _agentPollTimer: null })
  },

  openAgentPanel:  () => set({ agentPanelOpen: true }),
  closeAgentPanel: () => set({ agentPanelOpen: false }),
  toggleAgentPanel: () => set(s => ({ agentPanelOpen: !s.agentPanelOpen })),

  postAgentThought: async (tileKey, body, mood = 'proud') => {
    try {
      await api.postAgentThought(tileKey, { body, mood, kind: 'thought' })
      await get().loadAgentFeed()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  },

  // ── Daily LandDrop ─────────────────────────────────────────────────────────
  dropState:         null,    // { date_utc, window_start_ms, window_end_ms, status, ... }
  dropLastResult:    null,    // { rarity, tile_key, country, share_grid, choice_idx }
  dropModalOpen:     false,
  dropClaimError:    null,
  _dropPollTimer:    null,

  loadDropState: async () => {
    try {
      const s = await api.fetchDropToday()
      set({ dropState: s })
    } catch (e) {
      // silent — drop is non-critical
    }
  },

  startDropPolling: () => {
    const prev = get()._dropPollTimer
    if (prev) clearInterval(prev)
    get().loadDropState()
    const t = setInterval(() => get().loadDropState(), POLL_DROP_MS)
    set({ _dropPollTimer: t })
  },

  stopDropPolling: () => {
    const prev = get()._dropPollTimer
    if (prev) clearInterval(prev)
    set({ _dropPollTimer: null })
  },

  openDropModal:  () => {
    get().loadDropState()
    set({ dropModalOpen: true, dropClaimError: null })
  },
  closeDropModal: () => set({ dropModalOpen: false }),

  claimDrop: async (choice_idx) => {
    set({ dropClaimError: null })
    try {
      const r = await api.claimDrop(choice_idx)
      set({ dropLastResult: r })
      get().loadDropState()  // refresh to mark already_claimed
      return { ok: true, result: r }
    } catch (e) {
      const msg = e.message || 'Claim failed'
      set({ dropClaimError: msg })
      return { ok: false, error: msg }
    }
  },

  // ── Squads ─────────────────────────────────────────────────────────────────
  mySquad:           null,    // { squad_id, code, name, members[], yield_multiplier, healthy, ... }
  squadLeaderboard:  [],
  squadLoading:      false,
  squadError:        null,
  squadPanelOpen:    false,

  openSquadPanel: () => {
    get().loadMySquad()
    get().loadSquadLeaderboard()
    set({ squadPanelOpen: true })
  },
  closeSquadPanel: () => set({ squadPanelOpen: false }),

  loadMySquad: async () => {
    set({ squadLoading: true })
    try {
      const r = await api.fetchMySquad()
      set({ mySquad: r.squad, squadLoading: false, squadError: null })
    } catch (e) {
      set({ squadError: e.message, squadLoading: false })
    }
  },

  loadSquadLeaderboard: async () => {
    try {
      const r = await api.fetchSquadLeaderboard()
      set({ squadLeaderboard: r.squads || [] })
    } catch {}
  },

  createSquad: async (name) => {
    set({ squadError: null })
    try {
      const r = await api.createSquad(name)
      await get().loadMySquad()
      await get().loadSquadLeaderboard()
      return { ok: true, squad: r }
    } catch (e) {
      set({ squadError: e.message })
      return { ok: false, error: e.message }
    }
  },

  joinSquad: async (code) => {
    set({ squadError: null })
    try {
      await api.joinSquad(code)
      await get().loadMySquad()
      await get().loadSquadLeaderboard()
      return { ok: true }
    } catch (e) {
      set({ squadError: e.message })
      return { ok: false, error: e.message }
    }
  },

  leaveSquad: async () => {
    try {
      await api.leaveSquad()
      set({ mySquad: null })
      await get().loadSquadLeaderboard()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  },
}))
