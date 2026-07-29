# Milestone & budget template

**Why this file exists.** A sweep of 41 programme pages (ISP-proxy fetch, 2026-07-29)
found a milestone breakdown with budget demanded by **30% of readable pages** —
Arbitrum GCP, Solana Foundation, Starknet Seed *and* Growth, Outlier Ventures,
Aptos. It was the single requirement missing from this repo's grant preparation
entirely. Programmes reject on an incomplete application far more often than on a
weak project: Tezos Foundation states **only ~8% of applications succeeded**, and
attributes most rejections to applications being incomplete or misaligned.

Copy the relevant block into an application and replace the bracketed values.
Keep the honesty section — every per-chain `/ecosystem` page states the same
facts, so an application that omits them contradicts the product.

---

## 0. The one-paragraph version

> CryptoLand is a geospatial territory game over the real world — a 16,384 × 16,384
> tile grid, 268,435,456 claimable tiles of ~2.4 km² each. It ships as 27 chain-native
> deployments from one codebase, with [CHAIN]'s build live at `[chain].xono.ai`. We are
> requesting **$[AMOUNT]** to deploy and audit the tile contract on [CHAIN], move
> recurring gameplay on-chain, and replace seeded demo worlds with real players.

---

## 1. Milestones — the standard four

Amounts are indicative for a $25K–$50K ask; scale proportionally and **delete tracks
the programme does not fund**. Most programmes pay in tranches on completion, not up
front.

| # | Milestone | Deliverable (verifiable) | Duration | Budget |
|---|---|---|---|---|
| **M1** | Contract deployment | `CryptoLandTile` deployed to [CHAIN] mainnet, address published, `VITE_CONTRACT_[CHAIN]` set, mint live in the shipped build. Verifiable: contract address on the block explorer + `nft_mints_onchain > 0` at `/metrics/grant`. | 3 weeks | $[8,000] |
| **M2** | Security review | Third-party review of the tile + marketplace contracts; findings published; fixes merged. Verifiable: public report link. | 3 weeks | $[10,000] |
| **M3** | Recurring on-chain gameplay | Daily check-in, tile upgrade and transfer moved on-chain so activity accrues per player rather than one tx per purchase. Verifiable: tx count and unique active addresses on [CHAIN]. | 4 weeks | $[9,000] |
| **M4** | Real users | Replace seeded worlds with organic players on [CHAIN]; publish D1/D7 retention from `/metrics/grant`. Target: [N] wallets, [N] returning at D7. Verifiable: the endpoint is public and chain-scoped. | 6 weeks | $[8,000] |

**Total: $[35,000] over [16] weeks.**

> M1 is deliberately first and small. It converts the project from "a web game with a
> crypto payment rail" into an on-chain application, which is the precondition for every
> retroactive programme (Retro9000, RetroPGF, Base retro) to have anything to score.

## 2. Budget breakdown

| Category | Amount | Notes |
|---|---|---|
| Engineering | $[20,000] | Contract work, on-chain gameplay, chain integration |
| Security review | $[10,000] | Third-party; scales with contract surface |
| Infrastructure | $[1,500] | Hosting for 27 deployments (currently €4.49/mo — see below), RPC, domains |
| User acquisition | $[3,500] | Community seeding on [CHAIN], no paid bot traffic |

**Infrastructure honesty:** the entire 27-chain fleet currently runs on one 2 vCPU /
4 GB ARM server at €4.49/mo. Do not inflate this line — a reviewer who checks will
find the deployments are genuinely cheap to run, and a padded number is the kind of
detail that costs credibility on everything else.

## 3. What already exists (do not re-request funding for it)

State this explicitly. It is the difference between "fund my idea" and "fund the next
step of a working thing."

- 27 chain-native deployments live at `<chain>.xono.ai`, each with its own database
- 13 adapter families behind one 24-function interface, contract-tested (250 tests)
- Live chain-head proof per build, read from that chain's own node
- Telegram Mini App (TON), with server-side `initData` HMAC verification
- Full game loop: purchase, customise, marketplace, AI Guardians, raids, DAO, affiliates
- SIWE wallet auth, email/guest accounts, NOWPayments rail with payment binding
- `GET /metrics/grant` — DAU/WAU/MAU, D1/D7 retention, per-chain scoped

## 4. Honesty block — paste into every application

> **Current state, stated plainly.** No NFT contract is deployed on any chain yet, so
> on-chain minting is stubbed and every deployment reports zero on-chain mints. The
> worlds are seeded demo data generated with chain-correct addresses and modelled
> retention (~D1 42% / D7 27%), so no build looks abandoned — these are not real
> players. Both facts are published on each build's `/ecosystem` page and on the
> landing page. This grant funds exactly the gap: contract deployment, audit, on-chain
> gameplay, and real users.

Reviewers discover seeded data on their own more often than founders expect. Disclosed
up front it is a roadmap; discovered later it ends the application.

## 5. Per-programme notes

| Programme | Adjust the template how |
|---|---|
| **Starknet Seed** (#18) | ≤$25K, MVP-stage is explicitly fine. Lead M1+M2 only. Cairo build. **Requires KYC/legal entity.** |
| **Starknet Growth** (#29) | Traction-gated to $1M — do **not** apply until M4 is done. |
| **Arbitrum GCP** (#31) | Milestones + audit both required. Deploy to Arbitrum/Orbit. Apply via Questbook. |
| **Solana Foundation** (#34) | Milestone track $5K–$250K. Open-source bias — publish the repo first. |
| **Tezos Foundation** (#45) | ~8% success, mostly from incomplete applications. Complete every field; gaming is a named end-user category. |
| **Cardano Catalyst** (#23) | Community-voted. Frame as the **open-source geospatial engine**, not a tile-selling game — see grants.md §0. |
| **Gitcoin QF** (#2) | Needs the public repo + public-good framing. Payout scales with unique donors. |
| **SKALE Indie** (#7) | Explicitly targets solo devs and indie studios — no team-size disadvantage. |
