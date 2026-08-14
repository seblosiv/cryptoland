/**
 * Algorand Adapter — CryptoLand
 * ==============================
 * Covers Algorand MainNet + TestNet via ARC-0001 injected wallets (Lute, Kibisis,
 * Exodus) and Pera Connect (mobile QR / deeplink, no extension required).
 * Connect + address + purchase signature work today with no contract deployed;
 * the NFT mint (an ASA created by an acfg txn) is stubbed until
 * VITE_CONTRACT_ALGORAND is set.
 *
 * Implements the universal BlockchainAdapter interface (same surface as evm.js).
 *
 * Every SDK here (algosdk, @perawallet/connect) is an OPTIONAL peer dep and is
 * lazy-loaded inside the functions that need it, so a build without them still
 * compiles, boots, and connects through an injected wallet.
 *
 * READ THIS BEFORE TOUCHING signMessage(): Algorand has no universally supported
 * arbitrary-message signing. See the comment block above trySignData().
 */

import { ACTIVE_CHAIN } from '../config.js'
import { tileTokenId, tokenIdToTile, hasContract, mintStub } from './_shared.js'

export { tileTokenId, tokenIdToTile }

// Pera runs its OWN numeric chain ids that have nothing to do with genesisId.
// 4160 means "any network" and lets a MainNet wallet sign a TestNet request —
// we never want that, so an unknown ACTIVE_CHAIN.id is a hard failure instead.
const PERA_CHAIN_IDS = { 'mainnet-v1.0': 416001, 'testnet-v1.0': 416002 }

const GENESIS_HASH = {
  'mainnet-v1.0': 'wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=',
  'testnet-v1.0': 'SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=',
}

// 58 chars of unpadded base32 = 32-byte ed25519 pubkey + 4-byte checksum.
const ADDR_RE = /^[A-Z2-7]{58}$/

let _pera    = null   // cached PeraWalletConnect instance
let _address = null
let _mode    = null   // 'injected' (ARC-0001) | 'pera'

// ── Encoding helpers ─────────────────────────────────────────────────────────

function b64FromBytes(bytes) {
  let s = ''
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b)
  return btoa(s)
}

function bytesFromB64(b64) {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0))
}

// ── SDK loaders (lazy — the packages are optional peer deps) ─────────────────

async function loadAlgosdk() {
  try {
    const mod = await import('algosdk')
    // algosdk v3 is ESM with a default export; some bundlers hand back the
    // namespace instead, so accept either shape.
    return mod.default ?? mod
  } catch {
    throw new Error('Algorand SDK missing — run `npm i algosdk@^3.6.0` to enable signing and minting.')
  }
}

async function getAlgod() {
  const algosdk = await loadAlgosdk()
  // Algodv2(token, baseServer, port). Nodely/AlgoNode need no token but the
  // argument is positional and required — pass '' , never undefined, or the
  // client sends a literal `X-Algo-API-Token: undefined` header.
  return new algosdk.Algodv2('', ACTIVE_CHAIN.rpcUrl, '')
}

async function getPera() {
  if (_pera) return _pera
  if (typeof window === 'undefined') throw new Error('Pera wallet requires a browser.')
  const chainId = PERA_CHAIN_IDS[ACTIVE_CHAIN.id]
  if (!chainId) throw new Error(`No Pera chainId mapped for Algorand network "${ACTIVE_CHAIN.id}".`)
  let PeraWalletConnect
  try {
    ({ PeraWalletConnect } = await import('@perawallet/connect'))
  } catch {
    throw new Error(
      'Pera wallet SDK missing — run `npm i @perawallet/connect@^1.5.2`, ' +
      'or install an ARC-0001 wallet extension (Lute, Kibisis, Defly).'
    )
  }
  _pera = new PeraWalletConnect({ chainId })
  return _pera
}

// ── Providers ────────────────────────────────────────────────────────────────

function injected() {
  if (typeof window === 'undefined') return null
  // ARC-0001 injected provider. Kibisis/Lute/Exodus all land on window.algorand;
  // Exodus additionally namespaces itself.
  return window.algorand ?? window.exodus?.algorand ?? null
}

