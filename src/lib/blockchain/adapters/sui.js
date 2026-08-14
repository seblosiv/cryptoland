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

// ── Native payment (plain SUI transfer to the treasury) ──────────────────────

/**
 * Pay for a tile in SUI, from the user's own wallet.
 *
 * A transfer on Sui is a programmable transaction block — split `amount` MIST
 * off the gas coin, transfer the resulting coin to the treasury — and building
 * one means BCS-encoding it, which needs a Sui SDK this adapter deliberately
 * does not ship (vite marks every chain SDK external; a Sui deployment installs
 * only what it uses, and this file otherwise speaks nothing but Wallet Standard
 * and raw HTTP). So the backend assembles the bytes, exactly as it already does
 * for mintTile, and the wallet signs and executes them. Nothing about the money
 * is decided here: the server fixed `to` and `amount` when it issued the quote,
 * and reads the transfer back off the chain before it writes the tile.
 *
 * `amount` is a decimal STRING of MIST (1 SUI = 1e9) from that quote, forwarded
 * as a string — never parsed as a Number.
 */
export async function payNative({ to, amount, from }) {
  if (!to)     throw new Error('No treasury address for this chain')
  if (!amount) throw new Error('No amount to pay')

  const mist = BigInt(amount)          // throws on a malformed quote
  if (mist <= 0n) throw new Error('Refusing to send a non-positive amount')

  if (!_wallet) await connect()
  const payer = from ?? getAddress()
  if (!payer) throw new Error('No wallet account available')

  const feature = _wallet?.features?.['sui:signAndExecuteTransactionBlock']
  if (!feature) throw new Error('This Sui wallet cannot execute transactions.')

  const BASE = import.meta.env.VITE_API_BASE ?? ''
  const res  = await fetch(`${BASE}/sui/build-transfer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, amount: mist.toString(), from: payer }),
  })
  if (!res.ok) throw new Error('Failed to build the Sui payment transaction')
  const { transactionBlock } = await res.json()
  if (!transactionBlock) throw new Error('Failed to build the Sui payment transaction')

  const out = await feature.signAndExecuteTransactionBlock({
    transactionBlock,
    account: { address: payer },
  })
  // The digest is the handle both an explorer and the server's verifier take.
  const digest = out?.digest ?? null
  if (!digest) throw new Error('Sui wallet returned no transaction digest')
  return { txHash: digest, from: payer }
}

/** Whether this build can take a wallet payment at all. */
export function supportsNativePay() {
  return !ACTIVE_CHAIN.gasless && !ACTIVE_CHAIN.halted && getWallets().length > 0
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

/**
 * Poll until the transaction lands.
 *
 * Sui DEPRECATED JSON-RPC on public fullnodes — every method there now returns
 * -32601 with a notice to migrate to gRPC or GraphQL. GraphQL is the path that
 * works from a browser (the endpoint sends `Access-Control-Allow-Origin: *`),
 * so it is tried first. JSON-RPC is kept as a fallback because the third-party
 * endpoints we point at still serve it, and it is the only thing that works if
 * a deployment overrides rpcUrl with a private node.
 */
async function txStatusViaGraphQL(digest) {
  const url = ACTIVE_CHAIN.graphqlUrl
  if (!url) return null
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: 'query($d:String!){ transactionEffects(digest:$d){ status } }',
      variables: { d: digest },
    }),
  }).then(r => r.json()).catch(() => null)
  // SUCCESS | FAILURE | null while still unconfirmed.
  return r?.data?.transactionEffects?.status ?? null
}

async function txStatusViaJsonRpc(digest) {
  const r = await fetch(ACTIVE_CHAIN.rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'sui_getTransactionBlock',
      params: [digest, { showEffects: true }],
    }),
  }).then(r => r.json()).catch(() => null)
  const s = r?.result?.effects?.status?.status
  if (s === 'success') return 'SUCCESS'
  if (s === 'failure') return 'FAILURE'
  return null
}

export async function waitForTx(digest, maxWait = 60_000) {
  const start = Date.now()
  while (Date.now() - start < maxWait) {
    const status = (await txStatusViaGraphQL(digest)) ?? (await txStatusViaJsonRpc(digest))
    if (status === 'SUCCESS') return { digest, status }
    if (status === 'FAILURE') throw new Error(`Sui tx ${digest} failed`)
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
