# Contracts

**13 contracts, 13 compiling.** One Solidity contract covers all 15 EVM chains;
the other 12 chains each need their own language.

| Chain | Language | Status | Artifact |
|---|---|---|---|
| **15 EVM chains** | Solidity | ✅ **34/34 tests** | — |
| Starknet | Cairo | ✅ compiles | Sierra |
| Cardano | Aiken / Plutus V3 | ✅ **4/4 tests** | Plutus |
| Algorand | PyTeal | ✅ compiles | 2.7 KB TEAL |
| Sui | Move | ✅ **1/1 test** | — |
| Solana | Anchor / Rust | ✅ **2/2 tests** | — |
| MultiversX | Rust / ESDT | ✅ compiles | — |
| TON | FunC (TEP-62) | ✅ compiles | 507-byte BOC |
| Aptos | Move | ✅ compiles | — |
| Radix | Scrypto | ✅ **1/1 test** | — |
| Stellar | Soroban / Rust | ✅ compiles | 21 KB WASM |
| NEAR | Rust | ✅ compiles | 273 KB WASM |
| Tezos | CameLIGO (FA2) | ✅ compiles | 7.2 KB Michelson |

## Every contract implements the same rules

- **Primary sale → 100% to treasury.** The project sells the land, so it takes the
  whole payment. Not a fee on someone else's trade.
- **Resale → 7% default**, with a **hard 10% ceiling** that a compromised owner key
  cannot exceed.
- **`withdraw()` any time**, no timelock, to…
- **`treasuryReceiver`** — a payout address separable from the admin key, so revenue
  can sit on a cold wallet while the hot key keeps administering.
- **Accounting zeroed before any external effect**, on every chain.

## The one invariant

```
token_id = (tx << 15) | ty        tx, ty ∈ [0, 16383]
```

Cairo, Aiken and CameLIGO have no shift on their integer type, so they compute
`(tx * 32768) + ty` — identical because `ty < 2^15` means the OR never carries.
Verified at `(16383, 16383) → 536854527` in every language.

## Toolchains

Everything is built on the prod server (`/srv/cryptoland/contracts`), which has
rustc 1.97 against the Mac's 1.90.

```
solc (hardhat) · scarb 2.11.4 · aiken v1.1.9 · pyteal · sui 1.76 · aptos 9.5.0
cargo + wasm32-unknown-unknown · func-js 0.4.6 · ligo 1.15.6
```

Two substitutions worth recording:

- **Tezos is CameLIGO, not SmartPy.** The pip package named `smartpy` is an
  unrelated project, and both documented SmartPy installers return HTML. LIGO ships
  an ARM64 binary that works.
- **Stellar and NEAR build as `wasm32-unknown-unknown`**, which is the deployable
  artifact. Their `cargo test` harnesses pull `soroban-env-host` / `near-sdk`
  host crates that clash with rustc 1.97 — a test-harness problem, not a contract
  problem.

## Build

```bash
cd contracts && npx hardhat test                    # EVM, 34 tests
cd contracts/starknet && scarb build
cd contracts/cardano  && aiken check                # 4 tests
cd contracts/algorand && python3 cryptoland_tile.py
cd contracts/sui      && sui move test
cd contracts/aptos    && aptos move compile --named-addresses cryptoland=0x1
cd contracts/tezos    && ligo compile contract cryptoland_tile.mligo -o tile.tz
cd contracts/ton      && npx func-js contracts/stdlib.fc contracts/cryptoland_tile.fc --boc tile.boc
# Rust (on prod): solana, radix, multiversx, near, stellar
cargo build --target wasm32-unknown-unknown --release
```
