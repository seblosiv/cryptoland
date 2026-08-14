/**
 * MultiversX Adapter — CryptoLand
 * ================================
 * Covers MultiversX mainnet ("1") + devnet ("D") via the MultiversX DeFi Wallet
 * browser extension. Connect + address + purchase signing work today with no
 * contract deployed; NFT minting uses NATIVE ESDT (no WASM contract required) and
 * activates as soon as VITE_CONTRACT_MULTIVERSX holds a collection identifier.
 *
 * Implements the universal BlockchainAdapter interface (same surface as evm.js).
 *
 * Every MultiversX SDK is an OPTIONAL peer dep and is lazy-loaded inside the
 * functions that need it, so this module parses and the app builds with none of
 * them installed.
 */

import { ACTIVE_CHAIN } from '../config.js'
import { tileTokenId, tokenIdToTile, hasContract, mintStub } from './_shared.js'

export { tileTokenId, tokenIdToTile }

// ── Protocol constants ───────────────────────────────────────────────────────

const MIN_GAS_PRICE       = 1_000_000_000n   // rejected below this
const GAS_PER_DATA_BYTE   = 1_500n           // every data byte is billed
const GAS_MOVE_BALANCE    = 50_000n          // base cost of any transaction
const GAS_ESDT_NFT_CREATE = 3_000_000n       // execution cost of ESDTNFTCreate

let _provider = null   // cached ExtensionProvider singleton
let _address  = null
let _nativeAuthToken = null   // verifiable access token from the login handshake

// ── SDK loaders (lazy — the packages are optional peer deps) ─────────────────

async function loadExtensionProvider() {
  try {
    const m = await import('@multiversx/sdk-extension-provider')
    return m.ExtensionProvider ?? m.default?.ExtensionProvider
  } catch {
    throw new Error(
      'MultiversX SDK missing — run: npm i @multiversx/sdk-extension-provider @multiversx/sdk-core'
    )
  }
}

async function loadCore() {
  try {
    return await import('@multiversx/sdk-core')
  } catch {
    throw new Error('MultiversX SDK missing — run: npm i @multiversx/sdk-core')
  }
}

async function loadNativeAuthClient() {
  try {
    const m = await import('@multiversx/sdk-native-auth-client')
    return m.NativeAuthClient ?? m.default?.NativeAuthClient
  } catch {
    throw new Error(
      'MultiversX native-auth missing — run: npm i @multiversx/sdk-native-auth-client'
    )
  }
}

// ── Origin guard ─────────────────────────────────────────────────────────────

/**
 * The extension (and Ledger) refuse to complete a login over an insecure origin —
 * including plain http://localhost, which most other wallets tolerate. Failing
 * loudly here beats an extension popup that opens and never resolves.
 */
function assertSecureOrigin() {
  if (typeof window === 'undefined') return
  const { protocol, hostname, origin } = window.location
  if (protocol === 'https:') return
  const local = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  throw new Error(
    local
      ? 'MultiversX wallet login requires HTTPS — plain http://localhost is not enough. Serve the dev build over TLS (e.g. vite --https) or use an https tunnel.'
      : `MultiversX wallet login requires HTTPS (this build is served from ${origin}).`
  )
}

// ── Encoding helpers ─────────────────────────────────────────────────────────
// Data-field arguments must be EVEN-length hex (nibble aligned) or the VM
// rejects the whole call, so every helper pads to whole bytes.

const utf8 = s => new TextEncoder().encode(String(s))

function bytesToHex(bytes) {
  return Array.from(bytes ?? [], b => b.toString(16).padStart(2, '0')).join('')
}

function strToHex(s) {
  return bytesToHex(utf8(s))
}

function numToHex(n) {
  const h = BigInt(n).toString(16)
  return h.length % 2 ? `0${h}` : h
}

function bytesToBase64(bytes) {
  // No Node Buffer in a Vite browser bundle — build base64 from char codes.
  return btoa(String.fromCharCode(...Uint8Array.from(bytes ?? [])))
}

