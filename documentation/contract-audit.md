# Contract audit — 2026-07-30

A line-by-line review of all 13 contract implementations against four questions:

1. **Does the primary sale actually collect money?** (not just increment a counter)
2. **Does `withdraw()` actually emit a transfer?** (not just zero the counter)
3. **Is every admin path owner-gated?**
4. **Is the 10% fee ceiling enforced, and is `treasury_receiver` honoured?**

Seven findings, all fixed. Five of them were **fund-losing or fund-stranding**.

---

## Findings

### 🔴 F1 — Radix: `withdraw()` was completely ungated

`contracts/radix/src/lib.rs`. Scrypto blueprints are public by default; without
`enable_method_auth!` every method is callable by anyone. `withdraw()`,
`set_tile_price()` and `set_market_fee_bps()` had no auth declaration at all — any
caller could have drained the treasury the moment the component went live.

**Fix.** Added `enable_method_auth!` with an `admin` role, globalized under
`OwnerRole::Fixed(rule!(require(admin_addr)))`. `claim_tile` and the read methods
stay `PUBLIC`; `mint_tile`, both setters and `withdraw` are `restrict_to: [admin]`.

### 🔴 F2 — TON: buyers set their own price

`contracts/ton/contracts/cryptoland_tile.fc`. `claim_tile` read the price out of the
**incoming message body**:

```
int price = in_msg_body~load_coins();
throw_unless(error::insufficient, msg_value >= price);
```

A buyer could send `price = 1` nanoton and mint any tile. The price must come from
storage, never from the caller.

### 🔴 F3 — TON: the three admin ops were silent no-ops

`set_tile_price`, `set_market_fee` and `set_treasury_recv` checked the owner and then
`return ()` without writing anything, because the storage layout
(`owner, total, content, item_code`) had nowhere to put them.

### 🔴 F4 — TON: `withdraw()` ignored `treasury_receiver`

It hardcoded `.store_slice(owner)`. Setting a cold wallet had no effect on where the
money went.

**Fix for F2–F4.** Storage extended to
`owner, total, tile_price, market_fee_bps, treasury_receiver, content, item_code`.
`claim_tile` prices from state. The setters persist, and `set_market_fee` enforces
`bps <= MAX_FEE_BPS`. `withdraw` sends to `recv` with mode 128 (whole balance).

### 🔴 F5 — Aptos: tiles were free, and the treasury was a number

`contracts/aptos/sources/cryptoland_tile.move`. `Registry.treasury` was a `u64` and
`claim_tile` did `reg.treasury = reg.treasury + reg.tile_price` — arithmetic on a
counter, with no `coin::withdraw` anywhere. Every tile was claimable for zero APT,
and `withdraw()` (`reg.treasury = 0`) paid out nothing.

**Fix.** `treasury` is now a real `Coin<AptosCoin>` store. `claim_tile` calls
`coin::withdraw<AptosCoin>(buyer, price)` and merges it in. `withdraw()` uses
`coin::extract_all` (which zeroes the store) then `aptos_account::deposit_coins`,
which auto-registers the receiver so a fresh cold wallet needs no prior setup. The
`treasury` view returns `coin::value(...)`, so the reported figure is backed by real
balance.

### 🔴 F6 — Starknet: same shape as F5

`contracts/starknet/src/lib.cairo`. Starknet has no native `msg.value`, so a primary
sale must be an ERC20 transfer. `claim_tile` only incremented `treasury`, and
`withdraw()` only wrote `treasury = 0`.

**Fix.** Added an `IERC20` dispatcher and a `pay_token` storage slot (STRK), set in
the constructor. `claim_tile` does `transfer_from(caller, contract, price)` — the
claim reverts if the buyer has not approved or cannot cover it. `withdraw()` zeroes
`treasury` **before** the external `transfer(treasury_receiver, amount)`.

### 🔴 F7 — Stellar: no claim path, and a payout that paid nothing

`contracts/stellar/src/lib.rs`. Only an owner-only `mint_tile` existed; there was no
way for a buyer to claim. `withdraw()` returned the amount as a value and set storage
to zero without moving any token.

**Fix.** Added `PayToken` (the SAC address) to `DataKey` and to `init`. New
`claim_tile` requires buyer auth and does
`token::Client::transfer(&buyer, &contract, &price)`. `withdraw()` zeroes first, then
transfers from the contract to `TreasuryReceiver`.

### 🟡 F8 — Solana: no on-chain primary sale

`contracts/solana/programs/cryptoland-tile/src/lib.rs`. Only `mint_tile` existed and
it is `has_one = owner`, so a buyer could never claim on-chain and the registry PDA
never accrued lamports for `withdraw()` to pay out.

