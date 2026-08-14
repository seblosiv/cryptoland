/**
 * NEAR Adapter — CryptoLand
 * ==========================
 * Covers NEAR mainnet + testnet via NEAR Wallet Selector (Meteor, MyNearWallet,
 * Sender, Nightly). Connect + address + purchase signature (NEP-413) work today
 * with no contract deployed; NFT minting (a NEP-171/NEP-177 WASM contract) is
 * stubbed until VITE_CONTRACT_NEAR is set.
 *
 * Implements the universal BlockchainAdapter interface (same surface as evm.js).
 *
 * Every NEAR SDK is an OPTIONAL peer dep, lazy-imported inside the functions that
 * need it and externalised in vite.config.js, so a build without them still ships.
 *
 * NEAR is not EVM-shaped and three of its quirks leak into this file:
 *   1. Browser wallets REDIRECT instead of resolving a promise (see signMessage).
 *   2. Wallet Selector v10 wants NAJ action objects, not literal `{ type: ... }`.
 *   3. The RPC `tx` query needs the signer account id, not just the hash.
 */

import { ACTIVE_CHAIN } from '../config.js'
import { tileTokenId, tokenIdToTile, hasContract, mintStub } from './_shared.js'

export { tileTokenId, tokenIdToTile }

// ACTIVE_CHAIN.id is already the literal string Wallet Selector expects
// ('mainnet' | 'testnet') — no mapping table needed.
const NETWORK = ACTIVE_CHAIN.id

const GAS_30_TGAS      = BigInt('30000000000000')             // 30 TGas — plenty for nft_mint
const STORAGE_DEPOSIT   = BigInt('10000000000000000000000')   // 0.01 NEAR covers NEP-171 storage
// yoctoNEAR is 24 decimals: 1 NEAR = 1e24, far past Number.MAX_SAFE_INTEGER.
// Every amount below MUST stay BigInt or the wallet gets a rounded deposit.

const PENDING_KEY = 'cryptoland.near.nep413'

let _selector = null
let _wallet   = null   // Wallet Selector wallet handle
let _address  = null   // NEAR account id, e.g. alice.near
let _subs     = []     // event subscriptions, released by removeListeners()

// ── SDK loading (optional peer deps) ─────────────────────────────────────────

/**
 * The NEAR Foundation now recommends HOT Connect (@hot-labs/near-connect) over
 * Wallet Selector, and it is API-compatible — migrating is a one-line change to
 * the specifier below (both export setupWalletSelector + actionCreators).
 * Wallet Selector stays supported through the transition, so it remains default.
 */
async function loadCore() {
  try {
    return await import('@near-wallet-selector/core')
  } catch {
    throw new Error(
      'NEAR wallet SDK not installed — run: npm i @near-wallet-selector/core@10 ' +
      '@near-wallet-selector/modal-ui@10 @near-wallet-selector/my-near-wallet@10 ' +
      '@near-wallet-selector/meteor-wallet@10 @near-wallet-selector/sender@10 ' +
      '@near-wallet-selector/nightly@10'
    )
  }
}

/** Each wallet module is independently optional — a deployment ships only what it wants. */
async function loadWalletModules() {
  const setups = await Promise.all([
    import('@near-wallet-selector/meteor-wallet').then(m => m.setupMeteorWallet?.()).catch(() => null),
    import('@near-wallet-selector/my-near-wallet').then(m => m.setupMyNearWallet?.()).catch(() => null),
    import('@near-wallet-selector/sender').then(m => m.setupSender?.()).catch(() => null),
    import('@near-wallet-selector/nightly').then(m => m.setupNightly?.()).catch(() => null),
  ])
  return setups.filter(Boolean)
}

async function getSelector() {
  if (_selector) return _selector
  if (typeof window === 'undefined') throw new Error('NEAR wallet selector requires a browser.')
  const { setupWalletSelector } = await loadCore()
  const modules = await loadWalletModules()
  if (!modules.length) {
    throw new Error('No NEAR wallet modules installed — add at least @near-wallet-selector/my-near-wallet@10.')
  }
  // setupWalletSelector() shows no UI; it only restores any existing session.
  _selector = await setupWalletSelector({ network: NETWORK, modules })
  return _selector
}