// ── REST endpoints ───────────────────────────────────────────────────────────
// config.js ships api.multiversx.com as rpcUrl and gateway.multiversx.com as the
// fallback — they are DIFFERENT REST APIs (different paths, and the gateway wraps
// every response in `data`). Pick the shape from the host actually configured.

const usingGateway = () => /gateway/i.test(ACTIVE_CHAIN.rpcUrl ?? '')

async function fetchNonce(address) {
  const base = ACTIVE_CHAIN.rpcUrl
  const url = usingGateway()
    ? `${base}/address/${address}/nonce`
    : `${base}/accounts/${address}`
  const body = await fetch(url).then(r => r.json()).catch(() => null)
  const nonce = body?.data?.nonce ?? body?.nonce
  if (nonce === undefined || nonce === null) {
    throw new Error(`Could not read MultiversX account nonce for ${address}`)
  }
  return BigInt(nonce)
}

async function broadcast(plainTx) {
  const base = ACTIVE_CHAIN.rpcUrl
  const url = usingGateway() ? `${base}/transaction/send` : `${base}/transactions`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(plainTx),
  })
  const body = await res.json().catch(() => null)
  const hash = body?.txHash ?? body?.data?.txHash
  if (!res.ok || !hash) {
    throw new Error(`MultiversX broadcast failed: ${body?.error ?? body?.message ?? res.status}`)
  }
  return hash
}

/**
 * Serialise a signed Transaction into the network payload by hand. The SDK's own
 * converter moved house across majors (toPlainObject → TransactionsConverter →
 * back), so reading the fields is the only version-proof route. `data` goes over
 * the wire base64-encoded, signatures hex-encoded.
 */
function toNetworkTx(tx) {
  const bech32 = a => a?.toBech32?.() ?? a?.bech32?.() ?? String(a)
  return {
    nonce:     Number(tx.nonce),
    value:     tx.value.toString(),
    receiver:  bech32(tx.receiver),
    sender:    bech32(tx.sender),
    gasPrice:  Number(tx.gasPrice),
    gasLimit:  Number(tx.gasLimit),
    data:      bytesToBase64(tx.data),
    chainID:   tx.chainID,
    version:   tx.version ?? 2,
    signature: bytesToHex(tx.signature),
  }
}

// ── Provider ─────────────────────────────────────────────────────────────────

function extensionGlobal() {
  if (typeof window === 'undefined') return null
  // window.elrondWallet is the deprecated alias kept for old builds — always
  // prefer window.multiversxWallet.
  return window.multiversxWallet ?? window.elrondWallet ?? null
}

async function getProvider() {
  if (_provider) return _provider
  if (typeof window === 'undefined') throw new Error('MultiversX wallet is browser-only.')
  if (!extensionGlobal()) {
    throw new Error('No MultiversX wallet detected. Install the MultiversX DeFi Wallet extension.')
  }
  const ExtensionProvider = await loadExtensionProvider()
  const provider = ExtensionProvider.getInstance()
  // init() RESOLVES FALSE when the extension is absent rather than throwing.
  const ready = await provider.init()
  if (!ready) throw new Error('MultiversX DeFi Wallet extension did not initialise.')
  _provider = provider
  return _provider
}

export function detectWallets() {
  const wallets = []
  if (typeof window !== 'undefined' && extensionGlobal()) {
    wallets.push({ id: 'multiversx-defi', name: 'MultiversX DeFi Wallet', icon: '✖️' })
  }
  return wallets
}

// ── Wallet connection ───────────────────────────────────────────────────────