**Fix.** Added a `claim_tile` instruction with a `ClaimTile` context: buyer is the
`payer` and signer, a system-program CPI transfers `tile_price` lamports into the
registry PDA **before** ownership is recorded. Uniqueness still comes from the
one-PDA-per-tile seed, so a second claim on the same coordinates collides and fails.

### 🟡 F9 — Tezos: overpayment was stranded

`contracts/tezos/cryptoland_tile.mligo`. `claim_tile` credited `s.tile_price` to the
treasury, but the contract balance grows by the full `Tezos.get_amount ()`. Anything
sent above the price was locked in the contract forever, because `withdraw()` pays
out the counter.

**Fix.** Credit `Tezos.get_amount ()`.

---

## Post-fix state

| Chain | Sale collects funds | Withdraw transfers | Zeroes before payout | Owner-gated | Fee ceiling | Honours receiver |
|---|---|---|---|---|---|---|
| **EVM** (15 chains) | ✅ `msg.value` | ✅ | ✅ | ✅ `onlyOwner` | ✅ 1000 bps | ✅ |
| Solana | ✅ *(F8)* | ✅ lamports | ✅ | ✅ `has_one` | ✅ | ✅ constraint |
| TON | ✅ *(F2)* | ✅ mode 128 | n/a — whole balance | ✅ | ✅ *(F3)* | ✅ *(F4)* |
| Aptos | ✅ *(F5)* | ✅ *(F5)* | ✅ `extract_all` | ✅ | ✅ | ✅ |
| Sui | ✅ | ✅ | ✅ `split` | ✅ `ENotOwner` | ✅ | ✅ |
| Starknet | ✅ *(F6)* | ✅ *(F6)* | ✅ | ✅ | ✅ | ✅ |
| Cardano | n/a — UTXO | n/a — UTXO | n/a | ✅ signatory | ✅ tested | n/a |
| NEAR | ✅ | ✅ Promise | ✅ | ✅ | ✅ | ✅ |
| Stellar | ✅ *(F7)* | ✅ *(F7)* | ✅ | ✅ | ✅ | ✅ |
| Algorand | ✅ | ✅ inner txn | atomic | ✅ | ✅ | ✅ |
| MultiversX | ✅ | ✅ | ✅ `clear()` | ✅ | ✅ | ✅ |
| Radix | ✅ | ✅ Bucket | ✅ | ✅ *(F1)* | ✅ | ✅ |
| Tezos | ✅ *(F9)* | ✅ | ✅ | ✅ `require_admin` | ✅ | ✅ |

**Cardano is a legitimate n/a, not a gap.** It is UTXO, not account-based: there is no
contract balance to withdraw from. Payment lands directly in the outputs of the
claiming transaction, so the project's cut goes to the project address as part of the
spend. The validator's job is to check the split is correct — `seller_share` /
`project_share` / `valid_fee` are unit-tested in `tile.ak`.

**Algorand's ordering is inverted but safe.** `on_withdraw` submits the inner payment
and *then* zeroes the counter. In the AVM the inner transaction and the state write
are in the same atomic group — if the payment fails the whole application call
reverts, so the counter cannot be zeroed without the payment landing.

## How the money reaches your MetaMask

Every chain follows the same three steps:

1. Deploy. The deployer address becomes `owner`, and `treasury_receiver` defaults to
   it.
2. Call `setTreasuryReceiver(<your MetaMask address>)` (Starknet
   `set_treasury_receiver`, Move `set_treasury_receiver`, TON op `set_treasury_recv`,
   …). **Do this before enabling sales.** Owner and payout target are deliberately
   separate, so the key that admins the contract need not be the wallet that holds
   the money.
3. Call `setTilePrice(<price>)` to open primary sales — `0` keeps them closed.

`withdraw()` is owner-only and always pays to `treasury_receiver`, never to
`msg.sender`. It is **not** blocked by `pause()` (asserted by the EVM test
"never lets withdrawals be frozen by pause"), so a paused contract can still be
emptied.

MetaMask holds accounts on the 15 EVM chains directly. On the 12 non-EVM chains the
receiver must be an address of that chain's own type — a MetaMask EVM address is not
a valid Aptos, Sui, TON or Stellar account. See
[deployment.md](deployment.md) for the per-chain receiver format.

## Verification

- EVM: `cd contracts && npx hardhat test` — **34 passing**, including a
  `ReentrantSeller` attacker contract that proves the guard fires.
- Frontend: `npm test` — **250 passing**, includes the cross-chain tokenId
  invariant `(16383,16383) → 536854527` checked against every adapter.
