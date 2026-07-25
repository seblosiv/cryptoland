/**
 * Cardano Adapter — CryptoLand
 * =============================
 * Covers Cardano mainnet + preprod via CIP-30 (Lace, Eternl, Typhon, Vespr,
 * Begin, Yoroi, NuFi, Gero). Connect + address + purchase signature (CIP-8
 * signData) work today with nothing deployed; the on-chain mint is stubbed until
 * VITE_CONTRACT_CARDANO is set.
 *
 * Implements the universal BlockchainAdapter interface (same surface as evm.js).
 *
 * Cardano has NO contract to deploy for NFTs: a tile is a native multi-asset
 * minted under a minting policy (native script sig+timelock, or Plutus). So here
 * hasContract() means "a policy id is configured" — VITE_CONTRACT_CARDANO holds
 * the blake2b-224 policy id, not a contract address.
 *
 * @emurgo/cardano-serialization-lib-browser is an OPTIONAL peer dep, lazy-loaded
 * only when we need to decode an address or assemble a signed tx. The build must
 * work with it absent, so nothing here imports it at the top level.
 */

import { ACTIVE_CHAIN } from '../config.js'
import { tileTokenId, tokenIdToTile, hasContract, mintStub } from './_shared.js'

export { tileTokenId, tokenIdToTile }

let _walletKey  = null   // key under window.cardano, e.g. 'lace' | 'eternl'
let _api        = null   // the object returned by wallet.enable()
let _addressHex = null   // CIP-30 change address — HEX CBOR, the form signData wants
let _address    = null   // same address bech32-encoded (or hex if CSL is absent)
let _networkId  = null   // 0 = any testnet, 1 = mainnet

// ── Hex helpers (CIP-30 speaks hex everywhere, never utf8 and never bech32) ───

function toHex(bytes) {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

function fromHex(hex) {
  const clean = String(hex ?? '').replace(/^0x/, '')
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16)
  return out
}

function utf8ToHex(str) {
  return toHex(new TextEncoder().encode(str))
}

// ── Serialization lib (optional, lazy) ───────────────────────────────────────

async function loadCSL() {
  try {
    return await import('@emurgo/cardano-serialization-lib-browser')
  } catch {
    throw new Error(
      'Cardano serialization lib not available — run: npm i @emurgo/cardano-serialization-lib-browser'
    )
  }
}

/**
 * ADDRESS TRAP: every address CIP-30 hands back is hex-encoded CBOR bytes, not
 * the bech32 `addr1...` users recognise. Decoding needs CSL. If CSL is missing we
 * return the raw hex rather than fabricating anything — callers/backend must be
 * ready for either form, so the DB stores whatever this returns.
 */
async function hexAddressToBech32(hex) {
  if (!hex) return null
  try {
    const { Address } = await loadCSL()
    return Address.from_bytes(fromHex(hex)).to_bech32()
  } catch {
    return hex
  }
}

// ── Wallet discovery ─────────────────────────────────────────────────────────

/**
 * CIP-30 wallet keys are NOT standardized and change over time (Nami is dead —
 * absorbed into Lace and no longer connectable), so we never hardcode a list.
 * We enumerate window.cardano and keep only entries shaped like a CIP-30
 * provider. That also filters out the junk some extensions add at the top level
 * (bare functions, aliases such as `ccvault` for Eternl, non-CIP-30 `typhon`).
 */
function listProviders() {
  if (typeof window === 'undefined' || !window.cardano) return []
  const seen = new Set()
  const out = []
  for (const key of Object.keys(window.cardano)) {
    const w = window.cardano[key]
    if (!w || typeof w !== 'object') continue
    if (typeof w.enable !== 'function') continue
    if (!w.apiVersion || !w.name || !w.icon) continue
    const dedupe = String(w.name).toLowerCase()
    if (seen.has(dedupe)) continue   // ccvault/eternl are the same wallet twice
    seen.add(dedupe)
    out.push({ key, wallet: w })
  }
  return out
}

export function detectWallets() {
  return listProviders().map(({ key, wallet }) => ({
    id: key,
    name: wallet.name ?? key,
    // CIP-30 icons are data: URIs, safe to render directly in an <img>.
    icon: wallet.icon ?? '💠',
  }))
}

// ── Wallet connection ────────────────────────────────────────────────────────

