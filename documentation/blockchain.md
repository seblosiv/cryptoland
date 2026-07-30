# Blockchain Architecture — CryptoLand

## Overview

CryptoLand uses a **chain-agnostic adapter pattern** — the same application code targets any supported blockchain by changing a single build-time environment variable (`VITE_CHAIN`). All blockchain-specific logic is isolated in `src/lib/blockchain/`.

CryptoLand ships as **one codebase → N chain-native builds** (one `VITE_CHAIN` per deployment). Ownership is DB-canonical within a build; an on-chain contract, deployed later, anchors it and enables NFT minting. Until a chain's contract address is set, `mintTile()` is stubbed (`{ minted: false }`) and purchases still work off the DB. For the full per-chain-build model, the 29 chain targets, and deploy steps, see [multichain.md](multichain.md). This doc covers the adapter interface, the EVM contract, and wallet auth.

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
    _shared.js           ← Shared tile↔tokenId map + mint-stub helpers (non-EVM reuse)
    evm.js               ← EVM adapter: Polygon, Avalanche, Base, Arbitrum, Ronin, BNB, Ethereum
    solana.js            ← Solana adapter: Phantom, Solflare, Backpack
    ton.js               ← TON adapter: TON Connect, Tonkeeper, OpenMask, Telegram Mini App
    aptos.js             ← Aptos adapter: Petra, Martian, Pontem, Nightly
    sui.js               ← Sui adapter
  contracts/
    abi.json             ← EVM ABI matching CryptoLandTile.sol

contracts/
  CryptoLandTile.sol     ← ERC-721 contract (no OpenZeppelin dependency)
  hardhat.config.js      ← Hardhat multi-chain config
  deploy.js              ← Deploy script (raw JSON-RPC)
  scripts/deploy.js      ← Hardhat deploy script
  test/
    CryptoLandTile.test.js ← Full test suite (Hardhat + Chai)