export function detectWallets() {
  if (typeof window === 'undefined') return []
  const wallets = []
  const p = injected()
  if (p) wallets.push({ id: 'arc0001', name: p.metadata?.name ?? p.name ?? 'Algorand Wallet', icon: '▲' })
  // Pera works over QR/deeplink with no extension, so it is always offered.
  wallets.push({ id: 'pera', name: 'Pera', icon: '🟣' })
  return wallets
}

function requireAddress() {
  const addr = getAddress()
  if (!addr) throw new Error('Connect an Algorand wallet first.')
  if (!ADDR_RE.test(addr)) throw new Error(`Not a valid Algorand address: ${addr}`)
  return addr
}

// ── Wallet connection ───────────────────────────────────────────────────────

export async function connect() {
  if (typeof window === 'undefined') throw new Error('Algorand wallet connection requires a browser.')

  const provider = injected()
  if (typeof provider?.enable === 'function') {
    const res = await provider.enable({ genesisID: ACTIVE_CHAIN.id })
    // An Algorand keypair produces the SAME address on every network, so a
    // MainNet/TestNet mismatch is completely silent — the user would sign real
    // txns against the wrong ledger and we would record ownership for a tile
    // that never existed. Reject the session instead.
    const gid = res?.genesisID ?? res?.genesisId
    if (gid && gid !== ACTIVE_CHAIN.id) {
      throw new Error(`Wallet is on "${gid}" but this build targets "${ACTIVE_CHAIN.id}". Switch networks in your wallet.`)
    }
    _address = res?.accounts?.[0]?.address ?? res?.accounts?.[0] ?? null
    if (!_address) throw new Error('Algorand wallet connection rejected')
    _mode = 'injected'
    return { address: _address, chainId: ACTIVE_CHAIN.id, chainName: ACTIVE_CHAIN.name }
  }

  const pera = await getPera()
  // reconnectSession() must run BEFORE connect(): Pera keeps its WalletConnect
  // session in localStorage and calling connect() on top of a live one opens a
  // second, orphaned session. It resolves to [] when there is nothing to restore.
  const restored = await pera.reconnectSession().catch(() => [])
  let accounts = Array.isArray(restored) ? restored : []
  if (!accounts.length) {
    // Must be reached synchronously from a user gesture — iOS Safari blocks the
    // Pera modal/deeplink otherwise.
    accounts = await pera.connect().catch(err => {
      if (err?.data?.type === 'CONNECT_MODAL_CLOSED') throw new Error('Pera connection cancelled')
      throw err
    })
  }
  _address = accounts?.[0] ?? null
  if (!_address) throw new Error('Algorand wallet connection rejected')
  _mode = 'pera'
  return { address: _address, chainId: ACTIVE_CHAIN.id, chainName: ACTIVE_CHAIN.name }
}

export function disconnect() {
  // ARC-0001 has no disconnect verb — dropping local state is the whole contract.
  _pera?.disconnect?.().catch(() => {})
  _address = null
  _mode = null
}

export function getAddress() {
  return _address
}

export function getChainId() {
  return ACTIVE_CHAIN.id
}

export async function switchChain() { /* an Algorand build targets one network */ }

// ── Transaction signing (wallet signs, WE submit) ────────────────────────────

/**
 * Sign algosdk.Transaction objects with whichever wallet is connected.
 * Returns raw signed-txn bytes; nothing is broadcast here.
 */
async function signTxns(txns) {
  const algosdk = await loadAlgosdk()
  const provider = injected()

  if (_mode === 'injected' && typeof provider?.signTxns === 'function') {
    // ARC-0001: each WalletTransaction.txn is base64 CANONICAL MSGPACK of the
    // UNSIGNED txn. The reply is an array of the SAME length with null in every
    // slot the wallet was not asked to sign — index alignment matters.
    const req = txns.map(txn => ({ txn: b64FromBytes(algosdk.encodeUnsignedTransaction(txn)) }))
    const out = await provider.signTxns(req)
    return out.map((s, i) => {
      if (s == null) throw new Error(`Wallet returned no signature for transaction ${i}.`)
      return typeof s === 'string' ? bytesFromB64(s) : new Uint8Array(s)
    })
  }

  const pera = await getPera()
  // Pera takes ARRAYS OF GROUPS of *algosdk.Transaction objects* — not the
  // base64 strings ARC-0001 wants. Handing it base64 fails deep inside the SDK.
  const signed = await pera.signTransaction([txns.map(txn => ({ txn }))], getAddress())
  return signed.map(s => (typeof s === 'string' ? bytesFromB64(s) : new Uint8Array(s)))
}

