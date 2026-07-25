# Grant Programs — Chain & Requirement Matrix

Source: *Crypto Grants, Accelerators & Capital Dossier* (52 programs, verified 22 July 2026).
This document maps every program to the chain it requires and to CryptoLand's readiness,
so an application is never blocked on missing tech.

**Companion docs:** [multichain.md](multichain.md) (per-chain build model),
[architecture.md](architecture.md), [backend.md](backend.md).

---

## 1. How CryptoLand satisfies a chain requirement

CryptoLand is **one codebase deployed as N chain-native builds**. Committing to a chain
costs one env file, not a fork:

```bash
cp env/.env.<chain> .env.production   # or: npm run build:chain <chain>
npm run build:chain <chain>           # emits dist-<chain>/
```

Ownership is recorded in the backend DB and anchored on-chain once that chain's contract is
deployed (`VITE_CONTRACT_<CHAIN>`). Until then **connect + sign + purchase all work** — only
the NFT mint is skipped. That means a chain is "application-ready" the moment its config
entry and adapter exist; contract deployment is a later, independent step.

Reviewers reward *actual* deployment over "we could support X"
(the dossier scores this 1.5–2×), which is exactly what the per-chain builds provide.

---

## 2. Chain coverage

| Family | Adapter | Chains |
|---|---|---|
| EVM | `adapters/evm.js` | Polygon, Avalanche, Base, Arbitrum, Ronin, BNB, Ethereum, Optimism, Scroll, Celo, Moonbeam, Beam, Oasys, SKALE, Hedera, Injective, Kadena |
| Solana | `adapters/solana.js` | Solana |
| TON | `adapters/ton.js` | TON |
| Aptos | `adapters/aptos.js` | Aptos |
| Sui | `adapters/sui.js` | Sui |
| Starknet | `adapters/starknet.js` | Starknet |
| Cardano | `adapters/cardano.js` | Cardano |
| NEAR | `adapters/near.js` | NEAR |
| Stellar | `adapters/stellar.js` | Stellar (Soroban) |
| Algorand | `adapters/algorand.js` | Algorand |
| MultiversX | `adapters/multiversx.js` | MultiversX |
| Radix | `adapters/radix.js` | Radix |
| Tezos | `adapters/tezos.js` | Tezos |

Every adapter implements the identical interface (enforced by `src/test/chains.test.js`), so
no chain can be half-added.

---

## 3. The 52 programs

`Chain` = what you must deploy on to be eligible. `Needs` = work beyond having the chain wired.

### Chain-agnostic (no chain work — apply with any build)

| # | Program | Max | Equity | Needs |
|---|---|---|---|---|
| 1 | Alchemy startup credits (not a $5K cash grant) | ~$5K credits | 0% | Use `VITE_RPC_<CHAIN>` to point at Alchemy endpoints |
| 2 | Gitcoin Grants (Quadratic Funding) | ~$20K | 0% | Public repo + OSS licence + public-good framing; community push |
| 4 | DoraHacks (multi-chain hackathons + grant DAOs) | ~$50K | 0% | One profile → many ecosystems; reuse the per-chain builds |
| 10 | Game3 Foundation Grants | ~$50K | 0% | Chain-agnostic; gaming×blockchain×AI — Guardian AI agents fit |
| 49 | Outlier Ventures Base Camp | ~$200K | ~6% | Accelerator (dilutive) |
| 50 | Animoca Brands | ~$500K | equity | Strategic investment; warm intro |
| 51 | Alliance DAO | ~$500K | ~7% | Accelerator (dilutive) |
| 52 | a16z crypto CSX | ~$500K | equity | Accelerator (dilutive) |

### EVM chains

