/**
 * Aptos Adapter — CryptoLand
 * ===========================
 * Covers Aptos mainnet + testnet via the Aptos Wallet Standard
 * (Petra, Martian, Pontem, Nightly). Connect + address + purchase signMessage
 * work today with no contract deployed; NFT minting (Aptos Digital Asset / Token
 * v2 via a deployed Move module) is stubbed until VITE_CONTRACT_APTOS is set.
 *
 * Implements the universal BlockchainAdapter interface (same surface as evm.js).
 */

import { ACTIVE_CHAIN } from '../config.js'
import { tileTokenId, tokenIdToTile, hasContract, mintStub } from './_shared.js'

export { tileTokenId, tokenIdToTile }

let _address = null

// ── Provider ─────────────────────────────────────────────────────────────────

function getProvider() {
  if (typeof window === 'undefined') return null
  // Petra: window.aptos; Martian: window.martian; Pontem: window.pontem;
  // Nightly: window.nightly?.aptos. Petra is the de-facto standard entry point.
  return window.aptos ?? window.martian ?? window.pontem ?? window.nightly?.aptos ?? null
}

export function detectWallets() {
  const wallets = []
  if (typeof window !== 'undefined') {
    if (window.aptos)          wallets.push({ id: 'petra',   name: 'Petra',   icon: '🪨' })
    if (window.martian)        wallets.push({ id: 'martian', name: 'Martian', icon: '👽' })
    if (window.pontem)         wallets.push({ id: 'pontem',  name: 'Pontem',  icon: '🌉' })
    if (window.nightly?.aptos) wallets.push({ id: 'nightly', name: 'Nightly', icon: '🌙' })
  }
  return wallets
}

// ── Wallet connection ───────────────────────────────────────────────────────

export async function connect() {
  const provider = getProvider()
  if (!provider) throw new Error('No Aptos wallet detected. Install Petra or Martian.')

  const resp = await provider.connect()
  // Petra returns { address, publicKey }; Martian returns { address }.
  _address = resp?.address ?? resp?.account?.address ?? null
  if (!_address) {
    const acct = await provider.account?.().catch(() => null)
    _address = acct?.address ?? null
  }
  if (!_address) throw new Error('Aptos wallet connection rejected')
  return { address: _address, chainId: ACTIVE_CHAIN.id, chainName: ACTIVE_CHAIN.name }
}

export function disconnect() {
  getProvider()?.disconnect?.()
  _address = null
}

export function getAddress() {
  return _address
}

export function getChainId() {
  return ACTIVE_CHAIN.id
}

export async function switchChain() { /* an Aptos build targets one network */ }

export async function signMessage(message, nonce = 'cryptoland') {
  const provider = getProvider()
  if (!provider?.signMessage) throw new Error('Aptos wallet cannot sign messages.')
  const resp = await provider.signMessage({ message, nonce })
  return { signature: resp?.signature ?? resp, address: getAddress() }
}

// ── Purchase signature (proof of wallet control, no contract needed) ─────────

export async function signPurchase({ tileKey, price }) {
  const provider = getProvider()
  if (!provider?.signMessage) throw new Error('Aptos wallet cannot sign messages.')
  const nonce = String(tileTokenId(...tileKey.split(':').map(Number)))
  const resp = await provider.signMessage({
    message: `CryptoLand purchase — tile ${tileKey} for $${price}`,
    nonce,
  })
  // Petra returns { signature, fullMessage }.
  return {
    signature: resp?.signature ?? resp,
    message: resp?.fullMessage ?? `CryptoLand purchase — tile ${tileKey} for $${price}`,
  }
}

// ── Native payment (plain APT transfer to the treasury) ─────────────────────

/**
 * Pay for a tile in APT, from the user's own wallet.
 *
 * `0x1::aptos_account::transfer`, not `0x1::coin::transfer<AptosCoin>`: the
 * former creates the recipient account and registers its coin store when the
 * treasury has never been funded, which the raw coin transfer aborts on. It is
 * a framework entry function, so this works with no module of ours deployed.
 *
 * `amount` is a decimal STRING of octas (1 APT = 1e8) from the server's quote,
 * and stays a string: a Move u64 crosses the wallet boundary as text for the
 * same reason we never parse the quote as a Number.
 */
