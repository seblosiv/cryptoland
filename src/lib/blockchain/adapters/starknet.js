/**
 * Starknet Adapter — CryptoLand
 * ==============================
 * Covers Starknet mainnet (SN_MAIN) + Sepolia (SN_SEPOLIA) via the wallet API v2
 * (`swo.request({ type, params })`) exposed by Ready/Argent X, Braavos, Keplr,
 * Cartridge, Bitget and OKX. Connect + address + purchase signature work today
 * with no contract deployed; NFT minting (a Cairo ERC-721 + SRC-5 class, DECLAREd
 * then DEPLOYed through the UDC) is stubbed until VITE_CONTRACT_STARKNET is set.
 *
 * Implements the universal BlockchainAdapter interface (same surface as evm.js).
 *
 * Wallet discovery is @starknet-io/get-starknet — an optional, lazy-loaded peer
 * dep. If it isn't installed we fall back to the legacy window.starknet_* keys so
 * the build still connects, and only then surface an install hint.
 */

import { ACTIVE_CHAIN } from '../config.js'
import { tileTokenId, tokenIdToTile, hasContract, mintStub } from './_shared.js'

export { tileTokenId, tokenIdToTile }

let _swo       = null   // StarknetWindowObject
let _address   = null
let _handlers  = []     // [event, fn] pairs, so removeListeners() can detach them

const INSTALL_HINT = 'npm i @starknet-io/get-starknet starknet'

// ── felt252 helpers ─────────────────────────────────────────────────────────
// ADDRESS TRAP: a Starknet address is a felt, not a fixed-width byte string.
// 0x04ab… and 0x4ab… are THE SAME address — wallets are inconsistent about the
// 64-char zero padding. Every address that leaves this module goes through
// normalizeAddress() first, or DB lookups and owner comparisons silently miss.

function normalizeAddress(value) {
  if (value === null || value === undefined) return null
  const raw = typeof value === 'object' ? (value.address ?? value.value) : value
  if (raw === null || raw === undefined) return null
  let hex = typeof raw === 'string' ? raw.trim().toLowerCase() : `0x${BigInt(raw).toString(16)}`
  if (!hex.startsWith('0x')) hex = `0x${hex}`
  const body = hex.slice(2).replace(/^0+/, '')
  if (!/^[0-9a-f]*$/.test(body) || body.length > 64) return null
  return `0x${body || '0'}`
}

/** ASCII → felt252. Cairo shortstrings are capped at 31 bytes. */
function shortStringToFelt(str) {
  const s = String(str ?? '')
  if (s.length > 31) throw new Error(`Starknet: "${s}" exceeds the 31-byte felt252 shortstring limit`)
  let hex = ''
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i)
    if (code > 0x7f) throw new Error(`Starknet: "${s}" must be ASCII to fit a felt252 shortstring`)
    hex += code.toString(16).padStart(2, '0')
  }
  return hex ? `0x${hex}` : '0x0'
}

function feltToShortString(felt) {
  let hex = String(felt ?? '').replace(/^0x/i, '').replace(/^0+/, '')
  if (hex.length % 2) hex = `0${hex}`
  let out = ''
  for (let i = 0; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16))
  return out.replace(/\0/g, '')
}

/** Cairo u256 is TWO felts on the wire — passing one silently corrupts calldata. */
function toU256(value) {
  const v = BigInt(value)
  return { low: (v & ((1n << 128n) - 1n)).toString(), high: (v >> 128n).toString() }
}

// ── Wallet plumbing ─────────────────────────────────────────────────────────

async function getStarknetModule() {
  try {
    return await import('@starknet-io/get-starknet')
  } catch {
    return null   // optional peer dep — legacy injection is the fallback
  }
}

/** Legacy per-wallet injections. Not the supported discovery path; enough for a
 *  synchronous detectWallets() list and for a get-starknet-less fallback. */
const LEGACY_KEYS = [
  ['starknet_argentX',   'ready',     'Ready (Argent X)', '🛡️'],
  ['starknet_braavos',   'braavos',   'Braavos',          '🦁'],
  ['starknet_keplr',     'keplr',     'Keplr',            '🌌'],
  ['starknet_cartridge', 'cartridge', 'Cartridge',        '🎮'],
  ['starknet_bitkeep',   'bitget',    'Bitget',           '🟦'],
  ['starknet_okxwallet', 'okx',       'OKX',              '⭕'],
]

