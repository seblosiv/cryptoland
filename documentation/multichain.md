# Multichain — CryptoLand

## Overview

CryptoLand ships as **ONE codebase that produces N chain-native builds** — not one
app that spans every chain at runtime. Each deployment picks a single target chain
at build time (`VITE_CHAIN`) and becomes a chain-native bundle in `dist-<chain>/`.
This lets the same product be submitted to 10+ blockchain grant programs, each as a
first-class native app for that chain.

The ownership model is deliberately layered so a chain works the day it's submitted,
before any smart contract exists:

1. **Backend DB is canonical.** Within a given build, tile ownership lives in the
   SQLite `blocks` table (`chain` column records which chain that build targets).
   Purchases, marketplace, guardians, DAO — all work off the DB.
2. **On-chain contract is the anchor (deployed later).** When the grant owner
   deploys a contract for a chain and sets `VITE_CONTRACT_<CHAIN>`, that build's
   NFT layer lights up automatically — mints anchor the DB ownership on-chain and
   an optional NFT is minted to the buyer.
3. **Mint is stubbed until deploy.** With no contract address set, `mintTile()`
   returns `{ minted: false }` instead of throwing. Connect + sign + purchase all
   work today; only the on-chain mint is skipped.

> One codebase → one `VITE_CHAIN` per build → DB-canonical ownership now → on-chain
> anchor + NFT mint the moment `VITE_CONTRACT_<CHAIN>` is set. Nothing else changes.

---

## The 13 grant targets

10 of these are **chains** (each gets its own native build); 3 are **funding
programs** that fund a build on an existing chain rather than adding a new chain.

### Chains (one build each)

| Chain | Family | Adapter | Grant program | `VITE_CHAIN` key(s) |
|-------|--------|---------|---------------|---------------------|
| TON | `ton` | `ton.js` | Telegram / TON **Mini App Grant** | `ton` · `ton-testnet` |
| Polygon | `evm` | `evm.js` | Polygon **Community Grants S2** | `polygon` · `polygon-amoy` |
| Avalanche | `evm` | `evm.js` | Avalanche **Retro9000** | `avalanche` · `avalanche-fuji` |
| Ronin | `evm` | `evm.js` | Ronin **Forge** | `ronin` · `ronin-saigon` |
| Base | `evm` | `evm.js` | Base **Builder Grants** | `base` · `base-sepolia` |
| Arbitrum | `evm` | `evm.js` | Arbitrum **Gaming Catalyst** | `arbitrum` · `arbitrum-sepolia` |
| Solana | `solana` | `solana.js` | Solana **Foundation** grant | `solana` · `solana-devnet` |
| BNB Smart Chain | `evm` | `evm.js` | BNB **MVB S10** | `bnb` · `bnb-testnet` |
| Aptos | `aptos` | `aptos.js` | Aptos **Ecosystem** grant | `aptos` · `aptos-testnet` |
| Sui | `sui` | `sui.js` | Sui **RFP** | `sui` · `sui-testnet` |

Ethereum (`ethereum`, EVM) is also present in the config as a general EVM target,
though it isn't tied to a named grant.

### Funding programs (not chains)

These fund a build on a chain we already support — no new adapter or chain key:

- **Gitcoin QF** — quadratic-funding round; typically pointed at the Base or
  Arbitrum build.
- **Alchemy WAGBI** — infrastructure/credits program; applies to any EVM build.
- **Alliance DAO** — accelerator/funding; program-level, chain-agnostic.

---

## Chain families & adapters

All chain-specific logic lives in `src/lib/blockchain/`:

```
src/lib/blockchain/
  config.js              ← CHAINS registry (every chain + its params) + active-chain selection
  index.js               ← loads the active family's adapter, re-exports the interface
  adapters/
    _shared.js           ← shared tile↔tokenId map + mint-stub helpers (non-EVM reuse)
    evm.js               ← Polygon, Avalanche, Base, Arbitrum, Ronin, BNB, Ethereum (+ testnets)
    solana.js            ← Solana (Phantom, Solflare, Backpack)
    ton.js               ← TON (TON Connect / Tonkeeper / OpenMask / Telegram Mini App)
    aptos.js             ← Aptos (Petra, Martian, Pontem, Nightly)
    sui.js               ← Sui
  contracts/
    abi.json             ← EVM ABI (matches contracts/CryptoLandTile.sol)
```