export async function connect(walletId) {
  const providers = listProviders()
  if (!providers.length) {
    throw new Error('No Cardano wallet detected. Install Lace, Eternl or Typhon.')
  }
  const chosen = walletId
    ? providers.find(p => p.key === walletId)
    : providers.find(p => p.key === 'lace') ?? providers[0]
  if (!chosen) throw new Error(`Cardano wallet "${walletId}" not found.`)

  _api = await chosen.wallet.enable()
  if (!_api) throw new Error('Cardano wallet connection rejected')
  _walletKey = chosen.key

  _networkId = await _api.getNetworkId()
  // getNetworkId only distinguishes mainnet (1) from "some testnet" (0) — it
  // CANNOT tell preprod from preview, so this is the strongest check available.
  const wantMainnet = !ACTIVE_CHAIN.testnet
  if (wantMainnet !== (_networkId === 1)) {
    _api = null
    _walletKey = null
    throw new Error(
      `Wallet is on ${_networkId === 1 ? 'mainnet' : 'a testnet'} but this build targets ` +
      `${ACTIVE_CHAIN.name}. Switch networks in your wallet and reconnect.`
    )
  }

  // The change address is the best single "the address" — used addresses may be
  // empty on a fresh wallet and reward addresses are stake, not payment, keys.
  _addressHex = await _api.getChangeAddress()
  _address    = await hexAddressToBech32(_addressHex)
  if (!_address) throw new Error('Cardano wallet returned no address')

  return { address: _address, chainId: ACTIVE_CHAIN.id, chainName: ACTIVE_CHAIN.name, wallet: _walletKey }
}

export function disconnect() {
  // CIP-30 has no revoke/disconnect method — the grant lives in the extension
  // until the user removes the dApp there. We can only drop our local session.
  stopPolling()
  _api = null
  _walletKey = null
  _addressHex = null
  _address = null
  _networkId = null
}

export function getAddress() {
  return _address
}

export function getChainId() {
  return ACTIVE_CHAIN.id
}

export async function switchChain() { /* a Cardano build targets one network */ }

// ── Message signing (CIP-8 / COSE_Sign1 via CIP-30 signData) ─────────────────

/**
 * Returns { signature, key } — CIP-30 signData produces a COSE_Sign1 payload
 * plus the COSE_Key that verifies it. BOTH are required server-side; a bare
 * `signature` cannot be verified on Cardano, so we always pass the key through.
 */
async function signDataWith(text) {
  if (!_api) throw new Error('Connect a Cardano wallet first.')
  if (typeof _api.signData !== 'function') {
    throw new Error(`Cardano wallet "${_walletKey}" does not support CIP-30 signData.`)
  }
  // signData takes the HEX address (not bech32) and a HEX payload (not utf8).
  const res = await _api.signData(_addressHex, utf8ToHex(text)).catch(err => {
    // Hardware wallets driven through Lace/Eternl reject signData outright.
    throw new Error(`Cardano wallet could not sign: ${err?.info ?? err?.message ?? err}`)
  })
  if (!res?.signature) throw new Error('Cardano wallet returned no signature')
  return res
}

export async function signMessage(message) {
  const { signature, key } = await signDataWith(message)
  return { signature, key, address: getAddress() }
}

// ── Purchase signature (proof of wallet control, no policy needed) ───────────

export async function signPurchase({ tileKey, price }) {
  const text = `CryptoLand purchase — tile ${tileKey} for $${price} — ${getAddress()}`
  const { signature, key } = await signDataWith(text)
  return { signature, key, message: text }
}

// ── NFT mint (stubbed until a minting policy id is configured) ────────────────

