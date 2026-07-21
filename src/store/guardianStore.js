/**
 * Guardian Agent Store — CryptoLand
 * ===================================
 * Zustand slice managing all Guardian Agent state.
 * Kept separate from gameStore.js to maintain modularity.
 *
 * State shape:
 *   guardians       Map<tile_key, GuardianData>  — deployed guardians (from /guardians/summary)
 *   personalities   Object                        — available personalities from server
 *   guardianModal   { open, tileKey, tab }        — Guardian config modal state
 *   raidModal       { open, attackerKey, step }   — Raid modal state
 *   profileCache    Map<tile_key, ProfileData>    — cached territory profiles
 *   reportCache     Map<tile_key, ReportData[]>   — cached daily reports
 */

import { create } from 'zustand'
import { api } from '../lib/api'

function loadLocalGuardians() {
  try { return new Map(JSON.parse(localStorage.getItem('cl-guardians') || '[]')) }
  catch { return new Map() }
}
function saveLocalGuardians(map) {
  localStorage.setItem('cl-guardians', JSON.stringify([...map]))
}

export const useGuardianStore = create((set, get) => ({
  // ── Deployed guardians (summary — tile_key → {personality, level}) ──
  guardians:    loadLocalGuardians(),
  personalities: {},

  // ── Modal state ──
  guardianModal: { open: false, tileKey: null, tab: 'deploy' },
  raidModal:     { open: false, attackerKey: null, step: 'select' },

  // ── Caches ──
  profileCache: new Map(),
  reportCache:  new Map(),

  // ── Loading / error ──
  loading: false,
  error:   null,
  raidResult: null,

  // ── Actions ─────────────────────────────────────────────────────────────────

  /**
   * Load all deployed guardian summaries (for map shield icons).
   * Called once on app boot. Always fetches fresh — localStorage is only
   * a fallback for offline display between refreshes.
   */
  loadGuardiansSummary: async () => {
    try {
      const list = await api.fetchGuardiansSummary()
      const map  = new Map(list.map(g => [g.tile_key, g]))
      set({ guardians: map })
      saveLocalGuardians(map)
    } catch {
      // Non-critical — map works without guardian overlays
      // localStorage fallback already loaded in initial state
    }
  },

  /**
   * Load available personality types from server (once).
   */
  loadPersonalities: async () => {
    if (Object.keys(get().personalities).length > 0) return
    try {
      const data = await api.fetchPersonalities()
      set({ personalities: data })
    } catch {
      // Fallback personalities if server is down
      set({
        personalities: {
          aggressive: { label: 'Aggressive', icon: '⚔️', color: '#f87171', description: 'High attack, low defense.' },
          balanced:   { label: 'Balanced',   icon: '⚖️', color: '#60a5fa', description: 'Solid all-rounder.' },
          passive:    { label: 'Passive',     icon: '🛡️', color: '#4ade80', description: 'Maximum defense.' },
        }
      })
    }
  },

  // ── Guardian modal ─────────────────────────────────────────────────────────

  openGuardianModal: (tileKey, tab = 'deploy') =>
    set({ guardianModal: { open: true, tileKey, tab } }),

  closeGuardianModal: () =>
    set({ guardianModal: { open: false, tileKey: null, tab: 'deploy' } }),

  // ── Raid modal ─────────────────────────────────────────────────────────────

  openRaidModal: (attackerKey) =>
    set({ raidModal: { open: true, attackerKey, step: 'select' }, raidResult: null }),

  closeRaidModal: () =>
    set({ raidModal: { open: false, attackerKey: null, step: 'select' }, raidResult: null }),

  // ── Deploy / remove guardian ───────────────────────────────────────────────

  deployGuardian: async ({ tileKey, owner, personality, budget }) => {
    set({ loading: true, error: null })
    try {
      const guardian = await api.deployGuardian({ tile_key: tileKey, owner, personality, budget })
      const guardians = new Map(get().guardians)
      guardians.set(tileKey, {
        tile_key: tileKey,
        personality: guardian.personality,
        level: guardian.level,
      })
      saveLocalGuardians(guardians)
      set({ guardians, loading: false })
      return guardian
    } catch (err) {
      set({ loading: false, error: err.message })
      throw err
    }
  },

  removeGuardian: async (tileKey, owner) => {
    set({ loading: true, error: null })
    try {
      await api.removeGuardian(tileKey, owner)
      const guardians = new Map(get().guardians)
      guardians.delete(tileKey)
      saveLocalGuardians(guardians)
      set({ guardians, loading: false })
    } catch (err) {
      set({ loading: false, error: err.message })
      throw err
    }
  },

  // ── Reports ────────────────────────────────────────────────────────────────

  loadReports: async (tileKey) => {
    set({ loading: true })
    try {
      const reports = await api.fetchGuardianReports(tileKey)
      const reportCache = new Map(get().reportCache)
      reportCache.set(tileKey, reports)
      set({ reportCache, loading: false })
      return reports
    } catch (err) {
      set({ loading: false, error: err.message })
      return []
    }
  },

  // ── Raid ───────────────────────────────────────────────────────────────────

  performRaid: async ({ attackerTile, defenderTile, raidBudget }) => {
    set({ loading: true, error: null, raidResult: null })
    set(s => ({ raidModal: { ...s.raidModal, step: 'resolving' } }))
    try {
      const result = await api.performRaid({
        attacker_tile: attackerTile,
        defender_tile: defenderTile,
        raid_budget:   raidBudget,
      })
      // Refresh guardian summaries to reflect new levels
      await get().loadGuardiansSummary()
      set({
        raidResult: result,
        loading: false,
      })
      set(s => ({ raidModal: { ...s.raidModal, step: 'result' } }))
      return result
    } catch (err) {
      set({ loading: false, error: err.message })
      set(s => ({ raidModal: { ...s.raidModal, step: 'select' } }))
      throw err
    }
  },

  // ── Territory profile ──────────────────────────────────────────────────────

  loadProfile: async (tileKey) => {
    const cached = get().profileCache.get(tileKey)
    if (cached) return cached
    try {
      const profile = await api.fetchTerritoryProfile(tileKey)
      const profileCache = new Map(get().profileCache)
      profileCache.set(tileKey, profile)
      set({ profileCache })
      return profile
    } catch {
      return null
    }
  },
}))