export async function connect() {
  assertSecureOrigin()
  const provider = await getProvider()

  // Prefer nativeAuth over a bare login: provider.login({ token }) returns a
  // signature over a server-anchored token, which the backend can verify and
  // expire. A raw signMessage proves key control but nothing about freshness.
  let NativeAuthClient = null
  let nativeAuthError = null
  try {
    NativeAuthClient = await loadNativeAuthClient()
  } catch (err) {
    nativeAuthError = err.message
  }

  if (NativeAuthClient) {
    const client = new NativeAuthClient({
      origin: window.location.origin,
      // The token is anchored to a recent block, so this must be the API host,
      // not the gateway.
      apiUrl: ACTIVE_CHAIN.rpcUrl,
      expirySeconds: 60 * 60 * 24,
    })
    const token = await client.initialize()
    const { address, signature } = await provider.login({ token })
    _address = address ?? provider.account?.address ?? null
    _nativeAuthToken = _address ? client.getToken(_address, token, signature) : null
  } else {
    const res = await provider.login()
    _address = res?.address ?? provider.account?.address ?? null
    _nativeAuthToken = null
  }

  if (!_address) throw new Error('MultiversX wallet connection rejected')
  return {
    address:   _address,
    chainId:   ACTIVE_CHAIN.id,     // '1' | 'D' | 'T'
    chainName: ACTIVE_CHAIN.name,
    nativeAuthToken: _nativeAuthToken,
    nativeAuthError,
  }
}

export function disconnect() {
  _provider?.logout?.().catch(() => {})
  _provider = null
  _address = null
  _nativeAuthToken = null
}

export function getAddress() {
  // provider.getAddress() is async in the v5 provider, so the interface reads
  // from the address cached at login instead.
  return _address
}

export function getChainId() {
  // An erd1… bech32 address is byte-identical on mainnet, devnet and testnet —
  // the network can never be inferred from it, so it is always carried here.
  return ACTIVE_CHAIN.id
}

export async function switchChain() { /* a MultiversX build targets one network */ }

// ── Message signing ─────────────────────────────────────────────────────────

async function signText(text) {
  const provider = await getProvider()
  const { Message, Address } = await loadCore()
  // v5 takes a Message from sdk-core (older versions took { message: Buffer }).
  // The wallet prefixes "\x17Elrond Signed Message:\n<len>" and keccaks it before
  // signing, so the backend must rebuild that same envelope to verify.
  const signed = await provider.signMessage(new Message({
    data: utf8(text),
    address: _address ? new Address(_address) : undefined,
  }))
  const sig = signed?.signature ?? signed
  return sig instanceof Uint8Array || Array.isArray(sig) ? bytesToHex(sig) : String(sig)
}

export async function signMessage(message) {
  if (!_address) throw new Error('Connect a MultiversX wallet first.')
  return { signature: await signText(message), address: _address }
}

// ── Purchase signature (proof of wallet control, no contract needed) ─────────

export async function signPurchase({ tileKey, price }) {
  if (!_address) throw new Error('Connect a MultiversX wallet first.')
  const text = `CryptoLand purchase — tile ${tileKey} for $${price} — ${_address}`
  return { signature: await signText(text), message: text }
}

// ── Native EGLD payment (wallet → treasury) ─────────────────────────────────

/**
 * Pay for a tile in EGLD, from the user's own wallet.
 *
 * A move-balance transaction to the treasury — no ESDT call, no data field,
 * nothing that needs the collection to be issued first. It carries the exact
 * per-tile price, and the backend re-reads the transaction from the chain
 * afterwards, so a tampered `to` or `amount` here fails verification and settles
 * nothing.
 *
 * `amount` is a decimal STRING of base units. EGLD has 18 decimals, so a single
 * whole EGLD is 10^18 — three orders of magnitude past Number.MAX_SAFE_INTEGER.
 * Parsing it as a Number would round the price silently and irreversibly, so it
 * goes BigInt → the SDK → `value.toString()` on the wire, never through a float.
 */
