/**
 * Flow Adapter — CryptoLand
 * ==========================
 * Flow is the outlier among our chains in a way that matters for this product:
 * it was built for consumer NFTs (NBA Top Shot, NFL All Day), so a geospatial
 * land NFT is the use case the chain was designed around rather than one it
 * tolerates.
 *
 * Three things differ from every other adapter here:
 *
 *  1. **There is no injected `window.flow` provider.** Flow wallets are reached
 *     through FCL (`@onflow/fcl`), a discovery layer that talks to wallets over
 *     an iframe/popup protocol. So `detectWallets()` cannot sniff globals the
 *     way the EVM/Aptos/Solana adapters do — FCL Discovery is always available,
 *     and which wallets it offers is decided at connect time.
 *
 *  2. **FCL is loaded dynamically.** vite.config.js marks every optional
 *     per-chain wallet SDK external, so a build for another chain does not fail
 *     because @onflow/fcl is not installed. Same pattern as the other non-EVM
 *     adapters.
 *
 *  3. **Cadence uses resources, not mappings.** An NFT is a linear-typed value
 *     that lives in the owner's account storage, so "who owns tile N" is a
 *     script run against a collection capability rather than a contract read.
 *
 * Implements the universal BlockchainAdapter interface (same surface as evm.js).
 */

import { ACTIVE_CHAIN } from '../config.js'
import { tileTokenId, tokenIdToTile, hasContract, mintStub } from './_shared.js'

export { tileTokenId, tokenIdToTile }

let _address = null
let _fcl = null

// ── FCL bootstrap ────────────────────────────────────────────────────────────

/**
 * Load and configure FCL on first use. Configuration is per-network: the access
 * node and the Discovery endpoint both differ between mainnet and testnet, and
 * getting them crossed is the usual reason a Flow app silently fails to connect.
 */
async function fcl() {
  if (_fcl) return _fcl
  try {
    _fcl = await import('@onflow/fcl')
  } catch {
    throw new Error('Flow wallet support requires @onflow/fcl — npm i @onflow/fcl')
  }
  const testnet = ACTIVE_CHAIN.testnet
  _fcl.config({
    'app.detail.title': 'CryptoLand',
    'app.detail.icon': 'https://xono.ai/icon.png',
    'flow.network': testnet ? 'testnet' : 'mainnet',
    'accessNode.api': ACTIVE_CHAIN.rpcUrl,
    'discovery.wallet': testnet
      ? 'https://fcl-discovery.onflow.org/testnet/authn'
      : 'https://fcl-discovery.onflow.org/authn',
  })
  return _fcl
}

export function detectWallets() {
  // Flow has no injected provider to sniff — FCL Discovery presents the wallet
  // list itself once connect() runs. Returning a single entry keeps the UI
  // honest: one button, which opens the chooser.
  return [{ id: 'fcl', name: 'Flow Wallet', icon: '🌊' }]
}

// ── Wallet connection ───────────────────────────────────────────────────────

export async function connect() {
  const f = await fcl()
  const user = await f.authenticate()
  _address = user?.addr ?? null
  if (!_address) throw new Error('Flow wallet connection rejected')
  return { address: _address, chainId: ACTIVE_CHAIN.id, chainName: ACTIVE_CHAIN.name }
}

export async function disconnect() {
  try { (await fcl()).unauthenticate() } catch { /* not loaded — nothing to do */ }
  _address = null
}

export function getAddress() {
  return _address
}

export function getChainId() {
  return ACTIVE_CHAIN.id
}

export async function switchChain() { /* a Flow build targets one network */ }

// ── Signing ─────────────────────────────────────────────────────────────────

/**
 * Flow signs a hex-encoded payload and returns an ARRAY of composite signatures
 * (an account can have multiple weighted keys). The backend compares against
 * the first, which is the single-key case every consumer wallet produces.
 */
export async function signMessage(message) {
  const f = await fcl()
  const hex = Buffer.from(String(message), 'utf8').toString('hex')
  const sigs = await f.currentUser.signUserMessage(hex)
  return { signature: sigs?.[0]?.signature ?? sigs, address: getAddress() }
}

export async function signPurchase({ tileKey, price }) {
  const message = `CryptoLand purchase — tile ${tileKey} for $${price}`
  const { signature } = await signMessage(message)
  return { signature, message }
}

// ── NFT mint (stubbed until the Cadence contract is deployed) ────────────────

