# Testnet funding & deployment — status

**9 chains live, 76/77 on-chain checks.** Six were funded with **no human
involvement**; three still need one, and it is sybil-resistance rather than
anything technical.

## ✅ Deployed

| Chain | Address | How it was funded |
|---|---|---|
| Stellar testnet | `CBVB7GK65CN2KB4NMQ3CGC6LIHFQU7IZ46KWZTUHKAFLO4BT6EBB4FFW` | friendbot (open HTTP) |
| EVM — Oasys | `0x52785B7eF9Ff8d9fc88497cd3cA10098602814f6` | the only EVM faucet with no captcha/login |
| EVM — Ronin Saigon | `0xe45404C32961569879c2b2b6FF8d42585332c5C4` | human (Axie-rotation puzzle) |
| NEAR testnet | `cryptoland-ms86s8tc.testnet` | `helper.testnet.near.org` POST — creates *and* funds |
| Aptos testnet | `0xd2e9cd1e…865330` | human (browser bearer token) |
| Tezos shadownet | `KT1JR46QvFEweVdBntzcw8a1z1yPbwG9g2NX` | human (captcha) |
| Flow testnet | `0xc5aef0580ee607ca` | human (captcha) — via **/create-account**, not /fund-account |
| Sui devnet | `0x991e76819def…414d2c` | **`sui client faucet`** — no browser |
| Solana devnet | `7MRdUfDa…61iXi` ⚠️ | human (GitHub) |

## 🔑 The order that works

Learned after wrongly reporting nine chains as human-gated when six were not:

1. **The official CLI probably has a faucet.** `sui client faucet` funds devnet in
   one command.
2. **devnet ≠ testnet.** Sui's testnet faucet redirects to a browser; devnet is
   fully programmatic. Same chain, different gate.
3. **Generate the key yourself.** Addresses are pure crypto — ed25519 + blake2b +
   bech32/base58. "Connect wallet" is about naming a recipient, not needing an
   extension.
4. **Try the Linux box FIRST.** Toolchains that fight macOS often just work there.
5. **Only then ask a person** — and only for captchas and social logins, which are
   deliberate anti-bot controls. Captcha-solving services are declined.

## Remaining — ~2 minutes of clicks

| Chain | URL | Paste |
|---|---|---|
| **Starknet** | `starknet-faucet.vercel.app` (GitHub) or the **Consensys MetaMask Snap** | address derived at deploy |
| **Algorand** | `algokit dispenser login` then `algokit dispenser fund` | `QRIYMYF5ZPIVHDHCQ5PVJWKJ5Z4N4RBN4URVB5L3PYUEZEERJFIP7XWDKA` |
| **MultiversX** | `devnet-wallet.multiversx.com/faucet` | `erd1z2c556ttgpaua8j5dsqm0wyzdsdrgx7asatm337vfl3gv84f8pmsf4au7h` |

Also outstanding: **one more Solana airdrop** to push the `declare_id` fix (the
deployed program currently fails every instruction), and **Cardano**, which is
funded but is UTXO — there is no contract to install, only a validator referenced
by a spending transaction.

## Blocked on tooling, not funding

**Radix is funded** — 10,000 XRD, obtained with no wallet by calling its on-chain
faucet component directly. But `scrypto build` will not produce a wasm: `blst`
fails to link under Apple clang on macOS, and on Linux `rust-lld` rejects the
Radix Engine host functions (`object_call`, `buffer_consume`, `sys_panic`) as
undefined symbols when they are meant to be wasm imports. `--allow-undefined`
never reaches the linker because `scrypto build` overrides RUSTFLAGS. The contract
itself passes its 5 tests.

## Keys

`contracts/.testnet/`, `contracts/flow/flow.json`, `~/.config/solana/` — all
gitignored. Throwaway testnet keys, but keys nonetheless. A history scan for
`privateKey`, `edsk`, `seed`, `skey` and `mnemonic` across all commits returns
zero.
