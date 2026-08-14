/**
 * Shared adapter helpers — CryptoLand
 * ====================================
 * Chain-agnostic pieces every non-EVM adapter reuses so the tile↔tokenId
 * mapping and the "mint is stubbed until a contract is deployed" behaviour are
 * defined once, not copy-pasted per chain.
 */

import { ACTIVE_CHAIN } from '../config.js'

// Grid is 16384 × 16384 (Z14). tokenId packs the coords as (tx << 15) | ty —
// the SAME scheme as evm.js and the Solidity contract (CryptoLandTile.sol), so
// a tile maps to the identical NFT id on every chain family. ty occupies the
// low 15 bits (0x7FFF); tx sits above it.
export const COORD_SHIFT = 15n
export const COORD_MASK   = 0x7FFFn

export function tileTokenId(tx, ty) {
  return (BigInt(tx) << COORD_SHIFT) | BigInt(ty)
}

export function tokenIdToTile(tokenId) {
  const id = BigInt(tokenId)
  return { tx: Number(id >> COORD_SHIFT), ty: Number(id & COORD_MASK) }
}

/**
 * Whether this build has a deployed contract to mint against. Until the address
 * is set (via VITE_CONTRACT_<CHAIN>), purchases still work — ownership is the
 * DB record — but the on-chain mint is skipped rather than throwing.
 */
export function hasContract() {
  return Boolean(ACTIVE_CHAIN.contractAddress)
}

/**
 * For a family whose native-payment path is not implemented yet.
 *
 * Every adapter must export `payNative` — src/test/chains.test.js enforces the
 * interface, and a missing export destructures to `undefined` in index.js and
 * only explodes at call time, on that one chain's build. Exporting this instead
 * keeps the interface whole and fails loudly and legibly if it is ever reached.
 * The UI asks `supportsNativePay()` first, so users see the off-chain rail
 * rather than an error.
 */
export function payNativeUnsupported(family) {
  return async () => {
    throw new Error(
      `Native wallet payment is not implemented for ${family} yet. ` +
      `Use the off-chain payment option on this chain.`,
    )
  }
}

/**
 * Uniform "mint not live yet" result. Adapters return this from mintTile() when
 * no contract is deployed, so the purchase flow completes cleanly and the NFT
 * layer activates automatically the moment you set the contract address.
 */
export function mintStub(reason = 'contract not deployed') {
  return { txHash: null, tokenId: null, minted: false, reason }
}