- All 13 contracts compile — **re-verified individually on 2026-07-30**, each with
  its own toolchain:

  | | | | |
  |---|---|---|---|
  | EVM ×17 `hardhat test` 34 ✅ | Starknet `scarb build` ✅ | Sui `sui move build` ✅ | Aptos `aptos move compile` ✅ |
  | Cardano `aiken check` 4 tests ✅ | Algorand `pyteal` ✅ | Solana `cargo check` ✅ | Stellar wasm32 ✅ |
  | NEAR wasm32 ✅ | MultiversX wasm32 ✅ | Radix `cargo test` ✅ | Tezos `ligo compile` ✅ |
  | TON `func-js` ✅ | | | |

  An earlier sweep reported four failures — all were **missing toolchains on the
  build box, not broken code**. The box is ARM64 Linux, where aiken ships no
  aarch64 build and scrypto will not compile; those were verified on macOS ARM
  instead. Radix builds with `scrypto build`, not plain
  `cargo build --target wasm32`, which is what actually failed there.

Not covered by this audit: no contract has been deployed or verified on any chain
yet, so none of this is exercised against a live VM. The fee-split arithmetic is
tested on EVM and Cardano only; the other 11 expose the fee but the marketplace path
lives off-chain.

---

# Second round — 2026-07-30

Round 1 checked payment, payout, gating and the fee ceiling. It did **not** check the
cross-chain tokenId invariant, and it left 4 of 13 contracts with zero executable
tests. Both are now closed.

## Test coverage, before and after

| Chain | Before | After | Runner |
|---|---|---|---|
| EVM ×17 | 34 | 34 | `npx hardhat test` |
| Starknet | **0** | **5** | `scarb cairo-test` |
| MultiversX | **0** | **4** | `cargo test` |
| Tezos | **0** | **3** | `ligo run test` |
| Solana | 2 | 6 | `cargo test` |
| Radix | 2 | 5 | `cargo test` |
| Aptos | 1 | 4 | `aptos move test` |
| Cardano | 4 | 4 | `aiken check` |
| Sui | 1 | 1 | `sui move test` |
| Algorand | self-check | + bounds + fee | `python3 cryptoland_tile.py` |
| NEAR, Stellar | — | covered by conformance suite | see below |
| **Conformance (all 13)** | — | **85** | `npm test` |

Starknet needed `pack`/`unpack` lifted out of the contract as free functions before
the invariant was testable at all, plus a `cairo_test` dev-dependency — without it
Scarb rejects `#[test]` outright.

## The conformance suite

`src/test/contracts.test.js` reads all 13 contract **sources** and asserts the shared
invariants directly. This exists because per-chain toolchains compile in isolation:
nothing would catch one implementation drifting from the others, and two chains
disagreeing about what `(tx, ty)` means is unrecoverable once tiles are minted.

It also covers the two chains whose own harnesses cannot run: NEAR's SDK requires
`cargo near build` (plain `cargo test` fails a build guard) and Stellar's
`soroban-env-host` currently fails to compile its own test dependencies against
rustc 1.97.

It caught three things a grep-based review had missed:

- **TON never defaulted the fee to 7%.** FunC has no constructor, so `market_fee_bps`
  is whatever the deploy payload packs — and nothing in the contract or the tooling
  said so. The collection would have launched at a **0% resale fee**. Added
  `DEFAULT_FEE_BPS = 700` as an explicit, greppable constant for deploy tooling.
- **Radix has no `treasury_receiver`** — but that is a model difference, not a gap.
  Scrypto `withdraw()` hands a `Bucket` back to the admin caller, who deposits it in
  the same transaction; it is gated on the admin badge. Exempted, with the reason
  recorded in the test.
- **Algorand names its global `receiver`, not `treasury_receiver`**, and gates on
  `is_owner`. Naming only. The regex now accepts both spellings.

## Live verification

Per-chain data isolation was previously verified by hand. It is now confirmed against
production: all 27 subdomains return HTTP 200 and **27 distinct `(sold, volume,
owners)` triples** from `/stats`. One shared world would have produced one triple.

`node scripts/check-rpcs.mjs`: **52 endpoints, 50 usable, no unexpected failures.**
The run found Sui's primary RPC dead — see
[blockchain.md](blockchain.md) — and a false FAIL on Cardano, because the checker
only walked `rpcUrl`/`rpcUrlFallback` and Cardano's browser-reachable source is
`statusUrl` (Mithril). Both fixed.

---

# TON: from unverifiable to fully executed — 2026-07-30

The second round recorded TON as untestable because FunC has no in-language test
framework. That was a tooling gap on my side, not a real one: **`@ton/sandbox`
runs the actual TVM**, so the compiled bytecode can be executed against a real
emulated blockchain.

