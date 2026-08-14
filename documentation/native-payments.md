# Native wallet payments

Pay for a tile with the chain's own token, from the user's own wallet. On
`base.xono.ai` you send ETH on Base; on `solana.xono.ai` you send SOL. This is
the path a visitor to a chain-native build expects, and until 2026-08-14 it did
not exist — every one of the 32 subdomains offered only the off-chain
NOWPayments widget, with the same nine currencies, none of which was the
chain the build was for.

Added 2026-08-14. The off-chain rail is unchanged and remains the fallback for
anyone without a wallet.

---

## 1. Why payment is a transfer, not `claimTile()`

`CryptoLandTile.claimTile()` exists, is deployed, and is the obvious candidate.
It is not usable, for two independent reasons:

1. **It charges one flat price for the whole planet.** `claimTile` requires
   `msg.value >= tilePriceWei` and then *refunds the difference* (see "Refund
   any overpayment" in `contracts/src/CryptoLandTile.sol`). Tiles are not flat
   priced — an ocean tile is $12 and a Tokyo tile is ~$76 — so a single
   `tilePriceWei` either sells Tokyo at the ocean price or prices the ocean out
   of existence. This is the same constraint `contract-architecture.md` records
   under dynamic regional pricing.
2. **It is switched off.** `tilePriceWei` is `0` on the live deployments, which
   makes `claimTile` revert with "On-chain claiming disabled". Verified by
   `eth_call` against `0x89C6bcfb0aCC152F98599261dc2A72a996c3763F` on Base.

A plain native-token transfer to a treasury address carries the exact per-tile
price, needs no contract redeployment, and is the one operation every chain in
the world supports — so a single design covers all 14 adapter families instead
of 14 contract rewrites.

The NFT mint stays a separate, later step. It always was: `mintTile()` is
`onlyOwnerOrMinter`, so a buyer's wallet could never have called it. See §7.

---

## 2. The flow

```
  browser                        server                         chain
     │                              │                             │
     │  POST /chain/quote           │                             │
     │─────────────────────────────►│  prices the tile itself     │
     │◄─────────────────────────────│  { amount, treasury, ttl }  │
     │                              │                             │
     │  payNative() ── wallet signs ─────────────────────────────►│
     │◄──────────────────────────────────────────── txHash ───────│
     │                              │                             │
     │  POST /chain/verify          │                             │
     │─────────────────────────────►│  reads the chain ──────────►│
     │◄──── 202 confirming ─────────│◄────────────────────────────│
     │  …polls…                     │                             │
     │◄──── 200 + the tile ─────────│  writes blocks row          │
```

**The server decides both things that involve money**: what the tile costs, and
whether it was paid for. The browser's only job is to carry a quote to a wallet
and a hash back.

---

## 3. Server-authoritative pricing

`POST /np/payment` stores `price_usd` from a **client-supplied** `usd_amount`
field. That means the existing off-chain rail will happily create a payment for
a $76 tile at $0.50 if the request says so — a real, pre-existing hole
(§8). The native rail does not repeat it.

`server/tile_pricing.py` is a Python port of `tileBasePrice()` from
`src/lib/tiles.js`, **generated** by `scripts/gen-tile-pricing.mjs` so the two
cannot drift:

```bash
node scripts/gen-tile-pricing.mjs     # after ANY edit to the JS pricing model
```

It emits the port plus 665 golden vectors computed by the JS — every region
seam, all four grid corners, and a deterministic scatter.
`server/tests/test_tile_pricing.py` fails if the two ever disagree by a cent.
Seams matter most: a `<` where the JS has `<=` only shows up on a boundary.

Final price = `tile_base_price(tx, ty) × scarcity × market_multiplier`, where
the multiplier comes from `price_events.py` and is clamped to `[0.25, 3.0]` so a
runaway feed cannot bill someone 50×.

---

## 4. The chain registry and the price feed

`server/chain_registry.py` is generated from `src/lib/blockchain/config.js` by
`scripts/gen-chain-registry.mjs` — RPCs, confirmations, decimals, native symbol.
Adding a chain stays a one-file change.

```bash
node scripts/gen-chain-registry.mjs
```

The one thing not derivable from `config.js` is the **CoinGecko id**, and it
cannot be guessed from a ticker. Every id was verified against the live API by
checking the returned name and homepage. Three would have been wrong:

| Chain | Correct id | The trap |
|---|---|---|
| `beam` | `beam-2` | `beam` is **Beam Mimblewimble** (beam.mw), an unrelated privacy coin sharing the ticker. It trades ~6× higher — a guess overcharges every Beam buyer sixfold. |
| `polygon` | `polygon-ecosystem-token` | MATIC migrated to POL. Both are still listed, ~42% apart. Note `config.js` still says `symbol: 'MATIC'` — stale, display-only. |
| `ton` | `the-open-network` | Correct *despite* now returning symbol `GRAM`: Toncoin was renamed Gram. Confirmed via homepage `ton.org`. |

**Verify a new chain's id the same way. Do not guess.**

Rates are cached for 120s (`CRYPTOLAND_RATE_TTL`). When the feed is unavailable
a cached rate is served for up to `CRYPTOLAND_STALE_RATE_FACTOR` × the TTL
(default 30 → one hour), after which the quote fails honestly rather than
guessing a price. The 5% payment tolerance absorbs the drift.

> **HTTP errors go down the stale-cache path, and that is load-bearing.** The
> free tier is rate-limited per IP and this box runs 32 backends behind one IP,
> each with its own cache. An earlier version raised on any non-200 *before*
> consulting the cache, so a 429 refused to sell a tile while a perfectly good
> price sat in memory. `scripts/check-native-pay.py` found it by tripping the
> limit on its own sweep and reporting 11 healthy chains as BROKEN. The sweep
> now warms every price in one batched request.

### Base units are integers, and stay strings

`native_amount` is an integer count of the chain's smallest unit, carried as a
**string** from the server through the wallet. At 18 decimals it exceeds
`Number.MAX_SAFE_INTEGER`, so parsing it as a number anywhere rounds the price.

`to_base_units()` goes through `Decimal(str(x))`. Both obvious shortcuts are
wrong:

```python
int(0.1 * 10**18)   # float64 multiply — loses the low digits
f"{0.1:.18f}"       # "0.100000000000000006" — prints the representation error
```

`str(0.1)` gives Python's shortest round-tripping repr, `"0.1"`, which is the
number the user meant. Rounding is `ROUND_UP` so a quote is never fractionally
under the tile's price; the bias is at most one wei.

---

## 5. Configuration

Treasury addresses are read from the **server** environment, never from a
committed file and never from the client — the client naming its own recipient
is the entire attack.

```bash
CRYPTOLAND_TREASURY_BASE=0x…      # per chain, wins
CRYPTOLAND_TREASURY_EVM=0x…       # per family, covers all 21 EVM chains
CRYPTOLAND_TREASURY=…             # last resort
```

| Var | Default | Meaning |
|---|---|---|
| `CRYPTOLAND_TREASURY_*` | unset | Where buyers send money. **Unset ⇒ the chain does not offer the native path.** |
| `CRYPTOLAND_CHAIN` | `polygon` | Which chain this backend is. Already set per instance by the systemd unit. |
| `CRYPTOLAND_QUOTE_TTL` | `900` | Seconds a quote is honoured. |
| `CRYPTOLAND_RATE_TTL` | `120` | Seconds a token price is cached. |

A chain with no treasury configured degrades to the off-chain rail — the same
graceful pattern as a blank `VITE_CONTRACT_<CHAIN>` leaving minting stubbed.
`GET /chain/pay-info` reports exactly why, and the UI renders no button rather
than a disabled one nobody can explain.

### Pre-flight

```bash
server/.venv/bin/python scripts/check-native-pay.py          # all chains
server/.venv/bin/python scripts/check-native-pay.py base     # one chain
```

Spends nothing. Reports each chain as **READY**, **OFF** (not configured — fine,
falls back) or **BROKEN** (advertises native pay but would fail a real
purchase), and exits 1 on any BROKEN. It builds a real quote, so it exercises
the pricing port, the USD→base-unit maths and the live rate together. Hits live
price feeds, so it is deliberately not part of `pytest`.

### Turning it on in production

Each chain's backend is a `cryptoland@<chain>` systemd instance reading
`EnvironmentFile=/srv/cryptoland/<chain>/env`. Add the treasury there:

```bash
# One address for all 21 EVM chains
for c in polygon avalanche base arbitrum ronin bnb optimism scroll celo beam \
         oasys hedera injective mantle taiko rootstock flare; do
  grep -q CRYPTOLAND_TREASURY /srv/cryptoland/$c/env \
    || echo "CRYPTOLAND_TREASURY_EVM=0x…" >> /srv/cryptoland/$c/env
done
systemctl restart 'cryptoland@*'
```

Then confirm from outside: `curl -s https://base.xono.ai/chain/pay-info` should
report `"enabled": true`.

> ⚠️ **`deploy/server/push.sh` used to overwrite these env files** — it rewrote
> each `/srv/cryptoland/<chain>/env` with only `PORT` and `ALLOWED_ORIGINS`
> (`printf … > env`), silently dropping the live `SERVER_URL` (so NOWPayments
> IPN callbacks went to `127.0.0.1` and no payment ever confirmed),
> `CRYPTOLAND_CHAIN`, `CRYPTOLAND_SITE_HOST` — and it would have dropped the
> treasury too. **Fixed 2026-08-14**: it now rewrites only those two variables
> and preserves every other line. Its chain list was also 27 while the box runs
> 32, so five chains kept stale bundles on every push; also fixed.

### Choosing the address

Use a **cold wallet you control**, not the deployer key. This address only
receives — it never signs anything here, so it never needs to be hot. It is
also separate from the contracts' `treasuryReceiver`: that governs on-chain
primary/resale proceeds inside each contract, while this receives the off-chain
tile sale directly. They may be the same address, but nothing requires it.

---

## 6. Security invariants — DO NOT REGRESS

All are covered behaviourally by `server/tests/test_chain_pay.py` (18 tests
against a real app and a real database, not source greps).

| Invariant | Why |
|---|---|
| **The server computes the price.** `build_quote()` prices from `tile_pricing.py`; price fields in the request body are ignored. | Otherwise a crafted request buys a $76 tile for $0.01 — the hole the NOWPayments rail still has. |
| **A quote is single-use**, re-checked inside `BEGIN EXCLUSIVE`. | Two tabs reach settlement with the same quote at the same time. |
| **A transaction hash is single-use across the table**, enforced by a partial `UNIQUE INDEX (chain, tx_hash)`. | Open two quotes, pay once, settle both. |
| **Identity comes from the Bearer token.** The quote records `owner` from the token; `/chain/verify` 403s if the caller is not that owner. | A client-supplied owner is free tile claiming. |
| **Verification reads the chain, not the client** — recipient, amount and confirmations all come from an RPC the server chose. | The client reporting its own success is not evidence. |
| **Amount tolerance is 95%**, matching `/np/finalize`. | Wallets round; some chains take the fee out of the transfer. |
| **Expired quotes are refused (410).** | A stale quote is a stale token price — a mispriced sale. |
| **RPC failure is `pending`, never `rejected`.** Every endpoint in `chain.rpcs` is tried first. | Public RPCs rot (`scripts/check-rpcs.mjs` exists because of it). A transport failure must never read as "you did not pay". |
| **The block is written with the server's `price_usd`**, never a client value. | Same reason `/np/finalize` does it. |

### The one rule the UI must keep

Once `payNative()` returns, **the buyer's money has already left their wallet.**
From that moment the flow may never report a bare failure: `gameStore`
holds the hash, keeps polling, and every error it surfaces says the payment is
on-chain and safe, with the hash to prove it. Saying "payment failed" there is a
lie that costs the user their money twice.

---

## 7. What is NOT done — read before promising anything

**Nine of fourteen families verify; five do not.** The client-side
`payNative()` exists for all 14, but a payment only settles where a verifier
does too.

| | Families | Chains |
|---|---|---|
| ✅ Verifier written | `evm` `solana` `ton` `starknet` `stellar` `algorand` `multiversx` `radix` `tezos` | 29 |
| ❌ Still missing | `aptos` `sui` `cardano` `near` `flow` | 5 |

The five missing ones report `enabled: false` from `/chain/pay-info` and fall
back to the off-chain rail — no user-visible breakage, just no wallet button.
Each needs one file, `server/verifiers/<family>.py`, exporting `verify()`; the
package docstring and `verify_evm` are the spec.

**Verification status of what exists.** Six were independently re-checked
against live mainnet transactions — not just by the author — with four cases
each (exact amount, wrong treasury, 2× underpaid, garbage hash):

| Family | Independently confirmed on mainnet |
|---|---|
| `evm` | ✅ real Base transfer; also confirmed a contract-routed tx is rejected and dead RPCs return `pending` |
| `stellar` | ✅ incl. a 1-stroop edge case |
| `algorand` | ✅ |
| `tezos` | ✅ incl. a 7-hour-old transaction (TzKT indexes historically) |
| `multiversx` | ✅ |
| `solana` | ✅ (see the net-balance note below) |
| `starknet` | ⚠️ STRK contract address confirmed on-chain (`symbol()` → `STRK`), verifier itself not re-checked against a live STRK transfer |
| `radix` | ⚠️ see below — unresolved discrepancy |
| `ton` | ⚠️ not re-checked; the BOC→transaction resolution is the least proven code here |

**Solana and Radix credit NET balance change, not gross.** On Solana the amount
comes from `preBalances`/`postBalances`, so a transaction where the recipient
*also spends* nets to zero and is rejected. That is correct and conservative for
our shape — a buyer paying a treasury that spends nothing — and it can never
over-credit. It does mean these verifiers under-report on exotic transactions.

**🔴 Radix has an unresolved discrepancy.** On one live mainnet transaction the
verifier computed ~0.713 XRD *less* than the Gateway's own `balance_change`
figure for the recipient. The likely explanation is the same net-vs-gross effect
(the recipient was probably also the fee payer), but this was **not confirmed** —
an attempt to re-fetch the transaction used a reconstructed hash and proved
nothing. It errs conservative, so it cannot over-credit, but **confirm it before
enabling Radix.**

**No treasury address is configured anywhere yet**, so as shipped the native
path is off on every chain until §5 is filled in.

**Three chains never take native payment by design:** `skale` and
`skale-europa` (sFUEL is a valueless faucet token — there is nothing to charge)
and `moonbeam` (`halted: true`).

**Some non-EVM adapters call backend endpoints that do not exist.** `cardano.js`
posts to `/cardano/build-payment` and `sui.js` to `/sui/build-transfer`; neither
route exists in `server/main.py`. This is not new — `/cardano/build-mint`,
`/sui/build-mint`, `/solana/build-mint`, `/solana/send-tx`, `/solana/tx-status`
and `/ton/build-mint` are all already referenced by the existing adapters and
none of them exist either. Those families need the routes written before either
path works.

**TON returns a BOC, not a transaction hash.** TonConnect hands back the signed
external message; the hash exists only once a validator includes it. A future
`verify_ton` must resolve a BOC to a transaction, not treat it as a hash.

**Starknet cannot be verified the way EVM is.** STRK is an ERC-20, so a transfer
has no `value` field — `verify_starknet` must match a `Transfer` event in the
receipt.

**Nothing has been executed on any chain.** Every adapter is verified
statically: manifest syntax, Cadence typing, address checksums and base-unit
conversions are all proven, but no transaction has been built, signed or sent
with a real wallet. Per `contract-audit.md`'s standing lesson — *a green test
suite is not a deployable artifact* — expect the first live payment on each
family to find something.

**The NFT mint is still separate and still not wired.** `_mintNFTAfterPurchase`
calls `mint()`, which is `onlyOwnerOrMinter`, so a buyer's wallet reverts; the
attempt is swallowed as non-fatal and `totalSupply()` is 0 on Base. Minting
after a native purchase needs a backend minter key, and that key should be a
**dedicated** one set via `setMinter()` — the current minter is also the owner,
so a backend holding it could `withdraw()` and `setTreasuryReceiver()` too.

---

## 8. Related pre-existing issues found while building this

- **`/np/payment` trusts a client price.** `req.usd_amount` becomes the stored
  `price_usd` that `/np/finalize` then validates against. Binding is real;
  the number's origin is not. Worth closing with the same
  `tile_pricing.py` call the native rail uses.
- **`init_db` crashed on any brand-new database.** The fresh-DB `CREATE TABLE
  users` omitted `telegram_id`, while the unique index on that column ran
  unconditionally, so a new `CRYPTOLAND_DB` path failed at startup with "no such
  column: telegram_id". Existing deployments never hit it because their
  databases predate the index. **Fixed** — this blocked adding any new chain.

---

## 9. Files

| File | Role |
|---|---|
| `scripts/gen-tile-pricing.mjs` | Generates the Python pricing port + golden vectors |
| `scripts/gen-chain-registry.mjs` | Generates the server chain table; holds the verified CoinGecko ids |
| `server/tile_pricing.py` | **Generated.** What a tile costs, server-side |
| `server/chain_registry.py` | **Generated.** RPCs, decimals, confirmations, price ids |
| `server/chain_pay.py` | Rate feed, quoting, base-unit maths, `verify_evm`, verifier discovery |
| `server/verifiers/<family>.py` | One module per non-EVM family, each exporting `verify()`. Discovered by filename — adding a family is adding a file |
| `scripts/check-native-pay.py` | Pre-flight: is each chain actually ready? |
| `server/main.py` | `/chain/pay-info`, `/chain/quote`, `/chain/verify`, `chain_quotes` table |
| `src/lib/chainPay.js` | Client half: availability, quote, pay, poll to settlement |
| `src/lib/blockchain/adapters/*.js` | `payNative()` + `supportsNativePay()` per family |
| `src/store/gameStore.js` | `startNativePayment()`, `_applySettledBlock()` |
| `src/components/PaymentModal.jsx` | `NativePayOption`, wallet progress in Loading/Confirming |
| `server/tests/test_chain_pay.py` | The invariants in §6, behaviourally |
| `server/tests/test_tile_pricing.py` | JS↔Python price parity |
