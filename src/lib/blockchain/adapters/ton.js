/**
 * TON Adapter — CryptoLand
 * =========================
 * Covers TON mainnet + testnet via TON Connect (Tonkeeper, MyTonWallet, OpenMask)
 * and TON's native Telegram Mini App wallet.
 *
 * Implements the universal BlockchainAdapter interface (same surface as evm.js /
 * solana.js). Connect + address + purchase-signature work today with no contract
 * deployed; NFT minting (TON Jetton/NFT item via a deployed collection) is stubbed
 * until VITE_CONTRACT_TON is set, at which point mintTile lights up automatically.
 *
 * TON Connect SDK (@tonconnect/ui) is optional and lazy-loaded. If it isn't
 * installed we fall back to the injected Telegram/OpenMask provider so the build
 * still connects inside a Mini App context.
 */

import { ACTIVE_CHAIN } from '../config.js'
import { tileTokenId, tokenIdToTile, hasContract, mintStub } from './_shared.js'

export { tileTokenId, tokenIdToTile }

let _connector = null   // cached TonConnect instance
let _address   = null

// ── Provider / connector ────────────────────────────────────────────────────

async function getConnector() {
  if (_connector) return _connector
  try {
    const { TonConnect } = await import('@tonconnect/sdk')
    _connector = new TonConnect({
      manifestUrl: `${window.location.origin}/tonconnect-manifest.json`,
    })
    return _connector
  } catch {
    return null   // SDK not installed — fall back to injected provider
  }
}

function injectedProvider() {
  if (typeof window === 'undefined') return null
  // OpenMask injects window.ton; Telegram Mini App exposes the wallet via SDK.
  return window.ton ?? null
}

export function detectWallets() {
  const wallets = []
  if (typeof window !== 'undefined') {
    if (window.ton)                 wallets.push({ id: 'openmask',  name: 'OpenMask',  icon: '🎭' })
    if (window.tonkeeper)           wallets.push({ id: 'tonkeeper', name: 'Tonkeeper', icon: '🔑' })
    if (window.Telegram?.WebApp)    wallets.push({ id: 'telegram',  name: 'Telegram Wallet', icon: '✈️' })
  }
  // TON Connect can always offer a QR/deeplink connection even with no injected wallet.
  wallets.push({ id: 'tonconnect', name: 'TON Connect', icon: '💎' })
  return wallets
}

// ── Wallet connection ───────────────────────────────────────────────────────

export async function connect() {
  const connector = await getConnector()
  if (connector) {
    // Restore an existing TON Connect session if present.
    await connector.restoreConnection().catch(() => {})
    if (connector.connected && connector.account) {
      _address = connector.account.address
      return { address: _address, chainId: ACTIVE_CHAIN.id, chainName: ACTIVE_CHAIN.name }
    }
    // No live session: the app UI should render TonConnectButton to open the
    // wallet picker. We surface a clear, actionable error rather than hanging.
    throw new Error('Open the TON Connect wallet picker to continue.')
  }

  const provider = injectedProvider()
  if (!provider) {
    throw new Error('No TON wallet detected. Install Tonkeeper or open inside Telegram.')
  }
  const accounts = await provider.send('ton_requestAccounts')
  _address = Array.isArray(accounts) ? accounts[0] : accounts
  if (!_address) throw new Error('TON wallet connection rejected')
  return { address: _address, chainId: ACTIVE_CHAIN.id, chainName: ACTIVE_CHAIN.name }
}

export function disconnect() {
  _connector?.disconnect?.().catch(() => {})
  _address = null
}

export function getAddress() {
  return _address ?? _connector?.account?.address ?? null
}

export function getChainId() {
  return ACTIVE_CHAIN.id
}

// TON has no EVM-style chain switching; a build targets one network.
export async function switchChain() { /* no-op on TON */ }

export async function signMessage(message) {
  const provider = injectedProvider()
  if (provider?.send) {
    const sig = await provider.send('ton_personalSign', [message])
    return { signature: sig, address: getAddress() }
  }
  throw new Error('TON wallet cannot sign a raw message; use signPurchase().')
}

// ── Purchase signature (proof of wallet control, no contract needed) ─────────
// Signs the CryptoLand purchase intent so the backend can verify the buyer
// controls the wallet. Works today; the server records DB ownership on success.

export async function signPurchase({ tileKey, price }) {
  const connector = await getConnector()
  const message = `CryptoLand purchase\nTile: ${tileKey}\nPrice: $${price}\nWallet: ${getAddress()}`
  if (connector?.connected) {
    // TON signs by sending a tiny self-transaction carrying the intent as a
    // comment (TON has no generic personal_sign); the tx hash is the proof.
    const tx = {
      validUntil: Math.floor(Date.now() / 1000) + 300,
      messages: [{
        address: getAddress(),
        amount: '1',   // 1 nanoton — negligible, just to anchor the comment
        payload: btoa(message),
      }],
    }
    const result = await connector.sendTransaction(tx)
    return { signature: result.boc, message }
  }
  const provider = injectedProvider()
  if (provider?.send) {
    const sig = await provider.send('ton_personalSign', [message])
    return { signature: sig, message }
  }
  throw new Error('TON wallet cannot sign the purchase intent.')
}

