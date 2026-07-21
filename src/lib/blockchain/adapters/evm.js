/**
 * EVM Adapter — CryptoLand
 * =========================
 * Covers all EVM-compatible chains: Polygon, Avalanche C-Chain, Base, Ethereum, etc.
 * Uses only browser-native APIs + raw JSON-RPC — no ethers.js dependency required
 * for read operations. Write operations (mint, buy, list) go through the injected
 * wallet provider (window.ethereum / EIP-1193).
 *
 * The adapter implements the universal BlockchainAdapter interface:
 *   connect()           → { address, chainId }
 *   disconnect()        → void
 *   getAddress()        → string | null
 *   getChainId()        → number | null
 *   switchChain(chain)  → void
 *   mintTile(params)    → { txHash, tokenId }
 *   ownerOf(tokenId)    → address | null
 *   listForSale(params) → { txHash }
 *   unlist(tokenId)     → { txHash }
 *   buyTile(tokenId)    → { txHash }
 *   getTileData(tokenId)→ TileData
 *   getOwnedTokenIds(addr) → tokenId[]
 *   waitForTx(txHash)   → receipt
 */

import { ACTIVE_CHAIN, chainById } from '../config.js'
import ABI from '../contracts/abi.json'

// ── Hex / bigint helpers ───────────────────────────────────────────────────────

export function toHex(n)     { return '0x' + BigInt(n).toString(16) }
export function fromHex(h)   { return h ? BigInt(h) : 0n }
export function hexToNum(h)  { return h ? Number(BigInt(h)) : 0 }
export function padAddr(a)   { return a?.toLowerCase() ?? null }

// ── ABI encoding (minimal, no ethers) ────────────────────────────────────────

function encodeSelector(sig) {
  // keccak256 of signature string → first 4 bytes
  // We pre-compute these since we can't run keccak in browser without a lib
  const SELECTORS = {
    'mint(address,uint256,string,string)':         '0x8e4d9f96',
    'listForSale(uint256,uint256)':                '0x7d814b40',
    'unlist(uint256)':                             '0x6e2b89c5',
    'buy(uint256)':                                '0xa6f2ae3a',
    'tileData(uint256)':                           '0x6ef56f5e',
    'tokenIdFromKey(uint256,uint256)':             '0x1a6e15f1',
    'ownerOf(uint256)':                            '0x6352211e',
    'balanceOf(address)':                          '0x70a08231',
    'tokenOfOwnerByIndex(address,uint256)':        '0x2f745c59',
    'totalSupply()':                               '0x18160ddd',
    'tokenURI(uint256)':                           '0xc87b56dd',
    'approve(address,uint256)':                    '0x095ea7b3',
    'setBaseURI(string)':                          '0x55f804b3',
    'withdrawFees()':                              '0xf940e385',
  }
  return SELECTORS[sig] ?? null
}

function pad32(val) {
  return BigInt(val).toString(16).padStart(64, '0')
}

function encodeString(str) {
  const bytes  = new TextEncoder().encode(str)
  const len    = bytes.length
  const lenHex = len.toString(16).padStart(64, '0')
  const padded = Math.ceil(len / 32) * 32
  let   hex    = ''
  for (const b of bytes) hex += b.toString(16).padStart(2, '0')
  hex = hex.padEnd(padded * 2, '0')
  return lenHex + hex
}

