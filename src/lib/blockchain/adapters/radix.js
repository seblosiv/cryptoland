/**
 * Radix Adapter — CryptoLand
 * ===========================
 * Covers Radix Babylon mainnet + Stokenet via the Radix dApp Toolkit. Connect +
 * address + purchase authentication work today with nothing deployed; the NFT
 * mint is stubbed until VITE_CONTRACT_RADIX is set.
 *
 * Implements the universal BlockchainAdapter interface (same surface as evm.js).
 *
 * ARCHITECTURE — unlike every other chain here, Radix has NO injected window
 * provider and no keys in the browser. The chain is:
 *     dApp  <->  Radix Connector browser extension  <->  Radix Wallet MOBILE APP
 * Keys and signing live only in the phone app; on mobile browsers the toolkit
 * deep-links to it instead of talking to an extension. Same interface either way,
 * so there is nothing to feature-detect — detectWallets() reports one wallet.
 *
 * SIGNING ASYMMETRY — READ BEFORE TOUCHING signMessage():
 *   Radix has NO arbitrary-message signing. There is no personal_sign, no
 *   signData, no eth_sign equivalent; the wallet will not sign a string a dApp
 *   invents. Authentication is ROLA (Radix Off-Ledger Authentication): the SERVER
 *   issues a 32-byte challenge, the wallet returns a SignedChallenge proof bound
 *   to that challenge + this dApp's definition address + the page origin, and the
 *   server verifies it with @radixdlt/rola.
 *   => signMessage() therefore THROWS. signPurchase() implements the real ROLA
 *      flow and returns the SignedChallenge as its `signature`. Nothing in this
 *      file ever fabricates a signature.
 *
 * @radixdlt/radix-dapp-toolkit is an OPTIONAL peer dep, lazy-loaded on first use
 * and marked external in vite.config.js, so this build works with it absent.
 */

import { ACTIVE_CHAIN } from '../config.js'
import { tileTokenId, tokenIdToTile, hasContract, mintStub } from './_shared.js'

export { tileTokenId, tokenIdToTile }

let _sdk        = null   // the lazily imported toolkit module
let _rdt        = null   // RadixDappToolkit instance (one per page)
let _rdtPromise = null   // in-flight init, so concurrent callers share one instance
let _address    = null   // account_rdx1... / account_tdx_2_1...
let _accounts   = []
let _persona    = null

// networkId is NOT ACTIVE_CHAIN.id — that is the string 'radix-mainnet' /
// 'radix-stokenet' (a numeric 1 would collide with Ethereum in chainById), so
// the real network id is derived from the testnet flag.
const NETWORK_ID = ACTIVE_CHAIN.testnet ? 2 : 1

// Radix addresses are bech32m with a prefix that encodes BOTH the entity type
// and the network (account_/resource_/component_/package_ + rdx | tdx_2_). One
// startsWith check therefore catches "that's not an account" AND "your wallet is
// on the wrong network" — the two failures worth reporting differently.
const ACCOUNT_PREFIX = ACTIVE_CHAIN.testnet ? 'account_tdx_2_1' : 'account_rdx1'

// ── SDK (optional, lazy) ─────────────────────────────────────────────────────

async function loadSdk() {
  if (_sdk) return _sdk
  try {
    _sdk = await import('@radixdlt/radix-dapp-toolkit')
  } catch {
    throw new Error(
      'Radix dApp Toolkit not available — run: npm i @radixdlt/radix-dapp-toolkit'
    )
  }
  return _sdk
}

/**
 * The toolkit cannot be constructed without a dApp Definition address: it is the
 * on-ledger account carrying this dApp's metadata, and the wallet refuses (and
 * ROLA verification rejects) proofs issued for an unknown one. There is no
 * sensible default, so fail loudly rather than half-connecting.
 */