| # | Program | Chain | Max | Needs |
|---|---|---|---|---|
| 5 | Base Builder Grants / Ecosystem Fund | Base | ~$25K | Ship onchain on Base; retroactive |
| 11 | Ronin Ecosystem Grants ($10M) | Ronin | ~$300K | Games-only chain — strong fit |
| 14 | Ronin Forge | Ronin | ~$300K | Same deployment as #11 |
| 31 | Arbitrum Gaming Catalyst (GCP) | Arbitrum / Orbit | ~$150K | Milestone tranches via Questbook |
| 47 | Arbitrum Gaming Ventures | Arbitrum | ~$150K | Investment (dilutive) |
| 44 | BNB Chain MVB S10 | BNB / opBNB | ~$300K | Cohort program; working game + users |
| 25 | Polygon Community Grants S2 (35M POL) | Polygon | ~$100K | AI hook helps (Guardian agents) |
| 27 | Polygon Community Grants S2/3 | Polygon | ~$50K | Questbook, season-based |
| 21 | Avalanche Retro9000 / Codebase | Avalanche (L1) | ~$100K | **Retroactive** — needs measurable on-chain impact |
| 46 | Avalanche Foundation Research Grants | Avalanche | ~$50K | Research track only — not for the game |
| 12 | Beam Foundation (gaming) | Beam | ~$250K | Gaming-dedicated Avalanche L1 |
| 22 | Optimism Retro Funding (RetroPGF) | Optimism / Superchain | ~$100K | **Retroactive** — instrument impact |
| 9 | Scroll Community Grants | Scroll | ~$50K | Tiered: microgrant → project grant |
| 15 | Celo Builder Fund (CeloPG) | Celo | ~$250K | Mobile/consumer framing |
| 28 | Prezenti — Celo Community Grants | Celo | ~$50K | Anchor pool; round-window gated |
| 20 | Moonbeam Interim Grant | Moonbeam | ~$150K | Less crowded ecosystem |
| 30 | Oasys — Gaming grants | Oasys | ~$200K | JP-market gaming L1 |
| 7 | SKALE $2M Indie Game Accelerator | SKALE | ~$100K | Zero-gas chain — pairs with gasless UX |
| 38 | Hedera (HBAR Foundation) | Hedera (EVM) | ~$250K | Enterprise-formal process |
| 40 | Injective — Ecosystem / AI fund | Injective (inEVM) | ~$150K | Needs finance or AI-agent hook |
| 39 | Kadena Eco Grants ($100M) | Kadena | ~$100K | Less-crowded ecosystem |
| 6 | Radix Booster Grants (tiered) | Radix | ~$160K | $5K MVP → $140K Growth ladder |

### Non-EVM chains