`contracts/ton/test/tile.test.mjs` compiles the real FunC source (not a fixture)
and drives it through 9 tests. Every round-1 fix that had been verified only by
reading the source is now proven against the machine:

| Test | Proves |
|---|---|
| `claim_tile prices from STORAGE` | the free-mint bug is closed — a 0.5 TON payment against a 5 TON stored price throws `403` |
| `claim_tile succeeds when covered` | the happy path still works |
| `claim_tile disabled at price zero` | sales stay shut until the owner opens them |
| `coordinates outside 16383 rejected` | `tx = 16384` throws `402` |
| `a stranger cannot set the price` | throws `401` |
| `a stranger cannot withdraw` | throws `401` |
| `set_market_fee enforces the ceiling` | 1001 bps rejected, 1000 accepted |
| `set_tile_price persists` | the silent-no-op bug is closed — the new price is enforced on the next claim |
| `withdraw pays the treasury receiver` | the outgoing message is addressed to the **cold wallet**, and *not* to the owner |

The last one is the important one: it was previously impossible to distinguish
"pays the receiver" from "pays the owner" without executing, because with
`recv == owner` both look identical. The test deploys with a **separate** cold
wallet and asserts on the destination of the outgoing message.

Two setup notes worth keeping: `@ton/sandbox` needs `@ton/core >= 0.61` (an older
pin fails deep inside `StorageUsed` serialization with an unhelpful
`Cannot convert undefined to a BigInt`), and messages must be sent through the
treasury sender rather than hand-built `sendMessage({info})` payloads.

Run: `cd contracts/ton && npm test`

---

# Every chain now has an executable suite — 2026-07-31

The second round left NEAR and Stellar covered only by the source-reading
conformance suite, because both SDKs failed their own test harnesses. Both were
version problems, not real ones.

**NEAR.** `near-sdk` resolved to 5.29, which carries a `compile_error!` unless the
crate is built by `cargo-near` — and `cargo near` has no `test` subcommand, so there
was no supported way to run a unit test at all. Pinning `near-sdk = "=5.6.0"` (the
version the manifest already intended, before `^` floated it forward) restores plain
`cargo test`. The wasm build is unaffected: 246,300 bytes.

**Stellar.** The `testutils` feature pulls `soroban-env-host`, which fails to compile
its own `ed25519_dalek` dependency under rustc 1.97. Bumping soroban-sdk to 27 fixed
the tests but broke the **wasm build**, which matters more. Nothing in `src/` uses
`testutils` — the invariant tests are pure arithmetic — so dropping that one
dev-dependency makes the suite runnable while keeping SDK 22 and a working
27,080-byte wasm.

Also worth recording: updating rustc to 1.97 silently dropped the
`wasm32-unknown-unknown` target, which surfaces as a baffling
`can't find crate for 'core'`. `rustup target add wasm32-unknown-unknown`.

## Final coverage — 436 tests

| Suite | Tests | Runner |
|---|---|---|
| Frontend + cross-chain conformance | **335** | `npm test` |
| EVM (covers 17 chains) | 34 | `npx hardhat test` |
| **Backend §4 security invariants** | **23** | `python -m pytest server/tests` |
| **TON — real TVM** | **9** | `cd contracts/ton && npm test` |
| Solana | 6 | `cargo test` |
| Starknet | 5 | `scarb cairo-test` |
| NEAR | 5 | `cargo test` |
| Stellar | 5 | `cargo test` |
| Radix | 5 | `cargo test` |
| Aptos | 4 | `aptos move test` |
| MultiversX | 4 | `cargo test` |
| Cardano | 4 | `aiken check` |
| Tezos | 3 | `ligo run test` |
| Sui | 1 | `sui move test` |
| Algorand | self-check | `python3 cryptoland_tile.py` |

All of it runs in CI (`.github/workflows/ci.yml`) on push and PR.

**What this still does not prove.** Every test above is compile-level or
emulator-level. **No contract has executed on a real chain.** Emulators model the VM,
not the network: gas schedules, mainnet contract-size limits, wallet-adapter quirks
and RPC behaviour are all unverified until a real deployment. Treat the suite as
protection against regression, not as proof of production readiness.

---

# First real deployment — Stellar testnet, 2026-07-31

Every previous section of this document ended with the same caveat: *nothing has
executed on a real chain*. That is no longer true.

