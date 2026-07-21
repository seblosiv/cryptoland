/**
 * Blockchain Configuration — CryptoLand
 * =======================================
 * Single source of truth for all chain-specific parameters.
 * To target a new chain: add an entry here and set VITE_CHAIN in .env.
 *
 * Active chain is selected by VITE_CHAIN env var at build time.
 * Default: 'polygon' (can be overridden per deployment).
 */

export const CHAINS = {
  // ── EVM chains ─────────────────────────────────────────────────────────────

  polygon: {
    id:              137,
    name:            'Polygon',
    shortName:       'MATIC',
    family:          'evm',
    rpcUrl:          'https://polygon-rpc.com',
    rpcUrlFallback:  'https://rpc.ankr.com/polygon',
    explorerUrl:     'https://polygonscan.com',
    explorerTxPath:  '/tx/',
    explorerNFTPath: '/token/',
    nativeCurrency:  { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    contractAddress: import.meta.env.VITE_CONTRACT_POLYGON ?? null,
    marketplaceAddress: import.meta.env.VITE_MARKETPLACE_POLYGON ?? null,
    tokenAddress:    import.meta.env.VITE_TOKEN_POLYGON ?? null,
    blockTime:       2,    // seconds
    confirmations:   3,
    color:           '#8247e5',
    logo:            '⬡',
  },

  'polygon-amoy': {
    id:              80002,
    name:            'Polygon Amoy',
    shortName:       'MATIC',
    family:          'evm',
    rpcUrl:          'https://rpc-amoy.polygon.technology',
    rpcUrlFallback:  'https://polygon-amoy.drpc.org',
    explorerUrl:     'https://amoy.polygonscan.com',
    explorerTxPath:  '/tx/',
    explorerNFTPath: '/token/',
    nativeCurrency:  { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    contractAddress: import.meta.env.VITE_CONTRACT_POLYGON_AMOY ?? null,
    marketplaceAddress: import.meta.env.VITE_MARKETPLACE_POLYGON_AMOY ?? null,
    tokenAddress:    import.meta.env.VITE_TOKEN_POLYGON_AMOY ?? null,
    blockTime:       2,
    confirmations:   2,
    color:           '#8247e5',
    logo:            '⬡',
    testnet:         true,
  },

  avalanche: {
    id:              43114,
    name:            'Avalanche',
    shortName:       'AVAX',
    family:          'evm',
    rpcUrl:          'https://api.avax.network/ext/bc/C/rpc',
    rpcUrlFallback:  'https://rpc.ankr.com/avalanche',
    explorerUrl:     'https://snowtrace.io',
    explorerTxPath:  '/tx/',
    explorerNFTPath: '/token/',
    nativeCurrency:  { name: 'Avalanche', symbol: 'AVAX', decimals: 18 },
    contractAddress: import.meta.env.VITE_CONTRACT_AVALANCHE ?? null,
    marketplaceAddress: import.meta.env.VITE_MARKETPLACE_AVALANCHE ?? null,
    tokenAddress:    import.meta.env.VITE_TOKEN_AVALANCHE ?? null,
    blockTime:       2,
    confirmations:   3,
    color:           '#e84142',
    logo:            '🔺',
  },

  'avalanche-fuji': {
    id:              43113,
    name:            'Avalanche Fuji',
    shortName:       'AVAX',
    family:          'evm',
    rpcUrl:          'https://api.avax-test.network/ext/bc/C/rpc',
    rpcUrlFallback:  'https://rpc.ankr.com/avalanche_fuji',
    explorerUrl:     'https://testnet.snowtrace.io',
    explorerTxPath:  '/tx/',
    explorerNFTPath: '/token/',
    nativeCurrency:  { name: 'Avalanche', symbol: 'AVAX', decimals: 18 },
    contractAddress: import.meta.env.VITE_CONTRACT_AVALANCHE_FUJI ?? null,
    marketplaceAddress: import.meta.env.VITE_MARKETPLACE_AVALANCHE_FUJI ?? null,
    tokenAddress:    import.meta.env.VITE_TOKEN_AVALANCHE_FUJI ?? null,
    blockTime:       2,
    confirmations:   2,
    color:           '#e84142',
    logo:            '🔺',
    testnet:         true,
  },

  base: {
    id:              8453,
    name:            'Base',
    shortName:       'ETH',
    family:          'evm',
    rpcUrl:          'https://mainnet.base.org',
    rpcUrlFallback:  'https://rpc.ankr.com/base',
    explorerUrl:     'https://basescan.org',
    explorerTxPath:  '/tx/',
    explorerNFTPath: '/token/',
    nativeCurrency:  { name: 'Ether', symbol: 'ETH', decimals: 18 },
    contractAddress: import.meta.env.VITE_CONTRACT_BASE ?? null,
    marketplaceAddress: import.meta.env.VITE_MARKETPLACE_BASE ?? null,
    tokenAddress:    import.meta.env.VITE_TOKEN_BASE ?? null,
    blockTime:       2,
    confirmations:   3,
    color:           '#0052ff',
    logo:            '🔵',
  },

  'base-sepolia': {
    id:              84532,
    name:            'Base Sepolia',
    shortName:       'ETH',
    family:          'evm',
    rpcUrl:          'https://sepolia.base.org',
    rpcUrlFallback:  'https://base-sepolia.drpc.org',
    explorerUrl:     'https://sepolia.basescan.org',
    explorerTxPath:  '/tx/',
    explorerNFTPath: '/token/',
    nativeCurrency:  { name: 'Ether', symbol: 'ETH', decimals: 18 },
    contractAddress: import.meta.env.VITE_CONTRACT_BASE_SEPOLIA ?? null,
    marketplaceAddress: import.meta.env.VITE_MARKETPLACE_BASE_SEPOLIA ?? null,
    tokenAddress:    import.meta.env.VITE_TOKEN_BASE_SEPOLIA ?? null,
    blockTime:       2,
    confirmations:   2,
    color:           '#0052ff',
    logo:            '🔵',
    testnet:         true,
  },

  ethereum: {
    id:              1,
    name:            'Ethereum',
    shortName:       'ETH',
    family:          'evm',
    rpcUrl:          'https://eth.llamarpc.com',
    rpcUrlFallback:  'https://rpc.ankr.com/eth',
    explorerUrl:     'https://etherscan.io',
    explorerTxPath:  '/tx/',
    explorerNFTPath: '/token/',
    nativeCurrency:  { name: 'Ether', symbol: 'ETH', decimals: 18 },
    contractAddress: import.meta.env.VITE_CONTRACT_ETHEREUM ?? null,
    marketplaceAddress: import.meta.env.VITE_MARKETPLACE_ETHEREUM ?? null,
    tokenAddress:    import.meta.env.VITE_TOKEN_ETHEREUM ?? null,
    blockTime:       12,
    confirmations:   12,
    color:           '#627eea',
    logo:            '⟠',
  },

  // ── Arbitrum (EVM) — Gaming Catalyst grant ────────────────────────────────

  arbitrum: {
    id:              42161,
    name:            'Arbitrum One',
    shortName:       'ARB',
    family:          'evm',
    rpcUrl:          'https://arb1.arbitrum.io/rpc',
    rpcUrlFallback:  'https://rpc.ankr.com/arbitrum',
    explorerUrl:     'https://arbiscan.io',
    explorerTxPath:  '/tx/',
    explorerNFTPath: '/token/',
    nativeCurrency:  { name: 'Ether', symbol: 'ETH', decimals: 18 },
    contractAddress: import.meta.env.VITE_CONTRACT_ARBITRUM ?? null,
    marketplaceAddress: import.meta.env.VITE_MARKETPLACE_ARBITRUM ?? null,
    tokenAddress:    import.meta.env.VITE_TOKEN_ARBITRUM ?? null,
    blockTime:       0.25,
    confirmations:   5,
    color:           '#28a0f0',
    logo:            '🔹',
  },

  'arbitrum-sepolia': {
    id:              421614,
    name:            'Arbitrum Sepolia',
    shortName:       'ARB',
    family:          'evm',
    rpcUrl:          'https://sepolia-rollup.arbitrum.io/rpc',
    rpcUrlFallback:  'https://arbitrum-sepolia.drpc.org',
    explorerUrl:     'https://sepolia.arbiscan.io',
    explorerTxPath:  '/tx/',
    explorerNFTPath: '/token/',
    nativeCurrency:  { name: 'Ether', symbol: 'ETH', decimals: 18 },
    contractAddress: import.meta.env.VITE_CONTRACT_ARBITRUM_SEPOLIA ?? null,
    marketplaceAddress: import.meta.env.VITE_MARKETPLACE_ARBITRUM_SEPOLIA ?? null,
    tokenAddress:    import.meta.env.VITE_TOKEN_ARBITRUM_SEPOLIA ?? null,
    blockTime:       0.25,
    confirmations:   2,
    color:           '#28a0f0',
    logo:            '🔹',
    testnet:         true,
  },

  // ── Ronin (EVM) — Forge grant ─────────────────────────────────────────────

  ronin: {
    id:              2020,
    name:            'Ronin',
    shortName:       'RON',
    family:          'evm',
    rpcUrl:          'https://api.roninchain.com/rpc',
    rpcUrlFallback:  'https://ronin.lgns.net/rpc',
    explorerUrl:     'https://app.roninchain.com',
    explorerTxPath:  '/tx/',
    explorerNFTPath: '/token/',
    nativeCurrency:  { name: 'Ronin', symbol: 'RON', decimals: 18 },
    contractAddress: import.meta.env.VITE_CONTRACT_RONIN ?? null,
    marketplaceAddress: import.meta.env.VITE_MARKETPLACE_RONIN ?? null,
    tokenAddress:    import.meta.env.VITE_TOKEN_RONIN ?? null,
    blockTime:       3,
    confirmations:   5,
    color:           '#1273ea',
    logo:            '⚔️',
  },

  'ronin-saigon': {
    id:              2021,
    name:            'Ronin Saigon',
    shortName:       'RON',
    family:          'evm',
    rpcUrl:          'https://saigon-testnet.roninchain.com/rpc',
    rpcUrlFallback:  'https://saigon-testnet.roninchain.com/rpc',
    explorerUrl:     'https://saigon-app.roninchain.com',
    explorerTxPath:  '/tx/',
    explorerNFTPath: '/token/',
    nativeCurrency:  { name: 'Ronin', symbol: 'RON', decimals: 18 },
    contractAddress: import.meta.env.VITE_CONTRACT_RONIN_SAIGON ?? null,
    marketplaceAddress: import.meta.env.VITE_MARKETPLACE_RONIN_SAIGON ?? null,
    tokenAddress:    import.meta.env.VITE_TOKEN_RONIN_SAIGON ?? null,
    blockTime:       3,
    confirmations:   2,
    color:           '#1273ea',
    logo:            '⚔️',
    testnet:         true,
  },

  // ── BNB Smart Chain (EVM) — MVB S10 grant ─────────────────────────────────

  bnb: {
    id:              56,
    name:            'BNB Smart Chain',
    shortName:       'BNB',
    family:          'evm',
    rpcUrl:          'https://bsc-dataseed.binance.org',
    rpcUrlFallback:  'https://rpc.ankr.com/bsc',
    explorerUrl:     'https://bscscan.com',
    explorerTxPath:  '/tx/',
    explorerNFTPath: '/token/',
    nativeCurrency:  { name: 'BNB', symbol: 'BNB', decimals: 18 },
    contractAddress: import.meta.env.VITE_CONTRACT_BNB ?? null,
    marketplaceAddress: import.meta.env.VITE_MARKETPLACE_BNB ?? null,
    tokenAddress:    import.meta.env.VITE_TOKEN_BNB ?? null,
    blockTime:       3,
    confirmations:   6,
    color:           '#f0b90b',
    logo:            '🟡',
  },

  'bnb-testnet': {
    id:              97,
    name:            'BNB Testnet',
    shortName:       'BNB',
    family:          'evm',
    rpcUrl:          'https://data-seed-prebsc-1-s1.binance.org:8545',
    rpcUrlFallback:  'https://bsc-testnet.drpc.org',
    explorerUrl:     'https://testnet.bscscan.com',
    explorerTxPath:  '/tx/',
    explorerNFTPath: '/token/',
    nativeCurrency:  { name: 'BNB', symbol: 'BNB', decimals: 18 },
    contractAddress: import.meta.env.VITE_CONTRACT_BNB_TESTNET ?? null,
    marketplaceAddress: import.meta.env.VITE_MARKETPLACE_BNB_TESTNET ?? null,
    tokenAddress:    import.meta.env.VITE_TOKEN_BNB_TESTNET ?? null,
    blockTime:       3,
    confirmations:   2,
    color:           '#f0b90b',
    logo:            '🟡',
    testnet:         true,
  },

  // ── Non-EVM chains ────────────────────────────────────────────────────────

  solana: {
    id:              'mainnet-beta',
    name:            'Solana',
    shortName:       'SOL',
    family:          'solana',
    rpcUrl:          'https://api.mainnet-beta.solana.com',
    rpcUrlFallback:  'https://solana-mainnet.rpc.extrnode.com',
    explorerUrl:     'https://solscan.io',
    explorerTxPath:  '/tx/',
    explorerNFTPath: '/token/',
    nativeCurrency:  { name: 'Solana', symbol: 'SOL', decimals: 9 },
    contractAddress: import.meta.env.VITE_CONTRACT_SOLANA ?? null,
    marketplaceAddress: import.meta.env.VITE_MARKETPLACE_SOLANA ?? null,
    tokenAddress:    import.meta.env.VITE_TOKEN_SOLANA ?? null,
    blockTime:       0.4,
    confirmations:   32,
    color:           '#9945ff',
    logo:            '◎',
  },

  'solana-devnet': {
    id:              'devnet',
    name:            'Solana Devnet',
    shortName:       'SOL',
    family:          'solana',
    rpcUrl:          'https://api.devnet.solana.com',
    rpcUrlFallback:  'https://api.devnet.solana.com',
    explorerUrl:     'https://explorer.solana.com',
    explorerTxPath:  '/tx/',
    explorerNFTPath: '/address/',
    nativeCurrency:  { name: 'Solana', symbol: 'SOL', decimals: 9 },
    contractAddress: import.meta.env.VITE_CONTRACT_SOLANA_DEVNET ?? null,
    marketplaceAddress: import.meta.env.VITE_MARKETPLACE_SOLANA_DEVNET ?? null,
    tokenAddress:    import.meta.env.VITE_TOKEN_SOLANA_DEVNET ?? null,
    blockTime:       0.4,
    confirmations:   32,
    color:           '#9945ff',
    logo:            '◎',
    testnet:         true,
  },

  // ── TON (adapter = 'ton') — Mini App Grant ────────────────────────────────

  ton: {
    id:              'ton-mainnet',
    name:            'TON',
    shortName:       'TON',
    family:          'ton',
    rpcUrl:          'https://toncenter.com/api/v2/jsonRPC',
    rpcUrlFallback:  'https://ton.access.orbs.network/mainnet',
    explorerUrl:     'https://tonviewer.com',
    explorerTxPath:  '/transaction/',
    explorerNFTPath: '/',
    nativeCurrency:  { name: 'Toncoin', symbol: 'TON', decimals: 9 },
    contractAddress: import.meta.env.VITE_CONTRACT_TON ?? null,
    marketplaceAddress: import.meta.env.VITE_MARKETPLACE_TON ?? null,
    tokenAddress:    import.meta.env.VITE_TOKEN_TON ?? null,
    blockTime:       5,
    confirmations:   1,
    color:           '#0098ea',
    logo:            '💎',
  },

  'ton-testnet': {
    id:              'ton-testnet',
    name:            'TON Testnet',
    shortName:       'TON',
    family:          'ton',
    rpcUrl:          'https://testnet.toncenter.com/api/v2/jsonRPC',
    rpcUrlFallback:  'https://testnet.toncenter.com/api/v2/jsonRPC',
    explorerUrl:     'https://testnet.tonviewer.com',
    explorerTxPath:  '/transaction/',
    explorerNFTPath: '/',
    nativeCurrency:  { name: 'Toncoin', symbol: 'TON', decimals: 9 },
    contractAddress: import.meta.env.VITE_CONTRACT_TON_TESTNET ?? null,
    marketplaceAddress: import.meta.env.VITE_MARKETPLACE_TON_TESTNET ?? null,
    tokenAddress:    import.meta.env.VITE_TOKEN_TON_TESTNET ?? null,
    blockTime:       5,
    confirmations:   1,
    color:           '#0098ea',
    logo:            '💎',
    testnet:         true,
  },

  // ── Aptos (adapter = 'aptos') — Ecosystem grant ───────────────────────────

  aptos: {
    id:              'aptos-mainnet',
    name:            'Aptos',
    shortName:       'APT',
    family:          'aptos',
    rpcUrl:          'https://fullnode.mainnet.aptoslabs.com/v1',
    rpcUrlFallback:  'https://aptos-mainnet.pontem.network/v1',
    explorerUrl:     'https://explorer.aptoslabs.com',
    explorerTxPath:  '/txn/',
    explorerNFTPath: '/token/',
    nativeCurrency:  { name: 'Aptos', symbol: 'APT', decimals: 8 },
    contractAddress: import.meta.env.VITE_CONTRACT_APTOS ?? null,
    marketplaceAddress: import.meta.env.VITE_MARKETPLACE_APTOS ?? null,
    tokenAddress:    import.meta.env.VITE_TOKEN_APTOS ?? null,
    blockTime:       0.5,
    confirmations:   1,
    color:           '#06f7c9',
    logo:            '🅰️',
  },

  'aptos-testnet': {
    id:              'aptos-testnet',
    name:            'Aptos Testnet',
    shortName:       'APT',
    family:          'aptos',
    rpcUrl:          'https://fullnode.testnet.aptoslabs.com/v1',
    rpcUrlFallback:  'https://fullnode.testnet.aptoslabs.com/v1',
    explorerUrl:     'https://explorer.aptoslabs.com',
    explorerTxPath:  '/txn/',
    explorerNFTPath: '/token/',
    nativeCurrency:  { name: 'Aptos', symbol: 'APT', decimals: 8 },
    contractAddress: import.meta.env.VITE_CONTRACT_APTOS_TESTNET ?? null,
    marketplaceAddress: import.meta.env.VITE_MARKETPLACE_APTOS_TESTNET ?? null,
    tokenAddress:    import.meta.env.VITE_TOKEN_APTOS_TESTNET ?? null,
    blockTime:       0.5,
    confirmations:   1,
    color:           '#06f7c9',
    logo:            '🅰️',
    testnet:         true,
  },

  // ── Sui (adapter = 'sui') — RFP grant ─────────────────────────────────────

  sui: {
    id:              'sui-mainnet',
    name:            'Sui',
    shortName:       'SUI',
    family:          'sui',
    rpcUrl:          'https://fullnode.mainnet.sui.io',
    rpcUrlFallback:  'https://sui-mainnet.public.blastapi.io',
    explorerUrl:     'https://suiscan.xyz/mainnet',
    explorerTxPath:  '/tx/',
    explorerNFTPath: '/object/',
    nativeCurrency:  { name: 'Sui', symbol: 'SUI', decimals: 9 },
    contractAddress: import.meta.env.VITE_CONTRACT_SUI ?? null,
    marketplaceAddress: import.meta.env.VITE_MARKETPLACE_SUI ?? null,
    tokenAddress:    import.meta.env.VITE_TOKEN_SUI ?? null,
    blockTime:       0.5,
    confirmations:   1,
    color:           '#4da2ff',
    logo:            '🌊',
  },

  'sui-testnet': {
    id:              'sui-testnet',
    name:            'Sui Testnet',
    shortName:       'SUI',
    family:          'sui',
    rpcUrl:          'https://fullnode.testnet.sui.io',
    rpcUrlFallback:  'https://sui-testnet.public.blastapi.io',
    explorerUrl:     'https://suiscan.xyz/testnet',
    explorerTxPath:  '/tx/',
    explorerNFTPath: '/object/',
    nativeCurrency:  { name: 'Sui', symbol: 'SUI', decimals: 9 },
    contractAddress: import.meta.env.VITE_CONTRACT_SUI_TESTNET ?? null,
    marketplaceAddress: import.meta.env.VITE_MARKETPLACE_SUI_TESTNET ?? null,
    tokenAddress:    import.meta.env.VITE_TOKEN_SUI_TESTNET ?? null,
    blockTime:       0.5,
    confirmations:   1,
    color:           '#4da2ff',
    logo:            '🌊',
    testnet:         true,
  },
}

// Active chain — set VITE_CHAIN in .env to select which chain THIS build
// targets. Each per-chain deployment (Base build, Solana build, TON build…)
// sets its own VITE_CHAIN. Unknown/unset values fall back to the Polygon
// testnet so a misconfigured build still boots instead of crashing.
export const ACTIVE_CHAIN_KEY = (import.meta.env.VITE_CHAIN in CHAINS)
  ? import.meta.env.VITE_CHAIN
  : 'polygon-amoy'
export const ACTIVE_CHAIN     = CHAINS[ACTIVE_CHAIN_KEY]

// Canonical chain name → DB string (stored in the `chain` column of a tile).
// Derived directly from the CHAINS keys so new chains need no second edit here.
export const CHAIN_CANONICAL_NAMES = Object.fromEntries(
  Object.keys(CHAINS).map(k => [k, k])
)

export const ACTIVE_CHAIN_CANONICAL = ACTIVE_CHAIN_KEY

// Family of the active build ('evm' | 'solana' | 'ton' | 'aptos' | 'sui').
export const ACTIVE_CHAIN_FAMILY = ACTIVE_CHAIN.family

// All mainnet chains, for any "supported chains" UI or grant landing page.
export const MAINNET_CHAINS = Object.entries(CHAINS)
  .filter(([, c]) => !c.testnet)
  .map(([key, c]) => ({ key, ...c }))

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
