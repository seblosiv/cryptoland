/**
 * Token Store — CryptoLand
 * =========================
 * $CLND token economics (pre-TGE: off-chain ledger).
 *
 * Token design:
 *   Supply:     100,000,000 $CLND
 *   Earn:       100 $CLND per owned tile (staked passively)
 *   Earn:       Guardian yield (budget * 5% per epoch)
 *   Earn:       Marketplace fees distributed pro-rata to stakers
 *   Governance: 1 $CLND = 1 vote in DAO
 *   Utility:    Unlock Guardian upgrades, purchase premium cosmetics, DAO participation
 *
 * Post-TGE: replace API calls with on-chain reads via walletStore.
 */

import { create } from 'zustand'
import { api } from '../lib/api'

export const TOKEN_SYMBOL  = 'CLND'
export const TOKEN_SUPPLY  = 100_000_000
export const TOKEN_PER_TILE = 100
export const GUARDIAN_YIELD_RATE = 0.05  // 5% of guardian budget per epoch

export const useTokenStore = create((set, get) => ({
  balance:      null,    // $CLND balance for connected wallet
  tilesOwned:   0,
  stakeAmount:  0,
  pendingYield: 0,
  apyEstimate:  '12-18%',
  loading:      false,
  tokenModal:   false,
  lastFetched:  null,

  openTokenModal:  () => set({ tokenModal: true }),
  closeTokenModal: () => set({ tokenModal: false }),

  loadStaking: async (wallet) => {
    if (!wallet) return
    set({ loading: true })
    try {
      const data = await api.fetchStaking(wallet)
      set({
        tilesOwned:   data.tiles_owned,
        stakeAmount:  data.stake_clnd,
        pendingYield: data.pending_yield,
        apyEstimate:  data.apy_estimate,
        balance:      data.stake_clnd,
        loading:      false,
        lastFetched:  Date.now(),
      })
    } catch {
      set({ loading: false })
    }
  },
}))
