/**
 * Stellar / Soroban Adapter — CryptoLand
 * =======================================
 * Covers Stellar mainnet + testnet via Freighter (@stellar/freighter-api).
 * Connect + address + purchase signMessage work today with no contract deployed;
 * NFT minting (a Soroban contract invocation) is stubbed until VITE_CONTRACT_STELLAR
 * (or VITE_CONTRACT_STELLAR_TESTNET) holds a deployed C… contract address.
 *
 * Implements the universal BlockchainAdapter interface (same surface as evm.js).
 *
 * Three things make Stellar unlike every other family here:
 *   1. Networks are identified by a PASSPHRASE, not a numeric id. ACTIVE_CHAIN.id
 *      IS that passphrase, and it is hashed into every signature — a signature
 *      produced for the wrong passphrase is only rejected at submit time.
 *   2. Freighter injects NOTHING on window from the extension (it talks over
 *      window.postMessage), so there is no synchronous feature-detect and the
 *      npm package must be imported — window.freighterApi exists only in the UMD
 *      <script> build.
 *   3. Freighter signs but NEVER submits. We submit the signed XDR ourselves via
 *      Soroban RPC sendTransaction (or Horizon for classic ops).
 *
 * Native XLM has 7 decimals (1 XLM = 10,000,000 stroops).
 *
 * The SDKs are optional peer deps and are lazy-loaded; the app builds and runs
 * with @stellar/freighter-api absent.
 */

import { ACTIVE_CHAIN } from '../config.js'
import { tileTokenId, tokenIdToTile, hasContract, mintStub } from './_shared.js'

export { tileTokenId, tokenIdToTile }

// ACTIVE_CHAIN.id is the network passphrase, e.g.
//   "Public Global Stellar Network ; September 2015" / "Test SDF Network ; September 2015"
const NETWORK_PASSPHRASE = ACTIVE_CHAIN.id
const HORIZON            = ACTIVE_CHAIN.rpcUrl          // https://horizon…
const SOROBAN_RPC        = ACTIVE_CHAIN.rpcUrlFallback  // https://…sorobanrpc…

let _api     = null   // cached @stellar/freighter-api module namespace
let _sdk     = null   // cached @stellar/stellar-sdk module namespace
let _address = null
let _watcher = null

const _cbs      = { accounts: [], chain: [], disconnect: [] }
let   _lastSeen = { address: null, passphrase: null }

// ── SDK loading (optional peer dep) ──────────────────────────────────────────

async function freighter() {
  if (_api) return _api
  if (typeof window === 'undefined') {
    throw new Error('Stellar wallet access is browser-only (Freighter is a browser extension).')
  }
  let mod
  try {
    mod = await import('@stellar/freighter-api')
  } catch {
    throw new Error(
      'Freighter SDK not available — install it with: npm i @stellar/freighter-api@^6.0.1 ' +
      '(the extension injects no window global, so the package is required).'
    )
  }
  // Some bundler/interop paths land the named exports on `.default`.
  _api = mod?.requestAccess ? mod : (mod?.default ?? mod)
  return _api
}

/**
 * Freighter SIGNS an XDR, it cannot BUILD one — and a Stellar transaction
 * envelope is length-prefixed binary XDR, not JSON, so there is no hand-rolled
 * shortcut the way there is on MultiversX. Building a payment therefore needs
 * the SDK (already declared external in vite.config.js, alongside the other
 * optional per-chain wallet packages).
 */
async function stellarSdk() {
  if (_sdk) return _sdk
  let mod
  try {
    mod = await import('@stellar/stellar-sdk')
  } catch {
    throw new Error(
      'Stellar SDK not available — install it with: npm i @stellar/stellar-sdk ' +
      '(Freighter signs a transaction envelope, it cannot build one).'
    )
  }
  _sdk = mod?.TransactionBuilder ? mod : (mod?.default ?? mod)
  if (!_sdk?.TransactionBuilder) throw new Error('@stellar/stellar-sdk loaded without TransactionBuilder — wrong package or a broken install.')
  return _sdk
}

/**
 * Every @stellar/freighter-api call resolves to an OBJECT that may carry `error`
 * instead of rejecting — an unchecked call silently yields undefined fields.
 */
function unwrap(res, what) {
  if (!res || typeof res !== 'object') throw new Error(`Freighter returned no result for ${what}().`)
  if (res.error) throw new Error(`Freighter ${what}() failed: ${res.error.message ?? res.error}`)
  return res
}

/**
 * StrKey base32: G… account (56), C… contract (56), M… muxed (69).
 * S… is a SECRET seed and must never reach the browser — refuse it loudly.
 */
