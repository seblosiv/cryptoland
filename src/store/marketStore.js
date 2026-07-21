/**
 * Market Store — CryptoLand
 * ==========================
 * State for the peer-to-peer tile marketplace.
 */

import { create } from 'zustand'
import { api } from '../lib/api'

export const useMarketStore = create((set, get) => ({
  listings:     [],
  stats:        { listings: 0, total_value: 0, avg_price: 0 },
  loading:      false,
  listModal:    false,    // { tileKey, tileData } | false
  buyModal:     false,    // listing | false
  lastFetched:  null,

  loadListings: async (force = false) => {
    const { lastFetched, loading } = get()
    if (loading) return
    if (!force && lastFetched && Date.now() - lastFetched < 60_000) return
    set({ loading: true })
    try {
      const [listings, stats] = await Promise.all([
        api.fetchMarketListings(),
        api.fetchMarketStats(),
      ])
      set({ listings, stats, loading: false, lastFetched: Date.now() })
    } catch {
      set({ loading: false })
    }
  },

  openListModal:  (tileKey, tileData) => set({ listModal: { tileKey, tileData } }),
  closeListModal: () => set({ listModal: false }),
  openBuyModal:   (listing) => set({ buyModal: listing }),
  closeBuyModal:  () => set({ buyModal: false }),

  listTile: async (tileKey, seller, priceUsd, chain, tokenId) => {
    const result = await api.createMarketListing({ tile_key: tileKey, seller, price_usd: priceUsd, chain, token_id: tokenId })
    await get().loadListings(true)
    return result
  },

  removeListing: async (tileKey, seller) => {
    await api.removeMarketListing(tileKey, seller)
    await get().loadListings(true)
  },
}))
