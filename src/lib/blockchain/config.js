/**
 * Blockchain Configuration — CryptoLand
 * =======================================
 * Single source of truth for all chain-specific parameters.
 *
 * CryptoLand ships as ONE codebase deployed as N chain-native builds. The
 * active chain is chosen at build time via VITE_CHAIN; each per-chain
 * deployment fills in that chain's contract addresses. See env/ for templates
 * and documentation/multichain.md for the full model.
 *
 * Per-chain env vars (KEY = the chain key upper-cased, '-' → '_'):
 *   VITE_CONTRACT_<KEY>      NFT contract / module / package address
 *   VITE_MARKETPLACE_<KEY>   marketplace contract address
 *   VITE_TOKEN_<KEY>         ERC-20 / token address
 *   VITE_RPC_<KEY>           override the default public RPC (e.g. a paid
 *                            Alchemy/QuickNode endpoint) with no code change
 */

/**
 * Build a chain entry, deriving the env-var names from the chain key and
 * applying sensible defaults. Vite injects the whole import.meta.env object at
 * build time, so the dynamic lookups below are statically resolved per build.
 * `||` (not `??`) so an empty env value falls back rather than becoming ''.
 */
function defineChain(key, cfg) {
  const K = key.toUpperCase().replace(/-/g, '_')
  const env = import.meta.env
  return {
    key,
    id:                 cfg.id,
    name:               cfg.name,
    shortName:          cfg.shortName,
    family:             cfg.family,
    // A paid/private RPC can be injected per deployment without touching code.
    rpcUrl:             env[`VITE_RPC_${K}`] || cfg.rpcUrl,
    rpcUrlFallback:     cfg.rpcUrlFallback ?? cfg.rpcUrl,
    explorerUrl:        cfg.explorerUrl,
    explorerTxPath:     cfg.explorerTxPath  ?? '/tx/',
    explorerNFTPath:    cfg.explorerNFTPath ?? '/token/',
    nativeCurrency:     cfg.nativeCurrency,
    contractAddress:    env[`VITE_CONTRACT_${K}`]    || null,
    marketplaceAddress: env[`VITE_MARKETPLACE_${K}`] || null,
    tokenAddress:       env[`VITE_TOKEN_${K}`]       || null,
    blockTime:          cfg.blockTime,
    confirmations:      cfg.confirmations ?? 3,
    color:              cfg.color,
    logo:               cfg.logo,
    testnet:            cfg.testnet ?? false,
    // Which grant program(s) this chain is targeted at — used by docs//grants.md
    // and the "supported chains" UI. Purely informational.
    grant:              cfg.grant ?? null,
    // True when the chain sponsors gas for users (funders reward gasless UX).
    gasless:            cfg.gasless ?? false,
  }
}

