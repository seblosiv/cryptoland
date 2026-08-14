/**
 * Tezos Adapter — CryptoLand
 * ===========================
 * Covers Tezos mainnet + Shadownet via TZIP-10 / Beacon (@airgap/beacon-sdk),
 * which every Tezos wallet speaks — Temple, Kukai, Umami, Naan, AirGap.
 * Connect + address + purchase signing work today with no contract deployed;
 * NFT minting (an FA2 / TZIP-12 contract call) is stubbed until VITE_CONTRACT_TEZOS
 * holds an originated KT1… address.
 *
 * Implements the universal BlockchainAdapter interface (same surface as evm.js).
 *
 * Five things make Tezos unlike the other families here:
 *   1. GHOSTNET IS GONE. Every ghostnet host (ghostnet.tzkt.io, rpc.tzkt.io/ghostnet,
 *      ghostnet.ecadinfra.com, ghostnet.teztnets.com) is dead in DNS or 404s, and it
 *      no longer appears in teztnets.json. Beacon's NetworkType enum still carries a
 *      GHOSTNET member — it is a trap. SHADOWNET is the current app-testing network.
 *   2. There is NO window.* injection for Beacon. It reaches extensions over
 *      postMessage and mobile wallets over a P2P matrix relay, so wallets cannot be
 *      feature-detected synchronously — Beacon's own pairing modal is the picker.
 *   3. A signable payload must be PACKED Micheline (a "05…" hex string). Wallets
 *      show a raw hex blob (or refuse) for anything else. See packMichelineString().
 *   4. Tezos has no ecrecover: a signature alone does not yield the signer's key,
 *      and an unrevealed account has no public key on-chain either. We therefore
 *      return the wallet's publicKey alongside every signature — the backend needs
 *      it for @taquito/utils verifySignature(payload, publicKey, signature).
 *   5. Minting REQUIRES an originated contract. Unlike Algorand ASAs or Stellar
 *      assets there is no native-asset shortcut: an NFT is an FA2 token with
 *      supply 1 plus TZIP-16/21 metadata in the token_metadata big_map.
 *
 * Native XTZ has 6 decimals (1 XTZ = 1,000,000 mutez); Beacon amounts are mutez
 * strings, never tez.
 *
 * The SDK is an optional peer dep and is lazy-loaded; the app builds and runs with
 * @airgap/beacon-sdk absent. (Note for whoever installs it: the Beacon bundle
 * expects Node globals — a Buffer/global polyfill may be needed in the Vite build.)
 */

import { ACTIVE_CHAIN } from '../config.js'
import { tileTokenId, tokenIdToTile, hasContract, mintStub } from './_shared.js'

export { tileTokenId, tokenIdToTile }

// ACTIVE_CHAIN.id is the Tezos chain_id (NetXdQprcVkpaWU / NetXsqzbfFenSTS), which
// is NOT what Beacon wants — it takes a NetworkType string. Derive it from the
// build's testnet flag rather than mapping chain ids, and use the literal rather
// than NetworkType.SHADOWNET: SDK builds older than 4.x lack that enum member and
// would silently hand the wallet `undefined`. The enum values ARE these strings.
const NETWORK_TYPE = ACTIVE_CHAIN.testnet ? 'shadownet' : 'mainnet'
const NETWORK      = { type: NETWORK_TYPE, rpcUrl: ACTIVE_CHAIN.rpcUrl }
const RPC          = ACTIVE_CHAIN.rpcUrl.replace(/\/+$/, '')

// Validation-pass index of manager operations (transactions, originations).
// 0 = consensus, 1 = voting, 2 = anonymous, 3 = manager.
const MANAGER_PASS = 3
// Hard cap on the block catch-up scan in waitForTx so a stalled tab can never fan
// out into hundreds of RPC fetches when it resumes.
const MAX_SCAN = 12

let _sdk       = null   // cached @airgap/beacon-sdk module namespace
let _client    = null   // the single DAppClient instance
let _address   = null
let _publicKey = null

const _cbs      = { accounts: [], chain: [], disconnect: [] }
let   _subscribed = false
let   _lastNetwork = NETWORK_TYPE

// ── SDK loading (optional peer dep) ──────────────────────────────────────────

async function beacon() {
  if (_sdk) return _sdk
  if (typeof window === 'undefined') {
    throw new Error('Tezos wallet access is browser-only (Beacon needs postMessage / a P2P relay).')
  }
  let mod
  try {
    mod = await import('@airgap/beacon-sdk')
  } catch {
    throw new Error(
      'Beacon SDK not available — install it with: npm i @airgap/beacon-sdk@^4.8.1 ' +
      '(Tezos wallets inject no window global, so the package is required).'
    )
  }
  _sdk = mod?.DAppClient ? mod : (mod?.default ?? mod)
  if (!_sdk?.DAppClient) throw new Error('Beacon SDK loaded but exposes no DAppClient — check the installed version.')
  return _sdk
}

