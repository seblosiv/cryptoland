# Blockchain Architecture — CryptoLand

## Overview

CryptoLand uses a **chain-agnostic adapter pattern** — the same application code runs on any supported blockchain by changing a single environment variable. All blockchain-specific logic is isolated in `src/lib/blockchain/`.

## Active Chain

Set in `.env`:
```
VITE_CHAIN=polygon-amoy    # testnet default
VITE_CHAIN=polygon         # mainnet
VITE_CHAIN=avalanche-fuji  # Avalanche testnet
VITE_CHAIN=base-sepolia    # Base testnet
```

## Directory Structure

```
src/lib/blockchain/
  config.js              ← Chain registry (all supported chains + their configs)
  index.js               ← Active adapter re-export (consumers import from here)
  adapters/
    evm.js               ← EVM adapter: Polygon, Avalanche, Base, Ethereum
    solana.js            ← Solana adapter: Phantom, Solflare, Backpack
  contracts/
    abi.json             ← Universal ABI matching CryptoLandTile.sol

contracts/
  CryptoLandTile.sol     ← ERC-721 contract (no OpenZeppelin dependency)
  hardhat.config.js      ← Hardhat multi-chain config
  deploy.js              ← Deploy script (raw JSON-RPC)
  scripts/deploy.js      ← Hardhat deploy script
  test/
    CryptoLandTile.test.js ← Full test suite (Hardhat + Chai)
```

## Supported Chains

| Chain | Family | Chain ID | Contract Env Var |
|-------|--------|----------|-----------------|
| Polygon | EVM | 137 | `VITE_CONTRACT_POLYGON` |
| Polygon Amoy (testnet) | EVM | 80002 | `VITE_CONTRACT_POLYGON_AMOY` |
| Avalanche | EVM | 43114 | `VITE_CONTRACT_AVALANCHE` |
| Avalanche Fuji (testnet) | EVM | 43113 | `VITE_CONTRACT_AVALANCHE_FUJI` |
| Base | EVM | 8453 | `VITE_CONTRACT_BASE` |
| Base Sepolia (testnet) | EVM | 84532 | `VITE_CONTRACT_BASE_SEPOLIA` |
| Ethereum | EVM | 1 | `VITE_CONTRACT_ETHEREUM` |
| Solana | Solana | mainnet-beta | `VITE_CONTRACT_SOLANA` |
| Solana Devnet | Solana | devnet | `VITE_CONTRACT_SOLANA_DEVNET` |

## Adding a New Chain

1. Add entry to `CHAINS` in `src/lib/blockchain/config.js`
2. If EVM: no adapter changes needed
3. If non-EVM: create `adapters/<family>.js` implementing the interface
4. Set `VITE_CHAIN=<key>` in `.env`
5. Deploy contract: `npx hardhat run contracts/scripts/deploy.js --network <key>`
6. Set `VITE_CONTRACT_<KEY>=0x...` in `.env`

## ERC-721 Contract: CryptoLandTile.sol

### Token ID Scheme
```
tokenId = (tx << 15) | ty
```
- Z14 Web Mercator: 16384×16384 grid
- Unique, deterministic from coordinates
- Fits in uint29 (well within uint256)
- Matches `tileTokenId(tx, ty)` in `adapters/evm.js`

### Multi-Chain Ownership
Tile ownership is tracked globally across all chains — a `tile_key` can only be owned once, regardless of which chain the purchase was made on. The `chain` field in the DB records which chain finalized the purchase. Use `CHAIN_CANONICAL_NAMES[ACTIVE_CHAIN_KEY]` to get the correct string for the DB.

### Z11 → Z14 Migration
Existing Z11 data (coords ≤ 2047) can be migrated with:
```
python3 server/migrations/migrate_z11_to_z14.py
```
Migration formula: `new_tx = old_tx * 8 + 4`, `new_ty = old_ty * 8 + 4` (maps each Z11 tile to the center Z14 tile of its 8×8 block).

### Key Functions

