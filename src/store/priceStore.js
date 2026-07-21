/**
 * Price Events Store — CryptoLand
 * =================================
 * Zustand slice for dynamic pricing data.
 *
 * State shape:
 *   events          PriceEvent[]     — all active global + country events
 *   tileContext     Map<tile_key, TilePriceContext>  — per-tile breakdowns
 *   lastFetched     number | null    — unix ms of last events fetch
 *   loading         boolean
 */

import { create } from 'zustand'
import { api } from '../lib/api'

const STALE_MS = 5 * 60 * 1000   // re-fetch events if older than 5 min

export const SOURCE_META = {
  coingecko:          { label: 'Crypto Market',   icon: '₿',  color: '#f7931a' },
  coingecko_trending: { label: 'Trending Coins',  icon: '🔥', color: '#fb923c' },
  weather:            { label: 'Weather',          icon: '🌤', color: '#60a5fa' },
  wikipedia:          { label: 'Wiki Trending',    icon: '📰', color: '#a78bfa' },
  worldbank:          { label: 'GDP Tier',         icon: '🏦', color: '#34d399' },
}

export const usePriceStore = create((set, get) => ({
  events:      [],
  tileContext: new Map(),
  lastFetched: null,
  loading:     false,
  error:       null,

  loadEvents: async (force = false) => {
    const { lastFetched, loading } = get()
    if (loading) return
    if (!force && lastFetched && Date.now() - lastFetched < STALE_MS) return
    set({ loading: true, error: null })
    try {
      const events = await api.fetchPriceEvents()
      // Don't set lastFetched if backend returned nothing — retry next cycle
      set({ events, lastFetched: events.length > 0 ? Date.now() : null, loading: false })
    } catch (err) {
      set({ loading: false, error: err.message })
    }
  },

  loadTileContext: async (tileKey, country, basePrice) => {
    const cached = get().tileContext.get(tileKey)
    // Use cached value if less than 5 min old
    if (cached && Date.now() - cached._fetchedAt < STALE_MS) return cached
    try {
      const ctx = await api.fetchTilePriceContext(tileKey, country, basePrice)
      const tileContext = new Map(get().tileContext)
      tileContext.set(tileKey, { ...ctx, _fetchedAt: Date.now() })
      set({ tileContext })
      return ctx
    } catch {
      return null
    }
  },

  // Group events by scope for sidebar display
  getGroupedEvents: () => {
    const events = get().events
    const global  = events.filter(e => e.scope === 'global')
    const byCountry = {}
    for (const e of events) {
      if (e.scope.startsWith('country:')) {
        const c = e.scope.slice(8)
        if (!byCountry[c]) byCountry[c] = []
        byCountry[c].push(e)
      }
    }
    return { global, byCountry }
  },
}))
