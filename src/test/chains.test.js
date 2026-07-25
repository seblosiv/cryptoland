// @vitest-environment node
/**
 * Chain config + adapter contract tests — CryptoLand
 * ===================================================
 * CryptoLand deploys as N chain-native builds from one codebase. Two classes of
 * bug are easy to introduce and invisible until a specific chain's build runs:
 *
 *   1. A chain entry missing a field (breaks that build only).
 *   2. An adapter missing an export that index.js destructures — the import
 *      silently yields `undefined` and blows up at call time, on that chain only.
 *      (This actually happened: adapters/solana.js was missing getAddress,
 *      switchChain, tileTokenId and tokenIdToTile.)
 *
 * These tests assert both contracts across EVERY chain and EVERY adapter, so a
 * new chain cannot be half-added.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { CHAINS, CHAIN_CANONICAL_NAMES, MAINNET_CHAINS, CHAIN_FAMILIES, chainById } from '../lib/blockchain/config.js'

const ADAPTER_DIR = join(process.cwd(), 'src/lib/blockchain/adapters')

/** The interface index.js destructures from every adapter. */
const REQUIRED_ADAPTER_EXPORTS = [
  'connect', 'disconnect', 'getAddress', 'getChainId', 'switchChain',
  'signMessage', 'signPurchase',
  'mintTile', 'listForSale', 'unlistTile', 'buyTile',
  'ownerOf', 'getTileData', 'getOwnedTokenIds', 'totalSupply', 'waitForTx',
  'onAccountsChanged', 'onChainChanged', 'onDisconnect', 'removeListeners',
  'detectWallets', 'tileTokenId', 'tokenIdToTile', 'ADAPTER_TYPE',
]

/** Parse the top-level export names out of an adapter source file. */
function exportedNames(src) {
  const names = new Set()
  for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/g)) names.add(m[1])
  for (const m of src.matchAll(/export\s+const\s+([A-Za-z0-9_]+)/g)) names.add(m[1])
  for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim()
      if (name) names.add(name)
    }
  }
  return names
}

describe('chain config', () => {
  it('defines at least the chains we ship builds for', () => {
    expect(Object.keys(CHAINS).length).toBeGreaterThanOrEqual(20)
  })

  it.each(Object.entries(CHAINS))('%s has every required field', (key, chain) => {
    expect(chain.id, `${key}.id`).toBeDefined()
    expect(chain.name, `${key}.name`).toBeTruthy()
    expect(chain.family, `${key}.family`).toBeTruthy()
    expect(chain.rpcUrl, `${key}.rpcUrl`).toMatch(/^https?:\/\//)
    expect(chain.explorerUrl, `${key}.explorerUrl`).toMatch(/^https?:\/\//)
    expect(chain.explorerTxPath, `${key}.explorerTxPath`).toMatch(/^\//)
    expect(chain.nativeCurrency?.symbol, `${key}.nativeCurrency.symbol`).toBeTruthy()
    expect(typeof chain.nativeCurrency?.decimals, `${key}.decimals`).toBe('number')
    expect(typeof chain.blockTime, `${key}.blockTime`).toBe('number')
    expect(typeof chain.confirmations, `${key}.confirmations`).toBe('number')
    expect(chain.color, `${key}.color`).toMatch(/^#[0-9a-f]{6}$/i)
    expect(chain.logo, `${key}.logo`).toBeTruthy()
  })

  it('gives every EVM chain a unique numeric chainId', () => {
    const evm = Object.values(CHAINS).filter(c => c.family === 'evm')
    for (const c of evm) {
      expect(typeof c.id, `${c.key}.id must be numeric on EVM`).toBe('number')
    }
    const ids = evm.map(c => c.id)
    expect(new Set(ids).size, 'duplicate EVM chainIds').toBe(ids.length)
  })

  it('maps canonical names as identity and resolves chainById', () => {
    for (const key of Object.keys(CHAINS)) {
      expect(CHAIN_CANONICAL_NAMES[key]).toBe(key)
    }
    const some = CHAINS.polygon
    expect(chainById(some.id)?.key).toBe('polygon')
  })

  it('separates mainnet from testnet chains', () => {
    expect(MAINNET_CHAINS.length).toBeGreaterThan(0)
    expect(MAINNET_CHAINS.every(c => !c.testnet)).toBe(true)
  })
})

describe('adapter contract', () => {
  const adapterFiles = readdirSync(ADAPTER_DIR).filter(f => f.endsWith('.js') && !f.startsWith('_'))

  it('ships an adapter for every chain family in the config', () => {
    const haveAdapter = new Set(adapterFiles.map(f => f.replace(/\.js$/, '')))
    for (const family of CHAIN_FAMILIES) {
      expect(haveAdapter.has(family), `no adapters/${family}.js for family "${family}"`).toBe(true)
    }
  })

  it.each(adapterFiles)('%s exports the full adapter interface', (file) => {
    const src = readFileSync(join(ADAPTER_DIR, file), 'utf8')
    const names = exportedNames(src)
    const missing = REQUIRED_ADAPTER_EXPORTS.filter(n => !names.has(n))
    expect(missing, `${file} is missing exports`).toEqual([])
  })
})

describe('tokenId encoding', () => {
  // Every adapter must agree with the Solidity contract's (tx << 15) | ty so a
  // tile maps to the same NFT id on every chain.
  const pack = (tx, ty) => (BigInt(tx) << 15n) | BigInt(ty)

  it('matches the contract scheme and round-trips', async () => {
    const evm = await import('../lib/blockchain/adapters/evm.js')
    const shared = await import('../lib/blockchain/adapters/_shared.js')
    for (const [tx, ty] of [[0, 0], [100, 200], [7777, 1234], [16383, 16383]]) {
      const expected = pack(tx, ty)
      expect(evm.tileTokenId(tx, ty)).toBe(expected)
      expect(shared.tileTokenId(tx, ty)).toBe(expected)
      expect(shared.tokenIdToTile(expected)).toEqual({ tx, ty })
      expect(evm.tokenIdToTile(expected)).toEqual({ tx, ty })
    }
  })
})
