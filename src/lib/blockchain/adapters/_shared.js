/**
 * Shared adapter helpers — CryptoLand
 * ====================================
 * Chain-agnostic pieces every non-EVM adapter reuses so the tile↔tokenId
 * mapping and the "mint is stubbed until a contract is deployed" behaviour are
 * defined once, not copy-pasted per chain.
 */

import { ACTIVE_CHAIN } from '../config.js'

// Grid is 16384 × 16384 (Z14). A tile's canonical token id is tx * GRID + ty,
// which is stable, collision-free, and identical across every chain family so a
// tile means the same NFT id whether it's minted on Sui, TON, or Aptos.
export const GRID = 16384

export function tileTokenId(tx, ty) {
  return BigInt(tx) * BigInt(GRID) + BigInt(ty)
}

export function tokenIdToTile(tokenId) {
  const id = BigInt(tokenId)
  const g  = BigInt(GRID)
  return { tx: Number(id / g), ty: Number(id % g) }
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
 * Uniform "mint not live yet" result. Adapters return this from mintTile() when
 * no contract is deployed, so the purchase flow completes cleanly and the NFT
 * layer activates automatically the moment you set the contract address.
 */
export function mintStub(reason = 'contract not deployed') {
  return { txHash: null, tokenId: null, minted: false, reason }
}