async function requireWallet() {
  if (_wallet) return _wallet
  const selector = await getSelector()
  if (!selector.isSignedIn()) throw new Error('Connect a NEAR wallet first.')
  _wallet = await selector.wallet()
  _address ??= storeAccounts(selector)[0] ?? null
  return _wallet
}

function storeAccounts(selector) {
  const accounts = selector?.store?.getState?.()?.accounts ?? []
  return accounts.map(a => a?.accountId).filter(Boolean)
}

// ── Account ids ──────────────────────────────────────────────────────────────

/** Named account (alice.near) or 64-char implicit account (raw hex public key). */
function isAccountId(id) {
  if (typeof id !== 'string') return false
  if (/^[0-9a-f]{64}$/.test(id)) return true
  return id.length >= 2 && id.length <= 64 && /^[a-z0-9]+([-_.][a-z0-9]+)*$/.test(id)
}

/**
 * The account we ask the wallet to scope its access key to. NEVER pass an empty
 * contractId: browser wallets read that as a request for a FULL-ACCESS key, which
 * hands the dapp the user's whole account. With no contract of our own deployed we
 * scope to the network's wrap contract but restrict methodNames to a method that
 * does not exist, so the issued function-call key can do precisely nothing.
 */
function loginScope() {
  if (hasContract()) return { contractId: ACTIVE_CHAIN.contractAddress, methodNames: [] }
  return {
    contractId: NETWORK === 'mainnet' ? 'wrap.near' : 'wrap.testnet',
    methodNames: ['cryptoland_login_only'],
  }
}

// ── Wallet discovery ─────────────────────────────────────────────────────────

export function detectWallets() {
  const wallets = []
  if (typeof window !== 'undefined') {
    // Most NEAR wallets are web wallets with nothing injected — only the
    // extension wallets are detectable here.
    if (window.near?.isSender || window.sender) wallets.push({ id: 'sender',  name: 'Sender',  icon: '📨' })
    if (window.nightly?.near)                   wallets.push({ id: 'nightly', name: 'Nightly', icon: '🌙' })
    if (window.meteorWallet || window.meteorWalletApp) wallets.push({ id: 'meteor', name: 'Meteor', icon: '☄️' })
  }
  // The selector modal always works (web wallets, QR, deep links).
  wallets.push({ id: 'near-wallet-selector', name: 'NEAR Wallet', icon: '🌐' })
  return wallets
}

// ── Wallet connection ───────────────────────────────────────────────────────

export async function connect() {
  const selector = await getSelector()

  // A redirect wallet (MyNearWallet) navigates away and comes back: on that
  // second page load the session is already restored, so this is the hot path.
  if (selector.isSignedIn()) {
    _wallet  = await selector.wallet()
    _address = storeAccounts(selector)[0] ?? null
    if (_address) return { address: _address, chainId: ACTIVE_CHAIN.id, chainName: ACTIVE_CHAIN.name }
  }

  // Nothing signed in: open the picker. modal-ui is optional too, so degrade to
  // an actionable error rather than hanging with no UI on screen.
  let modal = null
  try {
    const { setupModal } = await import('@near-wallet-selector/modal-ui')
    modal = setupModal(selector, loginScope())
    modal.show()
  } catch {
    throw new Error('Install @near-wallet-selector/modal-ui@10 to show the NEAR wallet picker.')
  }

  const accountId = await new Promise((resolve, reject) => {
    let sub, timer
    const done = fn => value => { clearTimeout(timer); sub?.remove?.(); modal?.hide?.(); fn(value) }
    const finish = done(resolve)
    // An extension wallet resolves here; a redirect wallet never does — the page
    // unloads mid-await and connect() succeeds on the next load instead.
    sub   = selector.on('signedIn', () => finish(storeAccounts(selector)[0] ?? null))
    timer = setTimeout(done(reject), 120_000, new Error('NEAR wallet connection not completed.'))
  })

  if (!accountId) throw new Error('NEAR wallet connection rejected')
  _wallet  = await selector.wallet()
  _address = accountId
  return { address: _address, chainId: ACTIVE_CHAIN.id, chainName: ACTIVE_CHAIN.name }
}

export function disconnect() {
  _wallet?.signOut?.().catch(() => {})
  _wallet  = null
  _address = null
  if (typeof window !== 'undefined') window.sessionStorage?.removeItem?.(PENDING_KEY)
}

