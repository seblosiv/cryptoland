/**
 * Analytics — CryptoLand
 * =======================
 * Lightweight event tracking layer.
 * All events are sent to our own backend (/analytics/event) for storage in SQLite.
 * The schema is Dune-compatible (can be exported to Dune Analytics CSV upload).
 *
 * Usage:
 *   import { analytics } from '../lib/analytics'
 *   analytics.track('tile_click', { tile_key: '100:200', country: 'Poland' })
 *
 * Events tracked:
 *   page_view          — app loaded
 *   tile_click         — tile selected on map
 *   purchase_open      — purchase panel opened
 *   payment_start      — payment initiated
 *   payment_confirmed  — payment completed
 *   wallet_connect     — wallet connected
 *   wallet_disconnect  — wallet disconnected
 *   nft_mint           — NFT minted on-chain
 *   marketplace_list   — tile listed for sale
 *   marketplace_buy    — tile purchased on marketplace
 *   dao_vote           — DAO vote cast
 *   guardian_deploy    — guardian deployed
 *   raid_launched      — raid initiated
 */

import { ACTIVE_CHAIN_CANONICAL } from './blockchain/config.js'

const BASE = import.meta.env.VITE_API_BASE ?? ''

// Session ID — persisted for the browser tab lifetime
function getSessionId() {
  let id = sessionStorage.getItem('cl-session')
  if (!id) {
    id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
    sessionStorage.setItem('cl-session', id)
  }
  return id
}

// Queue events when offline and flush when back online
let _queue = []
let _flushing = false

async function flush() {
  if (_flushing || _queue.length === 0) return
  _flushing = true
  const batch = _queue.splice(0, 20)
  try {
    await Promise.all(batch.map(ev =>
      fetch(`${BASE}/analytics/event`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(ev),
      }).catch(() => null)
    ))
  } finally {
    _flushing = false
    if (_queue.length > 0) flush()
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', flush)
}

function getWallet() {
  try {
    const raw = localStorage.getItem('cl-wallet')
    return raw ? JSON.parse(raw).address : null
  } catch { return null }
}

export const analytics = {
  track(event, properties = {}) {
    const ev = {
      event,
      session_id: getSessionId(),
      wallet:     getWallet(),
      // Stamp the build's chain so /metrics/grant can report this chain's
      // traction alone rather than every chain combined.
      chain:      ACTIVE_CHAIN_CANONICAL,
      tile_key:   properties.tile_key ?? null,
      properties: Object.keys(properties).length > 0 ? properties : null,
    }
    _queue.push(ev)

    // Fire and forget — don't block UI
    if (navigator.onLine) flush()
  },

  // Convenience wrappers for the most important funnel events
  pageView()                  { this.track('page_view') },
  tileClick(tileKey, country) { this.track('tile_click',    { tile_key: tileKey, country }) },
  purchaseOpen(tileKey)       { this.track('purchase_open', { tile_key: tileKey }) },
  paymentStart(tileKey, cur)  { this.track('payment_start', { tile_key: tileKey, currency: cur }) },
  paymentConfirmed(tileKey, usd) { this.track('payment_confirmed', { tile_key: tileKey, usd_amount: usd }) },
  walletConnect(chain)        { this.track('wallet_connect',    { chain }) },
  walletDisconnect()          { this.track('wallet_disconnect') },
  nftMint(tileKey, txHash)    { this.track('nft_mint',    { tile_key: tileKey, tx_hash: txHash }) },
  marketplacelist(tileKey, price) { this.track('marketplace_list', { tile_key: tileKey, price_usd: price }) },
  marketplaceBuy(tileKey, price)  { this.track('marketplace_buy',  { tile_key: tileKey, price_usd: price }) },
  daoVote(proposalId, vote)   { this.track('dao_vote',   { proposal_id: proposalId, vote }) },
  guardianDeploy(tileKey)     { this.track('guardian_deploy', { tile_key: tileKey }) },
  raidLaunch(from, to)        { this.track('raid_launched', { from_tile: from, to_tile: to }) },
}

// Track page view on load
if (typeof window !== 'undefined') {
  analytics.pageView()
}