// ── Message signing ──────────────────────────────────────────────────────────
//
// THE WEAK SPOT ON ALGORAND. There is no portable "personal_sign":
//   • use-wallet's signData is implemented by LUTE ONLY — canSignData is false
//     for pera, defly, kibisis, exodus and walletconnect. Never build login on it.
//   • Pera has its own signData(data, signer) in the SDK, but the Pera EXTENSION
//     implements signArc60Data instead and the legacy call throws
//     EXTENSION_UNSUPPORTED_OPERATION there.
//   • ARC-0060 signData(signingData, metadata) is still a DRAFT — shapes may move.
// So: try the wallet-native primitive, and when it is absent or refuses, fall
// back to ARC-0014 (below). We never fabricate a signature — the fallback is a
// real ed25519 signature, just over a transaction instead of raw bytes. The
// returned `method` tells the backend which verification path to use.

async function trySignData(message, addr) {
  const b64 = b64FromBytes(new TextEncoder().encode(message))
  const provider = injected()

  if (_mode === 'injected' && typeof provider?.signData === 'function') {
    try {
      const out = await provider.signData([{ data: b64, message }], addr)
      const sig = Array.isArray(out) ? out[0] : out
      if (sig) return { signature: typeof sig === 'string' ? sig : b64FromBytes(sig), address: addr, method: 'signData' }
    } catch { /* wallet does not really support it — fall through to ARC-0014 */ }
  }

  if (_mode === 'pera' && _pera) {
    try {
      if (typeof _pera.signArc60Data === 'function') {
        // ARC-0060: `domain` MUST equal the page origin or the extension rejects
        // the request outright.
        const out = await _pera.signArc60Data(
          { data: b64, signer: addr, domain: window.location.origin },
          { scope: 'ARBITRARY', encoding: 'base64' },
        )
        const sig = Array.isArray(out) ? out[0] : out
        if (sig) return { signature: typeof sig === 'string' ? sig : b64FromBytes(sig), address: addr, method: 'arc60' }
      }
      const out = await _pera.signData([{ data: b64, message }], addr)
      const sig = Array.isArray(out) ? out[0] : out
      if (sig) return { signature: typeof sig === 'string' ? sig : b64FromBytes(sig), address: addr, method: 'signData' }
    } catch { /* EXTENSION_UNSUPPORTED_OPERATION and friends land here */ }
  }

  return null
}

/**
 * ARC-0014 fallback: sign a 0-ALGO SELF-payment carrying the message in its note
 * field and NEVER submit it. The signed transaction IS the proof — the backend
 * decodes it, checks sender == receiver == claimed address and verifies the
 * ed25519 signature over the canonical msgpack.
 */
async function signArc14(message, addr) {
  const algosdk = await loadAlgosdk()
  const client  = await getAlgod()
  const sp      = await client.getTransactionParams().do()

  const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    // algosdk v3 renamed these from `from`/`to` — v2 field names silently
    // produce an invalid txn object.
    sender:   addr,
    receiver: addr,
    amount:   0,
    note:     new TextEncoder().encode(message),
    // fee 0 is what makes this proof un-submittable: it is below the 1000 µA
    // minimum so the network rejects it standalone, and it cannot be rescued by
    // pooling it into a group later because the group field is covered by the
    // signature. Blanking genesisID strips the network binding while genesisHash
    // still tells the server which ledger the proof was issued for. Some wallets
    // show a "zero fee" warning here — that is expected, not a bug.
    suggestedParams: {
      ...sp,
      fee: 0,
      flatFee: true,
      genesisID: '',
      genesisHash: sp?.genesisHash ?? GENESIS_HASH[ACTIVE_CHAIN.id],
    },
  })

  const [signed] = await signTxns([txn])
  return { signature: b64FromBytes(signed), address: addr, method: 'arc14', message }
}

export async function signMessage(message) {
  const addr = requireAddress()
  const native = await trySignData(message, addr)
  if (native) return native
  return signArc14(message, addr)
}

// ── Purchase signature (proof of wallet control, no contract needed) ─────────