export async function mintTile({ tx, ty, country, toAddress }) {
  if (!hasContract()) return mintStub('Flow Cadence contract not deployed')
  const f = await fcl()
  const tokenId = tileTokenId(tx, ty)
  const addr = ACTIVE_CHAIN.contractAddress

  // Cadence transactions are submitted as source, not as an encoded call —
  // the address is interpolated into the import, so the script is bound to
  // whichever contract this build was configured with.
  const cadence = `
import CryptoLandTile from ${addr}

transaction(tx: UInt64, ty: UInt64, country: String, recipient: Address) {
  prepare(signer: auth(BorrowValue) &Account) {}
  execute {
    CryptoLandTile.claimTile(tx: tx, ty: ty, country: country, recipient: recipient)
  }
}`

  const txId = await f.mutate({
    cadence,
    args: (arg, t) => [
      arg(String(tx), t.UInt64),
      arg(String(ty), t.UInt64),
      arg(country ?? '', t.String),
      arg(toAddress ?? _address, t.Address),
    ],
    limit: 999,
  })
  return { txHash: txId, tokenId: String(tokenId), minted: true }
}

// ── Marketplace (activates with the deployed contract) ───────────────────────

export async function listForSale() { throw new Error('Flow marketplace: available after contract deploy') }
export async function unlistTile()   { throw new Error('Flow marketplace: available after contract deploy') }
export async function buyTile()      { throw new Error('Flow marketplace: available after contract deploy') }

// ── Reads ───────────────────────────────────────────────────────────────────

export async function ownerOf(tokenId) {
  if (!hasContract()) return null
  const f = await fcl()
  const { tx, ty } = tokenIdToTile(tokenId)
  try {
    return await f.query({
      cadence: `
import CryptoLandTile from ${ACTIVE_CHAIN.contractAddress}

access(all) fun main(tx: UInt64, ty: UInt64): Address? {
  return CryptoLandTile.ownerOfTile(tx: tx, ty: ty)
}`,
      args: (arg, t) => [arg(String(tx), t.UInt64), arg(String(ty), t.UInt64)],
    })
  } catch { return null }
}

export async function getTileData()      { return null }
export async function getOwnedTokenIds() { return [] }

export async function totalSupply() {
  if (!hasContract()) return 0
  const f = await fcl()
  try {
    const n = await f.query({
      cadence: `
import CryptoLandTile from ${ACTIVE_CHAIN.contractAddress}

access(all) fun main(): UInt64 {
  return CryptoLandTile.totalSupply
}`,
    })
    return Number(n ?? 0)
  } catch { return 0 }
}

/**
 * Flow seals blocks rather than confirming them by depth: a transaction is
 * final at status 4 (SEALED). Status 5 is EXPIRED, which is a failure.
 */
export async function waitForTx(txId, maxWait = 60_000) {
  const start = Date.now()
  const url = `${ACTIVE_CHAIN.rpcUrl}/v1/transaction_results/${txId}`
  while (Date.now() - start < maxWait) {
    const r = await fetch(url).then(r => r.json()).catch(() => null)
    const status = r?.status
    if (status === 'Sealed' || r?.status_code === 0 && status === 'Sealed') {
      if (r?.error_message) throw new Error(`Flow tx ${txId} failed: ${r.error_message}`)
      return r
    }
    if (status === 'Expired') throw new Error(`Flow tx ${txId} expired`)
    await new Promise(res => setTimeout(res, 2000))
  }
  throw new Error(`Flow tx ${txId} not sealed within ${maxWait / 1000}s`)
}

// ── Listeners ────────────────────────────────────────────────────────────────

let _unsub = null

export function onAccountsChanged(cb) {
  // FCL pushes the whole user object on every auth change; addr is null when
  // the user signs out, which is the same signal onDisconnect wants.
  fcl().then((f) => { _unsub = f.currentUser.subscribe(u => cb(u?.addr ?? null)) })
      .catch(() => { /* FCL absent — no wallet to listen to */ })
}

export function onChainChanged() { /* a Flow build targets one network */ }

export function onDisconnect(cb) {
  fcl().then((f) => { f.currentUser.subscribe(u => { if (!u?.addr) cb() }) })
      .catch(() => {})
}

export function removeListeners() {
  _unsub?.()
  _unsub = null
}

export const ADAPTER_TYPE = 'flow'