function legacyWallets() {
  if (typeof window === 'undefined') return []
  return LEGACY_KEYS
    .filter(([key]) => window[key])
    .map(([key, id, name, icon]) => ({ id, name, icon, __swo: window[key] }))
}

export function detectWallets() {
  const found = legacyWallets().map(({ id, name, icon }) => ({ id, name, icon }))
  // get-starknet's own discovery (incl. WalletConnect-style remote wallets) is
  // async, so it can't be surfaced from this synchronous interface method; the
  // modal's static per-family list covers the rest.
  if (!found.length && typeof window !== 'undefined' && window.starknet) {
    found.push({ id: 'starknet', name: 'Starknet Wallet', icon: '🔱' })
  }
  return found
}

/** Wallet API v2 RPC. Every wallet call funnels through here. */
async function request(type, params) {
  if (!_swo) throw new Error('Connect a Starknet wallet first.')
  if (typeof _swo.request !== 'function') {
    throw new Error(`Starknet wallet is too old for the ${type} wallet API. Update the extension.`)
  }
  return _swo.request(params === undefined ? { type } : { type, params })
}

// ── Wallet connection ───────────────────────────────────────────────────────

export async function connect() {
  if (typeof window === 'undefined') throw new Error('Starknet connect requires a browser.')

  const gs = await getStarknetModule()
  if (gs?.connect) {
    _swo = await gs.connect({ modalMode: 'alwaysAsk', modalTheme: 'dark' })
  } else {
    _swo = legacyWallets()[0]?.__swo ?? window.starknet ?? null
  }
  if (!_swo) {
    throw new Error(
      gs
        ? 'No Starknet wallet selected. Install Ready (Argent X) or Braavos.'
        : `No Starknet wallet detected and get-starknet is not installed (${INSTALL_HINT}).`
    )
  }

  // Pre-v2 wallets only expose enable(); v2 wallets answer wallet_requestAccounts.
  let accounts = null
  if (typeof _swo.request === 'function') {
    accounts = await request('wallet_requestAccounts')
  } else if (typeof _swo.enable === 'function') {
    accounts = await _swo.enable()
  }
  _address = normalizeAddress(Array.isArray(accounts) ? accounts[0] : accounts) ?? normalizeAddress(_swo.selectedAddress)
  if (!_address) throw new Error('Starknet wallet connection rejected')

  // Starknet wallets are cross-network: a single extension holds SN_MAIN and
  // SN_SEPOLIA accounts and will happily sign on the wrong one. wallet_requestChainId
  // answers the felt (0x534e5f4d41494e), not the 'SN_MAIN' shortstring in our config.
  const walletChain = await request('wallet_requestChainId').catch(() => null)
  const decoded = walletChain ? feltToShortString(walletChain) : null
  if (decoded && decoded !== ACTIVE_CHAIN.id) {
    _swo = null
    _address = null
    throw new Error(`Wallet is on ${decoded}; switch it to ${ACTIVE_CHAIN.name} (${ACTIVE_CHAIN.id}) and reconnect.`)
  }

  return { address: _address, chainId: ACTIVE_CHAIN.id, chainName: ACTIVE_CHAIN.name }
}

export function disconnect() {
  // There is no wallet-side disconnect on Starknet — get-starknet only clears the
  // "last connected wallet" it keeps in localStorage. The site stays authorized
  // (wallet_getPermissions still lists it) until the user revokes it in-wallet.
  getStarknetModule().then(gs => gs?.disconnect?.({ clearLastWallet: true })).catch(() => {})
  _swo = null
  _address = null
}

export function getAddress() {
  return _address
}

export function getChainId() {
  return ACTIVE_CHAIN.id
}

export async function switchChain() { /* a Starknet build targets one network */ }

// ── Signing (SNIP-12 only) ──────────────────────────────────────────────────
// TRAP: Starknet has NO personal_sign / arbitrary-bytes signing. The single
// wallet signing primitive is wallet_signTypedData over SNIP-12 structured data,
// so a plain string is wrapped in a minimal typed-data struct rather than faked.
// Under revision "1" the domain type MUST be named StarknetDomain (revision "0"
// spelled it StarkNetDomain) — the wrong casing produces a different hash.
// Verification is on-chain: accounts are contracts, so the backend must call
// is_valid_signature(hash, signature) (SNIP-6, returns the 'VALID' magic value)
// instead of anything ecrecover-shaped.