function dAppDefinitionAddress() {
  const addr = import.meta.env.VITE_RADIX_DAPP_DEFINITION || null
  if (!addr) {
    throw new Error(
      'VITE_RADIX_DAPP_DEFINITION is not set — create a dApp Definition account in the ' +
      'Radix Wallet (Account settings → "Set as dApp Definition") and put its address in .env.radix.'
    )
  }
  if (!String(addr).startsWith(ACCOUNT_PREFIX)) {
    throw new Error(
      `VITE_RADIX_DAPP_DEFINITION "${addr}" is not a ${ACTIVE_CHAIN.name} account address ` +
      `(expected prefix "${ACCOUNT_PREFIX}"). A dApp definition is network-specific.`
    )
  }
  return addr
}

/**
 * RDT drives its whole connect/request UX through the <radix-connect-button>
 * custom element — with none in the DOM there is nothing to render the connector
 * status card or the mobile deep-link prompt, and sendRequest() leaves the user
 * staring at a dead page. The app should mount one in its own header; this is the
 * fallback so the flow still completes if it hasn't. Deliberately NOT hidden:
 * the connector anchors its popup to the element.
 */
function ensureConnectButton() {
  if (typeof document === 'undefined' || !document.body) return
  if (document.querySelector('radix-connect-button')) return
  const el = document.createElement('radix-connect-button')
  el.dataset.cryptolandAuto = 'true'
  el.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:9999'
  document.body.appendChild(el)
}

async function initToolkit() {
  const { RadixDappToolkit, RadixNetwork } = await loadSdk()
  ensureConnectButton()
  _rdt = RadixDappToolkit({
    dAppDefinitionAddress: dAppDefinitionAddress(),
    networkId: ACTIVE_CHAIN.testnet
      ? (RadixNetwork?.Stokenet ?? NETWORK_ID)
      : (RadixNetwork?.Mainnet ?? NETWORK_ID),
    applicationName: 'CryptoLand',
    applicationVersion: '1.0.0',
  })
  return _rdt
}

async function getToolkit() {
  if (typeof window === 'undefined') {
    throw new Error('Radix Wallet requires a browser — the Connector extension / deep link is client-side only.')
  }
  if (_rdt) return _rdt
  if (!_rdtPromise) {
    // Drop the cached promise on failure (missing SDK, unset dApp definition) so
    // a later call retries instead of replaying the same rejection forever.
    _rdtPromise = initToolkit().catch(err => { _rdtPromise = null; throw err })
  }
  return _rdtPromise
}

/**
 * RDT v2 returns neverthrow Results: a cancelled or failed wallet request
 * RESOLVES with { isErr(): true, error } instead of rejecting. Unwrap explicitly
 * or a user hitting "cancel" reads as success.
 */
function unwrap(result, what) {
  if (result?.isErr?.()) {
    const e = result.error
    throw new Error(`Radix ${what} failed: ${e?.message ?? e?.error ?? JSON.stringify(e ?? {})}`)
  }
  return result?.isOk?.() ? result.value : result
}

function assertAccountAddress(addr) {
  if (typeof addr === 'string' && addr.startsWith(ACCOUNT_PREFIX)) return addr
  throw new Error(
    `"${addr}" is not a ${ACTIVE_CHAIN.name} account address (expected prefix "${ACCOUNT_PREFIX}"). ` +
    `Switch the Radix Wallet to ${ACTIVE_CHAIN.testnet ? 'Stokenet' : 'Mainnet'} and reconnect.`
  )
}

// ── Wallet discovery ─────────────────────────────────────────────────────────

export function detectWallets() {
  // Nothing to enumerate: there is exactly one Radix Wallet and no injected
  // object to probe. The Connector extension exposes no reliable detection hook,
  // and on mobile there is no extension at all — the toolkit picks extension vs
  // deep link itself, so advertising the single wallet is the honest answer.
  if (typeof window === 'undefined') return []
  return [{ id: 'radix-wallet', name: 'Radix Wallet', icon: '⚛️' }]
}

// ── Wallet connection ────────────────────────────────────────────────────────