/**
 * One DAppClient per page. A second instance fights the first over the same
 * localStorage/IndexedDB keys and can drop the active account mid-session; the
 * constructor also touches storage, so it must never run at module load or in SSR.
 */
async function client() {
  if (_client) return _client
  const { DAppClient } = await beacon()
  _client = new DAppClient({ name: 'CryptoLand', network: NETWORK, preferredNetwork: NETWORK_TYPE })
  return _client
}

// ── Address / hash validation ───────────────────────────────────────────────

/**
 * base58check, 36 chars. Implicit: tz1 (ed25519), tz2 (secp256k1), tz3 (P-256),
 * tz4 (BLS). Originated contracts are KT1…. Base58 has no 0, O, I or l.
 */
function assertAddress(addr) {
  if (typeof addr !== 'string' || !addr) throw new Error('Tezos wallet returned no address.')
  if (/^(edsk|spsk|p2sk|edesk|BLsk)/.test(addr)) {
    throw new Error('Refusing a Tezos SECRET key — CryptoLand only ever handles public addresses.')
  }
  if (!/^(tz[1-4]|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr)) {
    throw new Error(`Not a valid Tezos address: ${addr}`)
  }
  return addr
}

// ── Micheline payload packing ───────────────────────────────────────────────

/**
 * Build the standard TZIP-10 signed-payload envelope for a UTF-8 string:
 *
 *   05        packed-data prefix (what `PACK` emits; wallets only render "05…" safely)
 *   01        Micheline primitive tag for `string`
 *   xxxxxxxx  4-byte BIG-ENDIAN length of the payload — in BYTES, not characters
 *   …         hex of the UTF-8 bytes
 *
 * The byte-length distinction is the live trap: our purchase text contains an
 * em dash, which is 3 UTF-8 bytes, so a length taken from `text.length` produces a
 * payload the wallet renders as garbage and the backend cannot verify.
 * Verify server-side with @taquito/utils verifySignature(payload, publicKey, signature).
 */
function packMichelineString(text) {
  const bytes = new TextEncoder().encode(text)
  let hex = ''
  for (const b of bytes) hex += b.toString(16).padStart(2, '0')
  return `0501${bytes.length.toString(16).padStart(8, '0')}${hex}`
}

// ── Wallet discovery ─────────────────────────────────────────────────────────

export function detectWallets() {
  // Beacon wallets are NOT feature-detectable: extensions answer an async
  // postMessage handshake and mobile wallets pair over a relay, so nothing lands
  // on window. Beacon's pairing modal enumerates what is actually installed —
  // this list only seeds the UI. (Temple's legacy window.temple object belongs to
  // its own pre-TZIP-10 API and says nothing about Beacon support.)
  return [
    { id: 'temple', name: 'Temple',  icon: '🏛️' },
    { id: 'kukai',  name: 'Kukai',   icon: '🌐' },
    { id: 'umami',  name: 'Umami',   icon: '🍜' },
    { id: 'naan',   name: 'Naan',    icon: '🫓' },
    { id: 'airgap', name: 'AirGap',  icon: '✈️' },
  ]
}

// ── Wallet connection ───────────────────────────────────────────────────────

/**
 * Beacon PERSISTS the active account in localStorage, so after a reload the app is
 * still paired. Reuse that account instead of calling requestPermissions() again —
 * a second call re-opens the pairing modal for an already-connected user.
 * Note requestPermissions() must run inside a user gesture or the popup is blocked.
 */
export async function connect() {
  const c = await client()

  let account = await c.getActiveAccount().catch(() => null)
  if (!account?.address) {
    const perms = await c.requestPermissions({ network: NETWORK })
    account = (await c.getActiveAccount().catch(() => null)) ?? perms
  }

  const address = account?.address ?? account?.accountInfo?.address
  if (!address) throw new Error('Tezos wallet connection rejected')
  _address   = assertAddress(address)
  _publicKey = account?.publicKey ?? account?.accountInfo?.publicKey ?? null

  assertNetwork(account)
  _lastNetwork = account?.network?.type ?? NETWORK_TYPE
  return { address: _address, chainId: ACTIVE_CHAIN.id, chainName: ACTIVE_CHAIN.name }
}