const DOMAIN_TYPE = [
  { name: 'name',     type: 'shortstring' },
  { name: 'version',  type: 'shortstring' },
  { name: 'chainId',  type: 'shortstring' },
  { name: 'revision', type: 'shortstring' },
]

function snip12Domain() {
  return { name: 'CryptoLand', version: '1', chainId: ACTIVE_CHAIN.id, revision: '1' }
}

/** Signature felts: Ready returns [r, s]; Braavos hardware/multisig accounts
 *  return longer arrays and some wallets prefix the array length. Never assume
 *  two elements — hand the whole array to the account contract. */
function normalizeSignature(sig) {
  const arr = Array.isArray(sig) ? sig : (Array.isArray(sig?.signature) ? sig.signature : [sig])
  return arr.filter(v => v !== null && v !== undefined).map(String)
}

export async function signMessage(message) {
  if (!_swo) throw new Error('Connect a Starknet wallet first.')
  const typedData = {
    domain: snip12Domain(),
    primaryType: 'Message',
    types: { StarknetDomain: DOMAIN_TYPE, Message: [{ name: 'contents', type: 'string' }] },
    message: { contents: String(message) },
  }
  const sig = await request('wallet_signTypedData', typedData)
  return { signature: normalizeSignature(sig), address: _address, typedData }
}

// ── Purchase signature (proof of wallet control, no contract needed) ─────────

export async function signPurchase({ tileKey, price }) {
  if (!_swo) throw new Error('Connect a Starknet wallet first.')
  const [tx, ty] = String(tileKey ?? '').split(':').map(Number)
  const tokenId = Number.isFinite(tx) && Number.isFinite(ty) ? tileTokenId(tx, ty) : 0n
  const typedData = {
    domain: snip12Domain(),
    primaryType: 'Purchase',
    types: {
      StarknetDomain: DOMAIN_TYPE,
      Purchase: [
        { name: 'tile',    type: 'shortstring' },
        { name: 'price',   type: 'shortstring' },
        { name: 'tokenId', type: 'u128' },
        { name: 'buyer',   type: 'ContractAddress' },
      ],
    },
    // tokenId is u128 (< 2^30 for a Z14 grid), so it needs no u256 split here.
    message: { tile: String(tileKey), price: `$${price}`, tokenId: tokenId.toString(), buyer: _address },
  }
  const sig = await request('wallet_signTypedData', typedData)
  // The backend re-derives the SNIP-12 hash from this exact object — send the
  // typed data, not a human-readable sentence, or the hashes won't match.
  return { signature: normalizeSignature(sig), message: JSON.stringify(typedData) }
}

// ── Native payment (pay for a tile in STRK) ─────────────────────────────────

/**
 * STRK is an ERC-20 CONTRACT, not a balance field on the transaction. Starknet
 * has no `value` — every transfer of the fee token is an invoke of
 * transfer(recipient, amount) on that contract, so "send STRK" and "call a
 * contract" are the same operation here.
 *
 * This is the address the live CryptoLandTile was constructed with as its
 * pay_token (contracts/starknet/deploy.mjs) and the one the deploy paid its own
 * v3 fees in. It is the SAME on SN_MAIN and SN_SEPOLIA — both were queried
 * directly and both answer symbol() = 'STRK', decimals() = 18 — so it needs no
 * per-network branch. Not read from ACTIVE_CHAIN.tokenAddress: that field is
 * reserved for $CLND (see config.js), and overloading it would mean a build
 * that ships $CLND silently pays in the wrong token.
 */
const STRK_FEE_TOKEN = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d'

/**
 * Pay for a tile with the chain's own token, from the user's own wallet.
 *
 * A plain transfer to the treasury — NOT a call into CryptoLandTile. The
 * contract charges one flat price for every tile on Earth, which cannot express
 * a $12 ocean tile and a $76 Tokyo tile; a transfer carries the exact per-tile
 * price and needs no redeployment.
 *
 * `amount` is a decimal STRING of base units (STRK has 18 decimals, same as
 * wei), straight from the server's quote. It must never become a Number — the
 * value exceeds Number.MAX_SAFE_INTEGER and would silently round.
 *
 * SERVER-SIDE NOTE: because this is an ERC-20 transfer, verification cannot read
 * a tx `value` the way the EVM verifier does — it has to match the STRK
 * contract's Transfer event (from, to, amount) in the receipt.
 */
