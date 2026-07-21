/**
 * Blockchain Adapter Index — CryptoLand
 * =======================================
 * Exports the active adapter based on VITE_CHAIN config.
 * All consumers import from here — never import adapters directly.
 *
 * Usage:
 *   import { connect, mintTile, ownerOf } from '../lib/blockchain'
 *
 * To add a new chain:
 *   1. Add entry to config.js CHAINS map
 *   2. If EVM: no adapter changes needed (evm.js covers all EVM chains)
 *   3. If non-EVM: create adapters/<family>.js implementing the interface
 *   4. Set VITE_CHAIN=<key> in .env
 *
 * Supported families: 'evm' (Polygon/Avalanche/Base/Arbitrum/Ronin/BNB/Ethereum),
 * 'solana', 'ton', 'aptos', 'sui'.
 */

import { ACTIVE_CHAIN } from './config.js'

const ADAPTERS = {
  evm:    () => import('./adapters/evm.js'),
  solana: () => import('./adapters/solana.js'),
  ton:    () => import('./adapters/ton.js'),
  aptos:  () => import('./adapters/aptos.js'),
  sui:    () => import('./adapters/sui.js'),
}

const loadAdapter = ADAPTERS[ACTIVE_CHAIN.family]
if (!loadAdapter) {
  throw new Error(`No adapter for chain family: ${ACTIVE_CHAIN.family}`)
}
const adapter = await loadAdapter()

export const {
  connect,
  disconnect,
  getAddress,
  getChainId,
  switchChain,
  signMessage,
  signPurchase,
  mintTile,
  listForSale,
  unlistTile,
  buyTile,
  ownerOf,
  getTileData,
  getOwnedTokenIds,
  totalSupply,
  waitForTx,
  onAccountsChanged,
  onChainChanged,
  onDisconnect,
  removeListeners,
  detectWallets,
  tileTokenId,
  tokenIdToTile,
  ADAPTER_TYPE,
} = adapter

export {
  ACTIVE_CHAIN, ACTIVE_CHAIN_KEY, ACTIVE_CHAIN_CANONICAL, ACTIVE_CHAIN_FAMILY,
  CHAINS, MAINNET_CHAINS, chainById, explorerTxUrl, explorerNFTUrl,
} from './config.js'
