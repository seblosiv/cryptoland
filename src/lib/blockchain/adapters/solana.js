/**
 * Solana Adapter — CryptoLand
 * ============================
 * Covers Solana mainnet and devnet via Phantom / Solflare / Backpack wallets.
 * Uses Metaplex Token Metadata standard for NFT minting (cNFTs / regular SPL NFTs).
 *
 * NOTE: Full Solana NFT minting requires @solana/web3.js + @metaplex-foundation/js.
 * This adapter provides the interface and wallet connection; minting is delegated
 * to the backend (server/solana_mint.py) to avoid shipping the full SDK in browser.
 *
 * The adapter implements the same universal BlockchainAdapter interface as evm.js.
 */

import { ACTIVE_CHAIN } from '../config.js'
import { tileTokenId, tokenIdToTile, hasContract, mintStub } from './_shared.js'

export { tileTokenId, tokenIdToTile }

// ── Provider helpers ──────────────────────────────────────────────────────────

function getProvider() {
  if (typeof window === 'undefined') return null
  // Phantom exposes window.solana; Solflare exposes window.solflare
  return window.solana ?? window.solflare ?? null
}

export function detectWallets() {
  const wallets = []
  if (window.solana?.isPhantom)   wallets.push({ id: 'phantom',  name: 'Phantom',  icon: '👻' })
  if (window.solflare?.isSolflare) wallets.push({ id: 'solflare', name: 'Solflare', icon: '🌟' })
  if (window.backpack)            wallets.push({ id: 'backpack',  name: 'Backpack', icon: '🎒' })
  return wallets
}

// ── Wallet connection ─────────────────────────────────────────────────────────

export async function connect() {
  const provider = getProvider()
  if (!provider) throw new Error('No Solana wallet detected. Install Phantom or Solflare.')

  const resp    = await provider.connect()
  const address = resp.publicKey?.toString() ?? null
  if (!address) throw new Error('Solana wallet connection rejected')

  return {
    address,
    chainId:   ACTIVE_CHAIN.id,   // 'mainnet-beta' | 'devnet'
    chainName: ACTIVE_CHAIN.name,
  }
}

export function disconnect() {
  getProvider()?.disconnect?.()
}

export function getAddress() {
  return getProvider()?.publicKey?.toString() ?? null
}

export function getChainId() {
  return ACTIVE_CHAIN.id
}

export async function switchChain() { /* a Solana build targets one cluster */ }

export async function signMessage(message) {
  const provider = getProvider()
  if (!provider?.signMessage) throw new Error('Solana wallet cannot sign messages.')
  const encoded = new TextEncoder().encode(message)
  const { signature } = await provider.signMessage(encoded, 'utf8')
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
  return { signature: sigB64, address: getAddress() }
}

// ── Purchase signature (proof of wallet control, no contract needed) ─────────

export async function signPurchase({ tileKey, price }) {
  const provider = getProvider()
  if (!provider?.signMessage) throw new Error('Solana wallet cannot sign messages.')
  const text = `CryptoLand purchase — tile ${tileKey} for $${price} — ${getAddress()}`
  const encoded = new TextEncoder().encode(text)
  const { signature } = await provider.signMessage(encoded, 'utf8')
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
  return { signature: sigB64, message: text }
}

// ── Native payment (plain SOL transfer to the treasury) ──────────────────────

/**
 * Pay for a tile in SOL, from the user's own wallet.
 *
 * A System Program transfer to the treasury — NOT an instruction on our program.
 * Tiles are priced per tile (a Tokyo tile is ~$76, an ocean tile $12), so the
 * price has to ride on the transaction rather than live in program state, and a
 * transfer works on a cluster where nothing of ours is deployed.
 *
 * `amount` is a decimal STRING of lamports, straight from the server's quote.
 * It must never become a Number: the quote is authoritative down to the last
 * lamport, and the server re-reads the transfer from the chain afterwards, so a
 * rounded amount is a rejected payment.
 */
export async function payNative({ to, amount, from }) {
  if (!to)     throw new Error('No treasury address for this chain')
  if (!amount) throw new Error('No amount to pay')

  const lamports = BigInt(amount)       // throws on a malformed quote
  if (lamports <= 0n) throw new Error('Refusing to send a non-positive amount')

  const provider = getProvider()
  if (!provider) throw new Error('No Solana wallet detected. Install Phantom or Solflare.')

  const payer = from ?? getAddress() ?? (await connect()).address
  if (!payer) throw new Error('No wallet account available')

  const { Connection, PublicKey, SystemProgram, Transaction } =
    await import('@solana/web3.js').catch(() => {
      throw new Error('Solana SDK not available — ensure @solana/web3.js is installed')
    })

  // A Solana transaction expires with its blockhash, so one must be attached
  // before signing even when the wallet does the broadcasting.
  const connection = new Connection(ACTIVE_CHAIN.rpcUrl, 'confirmed')
  const { blockhash } = await connection.getLatestBlockhash()

  const tx = new Transaction()
  tx.feePayer        = new PublicKey(payer)
  tx.recentBlockhash = blockhash
  tx.add(SystemProgram.transfer({
    fromPubkey: new PublicKey(payer),
    toPubkey:   new PublicKey(to),
    lamports,                           // web3.js takes a bigint here — no Number round-trip
  }))

  // Phantom, Solflare and Backpack sign AND broadcast in one prompt, through
  // their own RPC, which sidesteps a rate-limited public endpoint. Falling back
  // to sign-then-send keeps wallets that only expose signTransaction working.
  if (typeof provider.signAndSendTransaction === 'function') {
    const res       = await provider.signAndSendTransaction(tx)
    const signature = res?.signature ?? res
    if (!signature) throw new Error('Solana wallet returned no transaction signature')
    return { txHash: String(signature), from: payer }
  }

  if (typeof provider.signTransaction !== 'function') {
    throw new Error('This Solana wallet cannot sign transactions.')
  }
  const signed = await provider.signTransaction(tx)
  return { txHash: await connection.sendRawTransaction(signed.serialize()), from: payer }
}