export function getAddress() {
  return _address ?? (_selector ? storeAccounts(_selector)[0] ?? null : null)
}

export function getChainId() {
  return ACTIVE_CHAIN.id
}

export async function switchChain() { /* a NEAR build targets one network — baked into setupWalletSelector */ }

// ── NEP-413 message signing ──────────────────────────────────────────────────

function randomNonce() {
  // NEP-413 mandates a 32-BYTE nonce. A string (or any other length) is rejected
  // by the wallet — this is the single most common integration bug on NEAR.
  const nonce = new Uint8Array(32)
  globalThis.crypto?.getRandomValues?.(nonce)
  return nonce
}

function toBase64(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
}

/** The NEP-413 `recipient` — who the signature is addressed to. */
function signRecipient() {
  if (hasContract()) return ACTIVE_CHAIN.contractAddress
  return typeof window !== 'undefined' ? window.location.host : 'cryptoland'
}

function savePending(record) {
  if (typeof window === 'undefined') return
  try { window.sessionStorage?.setItem(PENDING_KEY, JSON.stringify(record)) } catch { /* private mode */ }
}

/**
 * Redirect wallets return the signature as query/hash params on the callbackUrl,
 * not as a resolved promise. Recover it on the way back in — matched against the
 * message we stashed before leaving, so a stale URL can never sign the wrong text.
 */
