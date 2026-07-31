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
Tezos     tz1Whez4WzFAHmdaeUnXCgX3rNyGEh4TG5QT   ← FUNDED, contract deployed
Cardano   addr_test1vqh4y67ws8jhj2pmnq6ml6gs6lx636pvn5ep6909lxtwczq0cnup3
Flow      (128-char PUBLIC KEY — use /create-account, NOT /fund-account)
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
| 4 | ~~Tezos~~ | **DONE 2026-07-31** | deployed: `KT1JR46QvFEweVdBntzcw8a1z1yPbwG9g2NX` |
| 5 | **Flow** | https://faucet.flow.com/**create-account** | paste the 128-char PUBLIC KEY + captcha → 100,000 FLOW |
| 6 | **Starknet** | https://starknet-faucet.vercel.app | connect GitHub (100 STRK without) |
| 7 | **Cardano** | https://docs.cardano.org/cardano-testnets/tools/faucet | captcha; address generated: `addr_test1vqh4y67ws8jhj2pmnq6ml6gs6lx636pvn5ep6909lxtwczq0cnup3` |
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

---

## Corrections found while funding (2026-07-31)

**Tezos Ghostnet is retired.** `faucet.ghostnet.teztnets.xyz` is now a parked
domain for sale. teztnets.com lists bakingnet / **shadownet** / ushuaianet, and
`config.js` already targets shadownet — the config was right, the funding doc was
not. Faucet: `https://faucet.shadownet.teztnets.com/` → "Fund any address".

**Flow: use `/create-account`, not `/fund-account`.** A Flow account does not
exist until it is created on-chain, so the fund page rejects a public key with
*"Address must be a 16-character Cadence address"*. The create page takes the
128-character public key and mints the account with **100,000 testnet FLOW**.

**Algorand's `bank.testnet.algorand.network` is an explorer**, not a dispenser —
it wants a connected wallet.

## Status

| Chain | State |
|---|---|
| **Tezos shadownet** | ✅ **DEPLOYED** — `KT1JR46QvFEweVdBntzcw8a1z1yPbwG9g2NX` |
| Flow | address generated; needs /create-account + captcha |
| Cardano | address generated; needs captcha |
| Solana | address generated; faucet needs GitHub sign-in |
| Sui, Starknet, Algorand, MultiversX, Radix | need a browser wallet or social login |

---

## CLI faucets — what actually works (2026-07-31)

I reported nine chains as needing a human. **Six did not.** The mistake was
anchoring on the first faucet's web UI instead of checking whether the official
CLI had its own path. Findings, so nobody repeats it:

| Chain | CLI faucet | Result |
|---|---|---|
| **Sui** | `sui client faucet` | ✅ **devnet works, no browser.** On testnet the same command prints "please use the Web UI" — devnet and testnet are different networks with different gates |
| **NEAR** | `helper.testnet.near.org` POST | ✅ creates *and* funds an account |
| **Tezos** | — | web faucet, but funding came through fine |
| **Flow** | `/create-account` | ✅ mints the account from a public key (`/fund-account` needs one that already exists) |
| **Solana** | `solana airdrop` | ⚠️ devnet faucet degraded — `Internal error` from three IPs |
| **MultiversX** | `mxpy faucet request` | ⚠️ **exists**, logs the request, but nothing arrives — silently rate-limited |
| **Algorand** | `algokit dispenser fund` | ⛔ requires `algokit dispenser login` (OAuth) |
| **Starknet** | — | GitHub login, or the official **MetaMask Snap** (`@consensys/starknet-snap`, 47K installs) |
| **Radix** | on-chain faucet component | ⛔ reachable, but needs signed manifests via `@radixdlt/radix-engine-toolkit` — real work, not a command |

### The order to try, before ever asking a human

1. **The official CLI** — it usually has a faucet subcommand
2. **devnet, not just testnet** — different network, often a different gate
3. **Generate the key yourself** — addresses are pure crypto (ed25519 + blake2b +
   bech32/base58); "connect wallet" is about naming a recipient, not needing an extension
4. **Install the tool on the prod box** — it will run anything

Only genuine captchas and social logins need a person. Those are deliberate
anti-bot controls; do not automate around them, and decline captcha-solving services.