export async function payNative({ to, amount, from }) {
  if (!to)     throw new Error('No treasury address for this chain')
  if (!amount) throw new Error('No amount to pay')

  const value = BigInt(amount)          // throws on a malformed quote
  if (value <= 0n) throw new Error('Refusing to send a non-positive amount')
  if (!_swo) throw new Error('Connect a Starknet wallet first.')

  const recipient = normalizeAddress(to)
  if (!recipient) throw new Error(`"${to}" is not a valid Starknet address`)

  // The wallet signs with whatever account IT has selected, so a `from` that no
  // longer matches means the quote was bound to a different payer: the money
  // would move and only then fail verification. Refuse before signing.
  const payer = normalizeAddress(from) ?? _address
  if (!payer) throw new Error('No wallet account available')
  if (payer !== _address) {
    throw new Error(`Wallet is on ${_address}, but this payment was quoted for ${payer}. Switch accounts and retry.`)
  }

  // Same wire rules as mintTile: snake_case keys for the v2 wallet API, a
  // human-readable entry_point the wallet turns into a selector, and every felt
  // as a STRING. u256 is TWO felts — passing one corrupts the amount.
  const { low, high } = toU256(value)
  const res = await request('wallet_addInvokeTransaction', {
    calls: [{
      contract_address: STRK_FEE_TOKEN,
      entry_point: 'transfer',
      calldata: [recipient, low, high],
    }],
  })

  const txHash = res?.transaction_hash ?? res?.transactionHash ?? null
  if (!txHash) throw new Error('Starknet wallet returned no transaction hash')
  return { txHash, from: payer }
}

/** Whether this build can take a wallet payment at all. */
export function supportsNativePay() {
  if (ACTIVE_CHAIN.gasless || ACTIVE_CHAIN.halted) return false
  // The same evidence detectWallets() uses: a live session, or an injected
  // wallet. get-starknet's own discovery is async and cannot be consulted from a
  // synchronous method, so a wallet reachable only through it reads as
  // unsupported here — which shows the off-chain rail rather than a button that
  // throws, the safe direction to be wrong in.
  return Boolean(_swo) || detectWallets().length > 0
}

// ── NFT mint (stubbed until the Cairo ERC-721 is declared + deployed) ───────
// Bringing this live is two on-chain steps, not one: DECLARE the Cairo class
// (OpenZeppelin erc721 + SRC-5), then DEPLOY it through the OZ v2 Universal
// Deployer at 0x02ceed65a4bd731034c01113685c831b01c15d7d432f71afb1cf1634b53a2125
// — the same UDC address on mainnet AND sepolia. Put the resulting contract
// address in VITE_CONTRACT_STARKNET and this path activates itself.

export async function mintTile({ tx, ty, country, toAddress }) {
  if (!hasContract()) return mintStub('Starknet Cairo ERC-721 not declared/deployed')
  if (!_swo) throw new Error('Connect a Starknet wallet to mint.')

  const tokenId = tileTokenId(tx, ty)
  const { low, high } = toU256(tokenId)
  const owner = normalizeAddress(toAddress) ?? _address
  if (!owner) throw new Error('Starknet mint needs a recipient address')

  // Wallet API v2 calls are snake_case (contract_address / entry_point / calldata);
  // starknet.js's account.execute() uses camelCase (contractAddress / entrypoint) —
  // mixing them yields a call the wallet accepts but cannot encode. entry_point
  // takes the human-readable name and the wallet derives the starknet_keccak
  // selector. Every calldata felt is a STRING: a felt past 2^53 loses precision
  // as a JS number.
  const calls = [{
    contract_address: ACTIVE_CHAIN.contractAddress,
    entry_point: 'mint_tile',
    calldata: [owner, low, high, String(tx), String(ty), shortStringToFelt(country ?? '')],
  }]
  const res = await request('wallet_addInvokeTransaction', { calls })
  const txHash = res?.transaction_hash ?? res?.transactionHash ?? null
  if (!txHash) throw new Error('Starknet wallet returned no transaction hash')
  return { txHash, tokenId: String(tokenId), minted: true }
}