function readCallback(message) {
  if (typeof window === 'undefined') return null
  const q = new URLSearchParams(window.location.search || '')
  const h = new URLSearchParams((window.location.hash || '').replace(/^#/, ''))
  const get = k => q.get(k) ?? h.get(k)

  let pending
  try { pending = JSON.parse(window.sessionStorage?.getItem(PENDING_KEY) ?? 'null') } catch { /* private mode */ }

  if (get('errorCode') || get('error')) {
    try { window.sessionStorage?.removeItem(PENDING_KEY) } catch { /* ignore */ }
    return null
  }
  const signature = get('signature')
  if (!signature || !pending || pending.message !== message) return null
  try { window.sessionStorage?.removeItem(PENDING_KEY) } catch { /* ignore */ }
  return {
    signature,
    address:   get('accountId') ?? pending.accountId ?? getAddress(),
    publicKey: get('publicKey') ?? null,
    nonce:     pending.nonce,
    recipient: pending.recipient,
  }
}

/**
 * Sign `message` per NEP-413.
 *
 * LIMITATION — read before consuming the result: wallet.signMessage() is typed
 * Promise<void | SignedMessage>. Extension wallets resolve with the signature;
 * browser wallets (MyNearWallet) REDIRECT the whole page and deliver the result
 * to callbackUrl instead. In that case we return `signature: null` — the caller
 * must treat null as "pending, retry after the redirect returns" and MUST NOT
 * treat it as a signed message. We never fabricate a signature to fill the gap.
 */
export async function signMessage(message) {
  if (typeof window === 'undefined') throw new Error('NEAR signMessage requires a browser.')
  const wallet = await requireWallet()
  if (typeof wallet.signMessage !== 'function') {
    throw new Error(`NEAR wallet "${wallet.id ?? 'unknown'}" does not implement NEP-413 signMessage.`)
  }

  const returned = readCallback(message)
  if (returned) return returned

  const nonce     = randomNonce()
  const recipient = signRecipient()
  savePending({
    message, recipient, nonce: toBase64(nonce), accountId: getAddress(),
  })

  const signed = await wallet.signMessage({
    message, recipient, nonce, callbackUrl: window.location.href,
  })
  if (!signed) {
    return {
      signature: null, address: getAddress(), publicKey: null,
      nonce: toBase64(nonce), recipient, redirected: true,
    }
  }
  return {
    signature: signed.signature,
    address:   signed.accountId ?? getAddress(),
    publicKey: signed.publicKey ?? null,
    nonce:     toBase64(nonce),
    recipient,
  }
}

// ── Purchase signature (proof of wallet control, no contract needed) ─────────

export async function signPurchase({ tileKey, price }) {
  const text = `CryptoLand purchase — tile ${tileKey} for $${price} — ${getAddress()}`
  const res  = await signMessage(text)
  // Same redirect caveat as signMessage: a null signature means "the wallet
  // navigated away", not "signing failed" — and never a valid proof.
  return { ...res, message: text }
}

// ── Native payment (pay for a tile in NEAR) ──────────────────────────────────

/**
 * Pay for a tile with the chain's own token, from the user's own wallet.
 *
 * A Transfer ACTION with a yoctoNEAR deposit, down the same
 * signAndSendTransaction path mintTile() uses — actionCreators.transfer(deposit)
 * instead of a functionCall, and the treasury account as receiverId. No contract
 * call, no mint: the tile's price is per-tile, and a contract charging one flat
 * price cannot express it.
 *
 * `amount` is a decimal STRING of base units from the server's quote. yoctoNEAR
 * is 24 decimals — 1 NEAR is 1e24 — so it stays BigInt from here into the
 * action. A Number would round away real money silently.
 *
 * A Transfer CANNOT be authorised by a function-call access key, which is the
 * only kind loginScope() lets a wallet issue us. So unlike a mint this always
 * needs a full-access signature: extension wallets prompt, and browser wallets
 * (MyNearWallet) REDIRECT the page exactly as signMessage documents. We never
 * fabricate a hash to paper over that.
 */
export async function payNative({ to, amount, from }) {
  if (!to)     throw new Error('No treasury address for this chain')
  if (!amount) throw new Error('No amount to pay')

  const deposit = BigInt(amount)        // throws on a malformed quote
  if (deposit <= 0n) throw new Error('Refusing to send a non-positive amount')
  // A typo'd receiver is not rejected by the network — NEAR CREATES an implicit
  // account for any 64-hex id, so an unvalidated recipient burns the payment.
  if (!isAccountId(to)) {
    throw new Error(`"${to}" is not a NEAR account id — refusing to send NEAR to it`)
  }

  const wallet   = await requireWallet()
  const signerId = getAddress()
  if (!signerId) throw new Error('No NEAR account connected')
  // The wallet signs as whoever is signed in, so a `from` that no longer matches
  // means the quote was bound to a different payer: the NEAR would move and only
  // then fail verification.
  if (from && from !== signerId) {
    throw new Error(`Wallet is signed in as ${signerId}, but this payment was quoted for ${from}. Switch accounts and retry.`)
  }

  // Same v10 rule as mintTile: actions must be actionCreators objects, never the
  // literal { type: 'Transfer' } shape, which is silently rejected.
  const { actionCreators } = await loadCore()
  if (typeof actionCreators?.transfer !== 'function') {
    throw new Error('NEAR SDK is too old for actionCreators.transfer — reinstall @near-wallet-selector/core@10.')
  }

  const outcome = await wallet.signAndSendTransaction({
    signerId,
    receiverId: to,
    actions: [actionCreators.transfer(deposit)],
  })

  const txHash = outcome?.transaction?.hash ?? outcome?.transaction_outcome?.id ?? null
  if (!txHash) {
    // Reached only if a redirect wallet resolves without navigating; when it does
    // navigate, this line never runs and the payment is confirmed on the way back.
    throw new Error('NEAR wallet redirected to approve the payment — it settles when the page returns.')
  }
  return { txHash, from: signerId }
}

/** Whether this build can take a wallet payment at all. */
export function supportsNativePay() {
  if (ACTIVE_CHAIN.gasless || ACTIVE_CHAIN.halted) return false
  // detectWallets() always offers the selector modal, and its one hard
  // precondition is a browser — NEAR's wallets are web wallets that need a page
  // to redirect. Whether the optional SDK is installed is an async question, so
  // payNative()/loadCore() answers that one with an install hint.
  return typeof window !== 'undefined'
}

// ── NFT mint (stubbed until a NEP-171 contract is deployed) ──────────────────

export async function mintTile({ tx, ty, country, toAddress }) {
  if (!hasContract()) return mintStub('NEAR NFT contract not deployed')
  const wallet = await requireWallet()
  const receiverId = toAddress ?? getAddress()
  if (!isAccountId(receiverId)) {
    throw new Error(`"${receiverId}" is not a NEAR account id (expected alice.${NETWORK === 'mainnet' ? 'near' : 'testnet'} or 64 hex chars).`)
  }

  const tokenId = String(tileTokenId(tx, ty))
  const BASE    = import.meta.env.VITE_API_BASE ?? ''
  const args = {
    token_id:    tokenId,          // NEP-171 token ids are strings, so the shared
    receiver_id: receiverId,       // packed id maps across chains unchanged.
    token_metadata: {
      title:       `CryptoLand Tile ${tx},${ty}`,
      description: country ? `Tile ${tx},${ty} — ${country}` : `Tile ${tx},${ty}`,
      media:       `${BASE}/nft/${tokenId}/image`,
      reference:   `${BASE}/nft/${tokenId}`,
      extra:       JSON.stringify({ tx, ty, country: country ?? null }),
    },
  }

  // Wallet Selector v10 BREAKING CHANGE: actions must be built with
  // actionCreators (near-api-js action objects). The old literal
  // { type: 'FunctionCall', params: {...} } shape is silently rejected.
  const { actionCreators } = await loadCore()
  const outcome = await wallet.signAndSendTransaction({
    signerId:   getAddress() ?? undefined,
    receiverId: ACTIVE_CHAIN.contractAddress,
    actions:    [actionCreators.functionCall('nft_mint', args, GAS_30_TGAS, STORAGE_DEPOSIT)],
  })

  // signAndSendTransaction redirects on browser wallets too and resolves void.
  const txHash = outcome?.transaction?.hash ?? outcome?.transaction_outcome?.id ?? null
  if (!txHash) return mintStub('wallet redirected — mint confirms when the page returns')
  return { txHash, tokenId, minted: true }
}

// ── Marketplace (activates with the deployed contract) ───────────────────────

export async function listForSale() { throw new Error('NEAR marketplace: available after contract deploy') }
export async function unlistTile()   { throw new Error('NEAR marketplace: available after contract deploy') }
export async function buyTile()      { throw new Error('NEAR marketplace: available after contract deploy') }

// ── Reads (delegate to backend / indexer) ────────────────────────────────────
// The on-chain equivalents once a contract exists are the NEP-171 view methods
// nft_token / nft_tokens_for_owner / nft_total_supply.

export async function ownerOf()          { return null }
export async function getTileData()      { return null }
export async function getOwnedTokenIds() { return [] }
export async function totalSupply()      { return 0 }

export async function waitForTx(hash, maxWait = 60_000, accountId = getAddress()) {
  if (!hash) throw new Error('NEAR waitForTx: no transaction hash')
  // The `tx` query REQUIRES the signer account id alongside the hash — NEAR
  // routes lookups by account shard, so a hash on its own returns UNKNOWN_TRANSACTION.
  if (!accountId) throw new Error('NEAR waitForTx: signer account id required alongside the hash')

  const endpoints = [ACTIVE_CHAIN.rpcUrl, ACTIVE_CHAIN.rpcUrlFallback].filter(Boolean)
  const start = Date.now()
  while (Date.now() - start < maxWait) {
    for (const url of endpoints) {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 'cryptoland', method: 'tx',
          params: { tx_hash: hash, sender_account_id: accountId, wait_until: 'EXECUTED' },
        }),
      }).then(r => r.json()).catch(() => null)

      const status = r?.result?.status
      // status is an enum object: { SuccessValue } | { SuccessReceiptId } | { Failure }.
      if (status && ('SuccessValue' in status || 'SuccessReceiptId' in status)) return r.result
      if (status?.Failure) throw new Error(`NEAR tx ${hash} failed`)
    }
    await new Promise(res => setTimeout(res, 1500))
  }
  throw new Error(`NEAR tx ${hash} not confirmed within ${maxWait / 1000}s`)
}

// ── Listeners ────────────────────────────────────────────────────────────────

function subscribe(event, handler) {
  if (typeof window === 'undefined') return
  // getSelector() is silent (no UI) and idempotent, so registering a listener
  // early is safe. Best-effort: a missing SDK must not throw at listener setup.
  getSelector()
    .then(sel => { const sub = sel.on?.(event, handler); if (sub) _subs.push(sub) })
    .catch(() => {})
}

export function onAccountsChanged(cb) {
  subscribe('accountsChanged', e => {
    _address = e?.accounts?.[0]?.accountId ?? null
    cb(_address)
  })
}
export function onChainChanged() { /* a NEAR build targets one network */ }
export function onDisconnect(cb) {
  subscribe('signedOut', () => { _wallet = null; _address = null; cb() })
}
export function removeListeners() {
  for (const sub of _subs) sub?.remove?.()
  _subs = []
}

export const ADAPTER_TYPE = 'near'