Five families exist: `evm`, `solana`, `ton`, `aptos`, `sui`. One `evm.js` adapter
covers all seven EVM chains — adding an EVM chain needs **no adapter changes**.

### Active-chain selection (`config.js`)

`VITE_CHAIN` selects one key from the `CHAINS` map at build time:

```js
export const ACTIVE_CHAIN_KEY = (import.meta.env.VITE_CHAIN in CHAINS)
  ? import.meta.env.VITE_CHAIN
  : 'polygon-amoy'          // safe fallback so a misconfigured build still boots
export const ACTIVE_CHAIN        = CHAINS[ACTIVE_CHAIN_KEY]
export const ACTIVE_CHAIN_FAMILY = ACTIVE_CHAIN.family
```

`config.js` also exports `MAINNET_CHAINS` (for any "supported chains" UI),
`CHAIN_CANONICAL_NAMES` (chain key → DB `chain` string, derived from the map keys),
`chainById()`, `explorerTxUrl()`, and `explorerNFTUrl()`.

### Adapter index (`index.js`)

`index.js` dynamically imports the adapter for `ACTIVE_CHAIN.family` and re-exports
its interface. **Consumers always import from `../lib/blockchain`, never from an
adapter directly.**

---

## The universal adapter interface

Every adapter (EVM, Solana, TON, Aptos, Sui) implements the identical surface that
`index.js` destructures:

| Symbol | Purpose |
|--------|---------|
| `connect()` | Connect wallet → `{ address, chainId, chainName }` |
| `disconnect()` | Disconnect / clear cached address |
| `getAddress()` | Current connected address or `null` |
| `getChainId()` | Active chain id |
| `switchChain()` | EVM: switch/add network. Non-EVM: no-op (a build targets one network) |
| `signMessage(msg)` | Sign an arbitrary message → `{ signature, address }` |
| `signPurchase({ tileKey, price })` | Sign the purchase intent (proof of wallet control) → `{ signature, message }` |
| `mintTile({ tx, ty, country, toAddress })` | Mint the tile NFT — **stubbed** (`{ minted:false }`) until a contract is set |
| `listForSale` / `unlistTile` / `buyTile` | On-chain marketplace ops (activate with the deployed contract) |
| `ownerOf` / `getTileData` / `getOwnedTokenIds` / `totalSupply` | On-chain reads |
| `waitForTx(hash)` | Poll for confirmation |
| `onAccountsChanged` / `onChainChanged` / `onDisconnect` / `removeListeners` | Wallet event listeners |
| `detectWallets()` | Enumerate installed/available wallets for this family |
| `tileTokenId(tx, ty)` / `tokenIdToTile(id)` | Deterministic tile ↔ tokenId mapping |
| `ADAPTER_TYPE` | Family string (`'evm' | 'solana' | 'ton' | 'aptos' | 'sui'`) |

### tile ↔ tokenId mapping

Two encodings exist, both deterministic and collision-free on the 16384×16384 (Z14)
grid, and both round-trip via `tokenIdToTile()`:

- **EVM** (`evm.js`): bit-packed — `tokenId = (BigInt(tx) << 15n) | BigInt(ty)`.
  Matches `tokenIdFromKey` in `contracts/CryptoLandTile.sol` (packs into 29 bits).
- **Non-EVM** (`_shared.js`, reused by TON/Aptos/Sui/Solana): multiplied —
  `tokenId = BigInt(tx) * 16384n + BigInt(ty)` (`GRID = 16384`). Identical across
  every non-EVM family, so a tile means the same NFT id whether minted on Sui, TON,
  or Aptos.

The tile *key* string (`"tx:ty"`) is the true cross-chain identity; the numeric
tokenId is a per-family derivation of it.

### Shared mint-stub behaviour (`_shared.js`)

```js
hasContract()   // Boolean(ACTIVE_CHAIN.contractAddress)
mintStub(reason)// { txHash:null, tokenId:null, minted:false, reason }
```