export async function payNative({ to, amount, from }) {
  if (!to)     throw new Error('No treasury address for this chain')
  if (!amount) throw new Error('No amount to pay')

  const value = BigInt(amount)            // throws on a malformed quote
  if (value <= 0n) throw new Error('Refusing to send a non-positive amount')

  const provider = await getProvider()
  const payer = from ?? _address
  if (!payer) throw new Error('Connect a MultiversX wallet first.')

  const { Transaction, Address } = await loadCore()
  // Address() validates the bech32 checksum and the erd HRP, so a mistyped
  // treasury throws here rather than after the user has approved the popup.
  const receiver = new Address(to)

  const transaction = new Transaction({
    // The nonce comes from the network, not a local counter: the extension may
    // have sent something else since connect(), and a stale nonce is rejected.
    nonce:    await fetchNonce(payer),
    value,
    sender:   new Address(payer),
    receiver,
    gasPrice: MIN_GAS_PRICE,
    // No data field means no GAS_PER_DATA_BYTE term and no execution cost — a
    // move-balance is exactly the base, which is why mintTile's formula does not
    // appear here.
    gasLimit: GAS_MOVE_BALANCE,
    data:     new Uint8Array(),
    chainID:  ACTIVE_CHAIN.id,
    version:  2,
  })

  const signed = await provider.signTransaction(transaction)
  return { txHash: await broadcast(toNetworkTx(signed)), from: payer }
}

/** Whether this build can take a wallet payment at all. */
export function supportsNativePay() {
  // Same signal detectWallets() uses — the DeFi Wallet extension is the only
  // provider this adapter speaks to, and it announces itself on window.
  return !ACTIVE_CHAIN.gasless && !ACTIVE_CHAIN.halted && Boolean(extensionGlobal())
}

// ── NFT mint (native ESDT — no WASM contract) ────────────────────────────────
/**
 * MultiversX mints NFTs through built-in ESDT calls, so no Move/Solidity/WASM
 * contract is ever deployed. Three steps, only the last of which is per-tile:
 *
 *   ONE-TIME, run by the collection owner (see documentation/multichain.md):
 *   1) issueNonFungible@<hexName>@<hexTicker>
 *        → erd1qqqqqqqqqqqqqqqpqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqzllls8a5w6u
 *        value 50000000000000000 (0.05 EGLD), gasLimit 60000000.
 *        Name 3-20 alphanumeric, ticker 3-10 uppercase A-Z0-9.
 *        TRAP: the system SC APPENDS a random 6-char suffix, so the real
 *        identifier (e.g. CLAND-6258d2) CANNOT be predicted — read it from the
 *        transaction's results and put THAT in VITE_CONTRACT_MULTIVERSX.
 *   2) setSpecialRole@<hexCollection>@<hexAddressPUBKEY>@<hex "ESDTRoleNFTCreate">
 *        → same system SC, gasLimit 60000000.
 *        TRAP: the address argument is the 32-byte public key, NOT the bech32
 *        string — Address#toHex() / getPublicKey(), never strToHex(erd1…).
 *
 *   PER TILE (implemented below):
 *   3) ESDTNFTCreate@collection@quantity@name@royalties@hash@attributes@uri
 *        TRAP: this one is sent to the signer's OWN address, not the system SC,
 *        and it always creates into the creator's account — there is no "mint to"
 *        parameter. Delivering to a third party needs a follow-up ESDTNFTTransfer.
 *
 * hasContract() therefore means "a collection identifier is configured".
 */