function assertPublicAddress(addr) {
  if (typeof addr !== 'string' || !addr) throw new Error('Stellar wallet returned no address.')
  if (addr[0] === 'S') throw new Error('Refusing a Stellar SECRET key (S…) — CryptoLand only ever handles public addresses.')
  const ok = /^[GCM][A-Z2-7]+$/.test(addr) && (addr.length === 56 || addr.length === 69)
  if (!ok) throw new Error(`Not a valid Stellar address: ${addr}`)
  return addr
}

/**
 * Freighter v3 returns a Buffer for signedMessage, v4+ returns a base64 string.
 * Normalise both to base64 without Node's Buffer (undefined in the browser).
 */
function toBase64(signed) {
  if (typeof signed === 'string') return signed
  if (!signed) throw new Error('Freighter returned an empty signature.')
  let bytes = null
  if (signed instanceof Uint8Array) bytes = signed                       // Buffer subclasses Uint8Array
  else if (ArrayBuffer.isView(signed)) bytes = new Uint8Array(signed.buffer, signed.byteOffset, signed.byteLength)
  else if (Array.isArray(signed?.data)) bytes = Uint8Array.from(signed.data)  // structured-cloned Buffer
  else if (Array.isArray(signed)) bytes = Uint8Array.from(signed)
  if (!bytes) throw new Error('Unrecognised signature format returned by Freighter.')
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

async function currentAddress(api) {
  if (_address) return _address
  // getAddress() (unlike requestAccess()) returns an EMPTY address when the app
  // was never approved — it does not open the popup.
  const { address } = unwrap(await api.getAddress(), 'getAddress')
  if (!address) throw new Error('Connect a Stellar wallet first.')
  _address = assertPublicAddress(address)
  return _address
}

async function assertNetwork(api) {
  const net = await api.getNetwork?.().catch(() => null)
  const passphrase = net?.networkPassphrase
  if (passphrase && passphrase !== NETWORK_PASSPHRASE) {
    throw new Error(
      `Freighter is on "${net.network ?? passphrase}" but this build targets ${ACTIVE_CHAIN.name}. ` +
      'Switch the network in Freighter and reconnect — signatures made on the wrong network are invalid.'
    )
  }
}

// ── Wallet discovery ─────────────────────────────────────────────────────────

export function detectWallets() {
  // Freighter cannot be feature-detected synchronously: the extension exposes no
  // window global (it bridges over window.postMessage), so presence is confirmed
  // asynchronously in connect() via isConnected(). We therefore always offer it.
  // For a multi-wallet picker use @creit.tech/stellar-wallets-kit — note the DOT;
  // the hyphenated @creit-tech/… in its README is the JSR name and is not on npm.
  const wallets = [{ id: 'freighter', name: 'Freighter', icon: '🚀' }]
  if (typeof window !== 'undefined' && window.freighterApi) {
    wallets[0].name = 'Freighter (UMD)'   // only present when the script build is loaded
  }
  return wallets
}

// ── Wallet connection ───────────────────────────────────────────────────────

export async function connect() {
  const api = await freighter()

  // isConnected() means "extension installed", NOT "app authorised".
  const installed = await api.isConnected?.()
    .then(r => (typeof r === 'object' ? r?.isConnected : r))
    .catch(() => false)
  if (!installed) throw new Error('No Stellar wallet detected. Install the Freighter extension.')

  const { address } = unwrap(await api.requestAccess(), 'requestAccess')
  if (!address) throw new Error('Freighter connection rejected')
  _address = assertPublicAddress(address)

  await assertNetwork(api)
  return { address: _address, chainId: ACTIVE_CHAIN.id, chainName: ACTIVE_CHAIN.name }
}

export function disconnect() {
  // Freighter exposes no programmatic revoke (setAllowed only grants); the user
  // removes the app in the extension. We can only drop local state + polling.
  try { _watcher?.stop?.() } catch { /* watcher already gone */ }
  _watcher  = null
  _address  = null
  _lastSeen = { address: null, passphrase: null }
}

export function getAddress() {
  return _address
}

export function getChainId() {
  return ACTIVE_CHAIN.id   // the network passphrase — Stellar has no numeric chain id
}

export async function switchChain() { /* a Stellar build targets one passphrase */ }

// ── Signing ─────────────────────────────────────────────────────────────────

async function signText(text) {
  const api = await freighter()
  const address = await currentAddress(api)
  if (typeof api.signMessage !== 'function') {
    throw new Error(
      'This Freighter build cannot sign messages (signMessage needs @stellar/freighter-api v4+ / a current extension). ' +
      'Update Freighter — CryptoLand will not fabricate a signature.'
    )
  }
  const res = unwrap(
    await api.signMessage(text, { networkPassphrase: NETWORK_PASSPHRASE, address }),
    'signMessage'
  )
  return { signature: toBase64(res.signedMessage), address: res.signerAddress ?? address }
}

export async function signMessage(message) {
  return signText(message)
}

// ── Purchase signature (proof of wallet control, no contract needed) ─────────

export async function signPurchase({ tileKey, price }) {
  // signMessage does NOT bind the network passphrase into the signed payload the
  // way signTransaction does, so we write it into the text ourselves — otherwise a
  // testnet signature would verify against a mainnet purchase.
  const text = `CryptoLand purchase — tile ${tileKey} for $${price} — ${_address ?? ''}\nNetwork: ${NETWORK_PASSPHRASE}`
  const { signature } = await signText(text)
  return { signature, message: text }
}

// ── Transaction submission (Freighter signs, it never submits) ───────────────

async function submitXdr(signedTxXdr) {
  if (!signedTxXdr) throw new Error('Freighter returned no signed XDR.')

  // Soroban RPC first — the only endpoint that returns contract result meta.
  const rpc = await fetch(SOROBAN_RPC, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'sendTransaction', params: { transaction: signedTxXdr } }),
  }).then(r => r.json()).catch(() => null)

  const status = rpc?.result?.status
  // PENDING is the SUCCESS case here: sendTransaction only queues, it never confirms.
  if (status === 'PENDING' || status === 'DUPLICATE') return rpc.result.hash
  if (status === 'ERROR') throw new Error(`Soroban rejected the transaction: ${rpc.result.errorResultXdr ?? 'unknown error'}`)
  if (status === 'TRY_AGAIN_LATER') throw new Error('Soroban RPC is throttling this transaction — retry in a few seconds.')

  // Fallback for classic (non-Soroban) operations. Horizon takes a
  // form-urlencoded `tx=` body — posting JSON here returns 400.
  const res = await fetch(`${HORIZON}/transactions`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    `tx=${encodeURIComponent(signedTxXdr)}`,
  })
  const body = await res.json().catch(() => null)
  // Horizon 504 = still open after its synchronous wait; the hash is valid, so poll on.
  if (!res.ok && res.status !== 504) {
    const code = body?.extras?.result_codes?.transaction ?? body?.title ?? res.status
    throw new Error(`Stellar submission failed: ${code}`)
  }
  const hash = body?.hash
  if (!hash) throw new Error('Stellar submission returned no transaction hash.')
  return hash
}