/**
 * A wallet left on the wrong network signs happily and only fails at injection,
 * after the user has approved. 'custom' is tolerated: that is what wallets report
 * when the user points them at a self-hosted RPC for this same network.
 */
function assertNetwork(account) {
  const type = account?.network?.type
  if (!type || type === 'custom' || type === NETWORK_TYPE) return
  throw new Error(
    `Wallet is on Tezos "${type}" but this build targets ${ACTIVE_CHAIN.name} (${NETWORK_TYPE}). ` +
    'Switch networks in the wallet and reconnect.'
  )
}

export function disconnect() {
  // BOTH calls are required. disconnect() only tears down the transport (P2P /
  // postMessage); the account stays in localStorage and the app comes back
  // "connected" on the next reload. clearActiveAccount() is what actually forgets it.
  _client?.disconnect?.().catch(() => {})
  _client?.clearActiveAccount?.().catch(() => {})
  _address   = null
  _publicKey = null
}

export function getAddress() {
  return _address
}

export function getChainId() {
  return ACTIVE_CHAIN.id   // Tezos chain_id, e.g. NetXdQprcVkpaWU — not a number
}

export async function switchChain() { /* a Tezos build targets one network */ }

// ── Signing ─────────────────────────────────────────────────────────────────

async function signText(text) {
  const c = await client()
  const account = await c.getActiveAccount().catch(() => null)
  const source = account?.address ?? _address
  if (!source) throw new Error('Connect a Tezos wallet first.')
  _publicKey = account?.publicKey ?? _publicKey

  const { SigningType } = await beacon()
  const payload = packMichelineString(text)
  const res = await c.requestSignPayload({
    // MICHELINE is the only type wallets display as readable text. SigningType.RAW
    // is shown as an opaque blob and several wallets refuse it outright, and
    // OPERATION is reserved for forged operation bytes — never reuse it for login.
    signingType:   SigningType?.MICHELINE ?? 'micheline',
    payload,
    sourceAddress: source,
  })
  const signature = res?.signature
  if (!signature) throw new Error('Tezos wallet returned no signature.')

  // publicKey can legitimately be missing when the account has never been revealed
  // on-chain and the wallet withheld it at permission time — say so rather than
  // letting the backend fail an unexplained verifySignature().
  return {
    signature,
    address:   source,
    publicKey: _publicKey,
    payload,
    message:   text,
  }
}

export async function signMessage(message) {
  const { signature, address, publicKey, payload } = await signText(message)
  return { signature, address, publicKey, payload }
}

// ── Purchase signature (proof of wallet control, no contract needed) ─────────

export async function signPurchase({ tileKey, price }) {
  // requestSignPayload binds nothing about the network into the payload, so a
  // Shadownet signature would otherwise verify against a mainnet purchase. Write
  // the chain_id into the text ourselves.
  const text =
    `CryptoLand purchase — tile ${tileKey} for $${price} — ${_address ?? ''}\n` +
    `Chain: ${ACTIVE_CHAIN.id}`
  const { signature, publicKey, payload, address } = await signText(text)
  return { signature, message: text, payload, publicKey, address }
}

// ── Native payment (a plain XTZ transfer — no contract involved) ─────────────

/**
 * Pay for a tile in XTZ, from the user's own wallet.
 *
 * A bare transaction operation to the treasury, NOT a call into the FA2
 * contract: minting is gated on an originated KT1 that most builds do not have,
 * and the price is per-tile anyway, which no fixed on-chain price can express.
 * This path therefore works with VITE_CONTRACT_TEZOS unset.
 *
 * `amount` is a decimal STRING of MUTEZ (1 XTZ = 1,000,000 mutez) straight from
 * the server's quote. It stays a string/BigInt end to end — Beacon wants a
 * string here, and a Number would round large quotes rather than fail loudly.
 */
