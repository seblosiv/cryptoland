/**
 * addr.js — one chain-aware way to display an owner address.
 * ==========================================================
 * This build ships to 29 mainnet chains and the `owner` column holds whatever
 * that chain's addresses look like. They are wildly different lengths:
 *
 *   evm         0x + 40 hex                                        42
 *   ton         EQ… base64url                                      48
 *   aptos/sui   0x + 64 hex                                        66
 *   starknet    0x + 64 hex                                        66
 *   solana      base58                                             43–44
 *   cardano     addr1q… bech32                                     58
 *   algorand    base32, no prefix                                  58
 *   stellar     G… base32                                          56
 *   multiversx  erd1… bech32                                       62
 *   radix       account_rdx12… bech32                              65
 *   tezos       tz1… base58                                        36
 *   near        alice.near — a HUMAN NAME, not a hash              6–64
 *
 * Two failure modes this exists to prevent:
 *
 *   1. Overflow. A 65-char unbroken string has no break opportunity, so its
 *      min-content width is the whole string and a flex child will refuse to
 *      shrink below it — `text-overflow: ellipsis` alone does nothing and the
 *      address pushes straight out of its container. Truncate the *string*.
 *   2. Destroying a NEAR/ENS name. `zephyr1234.near` is 15 chars — a blind
 *      "longer than 12 ⇒ chop the middle" rule turns a readable identity into
 *      `zephyr…near`. Names are returned whole.
 *
 * The head length adapts to the chain's own prefix so the result still reads as
 * that chain's address (`addr1qxyz…k4m2`, `account_rdx12…9wqz`, `erd1a9f2…7xkd`).
 * EVM keeps exactly the pre-existing `0x1234…abcd` shape, so nothing regresses.
 */

// Longest first — 'addr_test' must win over 'addr1', 'account_rdx' over '0x'.
const PREFIXES = [
  'account_rdx', 'account_tdx',
  'addr_test', 'addr1', 'stake1',
  'erd1', 'KT1', 'tz1', 'tz2', 'tz3',
  'EQ', 'UQ', '0x',
]

// alice.near / whale.eth / shop.tez — an on-chain human-readable name.
const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,30}(\.[a-z0-9][a-z0-9_-]{0,30})+$/i

function prefixOf(a) {
  for (const p of PREFIXES) if (a.startsWith(p)) return p
  return ''
}

/**
 * Shorten an address for display.
 *
 * @param {string} addr           the raw owner / wallet / seller value
 * @param {object} [opts]
 * @param {number} [opts.tail=4]  characters kept from the end
 * @param {number} [opts.head]    override the auto-derived head length
 * @param {number} [opts.maxName=24] names longer than this get a trailing ellipsis
 * @returns {string} '' for empty input — never undefined, never the raw long string
 */
export function shortAddr(addr, { tail = 4, head, maxName = 24 } = {}) {
  if (!addr) return ''
  const a = String(addr).trim()
  if (!a) return ''

  // Human-readable names are the identity. Never chop the middle out of one.
  if (NAME_RE.test(a)) return a.length <= maxName ? a : a.slice(0, maxName - 1) + '…'

  // Keep the chain's prefix plus enough entropy to tell two addresses apart.
  const h = head ?? Math.min(13, Math.max(6, prefixOf(a).length + 4))
  if (a.length <= h + tail + 1) return a
  return a.slice(0, h) + '…' + a.slice(-tail)
}

/**
 * Tighter variant for very small surfaces (map sprites, ticker chips) where
 * even `addr1qxyz…k4m2` is too wide. Head only, no tail.
 */
export function tinyAddr(addr, max = 10, maxName = max + 4) {
  if (!addr) return ''
  const a = String(addr).trim()
  if (NAME_RE.test(a)) return a.length <= maxName ? a : a.slice(0, maxName - 1) + '…'
  return a.length <= max ? a : a.slice(0, max - 1) + '…'
}
