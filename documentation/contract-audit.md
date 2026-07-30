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