export async function connect() {
  const rdt = await getToolkit()
  const { DataRequestBuilder } = await loadSdk()

  // setRequestData defines the STANDING request for this dApp — it persists and
  // is re-applied on every later sendRequest(), so it must be set before, not
  // per-call. atLeast(1) rather than exactly(1): users routinely share several.
  rdt.walletApi.setRequestData(
    DataRequestBuilder.persona(),
    DataRequestBuilder.accounts().atLeast(1),
  )

  const data = unwrap(await rdt.walletApi.sendRequest(), 'wallet request')
    ?? rdt.walletApi.getWalletData()

  _accounts = data?.accounts ?? []
  _persona  = data?.persona ?? null
  _address  = _accounts[0]?.address ?? null
  if (!_address) throw new Error('Radix wallet shared no account — the request was cancelled.')
  assertAccountAddress(_address)

  watchWalletData().catch(() => {})
  return {
    address: _address,
    chainId: ACTIVE_CHAIN.id,
    chainName: ACTIVE_CHAIN.name,
    networkId: NETWORK_ID,
    persona: _persona?.label ?? null,
  }
}

export function disconnect() {
  // rdt.disconnect() ends the session with the Connector and clears the toolkit's
  // persisted wallet data; the phone app keeps no dApp-side state to revoke.
  try { _rdt?.disconnect?.() } catch { /* connector already gone */ }
  unsubscribeWalletData()
  _address  = null
  _accounts = []
  _persona  = null
}

export function getAddress() {
  return _address
}

export function getChainId() {
  return ACTIVE_CHAIN.id
}

export async function switchChain() {
  /* networkId is baked into the toolkit at construction — a Radix build targets
     one network, and mismatches surface as an address-prefix error instead. */
}

// ── Message signing — NOT POSSIBLE ON RADIX ──────────────────────────────────

export async function signMessage() {
  throw new Error(
    'Radix cannot sign arbitrary messages — there is no personal_sign equivalent. ' +
    'Authentication uses ROLA against a server-issued challenge: call signPurchase(), ' +
    'which runs that flow and returns a verifiable SignedChallenge proof.'
  )
}

// ── Purchase authentication (ROLA proof of wallet control, no contract needed) ─

/**
 * The challenge MUST come from the backend and be single-use. Generating it in
 * the browser would make the resulting proof replayable by anyone who saw it and
 * reduces ROLA to theatre, so a missing endpoint is a hard error — never a
 * locally-invented nonce.
 */
async function fetchChallenge() {
  const BASE = import.meta.env.VITE_API_BASE ?? ''
  const res = await fetch(`${BASE}/auth/radix/challenge`).catch(() => null)
  if (!res?.ok) {
    throw new Error(
      'Radix ROLA challenge unavailable — the backend must serve GET /auth/radix/challenge ' +
      'returning 32 random bytes as hex. A challenge cannot be generated client-side.'
    )
  }
  const body = await res.json().catch(() => null)
  const challenge = typeof body === 'string' ? body : (body?.challenge ?? body?.value ?? null)
  // Exactly 32 bytes: the wallet rejects anything else outright.
  if (!/^[0-9a-fA-F]{64}$/.test(challenge ?? '')) {
    throw new Error('Radix ROLA challenge malformed — expected 64 hex chars (32 bytes).')
  }
  return challenge.toLowerCase()
}

export async function signPurchase({ tileKey, price }) {
  const rdt = await getToolkit()
  const { DataRequestBuilder } = await loadSdk()
  const challenge = await fetchChallenge()

  // The generator is consulted by the toolkit at request time; returning the
  // challenge we already fetched keeps this one proof bound to one server nonce.
  rdt.walletApi.provideChallengeGenerator(async () => challenge)

  // withProof() on BOTH: the persona proof authenticates the identity, the
  // account proof binds the specific account paying for the tile. Requesting
  // proofs re-opens the wallet, so this is a real user interaction, not silent.
  rdt.walletApi.setRequestData(
    DataRequestBuilder.persona().withProof(),
    DataRequestBuilder.accounts().atLeast(1).withProof(),
  )

  const data = unwrap(await rdt.walletApi.sendRequest(), 'ROLA request')
    ?? rdt.walletApi.getWalletData()

  const proofs = data?.proofs ?? []
  if (!proofs.length) throw new Error('Radix wallet returned no ROLA proof — the request was declined.')
  // Prefer the proof for the connected account; fall back to the persona proof.
  const proof = proofs.find(p => p?.address === _address) ?? proofs[0]

  // `signature` is the whole SignedChallenge object, not a hex string — the
  // backend verifies it with @radixdlt/rola, which needs proof.type, .address,
  // .proof.publicKey, .proof.signature and .proof.curve together with the
  // challenge, the dApp definition address and the origin.
  return {
    signature: proof,
    proofs,
    challenge,
    address: _address,
    message: `CryptoLand purchase — tile ${tileKey} for $${price} — ${_address}`,
  }
}