```

## Supported Chains

Mainnet chains (each has a matching testnet key in `config.js` — e.g. `polygon-amoy`,
`avalanche-fuji`, `base-sepolia`, `arbitrum-sepolia`, `ronin-saigon`, `bnb-testnet`,
`solana-devnet`, `ton-testnet`, `aptos-testnet`, `sui-testnet`):

| Chain | Family | Adapter | Chain ID | Contract Env Var |
|-------|--------|---------|----------|-----------------|
| Polygon | EVM | `evm.js` | 137 | `VITE_CONTRACT_POLYGON` |
| Avalanche | EVM | `evm.js` | 43114 | `VITE_CONTRACT_AVALANCHE` |
| Base | EVM | `evm.js` | 8453 | `VITE_CONTRACT_BASE` |
| Arbitrum One | EVM | `evm.js` | 42161 | `VITE_CONTRACT_ARBITRUM` |
| Ronin | EVM | `evm.js` | 2020 | `VITE_CONTRACT_RONIN` |
| BNB Smart Chain | EVM | `evm.js` | 56 | `VITE_CONTRACT_BNB` |
| Ethereum | EVM | `evm.js` | 1 | `VITE_CONTRACT_ETHEREUM` |
| Solana | Solana | `solana.js` | mainnet-beta | `VITE_CONTRACT_SOLANA` |
| TON | TON | `ton.js` | ton-mainnet | `VITE_CONTRACT_TON` |
| Aptos | Aptos | `aptos.js` | aptos-mainnet | `VITE_CONTRACT_APTOS` |
| Sui | Sui | `sui.js` | sui-mainnet | `VITE_CONTRACT_SUI` |

Each chain maps to a grant program — see the chain → grant table in
[multichain.md](multichain.md).

## Adapter Interface

Every adapter (EVM, Solana, TON, Aptos, Sui) implements the identical surface that
`index.js` destructures and re-exports: `connect`, `disconnect`, `getAddress`,
`getChainId`, `switchChain`, `signMessage`, `signPurchase`, `mintTile`, `listForSale`,
`unlistTile`, `buyTile`, `ownerOf`, `getTileData`, `getOwnedTokenIds`, `totalSupply`,
`waitForTx`, `onAccountsChanged`/`onChainChanged`/`onDisconnect`/`removeListeners`,
`detectWallets`, `tileTokenId`, `tokenIdToTile`, and `ADAPTER_TYPE`. `connect` +
`signPurchase` work today with no contract; `mintTile` is stubbed until
`VITE_CONTRACT_<CHAIN>` is set. Full interface table: [multichain.md](multichain.md).

## Adding a New Chain

1. Add entry to `CHAINS` in `src/lib/blockchain/config.js`
2. If EVM: no adapter changes needed
3. If non-EVM: create `adapters/<family>.js` implementing the interface, register it
   in the `ADAPTERS` map in `index.js`
4. Add an `env/.env.<chain>` template and the chain to `scripts/build-chain.sh`
5. Set `VITE_CHAIN=<key>` and build (`npm run build:chain <chain>`)
6. Deploy contract, then set `VITE_CONTRACT_<KEY>=0x...` and rebuild — the mint layer
   activates automatically

See [multichain.md](multichain.md) for the full walkthrough and grant-owner deploy steps.

## ERC-721 Contract: CryptoLandTile.sol

### Token ID Scheme
```
EVM:      tokenId = (BigInt(tx) << 15n) | BigInt(ty)   // bit-packed  (evm.js + CryptoLandTile.sol)
Non-EVM:  tokenId = BigInt(tx) * 16384n + BigInt(ty)   // multiplied  (_shared.js: GRID = 16384)
```
- Z14 Web Mercator: 16384×16384 grid
- Both are unique, deterministic, and round-trip via `tokenIdToTile()`
- EVM packing fits in 29 bits (well within uint256) and matches `tokenIdFromKey` in
  `contracts/CryptoLandTile.sol`
- The **tile key string** `"tx:ty"` is the true cross-chain identity; the numeric
  tokenId is a per-family derivation of it. TON/Aptos/Sui/Solana share the `_shared.js`
  multiplied encoding, so a tile has the same tokenId across every non-EVM family.

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
**TON:** TON Connect, Tonkeeper, OpenMask, Telegram Mini App wallet
**Aptos:** Petra, Martian, Pontem, Nightly
**Sui:** Sui-standard wallets

Each adapter's `detectWallets()` enumerates what's available for its family.

### Connection Flow
1. User clicks "Connect" in HUD
2. `WalletModal` opens. The option list is `PROFILE.wallets` from
   `lib/chainProfile.js` (a profile may name its own ecosystem wallets; otherwise
   the profile resolves the per-family fallback in `WALLETS_BY_FAMILY`), and the
   header CTA uses `PROFILE.connectLabel`. `detectWallets()` then marks which of
   those are actually installed
3. `walletStore.connect()` calls `blockchain.connect()`
4. EVM adapter: `eth_requestAccounts` + auto-switch to active chain
5. Chain mismatch: `wallet_switchEthereumChain` or `wallet_addEthereumChain`
   (non-EVM `switchChain()` is a no-op — a build targets one network)
6. On success: address persisted to localStorage, wallet events subscribed
7. `tryReconnect()` on app boot: silently reconnects if wallet still authorized

### SIWE Wallet Authentication

Connecting a wallet to a backend account requires proof of wallet control (a
signed nonce), not just the address:

1. `POST /auth/wallet/nonce` `{ wallet }` → `{ nonce, message }` (server stores the
   nonce in `wallet_nonces`).
2. Wallet signs `message` via EVM `personal_sign`.
3. `POST /auth/link-wallet-upsert` `{ wallet, signature, nonce }` → server recovers
   the signer with `eth-account` and requires a match; nonce consumed on use.

Dev bypass: `ALLOW_UNSIGNED_WALLET_AUTH=1`. Full detail in [auth.md](auth.md).

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

## Sui: JSON-RPC on public fullnodes is deprecated (2026-07-30)

`https://fullnode.mainnet.sui.io` — which was our primary — now answers **every**
method with `-32601` and a notice to migrate to gRPC or GraphQL. Our adapter speaks
only JSON-RPC, so the primary was dead for every transaction lookup while
`check-rpcs.mjs` was the only thing that noticed.

Primary is now `sui-rpc.publicnode.com` (`Access-Control-Allow-Origin: *`), with
`sui-mainnet-endpoint.blockvision.org` as the fallback. Both still serve JSON-RPC.

**The adapter now speaks GraphQL.** `waitForTx()` queries
`transactionEffects(digest){ status }` against `graphql.mainnet.sui.io/graphql`
(found by introspecting the schema — the field is `transactionEffects`, not
`transactionBlock`, and the status enum is `SUCCESS`/`FAILURE`). That endpoint
sends `Access-Control-Allow-Origin: *`, so the browser reads it directly.

JSON-RPC is kept as a **fallback**, not removed: the third-party endpoints we
point at still serve it, and it is the only thing that works when a deployment
overrides `rpcUrl` with a private node. The new `graphqlUrl` field on a chain
config is null everywhere except Sui.

Re-run `node scripts/check-rpcs.mjs` before every submission round — this is
exactly the failure mode it exists to catch.