| # | Program | Chain | Max | Needs |
|---|---|---|---|---|
| 3 | Superteam Earn (regional) | Solana | ~$10K | Fast regional grant |
| 16 | Solana Mobile Builder Grants | Solana | ~$100K | **Mobile-first + Solana Mobile Stack** |
| 33 | SafePal Builder's Grant | Solana | ~$100K | Judged on MAU/community — use `/metrics/grant` |
| 34 | Solana Foundation Grants (4 tracks) | Solana | ~$250K | Gaming is a named 2026 priority |
| 41 | Solana Foundation Grants (rolling) | Solana | ~$100K | Pair with Colosseum hackathon |
| 26 | TON Mini App / Open League | TON | ~$50K | **Telegram Mini App build** |
| 42 | TON Memelandia / TON grants | TON | ~$100K | Target the Mini App track |
| 19 | Aptos Ecosystem Grants (DoraHacks) | Aptos | ~$150K | Move deployment differentiates |
| 24 | Aptos Foundation Grant Program | Aptos | ~$100K | **Requires live product + traction** |
| 35 | Sui Foundation Grants / RFP | Sui | ~$200K | Match an open RFP |
| 18 | Starknet Seed + Growth | Starknet | ~$1M | Seed low-bar; Growth metrics-gated |
| 29 | Starknet Growth / Seed | Starknet | ~$1M | Same ladder as #18 |
| 23 | Cardano CAP + Project Catalyst | Cardano | ~$100K | Catalyst QF is the accessible path |
| 48 | Cardano Accelerator (Fall '26) | Cardano | ~$100K | Theme "Real-World Trust" — weak fit |
| 36 | NEAR Foundation Funding | NEAR | ~$200K | AI-agent / chain-abstraction hook |
| 13 | Stellar Community Fund | Stellar (Soroban) | ~$150K | Quarterly rounds, community-voted |
| 37 | Algorand Foundation Grants | Algorand | ~$150K | xGov community funding |
| 17 | MultiversX Growth Games | MultiversX | ~$1.5M | Competition format — traction ranks |
| 8 | Tezos Ecosystem Bounty | Tezos | ~$30K | Low-friction bounties |
| 45 | Tezos Foundation Grants | Tezos | ~$50K | ~8% base rate — completeness matters |
| 43 | Aztec Grants (privacy) | Aztec | ~$50K | Needs a privacy/Noir mechanic |
| 32 | Celestia Foundation | Celestia (DA) | ~$100K | Needs a sovereign-rollup/DA story |

---

## 4. Non-chain requirements

Beyond a chain deployment, several programs gate on capabilities. Status in this codebase:

| Requirement | Programs | Status |
|---|---|---|
| **Traction metrics** (DAU/MAU/retention/tx) | 24 Aptos, 33 SafePal, 44 BNB MVB, 17 MultiversX, 18/29 Starknet Growth | ✅ `GET /metrics/grant` returns DAU/WAU/MAU, D1/D7 retention, volume, NFT mints, per-chain split |
| **Conversion funnel instrumentation** | all metrics-aware | ✅ `page_view → tile_click → purchase_open → payment_start → payment_confirmed`, plus `nft_mint`, `guardian_deploy`, `raid_launched` |
| **Measurable on-chain impact** | 21 Retro9000, 22 RetroPGF, 5 Base retro | ✅ `nft_mint` events + `nft_mints` table record tx hashes per chain |
| **AI-native mechanic** | 25 Polygon (AI GAs), 36 NEAR, 40 Injective, 10 Game3 | ✅ Guardian AI agents + agent feed already core gameplay |
| **Telegram Mini App** | 26, 42 TON | See §5 |
| **Mobile-first + Solana Mobile Stack** | 16 Solana Mobile | See §5 |
| **Open source + public repo** | 2 Gitcoin QF, 34 Solana (public-good framing) | Repo is git-initialised; needs a public remote + OSS licence |
| **Gasless / abstracted onboarding** | 7 SKALE, 5 Base, general 2026 thesis | Email/guest accounts exist; gas sponsorship per chain is future work |

---

## 5. Programs needing more than a chain switch

- **TON Mini App (#26, #42)** — requires a Telegram Mini App build: the Telegram WebApp SDK,
  a hosted `tonconnect-manifest.json`, TON Connect wiring, and BotFather registration.
- **Solana Mobile (#16)** — requires a mobile-first build integrating the Solana Mobile Stack
  (Mobile Wallet Adapter, Seed Vault).
- **Aztec (#43)** — privacy mechanic in Noir; the ecosystem's maturity should be confirmed
  before investing here.
- **Celestia (#32)** — needs a sovereign-rollup / DA narrative rather than a normal deployment.

---

## 6. Suggested sequence

The dossier's own advice, mapped to our builds:

1. **Fast wins first** — Base Builder (#5), Superteam (#3), Gitcoin QF (#2), DoraHacks (#4),
   SKALE (#7), Scroll micro (#9), Tezos bounty (#8). Small checks, high approval; each one
   builds the track record the bigger grants ask for.
2. **Games-native chains next** — Ronin (#11/#14), Beam (#12), Oasys (#30), Arbitrum GCP (#31).
   We are their ICP, so odds-per-application are far better than the crowded majors.
3. **Ladder the metrics-gated ones** — land a seed grant, then use `/metrics/grant` output to
   apply for the Growth tier (Starknet #18/#29, MultiversX #17, Aptos #24).
4. **Equity accelerators last** (#49–#52) — only once there is leverage to negotiate.
