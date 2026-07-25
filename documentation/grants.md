# Grant Programs — Chain & Requirement Matrix

Source: *Crypto Grants, Accelerators & Capital Dossier* (52 programs, verified 22 July 2026).
This document maps every program to the chain it requires and to CryptoLand's readiness,
so an application is never blocked on missing tech.

**Companion docs:** [multichain.md](multichain.md) (per-chain build model),
[architecture.md](architecture.md), [backend.md](backend.md).

---

## 0. Status corrections — verify before spending application hours

Re-checked against primary sources (25 July 2026). Three entries in the dossier have
materially changed, and one architectural constraint affects a whole class of programs.

| Finding | Impact |
|---|---|
| 🔴 **TON Grants & Bounties is PAUSED.** The `ton-society/grants-and-bounties` README states new submissions/applications are not being accepted. | Programs #26 and #42 are not directly applicable right now. The **Bounties** track (tooling/docs/education) and hackathons/Fast Grants remain live. A Telegram Mini App build is still worth doing — it is the highest-leverage distribution surface — but do not schedule it *for* the grant. |
| 🔴 **Optimism Retro Funding is PAUSED.** The Optimism Foundation announced it is pausing Retro Funding (Council dissolution, June 2026). Surviving Season 9 Growth Grants score *DEX TVL / trading volume*, which excludes a game. | Program #22 is out. Do not build a 2026 plan around RetroPGF. |
| 🟠 **Gitcoin restructured.** Grants Stack was sunset; GG24 is domain-based and QF operations moved to **Giveth** (apply on giveth.io, not a Gitcoin round manager). QF chains: Arbitrum, Celo, Ethereum. | Program #2 still viable but the process is different. See the public-good caveat below. |
| 🟠 **"Public good, not personal gain."** Giveth states projects focused on personal gain are ineligible for GIVbacks. | A tile-*selling* game is a poor fit as-framed. The fundable artifact should be reframed as the **open-source geospatial engine / multichain adapter layer / map tooling**, not the revenue-generating game. |
| 🔴 **Kadena has ceased operations.** The organization announced (Oct 2025) it is ending business activity and active maintenance. Chainweb EVM never reached mainnet, the documented testnet host no longer resolves in DNS, and Kadena has no entry in the canonical `ethereum-lists/chains` registry. | Program #39 is not actionable. Deliberately **not** configured — see the note in `config.js`. |
| 🔴 **Injective's "inEVM" (chainId 2525) is dead** — its RPC returns 404. The canonical Injective EVM is the native layer at **chainId 1776**. | Shipping 2525 would have given users a chain they cannot transact on. Config uses 1776. |
| 🟠 **Celo's Alfajores testnet (44787) is decommissioned** (DNS gone); the replacement is **Celo Sepolia (11142220)**. | Config uses Celo Sepolia. |
| 🟠 **SKALE testnet infrastructure is unreachable** (proxy host has no A records; a sibling host serves an unrelated TLS certificate). Mainnet hubs are healthy. | Only SKALE mainnet hubs (Nebula gaming + Europa) are configured. |
| 🟢 **Avalanche Retro9000 is ACTIVE** (C-Chain rounds running). | Program #21 is a live, realistic target. |
| ⚠️ **Retroactive programs measure on-chain activity, and our architecture currently produces almost none.** Retro9000 scores **AVAX burned by your contracts**; Optimism's (now-paused) thresholds were ≥1,000 tx / ≥420 qualified addresses / ≥10 active days over 180 days. Our DB-canonical model with a stubbed mint emits ~1 tx per purchase at best. | To compete in retroactive rounds, recurring gameplay actions (claim, upgrade, transfer, daily check-in) must move **on-chain**. This is a product decision, not a config change — see §7. |
| 🔑 **Keep the deployer key.** Both Optimism (OP Atlas) and Retro9000 require the **original deployer address to sign** a message to claim contract ownership. A throwaway deployer permanently forfeits attribution. | When deploying each chain's contract, use a retained, backed-up deployer key — ideally one per project, not shared across factories. |

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

`src/lib/blockchain/config.js` defines **55 chain entries — 29 mainnet plus 26 testnet
counterparts — across 13 adapter families**. One adapter serves an entire family, so adding
an EVM chain is a config entry and nothing else.