export async function mintTile({ tx, ty, country, toAddress }) {
  if (!hasContract()) return mintStub('Cardano minting policy not configured')
  if (!_api) throw new Error('Connect a Cardano wallet to mint.')

  const policyId  = ACTIVE_CHAIN.contractAddress
  const tokenId   = tileTokenId(tx, ty)
  // Asset name is arbitrary bytes (≤32) hex-encoded; unit = policyId + nameHex.
  const assetName = utf8ToHex(`CLT${tokenId}`)
  const unit      = `${policyId}${assetName}`

  // Step 1 — backend builds the unsigned tx: mints `unit` under the policy,
  // attaches the native/Plutus script witness and the CIP-25 (label 721)
  // metadata, and selects inputs from the wallet's UTxOs.
  const BASE = import.meta.env.VITE_API_BASE ?? ''
  const utxos = await _api.getUtxos().catch(() => [])
  const res = await fetch(`${BASE}/cardano/build-mint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tx, ty, country, owner: toAddress ?? _address,
      changeAddress: _addressHex, policyId, assetName, unit, utxos,
    }),
  })
  if (!res.ok) throw new Error('Failed to build Cardano mint transaction')
  const { txCbor } = await res.json()
  if (!txCbor) throw new Error('Backend returned no Cardano transaction')

  // Step 2 — the wallet signs. TRAP: signTx returns ONLY a witness set, never a
  // full transaction, and it does NOT submit. partialSign MUST be true because
  // the backend already attached the policy key's witness; with false the wallet
  // refuses a tx it cannot fully witness.
  const witnessHex = await _api.signTx(txCbor, true)

  // Step 3 — merge that witness set into the built tx ourselves, then submit.
  const signedHex = await assembleTx(txCbor, witnessHex)
  const txHash = await _api.submitTx(signedHex)

  return { txHash, tokenId: String(tokenId), unit, minted: true }
}

/**
 * Merge a CIP-30 witness set into an unsigned tx. Two traps live here:
 *  1. vkeys must be UNIONed — overwriting drops the backend's policy-key
 *     signature and the mint fails with a missing-witness error.
 *  2. auxiliary_data must be carried over, or the CIP-25 metadata disappears and
 *     the body's auxiliary-data hash no longer matches (tx rejected on submit).
 */
async function assembleTx(txCbor, witnessHex) {
  const { Transaction, TransactionWitnessSet, Vkeywitnesses } = await loadCSL()
  const built    = Transaction.from_bytes(fromHex(txCbor))
  const fromWall = TransactionWitnessSet.from_bytes(fromHex(witnessHex))
  const existing = built.witness_set()

  const merged = TransactionWitnessSet.new()
  if (existing.native_scripts()) merged.set_native_scripts(existing.native_scripts())
  if (existing.plutus_scripts()) merged.set_plutus_scripts(existing.plutus_scripts())
  if (existing.plutus_data())    merged.set_plutus_data(existing.plutus_data())
  if (existing.redeemers())      merged.set_redeemers(existing.redeemers())

  const vkeys = Vkeywitnesses.new()
  for (const set of [existing.vkeys(), fromWall.vkeys()]) {
    if (!set) continue
    for (let i = 0; i < set.len(); i++) vkeys.add(set.get(i))
  }
  if (vkeys.len()) merged.set_vkeys(vkeys)

  return toHex(Transaction.new(built.body(), merged, built.auxiliary_data()).to_bytes())
}

// ── Marketplace (activates with the minting policy + a swap script) ──────────

export async function listForSale() { throw new Error('Cardano marketplace: available after deploy') }
export async function unlistTile()  { throw new Error('Cardano marketplace: available after deploy') }
export async function buyTile()     { throw new Error('Cardano marketplace: available after deploy') }

// ── Reads (delegate to backend / Koios) ──────────────────────────────────────

export async function ownerOf()          { return null }
export async function getTileData()      { return null }
export async function getOwnedTokenIds() { return [] }
export async function totalSupply()      { return 0 }

export async function waitForTx(txHash, maxWait = 180_000) {
  // Cardano blocks are ~20s and a tx is only final once it lands in one, so the
  // default wait is deliberately longer than the fast-chain adapters'.
  const start = Date.now()
  while (Date.now() - start < maxWait) {
    const r = await fetch(`${ACTIVE_CHAIN.rpcUrl}/tx_status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _tx_hashes: [txHash] }),
    }).then(r => r.json()).catch(() => null)
    const confirmations = Array.isArray(r) ? r[0]?.num_confirmations : null
    if (confirmations != null && confirmations >= (ACTIVE_CHAIN.confirmations ?? 1)) return r[0]
    await new Promise(res => setTimeout(res, 5000))
  }
  throw new Error(`Cardano tx ${txHash} not confirmed within ${maxWait / 1000}s`)
}

// ── Listeners ────────────────────────────────────────────────────────────────
// CIP-30 defines NO events: no accountsChanged, no networkChanged, no
// disconnect. Wallets that do emit them all use different, unstable APIs, so we
// poll the enabled api instead — it is the only portable option.

let _pollTimer   = null
const _accountCbs = []
const _networkCbs = []
const _disconnectCbs = []

function startPolling() {
  if (_pollTimer || typeof window === 'undefined') return
  _pollTimer = setInterval(async () => {
    if (!_api) return
    try {
      const [net, addrHex] = await Promise.all([_api.getNetworkId(), _api.getChangeAddress()])
      if (net !== _networkId) {
        _networkId = net
        _networkCbs.forEach(cb => cb(net))
      }
      if (addrHex !== _addressHex) {
        _addressHex = addrHex
        _address = await hexAddressToBech32(addrHex)
        _accountCbs.forEach(cb => cb(_address))
      }
    } catch {
      // The api object throws once the user revokes the dApp in their wallet —
      // that is the closest thing to a disconnect event Cardano offers.
      _api = null
      _disconnectCbs.forEach(cb => cb())
    }
  }, 4000)
}

function stopPolling() {
  if (_pollTimer) clearInterval(_pollTimer)
  _pollTimer = null
}

export function onAccountsChanged(cb) {
  if (typeof cb === 'function') { _accountCbs.push(cb); startPolling() }
}
export function onChainChanged(cb) {
  if (typeof cb === 'function') { _networkCbs.push(cb); startPolling() }
}
export function onDisconnect(cb) {
  if (typeof cb === 'function') { _disconnectCbs.push(cb); startPolling() }
}
export function removeListeners() {
  _accountCbs.length = 0
  _networkCbs.length = 0
  _disconnectCbs.length = 0
  stopPolling()
}

export const ADAPTER_TYPE = 'cardano'
