/**
 * Chain logomarks — CryptoLand
 * =============================
 * One SVG component per chain, resolved by chain key. Marks are inlined as
 * source (no network request, no image asset to 404, nothing to cache-bust).
 *
 * Conventions every logo file follows:
 *   - default export is a React component taking { size = 28, className, style }
 *   - **monochrome**: every fill/stroke is `currentColor`. There are no colour
 *     literals and no gradients anywhere in this directory. `ChainMark` in
 *     ChainOnboarding.jsx sets `color` to the chain accent, which is what tints
 *     each mark per deployment.
 *   - each file keeps the viewBox of its SOURCE artwork (24×24, 1503×1504, …)
 *     rather than being rescaled — `size` drives width/height, so they still
 *     align optically. Do not assume a shared viewBox.
 *   - overlapping shapes are separated by `opacity` on currentColor, never hue
 *   - no <image>, no external <use>, no fonts, no filters — pure paths/shapes
 *
 * Monochrome is deliberate: it makes 29 chain builds read as one design system,
 * lets every mark inherit that chain's accent for free, and avoids 28 clashing
 * brand palettes on the solid-dark UI.
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
  // Moonbeam's testnet is named after Moonbase, not Moonbeam, so the
  // suffix-strip in logoFor() yields 'moonbase' and misses. Alias it explicitly.
  'moonbase-alpha': moonbeam,
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

// The parent brand. Not in CHAIN_LOGOS and never returned by logoFor() — XONO
// is the company, the chain marks are its children. Import it directly:
//   import { XonoWordmark, XonoGlyph } from './logos'
export { XonoWordmark, XonoGlyph } from './_xono.jsx'
