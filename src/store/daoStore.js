/**
 * DAO Store — CryptoLand
 * =======================
 * Governance: proposals, voting, results.
 * Off-chain voting backed by our own DB (pre-token-launch).
 * Post-TGE: migrate to Snapshot.org or on-chain governance.
 */

import { create } from 'zustand'
import { api } from '../lib/api'
import { analytics } from '../lib/analytics'

export const useDAOStore = create((set, get) => ({
  proposals:   [],
  loading:     false,
  daoModal:    false,
  lastFetched: null,

  loadProposals: async (force = false) => {
    const { lastFetched, loading } = get()
    if (loading) return
    if (!force && lastFetched && Date.now() - lastFetched < 120_000) return
    set({ loading: true })
    try {
      const proposals = await api.fetchDAOProposals()
      set({ proposals, loading: false, lastFetched: Date.now() })
    } catch {
      set({ loading: false })
    }
  },

  openDAOModal:  () => set({ daoModal: true }),
  closeDAOModal: () => set({ daoModal: false }),

  vote: async (proposalId, voter, vote) => {
    const result = await api.castDAOVote({ proposal_id: proposalId, voter, vote })
    analytics.daoVote(proposalId, vote)
    // Optimistic update
    set(s => ({
      proposals: s.proposals.map(p =>
        p.id === proposalId
          ? { ...p, votes_for: result.votes_for, votes_against: result.votes_against }
          : p
      )
    }))
    return result
  },

  createProposal: async (data) => {
    const result = await api.createDAOProposal(data)
    await get().loadProposals(true)
    return result
  },
}))