/** Whether this build can take a wallet payment at all. */
export function supportsNativePay() {
  // Gated on the provider payNative would actually use — a wallet detectWallets()
  // can name but getProvider() cannot reach could not sign the transfer.
  return !ACTIVE_CHAIN.gasless && !ACTIVE_CHAIN.halted && Boolean(getProvider())
}

// ── NFT minting (server-side) ─────────────────────────────────────────────────
// Solana minting is complex (Metaplex, metadata accounts, etc.).
// We ask the backend to build + serialize the transaction, then sign it here.

export async function mintTile({ tx, ty, country, toAddress }) {
  // No deployed program yet → skip the on-chain mint. Purchase still succeeds
  // (DB-backed ownership); minting activates when VITE_CONTRACT_SOLANA is set.
  if (!hasContract()) return mintStub('Solana program not deployed')
  // Step 1: backend builds the transaction
  const BASE = import.meta.env.VITE_API_BASE ?? ''
  const res  = await fetch(`${BASE}/solana/build-mint`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ tx, ty, country, owner: toAddress }),
  })
  if (!res.ok) throw new Error('Failed to build Solana mint transaction')
  const { transaction: txBase64, mintAddress } = await res.json()

  // Step 2: wallet signs
  const provider = getProvider()
  if (!provider) throw new Error('No Solana wallet')

  const txBytes  = Uint8Array.from(atob(txBase64), c => c.charCodeAt(0))
  const { Transaction } = await import('@solana/web3.js').catch(() => {
    throw new Error('Solana SDK not available — ensure @solana/web3.js is installed')
  })
  const transaction = Transaction.from(txBytes)
  const signed      = await provider.signTransaction(transaction)
  // Browser-safe base64 (no Node Buffer, which is undefined in the browser).
  const serialized  = btoa(String.fromCharCode(...new Uint8Array(signed.serialize())))

  // Step 3: backend broadcasts
  const sendRes = await fetch(`${BASE}/solana/send-tx`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ transaction: serialized }),
  })
  if (!sendRes.ok) throw new Error('Failed to send Solana transaction')
  const { signature } = await sendRes.json()

  return { txHash: signature, tokenId: mintAddress }
}

// Solana P2P marketplace (Metaplex Auction House or custom)
export async function listForSale({ tokenId, priceWei, fromAddress }) {
  throw new Error('Solana marketplace: not yet implemented in this adapter')
}

export async function unlistTile({ tokenId, fromAddress }) {
  throw new Error('Solana marketplace: not yet implemented in this adapter')
}

export async function buyTile({ tokenId, priceWei, fromAddress }) {
  throw new Error('Solana marketplace: not yet implemented in this adapter')
}

// ── Account changed listener ──────────────────────────────────────────────────

export function onAccountsChanged(cb) {
  getProvider()?.on?.('accountChanged', pk => cb(pk?.toString() ?? null))
}

export function onChainChanged(cb) {
  // Solana doesn't have chainChanged in the same way
}

export function onDisconnect(cb) {
  getProvider()?.on?.('disconnect', cb)
}

export function removeListeners() {
  const p = getProvider()
  p?.removeAllListeners?.('accountChanged')
  p?.removeAllListeners?.('disconnect')
}

// Solana reads — delegate to backend for simplicity
export async function ownerOf(tokenId)   { return null }
export async function getTileData()      { return null }
export async function getOwnedTokenIds() { return [] }
export async function totalSupply()      { return 0 }
export async function waitForTx(sig, maxWait = 120_000) {
  const start = Date.now()
  const BASE  = import.meta.env.VITE_API_BASE ?? ''
  while (Date.now() - start < maxWait) {
    const r = await fetch(`${BASE}/solana/tx-status?signature=${sig}`).then(r => r.json()).catch(() => null)
    if (r?.confirmed) return r
    await new Promise(res => setTimeout(res, 2000))
  }
  throw new Error(`Solana tx ${sig} not confirmed within ${maxWait / 1000}s`)
}

export const ADAPTER_TYPE = 'solana'