// ── Native payment (a plain XRD transfer — no Scrypto component involved) ─────

// XRD's own resource address is protocol-defined, not deployed, and encodes the
// network like every other Radix address. These are exactly what
// RadixEngineToolkit.Utils.knownAddresses(<network>).resourceAddresses.xrd
// returns; hardcoded because that toolkit is not a dependency of this bundle and
// a Gateway round-trip would add a failure mode to the payment path itself.
const XRD_RESOURCE = ACTIVE_CHAIN.testnet
  ? 'resource_tdx_2_1tknxxxxxxxxxradxrdxxxxxxxxx009923554798xxxxxxxxxtfd2jc'
  : 'resource_rdx1tknxxxxxxxxxradxrdxxxxxxxxx009923554798xxxxxxxxxradxrd'

// A manifest Decimal is 18-decimal fixed point and XRD has 18 decimals, so one
// atto is exactly the last decimal place: the conversion is a string shift and
// must never be arithmetic. attos / 1e18 in floating point silently loses the
// low digits of any realistic tile price — and quotes routinely exceed
// Number.MAX_SAFE_INTEGER long before that.
const XRD_DECIMALS = 18

function attosToXrd(attos) {
  // padStart guarantees a whole-number digit, so 1 atto renders as
  // "0.000000000000000001" rather than ".000000000000000001".
  const digits = attos.toString().padStart(XRD_DECIMALS + 1, '0')
  const whole  = digits.slice(0, -XRD_DECIMALS)
  // Trailing zeros are meaningless to the engine but the wallet shows this
  // string to the user, and "3.7" reads as a price where "3.700000000000000000"
  // reads as a bug. Dropping them is a pure string op — the value is unchanged.
  const frac   = digits.slice(-XRD_DECIMALS).replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : whole
}

/**
 * Pay for a tile in XRD, from the user's own wallet.
 *
 * Deliberately NOT a call into the CryptoLandTile component: claim_tile charges
 * one flat `tile_price` for every tile on Earth, which cannot express a $12 ocean
 * tile and a $76 Tokyo tile. A resource transfer carries the exact quoted amount
 * and needs no package published at all — so this works on a build with
 * VITE_CONTRACT_RADIX unset.
 *
 * `amount` is a decimal STRING of attos (1e-18 XRD) straight from the server's
 * quote, and stays a BigInt end to end for the reason above.
 */
