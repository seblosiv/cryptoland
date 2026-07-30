# Contracts

## Status

| Chain family | Language | Status |
|---|---|---|
| **EVM** (15 chains) | Solidity | ✅ `src/CryptoLandTile.sol` — compiles, **19/19 tests pass** |
| **Starknet** | Cairo | ✅ `starknet/` — compiles (scarb 2.11.4, Sierra artifact emitted) |
| Solana | Rust / Anchor | ⬜ not written |
| Aptos, Sui | Move | ⬜ not written |
| TON | FunC / Tolk | ⬜ not written |
| Tezos | SmartPy / LIGO | ⬜ not written |
| NEAR | Rust | ⬜ not written |
| Cardano | Aiken / Plutus | ⬜ not written |
| Algorand, Stellar, MultiversX, Radix | see below | ⬜ mostly no contract needed |

## The one invariant every chain must satisfy

```
token_id = (tx << 15) | ty        tx, ty ∈ [0, 16383]
```

Equivalently `(tx * 32768) + ty` — identical because `ty < 2^15`, so the OR never
carries. Verified against the Solidity, JS and Cairo implementations:

| tx | ty | `(tx<<15)\|ty` | `(tx*32768)+ty` |
|---|---|---|---|
| 16383 | 16383 | 536854527 | 536854527 |
| 100 | 200 | 3277000 | 3277000 |

**If any chain computes this differently, the same tile gets a different id per
chain and the cross-chain story breaks silently.** `src/test/chains.test.js`
enforces it on the JS side; each contract must match.

## Effort, honestly assessed

Writing 12 contracts is *not* 12 × the Solidity effort. Four chains need almost no
contract at all, because their token standard is a protocol primitive:

- **Algorand** — an ASA is created by an `AssetConfig` transaction. No contract for
  issuance; PyTeal only if you want on-chain marketplace logic.
- **Stellar** — assets are protocol-level. Soroban contract only for the marketplace.
- **MultiversX** — ESDT NFTs are issued by a builtin function call.
- **Radix** — non-fungible resources are native; a Scrypto blueprint is optional.

Seven have well-maintained reference implementations to build on:

- **Starknet** — OpenZeppelin Cairo (done)
- **Solana** — Metaplex Token Metadata / Core; can mint with no custom program
- **Aptos** — `aptos-token-objects` framework
- **Sui** — Move examples; the object model does most of the work
- **NEAR** — `near-contract-standards` NEP-171 crate
- **TON** — `ton-blockchain/token-contract` (audited TEP-62 collection + item)
- **Tezos** — SmartPy / LIGO reference FA2

**Cardano is the genuine outlier.** Minting a native asset needs only a policy
script, but per-tile ownership and a marketplace in a UTXO model means Plutus/Aiken
validators — a different mental model, not a translation.

## Do not write a contract you cannot compile

Each of these needs its own toolchain, and an unverified contract that holds asset
ownership is worse than no contract. This repo installs a toolchain before adding a
chain — that is why Starknet is done and the rest are not.

Currently installed: `solc` (via hardhat), `scarb` 2.11.4 (Cairo), `cargo`.

## Build

```bash
# EVM
cd contracts && npx hardhat compile && npx hardhat test

# Starknet
cd contracts/starknet && scarb build
```