export async function payNative({ to, amount, from }) {
  if (!to)     throw new Error('No treasury address for this chain')
  if (!amount) throw new Error('No amount to pay')

  const mutez = BigInt(amount)          // throws on a malformed quote
  if (mutez <= 0n) throw new Error('Refusing to send a non-positive amount')

  // tz1-4 (implicit) and KT1 (originated) are both legitimate treasuries — a KT1
  // just runs its default entrypoint on receipt.
  assertAddress(to)

  const c = await client()
  const account = await c.getActiveAccount().catch(() => null)
  const payer = account?.address ?? from ?? _address
  if (!payer) throw new Error('Connect a Tezos wallet before paying.')

  // Beacon signs with the wallet's ACTIVE account and an operation request
  // carries no per-operation source override. If the user switched accounts
  // since connecting, the payment would leave an address the backend never
  // associated with this purchase — say so rather than paying from the wrong tz1.
  if (from && from !== payer) {
    throw new Error(
      `The Tezos wallet's active account is ${payer}, not ${from}. ` +
      'Switch back in the wallet (or reconnect) and retry the payment.'
    )
  }

  // A wallet left on the wrong network signs happily and only fails at injection,
  // after the user has approved — and on mainnet that is a real payment.
  assertNetwork(account)

  const out = await c.requestOperation({
    operationDetails: [{
      kind:        'transaction',
      destination: to,
      // MUTEZ, as a string — Beacon takes no numbers here. fee/gas_limit/
      // storage_limit are deliberately omitted: the wallet simulates the
      // operation and fills them, and hand-set limits are the usual cause of a
      // "gas exhausted" rejection.
      amount:      mutez.toString(),
    }],
  })

  const txHash = out?.transactionHash ?? out?.opHash ?? null
  if (!txHash) throw new Error('Tezos wallet returned no operation hash for the payment.')
  return { txHash, from: payer }
}

/** Whether this build can take a wallet payment at all. */
export function supportsNativePay() {
  // Beacon injects nothing into window — as detectWallets() notes, extensions
  // answer an async postMessage handshake and mobile wallets pair over a relay,
  // so there is no wallet to feature-detect synchronously. The one real gate is
  // the runtime: DAppClient needs postMessage / a P2P relay / localStorage, none
  // of which exist under SSR or in the test runner.
  if (ACTIVE_CHAIN.gasless || ACTIVE_CHAIN.halted) return false
  return typeof window !== 'undefined'
}

// ── NFT mint (stubbed until an FA2 contract is originated) ───────────────────

export async function mintTile({ tx, ty, country, toAddress }) {
  if (!hasContract()) return mintStub('Tezos FA2 contract not originated')

  const c = await client()
  const account = await c.getActiveAccount().catch(() => null)
  if (!account?.address) throw new Error('Connect a Tezos wallet to mint.')
  assertNetwork(account)

  const tokenId = tileTokenId(tx, ty)   // Michelson `nat` is unbounded — no packing needed

  // The backend emits the Micheline JSON for the contract's mint entrypoint. It
  // cannot be built generically: FA2 (TZIP-12) standardises transfer/balance_of/
  // update_operators but NOT mint, so the argument shape is contract-specific.
  const BASE = import.meta.env.VITE_API_BASE ?? ''
  const res  = await fetch(`${BASE}/tezos/build-mint`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      tx, ty, country,
      owner:    toAddress,
      source:   account.address,
      tokenId:  String(tokenId),
      contract: ACTIVE_CHAIN.contractAddress,
      network:  NETWORK_TYPE,
    }),
  })
  if (!res.ok) throw new Error('Failed to build Tezos mint operation')
  const { parameters } = await res.json()
  if (!parameters?.entrypoint) throw new Error('Backend returned no Micheline parameters for the FA2 mint.')

  const out = await c.requestOperation({
    operationDetails: [{
      kind:        'transaction',
      destination: ACTIVE_CHAIN.contractAddress,
      // MUTEZ, as a string. '0' because minting transfers no XTZ — the wallet
      // fills fee/gas_limit/storage_limit itself after simulating, and hand-set
      // limits are the usual cause of a "gas exhausted" rejection.
      amount:      '0',
      parameters,
    }],
  })

  const txHash = out?.transactionHash ?? out?.opHash ?? null
  if (!txHash) throw new Error('Tezos wallet returned no operation hash.')
  return { txHash, tokenId: String(tokenId), minted: true }
}

// ── Marketplace (activates with the originated contract) ─────────────────────

export async function listForSale() { throw new Error('Tezos marketplace: available after FA2 contract deploy') }
export async function unlistTile()   { throw new Error('Tezos marketplace: available after FA2 contract deploy') }
export async function buyTile()      { throw new Error('Tezos marketplace: available after FA2 contract deploy') }

// ── Reads (delegate to backend / indexer) ───────────────────────────────────

export async function ownerOf()          { return null }
export async function getTileData()      { return null }
export async function getOwnedTokenIds() { return [] }
export async function totalSupply()      { return 0 }

// ── Confirmation ────────────────────────────────────────────────────────────

async function rpcJson(path) {
  const r = await fetch(`${RPC}${path}`, { headers: { Accept: 'application/json' } }).catch(() => null)
  if (!r?.ok) return null
  return r.json().catch(() => null)
}

/**
 * An operation group is included atomically but each content carries its OWN
 * result, and a `mint` that calls another contract fails inside
 * internal_operation_results — a group can sit in a block having done nothing.
 * Anything other than 'applied' (failed / backtracked / skipped) is a failure.
 */