// ── Native payment (plain TON transfer to the treasury) ─────────────────────

/**
 * Pay for a tile in TON, from the user's own wallet.
 *
 * TON Connect's sendTransaction is the only write path a TON wallet gives a web
 * app, and a message with no payload is a bare value transfer — the same shape
 * signPurchase uses to anchor its comment, without the comment cell.
 *
 * `amount` is a decimal STRING of nanotons from the server's quote, which is
 * also exactly what TON Connect wants: it takes amounts as strings, and 1 TON
 * is 1e9 nanotons, so a Number would round a real payment.
 */
export async function payNative({ to, amount, from }) {
  if (!to)     throw new Error('No treasury address for this chain')
  if (!amount) throw new Error('No amount to pay')

  const nanotons = BigInt(amount)      // throws on a malformed quote
  if (nanotons <= 0n) throw new Error('Refusing to send a non-positive amount')

  const connector = await getConnector()
  if (!connector) {
    throw new Error('TON Connect unavailable — install @tonconnect/sdk to pay from a wallet.')
  }
  await connector.restoreConnection().catch(() => {})
  if (!connector.connected) {
    throw new Error('Open the TON Connect wallet picker and connect a wallet to pay.')
  }

  const payer = from ?? getAddress()
  if (!payer) throw new Error('No wallet account available')

  // validUntil is a deadline the WALLET enforces: past it it refuses to send,
  // rather than broadcasting later against a quote that has since expired.
  const result = await connector.sendTransaction({
    validUntil: Math.floor(Date.now() / 1000) + 300,
    messages: [{ address: to, amount: nanotons.toString() }],
  })

  // TON Connect returns the signed external message (BOC), not a hash — the
  // hash exists only once a validator includes it. The BOC is the transaction
  // handle everywhere else in this adapter (mintTile, waitForTx), so it is the
  // handle here too.
  const boc = result?.boc ?? null
  if (!boc) throw new Error('TON wallet returned no signed transaction')
  return { txHash: boc, from: payer }
}

/** Whether this build can take a wallet payment at all. */
export function supportsNativePay() {
  // Nothing to sniff: TON Connect reaches a wallet by QR or deeplink, so there
  // is no injected provider to require — the same reason detectWallets() always
  // offers it. A missing SDK surfaces as a clear error from payNative instead.
  return !ACTIVE_CHAIN.gasless && !ACTIVE_CHAIN.halted && typeof window !== 'undefined'
}

// ── NFT mint (stubbed until a TON NFT collection is deployed) ────────────────

export async function mintTile({ tx, ty, country, toAddress }) {
  if (!hasContract()) return mintStub('TON NFT collection not deployed')
  // Once VITE_CONTRACT_TON points at a deployed NFT collection, build the mint
  // message here (TON NFT item deploy under the collection) and send it via the
  // connector. Backend endpoint /ton/build-mint may assist with BOC assembly.
  const connector = await getConnector()
  if (!connector?.connected) throw new Error('Connect a TON wallet to mint.')
  const BASE = import.meta.env.VITE_API_BASE ?? ''
  const res  = await fetch(`${BASE}/ton/build-mint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tx, ty, country, owner: toAddress }),
  })
  if (!res.ok) throw new Error('Failed to build TON mint transaction')
  const { message } = await res.json()
  const result = await connector.sendTransaction(message)
  return { txHash: result.boc, tokenId: String(tileTokenId(tx, ty)), minted: true }
}

// ── Marketplace (activates with the deployed collection) ─────────────────────

export async function listForSale() { throw new Error('TON marketplace: available after collection deploy') }
export async function unlistTile()   { throw new Error('TON marketplace: available after collection deploy') }
export async function buyTile()      { throw new Error('TON marketplace: available after collection deploy') }

// ── Reads (delegate to backend / indexer) ────────────────────────────────────

export async function ownerOf()          { return null }
export async function getTileData()      { return null }
export async function getOwnedTokenIds() { return [] }
export async function totalSupply()      { return 0 }

export async function waitForTx(boc, maxWait = 120_000) {
  const start = Date.now()
  const BASE  = import.meta.env.VITE_API_BASE ?? ''
  while (Date.now() - start < maxWait) {
    const r = await fetch(`${BASE}/ton/tx-status?boc=${encodeURIComponent(boc)}`)
      .then(r => r.json()).catch(() => null)
    if (r?.confirmed) return r
    await new Promise(res => setTimeout(res, 3000))
  }
  throw new Error(`TON tx not confirmed within ${maxWait / 1000}s`)
}

// ── Listeners ────────────────────────────────────────────────────────────────

export async function onAccountsChanged(cb) {
  const connector = await getConnector()
  connector?.onStatusChange?.(w => cb(w?.account?.address ?? null))
}
export function onChainChanged() { /* TON build targets one network */ }
export function onDisconnect(cb) {
  _connector?.onStatusChange?.(w => { if (!w) cb() })
}
export function removeListeners() { /* TonConnect unsubscribes on disconnect */ }

export const ADAPTER_TYPE = 'ton'