export async function payNative({ to, amount, from }) {
  if (!to)     throw new Error('No treasury address for this chain')
  if (!amount) throw new Error('No amount to pay')

  const attos = BigInt(amount)          // throws on a malformed quote
  if (attos <= 0n) throw new Error('Refusing to send a non-positive amount')

  // A Radix address encodes its network in the bech32 prefix, so this one check
  // catches both "that is not an account" and "that treasury belongs to the
  // other network" — the second being how funds get sent into a void.
  if (typeof to !== 'string' || !to.startsWith(ACCOUNT_PREFIX)) {
    throw new Error(
      `Treasury "${to}" is not a ${ACTIVE_CHAIN.name} account address (expected prefix "${ACCOUNT_PREFIX}").`
    )
  }

  const payer = from ?? _address
  if (!payer) throw new Error('Connect a Radix wallet before paying.')
  assertAccountAddress(payer)

  const rdt   = await getToolkit()
  const value = attosToXrd(attos)

  // The whole transfer, with no on-ledger code of ours: withdraw the resource
  // from the payer's account, take the bucket the withdrawal put on the worktop,
  // deposit it into the treasury account.
  //   • try_deposit_or_abort, not deposit: an account can be configured to
  //     reject resources it does not already hold, and only the try_ variants
  //     surface that as a clean abort instead of an opaque auth failure. Its
  //     second argument is the optional badge that would authorise a bypass —
  //     Enum<0u8>() is None.
  //   • no lock_fee instruction: the Radix Wallet picks the fee-paying account
  //     itself during review. Hardcoding one here would force the user to pay
  //     fees from an account they may not have chosen.
  const transactionManifest = `
CALL_METHOD
    Address("${payer}")
    "withdraw"
    Address("${XRD_RESOURCE}")
    Decimal("${value}")
;
TAKE_FROM_WORKTOP
    Address("${XRD_RESOURCE}")
    Decimal("${value}")
    Bucket("payment")
;
CALL_METHOD
    Address("${to}")
    "try_deposit_or_abort"
    Bucket("payment")
    Enum<0u8>()
;
`

  // Same asymmetry as mintTile(): onTransactionId fires at submission, while
  // sendTransaction resolves only after COMMIT — and resolves for a committed
  // failure too, as an err Result. unwrap() is what turns that into a throw.
  let intentHash = null
  const result = await rdt.walletApi.sendTransaction({
    transactionManifest,
    version: 1,
    message: 'CryptoLand tile payment',   // on-ledger and public — keep it short
    onTransactionId: id => { intentHash = id },
  })
  const out = unwrap(result, 'payment')

  const txHash = out?.transactionIntentHash ?? intentHash
  if (!txHash) throw new Error('Radix wallet returned no transaction intent hash for the payment.')
  return { txHash, from: payer }
}

/** Whether this build can take a wallet payment at all. */
export function supportsNativePay() {
  // Mirrors detectWallets(): there is nothing to feature-detect — no injected
  // object, and the Connector extension exposes no detection hook. What is worth
  // checking is whether the toolkit can be constructed at all, because without a
  // dApp Definition address getToolkit() throws and no request ever reaches a
  // wallet, so offering the button would only produce an error.
  if (ACTIVE_CHAIN.gasless || ACTIVE_CHAIN.halted) return false
  if (typeof window === 'undefined') return false
  return Boolean(import.meta.env.VITE_RADIX_DAPP_DEFINITION)
}

// ── NFT mint (stubbed until a resource address is configured) ─────────────────

export async function mintTile({ tx, ty, country, toAddress }) {
  if (!hasContract()) return mintStub('Radix NFT resource not configured')
  const rdt = await getToolkit()
  const owner = toAddress ?? _address
  if (!owner) throw new Error('Connect a Radix wallet to mint.')
  assertAccountAddress(owner)

  const tokenId = tileTokenId(tx, ty)
  // Radix needs NO Scrypto code for this: tiles are a native non-fungible
  // resource minted by a MINT_NON_FUNGIBLE manifest, so VITE_CONTRACT_RADIX holds
  // a resource_ address, not a package_ or component_ one. The manifest is built
  // server-side because it must present the minter badge, which lives in the
  // operator's vault and never in the buyer's wallet.
  const BASE = import.meta.env.VITE_API_BASE ?? ''
  const res  = await fetch(`${BASE}/radix/build-mint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tx, ty, country, owner,
      resourceAddress: ACTIVE_CHAIN.contractAddress,
      nonFungibleLocalId: `#${tokenId}#`,
      networkId: NETWORK_ID,
    }),
  })
  if (!res.ok) throw new Error('Failed to build Radix mint manifest')
  const { transactionManifest, blobs = [] } = await res.json()
  if (!transactionManifest) throw new Error('Backend returned no Radix transaction manifest')

  // onTransactionId fires as soon as the wallet submits; sendTransaction itself
  // RESOLVES ONLY AFTER COMMIT (which can be many seconds) and resolves for a
  // committed FAILURE too — as an err Result. Never treat resolution as success.
  let intentHash = null
  const result = await rdt.walletApi.sendTransaction({
    transactionManifest,
    version: 1,
    blobs,
    message: `CryptoLand tile ${tx}:${ty}`,   // on-ledger, public, keep it short
    onTransactionId: id => { intentHash = id },
  })
  const out = unwrap(result, 'transaction')

  return {
    txHash: out?.transactionIntentHash ?? intentHash ?? null,
    tokenId: String(tokenId),
    minted: true,
  }
}