export async function payNative({ to, amount, from }) {
  if (!to)     throw new Error('No treasury address for this chain')
  if (!amount) throw new Error('No amount to pay')

  const octas = BigInt(amount)         // throws on a malformed quote
  if (octas <= 0n) throw new Error('Refusing to send a non-positive amount')

  const provider = getProvider()
  if (!provider) throw new Error('No Aptos wallet detected. Install Petra or Martian.')
  if (typeof provider.signAndSubmitTransaction !== 'function') {
    throw new Error('This Aptos wallet cannot submit transactions.')
  }

  const payer = from ?? getAddress() ?? (await connect()).address
  if (!payer) throw new Error('No wallet account available')

  const pending = await provider.signAndSubmitTransaction({
    type: 'entry_function_payload',
    function: '0x1::aptos_account::transfer',
    type_arguments: [],
    arguments: [to, octas.toString()],
  })
  // Petra returns { hash }; a few wallets return the hash itself.
  const txHash = pending?.hash ?? pending
  if (!txHash) throw new Error('Aptos wallet returned no transaction hash')
  return { txHash: String(txHash), from: payer }
}

/** Whether this build can take a wallet payment at all. */
export function supportsNativePay() {
  return !ACTIVE_CHAIN.gasless && !ACTIVE_CHAIN.halted && Boolean(getProvider())
}

// ── NFT mint (stubbed until a Move module is deployed) ───────────────────────

export async function mintTile({ tx, ty, country, toAddress }) {
  if (!hasContract()) return mintStub('Aptos Move module not deployed')
  const provider = getProvider()
  if (!provider) throw new Error('Connect an Aptos wallet to mint.')
  // Entry-function call into the deployed CryptoLand Move module.
  const tokenId = tileTokenId(tx, ty)
  const payload = {
    type: 'entry_function_payload',
    function: `${ACTIVE_CHAIN.contractAddress}::cryptoland::mint_tile`,
    type_arguments: [],
    arguments: [String(tokenId), String(tx), String(ty), country ?? '', toAddress],
  }
  const pending = await provider.signAndSubmitTransaction(payload)
  const txHash = pending?.hash ?? pending
  return { txHash, tokenId: String(tokenId), minted: true }
}

// ── Marketplace (activates with the deployed module) ─────────────────────────

export async function listForSale() { throw new Error('Aptos marketplace: available after module deploy') }
export async function unlistTile()   { throw new Error('Aptos marketplace: available after module deploy') }
export async function buyTile()      { throw new Error('Aptos marketplace: available after module deploy') }

// ── Reads (delegate to backend / node) ───────────────────────────────────────

export async function ownerOf()          { return null }
export async function getTileData()      { return null }
export async function getOwnedTokenIds() { return [] }
export async function totalSupply()      { return 0 }

export async function waitForTx(hash, maxWait = 60_000) {
  const start = Date.now()
  const url = `${ACTIVE_CHAIN.rpcUrl}/transactions/by_hash/${hash}`
  while (Date.now() - start < maxWait) {
    const r = await fetch(url).then(r => r.json()).catch(() => null)
    if (r?.success === true) return r
    if (r?.success === false) throw new Error(`Aptos tx ${hash} failed`)
    await new Promise(res => setTimeout(res, 2000))
  }
  throw new Error(`Aptos tx ${hash} not confirmed within ${maxWait / 1000}s`)
}

// ── Listeners ────────────────────────────────────────────────────────────────

export function onAccountsChanged(cb) {
  getProvider()?.onAccountChange?.(acct => cb(acct?.address ?? null))
}
export function onChainChanged(cb) {
  getProvider()?.onNetworkChange?.(cb)
}
export function onDisconnect(cb) {
  getProvider()?.onDisconnect?.(cb)
}
export function removeListeners() { /* Aptos wallets clear on disconnect */ }

export const ADAPTER_TYPE = 'aptos'
