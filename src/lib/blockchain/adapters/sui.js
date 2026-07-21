/**
 * Sui Adapter — CryptoLand
 * =========================
 * Covers Sui mainnet + testnet via the Sui Wallet Standard (Sui Wallet, Suiet,
 * Ethos, Nightly). Connect + address + purchase signPersonalMessage work today
 * with no contract deployed; NFT minting (a Sui Move object via a deployed
 * package) is stubbed until VITE_CONTRACT_SUI is set.
 *
 * Implements the universal BlockchainAdapter interface (same surface as evm.js).
 * Sui wallets expose the Wallet Standard on window; we read the first wallet that
 * advertises the `sui:signPersonalMessage` feature.
 */

import { ACTIVE_CHAIN } from '../config.js'
import { tileTokenId, tokenIdToTile, hasContract, mintStub } from './_shared.js'

export { tileTokenId, tokenIdToTile }

let _wallet  = null   // selected Wallet-Standard wallet
let _address = null

// ── Wallet Standard discovery ─────────────────────────────────────────────────

function getWallets() {
  if (typeof window === 'undefined') return []
  // Wallet Standard: wallets register on window.navigator.wallets or via the
  // get-wallets event. We also accept the legacy window.suiWallet injection.
  const std = window?.navigator?.wallets ?? window?.wallets ?? []
  const list = Array.isArray(std) ? std : (std.get?.() ?? [])
  const sui = list.filter(w => w?.features?.['sui:signPersonalMessage'] || w?.features?.['sui:signTransactionBlock'])
  if (sui.length) return sui
  if (window.suiWallet) return [{ name: 'Sui Wallet', __legacy: window.suiWallet }]
  return []
}

export function detectWallets() {
  return getWallets().map(w => ({
    id: (w.name ?? 'sui').toLowerCase().replace(/\s+/g, '-'),
    name: w.name ?? 'Sui Wallet',
    icon: '🌊',
  }))
}

// ── Wallet connection ───────────────────────────────────────────────────────

export async function connect() {
  const wallets = getWallets()
  if (!wallets.length) throw new Error('No Sui wallet detected. Install Sui Wallet or Suiet.')
  _wallet = wallets[0]

  if (_wallet.__legacy) {
    const res = await _wallet.__legacy.requestPermissions?.()
    const accts = await _wallet.__legacy.getAccounts?.()
    _address = Array.isArray(accts) ? accts[0] : accts
  } else {
    const res = await _wallet.features['standard:connect'].connect()
    _address = res?.accounts?.[0]?.address ?? null
  }
  if (!_address) throw new Error('Sui wallet connection rejected')
  return { address: _address, chainId: ACTIVE_CHAIN.id, chainName: ACTIVE_CHAIN.name }
}

export function disconnect() {
  _wallet?.features?.['standard:disconnect']?.disconnect?.().catch(() => {})
  _wallet = null
  _address = null
}

export function getAddress() {
  return _address
}

export function getChainId() {
  return ACTIVE_CHAIN.id
}

export async function switchChain() { /* a Sui build targets one network */ }

export async function signMessage(message) {
  if (!_wallet) throw new Error('Connect a Sui wallet first.')
  const feature = _wallet.features?.['sui:signPersonalMessage']
  if (!feature) throw new Error('Sui wallet cannot sign personal messages.')
  const bytes = new TextEncoder().encode(message)
  const res = await feature.signPersonalMessage({ message: bytes, account: { address: _address } })
  return { signature: res?.signature ?? res, address: _address }
}

// ── Purchase signature (proof of wallet control, no contract needed) ─────────

export async function signPurchase({ tileKey, price }) {
  if (!_wallet) throw new Error('Connect a Sui wallet first.')
  const text = `CryptoLand purchase — tile ${tileKey} for $${price} — ${getAddress()}`
  const bytes = new TextEncoder().encode(text)
  const feature = _wallet.features?.['sui:signPersonalMessage']
  if (!feature) throw new Error('Sui wallet cannot sign personal messages.')
  const res = await feature.signPersonalMessage({ message: bytes, account: { address: _address } })
  return { signature: res?.signature ?? res, message: text }
}

// ── NFT mint (stubbed until a Move package is deployed) ───────────────────────

export async function mintTile({ tx, ty, country, toAddress }) {
  if (!hasContract()) return mintStub('Sui Move package not deployed')
  if (!_wallet) throw new Error('Connect a Sui wallet to mint.')
  // Once VITE_CONTRACT_SUI points at a published package, build a programmable
  // transaction block calling <package>::cryptoland::mint_tile and sign+execute
  // it. Backend /sui/build-mint may assemble the PTB bytes.
  const BASE = import.meta.env.VITE_API_BASE ?? ''
  const res  = await fetch(`${BASE}/sui/build-mint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tx, ty, country, owner: toAddress }),
  })
  if (!res.ok) throw new Error('Failed to build Sui mint transaction')
  const { transactionBlock } = await res.json()
  const feature = _wallet.features['sui:signAndExecuteTransactionBlock']
  const out = await feature.signAndExecuteTransactionBlock({ transactionBlock, account: { address: _address } })
  return { txHash: out?.digest ?? null, tokenId: String(tileTokenId(tx, ty)), minted: true }
}

// ── Marketplace (activates with the deployed package) ─────────────────────────

export async function listForSale() { throw new Error('Sui marketplace: available after package deploy') }
export async function unlistTile()   { throw new Error('Sui marketplace: available after package deploy') }
export async function buyTile()      { throw new Error('Sui marketplace: available after package deploy') }

// ── Reads (delegate to backend / fullnode) ───────────────────────────────────

export async function ownerOf()          { return null }
export async function getTileData()      { return null }
export async function getOwnedTokenIds() { return [] }
export async function totalSupply()      { return 0 }

export async function waitForTx(digest, maxWait = 60_000) {
  const start = Date.now()
  while (Date.now() - start < maxWait) {
    const r = await fetch(ACTIVE_CHAIN.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'sui_getTransactionBlock',
        params: [digest, { showEffects: true }],
      }),
    }).then(r => r.json()).catch(() => null)
    if (r?.result?.effects?.status?.status === 'success') return r.result
    if (r?.result?.effects?.status?.status === 'failure') throw new Error(`Sui tx ${digest} failed`)
    await new Promise(res => setTimeout(res, 2000))
  }
  throw new Error(`Sui tx ${digest} not confirmed within ${maxWait / 1000}s`)
}

// ── Listeners ────────────────────────────────────────────────────────────────

export function onAccountsChanged(cb) {
  _wallet?.features?.['standard:events']?.on?.('change', e => {
    if (e?.accounts) cb(e.accounts[0]?.address ?? null)
  })
}
export function onChainChanged() { /* a Sui build targets one network */ }
export function onDisconnect(cb) {
  _wallet?.features?.['standard:events']?.on?.('change', e => { if (!e?.accounts?.length) cb() })
}
export function removeListeners() { /* Wallet Standard cleans up on disconnect */ }

export const ADAPTER_TYPE = 'sui'