| Family | Adapter (registered in `index.js`) | Mainnet chains in `config.js` |
|---|---|---|
| `evm` | `adapters/evm.js` | Polygon, Avalanche, Base, Ethereum, Arbitrum One, Ronin, BNB Smart Chain, OP Mainnet, Scroll, Celo, Moonbeam, Beam, Oasys, SKALE Nebula Gaming Hub, SKALE Europa Hub, Hedera, Injective |
| `solana` | `adapters/solana.js` | Solana |
| `ton` | `adapters/ton.js` | TON |
| `aptos` | `adapters/aptos.js` | Aptos |
| `sui` | `adapters/sui.js` | Sui |
| `starknet` | `adapters/starknet.js` | Starknet |
| `cardano` | `adapters/cardano.js` | Cardano |
| `near` | `adapters/near.js` | NEAR |
| `stellar` | `adapters/stellar.js` | Stellar (Soroban) |
| `algorand` | `adapters/algorand.js` | Algorand |
| `multiversx` | `adapters/multiversx.js` | MultiversX |
| `radix` | `adapters/radix.js` | Radix |
| `tezos` | `adapters/tezos.js` | Tezos |

Every adapter implements the identical interface (enforced by `src/test/chains.test.js`), so
no chain can be half-added.

**Shipped as builds.** `scripts/build-chain.sh` and `env/` agree on **27 chain build
targets** — every mainnet chain above except `ethereum` (a general EVM target, not tied to a
named grant) and `skale-europa` (the SKALE grant build is the Nebula gaming hub). Each ships
to its own subdomain with its own backend and DB; see
[multichain.md → Deployment topology](multichain.md#deployment-topology).

### Deliberately NOT shipped

Three programs in §3 have **no chain entry and no build**, on purpose. Each decision is
recorded as a `NOTE` in `config.js` where the entry would otherwise sit.

| Chain | Program | Why not |
|---|---|---|
| **Kadena** | #39 Kadena Eco Grants | The organization announced (Oct 2025) it is ending business activity and active maintenance. **Chainweb EVM never reached mainnet**, the documented testnet host no longer resolves in DNS, and Kadena has no entry in the canonical `ethereum-lists/chains` registry. There is nothing to deploy to. |
| **Aztec** | #43 Aztec Grants (privacy) | Per **Aztec's own documentation**: the stack is unaudited with *critical bugs expected*; some circuits are *under-constrained, meaning soundness is not fully guaranteed*; *privacy is not guaranteed*; state does not survive rollup upgrades; and there is **no standard NFT contract**. It also offers **no arbitrary-message signing**, so our wallet-login flow (`signMessage` / `signPurchase`) cannot work there at all — the build would ship unable to log a user in. |
| **Celestia** | #32 Celestia Foundation | Celestia is a **data-availability layer, not a wallet chain**. The program needs a sovereign-rollup / DA narrative, not a deployment — there is no "deploy CryptoLand on Celestia" to do. |

These are documented as non-viable rather than shipped as broken builds. Revisit Aztec only
if it ships an audited mainnet with an NFT standard and message signing.

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
| 39 | Kadena Eco Grants ($100M) | Kadena | ~$100K | 🔴 **Not actionable** — org ceased operations Oct 2025, no EVM mainnet. Not configured; see §2 |
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
| 43 | Aztec Grants (privacy) | Aztec | ~$50K | 🔴 **Not shipped** — unaudited stack, no NFT standard, no message signing. See §2 |
| 32 | Celestia Foundation | Celestia (DA) | ~$100K | 🟠 DA layer, not a wallet chain — needs a sovereign-rollup/DA story, not a deployment. See §2 |

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

### Telegram Mini App (#26, #42 — TON; grants paused, distribution still valuable)
- `<script src="https://telegram.org/js/telegram-web-app.js?63">` must load **in `<head>`
  before any other script**; it is injected by the Telegram client, not an npm package, so it
  is `undefined` outside Telegram and every use must be feature-gated.
- `initData` is **the only trustworthy field** — `initDataUnsafe` must never be trusted.
  Server-side validation (implemented in `POST /auth/telegram`):
  ```
  data_check_string = fields except `hash`, sorted by key, "key=value", joined with "\n"
  secret_key        = HMAC_SHA256(key="WebAppData", message=<bot_token>)
  valid             = hex(HMAC_SHA256(secret_key, data_check_string)) == hash
  ```
  Note the **key/message inversion** in step 1 — the most common implementation bug. Also
  enforce a max age on `auth_date`.
- `tonconnect-manifest.json` (served at `public/tonconnect-manifest.json`): required `url`
  (no trailing slash), `name`, `iconUrl` (**PNG/ICO only — SVG is rejected**, ideally 180×180);
  `termsOfUseUrl`/`privacyPolicyUrl` optional but required for Tonkeeper's recommended list.
  Must be reachable over HTTPS by an unauthenticated cross-origin `GET` (no CORS rule, no auth,
  no challenge page).
- Use `viewportStableHeight`, not `viewportHeight`, for bottom-anchored UI. `LocationManager`
  (Bot API 8.0) gives native geolocation permission — directly useful for a map game.
- BotFather: `/newbot` → `/newapp` → *Bot Settings → Configure Mini App → Enable Mini App*.

### Solana Mobile (#16)
- **A PWA is acceptable** — wrap it into a signed APK with **Bubblewrap** (Trusted Web
  Activity). Publishing to the dApp Store is *not* required to apply.
- MWA on web: use **`@solana-mobile/wallet-standard-mobile` ≥ v0.5.0** and call `registerMwa()`
  in a non-SSR context. `@solana-mobile/wallet-adapter-mobile` is deprecated, and
  `@solana/wallet-adapter-react` ≥ 1.0.0 no longer bundles MWA by default.
  The ≥ v0.5.0 pin matters: browser **Local Network Access** enforcement silently breaks MWA
  signing in mobile web without it.
- **Seed Vault needs no direct integration** — dApps reach it *through* MWA. Do not budget
  engineering for `seed-vault-sdk` unless shipping a wallet.

### Other
- **Aztec (#43)** — deliberately not shipped. A Noir privacy mechanic is not the blocker;
  the blockers are structural (unaudited stack, under-constrained circuits, no NFT standard,
  no arbitrary-message signing → no wallet login). Full reasoning in §2.
- **Celestia (#32)** — needs a sovereign-rollup / DA narrative rather than a deployment; it is
  a data-availability layer, not a wallet chain. See §2.

---

## 7. On-chain impact — the gap that matters most

Retroactive and traction-gated programs score **on-chain** activity:

| Program | Primary metric |
|---|---|
| Avalanche Retro9000 | **AVAX burned** by your verified C-Chain contracts; users tiered `Unregistered` < `Connected` < `Verified` (wallet linked to the Retro9000 platform + verified X account) |
| Optimism (paused, but the template is being copied) | ≥1,000 tx, ≥420 qualified addresses, ≥10 distinct active days over 180 days |

CryptoLand today records ownership in the backend DB and treats the chain as a payment rail,
with `mintTile()` stubbed until a contract is deployed. That yields **at most one on-chain
transaction per purchase** — structurally uncompetitive in these rounds.

**To compete, move recurring gameplay on-chain**, not just the purchase: tile claim, upgrade,
transfer, guardian deploy, daily check-in. Each becomes a transaction, a distinct active day,
and fee burn. Practical sequencing:

1. Deploy the contract on the target chain and **verify it on the explorer** (Snowtrace for
   Retro9000) using a **retained deployer key**.
2. Turn on `mintTile()` by setting `VITE_CONTRACT_<CHAIN>` — already wired, no code change.
3. Move one or two high-frequency actions on-chain (check-in is the cheapest, highest-volume).
4. For Retro9000, drive users to **link and verify their wallet** on the Retro9000 platform —
   unlinked in-game wallets score in the lowest tier.
5. For measurability by Open Source Observer (used by Optimism/Gitcoin), add the project to
   `opensource-observer/oss-directory`. Note its network enum currently has **no Avalanche
   C-Chain, Ronin or BNB** — those chains are not OSO-measurable today.

Gasless is cheapest on **SKALE**: true zero-gas via the pre-deployed `Etherbase` contract
(`0xd2bA3e0000000000000000000000000000000000`), so no bundler, paymaster or ERC-4337 stack is
needed — just an sFUEL top-up during onboarding. Solana likewise supports native fee
sponsorship (set `feePayer` to a service key and partial-sign server-side). Everywhere else,
gasless means an ERC-7677 paymaster behind a **backend proxy** (never ship the paymaster URL
to the client).

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