// ── Native XLM payment (wallet → treasury) ──────────────────────────────────

// A Stellar transaction's fee is a MAX BID, not a charge: every transaction in
// a ledger pays the lowest bid that made it in, so overbidding costs nothing and
// is the only thing that survives surge pricing. 10× base is 1000 stroops
// (0.0001 XLM) — invisible next to a tile price, and it stops a busy ledger from
// silently dropping a paid purchase.
const FEE_BID_MULTIPLIER = 10n

/**
 * Stroops → the decimal XLM string a Payment operation takes.
 *
 * The whole rail quotes prices in integer base units, but the Stellar SDK's
 * `amount` field is whole XLM as a decimal string and re-multiplies by 10^7
 * itself. The conversion is BigInt divide + remainder, never `Number()`:
 * a float round-trip is exact only up to 2^53 stroops (~900M XLM) and is wrong
 * in the last digit well before that — and the last digit here is money.
 */
function stroopsToXlm(stroops) {
  const v = BigInt(stroops)
  const whole = v / 10_000_000n
  // Pad to the full 7 places first (so 1 stroop is 0.0000001, not 0.1), then
  // drop the trailing zeros the SDK does not need.
  const frac = (v % 10_000_000n).toString().padStart(7, '0').replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : String(whole)
}

/**
 * The account's CURRENT sequence number, straight from Horizon.
 * TransactionBuilder increments it for us, so this must be the last sequence the
 * network has seen, not the next one.
 */
async function accountSequence(address) {
  const res = await fetch(`${HORIZON}/accounts/${address}`)
  // 404 is the "account does not exist yet" case, which on Stellar means it has
  // never received the 1 XLM base reserve — it cannot pay for anything.
  if (res.status === 404) {
    throw new Error(`Stellar account ${address} is not funded yet — it needs at least the 1 XLM base reserve before it can send a payment.`)
  }
  if (!res.ok) throw new Error(`Could not read the Stellar account sequence (Horizon ${res.status}).`)
  const body = await res.json().catch(() => null)
  if (body?.sequence === undefined || body?.sequence === null) {
    throw new Error('Horizon returned no sequence number for this account.')
  }
  return String(body.sequence)
}

