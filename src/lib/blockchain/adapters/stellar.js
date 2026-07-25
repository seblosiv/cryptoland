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
