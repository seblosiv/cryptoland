/**
 * Hardhat config — CryptoLand
 * ============================
 * Usage:
 *   npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
 *   npx hardhat compile
 *   npx hardhat run scripts/deploy.js --network polygon-amoy
 *   npx hardhat verify --network polygon-amoy 0xCONTRACT_ADDRESS "CryptoLand Tiles" "CLND" "https://polygon-amoy.xono.ai/metadata/"
 *
 * Set env vars before running:
 *   DEPLOY_PK=0xYourPrivateKey
 *   POLYGONSCAN_API_KEY=...
 *   SNOWTRACE_API_KEY=...
 *   BASESCAN_API_KEY=...
 */

require('@nomicfoundation/hardhat-toolbox')

const PK = process.env.DEPLOY_PK ?? '0x' + '0'.repeat(64)

module.exports = {
  solidity: {
    version: '0.8.20',
    settings: { optimizer: { enabled: true, runs: 200 } },
  },

  networks: {
    // ── EVM Testnets ──────────────────────────────────────────────────────
    // The one EVM testnet whose faucet has neither captcha nor wallet login,
    // which makes it the only one that can be funded unattended.
    'oasys-testnet': {
      url:      'https://rpc.testnet.oasys.games',
      chainId:  9372,
      accounts: [PK],
    },
    // chainId 202601, NOT 2021 — Ronin renumbered Saigon and our config still
    // had the old value. Verified against eth_chainId before deploying.
    'ronin-saigon': {
      url:      'https://saigon-testnet.roninchain.com/rpc',
      chainId:  202601,
      accounts: [PK],
    },
    'polygon-amoy': {
      url:      'https://rpc-amoy.polygon.technology',
      chainId:  80002,
      accounts: [PK],
    },
    'avalanche-fuji': {
      url:      'https://api.avax-test.network/ext/bc/C/rpc',
      chainId:  43113,
      accounts: [PK],
    },
    'base-sepolia': {
      url:      'https://sepolia.base.org',
      chainId:  84532,
      accounts: [PK],
    },
    'ethereum-sepolia': {
      url:      'https://rpc.sepolia.org',
      chainId:  11155111,
      accounts: [PK],
    },

    // ── EVM Mainnets ──────────────────────────────────────────────────────
    polygon: {
      url:      'https://polygon-bor-rpc.publicnode.com',
      chainId:  137,
      accounts: [PK],
      gasPrice: 'auto',
    },
    avalanche: {
      url:      'https://api.avax.network/ext/bc/C/rpc',
      chainId:  43114,
      accounts: [PK],
    },
    base: {
      url:      'https://mainnet.base.org',
      chainId:  8453,
      accounts: [PK],
    },
    ethereum: {
      // Was eth.llamarpc.com, which answers Cloudflare 521 — a deploy against it
      // fails at send time, after the wallet is already funded.
      url:      'https://ethereum-rpc.publicnode.com',
      chainId:  1,
      accounts: [PK],
    },

    // ── Added 2026-07-29. Deployment cost measured with live gas + token
    //    prices at ~3.2M gas: SKALE/Scroll/Avalanche/Ronin ~$0.00, Optimism
    //    $0.01, Base $0.04, Celo $0.04, BNB $0.09, Polygon $0.12, Arbitrum
    //    $0.12 — about $0.42 for all ten. Cost is not the constraint; a
    //    RETAINED, BACKED-UP deployer key is (Retro9000 and OP Atlas both
    //    require the original deployer address to sign to claim the contracts).
    optimism: {
      url:      'https://optimism-rpc.publicnode.com',
      chainId:  10,
      accounts: [PK],
    },
    arbitrum: {
      url:      'https://arb1.arbitrum.io/rpc',
      chainId:  42161,
      accounts: [PK],
    },
    bnb: {
      url:      'https://bsc-dataseed.bnbchain.org',
      chainId:  56,
      accounts: [PK],
    },
    scroll: {
      url:      'https://rpc.scroll.io',
      chainId:  534352,
      accounts: [PK],
    },
    celo: {
      url:      'https://forno.celo.org',
      chainId:  42220,
      accounts: [PK],
    },
    ronin: {
      url:      'https://api.roninchain.com/rpc',
      chainId:  2020,
      accounts: [PK],
    },
    // SKALE Nebula Gaming Hub — gasless (sFUEL is a valueless faucet token),
    // so this is the zero-cost place to prove the contract works on mainnet.
    skale: {
      url:      'https://mainnet.skalenodes.com/v1/green-giddy-denebola',
      chainId:  1482601649,
      accounts: [PK],
    },
    'skale-europa': {
      url:      'https://mainnet.skalenodes.com/v1/elated-tan-skat',
      chainId:  2046399126,
      accounts: [PK],
    },

    // ── Added 2026-08-09. Every remaining EVM mainnet, so "deploy everywhere"
    //    is not gated on editing this file at the moment the funds land. Ten
    //    chains were missing, three of them (hedera/flare/injective) in the
    //    same tier we were about to fund. Every url below was verified with a
    //    live eth_chainId against the value config.js declares — a reachable
    //    RPC on the WRONG network is the failure mode that renumbered Ronin
    //    Saigon out from under us.
    hedera: {
      url:      'https://mainnet.hashio.io/api',
      chainId:  295,
      accounts: [PK],
    },
    // Flow EVM (747). Flow's Cadence side assigns 8-byte account addresses,
    // which cannot be derived from a key and therefore cannot be funded from an
    // exchange. Flow EVM uses ordinary key-derived 0x addresses, so the same
    // retained deployer works here and the chain stops being wallet-gated.
    // Named `flow` so metadataBase() resolves to https://flow.xono.ai/metadata/.
    flow: {
      url:      'https://mainnet.evm.nodes.onflow.org',
      chainId:  747,
      accounts: [PK],
    },

    flare: {
      url:      'https://flare-api.flare.network/ext/C/rpc',
      chainId:  14,
      accounts: [PK],
    },
    injective: {
      url:      'https://sentry.evm-rpc.injective.network/',
      chainId:  1776,
      accounts: [PK],
    },
    mantle: {
      url:      'https://rpc.mantle.xyz',
      chainId:  5000,
      accounts: [PK],
    },
    taiko: {
      url:      'https://rpc.mainnet.taiko.xyz',
      chainId:  167000,
      accounts: [PK],
    },
    rootstock: {
      url:      'https://public-node.rsk.co',
      chainId:  30,
      accounts: [PK],
    },
    moonbeam: {
      url:      'https://rpc.api.moonbeam.network',
      chainId:  1284,
      accounts: [PK],
    },
    beam: {
      url:      'https://build.onbeam.com/rpc',
      chainId:  4337,
      accounts: [PK],
    },
    oasys: {
      url:      'https://rpc.mainnet.oasys.games',
      chainId:  248,
      accounts: [PK],
    },

  },

  etherscan: {
    apiKey: {
      polygon:          process.env.POLYGONSCAN_API_KEY ?? '',
      polygonAmoy:      process.env.POLYGONSCAN_API_KEY ?? '',
      avalanche:        process.env.SNOWTRACE_API_KEY   ?? '',
      avalancheFujiTestnet: process.env.SNOWTRACE_API_KEY ?? '',
      base:             process.env.BASESCAN_API_KEY    ?? '',
      baseSepolia:      process.env.BASESCAN_API_KEY    ?? '',
    },
    customChains: [
      {
        network:  'polygonAmoy',
        chainId:  80002,
        urls: {
          apiURL:     'https://api-amoy.polygonscan.com/api',
          browserURL: 'https://amoy.polygonscan.com',
        },
      },
      {
        network:  'baseSepolia',
        chainId:  84532,
        urls: {
          apiURL:     'https://api-sepolia.basescan.org/api',
          browserURL: 'https://sepolia.basescan.org',
        },
      },
    ],
  },

  paths: {
    // './' made node_modules part of the source tree, so Hardhat treated
    // OpenZeppelin's contracts as local files and refused to compile (HH1006).
    sources:  './src',
    tests:    './test',
    cache:    './cache',
    artifacts:'./artifacts',
  },
}
