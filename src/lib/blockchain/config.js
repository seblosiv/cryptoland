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
  // `import.meta.env` only exists under Vite. Falling back to an empty object
  // lets plain Node import this module — which is what `scripts/check-rpcs.mjs`
  // needs in order to read the endpoint list without standing up a build. Every
  // lookup below already treats a missing value as "use the default".
  const env = import.meta.env ?? {}
  return {
    key,
    id:                 cfg.id,
    name:               cfg.name,
    shortName:          cfg.shortName,
    family:             cfg.family,
    // A paid/private RPC can be injected per deployment without touching code.
    rpcUrl:             env[`VITE_RPC_${K}`] || cfg.rpcUrl,
    rpcUrlFallback:     cfg.rpcUrlFallback ?? cfg.rpcUrl,
    // Optional read-only endpoint for the live chain-head badge, tried BEFORE
    // rpcUrl. Exists for chains whose main API is unusable from a browser:
    // Cardano's Koios answers fine but sends no Access-Control-Allow-Origin, so
    // every page load logged a CORS error before falling back. The adapter still
    // needs Koios (it calls rpcUrl/tx_status), hence a separate field rather
    // than reordering rpcUrl.
    statusUrl:          cfg.statusUrl ?? null,
    graphqlUrl:         cfg.graphqlUrl ?? null,
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
    rpcUrl: 'https://polygon-bor-rpc.publicnode.com', rpcUrlFallback: 'https://polygon.drpc.org',
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
    rpcUrl: 'https://api.avax.network/ext/bc/C/rpc', rpcUrlFallback: 'https://avalanche-c-chain-rpc.publicnode.com',
    explorerUrl: 'https://snowtrace.io',
    nativeCurrency: { name: 'Avalanche', symbol: 'AVAX', decimals: 18 },
    blockTime: 2, confirmations: 3, color: '#e84142', logo: '🔺',
    grant: 'Avalanche Retro9000 / Codebase',
  },
  'avalanche-fuji': {
    id: 43113, name: 'Avalanche Fuji', shortName: 'AVAX', family: 'evm',
    rpcUrl: 'https://api.avax-test.network/ext/bc/C/rpc', rpcUrlFallback: 'https://avalanche-fuji-c-chain-rpc.publicnode.com',
    explorerUrl: 'https://testnet.snowtrace.io',
    nativeCurrency: { name: 'Avalanche', symbol: 'AVAX', decimals: 18 },
    blockTime: 2, confirmations: 2, color: '#e84142', logo: '🔺', testnet: true,
  },

  base: {
    id: 8453, name: 'Base', shortName: 'ETH', family: 'evm',
    rpcUrl: 'https://mainnet.base.org', rpcUrlFallback: 'https://base-rpc.publicnode.com',
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
    rpcUrl: 'https://ethereum-rpc.publicnode.com', rpcUrlFallback: 'https://eth.drpc.org',
    explorerUrl: 'https://etherscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    blockTime: 12, confirmations: 12, color: '#627eea', logo: '⟠',
  },

  arbitrum: {
    id: 42161, name: 'Arbitrum One', shortName: 'ARB', family: 'evm',
    rpcUrl: 'https://arb1.arbitrum.io/rpc', rpcUrlFallback: 'https://arbitrum-one-rpc.publicnode.com',
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
    rpcUrl: 'https://api.roninchain.com/rpc', rpcUrlFallback: 'https://ronin.drpc.org',
    explorerUrl: 'https://app.roninchain.com',
    nativeCurrency: { name: 'Ronin', symbol: 'RON', decimals: 18 },
    blockTime: 3, confirmations: 5, color: '#1273ea', logo: '⚔️',
    grant: 'Ronin Ecosystem Grants / Forge ($10M)',
  },
  'ronin-saigon': {
    // 202601, not 2021 — Ronin renumbered Saigon. Verified against eth_chainId
    // while deploying there. A stale chainId makes switchChain ask the wallet
    // for a network that does not exist, and nothing else catches it: the RPC
    // answers perfectly well, it is simply a different chain than we claim.
    id: 202601, name: 'Ronin Saigon', shortName: 'RON', family: 'evm',
    rpcUrl: 'https://saigon-testnet.roninchain.com/rpc',
    explorerUrl: 'https://saigon-app.roninchain.com',
    nativeCurrency: { name: 'Ronin', symbol: 'RON', decimals: 18 },
    blockTime: 3, confirmations: 2, color: '#1273ea', logo: '⚔️', testnet: true,
  },

  bnb: {
    id: 56, name: 'BNB Smart Chain', shortName: 'BNB', family: 'evm',
    rpcUrl: 'https://bsc-dataseed.bnbchain.org', rpcUrlFallback: 'https://bsc-rpc.publicnode.com',
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

  // ── Grant-target EVM chains ───────────────────────────────────────────────
  // All values below were verified against live nodes (eth_chainId + measured
  // block-time deltas), not just docs. Notes call out where a chain deviates
  // from the obvious assumption.

  optimism: {
    id: 10, name: 'OP Mainnet', shortName: 'OP', family: 'evm',
    // mainnet.optimism.io is aggressively rate-limited — publicnode first.
    rpcUrl: 'https://optimism-rpc.publicnode.com', rpcUrlFallback: 'https://mainnet.optimism.io',
    explorerUrl: 'https://optimistic.etherscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    blockTime: 2, confirmations: 3, color: '#ff0420', logo: '🔴',
    grant: 'Optimism Retro Funding (PAUSED — see grants.md §0)',
  },
  'optimism-sepolia': {
    id: 11155420, name: 'OP Sepolia', shortName: 'OP', family: 'evm',
    rpcUrl: 'https://sepolia.optimism.io',
    explorerUrl: 'https://sepolia-optimism.etherscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    blockTime: 2, confirmations: 2, color: '#ff0420', logo: '🔴', testnet: true,
  },

  // ── Added 2026-07-31 to reach four grant programmes we had no chain for.
  //    All four are EVM, so adapters/evm.js covers them and there is no new code
  //    — a CHAINS entry and an env template is the whole integration. Every id
  //    and RPC below was verified against a live eth_chainId with an Origin
  //    header, so CORS is confirmed too.
  mantle: {
    id: 5000, name: 'Mantle', shortName: 'MNT', family: 'evm',
    rpcUrl: 'https://rpc.mantle.xyz', rpcUrlFallback: 'https://mantle-rpc.publicnode.com',
    explorerUrl: 'https://explorer.mantle.xyz',
    nativeCurrency: { name: 'Mantle', symbol: 'MNT', decimals: 18 },
    blockTime: 2, confirmations: 3, color: '#65b3ae', logo: '🔷',
    grant: 'Mantle Grants (rolling)',
  },

  taiko: {
    id: 167000, name: 'Taiko', shortName: 'ETH', family: 'evm',
    rpcUrl: 'https://rpc.mainnet.taiko.xyz', rpcUrlFallback: 'https://taiko-rpc.publicnode.com',
    explorerUrl: 'https://taikoscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    blockTime: 12, confirmations: 3, color: '#e81899', logo: '🥁',
    grant: 'Taiko Grants',
  },

  // Bitcoin-secured EVM sidechain: merge-mined by Bitcoin miners, gas paid in
  // RBTC. The only chain here where the pitch is "Bitcoin", not "Ethereum".
  rootstock: {
    id: 30, name: 'Rootstock', shortName: 'RBTC', family: 'evm',
    // publicnode's rootstock endpoint sends no CORS header, so there is no
    // browser-usable fallback — the primary is load-bearing here.
    rpcUrl: 'https://public-node.rsk.co',
    explorerUrl: 'https://explorer.rootstock.io',
    nativeCurrency: { name: 'Smart Bitcoin', symbol: 'RBTC', decimals: 18 },
    blockTime: 30, confirmations: 2, color: '#ff9100', logo: '₿',
    grant: 'Rootstock Grants',
  },

  flare: {
    id: 14, name: 'Flare', shortName: 'FLR', family: 'evm',
    // As with Rootstock, publicnode's Flare endpoint has no CORS header.
    rpcUrl: 'https://flare-api.flare.network/ext/C/rpc',
    explorerUrl: 'https://flare-explorer.flare.network',
    nativeCurrency: { name: 'Flare', symbol: 'FLR', decimals: 18 },
    // Flare's brand red is #e62058, which sits in a dead zone: 4.30 against our
    // near-black ink and 4.46 against white, so a CTA label is unreadable EITHER
    // way. src/test/theme.test.js catches exactly this. #d81b52 is the nearest
    // shade that clears 4.5 (5.00 on white) and still reads as Flare red.
    blockTime: 1.8, confirmations: 3, color: '#d81b52', logo: '🔥',
    grant: 'Flare Grants',
  },

  scroll: {
    id: 534352, name: 'Scroll', shortName: 'ETH', family: 'evm',
    rpcUrl: 'https://rpc.scroll.io', rpcUrlFallback: 'https://scroll-rpc.publicnode.com',
    explorerUrl: 'https://scrollscan.com',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    blockTime: 3.5, confirmations: 3, color: '#ffeeda', logo: '📜',
    grant: 'Scroll Community Grants (Levels)',
  },
  'scroll-sepolia': {
    id: 534351, name: 'Scroll Sepolia', shortName: 'ETH', family: 'evm',
    rpcUrl: 'https://sepolia-rpc.scroll.io',
    explorerUrl: 'https://sepolia.scrollscan.com',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    blockTime: 6, confirmations: 2, color: '#ffeeda', logo: '📜', testnet: true,
  },

  celo: {
    id: 42220, name: 'Celo', shortName: 'CELO', family: 'evm',
    rpcUrl: 'https://forno.celo.org',
    explorerUrl: 'https://celoscan.io',
    nativeCurrency: { name: 'CELO', symbol: 'CELO', decimals: 18 },
    blockTime: 1, confirmations: 5, color: '#fcff52', logo: '🌱',
    grant: 'Celo Builder Fund (CeloPG) / Prezenti',
  },
  'celo-sepolia': {
    // Alfajores (44787) is decommissioned — its RPC no longer resolves in DNS.
    id: 11142220, name: 'Celo Sepolia', shortName: 'CELO', family: 'evm',
    rpcUrl: 'https://forno.celo-sepolia.celo-testnet.org',
    explorerUrl: 'https://celo-sepolia.blockscout.com',
    nativeCurrency: { name: 'CELO', symbol: 'CELO', decimals: 18 },
    blockTime: 1, confirmations: 2, color: '#fcff52', logo: '🌱', testnet: true,
  },

  moonbeam: {
    id: 1284, name: 'Moonbeam', shortName: 'GLMR', family: 'evm',
    rpcUrl: 'https://rpc.api.moonbeam.network', rpcUrlFallback: 'https://moonbeam-rpc.publicnode.com',
    explorerUrl: 'https://moonbeam.moonscan.io',
    nativeCurrency: { name: 'Glimmer', symbol: 'GLMR', decimals: 18 },
    blockTime: 6, confirmations: 3, color: '#53cbc9', logo: '🌗',
    grant: 'Moonbeam Interim Grant Program',
  },
  'moonbase-alpha': {
    id: 1287, name: 'Moonbase Alpha', shortName: 'DEV', family: 'evm',
    rpcUrl: 'https://rpc.api.moonbase.moonbeam.network',
    explorerUrl: 'https://moonbase.moonscan.io',
    // Testnet gas token is DEV, not GLMR.
    nativeCurrency: { name: 'Dev', symbol: 'DEV', decimals: 18 },
    blockTime: 6, confirmations: 2, color: '#53cbc9', logo: '🌗', testnet: true,
  },

  beam: {
    id: 4337, name: 'Beam', shortName: 'BEAM', family: 'evm',
    rpcUrl: 'https://build.onbeam.com/rpc', rpcUrlFallback: 'https://subnets.avax.network/beam/mainnet/rpc',
    explorerUrl: 'https://subnets.avax.network/beam',
    nativeCurrency: { name: 'Beam', symbol: 'BEAM', decimals: 18 },
    // subnet-evm mints blocks on demand, so there is no meaningful fixed block
    // time (idle rate measured 17-24s). Avalanche consensus finalises ~1-2s once
    // a tx lands — never derive UX timeouts from blockTime here.
    blockTime: 2, confirmations: 1, color: '#ffd200', logo: '🎮',
    grant: 'Beam Foundation Grants (gaming)',
  },
  'beam-testnet': {
    id: 13337, name: 'Beam Testnet', shortName: 'BEAM', family: 'evm',
    rpcUrl: 'https://build.onbeam.com/rpc/testnet',
    explorerUrl: 'https://subnets-test.avax.network/beam',
    nativeCurrency: { name: 'Beam', symbol: 'BEAM', decimals: 18 },
    blockTime: 2, confirmations: 1, color: '#ffd200', logo: '🎮', testnet: true,
  },

  oasys: {
    // Whitepaper still says 15s blocks; the live chain measures ~6s.
    id: 248, name: 'Oasys', shortName: 'OAS', family: 'evm',
    rpcUrl: 'https://rpc.mainnet.oasys.games',
    explorerUrl: 'https://explorer.oasys.games',
    nativeCurrency: { name: 'OAS', symbol: 'OAS', decimals: 18 },
    blockTime: 6, confirmations: 5, color: '#0f62fe', logo: '🕹️',
    grant: 'Oasys — Gaming grants / ecosystem',
  },
  'oasys-testnet': {
    id: 9372, name: 'Oasys Testnet', shortName: 'OAS', family: 'evm',
    rpcUrl: 'https://rpc.testnet.oasys.games',
    explorerUrl: 'https://explorer.testnet.oasys.games',
    nativeCurrency: { name: 'OAS', symbol: 'OAS', decimals: 18 },
    blockTime: 6, confirmations: 2, color: '#0f62fe', logo: '🕹️', testnet: true,
  },

  // SKALE — true zero gas. sFUEL is a valueless faucet token that exists only to
  // satisfy EVM gas accounting; users never pay, so suppress all fee UI.
  // NOTE: SKALE's *testnet* infrastructure is currently unreachable (the proxy
  // host has no A records and a sibling serves an unrelated TLS cert), so only
  // the mainnet hubs are configured here.
  skale: {
    id: 1482601649, name: 'SKALE Nebula Gaming Hub', shortName: 'sFUEL', family: 'evm',
    rpcUrl: 'https://mainnet.skalenodes.com/v1/green-giddy-denebola',
    explorerUrl: 'https://green-giddy-denebola.explorer.mainnet.skalenodes.com',
    nativeCurrency: { name: 'sFUEL', symbol: 'sFUEL', decimals: 18 },
    blockTime: 1, confirmations: 1, color: '#000000', logo: '⚡', gasless: true,
    grant: 'SKALE $2M Indie Game Accelerator',
  },
  'skale-europa': {
    id: 2046399126, name: 'SKALE Europa Hub', shortName: 'sFUEL', family: 'evm',
    rpcUrl: 'https://mainnet.skalenodes.com/v1/elated-tan-skat',
    explorerUrl: 'https://elated-tan-skat.explorer.mainnet.skalenodes.com',
    nativeCurrency: { name: 'sFUEL', symbol: 'sFUEL', decimals: 18 },
    blockTime: 1, confirmations: 1, color: '#000000', logo: '⚡', gasless: true,
  },

  hedera: {
    id: 295, name: 'Hedera', shortName: 'HBAR', family: 'evm',
    // Hashio is documented as dev/test-only — use a commercial relay in prod
    // via VITE_RPC_HEDERA.
    rpcUrl: 'https://mainnet.hashio.io/api', rpcUrlFallback: 'https://295.rpc.thirdweb.com',
    explorerUrl: 'https://hashscan.io/mainnet',
    // Hedera's explorer uses /transaction/ — unlike every other chain here.
    explorerTxPath: '/transaction/',
    // HBAR is 8 decimals on the native ledger but the JSON-RPC relay reports
    // value/gasPrice in 18-decimal weibar, which is what EVM tooling sees.
    nativeCurrency: { name: 'HBAR', symbol: 'HBAR', decimals: 18 },
    blockTime: 2.2, confirmations: 1, color: '#222222', logo: 'ℏ',
    grant: 'Hedera / HBAR Foundation grants',
  },
  'hedera-testnet': {
    id: 296, name: 'Hedera Testnet', shortName: 'HBAR', family: 'evm',
    rpcUrl: 'https://testnet.hashio.io/api',
    explorerUrl: 'https://hashscan.io/testnet', explorerTxPath: '/transaction/',
    nativeCurrency: { name: 'HBAR', symbol: 'HBAR', decimals: 18 },
    blockTime: 2.2, confirmations: 1, color: '#222222', logo: 'ℏ', testnet: true,
  },

  injective: {
    // Injective's canonical EVM is the native layer at 1776. The older
    // Caldera "inEVM" rollup (chainId 2525) is dead — its RPC returns 404.
    id: 1776, name: 'Injective', shortName: 'INJ', family: 'evm',
    rpcUrl: 'https://sentry.evm-rpc.injective.network/', rpcUrlFallback: 'https://injectiveevm-rpc.polkachu.com',
    explorerUrl: 'https://blockscout.injective.network',
    nativeCurrency: { name: 'Injective', symbol: 'INJ', decimals: 18 },
    blockTime: 0.6, confirmations: 1, color: '#00f2fe', logo: '🌀',
    grant: 'Injective — Ecosystem / AI fund',
  },
  'injective-testnet': {
    id: 1439, name: 'Injective EVM Testnet', shortName: 'INJ', family: 'evm',
    rpcUrl: 'https://k8s.testnet.json-rpc.injective.network/',
    explorerUrl: 'https://testnet.blockscout.injective.network',
    nativeCurrency: { name: 'Injective', symbol: 'INJ', decimals: 18 },
    blockTime: 0.8, confirmations: 1, color: '#00f2fe', logo: '🌀', testnet: true,
  },

  // NOTE: Kadena is deliberately NOT configured. The Kadena organization ceased
  // operations in Oct 2025, Chainweb EVM never reached mainnet, the documented
  // testnet host no longer resolves, and Kadena has no entry in the canonical
  // ethereum-lists/chains registry. Program #39 in grants.md is not actionable.

  // ══ Non-EVM chains ════════════════════════════════════════════════════════


  // ══ Flow ══════════════════════════════════════════════════════════════════
  // The only chain here built specifically for consumer NFTs (NBA Top Shot,
  // NFL All Day), which makes a land-NFT the use case it was designed around
  // rather than one it tolerates. Cadence's resource model needs its own
  // adapter — this is not an EVM config entry.
  flow: {
    id: 747, name: 'Flow', shortName: 'FLOW', family: 'flow',
    rpcUrl: 'https://rest-mainnet.onflow.org',
    explorerUrl: 'https://www.flowscan.io', explorerTxPath: '/tx/',
    nativeCurrency: { name: 'Flow', symbol: 'FLOW', decimals: 8 },
    blockTime: 1, confirmations: 1, color: '#00ef8b', logo: '🌊',
    grant: 'Flow Ecosystem Support',
  },
  'flow-testnet': {
    id: 646, name: 'Flow Testnet', shortName: 'FLOW', family: 'flow',
    rpcUrl: 'https://rest-testnet.onflow.org',
    explorerUrl: 'https://testnet.flowscan.io', explorerTxPath: '/tx/',
    nativeCurrency: { name: 'Flow', symbol: 'FLOW', decimals: 8 },
    blockTime: 1, confirmations: 1, color: '#00ef8b', logo: '🌊', testnet: true,
  },

  solana: {
    id: 'mainnet-beta', name: 'Solana', shortName: 'SOL', family: 'solana',
    rpcUrl: 'https://solana-rpc.publicnode.com', rpcUrlFallback: 'https://api.mainnet-beta.solana.com',
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
    // NOTE: no rpcUrlFallback. The previous one (ton.access.orbs.network/mainnet)
    // 404s, and no other keyless endpoint speaks toncenter's JSON-RPC shape.
    // defineChain() defaults the fallback to rpcUrl, so TON degrades to a
    // single-endpoint chain rather than to a URL guaranteed to fail.
    rpcUrl: 'https://toncenter.com/api/v2/jsonRPC',
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
    rpcUrl: 'https://fullnode.mainnet.aptoslabs.com/v1', rpcUrlFallback: 'https://api.mainnet.aptoslabs.com/v1',
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
    // Sui DEPRECATED JSON-RPC on public fullnodes — fullnode.mainnet.sui.io now
    // answers every method with -32601 and a migrate-to-gRPC/GraphQL notice, so
    // it was the primary for an adapter that speaks only JSON-RPC. publicnode
    // still serves it with `Access-Control-Allow-Origin: *`; blockvision is the
    // second. Re-check at the next submission round: JSON-RPC is on its way out
    // ecosystem-wide and the adapter will eventually need a GraphQL path.
    rpcUrl: 'https://sui-rpc.publicnode.com',
    rpcUrlFallback: 'https://sui-mainnet-endpoint.blockvision.org',
    // The migration target Sui's own deprecation notice points at. CORS-open
    // (`Access-Control-Allow-Origin: *`), so the browser can read it directly.
    graphqlUrl: 'https://graphql.mainnet.sui.io/graphql',
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

  // ── Additional non-EVM grant chains ───────────────────────────────────────
  // All endpoints below were live-probed. NOTE: chain `id` is deliberately a
  // STRING for every non-EVM chain even where the network's own id is numeric
  // (Cardano networkId 1, Radix networkId 1) — a numeric 1 would collide with
  // Ethereum in chainById().

  starknet: {
    id: 'SN_MAIN', name: 'Starknet', shortName: 'STRK', family: 'starknet',
    rpcUrl: 'https://api.cartridge.gg/x/starknet/mainnet', rpcUrlFallback: 'https://rpc.starknet.lava.build',
    explorerUrl: 'https://starkscan.co', explorerNFTPath: '/contract/',
    // Two fee tokens (STRK and ETH), both 18 decimals; STRK is the default.
    nativeCurrency: { name: 'Starknet Token', symbol: 'STRK', decimals: 18 },
    blockTime: 30, confirmations: 1, color: '#ec796b', logo: '🔱',
    grant: 'Starknet Foundation Seed + Growth Grants',
  },
  'starknet-sepolia': {
    id: 'SN_SEPOLIA', name: 'Starknet Sepolia', shortName: 'STRK', family: 'starknet',
    rpcUrl: 'https://api.cartridge.gg/x/starknet/sepolia', rpcUrlFallback: 'https://starknet-sepolia.drpc.org',
    // sepolia.starkscan.co no longer resolves — Voyager is the working explorer.
    explorerUrl: 'https://sepolia.voyager.online', explorerNFTPath: '/contract/',
    nativeCurrency: { name: 'Starknet Token', symbol: 'STRK', decimals: 18 },
    blockTime: 30, confirmations: 1, color: '#ec796b', logo: '🔱', testnet: true,
  },

  cardano: {
    id: 'cardano-mainnet', name: 'Cardano', shortName: 'ADA', family: 'cardano',
    rpcUrl: 'https://api.koios.rest/api/v1',
    // Koios answers 200 but sends no Access-Control-Allow-Origin, so a browser
    // can never read it — the Cardano build was the only one of 29 with no live
    // block badge, and it logged two CORS errors on every load. Mithril is
    // Cardano's own certification network: CORS-enabled, keyless, and it
    // certifies at a lag (~100 blocks), which ChainStatus labels as certified
    // rather than passing off as the tip.
    //
    // statusUrl, not rpcUrl: the adapter calls rpcUrl/tx_status, which only
    // Koios serves. The badge reads Mithril; everything else keeps using Koios.
    statusUrl: 'https://aggregator.release-mainnet.api.mithril.network/aggregator',
    explorerUrl: 'https://cardanoscan.io', explorerTxPath: '/transaction/',
    nativeCurrency: { name: 'Cardano', symbol: 'ADA', decimals: 6 },
    blockTime: 20, confirmations: 1, color: '#0033ad', logo: '💠',
    grant: 'Cardano Project Catalyst / CAP',
  },
  'cardano-preprod': {
    id: 'cardano-preprod', name: 'Cardano Preprod', shortName: 'ADA', family: 'cardano',
    rpcUrl: 'https://preprod.koios.rest/api/v1',
    explorerUrl: 'https://preprod.cardanoscan.io', explorerTxPath: '/transaction/',
    nativeCurrency: { name: 'Cardano', symbol: 'ADA', decimals: 6 },
    blockTime: 20, confirmations: 1, color: '#0033ad', logo: '💠', testnet: true,
  },

  near: {
    id: 'mainnet', name: 'NEAR', shortName: 'NEAR', family: 'near',
    rpcUrl: 'https://rpc.mainnet.near.org', rpcUrlFallback: 'https://free.rpc.fastnear.com',
    explorerUrl: 'https://nearblocks.io', explorerTxPath: '/txns/', explorerNFTPath: '/nft-token/',
    nativeCurrency: { name: 'NEAR', symbol: 'NEAR', decimals: 24 },
    blockTime: 1, confirmations: 1, color: '#00c08b', logo: '🌐',
    grant: 'NEAR Foundation Funding Initiatives',
  },
  'near-testnet': {
    id: 'testnet', name: 'NEAR Testnet', shortName: 'NEAR', family: 'near',
    rpcUrl: 'https://rpc.testnet.near.org', rpcUrlFallback: 'https://test.rpc.fastnear.com',
    explorerUrl: 'https://testnet.nearblocks.io', explorerTxPath: '/txns/', explorerNFTPath: '/nft-token/',
    nativeCurrency: { name: 'NEAR', symbol: 'NEAR', decimals: 24 },
    blockTime: 1, confirmations: 1, color: '#00c08b', logo: '🌐', testnet: true,
  },

  stellar: {
    id: 'Public Global Stellar Network ; September 2015',
    name: 'Stellar', shortName: 'XLM', family: 'stellar',
    rpcUrl: 'https://horizon.stellar.org', rpcUrlFallback: 'https://mainnet.sorobanrpc.com',
    explorerUrl: 'https://stellar.expert/explorer/public', explorerNFTPath: '/contract/',
    nativeCurrency: { name: 'Lumen', symbol: 'XLM', decimals: 7 },
    blockTime: 5, confirmations: 1, color: '#7d00ff', logo: '🚀',
    grant: 'Stellar Community Fund (Soroban)',
  },
  'stellar-testnet': {
    id: 'Test SDF Network ; September 2015',
    name: 'Stellar Testnet', shortName: 'XLM', family: 'stellar',
    rpcUrl: 'https://horizon-testnet.stellar.org', rpcUrlFallback: 'https://soroban-testnet.stellar.org',
    explorerUrl: 'https://stellar.expert/explorer/testnet', explorerNFTPath: '/contract/',
    nativeCurrency: { name: 'Lumen', symbol: 'XLM', decimals: 7 },
    blockTime: 5, confirmations: 1, color: '#7d00ff', logo: '🚀', testnet: true,
  },

  algorand: {
    id: 'mainnet-v1.0', name: 'Algorand', shortName: 'ALGO', family: 'algorand',
    rpcUrl: 'https://mainnet-api.4160.nodely.dev', rpcUrlFallback: 'https://mainnet-api.algonode.cloud',
    explorerUrl: 'https://lora.algokit.io/mainnet',
    explorerTxPath: '/transaction/', explorerNFTPath: '/asset/',
    nativeCurrency: { name: 'Algo', symbol: 'ALGO', decimals: 6 },
    blockTime: 3, confirmations: 1, color: '#00d1b2', logo: '▲',
    grant: 'Algorand Foundation Grants',
  },
  'algorand-testnet': {
    id: 'testnet-v1.0', name: 'Algorand Testnet', shortName: 'ALGO', family: 'algorand',
    rpcUrl: 'https://testnet-api.4160.nodely.dev', rpcUrlFallback: 'https://testnet-api.algonode.cloud',
    // testnet.allo.info does not resolve — Lora covers both networks.
    explorerUrl: 'https://lora.algokit.io/testnet',
    explorerTxPath: '/transaction/', explorerNFTPath: '/asset/',
    nativeCurrency: { name: 'Algo', symbol: 'ALGO', decimals: 6 },
    blockTime: 3, confirmations: 1, color: '#00d1b2', logo: '▲', testnet: true,
  },

  multiversx: {
    id: '1', name: 'MultiversX', shortName: 'EGLD', family: 'multiversx',
    rpcUrl: 'https://api.multiversx.com', rpcUrlFallback: 'https://gateway.multiversx.com',
    explorerUrl: 'https://explorer.multiversx.com',
    explorerTxPath: '/transactions/', explorerNFTPath: '/nfts/',
    nativeCurrency: { name: 'eGold', symbol: 'EGLD', decimals: 18 },
    blockTime: 6, confirmations: 1, color: '#23f7dd', logo: '✖️',
    grant: 'MultiversX Growth Games / Grants',
  },
  'multiversx-devnet': {
    id: 'D', name: 'MultiversX Devnet', shortName: 'EGLD', family: 'multiversx',
    rpcUrl: 'https://devnet-api.multiversx.com', rpcUrlFallback: 'https://devnet-gateway.multiversx.com',
    explorerUrl: 'https://devnet-explorer.multiversx.com',
    explorerTxPath: '/transactions/', explorerNFTPath: '/nfts/',
    nativeCurrency: { name: 'eGold', symbol: 'EGLD', decimals: 18 },
    blockTime: 6, confirmations: 1, color: '#23f7dd', logo: '✖️', testnet: true,
  },

  radix: {
    id: 'radix-mainnet', name: 'Radix', shortName: 'XRD', family: 'radix',
    rpcUrl: 'https://mainnet.radixdlt.com',
    explorerUrl: 'https://dashboard.radixdlt.com',
    explorerTxPath: '/transaction/', explorerNFTPath: '/resource/',
    nativeCurrency: { name: 'Radix', symbol: 'XRD', decimals: 18 },
    blockTime: 5, confirmations: 1, color: '#052cc0', logo: '⚛️',
    grant: 'Radix Booster Grants (tiered)',
  },
  'radix-stokenet': {
    id: 'radix-stokenet', name: 'Radix Stokenet', shortName: 'XRD', family: 'radix',
    rpcUrl: 'https://stokenet.radixdlt.com',
    explorerUrl: 'https://stokenet-dashboard.radixdlt.com',
    explorerTxPath: '/transaction/', explorerNFTPath: '/resource/',
    nativeCurrency: { name: 'Radix', symbol: 'XRD', decimals: 18 },
    blockTime: 5, confirmations: 1, color: '#052cc0', logo: '⚛️', testnet: true,
  },

  tezos: {
    id: 'NetXdQprcVkpaWU', name: 'Tezos', shortName: 'XTZ', family: 'tezos',
    rpcUrl: 'https://rpc.tzkt.io/mainnet', rpcUrlFallback: 'https://prod.tcinfra.net/rpc/mainnet',
    // TzKT uses a flat root path for both operations and accounts.
    explorerUrl: 'https://tzkt.io', explorerTxPath: '/', explorerNFTPath: '/',
    nativeCurrency: { name: 'Tezos', symbol: 'XTZ', decimals: 6 },
    blockTime: 8, confirmations: 1, color: '#2c7df7', logo: '🔷',
    grant: 'Tezos Ecosystem Bounty / Foundation Grants',
  },
  'tezos-shadownet': {
    // Ghostnet is GONE (DNS + teztnets.json). Shadownet is the current
    // application-testing network.
    id: 'NetXsqzbfFenSTS', name: 'Tezos Shadownet', shortName: 'XTZ', family: 'tezos',
    rpcUrl: 'https://rpc.shadownet.teztnets.com',
    explorerUrl: 'https://shadownet.tzkt.io', explorerTxPath: '/', explorerNFTPath: '/',
    nativeCurrency: { name: 'Tezos', symbol: 'XTZ', decimals: 6 },
    blockTime: 8, confirmations: 1, color: '#2c7df7', logo: '🔷', testnet: true,
  },

  // NOTE: Aztec is deliberately NOT configured. Aztec's own documentation states
  // the stack is unaudited with "critical bugs expected", some circuits are
  // "under-constrained, meaning soundness is not fully guaranteed", "privacy is
  // not guaranteed", state does not survive rollup upgrades, and there is no
  // standard NFT contract. It also has no arbitrary-message signing, so our
  // wallet login flow cannot work there. Program #43 is documented as
  // non-viable in grants.md rather than shipped as a broken build.
  //
  // Celestia is likewise absent: it is a data-availability layer, not a wallet
  // chain, and program #32 needs a sovereign-rollup narrative, not a deployment.
}

export const CHAINS = Object.fromEntries(
  Object.entries(CHAIN_DEFS).map(([key, cfg]) => [key, defineChain(key, cfg)])
)

// Active chain — set VITE_CHAIN in .env to select which chain THIS build
// targets. Unknown/unset falls back to the Polygon testnet so a misconfigured
// build still boots instead of crashing.
// `?? {}` for the same reason as in defineChain: plain Node (tooling) has no
// import.meta.env, and an unset VITE_CHAIN already means "use the fallback".
const _env = import.meta.env ?? {}
export const ACTIVE_CHAIN_KEY = (_env.VITE_CHAIN in CHAINS)
  ? _env.VITE_CHAIN
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
