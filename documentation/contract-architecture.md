# Contract architecture — money, ownership, control

Read this before deploying. Two things people assume are wrong.

---

## 1. Who owns what

| Thing | Owner | Can you take it back? |
|---|---|---|
| **The contract** | You (deployer `0xD101…de58`) | — |
| **A sold tile** | **The buyer, permanently** | **No.** No admin transfer or burn exists. |
| **The treasury** | You, withdrawable any time | — |

> ❗ **You are not "owner of all the land".** You own the *contract*. Once someone
> buys a tile it is theirs, in their wallet, and you cannot reclaim it. That is
> deliberate: "permanently ownable" has to be literally true or the pitch is a lie
> and the first person to check the code finds out.

## 2. Where the money actually sits

> ❗ **Money does NOT land in your wallet automatically.** It accrues **inside the
> contract on each chain**, and moves to your wallet only when you call
> `withdraw()`. Nothing is "hosted on our server" — the server holds the *deployer
> key*, not the funds.

```
PRIMARY SALE  (you selling land)
  player calls claimTile() and pays tilePriceWei
    → 100% credited to treasury          ← the whole payment, not a percentage
    → tile minted to the player
    → any overpayment refunded to them

RESALE  (player → player)
  buyer calls buy() paying the listed price
    → 93% straight to the seller
    →  7% credited to treasury

WITHDRAW  (you, any time)
  withdraw()  → entire treasury → treasuryReceiver
```

### Your $5,000 example

500 buyers × $10 on **one** chain:

1. Each `claimTile()` credits the full $10 — **$5,000 in that contract**
2. It stays there earning nothing until you act — there is no timelock, no vesting,
   no approval step
3. `withdraw()` sends **all $5,000** to `treasuryReceiver`
4. Leave it or take it. Keeping it in the contract is fine for ops/marketing float;
   the only cost is that a contract balance is a bigger target than a cold wallet.

**Per chain.** 15 EVM deployments = 15 separate treasuries and 15 `withdraw()`
calls. There is no cross-chain sweep — that would need a bridge and a much larger
risk surface.

## 3. What you can change as admin

| Function | Effect |
|---|---|
| `setTilePrice(wei)` | primary sale price. `0` disables on-chain claiming |
| `setMarketFeePercent(bps)` | resale fee — **hard-capped at 10%** |
| `setTreasuryReceiver(addr)` | **where withdrawals land**, without giving up admin |
| `withdraw()` | entire treasury → receiver |
| `withdrawUnaccounted()` | sweep direct sends the counter never saw |
| `setBaseURI(uri)` | metadata location |
| `setMinter(addr)` | let the backend mint after off-chain payment |
| `pause()` / `unpause()` | emergency stop on minting and buying |
| `transferOwnership()` → `acceptOwnership()` | two-step, so a typo cannot orphan the contract |

**`setTreasuryReceiver` is the one to use on day one.** Point it at a cold wallet so
the hot key that admins the contract is never the key holding revenue.

**`MAX_FEE_BPS = 1000` is enforced in code.** Even with the owner key stolen, an
attacker cannot set a 100% fee and confiscate someone's sale.

## 4. Two payment rails, both supported

| Rail | Path | Pricing |
|---|---|---|
| **On-chain** | `claimTile()` — player pays in native token | flat `tilePriceWei` |
| **Off-chain** | NOWPayments → backend → `mint()` (owner/minter only) | full dynamic regional pricing |

The app prices tiles dynamically by region; a single on-chain `tilePriceWei` cannot
express that. So either run flat pricing on-chain, or set `tilePriceWei = 0` and keep
NOWPayments as the only rail. Signed dynamic pricing is possible but adds a signature
scheme — not built.

## 5. Security properties worth knowing

- **Checks-effects-interactions everywhere.** `treasury` is zeroed *before* the
  transfer, listings cleared *before* the NFT moves — a re-entrant call finds nothing.
- **Overpayment refunded** on both claim and buy, so a stale cached price cannot
  overcharge.
- **Two-step ownership transfer** — the new owner must accept.
- **30/30 tests pass**, including one that measures the real balance change on
  `withdraw()` rather than trusting the counter.

## 6. Non-EVM contracts are narrower

The 12 non-EVM contracts implement **mint + ownership + the tokenId invariant only**
— no marketplace, no fees yet. Getting ownership provably identical across 12
languages was the priority; fee logic is per-chain work once a deployment is live.
