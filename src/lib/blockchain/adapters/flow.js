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

// ── Native payment (a plain FLOW transfer — no CryptoLand contract involved) ─

// FungibleToken and FlowToken are core contracts at fixed, network-specific
// addresses — the same aliases contracts/flow/flow.json pins for the Cadence
// build. FCL can resolve `0xFungibleToken` placeholders, but only for addresses
// registered in config(); interpolating keeps the transaction self-contained,
// exactly as mintTile() does with the CryptoLandTile address.
const CORE = ACTIVE_CHAIN.testnet
  ? { fungibleToken: '0x9a0766d93b6608b7', flowToken: '0x7e60df042a9c0868' }
  : { fungibleToken: '0xf233dcee88fe0abe', flowToken: '0x1654653399040a61' }

// UFix64 is fixed-point with EXACTLY 8 decimal places, which is also FLOW's base
// unit — so a base-unit integer maps onto the last decimal place with a pure
// string shift. Never divide: 1e-8 arithmetic on a Number rounds, and Cadence
// rejects "12", "1.5" and "1.5e1" alike — it wants "12.00000000".
const UFIX64_DECIMALS = 8

function baseUnitsToUFix64(units) {
  // padStart guarantees a whole-number digit, so 1 base unit renders as
  // "0.00000001" rather than ".00000001", which does not parse.
  const digits = units.toString().padStart(UFIX64_DECIMALS + 1, '0')
  return `${digits.slice(0, -UFIX64_DECIMALS)}.${digits.slice(-UFIX64_DECIMALS)}`
}

/** Flow addresses are 8 bytes; FCL hands them back 0x-prefixed and expects the same. */
function normalizeAddress(addr) {
  const hex = String(addr ?? '').replace(/^0x/, '')
  if (!/^[0-9a-fA-F]{16}$/.test(hex)) throw new Error(`Not a Flow address: ${addr}`)
  return `0x${hex.toLowerCase()}`
}

/**
 * Pay for a tile in FLOW, from the user's own wallet.
 *
 * A vault-to-vault transfer, NOT CryptoLandTile.claimTile(): claiming is gated on
 * a deployed contract most builds do not have, and the price is per-tile, which
 * no fixed on-chain price expresses. This path works with VITE_CONTRACT_FLOW unset.
 *
 * `amount` is a decimal STRING of base units (1e-8 FLOW) straight from the
 * server's quote — kept as a BigInt so a large quote can never be rounded by the
 * Number conversion an accidental arithmetic operation would force.
 */
export async function payNative({ to, amount, from }) {
  if (!to)     throw new Error('No treasury address for this chain')
  if (!amount) throw new Error('No amount to pay')

  const units = BigInt(amount)          // throws on a malformed quote
  if (units <= 0n) throw new Error('Refusing to send a non-positive amount')

  // FCL signs as whoever is authenticated; there is no way to nominate a
  // different payer, so a missing session is a hard stop rather than a prompt.
  const payer = from ?? _address
  if (!payer) throw new Error('Connect a Flow wallet before paying.')

  const recipient = normalizeAddress(to)
  const value     = baseUnitsToUFix64(units)
  const f         = await fcl()

  // The canonical FLOW transfer. Cadence's resource model forces the shape: the
  // withdrawn vault is a linear value, so it is moved into a transaction field in
  // prepare (the only phase with access to the signer's storage) and deposited in
  // execute. Both entitlements are load-bearing under Cadence 1.0 —
  // auth(BorrowValue) to reach storage at all, auth(FungibleToken.Withdraw) to
  // get a reference that can withdraw — and an unentitled borrow will not
  // type-check rather than failing at runtime.
  const cadence = `
import FungibleToken from ${CORE.fungibleToken}
import FlowToken from ${CORE.flowToken}

transaction(amount: UFix64, to: Address) {
  let sentVault: @{FungibleToken.Vault}

  prepare(signer: auth(BorrowValue) &Account) {
    let vault = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(
      from: /storage/flowTokenVault
    ) ?? panic("Signer has no FlowToken vault")
    self.sentVault <- vault.withdraw(amount: amount)
  }

  execute {
    let receiver = getAccount(to).capabilities
      .borrow<&{FungibleToken.Receiver}>(/public/flowTokenReceiver)
      ?? panic("Recipient has no public FlowToken receiver")
    receiver.deposit(from: <-self.sentVault)
  }
}`

  const txId = await f.mutate({
    cadence,
    args: (arg, t) => [
      // "12.34000000" — t.UFix64 passes the string through as-is, so a bare
      // integer or a trimmed fraction is rejected by the execution node.
      arg(value, t.UFix64),
      arg(recipient, t.Address),
    ],
    limit: 999,
  })
  if (!txId) throw new Error('Flow wallet returned no transaction id for the payment.')
  return { txHash: txId, from: payer }
}

/** Whether this build can take a wallet payment at all. */
export function supportsNativePay() {
  // Unlike every other family there is no injected provider to probe, so — as
  // detectWallets() notes — availability is a property of the runtime, not of
  // what the user has installed: FCL Discovery is always reachable, and which
  // wallets it offers is decided at connect time. What it does need is a browser
  // (the authn popup / iframe protocol), which SSR and the test runner lack.
  if (ACTIVE_CHAIN.gasless || ACTIVE_CHAIN.halted) return false
  return typeof window !== 'undefined'
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
