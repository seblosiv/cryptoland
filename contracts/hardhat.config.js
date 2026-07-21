/**
 * Hardhat config — CryptoLand
 * ============================
 * Usage:
 *   npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
 *   npx hardhat compile
 *   npx hardhat run scripts/deploy.js --network polygon-amoy
 *   npx hardhat verify --network polygon-amoy 0xCONTRACT_ADDRESS "CryptoLand Tiles" "CLND" "https://api.cryptoland.io/metadata/polygon-amoy/"
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
      url:      'https://polygon-rpc.com',
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
      url:      'https://eth.llamarpc.com',
      chainId:  1,
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
    sources:  './',
    tests:    './test',
    cache:    './cache',
    artifacts:'./artifacts',
  },
}