/**
 * Pay for a tile in XLM, from the user's own wallet.
 *
 * A classic Payment operation to the treasury — NOT a Soroban invocation. It
 * needs no deployed contract, carries the exact per-tile price, and the backend
 * re-reads the transaction from the chain afterwards, so a tampered `to` or
 * `amount` here simply fails verification and settles nothing.
 *
 * `amount` is a decimal STRING of stroops (1 XLM = 10,000,000). See
 * stroopsToXlm() for why it never becomes a Number.
 */
export async function payNative({ to, amount, from }) {
  if (!to)     throw new Error('No treasury address for this chain')
  if (!amount) throw new Error('No amount to pay')

  const stroops = BigInt(amount)          // throws on a malformed quote
  if (stroops <= 0n) throw new Error('Refusing to send a non-positive amount')

  assertPublicAddress(to)
  // A C… contract address cannot receive a classic payment — the funds would be
  // rejected at submit, after the user has already approved the popup.
  if (to[0] === 'C') throw new Error('The treasury address must be a G… account — a C… contract cannot receive a classic XLM payment.')

  const api   = await freighter()
  const payer = from ?? await currentAddress(api)
  assertPublicAddress(payer)
  // Account (unlike MuxedAccount) rejects an M… source, and Freighter hands back
  // a G… address, so this only trips on a caller-supplied `from`.
  if (payer[0] !== 'G') throw new Error(`Stellar payments must be sent from a G… account, got ${payer}`)
  // Signing on the wrong network is not a failed payment, it is money sent on a
  // ledger nobody is watching — check before the popup, not after.
  await assertNetwork(api)

  const { TransactionBuilder, Account, Operation, Asset, BASE_FEE } = await stellarSdk()

  const tx = new TransactionBuilder(new Account(payer, await accountSequence(payer)), {
    fee: String(BigInt(BASE_FEE) * FEE_BID_MULTIPLIER),
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(Operation.payment({
      destination: to,
      asset:       Asset.native(),
      amount:      stroopsToXlm(stroops),
    }))
    // build() THROWS without timebounds. 3 minutes is long enough to approve in
    // the extension and short enough that an abandoned signature expires instead
    // of landing hours later against a quote that has already gone stale.
    .setTimeout(180)
    .build()

  const signed = unwrap(
    await api.signTransaction(tx.toXDR(), { networkPassphrase: NETWORK_PASSPHRASE, address: payer }),
    'signTransaction'
  )
  // submitXdr returns the hash the network assigned, which is what an explorer
  // (and the backend verifier) will look up.
  return { txHash: await submitXdr(signed.signedTxXdr), from: payer }
}

/** Whether this build can take a wallet payment at all. */
export function supportsNativePay() {
  // Freighter exposes no window global (see detectWallets), so "is a wallet
  // there" cannot be answered synchronously — being in a browser is the only
  // honest precondition, and connect() is where a missing extension surfaces.
  return typeof window !== 'undefined' && !ACTIVE_CHAIN.gasless && !ACTIVE_CHAIN.halted
}

// ── NFT mint (stubbed until a Soroban contract is deployed) ──────────────────

export async function mintTile({ tx, ty, country, toAddress }) {
  if (!hasContract()) return mintStub('Soroban contract not deployed')

  const api     = await freighter()
  const address = await currentAddress(api)
  await assertNetwork(api)

  const tokenId = tileTokenId(tx, ty)   // ≤ 2^29, so it fits a Soroban u32/u64 unchanged

  // The backend builds AND simulates the invoke_host_function tx: a Soroban call
  // must already carry the footprint, auth entries and resource fee returned by
  // simulateTransaction before it is signed. Freighter does not simulate, and an
  // unprepared XDR is rejected at submit — signing it wastes the user's click.
  const BASE = import.meta.env.VITE_API_BASE ?? ''
  const res  = await fetch(`${BASE}/stellar/build-mint`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      tx, ty, country,
      owner:              toAddress,
      source:             address,
      contractId:         ACTIVE_CHAIN.contractAddress,
      networkPassphrase:  NETWORK_PASSPHRASE,
    }),
  })
  if (!res.ok) throw new Error('Failed to build Soroban mint transaction')
  const { xdr } = await res.json()
  if (!xdr) throw new Error('Backend returned no prepared XDR for the Soroban mint.')

  const signed = unwrap(
    await api.signTransaction(xdr, { networkPassphrase: NETWORK_PASSPHRASE, address }),
    'signTransaction'
  )
  const txHash = await submitXdr(signed.signedTxXdr)
  return { txHash, tokenId: String(tokenId), minted: true }
}