// Encode calldata for functions we call
function encodeCall(sig, ...args) {
  const sel = encodeSelector(sig)
  if (!sel) throw new Error(`Unknown ABI selector: ${sig}`)

  if (sig === 'ownerOf(uint256)' || sig === 'tileData(uint256)' ||
      sig === 'tokenURI(uint256)' || sig === 'totalSupply()' ||
      sig === 'unlist(uint256)') {
    const params = args.map(a => pad32(a)).join('')
    return sel + params
  }

  if (sig === 'balanceOf(address)') {
    return sel + pad32(BigInt(args[0]))
  }

  if (sig === 'tokenOfOwnerByIndex(address,uint256)') {
    return sel + pad32(BigInt(args[0])) + pad32(args[1])
  }

  if (sig === 'tokenIdFromKey(uint256,uint256)') {
    return sel + pad32(args[0]) + pad32(args[1])
  }

  if (sig === 'listForSale(uint256,uint256)') {
    return sel + pad32(args[0]) + pad32(args[1])
  }

  if (sig === 'buy(uint256)') {
    return sel + pad32(args[0])
  }

  if (sig === 'mint(address,uint256,string,string)') {
    // address, uint256, string, string
    // offset layout: 4 static slots first (addr, uint, offset1, offset2), then string data
    const addr    = pad32(BigInt(args[0]))
    const tokenId = pad32(args[1])
    // offsets: first string at 4*32=128, second string at 128 + encoded_len(str1)
    const str1Enc   = encodeString(args[2])
    const str2Enc   = encodeString(args[3])
    const offset1   = pad32(128)  // 4 slots * 32 bytes
    const offset2   = pad32(128 + str1Enc.length / 2)
    return sel + addr + tokenId + offset1 + offset2 + str1Enc + str2Enc
  }

  if (sig === 'approve(address,uint256)') {
    return sel + pad32(BigInt(args[0])) + pad32(args[1])
  }

  return sel
}

// Decode simple return values
function decodeAddress(hex) {
  if (!hex || hex === '0x') return null
  return '0x' + hex.slice(-40)
}

function decodeUint(hex) {
  if (!hex || hex === '0x') return 0n
  return BigInt(hex)
}

// ── JSON-RPC helpers ──────────────────────────────────────────────────────────

let _rpcId = 1

async function rpcCall(rpcUrl, method, params = []) {
  const res = await fetch(rpcUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ jsonrpc: '2.0', id: _rpcId++, method, params }),
  })
  const d = await res.json()
  if (d.error) throw new Error(d.error.message ?? JSON.stringify(d.error))
  return d.result
}

async function ethCall(contractAddress, data, rpcUrl = ACTIVE_CHAIN.rpcUrl) {
  return rpcCall(rpcUrl, 'eth_call', [{ to: contractAddress, data }, 'latest'])
}

async function getReceipt(txHash, rpcUrl = ACTIVE_CHAIN.rpcUrl) {
  return rpcCall(rpcUrl, 'eth_getTransactionReceipt', [txHash])
}

// ── Provider helpers ──────────────────────────────────────────────────────────

function getProvider() {
  if (typeof window === 'undefined') return null
  // Support MetaMask, Coinbase Wallet, Rabby, injected EIP-1193
  return window.ethereum ?? null
}

async function requestAccounts() {
  const provider = getProvider()
  if (!provider) throw new Error('No wallet detected. Install MetaMask or a compatible wallet.')
  const accounts = await provider.request({ method: 'eth_requestAccounts' })
  return accounts?.[0] ?? null
}

async function walletCall(method, params = []) {
  const provider = getProvider()
  if (!provider) throw new Error('No wallet provider')
  return provider.request({ method, params })
}

// ── Token ID derivation (matches contract) ────────────────────────────────────
// tokenId = (uint(tx_) << 15) | uint(ty_)  — packs 16384×16384 grid into 29 bits

export function tileTokenId(tx, ty) {
  return (BigInt(tx) << 15n) | BigInt(ty)
}

export function tokenIdToTile(tokenId) {
  const id = BigInt(tokenId)
  return { tx: Number(id >> 15n), ty: Number(id & 0x7FFFn) }
}

// ── Contract reads (no wallet needed) ────────────────────────────────────────

export async function ownerOf(tokenId) {
  const addr = ACTIVE_CHAIN.contractAddress
  if (!addr) return null
  try {
    const data   = encodeCall('ownerOf(uint256)', tileTokenId(...(typeof tokenId === 'object' ? [tokenId.tx, tokenId.ty] : [tokenId])))
    const result = await ethCall(addr, data)
    const owner  = decodeAddress(result)
    // Zero address = unminted
    return owner === '0x0000000000000000000000000000000000000000' ? null : owner
  } catch { return null }
}