Each non-EVM adapter's `mintTile()` returns `mintStub(...)` when `!hasContract()`,
so the purchase flow completes cleanly and the NFT layer switches on automatically
the moment `VITE_CONTRACT_<CHAIN>` is set. The EVM adapter follows the same
"purchase works without a contract, mint activates when the address is set" pattern.

---

## Environment templates

Per-chain env templates live in `env/.env.<chain>` (committed as blanks; real values
are git-ignored). Example `env/.env.base`:

```bash
# CryptoLand build config — Base — Builder
VITE_API_BASE=
VITE_CHAIN=base
VITE_CONTRACT_BASE=
VITE_MARKETPLACE_BASE=
VITE_TOKEN_BASE=
```

`env/` has one template per grant chain: `.env.ton`, `.env.polygon`, `.env.avalanche`,
`.env.ronin`, `.env.base`, `.env.arbitrum`, `.env.solana`, `.env.bnb`, `.env.aptos`,
`.env.sui`. The master reference with every variable documented is
[`.env.example`](../.env.example) at the repo root.

Per chain the relevant vars are:

- `VITE_CHAIN` — which `CHAINS` key this build targets (required)
- `VITE_CONTRACT_<CHAIN>` — NFT contract address (blank until deployed; mint stays stubbed)
- `VITE_MARKETPLACE_<CHAIN>` — optional marketplace contract address
- `VITE_TOKEN_<CHAIN>` — optional `$CLND` token address
- `VITE_API_BASE` — API origin (empty = same-origin / dev proxy)

---

## Building per-chain bundles

`scripts/build-chain.sh` builds one target chain into `dist-<chain>/` so builds don't
overwrite each other. It stages `env/.env.<chain>` → `.env.production`, then runs
`vite build --outDir dist-<chain>`.

```bash
npm run build:chain base        # → dist-base/
npm run build:chain solana      # → dist-solana/
npm run build:all-chains        # build all 10 grant chains
```

The script's chain list is: `ton polygon avalanche ronin base arbitrum solana bnb
aptos sui`. Until a chain's `VITE_CONTRACT_<CHAIN>` is filled in, the build still
works — ownership is DB-backed and the on-chain mint is skipped.

---

## How to add a new chain

1. **Add an entry to `CHAINS`** in `src/lib/blockchain/config.js` (id, name, family,
   RPC URLs, explorer, native currency, `contractAddress: import.meta.env.VITE_CONTRACT_<KEY> ?? null`, etc.).
2. **EVM chain?** Nothing else in code — `evm.js` already covers it.
3. **New family?** Create `src/lib/blockchain/adapters/<family>.js` implementing the
   full interface above (reuse `_shared.js` for the tile↔tokenId map and mint stub),
   and register it in the `ADAPTERS` map in `index.js`.
4. **Add an env template** `env/.env.<chain>` and the `VITE_CONTRACT_<CHAIN>` var to
   `.env.example`.
5. **Add the chain to** the `CHAINS=(...)` array in `scripts/build-chain.sh`.
6. Build with `npm run build:chain <chain>`.

---

## Deploy steps for a grant owner

To take a chain from "works off the DB" to "on-chain NFTs live", the grant owner
does exactly this:

1. **Deploy the contract** for the chain (EVM: `contracts/CryptoLandTile.sol` via
   Hardhat — see [blockchain.md](blockchain.md); non-EVM: the chain's Move/program/
   collection equivalent).
2. **Set `VITE_CONTRACT_<CHAIN>`** in `env/.env.<chain>` (and optionally
   `VITE_MARKETPLACE_<CHAIN>` / `VITE_TOKEN_<CHAIN>`).
3. **Rebuild:** `npm run build:chain <chain>`.
4. **Done.** `hasContract()` is now true, `mintTile()` stops stubbing, and every new
   purchase mints/anchors on-chain automatically. No other code changes.

Nothing about the DB ownership record changes — the on-chain layer simply becomes
active on top of it.

---

## Related docs

- [blockchain.md](blockchain.md) — adapter details, the EVM `CryptoLandTile.sol`
  contract, and the SIWE wallet-auth flow.
- [architecture.md](architecture.md) — overall system architecture.
- [backend.md](backend.md) — the `blocks.chain` column and server endpoints.
