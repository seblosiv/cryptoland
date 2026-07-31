# Testnet funding — the last 36% (2026-07-31)

Contract readiness across the 45 actionable grant programmes:

| Milestone | Status |
|---|---|
| Contract compiled + verified | **45/45 — 100%** |
| Proven on a real testnet | **29/45 — 64%** |
| Deployed on mainnet | 0/45 — 0% |

Nine chains close the gap: Solana, Sui, Starknet, Cardano, Algorand, MultiversX,
Radix, Tezos, Flow.

## Why this needs a human

**Every one of the nine faucets is deliberately human-gated.** A survey with a
real headless browser found: captcha (Cardano, Flow), wallet-connect or social
login (Solana, Sui, Starknet, Algorand), or a JS-only flow (MultiversX). Starknet
advertises an API "for a script or AI agent", but every documented endpoint
returns 404 — only the GitHub-auth route works.

This is not a code problem and not something to engineer around; faucet abuse
protection has tightened across the whole ecosystem. Aptos and Ronin were funded
exactly this way and both deployed within a minute afterwards.

**Nothing below costs money.** These are all free testnet tokens.

## Addresses to paste

```
Solana    RMctie1kFQGdX3gJneumjKfayQZSyCvhGaq2RTfMx2M
Sui       0x82c45d90dcb6cbd737fd7bc693440bc1d3c507b7e9ae49d61b3b63a0c2d85a57
Algorand  QRIYMYF5ZPIVHDHCQ5PVJWKJ5Z4N4RBN4URVB5L3PYUEZEERJFIP7XWDKA
Tezos     tz1Whez4WzFAHmdaeUnXCgX3rNyGEh4TG5QT
Flow      (public key, not an address — the faucet creates the account)
          9bd43b368620eb46e6a05ce69d4e8201ec19834f5852befac942edd5c26fa798b5e4650ab51b94a499b0f4ef792bf934e3a4fe7bc92303f69783d9e516ba44d6
```

Keys live in `contracts/.testnet/` and `~/.config/solana/`, both gitignored.
They are throwaway testnet keys and hold nothing of value — but they are still
keys, so they are not committed.

## Where to click

| # | Chain | URL | What it wants |
|---|---|---|---|
| 1 | **Solana** | https://faucet.solana.com | paste address, sign in with GitHub |
| 2 | **Sui** | https://faucet.sui.io | connect a wallet, then paste the address above |
| 3 | **Algorand** | https://bank.testnet.algorand.network | paste address |
| 4 | **Tezos** | https://faucet.ghostnet.teztnets.xyz | paste address, solve captcha |
| 5 | **Flow** | https://faucet.flow.com/fund-account | paste the PUBLIC KEY, solve captcha |
| 6 | **Starknet** | https://starknet-faucet.vercel.app | connect GitHub (100 STRK without) |
| 7 | **Cardano** | https://docs.cardano.org/cardano-testnets/tools/faucet | captcha; needs an address from a Cardano wallet |
| 8 | **MultiversX** | https://devnet-wallet.multiversx.com/faucet | create a wallet in-page, then request |
| 9 | **Radix** | https://stokenet-console.radixdlt.com | connect the Radix wallet; the faucet is an on-chain component |

**Do the first five if you only have ten minutes** — those take a paste and a
click each. The last four need a wallet created in-browser first.

## What happens after

Say the word and each deploys unattended:

- **Solana** — `anchor deploy --provider.cluster devnet`
- **Sui** — `sui client publish`
- **Algorand** — deploy `approval.teal` via the SDK
- **Tezos** — `octez-client originate` from the CameLIGO build
- **Flow** — `flow project deploy --network testnet`
- **Starknet** — `sncast declare` + `deploy` from the Sierra artifact
- **MultiversX / Radix / Cardano** — SDK deploy from the built artifact

Then the same on-chain checks every other deployment got: the tokenId invariant
at (16383,16383) → 536854527, bounds rejection, the 7% fee default, and — where
the chain has a treasury — a real purchase and a withdrawal to a **separate cold
wallet**.

## Why it is worth doing

**Five testnet deployments have produced five defects that tests missed:**

1. Soroban **rejected** the `wasm32-unknown-unknown` artifact ("reference-types
   not enabled") — the build passed every test and could not be deployed
2. `cargo-near` refused to build NEAR at all (rustc newer than near-sdk allows)
3. The EVM contract had a **tokenId collision** — `(1,0)` and `(0,32768)` both
   returned 32768, and any `uint256` was claimable as a tile
4. Aptos's `token_id_from_key` was not marked `#[view]`, so no off-chain caller
   could read it
5. Ronin Saigon's chainId in config was **2021**; the live chain is **202601**

That is a 100% hit rate. There is no reason to assume the remaining nine are
cleaner, and each one is free to check.