export async function getTileData(tokenId) {
  const addr = ACTIVE_CHAIN.contractAddress
  if (!addr) return null
  try {
    const data   = encodeCall('tileData(uint256)', BigInt(tokenId))
    const result = await ethCall(addr, data)
    if (!result || result === '0x') return null
    // Decode: tileKey(string), country(string), mintedAt(uint256), listPrice(uint256), listed(bool)
    const raw = result.slice(2)
    // First 3 slots: offsets + mintedAt + listPrice + listed
    const mintedAt  = hexToNum('0x' + raw.slice(128, 192))
    const listPrice = fromHex('0x' + raw.slice(192, 256))
    const listed    = raw.slice(256, 320).endsWith('1')
    return { tokenId, mintedAt, listPrice, listed }
  } catch { return null }
}

export async function getOwnedTokenIds(address) {
  const addr = ACTIVE_CHAIN.contractAddress
  if (!addr || !address) return []
  try {
    const balData  = encodeCall('balanceOf(address)', address)
    const balHex   = await ethCall(addr, balData)
    const balance  = hexToNum(balHex)
    if (balance === 0) return []

    const calls = Array.from({ length: balance }, (_, i) =>
      ethCall(addr, encodeCall('tokenOfOwnerByIndex(address,uint256)', address, i))
    )
    const results = await Promise.all(calls)
    return results.map(r => decodeUint(r))
  } catch { return [] }
}

export async function totalSupply() {
  const addr = ACTIVE_CHAIN.contractAddress
  if (!addr) return 0
  try {
    const result = await ethCall(addr, encodeCall('totalSupply()'))
    return hexToNum(result)
  } catch { return 0 }
}

// ── Transaction helpers ───────────────────────────────────────────────────────

export async function waitForTx(txHash, maxWait = 120_000) {
  const start = Date.now()
  const rpc   = ACTIVE_CHAIN.rpcUrl
  while (Date.now() - start < maxWait) {
    const receipt = await getReceipt(txHash, rpc).catch(() => null)
    if (receipt) return receipt
    await new Promise(r => setTimeout(r, ACTIVE_CHAIN.blockTime * 1000))
  }
  throw new Error(`Transaction ${txHash} not confirmed within ${maxWait / 1000}s`)
}

// ── Chain switch ──────────────────────────────────────────────────────────────

export async function switchChain(chain) {
  if (chain.family !== 'evm') throw new Error('switchChain: not an EVM chain')
  try {
    await walletCall('wallet_switchEthereumChain', [{ chainId: toHex(chain.id) }])
  } catch (err) {
    // Error 4902 = chain not added — add it first
    if (err.code === 4902) {
      await walletCall('wallet_addEthereumChain', [{
        chainId:         toHex(chain.id),
        chainName:       chain.name,
        nativeCurrency:  chain.nativeCurrency,
        rpcUrls:         [chain.rpcUrl, chain.rpcUrlFallback].filter(Boolean),
        blockExplorerUrls: [chain.explorerUrl],
      }])
    } else throw err
  }
}

// ── Write operations (require wallet) ────────────────────────────────────────

export async function mintTile({ tx, ty, country, toAddress, valueWei }) {
  const addr    = ACTIVE_CHAIN.contractAddress
  if (!addr) throw new Error('Contract not deployed on ' + ACTIVE_CHAIN.name)

  const tokenId = tileTokenId(tx, ty)
  const tileKey = `${tx}:${ty}`
  const data    = encodeCall('mint(address,uint256,string,string)', toAddress, tokenId, tileKey, country)

  const txHash = await walletCall('eth_sendTransaction', [{
    from:  toAddress,
    to:    addr,
    data,
    value: valueWei ? toHex(valueWei) : undefined,
  }])
  return { txHash, tokenId: tokenId.toString() }
}

export async function listForSale({ tokenId, priceWei, fromAddress }) {
  const addr = ACTIVE_CHAIN.contractAddress
  if (!addr) throw new Error('Contract not deployed on ' + ACTIVE_CHAIN.name)

  const data   = encodeCall('listForSale(uint256,uint256)', BigInt(tokenId), BigInt(priceWei))
  const txHash = await walletCall('eth_sendTransaction', [{
    from: fromAddress,
    to:   addr,
    data,
  }])
  return { txHash }
}