// ── Marketplace (activates with the deployed Cairo contract) ─────────────────

export async function listForSale() { throw new Error('Starknet marketplace: available after Cairo contract deploy') }
export async function unlistTile()   { throw new Error('Starknet marketplace: available after Cairo contract deploy') }
export async function buyTile()      { throw new Error('Starknet marketplace: available after Cairo contract deploy') }

// ── Reads (delegate to backend / node) ──────────────────────────────────────

export async function ownerOf()          { return null }
export async function getTileData()      { return null }
export async function getOwnedTokenIds() { return [] }
export async function totalSupply()      { return 0 }

// ── Transaction confirmation ────────────────────────────────────────────────
// DEAD ENDPOINTS — never configure these: *.public.blastapi.io answers -32000
// "Blast API is no longer available", free-rpc.nethermind.io returns empty, and
// sepolia.starkscan.co no longer resolves. config.js uses Cartridge + Lava/dRPC.

async function rpcCall(method, params) {
  const urls = [ACTIVE_CHAIN.rpcUrl, ACTIVE_CHAIN.rpcUrlFallback].filter(Boolean)
  let transportError = null
  for (const url of urls) {
    try {
      // Returns the whole envelope: a JSON-RPC *error* here is often meaningful
      // (see the not-found case below), so it must not collapse into null.
      return await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      }).then(r => r.json())
    } catch (e) {
      transportError = e
    }
  }
  throw transportError ?? new Error('Starknet RPC unreachable')
}

export async function waitForTx(txHash, maxWait = 180_000) {
  const start = Date.now()
  let lastError = null
  while (Date.now() - start < maxWait) {
    const env = await rpcCall('starknet_getTransactionReceipt', [txHash]).catch(() => null)
    const receipt = env?.result
    if (receipt) {
      // A Starknet tx can be included AND reverted — finality alone is not success.
      if (receipt.execution_status === 'REVERTED') {
        throw new Error(`Starknet tx ${txHash} reverted: ${receipt.revert_reason ?? 'unknown reason'}`)
      }
      // ACCEPTED_ON_L2 is the practical confirmation; ACCEPTED_ON_L1 takes hours
      // and must never gate the purchase UI.
      if (receipt.execution_status === 'SUCCEEDED' || receipt.finality_status?.startsWith('ACCEPTED')) {
        return receipt
      }
    } else if (env?.error) {
      // While the tx is still in the mempool the node ERRORS ("Transaction hash
      // not found") instead of returning an empty receipt — that is a normal
      // pending state, not a failure. Other RPC errors are retried too (a flaky
      // node shouldn't fail a landing tx) and only reported on timeout.
      lastError = env.error
    }
    await new Promise(res => setTimeout(res, 3000))
  }
  const detail = lastError?.message ? ` (last RPC error: ${lastError.message})` : ''
  throw new Error(`Starknet tx ${txHash} not confirmed within ${maxWait / 1000}s${detail}`)
}

// ── Listeners ───────────────────────────────────────────────────────────────

function on(event, fn) {
  if (typeof _swo?.on !== 'function') return
  _swo.on(event, fn)
  _handlers.push([event, fn])
}

export function onAccountsChanged(cb) {
  on('accountsChanged', accounts => cb(normalizeAddress(accounts?.[0]) ?? null))
}

export function onChainChanged(cb) {
  // The event is 'networkChanged', not 'chainChanged', and it carries the chainId
  // felt — decode it so callers see 'SN_MAIN' / 'SN_SEPOLIA' like ACTIVE_CHAIN.id.
  on('networkChanged', chainId => cb(feltToShortString(chainId)))
}

export function onDisconnect(cb) {
  // No disconnect event exists. Locking the wallet or revoking the dapp arrives
  // as accountsChanged with an empty array.
  on('accountsChanged', accounts => { if (!accounts?.length) cb() })
}

export function removeListeners() {
  for (const [event, fn] of _handlers) _swo?.off?.(event, fn)
  _handlers = []
}

export const ADAPTER_TYPE = 'starknet'