// ── Marketplace (activates with the deployed contract) ───────────────────────

export async function listForSale() { throw new Error('Stellar marketplace: available after Soroban contract deploy') }
export async function unlistTile()   { throw new Error('Stellar marketplace: available after Soroban contract deploy') }
export async function buyTile()      { throw new Error('Stellar marketplace: available after Soroban contract deploy') }

// ── Reads (delegate to backend / Horizon indexer) ───────────────────────────

export async function ownerOf()          { return null }
export async function getTileData()      { return null }
export async function getOwnedTokenIds() { return [] }
export async function totalSupply()      { return 0 }

export async function waitForTx(hash, maxWait = 60_000) {
  if (!hash) throw new Error('waitForTx: no Stellar transaction hash given.')
  const start = Date.now()
  while (Date.now() - start < maxWait) {
    const rpc = await fetch(SOROBAN_RPC, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTransaction', params: { hash } }),
    }).then(r => r.json()).catch(() => null)

    const status = rpc?.result?.status
    if (status === 'SUCCESS') return rpc.result
    if (status === 'FAILED')  throw new Error(`Stellar tx ${hash} failed`)
    // NOT_FOUND means "not in a ledger yet" — Soroban RPC also only retains a
    // rolling window of history, so it is never proof of failure.

    if (!status) {
      // Classic tx or RPC unavailable: Horizon 404s while pending, then answers.
      const h = await fetch(`${HORIZON}/transactions/${hash}`).then(r => (r.ok ? r.json() : null)).catch(() => null)
      if (h?.successful === true)  return h
      if (h?.successful === false) throw new Error(`Stellar tx ${hash} failed`)
    }
    await new Promise(r => setTimeout(r, 2000))
  }
  throw new Error(`Stellar tx ${hash} not confirmed within ${maxWait / 1000}s`)
}

// ── Listeners ───────────────────────────────────────────────────────────────

/**
 * Freighter emits no events — WatchWalletChanges POLLS the extension and invokes
 * the callback with { address, network, networkPassphrase }. One shared watcher
 * feeds all three listener kinds so we never poll more than once.
 */
async function startWatcher() {
  if (_watcher || typeof window === 'undefined') return
  const api   = await freighter().catch(() => null)
  const Watch = api?.WatchWalletChanges
  if (typeof Watch !== 'function') return   // older freighter-api: callbacks stay idle rather than crash
  try {
    _lastSeen = { address: _address, passphrase: NETWORK_PASSPHRASE }
    _watcher  = new Watch(3000)
    _watcher.watch((info = {}) => {
      const addr = info.address || null
      if (addr !== _lastSeen.address) {
        _lastSeen.address = addr
        _address = addr
        _cbs.accounts.forEach(cb => { try { cb(addr) } catch { /* listener owns its errors */ } })
        // A locked or de-authorised wallet surfaces as an EMPTY address, never as
        // a disconnect event — that is the only disconnect signal Freighter gives.
        if (!addr) _cbs.disconnect.forEach(cb => { try { cb() } catch { /* ignore */ } })
      }
      const pass = info.networkPassphrase
      if (pass && pass !== _lastSeen.passphrase) {
        _lastSeen.passphrase = pass
        _cbs.chain.forEach(cb => { try { cb(pass) } catch { /* ignore */ } })
      }
    })
  } catch {
    _watcher = null
  }
}

export async function onAccountsChanged(cb) {
  if (typeof cb !== 'function') return
  _cbs.accounts.push(cb)
  await startWatcher()
}

// Not a no-op despite the single-network build: if the user flips Freighter to
// another network, every later signature would be invalid for this deployment.
export async function onChainChanged(cb) {
  if (typeof cb !== 'function') return
  _cbs.chain.push(cb)
  await startWatcher()
}

export async function onDisconnect(cb) {
  if (typeof cb !== 'function') return
  _cbs.disconnect.push(cb)
  await startWatcher()
}

export function removeListeners() {
  try { _watcher?.stop?.() } catch { /* already stopped */ }
  _watcher = null
  _cbs.accounts.length   = 0
  _cbs.chain.length      = 0
  _cbs.disconnect.length = 0
}

export const ADAPTER_TYPE = 'stellar'
