/**
 * Chain logomarks — CryptoLand
 * =============================
 * One SVG component per chain, resolved by chain key. Every mark is authored
 * inline (no network requests, no image assets to 404) and drawn on a 32×32
 * viewBox so they optically align at any size.
 *
 * Conventions every logo file follows:
 *   - default export is a React component taking { size = 28, className, style }
 *   - viewBox="0 0 32 32"
 *   - uses the chain's own brand colour(s); marks that read as a silhouette use
 *     `currentColor` so they inherit the accent
 *   - no <image>, no external <use>, no fonts — pure paths/shapes
 *
 * These are simplified geometric interpretations of each ecosystem's mark, used
 * to signal "this build is native to your chain" on that chain's own
 * deployment. Swap in an official asset any time by editing the one file.
 */

import polygon    from './polygon.jsx'
import avalanche  from './avalanche.jsx'
import base       from './base.jsx'
import ethereum   from './ethereum.jsx'
import arbitrum   from './arbitrum.jsx'
import ronin      from './ronin.jsx'
import bnb        from './bnb.jsx'
import optimism   from './optimism.jsx'
import scroll     from './scroll.jsx'
import celo       from './celo.jsx'
import moonbeam   from './moonbeam.jsx'
import beam       from './beam.jsx'
import oasys      from './oasys.jsx'
import skale      from './skale.jsx'
import hedera     from './hedera.jsx'
import injective  from './injective.jsx'
import solana     from './solana.jsx'
import ton        from './ton.jsx'
import aptos      from './aptos.jsx'
import sui        from './sui.jsx'
import starknet   from './starknet.jsx'
import cardano    from './cardano.jsx'
import near       from './near.jsx'
import stellar    from './stellar.jsx'
import algorand   from './algorand.jsx'
import multiversx from './multiversx.jsx'
import radix      from './radix.jsx'
import tezos      from './tezos.jsx'

/** chain key → logo component. Testnets fall back to their mainnet mark. */
export const CHAIN_LOGOS = {
  polygon, avalanche, base, ethereum, arbitrum, ronin, bnb, optimism, scroll,
  celo, moonbeam, beam, oasys, skale, hedera, injective,
  solana, ton, aptos, sui, starknet, cardano, near, stellar, algorand,
  multiversx, radix, tezos,
  // Aliases for the extra hub / testnet keys that share a mark.
  'skale-europa': skale,
}

/**
 * Resolve a logo for any chain key, including testnets (`base-sepolia` →
 * `base`). Returns null when we have no mark, so callers can fall back to the
 * emoji in ACTIVE_CHAIN.logo.
 */
export function logoFor(chainKey) {
  if (!chainKey) return null
  if (CHAIN_LOGOS[chainKey]) return CHAIN_LOGOS[chainKey]
  // Strip a testnet suffix: 'polygon-amoy' → 'polygon', 'near-testnet' → 'near'
  const base_ = chainKey.split('-')[0]
  return CHAIN_LOGOS[base_] ?? null
}