function opResult(group) {
  for (const content of group?.contents ?? []) {
    const result = content?.metadata?.operation_result
    if (result?.status && result.status !== 'applied') return { ok: false, status: result.status, errors: result.errors }
    for (const internal of content?.metadata?.internal_operation_results ?? []) {
      const r = internal?.result
      if (r?.status && r.status !== 'applied') return { ok: false, status: r.status, errors: r.errors }
    }
  }
  return { ok: true }
}

/**
 * Polls the node directly rather than an indexer: TzKT has no verified API host
 * for Shadownet (api.ghostnet.tzkt.io is gone with the network), while the RPC in
 * ACTIVE_CHAIN.rpcUrl is guaranteed to exist for whichever network this build targets.
 * Resolves on inclusion + 'applied'; Tenderbake finality is 2 further blocks (~16s)
 * and is left to the backend's confirmation policy.
 */
export async function waitForTx(opHash, maxWait = 90_000) {
  if (!opHash) throw new Error('waitForTx: no Tezos operation hash given.')
  const start = Date.now()
  let next = null

  while (Date.now() - start < maxWait) {
    const header = await rpcJson('/chains/main/blocks/head/header')
    const head = typeof header?.level === 'number' ? header.level : null

    if (head !== null) {
      // Start two blocks back — the op may already have landed between injection
      // and the first poll — then walk forward, never re-fetching a block.
      if (next === null) next = Math.max(head - 2, 1)
      if (head - next > MAX_SCAN) next = head - MAX_SCAN

      for (; next <= head; next++) {
        const groups = await rpcJson(`/chains/main/blocks/${next}/operations/${MANAGER_PASS}`)
        if (!Array.isArray(groups)) break   // RPC hiccup — retry this same level next poll
        const group = groups.find(g => g?.hash === opHash)
        if (!group) continue
        const { ok, status, errors } = opResult(group)
        if (!ok) throw new Error(`Tezos operation ${opHash} ${status}: ${errors?.[0]?.id ?? 'no details'}`)
        return group
      }
    }
    await new Promise(r => setTimeout(r, 3000))
  }
  throw new Error(`Tezos operation ${opHash} not confirmed within ${maxWait / 1000}s`)
}

// ── Listeners ───────────────────────────────────────────────────────────────

/**
 * Beacon exposes exactly one useful account signal, ACTIVE_ACCOUNT_SET, and fires
 * it with `undefined` when the account is cleared — that is also the only
 * disconnect notice we get. One subscription feeds all three listener kinds
 * because subscribeToEvent() returns no unsubscribe handle in v4: removeListeners()
 * can only drop our own callbacks, so the handler must stay tolerant of an empty list.
 */
async function subscribe() {
  if (_subscribed || typeof window === 'undefined') return
  const c = await client().catch(() => null)
  const { BeaconEvent } = (await beacon().catch(() => ({}))) ?? {}
  const event = BeaconEvent?.ACTIVE_ACCOUNT_SET ?? 'ACTIVE_ACCOUNT_SET'
  if (typeof c?.subscribeToEvent !== 'function') return   // older SDK: callbacks stay idle rather than crash
  _subscribed = true
  try {
    await c.subscribeToEvent(event, (account) => {
      const address = account?.address ?? null
      _address   = address
      _publicKey = account?.publicKey ?? null
      _cbs.accounts.forEach(cb => { try { cb(address) } catch { /* listener owns its errors */ } })
      if (!address) _cbs.disconnect.forEach(cb => { try { cb() } catch { /* ignore */ } })

      const network = account?.network?.type
      if (network && network !== _lastNetwork) {
        _lastNetwork = network
        _cbs.chain.forEach(cb => { try { cb(network) } catch { /* ignore */ } })
      }
    })
  } catch {
    _subscribed = false
  }
}

export async function onAccountsChanged(cb) {
  if (typeof cb !== 'function') return
  _cbs.accounts.push(cb)
  await subscribe()
}

// Not a no-op despite the single-network build: a user who flips the wallet to
// another network would sign operations this deployment can never inject.
export async function onChainChanged(cb) {
  if (typeof cb !== 'function') return
  _cbs.chain.push(cb)
  await subscribe()
}

export async function onDisconnect(cb) {
  if (typeof cb !== 'function') return
  _cbs.disconnect.push(cb)
  await subscribe()
}

export function removeListeners() {
  _cbs.accounts.length   = 0
  _cbs.chain.length      = 0
  _cbs.disconnect.length = 0
}

export const ADAPTER_TYPE = 'tezos'