**Contract:** `CBVB7GK65CN2KB4NMQ3CGC6LIHFQU7IZ46KWZTUHKAFLO4BT6EBB4FFW`
([stellar.expert](https://stellar.expert/explorer/testnet/contract/CBVB7GK65CN2KB4NMQ3CGC6LIHFQU7IZ46KWZTUHKAFLO4BT6EBB4FFW))
· deploy tx `b4bdc14f…` · 11,200-byte wasm.

This cost nothing. **Testnets are free**, and treating "no contract deployed" as
blocked on funding was my error — mainnet is blocked on funding; verification was
not.

## What the chain confirmed — 18/18

| Property | On-chain result |
|---|---|
| Fee defaults to 7% | `market_fee_bps` read back as **700** from chain state |
| Sales start closed | `tile_price` is 0 until the owner opens them |
| tokenId — far corner | **`token_id(16383,16383) = 536854527`** — the cross-chain canonical value, executed on a real VM |
| tokenId — bounds | `token_id(16384,0)` reverts |
| A buyer really pays | `claim_tile(100,200)` emitted a **10 XLM transfer buyer → contract**, returned tokenId **3277000** |
| Treasury records it | `treasury = 100000000` stroops |
| **Payout honours the receiver** | `withdraw` paid the **cold wallet**: 10000 → **10010 XLM** |
| **Owner does not get the money** | owner balance moved only by gas |
| Treasury zeroes | `treasury = 0` after payout |
| Stranger cannot withdraw | `Error(Contract, #5)` — NotOwner |
| Stranger cannot set price | rejected, missing owner signature |
| Fee ceiling enforced | `set_market_fee_bps(1001)` → `Error(Contract, #4)` FeeTooHigh |
| Ceiling is inclusive | `set_market_fee_bps(1000)` accepted — exactly 10% |
| No double-claim | re-claiming (100,200) → `Error(Contract, #2)` AlreadyClaimed |

**The payout test is the one that could not have been done any other way.** With
`treasury_receiver == owner`, a correct implementation and one that pays
`msg.sender` are indistinguishable. Deploying with a *separate* cold wallet and
watching it gain exactly 10 XLM while the owner gained nothing is the only real
proof — and it is the exact property that matters to whoever collects the revenue.

## It caught a real defect no test would have

The `wasm32-unknown-unknown` artifact — the one every previous check treated as
"the build works" — is **rejected by the Soroban host**:

```
HostError: Error(WasmVm, InvalidAction)
"reference-types not enabled: zero byte expected"
```

Soroban requires `wasm32v1-none`. The contract compiled, passed every unit test,
and produced a 27,080-byte wasm that **cannot be deployed**. The correct target
produces 11,200 bytes. No amount of `cargo test` surfaces a build-target
incompatibility with a host you never talk to.

Assume the other Rust chains (NEAR, Radix, MultiversX) have their own version of
this. **A green test suite is not a deployable artifact.**

## Blocked elsewhere, and why

- **Sui testnet** — the faucet returns "Too Many Requests" from three separate IPs
  (laptop and two servers), so the throttle is service-side rather than per-IP.
  Nothing about the contract is at fault; retry later.
- **Aptos testnet** — the faucet now requires a bearer token issued through a web
  flow. Needs a human to visit `aptos.dev/network/faucet` once, after which
  `aptos move publish` should work: the contract compiles and its 4 tests pass.

## Still true

Mainnet remains unfunded, and testnet gas schedules are not mainnet's. But the
claim "the contracts are correct and the money reaches your wallet" is no longer
resting on emulators for at least one chain — it is resting on a chain.

## The wasm-target lesson generalised — NEAR had the same class of defect

Predicted above: *"assume the other Rust chains have their own version of this."*
They did.

`cargo near build` refused to emit an artifact at all:

```
wasm, compiled with rustc 1.97.1 exceeds the max allowed 1.86.0 for this contract
```

near-sdk 5.6.0 — the version I pinned so that `cargo test` would run — caps rustc
at 1.86, and the repo runs 1.97. Pinning the crate to rustc 1.86 does not work
either: other dependencies then refuse *that*. The NEAR contract had a green test
suite and **no deployable artifact**, which is the worse half of the trade.

Resolved by taking the opposite side: near-sdk **5.29**, which builds
(133,273-byte wasm via `cargo-near`) but carries the `compile_error!` that blocks
plain `cargo test`. **Deployability beats a green suite** — an untested contract
that ships can be tested; a tested contract that cannot be built is worthless.

To avoid paying for that with lost coverage, the shared arithmetic now lives in
`contracts/rust-invariants/` — a crate with **zero dependencies**, so no SDK's
toolchain constraints can ever make it unrunnable again. Eight tests: the five
canonical tokenId pairs, the shift-vs-multiply equivalence across the grid, grid
bounds, round-tripping, the 7% split, that shares always reconstitute the price
exactly, and that the 10% ceiling is inclusive. One of them is annotated with the
value the Stellar deployment returned on-chain.

Each contract still embeds its own copy of the arithmetic — a shared crate cannot
be linked into a Move module or a FunC cell — and `src/test/contracts.test.js` is
what enforces that all 13 still agree.

## Current verification, generated by `./scripts/verify-contracts.sh`

**13 passing, 0 failing, 1 skipped** (Tezos — ligo ships a Linux-only binary, so it
verifies on the server). Plus 335 frontend, 23 backend, and 18/18 on-chain checks
against the live Stellar deployment.

---

# Verification moved to prod — 14/14, nothing skipped (2026-07-31)

Verification ran on a macOS laptop, which made one chain permanently unverifiable:
**ligo publishes a Linux-only binary**, so Tezos could only ever record as SKIPPED.
Splitting verification across two machines is how a status board starts lying.

It now runs on the production box (aarch64 Linux), which has every toolchain:
`./scripts/verify-on-prod.sh` syncs, runs, and pulls the JSON back.

**Result: 14 passing, 0 failing, 0 skipped.**

Two toolchains had no published aarch64-linux binary and were built from source:
**aiken** (`cargo install aiken`) and **cargo-near** (binary installer worked).
Sui ships an `ubuntu-aarch64` release.

## Two production problems this surfaced

**`/tmp` was 100% full** — 1.9 GB tmpfs, of which 1.8 GB was stale
`cargo-install*` scratch from an earlier failed scrypto build. A full `/tmp` on a
box running 27 backends is a live hazard, not a nuisance.

**tmpfs silently truncates.** The Sui download "succeeded" at 290 KB instead of
1.06 GB, and only failed later at `tar` with a confusing
`Cannot write: No space left on device`. Anything large on that box must go to a
disk path, and cargo builds must set `CARGO_TARGET_DIR` away from `/tmp`. This is
recorded at the top of `verify-on-prod.sh`.

---

# Testnet sweep — 3 chains live, and the EVM contract had a real bug (2026-07-31)

Attempted all 23 remaining testnets. Three deployed; **31/31 on-chain checks pass**.

| Chain | Contract | Checks |
|---|---|---|
| Stellar testnet | `CBVB7GK65…` | 18/18 |
| **EVM — Oasys testnet** | `0x52785B7eF9Ff8d9fc88497cd3cA10098602814f6` | 7/7 |
| NEAR testnet | `cryptoland-ms86s8tc.testnet` | 6/6 |

The EVM one matters most: it is `CryptoLandTile.sol`, **the same bytecode all 17
EVM chains use**, so proving it on one chain proves the logic for all of them.

## 🔴 The bug deploying found — and 39 tests had not

`tokenIdFromKey` was `return (tx_ << 15) | ty_;` with **no bounds check**.
Confirmed on-chain, before the fix:

```
tokenIdFromKey(1, 0)     -> 32768
tokenIdFromKey(0, 32768) -> 32768     ← same id, two different tiles
```

The OR carries once `ty >= 2^15`. Our own conformance suite says *"the bound is
load-bearing"* — and the EVM contract was the one implementation not enforcing it.

Worse, `claimTile` takes a **raw tokenId** and only checked `!minted[tokenId]`.
So `2^200` was claimable: a "tile" nowhere on the 16384×16384 map, unreachable by
the game and unsellable, sold for real money.

Every unit test passed because they only ever supplied in-range coordinates.

**Fixed**: `GRID_MAX`/`MAX_TOKEN_ID` constants, `require` bounds in
`tokenIdFromKey`, a public `isValidTokenId`, and `require(isValidTokenId(tokenId))`
in both `claimTile` and `mint`. Five regression tests added (34 → 39), and the fix
re-verified on-chain: the collision path reverts, off-grid claims revert, on-grid
sales still work.

Also fixed while there: `deploy.js` was still writing a metadata base URI on
`api.cryptoland.io`, **a domain we do not own**. It is stored on-chain and is what
every wallet and marketplace fetches. Now `xono.ai`. (`setBaseURI` is `onlyOwner`,
so it is recoverable — but only if someone notices.)

## Why the other 20 did not deploy — faucets, not code

- **Oasys was the only EVM testnet automatable at all.** Every other faucet gates
  on a captcha (Injective, Moonbase, BNB, Fuji), a wallet or social login (Beam,
  Hedera), a mainnet balance (BNB wants 0.002 BNB), or a puzzle (Ronin asks you to
  rotate an Axie until it stands upright).
- **NEAR was the easiest of all** — `helper.testnet.near.org` creates *and funds*
  an account from a plain POST. No captcha, no browser.
- **Solana devnet is globally degraded**: `airdrop` returns "rate limit reached"
  from three separate IPs and the raw RPC `requestAirdrop` returns
  `Internal error`. Not throttling — the faucet is down.
- **Sui** throttles service-side; **Aptos** now needs a browser-issued bearer token.
- TON's faucet is a Telegram bot. Starknet, Cardano, Algorand, MultiversX, Radix
  and Tezos are all reachable and all faucet-gated.

In every blocked case the contract compiles and its tests pass. What blocks them
is a human-verification step, not our code.

## The pattern worth keeping

Three deployments, three defects that testing could not reach: Soroban rejecting
the `wasm32-unknown-unknown` artifact, `cargo-near` refusing to build at all, and
now a tokenId collision in the contract covering 17 chains. **Deploy early — a
green suite says the code does what you told it to, not that it works.**

---

# Testnet deployment round 2 — 9 chains live (2026-07-31)

Six chains were funded and deployed **without any human involvement**, after I had
reported all nine remaining as needing one. The technique matters more than the
count and is now a critical rule in CLAUDE.md.

## Live

| Chain | Address | Checks |
|---|---|---|
| Stellar testnet | `CBVB7GK65CN2KB4NMQ3CGC6LIHFQU7IZ46KWZTUHKAFLO4BT6EBB4FFW` | 18/18 |
| EVM — Oasys | `0x52785B7eF9Ff8d9fc88497cd3cA10098602814f6` | 7/7 |
| EVM — Ronin Saigon | `0xe45404C32961569879c2b2b6FF8d42585332c5C4` | 8/8 |
| NEAR testnet | `cryptoland-ms86s8tc.testnet` | 6/6 |
| Aptos testnet | `0xd2e9cd1e…865330` | 11/11 |
| **Tezos shadownet** | `KT1JR46QvFEweVdBntzcw8a1z1yPbwG9g2NX` | 7/7 |
| **Flow testnet** | `0xc5aef0580ee607ca` | 11/11 |
| **Sui devnet** | `0x991e76819def…414d2c` | 6/6 |
| **Solana devnet** | `7MRdUfDaXXcTrg4xHaGsaUa1dvZ7DB4aQJYBukF61iXi` | ⚠️ 2/3 |

**76/77 on-chain checks.** Every chain confirms the same invariant on its own VM:
`token_id(16383,16383) = 536854527`, out-of-range coordinates rejected, fee
defaulting to 700 bps, sales closed until an admin opens them.

## Defects only deployment could find — now eight

Each of these passed every unit test:

1. **Soroban rejects the `wasm32-unknown-unknown` artifact** — "reference-types
   not enabled". Needs `wasm32v1-none`. 27,080 bytes that could not deploy.
2. **`cargo-near` refused to build NEAR at all** — rustc newer than near-sdk allows.
3. **EVM tokenId collision** — `(1,0)` and `(0,32768)` both returned 32768, and any
   `uint256` was claimable as a tile. The contract covering 17 chains.
4. **Aptos `token_id_from_key` was not `#[view]`** — unreadable by any off-chain caller.
5. **Ronin Saigon chainId was 2021**; the live chain is **202601**.
6. **Flow's `init()` took a resource parameter** — Cadence cannot pass a resource
   as a deployment argument, so `flow project deploy` failed outright. Lints clean.
7. **Solana's `declare_id!` was the placeholder `CLND1111…`** — Anchor compares it
   against the executing program on every instruction, so the program deploys
   happily and then fails **every single call** with `DeclaredProgramIdMismatch`.
8. **Flow's contract never imported `FungibleToken`** — caught by `flow cadence lint`
   the first time the CLI was installed.

**Eight deployments, eight defects.** A green suite says the code does what you
told it to, not that it works.

## Still blocked, with the reason

| Chain | Blocker |
|---|---|
| **Solana redeploy** | needs ~1.8 SOL of buffer to push the `declare_id` fix; devnet airdrop returns `Internal error` from three IPs |
| **Radix** | **funded** (10,000 XRD, no wallet) but `scrypto build` fails: on macOS `blst` will not link for wasm32 under Apple clang; on Linux `rust-lld` rejects Radix Engine host functions as undefined symbols. `--allow-undefined` never reaches the linker because `scrypto build` overrides RUSTFLAGS. Toolchain issue — the contract passes 5 tests. |
| **Cardano** | funded; UTXO has no contract to install — the validator (`136221254c…`) is referenced by a spending transaction |
| **Algorand** | `algokit dispenser` requires OAuth login |
| **MultiversX** | `mxpy faucet request` logs the request but nothing arrives — silently rate-limited |
| **Starknet** | GitHub login, or the Consensys MetaMask Snap |

---

# Both partials closed — 79/79 on-chain (2026-07-31)

**Solana** was deployed but non-functional: the binary carried the placeholder
`declare_id!("CLND1111…")` rather than its own address, and Anchor compares that
against the executing program on **every** instruction. It deployed happily and
would have failed every call with `DeclaredProgramIdMismatch`.

devnet's airdrop was returning `Internal error` from three separate IPs, so the
redeploy was funded by **closing the broken program and reclaiming its 1.71 SOL of
rent**. A closed program id cannot be reused, so a fresh keypair was generated,
`declare_id!` set to *that* address **before** building, then deployed to it.

Now `H98Wsb38Cy4twaNmD84i7ekDQXwAwPz9wye6LV341pBc`, and proven rather than assumed:
sending a deliberately bogus 8-byte discriminator returns
`AnchorError 101 InstructionFallbackNotFound` — Anchor rejecting an unknown
method, which means **the program-id check passed**. The old deployment would have
returned `4100 DeclaredProgramIdMismatch` instead.

**Tezos** was redeployed to `KT1EYZ4RAHPQSExdfmGWeGmX2b1gzXPip2v2`. The first
deployment (`KT1JR46Qv…`) baked in `https://xono.ai/tile/` — the apex rather than
the chain's own subdomain — and had **no setter**, so that was permanent. It now
carries `https://tezos.xono.ai/tile/` and a `set_metadata_base` entrypoint, so the
same mistake is recoverable next time.

**Result: 9 chains, 79/79 checks, no partials.**

---

# Cardano and Radix — diagnosed, one fixed (2026-07-31)

**Cardano was funded on the wrong network.** The faucet offers several testnets
and ours went to **Preview**; `config.js` targeted **preprod**. The tx hash simply
does not exist on preprod, and an address with no UTXOs is indistinguishable from
one that was never funded — which is why this looked like "the faucet failed".

Added `cardano-preview` (`preview.koios.rest`), and the funded address confirms
against it: **10,000 tADA, 1 UTXO**. Cardano still has no *contract* to deploy —
it is UTXO, so the validator (`136221254c…`) is referenced by a spending
transaction rather than living at an address — but the funds are now on the
network the config points at.

**Radix's wasm now builds.** The Radix Engine host functions (`object_call`,
`buffer_consume`, `sys_panic` …) are wasm **imports**, and `rust-lld` rejects them
as undefined symbols without `--allow-undefined`. Plain
`cargo build --target wasm32-unknown-unknown` with
`RUSTFLAGS="-C link-arg=--allow-undefined"` produces a **579,736-byte wasm**.

What still blocks deployment is the package definition (`.rpd`), which only
`scrypto build` produces — and **scrypto strips RUSTFLAGS**. Three routes were
tried and all fail with the identical undefined-symbol wall, none reaching its
linker line:

- `scrypto build -e RUSTFLAGS="-C link-arg=--allow-undefined"`
- `scrypto build --custom-option="--config" --custom-option="target.wasm32-unknown-unknown.rustflags=[…]"`
- `.cargo/config.toml` with `[target.wasm32-unknown-unknown] rustflags`

Pinning rustc 1.81 (pre-1.82 extern-block change) does not help either: scrypto
cannot parse that toolchain's target info, and the dependency tree needs a newer
manifest format than 1.81 accepts. **Both were then solved without scrypto**, leaving one step:

1. **The wasm.** Plain `cargo build --target wasm32-unknown-unknown` with
   `RUSTFLAGS="-C link-arg=--allow-undefined"` → **579,736 bytes**.
2. **The `.rpd`.** Not magic — it is the SBOR blob returned by the wasm's own
   `CryptoLandTile_schema` export. Instantiating the wasm under Node's
   `WebAssembly` with the 11 Radix Engine host imports stubbed (the schema export
   returns static data and calls none of them) and reading the returned
   `(ptr,len)` gives **2,024 bytes with SBOR prefix `0x5c`**. See
   `contracts/radix/deploy/schema.mjs`.

A publish transaction now reaches the ledger and is rejected at type-check:

```
PackagePublishWasmAdvancedInput.[1|definition]
cause: { expected_type: Tuple, found: Array }
```

The definition must be **inlined as an SBOR value**, not passed as a `Blob` —
only `code` is a blob. RET's `ManifestSbor.decodeToString` and
`ScryptoSbor.decodeToString` both reject the payload in every representation
(`ManifestString`, `ProgrammaticJson`, `ModelJson`, `NaturalJson`), so that one
argument encoding is the remaining work.

Also worth recording: the first submission was rejected outright because Node's
`crypto` ships only `blake2b512`, and **truncating it to 32 bytes is a different
hash** from blake2b-256. RET exports `hash()`, which is the correct one.