const CHAIN_DEFS = {
  // ══ EVM chains ════════════════════════════════════════════════════════════
  // One adapter (adapters/evm.js) serves every entry in this section.

  polygon: {
    id: 137, name: 'Polygon', shortName: 'MATIC', family: 'evm',
    rpcUrl: 'https://polygon-rpc.com', rpcUrlFallback: 'https://rpc.ankr.com/polygon',
    explorerUrl: 'https://polygonscan.com',
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    blockTime: 2, confirmations: 3, color: '#8247e5', logo: '⬡',
    grant: 'Polygon Community Grants S2 (35M POL)',
  },
  'polygon-amoy': {
    id: 80002, name: 'Polygon Amoy', shortName: 'MATIC', family: 'evm',
    rpcUrl: 'https://rpc-amoy.polygon.technology', rpcUrlFallback: 'https://polygon-amoy.drpc.org',
    explorerUrl: 'https://amoy.polygonscan.com',
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    blockTime: 2, confirmations: 2, color: '#8247e5', logo: '⬡', testnet: true,
  },

  avalanche: {
    id: 43114, name: 'Avalanche', shortName: 'AVAX', family: 'evm',
    rpcUrl: 'https://api.avax.network/ext/bc/C/rpc', rpcUrlFallback: 'https://rpc.ankr.com/avalanche',
    explorerUrl: 'https://snowtrace.io',
    nativeCurrency: { name: 'Avalanche', symbol: 'AVAX', decimals: 18 },
    blockTime: 2, confirmations: 3, color: '#e84142', logo: '🔺',
    grant: 'Avalanche Retro9000 / Codebase',
  },
  'avalanche-fuji': {
    id: 43113, name: 'Avalanche Fuji', shortName: 'AVAX', family: 'evm',
    rpcUrl: 'https://api.avax-test.network/ext/bc/C/rpc', rpcUrlFallback: 'https://rpc.ankr.com/avalanche_fuji',
    explorerUrl: 'https://testnet.snowtrace.io',
    nativeCurrency: { name: 'Avalanche', symbol: 'AVAX', decimals: 18 },
    blockTime: 2, confirmations: 2, color: '#e84142', logo: '🔺', testnet: true,
  },

  base: {
    id: 8453, name: 'Base', shortName: 'ETH', family: 'evm',
    rpcUrl: 'https://mainnet.base.org', rpcUrlFallback: 'https://rpc.ankr.com/base',
    explorerUrl: 'https://basescan.org',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    blockTime: 2, confirmations: 3, color: '#0052ff', logo: '🔵',
    grant: 'Base Builder Grants / Base Ecosystem Fund',
  },
  'base-sepolia': {
    id: 84532, name: 'Base Sepolia', shortName: 'ETH', family: 'evm',
    rpcUrl: 'https://sepolia.base.org', rpcUrlFallback: 'https://base-sepolia.drpc.org',
    explorerUrl: 'https://sepolia.basescan.org',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    blockTime: 2, confirmations: 2, color: '#0052ff', logo: '🔵', testnet: true,
  },

  ethereum: {
    id: 1, name: 'Ethereum', shortName: 'ETH', family: 'evm',
    rpcUrl: 'https://eth.llamarpc.com', rpcUrlFallback: 'https://rpc.ankr.com/eth',
    explorerUrl: 'https://etherscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    blockTime: 12, confirmations: 12, color: '#627eea', logo: '⟠',
  },

  arbitrum: {
    id: 42161, name: 'Arbitrum One', shortName: 'ARB', family: 'evm',
    rpcUrl: 'https://arb1.arbitrum.io/rpc', rpcUrlFallback: 'https://rpc.ankr.com/arbitrum',
    explorerUrl: 'https://arbiscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    blockTime: 0.25, confirmations: 5, color: '#28a0f0', logo: '🔹',
    grant: 'Arbitrum Gaming Catalyst Program (GCP)',
  },
  'arbitrum-sepolia': {
    id: 421614, name: 'Arbitrum Sepolia', shortName: 'ARB', family: 'evm',
    rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc', rpcUrlFallback: 'https://arbitrum-sepolia.drpc.org',
    explorerUrl: 'https://sepolia.arbiscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    blockTime: 0.25, confirmations: 2, color: '#28a0f0', logo: '🔹', testnet: true,
  },

  ronin: {
    id: 2020, name: 'Ronin', shortName: 'RON', family: 'evm',
    rpcUrl: 'https://api.roninchain.com/rpc', rpcUrlFallback: 'https://ronin.lgns.net/rpc',
    explorerUrl: 'https://app.roninchain.com',
    nativeCurrency: { name: 'Ronin', symbol: 'RON', decimals: 18 },
    blockTime: 3, confirmations: 5, color: '#1273ea', logo: '⚔️',
    grant: 'Ronin Ecosystem Grants / Forge ($10M)',
  },
  'ronin-saigon': {
    id: 2021, name: 'Ronin Saigon', shortName: 'RON', family: 'evm',
    rpcUrl: 'https://saigon-testnet.roninchain.com/rpc',
    explorerUrl: 'https://saigon-app.roninchain.com',
    nativeCurrency: { name: 'Ronin', symbol: 'RON', decimals: 18 },
    blockTime: 3, confirmations: 2, color: '#1273ea', logo: '⚔️', testnet: true,
  },

  bnb: {
    id: 56, name: 'BNB Smart Chain', shortName: 'BNB', family: 'evm',
    rpcUrl: 'https://bsc-dataseed.binance.org', rpcUrlFallback: 'https://rpc.ankr.com/bsc',
    explorerUrl: 'https://bscscan.com',
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    blockTime: 3, confirmations: 6, color: '#f0b90b', logo: '🟡',
    grant: 'BNB Chain MVB Accelerator (S10)',
  },
  'bnb-testnet': {
    id: 97, name: 'BNB Testnet', shortName: 'BNB', family: 'evm',
    rpcUrl: 'https://data-seed-prebsc-1-s1.binance.org:8545', rpcUrlFallback: 'https://bsc-testnet.drpc.org',
    explorerUrl: 'https://testnet.bscscan.com',
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    blockTime: 3, confirmations: 2, color: '#f0b90b', logo: '🟡', testnet: true,
  },

  // ══ Non-EVM chains ════════════════════════════════════════════════════════

  solana: {
    id: 'mainnet-beta', name: 'Solana', shortName: 'SOL', family: 'solana',
    rpcUrl: 'https://api.mainnet-beta.solana.com', rpcUrlFallback: 'https://solana-mainnet.rpc.extrnode.com',
    explorerUrl: 'https://solscan.io',
    nativeCurrency: { name: 'Solana', symbol: 'SOL', decimals: 9 },
    blockTime: 0.4, confirmations: 32, color: '#9945ff', logo: '◎',
    grant: 'Solana Foundation Grants / Superteam / Solana Mobile',
  },
  'solana-devnet': {
    id: 'devnet', name: 'Solana Devnet', shortName: 'SOL', family: 'solana',
    rpcUrl: 'https://api.devnet.solana.com',
    explorerUrl: 'https://explorer.solana.com', explorerNFTPath: '/address/',
    nativeCurrency: { name: 'Solana', symbol: 'SOL', decimals: 9 },
    blockTime: 0.4, confirmations: 32, color: '#9945ff', logo: '◎', testnet: true,
  },

  ton: {
    id: 'ton-mainnet', name: 'TON', shortName: 'TON', family: 'ton',
    rpcUrl: 'https://toncenter.com/api/v2/jsonRPC', rpcUrlFallback: 'https://ton.access.orbs.network/mainnet',
    explorerUrl: 'https://tonviewer.com', explorerTxPath: '/transaction/', explorerNFTPath: '/',
    nativeCurrency: { name: 'Toncoin', symbol: 'TON', decimals: 9 },
    blockTime: 5, confirmations: 1, color: '#0098ea', logo: '💎',
    grant: 'TON Mini App / Open League grants',
  },
  'ton-testnet': {
    id: 'ton-testnet', name: 'TON Testnet', shortName: 'TON', family: 'ton',
    rpcUrl: 'https://testnet.toncenter.com/api/v2/jsonRPC',
    explorerUrl: 'https://testnet.tonviewer.com', explorerTxPath: '/transaction/', explorerNFTPath: '/',
    nativeCurrency: { name: 'Toncoin', symbol: 'TON', decimals: 9 },
    blockTime: 5, confirmations: 1, color: '#0098ea', logo: '💎', testnet: true,
  },

  aptos: {
    id: 'aptos-mainnet', name: 'Aptos', shortName: 'APT', family: 'aptos',
    rpcUrl: 'https://fullnode.mainnet.aptoslabs.com/v1', rpcUrlFallback: 'https://aptos-mainnet.pontem.network/v1',
    explorerUrl: 'https://explorer.aptoslabs.com', explorerTxPath: '/txn/',
    nativeCurrency: { name: 'Aptos', symbol: 'APT', decimals: 8 },
    blockTime: 0.5, confirmations: 1, color: '#06f7c9', logo: '🅰️',
    grant: 'Aptos Foundation Ecosystem Grants',
  },
  'aptos-testnet': {
    id: 'aptos-testnet', name: 'Aptos Testnet', shortName: 'APT', family: 'aptos',
    rpcUrl: 'https://fullnode.testnet.aptoslabs.com/v1',
    explorerUrl: 'https://explorer.aptoslabs.com', explorerTxPath: '/txn/',
    nativeCurrency: { name: 'Aptos', symbol: 'APT', decimals: 8 },
    blockTime: 0.5, confirmations: 1, color: '#06f7c9', logo: '🅰️', testnet: true,
  },

  sui: {
    id: 'sui-mainnet', name: 'Sui', shortName: 'SUI', family: 'sui',
    rpcUrl: 'https://fullnode.mainnet.sui.io', rpcUrlFallback: 'https://sui-mainnet.public.blastapi.io',
    explorerUrl: 'https://suiscan.xyz/mainnet', explorerNFTPath: '/object/',
    nativeCurrency: { name: 'Sui', symbol: 'SUI', decimals: 9 },
    blockTime: 0.5, confirmations: 1, color: '#4da2ff', logo: '🌊',
    grant: 'Sui Foundation Grants / RFP',
  },
  'sui-testnet': {
    id: 'sui-testnet', name: 'Sui Testnet', shortName: 'SUI', family: 'sui',
    rpcUrl: 'https://fullnode.testnet.sui.io', rpcUrlFallback: 'https://sui-testnet.public.blastapi.io',
    explorerUrl: 'https://suiscan.xyz/testnet', explorerNFTPath: '/object/',
    nativeCurrency: { name: 'Sui', symbol: 'SUI', decimals: 9 },
    blockTime: 0.5, confirmations: 1, color: '#4da2ff', logo: '🌊', testnet: true,
  },
}