// ── Marketplace (activates with the resource + a Scrypto swap component) ─────

export async function listForSale() { throw new Error('Radix marketplace: available after deploy') }
export async function unlistTile()  { throw new Error('Radix marketplace: available after deploy') }
export async function buyTile()     { throw new Error('Radix marketplace: available after deploy') }

// ── Reads (delegate to backend / Gateway) ────────────────────────────────────

export async function ownerOf()          { return null }
export async function getTileData()      { return null }
export async function getOwnedTokenIds() { return [] }
export async function totalSupply()      { return 0 }

export async function waitForTx(intentHash, maxWait = 120_000) {
  if (!intentHash) throw new Error('Radix waitForTx: no transaction intent hash')
  // ACTIVE_CHAIN.rpcUrl is the Babylon Gateway — a REST API, not JSON-RPC, in
  // spite of the field name. (@radixdlt/babylon-gateway-api-sdk wraps this same
  // endpoint; plain fetch avoids a second optional dependency.)
  const url = `${ACTIVE_CHAIN.rpcUrl}/transaction/status`
  const start = Date.now()
  while (Date.now() - start < maxWait) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent_hash: intentHash }),
    }).then(r => r.json()).catch(() => null)
    const status = r?.status ?? r?.intent_status
    if (status === 'CommittedSuccess') return r
    // A rejected intent can still be retried until its epoch window closes;
    // only Committed* and PermanentlyRejected are terminal.
    if (status === 'CommittedFailure' || status === 'PermanentlyRejected') {
      throw new Error(`Radix tx ${intentHash} ${status}: ${r?.error_message ?? 'no reason given'}`)
    }
    await new Promise(res => setTimeout(res, 2000))
  }
  throw new Error(`Radix tx ${intentHash} not committed within ${maxWait / 1000}s`)
}

// ── Listeners ────────────────────────────────────────────────────────────────
// walletData$ is the only change feed — there are no per-event callbacks.

let _sub = null
const _accountCbs    = []
const _disconnectCbs = []

async function watchWalletData() {
  if (_sub || typeof window === 'undefined') return
  const rdt = await getToolkit()
  let first = true
  _sub = rdt.walletApi.walletData$.subscribe(data => {
    const next = data?.accounts?.[0]?.address ?? null
    // walletData$ replays its CURRENT value the instant you subscribe. Without
    // this guard every listener fires once on registration with no real change.
    if (first) { first = false; if (next) _address = next; return }
    if (next === _address) return
    const prev = _address
    _address  = next
    _accounts = data?.accounts ?? []
    _persona  = data?.persona ?? null
    if (next) _accountCbs.forEach(cb => cb(next))
    else if (prev) _disconnectCbs.forEach(cb => cb())
  })
}

function unsubscribeWalletData() {
  try { _sub?.unsubscribe?.() } catch { /* already torn down */ }
  _sub = null
}

export function onAccountsChanged(cb) {
  if (typeof cb !== 'function') return
  _accountCbs.push(cb)
  watchWalletData().catch(() => {})
}

export function onChainChanged() { /* a Radix build targets one network */ }

export function onDisconnect(cb) {
  if (typeof cb !== 'function') return
  _disconnectCbs.push(cb)
  watchWalletData().catch(() => {})
}

export function removeListeners() {
  _accountCbs.length = 0
  _disconnectCbs.length = 0
  unsubscribeWalletData()
}

export const ADAPTER_TYPE = 'radix'