export async function signPurchase({ tileKey, price }) {
  const addr = requireAddress()
  const text = `CryptoLand purchase — tile ${tileKey} for $${price} — ${addr}`
  const native = await trySignData(text, addr)
  if (native) return { signature: native.signature, message: text, method: native.method }
  const res = await signArc14(text, addr)
  return { signature: res.signature, message: text, method: res.method }
}

// ── Native ALGO payment (wallet → treasury) ─────────────────────────────────

/**
 * Pay for a tile in ALGO, from the user's own wallet.
 *
 * A plain payment transaction to the treasury — no app call, no ASA, nothing
 * that needs a deployed contract. It carries the exact per-tile price, and the
 * backend re-reads the transaction from the chain afterwards, so a tampered `to`
 * or `amount` here just fails verification and settles nothing.
 *
 * `amount` is a decimal STRING of microAlgos (1 ALGO = 1,000,000). It stays a
 * BigInt the whole way: µALGO would survive a Number, but every other chain on
 * this rail quotes base units that would not, and one shared contract with one
 * shared rule is what stops the exception from being forgotten.
 */
export async function payNative({ to, amount, from }) {
  if (!to)     throw new Error('No treasury address for this chain')
  if (!amount) throw new Error('No amount to pay')

  const micro = BigInt(amount)            // throws on a malformed quote
  if (micro <= 0n) throw new Error('Refusing to send a non-positive amount')

  const payer = from ?? requireAddress()
  if (!ADDR_RE.test(payer)) throw new Error(`Not a valid Algorand address: ${payer}`)

  const algosdk = await loadAlgosdk()
  // ADDR_RE only proves the shape. isValidAddress checks the 4-byte checksum,
  // which is the part that actually catches a mistyped treasury — and on
  // Algorand a payment to a well-formed address nobody holds is simply gone.
  if (typeof algosdk.isValidAddress === 'function' && !algosdk.isValidAddress(to)) {
    throw new Error(`Not a valid Algorand address: ${to}`)
  }

  const client = await getAlgod()
  // Suggested params carry the current fee, the round window and the genesis
  // hash — the last of which is what binds the signature to THIS network.
  const sp = await client.getTransactionParams().do()

  const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    // algosdk v3 field names — v2's `from`/`to` silently build an invalid txn.
    sender:   payer,
    receiver: to,
    amount:   micro,
    suggestedParams: sp,
  })

  const [signed] = await signTxns([txn])
  // The wallet only signs; nothing reaches the network until we post it.
  const sent = await client.sendRawTransaction(signed).do()
  // v3 renamed txId → txid. txn.txID() is the same value computed locally, so
  // it is a safe fallback when a node answers with an empty body.
  const txid = sent?.txid ?? sent?.txId ?? txn.txID()
  if (!txid) throw new Error('Algorand node accepted the payment but returned no transaction id.')
  return { txHash: txid, from: payer }
}

/** Whether this build can take a wallet payment at all. */
export function supportsNativePay() {
  // Same rule as detectWallets(): Pera needs no extension, so a browser alone is
  // enough — outside one there is no wallet of any kind.
  return !ACTIVE_CHAIN.gasless && !ACTIVE_CHAIN.halted && detectWallets().length > 0
}

// ── NFT mint (an ASA — no smart contract required on Algorand) ───────────────