export async function unlistTile({ tokenId, fromAddress }) {
  const addr = ACTIVE_CHAIN.contractAddress
  if (!addr) throw new Error('Contract not deployed on ' + ACTIVE_CHAIN.name)

  const data   = encodeCall('unlist(uint256)', BigInt(tokenId))
  const txHash = await walletCall('eth_sendTransaction', [{
    from: fromAddress,
    to:   addr,
    data,
  }])
  return { txHash }
}

export async function buyTile({ tokenId, priceWei, fromAddress }) {
  const addr = ACTIVE_CHAIN.contractAddress
  if (!addr) throw new Error('Contract not deployed on ' + ACTIVE_CHAIN.name)

  const data   = encodeCall('buy(uint256)', BigInt(tokenId))
  const txHash = await walletCall('eth_sendTransaction', [{
    from:  fromAddress,
    to:    addr,
    data,
    value: toHex(BigInt(priceWei)),
  }])
  return { txHash }
}

// ── Wallet connection ─────────────────────────────────────────────────────────

export async function connect() {
  const address = await requestAccounts()
  if (!address) throw new Error('Wallet connection rejected')

  const chainIdHex = await walletCall('eth_chainId')
  const chainId    = hexToNum(chainIdHex)
  const chain      = chainById(chainId)

  // Auto-switch to active chain if on wrong network
  if (chainId !== ACTIVE_CHAIN.id) {
    try { await switchChain(ACTIVE_CHAIN) } catch { /* user can dismiss */ }
  }

  return { address: padAddr(address), chainId, chainName: chain?.name ?? `Chain ${chainId}` }
}

export function disconnect() {
  // EIP-1193 has no disconnect — we just clear local state
  // Some wallets (Coinbase) support wallet_revokePermissions
  try {
    getProvider()?.request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] })
  } catch { /* optional method */ }
}

export function getAddress() {
  // Synchronous — returns cached value from store, not wallet
  return null // Store is authoritative; see walletStore.js
}

export function getChainId() {
  return ACTIVE_CHAIN.id
}

// ── Signing (SIWE auth + purchase proof) ──────────────────────────────────────

/**
 * personal_sign an arbitrary message with the connected account. Used for the
 * SIWE-style wallet auth nonce challenge the backend now requires.
 */
export async function signMessage(message, address) {
  const provider = getProvider()
  if (!provider) throw new Error('No wallet provider')
  const from = address ?? await requestAccounts()
  const signature = await provider.request({
    method: 'personal_sign',
    params: [message, from],
  })
  return { signature, address: padAddr(from) }
}

export async function signPurchase({ tileKey, price, address }) {
  const message = `CryptoLand purchase — tile ${tileKey} for $${price}`
  const { signature } = await signMessage(message, address)
  return { signature, message }
}

// ── Event listeners ───────────────────────────────────────────────────────────

export function onAccountsChanged(cb) {
  getProvider()?.on('accountsChanged', accounts => cb(accounts[0] ?? null))
}

export function onChainChanged(cb) {
  getProvider()?.on('chainChanged', chainIdHex => cb(hexToNum(chainIdHex)))
}

export function onDisconnect(cb) {
  getProvider()?.on('disconnect', cb)
}

export function removeListeners() {
  const p = getProvider()
  if (!p) return
  p.removeAllListeners?.('accountsChanged')
  p.removeAllListeners?.('chainChanged')
  p.removeAllListeners?.('disconnect')
}

// ── Wallet detection ──────────────────────────────────────────────────────────

export function detectWallets() {
  const p = getProvider()
  if (!p) return []
  const wallets = []
  if (p.isMetaMask)      wallets.push({ id: 'metamask',  name: 'MetaMask',      icon: '🦊' })
  if (p.isCoinbaseWallet) wallets.push({ id: 'coinbase', name: 'Coinbase',       icon: '🔵' })
  if (p.isRabby)         wallets.push({ id: 'rabby',     name: 'Rabby',          icon: '🐰' })
  if (p.isTrust)         wallets.push({ id: 'trust',     name: 'Trust Wallet',   icon: '🛡' })
  if (wallets.length === 0 && p) wallets.push({ id: 'injected', name: 'Browser Wallet', icon: '🌐' })
  return wallets
}

export const ADAPTER_TYPE = 'evm'
