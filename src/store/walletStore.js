/**
 * Wallet Store — CryptoLand
 * ==========================
 * Single source of truth for wallet connection state.
 * Chain-agnostic: works with EVM (MetaMask, Rabby, Coinbase) and Solana (Phantom).
 *
 * State shape:
 *   address      string | null   — connected wallet address
 *   chainId      number | null   — current chain ID
 *   chainName    string | null
 *   balance      string | null   — native token balance (formatted)
 *   ownedTiles   string[]        — tile keys owned by this wallet (on-chain)
 *   connecting   boolean
 *   error        string | null
 *   txHistory    TxRecord[]      — local transaction log
 */

import { create } from 'zustand'
import { ACTIVE_CHAIN, CHAINS } from '../lib/blockchain/config.js'
import { analytics } from '../lib/analytics'

// Lazy-import adapter to avoid top-level await issues in some bundlers
async function getAdapter() {
  return import('../lib/blockchain/index.js')
}

function shortAddr(addr) {
  if (!addr) return null
  if (addr.length > 12) return addr.slice(0, 6) + '…' + addr.slice(-4)
  return addr
}

function loadPersistedWallet() {
  try {
    const raw = localStorage.getItem('cl-wallet')
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function persistWallet(address, chainId) {
  if (address) {
    localStorage.setItem('cl-wallet', JSON.stringify({ address, chainId }))
  } else {
    localStorage.removeItem('cl-wallet')
  }
}

function loadTxHistory() {
  try {
    return JSON.parse(localStorage.getItem('cl-tx-history') || '[]')
  } catch { return [] }
}

function saveTxHistory(history) {
  localStorage.setItem('cl-tx-history', JSON.stringify(history.slice(0, 100)))
}

export const useWalletStore = create((set, get) => ({
  // ── State ──────────────────────────────────────────────────────────────────
  address:     null,
  shortAddress: null,
  chainId:     null,
  chainName:   null,
  balance:     null,
  ownedTiles:  [],
  connecting:  false,
  error:       null,
  walletModal: false,
  txHistory:   loadTxHistory(),

  // ── Computed ───────────────────────────────────────────────────────────────
  isConnected: () => !!get().address,
  activeChain: () => ACTIVE_CHAIN,
  allChains:   () => Object.entries(CHAINS).filter(([, c]) => !c.testnet).map(([k, c]) => ({ key: k, ...c })),

  // ── Actions ────────────────────────────────────────────────────────────────

  openWalletModal:  () => set({ walletModal: true,  error: null }),
  closeWalletModal: () => set({ walletModal: false }),

  connect: async () => {
    set({ connecting: true, error: null })
    try {
      const bc = await getAdapter()
      const { address, chainId, chainName } = await bc.connect()

      persistWallet(address, chainId)
      set({
        address,
        shortAddress: shortAddr(address),
        chainId,
        chainName,
        connecting:   false,
        walletModal:  false,
        error:        null,
      })
      analytics.walletConnect(chainName || ACTIVE_CHAIN.name)

      // Subscribe to wallet events
      bc.onAccountsChanged(newAddr => {
        if (!newAddr) {
          get().disconnect()
        } else {
          persistWallet(newAddr, get().chainId)
          set({ address: newAddr, shortAddress: shortAddr(newAddr) })
          get().refreshOwnedTiles()
        }
      })

      bc.onChainChanged(newChainId => {
        set({ chainId: newChainId })
        persistWallet(get().address, newChainId)
      })

      bc.onDisconnect(() => get().disconnect())

      // Load owned tiles in background
      get().refreshOwnedTiles()
      get().refreshBalance()

    } catch (err) {
      set({ connecting: false, error: err.message })
    }
  },

  disconnect: async () => {
    analytics.walletDisconnect()
    const bc = await getAdapter()
    bc.disconnect()
    bc.removeListeners()
    persistWallet(null, null)
    set({
      address:      null,
      shortAddress: null,
      chainId:      null,
      chainName:    null,
      balance:      null,
      ownedTiles:   [],
      error:        null,
    })
  },

  // Try to reconnect silently from localStorage (called on app boot)
  tryReconnect: async () => {
    const saved = loadPersistedWallet()
    if (!saved?.address) return

    // Check if wallet is still connected (no modal prompt)
    try {
      const bc = await getAdapter()
      if (ACTIVE_CHAIN.family === 'evm') {
        const accounts = await window.ethereum?.request({ method: 'eth_accounts' })
        if (accounts?.[0]?.toLowerCase() === saved.address.toLowerCase()) {
          const chainHex = await window.ethereum?.request({ method: 'eth_chainId' })
          const chainId  = chainHex ? parseInt(chainHex, 16) : saved.chainId
          set({
            address:      saved.address,
            shortAddress: shortAddr(saved.address),
            chainId,
            chainName:    ACTIVE_CHAIN.name,
          })
          bc.onAccountsChanged(addr => addr ? set({ address: addr, shortAddress: shortAddr(addr) }) : get().disconnect())
          bc.onChainChanged(id => set({ chainId: id }))
          bc.onDisconnect(() => get().disconnect())
          get().refreshOwnedTiles()
          get().refreshBalance()
        }
      }
    } catch { /* silent fail */ }
  },

  refreshBalance: async () => {
    const { address, chainId } = get()
    if (!address || ACTIVE_CHAIN.family !== 'evm') return
    try {
      const hex     = await window.ethereum?.request({ method: 'eth_getBalance', params: [address, 'latest'] })
      const wei     = BigInt(hex ?? '0x0')
      const native  = ACTIVE_CHAIN.nativeCurrency
      const divisor = 10n ** BigInt(native.decimals)
      const whole   = wei / divisor
      const frac    = ((wei % divisor) * 1000n / divisor).toString().padStart(3, '0').slice(0, 3)
      set({ balance: `${whole}.${frac} ${native.symbol}` })
    } catch { /* non-critical */ }
  },

  refreshOwnedTiles: async () => {
    const { address } = get()
    if (!address) return
    try {
      const bc     = await getAdapter()
      const ids    = await bc.getOwnedTokenIds(address)
      const tiles  = ids.map(id => {
        const { tx, ty } = bc.tokenIdToTile ? bc.tokenIdToTile(id) : { tx: 0, ty: 0 }
        return `${tx}:${ty}`
      })
      set({ ownedTiles: tiles })
    } catch { /* non-critical */ }
  },

  // Record a transaction in local history
  recordTx: (tx) => {
    const history = [
      {
        ...tx,
        timestamp: Date.now(),
        chain:     ACTIVE_CHAIN.name,
        chainKey:  Object.keys(CHAINS).find(k => CHAINS[k] === ACTIVE_CHAIN),
      },
      ...get().txHistory,
    ]
    saveTxHistory(history)
    set({ txHistory: history })
  },

  // Clear a specific transaction type from owned tiles check
  markTileOwned: (tileKey) => {
    const owned = new Set(get().ownedTiles)
    owned.add(tileKey)
    set({ ownedTiles: [...owned] })
  },
}))