| Function | Description |
|----------|-------------|
| `mint(to, tokenId, tileKey, country)` | Mint tile NFT (owner/minter only) |
| `listForSale(tokenId, priceWei)` | List tile for peer-to-peer sale |
| `unlist(tokenId)` | Remove listing |
| `buy(tokenId)` | Purchase listed tile, pays seller minus 2.5% fee |
| `tokensOfOwner(address)` | All token IDs for a wallet |
| `tileData(tokenId)` | Tile key, country, mintedAt, listPrice, listed |
| `tokenIdFromKey(tx, ty)` | Compute token ID from coordinates |
| `withdrawFees()` | Owner withdraws accrued protocol fees |
| `setMinter(address)` | Whitelist backend minter for gasless mints |

### Fee Structure
- **Mint fee:** 2.5% of `msg.value` (configurable, max 10%)
- **Marketplace fee:** 2.5% of sale price (configurable, max 10%)
- Fees accrue in contract, withdrawn via `withdrawFees()`

### Security
- No OpenZeppelin dependency (leaner bytecode, simpler audit surface)
- Reentrancy: listing state cleared before transfer in `buy()`
- Ownership: 2-step transfer (`transferOwnership` + `acceptOwnership`)
- Emergency pause: `setPaused(true)` blocks mint + buy + transferFrom
- Minter role: separate address for backend gasless minting

## Deployment

### Prerequisites
```bash
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
```

### Testnet deploy (Polygon Amoy)
```bash
export DEPLOY_PK=0xYourPrivateKey
export POLYGONSCAN_API_KEY=YourKey
npx hardhat run contracts/scripts/deploy.js --network polygon-amoy
npx hardhat verify --network polygon-amoy 0xCONTRACT "CryptoLand Tiles" "CLND" "https://api.cryptoland.io/metadata/polygon-amoy/"
```

### Mainnet deploy (Polygon)
```bash
npx hardhat run contracts/scripts/deploy.js --network polygon
```

The deploy script automatically:
1. Deploys the contract
2. Writes `VITE_CONTRACT_<CHAIN>=0x...` to `.env`
3. Saves `contracts/compiled/deployment-<chain>.json`

## Wallet Integration

### Supported Wallets
**EVM chains:** MetaMask, Coinbase Wallet, Rabby, any EIP-1193 injected wallet
**Solana:** Phantom, Solflare, Backpack

### Connection Flow
1. User clicks "Connect" in HUD
2. `WalletModal` opens, detects installed wallets
3. `walletStore.connect()` calls `blockchain.connect()`
4. EVM adapter: `eth_requestAccounts` + auto-switch to active chain
5. Chain mismatch: `wallet_switchEthereumChain` or `wallet_addEthereumChain`
6. On success: address persisted to localStorage, wallet events subscribed
7. `tryReconnect()` on app boot: silently reconnects if wallet still authorized

### NFT Minting Flow
1. Payment confirmed via NOWPayments
2. `_finalizeBlock()` writes block to DB (source of truth regardless)
3. If wallet connected + contract deployed: `mintTile()` fires non-blocking
4. On success: tx hash recorded via `POST /nft/mint`, wallet portfolio updated
5. Failure: non-fatal — block still owned in DB, can re-mint later

## Wallet Store (`src/store/walletStore.js`)

```js
const { address, chainId, ownedTiles, txHistory } = useWalletStore()
useWalletStore.getState().openWalletModal()
useWalletStore.getState().connect()
useWalletStore.getState().disconnect()
useWalletStore.getState().recordTx({ type, tileKey, txHash })
```

## Environment Variables

```bash
# Chain selection
VITE_CHAIN=polygon-amoy

# Contract addresses (set by deploy script)
VITE_CONTRACT_POLYGON=0x...
VITE_CONTRACT_POLYGON_AMOY=0x...
VITE_CONTRACT_AVALANCHE=0x...
VITE_CONTRACT_AVALANCHE_FUJI=0x...
VITE_CONTRACT_BASE=0x...
VITE_CONTRACT_BASE_SEPOLIA=0x...
VITE_CONTRACT_ETHEREUM=0x...
VITE_CONTRACT_SOLANA=ProgramId...

# Marketplace (if separate contract)
VITE_MARKETPLACE_POLYGON=0x...

# Token ($CLND)
VITE_TOKEN_POLYGON=0x...
```