export async function mintTile({ tx, ty, country, toAddress }) {
  // hasContract() here means "a CryptoLand ASA/app id is configured for this
  // build" — Algorand needs no deployed contract to mint, so this is purely the
  // feature flag that keeps purchases DB-only until we switch minting on.
  if (!hasContract()) return mintStub('Algorand ASA minter not configured')

  const creator = requireAddress()
  // Algorand has NO push transfers: an account must opt in to an ASA before it
  // can receive it, so a freshly created asset can only land in the creator's
  // account. Mint from the buyer's own wallet; any later hand-off needs an
  // opt-in from the recipient first.
  if (toAddress && toAddress !== creator) {
    throw new Error('Algorand mints to the connected wallet only — the recipient must opt in before an ASA can be transferred to them.')
  }

  const algosdk = await loadAlgosdk()
  const client  = await getAlgod()
  const sp      = await client.getTransactionParams().do()
  const tokenId = tileTokenId(tx, ty)
  const BASE    = import.meta.env.VITE_API_BASE ?? ''

  // total 1 + decimals 0 is what makes an ASA an NFT. Creating (and then
  // holding) it locks 0.1 ALGO of the creator's balance as min-balance, on top
  // of the txn fee — a wallet at exactly its minimum will fail here.
  // Field caps are in BYTES and are enforced client-side by algosdk, not on
  // chain: unitName ≤ 8, assetName ≤ 32, assetURL ≤ 96.
  const txn = algosdk.makeAssetCreateTxnWithSuggestedParamsFromObject({
    sender: creator,
    total: 1,
    decimals: 0,
    defaultFrozen: false,
    unitName: 'LAND',
    assetName: `CryptoLand ${tx}:${ty}`.slice(0, 32),
    // The '#arc3' suffix is what declares ARC-3 metadata — without it wallets
    // treat the URL as an opaque link and show no artwork.
    assetURL: `${BASE}/algorand/metadata/${tokenId}.json#arc3`.slice(0, 96),
    manager: creator,
    reserve: creator,
    note: new TextEncoder().encode(JSON.stringify({
      app: 'cryptoland', tokenId: String(tokenId), tx, ty, country: country ?? null,
    })),
    suggestedParams: sp,
  })

  const [signed] = await signTxns([txn])
  // The wallet only signs — nothing touches the network until we post it.
  const sent  = await client.sendRawTransaction(signed).do()
  const txid  = sent?.txid ?? sent?.txId ?? txn.txID()   // v3 renamed txId → txid
  const info  = await waitForTx(txid)
  const asset = info?.['asset-index'] ?? info?.assetIndex ?? null

  return {
    txHash: txid,
    tokenId: String(tokenId),          // packed tile id — identical on every chain
    assetId: asset != null ? String(asset) : null,   // the on-chain ASA id
    minted: true,
  }
}

// ── Marketplace (activates with the deployed minter/app) ─────────────────────

export async function listForSale() { throw new Error('Algorand marketplace: available after deploy') }
export async function unlistTile()  { throw new Error('Algorand marketplace: available after deploy') }
export async function buyTile()     { throw new Error('Algorand marketplace: available after deploy') }

// ── Reads (delegate to backend / indexer) ────────────────────────────────────

export async function ownerOf()          { return null }
export async function getTileData()      { return null }
export async function getOwnedTokenIds() { return [] }
export async function totalSupply()      { return 0 }

export async function waitForTx(txid, maxWait = 30_000) {
  const start = Date.now()
  const url   = `${ACTIVE_CHAIN.rpcUrl}/v2/transactions/pending/${txid}?format=json`
  while (Date.now() - start < maxWait) {
    // algod 404s both before the txn reaches the pool and after it drops out of
    // it, so an empty body means "keep waiting", never "failed".
    const r = await fetch(url).then(res => (res.ok ? res.json() : null)).catch(() => null)
    const round = r?.['confirmed-round'] ?? r?.confirmedRound
    if (round) return r
    const poolError = r?.['pool-error'] ?? r?.poolError
    if (poolError) throw new Error(`Algorand tx ${txid} rejected: ${poolError}`)
    await new Promise(res => setTimeout(res, 1000))
  }
  throw new Error(`Algorand tx ${txid} not confirmed within ${maxWait / 1000}s`)
}

// ── Listeners ────────────────────────────────────────────────────────────────

export function onAccountsChanged(cb) {
  // No ARC standardises an account-change event, and Pera emits none at all —
  // its session is pinned to the account picked at connect time. Best effort on
  // wallets that happen to expose an emitter.
  injected()?.on?.('accountsChanged', accts => cb(accts?.[0]?.address ?? accts?.[0] ?? null))
}

export function onChainChanged() { /* an Algorand build targets one network */ }

export function onDisconnect(cb) {
  // The underlying WalletConnect connector only exists once a Pera session is live.
  _pera?.connector?.on?.('disconnect', () => { _address = null; _mode = null; cb() })
  injected()?.on?.('disconnect', cb)
}

export function removeListeners() {
  _pera?.connector?.off?.('disconnect')
  const p = injected()
  p?.removeListener?.('accountsChanged')
  p?.removeListener?.('disconnect')
}

export const ADAPTER_TYPE = 'algorand'