export async function mintTile({ tx, ty, country, toAddress }) {
  if (!hasContract()) return mintStub('MultiversX ESDT collection not issued')
  const provider = await getProvider()
  const signer = _address
  if (!signer) throw new Error('Connect a MultiversX wallet to mint.')
  if (toAddress && toAddress !== signer) {
    throw new Error(
      'ESDTNFTCreate always mints to the creator. Mint from the recipient wallet, or send a follow-up ESDTNFTTransfer to deliver the tile.'
    )
  }

  const collection = ACTIVE_CHAIN.contractAddress   // e.g. 'CLAND-6258d2'
  const tokenId    = tileTokenId(tx, ty)
  const attributes = `metadata:tile ${tx},${ty};country:${country ?? ''};id:${tokenId}`

  const data = [
    'ESDTNFTCreate',
    strToHex(collection),
    numToHex(1),                              // quantity — always 1 for an NFT
    strToHex(`CryptoLand Tile ${tx},${ty}`),  // name
    numToHex(500),                            // royalties, basis points of 10000
    strToHex(''),                             // hash (optional, may be empty)
    strToHex(attributes),
    strToHex(`${ACTIVE_CHAIN.explorerUrl}/nfts/${collection}`), // URI
  ].join('@')

  const payload  = utf8(data)
  const gasLimit = GAS_MOVE_BALANCE
    + GAS_PER_DATA_BYTE * BigInt(payload.length)
    + GAS_ESDT_NFT_CREATE

  const { Transaction, Address } = await loadCore()
  const transaction = new Transaction({
    nonce:    await fetchNonce(signer),
    value:    0n,
    sender:   new Address(signer),
    receiver: new Address(signer),   // self-transaction, see the block above
    gasPrice: MIN_GAS_PRICE,
    gasLimit,
    data:     payload,
    chainID:  ACTIVE_CHAIN.id,
    version:  2,
  })

  const signed = await provider.signTransaction(transaction)
  const txHash = await broadcast(toNetworkTx(signed))

  // The on-chain ESDT identifier is <collection>-<nftNonceHex> and the nonce is
  // assigned by the protocol at execution time — resolve it from the tx results
  // (ESDTNFTCreate log topic) after waitForTx if you need to link the explorer.
  return { txHash, tokenId: String(tokenId), minted: true, collection, esdtIdentifier: null }
}

// ── Marketplace (activates with the issued collection) ───────────────────────

export async function listForSale() { throw new Error('MultiversX marketplace: available after deploy') }
export async function unlistTile()  { throw new Error('MultiversX marketplace: available after deploy') }
export async function buyTile()     { throw new Error('MultiversX marketplace: available after deploy') }

// ── Reads (delegate to backend / API) ────────────────────────────────────────

export async function ownerOf()          { return null }
export async function getTileData()      { return null }
export async function getOwnedTokenIds() { return [] }
export async function totalSupply()      { return 0 }

export async function waitForTx(hash, maxWait = 60_000) {
  const start = Date.now()
  const base = ACTIVE_CHAIN.rpcUrl
  const url = usingGateway()
    ? `${base}/transaction/${hash}?withResults=true`
    : `${base}/transactions/${hash}`
  while (Date.now() - start < maxWait) {
    const body = await fetch(url).then(r => r.json()).catch(() => null)
    const t = body?.data?.transaction ?? body
    // A tx can report status 'success' while the built-in call it carried failed;
    // a `signalError` event in the results is the authoritative failure signal.
    const failed = (t?.logs?.events ?? [])
      .some(e => e?.identifier === 'signalError' || e?.identifier === 'internalVMErrors')
    if (t?.status === 'success' && !failed) return t
    if (t?.status === 'success' && failed) throw new Error(`MultiversX tx ${hash} reverted (signalError)`)
    if (t?.status === 'fail' || t?.status === 'invalid') {
      throw new Error(`MultiversX tx ${hash} ${t.status}`)
    }
    await new Promise(res => setTimeout(res, 2000))
  }
  throw new Error(`MultiversX tx ${hash} not confirmed within ${maxWait / 1000}s`)
}

// ── Listeners ────────────────────────────────────────────────────────────────
// The extension talks over window.postMessage request/response only — it emits
// no account, chain or disconnect events. Re-read getAddress() on window focus
// rather than waiting for a callback that never fires.

export function onAccountsChanged() { /* not emitted by the extension */ }
export function onChainChanged()    { /* a MultiversX build targets one network */ }
export function onDisconnect()      { /* not emitted by the extension */ }
export function removeListeners()   { /* nothing subscribed */ }

export const ADAPTER_TYPE = 'multiversx'