export const CHAINS = Object.fromEntries(
  Object.entries(CHAIN_DEFS).map(([key, cfg]) => [key, defineChain(key, cfg)])
)

// Active chain — set VITE_CHAIN in .env to select which chain THIS build
// targets. Unknown/unset falls back to the Polygon testnet so a misconfigured
// build still boots instead of crashing.
export const ACTIVE_CHAIN_KEY = (import.meta.env.VITE_CHAIN in CHAINS)
  ? import.meta.env.VITE_CHAIN
  : 'polygon-amoy'
export const ACTIVE_CHAIN = CHAINS[ACTIVE_CHAIN_KEY]

// Canonical chain name → DB string (stored in the `chain` column of a tile).
// Derived from the CHAINS keys so new chains need no second edit here.
export const CHAIN_CANONICAL_NAMES = Object.fromEntries(
  Object.keys(CHAINS).map(k => [k, k])
)

export const ACTIVE_CHAIN_CANONICAL = ACTIVE_CHAIN_KEY

// Family of the active build ('evm' | 'solana' | 'ton' | 'aptos' | 'sui' | ...).
export const ACTIVE_CHAIN_FAMILY = ACTIVE_CHAIN.family

// All mainnet chains, for any "supported chains" UI or grant landing page.
export const MAINNET_CHAINS = Object.values(CHAINS).filter(c => !c.testnet)

// Distinct adapter families in use — handy for docs/tests.
export const CHAIN_FAMILIES = [...new Set(Object.values(CHAINS).map(c => c.family))]

export function chainById(chainId) {
  return Object.values(CHAINS).find(c => c.id === chainId) ?? null
}

export function explorerTxUrl(txHash) {
  return `${ACTIVE_CHAIN.explorerUrl}${ACTIVE_CHAIN.explorerTxPath}${txHash}`
}

export function explorerNFTUrl(tokenId) {
  const addr = ACTIVE_CHAIN.contractAddress
  if (!addr) return null
  return `${ACTIVE_CHAIN.explorerUrl}${ACTIVE_CHAIN.explorerNFTPath}${addr}?a=${tokenId}`
}
