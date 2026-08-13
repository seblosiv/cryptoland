# Submitting Grant Applications — Playbook

The *what* and the *why* live in [grants.md](grants.md) (52-program matrix, status
corrections, non-chain requirements). This document is the *how*: the repeatable
mechanical sequence for turning "we support that chain" into a submitted application
with a live URL and real numbers attached.

**Companion docs:** [grants.md](grants.md) · [multichain.md](multichain.md) ·
[architecture.md](architecture.md)

---

## 1. Before you start (once)

Three things must exist before the first application. All three are one-time and all
three are currently **unmet in this repo** — do them first, not per-application.

### 1.1 A public repo + an OSI licence

```
Status: repo is git-initialised with NO remote configured and NO LICENSE file.
        (verified: `git remote -v` is empty; no LICENSE* at repo root)
```

Two of the fastest programs effectively require open source:

- **#2 Gitcoin QF / Giveth** — public-good funding assumes a public, licensed repo.
- **#16 Solana Mobile Builder Grants** — open-source is part of the expected profile.

Several others (#34 Solana Foundation, #4 DoraHacks, #10 Game3) score it heavily even
where it is not a hard gate. Pick a permissive OSI licence (MIT or Apache-2.0 — Apache-2.0
adds an explicit patent grant, which some foundations prefer), commit it at the repo
root, and push to a public remote **before** Wave 1. A private repo blocks the two
cheapest applications on the list.

> If parts of the stack must stay private (NOWPayments keys, seed data), that is a
> `.gitignore` question, not a reason to keep the repo private. `server/.env` is already
> ignored.

### 1.2 The retained deployer key — irreversible if lost

> 🔑 **The address that deploys each contract is the only address that can ever claim it.**

Both **Avalanche Retro9000** (#21) and **Optimism / OP Atlas** require the **original
deployer address to sign a message** to prove contract ownership. There is no recovery
path, no support ticket, no foundation override. A contract deployed from a throwaway key
is permanently unattributable — the on-chain activity still happens, but it can never be
counted toward *your* application.

Rules:

| Rule | Why |
|---|---|
| **Back the key up before the first deploy**, offline, in two places | Loss is unrecoverable and silent — you find out at claim time |
| **One deployer key per project** | A key shared with other projects makes attribution ambiguous |
| **Never deploy from a shared factory / third-party deployer service** | The factory's address becomes the deployer, not yours |
| **Record which key deployed which chain** | 27 build targets means up to 27 deploys to attribute later |
| **Verify the contract on the explorer immediately after deploying** | Retro9000 scores *verified* C-Chain contracts (Snowtrace) |

This matters even though minting is stubbed today: the moment you deploy any chain's
contract, the deployer identity is fixed forever. See
[grants.md §0](grants.md#0-status-corrections--verify-before-spending-application-hours)
and [§7](grants.md#7-on-chain-impact--the-gap-that-matters-most).

### 1.3 A hosted domain with per-chain subdomains

The deployment model is **one subdomain per chain**, named after the `VITE_CHAIN` key
(`base.xono.ai`, `ronin.xono.ai`, …) — see
[multichain.md → Deployment topology](multichain.md#deployment-topology). You need:

- the apex domain, with **wildcard DNS** (`*.xono.ai`) so a new chain is a build,
  not a DNS ticket;
- **HTTPS on every subdomain** — TON's `tonconnect-manifest.json` must be fetchable over
  HTTPS cross-origin and unauthenticated, and most wallet SDKs refuse non-secure origins;
- a static host with an **SPA rewrite** (unknown path → `index.html`).

Reviewers open the URL. A live, chain-native URL is worth more than every paragraph in
the application form — the dossier scores actual deployment 1.5–2× over "we could support
X" ([grants.md §1](grants.md#1-how-cryptoland-satisfies-a-chain-requirement)).

---

## 2. Per-application checklist

The same six steps every time. Substitute the chain key throughout; `base` is used here.

### Step 1 — Pick the program and read its row

Find the program in [grants.md §3](grants.md#3-the-52-programs). Note its **`Chain`**
column (that is your `VITE_CHAIN` key) and its **`Needs`** column (that is what the
application has to answer). Cross-check
[§0](grants.md#0-status-corrections--verify-before-spending-application-hours) — do not
spend hours on a paused program, and check [§4](grants.md#4-non-chain-requirements) for
capability gates.

### Step 2 — Build the chain-native bundle

```bash
npm run build:chain base          # → dist-base/
```

`scripts/build-chain.sh` stages `env/.env.base` → `.env.production`, then runs
`vite build --outDir dist-base`. **`env/` files are dotfiles** — `ls env/` shows nothing;
use `ls -A env/`. There are **27 templates, one per build target**:

```
EVM      polygon avalanche base arbitrum ronin bnb optimism scroll celo moonbeam
         beam oasys skale hedera injective
non-EVM  solana ton aptos sui starknet cardano near stellar algorand multiversx
         radix tezos
```

Set `VITE_API_BASE` in `env/.env.base` to that deployment's API origin **before**
building — it is compiled in. Leave it empty only if the API is same-origin.

```bash
npm run build:all-chains          # every chain in the script's list
```

### Step 3 — Deploy `dist-base/` to `base.xono.ai`

`dist-<chain>/` is a plain static bundle. Any static host works, with the SPA rewrite.

Each deployment also gets **its own backend and its own SQLite DB** — that is what makes
`/metrics/grant` report *this chain's* numbers and nothing else. The DB path is
env-configurable:

```bash
cd server
CRYPTOLAND_DB=/srv/cryptoland/base.db uvicorn main:app --host 0.0.0.0 --port 8000
```

`server/main.py` reads `CRYPTOLAND_DB` and falls back to `server/cryptoland.db` when it is
unset — so an unset variable silently shares the dev database across deployments. Set it
explicitly for every deployment.

> **Same-origin serving:** FastAPI's static mount is hardcoded to `<repo>/dist`, not
> `dist-<chain>`. To have one backend serve both the API and the bundle on one origin,
> symlink or copy `dist-base/` → `dist/` in that deployment's checkout. Otherwise host the
> bundle separately and point `VITE_API_BASE` at the API origin.

### Step 4 — (Optional) deploy the chain's contract and switch minting on

Only needed when the program scores on-chain activity (#21 Retro9000, #5 Base retro) or
explicitly asks for NFTs. Purchases, wallet connect and signing all work without it.

1. Deploy the contract with the **retained deployer key** from §1.2
   (EVM: `contracts/CryptoLandTile.sol` — see [blockchain.md](blockchain.md)).
2. Verify it on the chain's explorer.
3. Fill `VITE_CONTRACT_BASE=0x…` in `env/.env.base`
   (optionally `VITE_MARKETPLACE_BASE`, `VITE_TOKEN_BASE`).
4. Rebuild and redeploy:

```bash
npm run build:chain base
```

`hasContract()` flips true, `mintTile()` stops returning `{ minted: false }`, and every
new purchase anchors on-chain. **No code change** — see
[multichain.md → Deploy steps for a grant owner](multichain.md#deploy-steps-for-a-grant-owner).

### Step 5 — Pull the numbers

```bash
curl 'https://base.xono.ai/metrics/grant?days=30'
```

`GET /metrics/grant` (`server/main.py`) is read-only, aggregate-only (no PII), and
`days` is clamped to 1–365 (default 30). It returns exactly the fields grant forms ask
for:

| Block | Fields |
|---|---|
| `users` | `dau`, `wau`, `mau`, `registered_accounts`, `retention_d1_pct`, `retention_d7_pct` |
| `economy` | `tiles_sold_total`, `unique_owners`, `volume_usd_total`, `tiles_sold_window`, `volume_usd_window`, `nft_mints_onchain` |
| `by_chain` | per-chain `tiles` / `owners` / `volume_usd` |
| `engagement` | `guardians_deployed` |
| `timeseries` | per-day `active_users` + `events` over the window |

Active users are counted by wallet where present, falling back to session id — so the
numbers are meaningful before wallets are connected. Snapshot the JSON on the day you
submit and keep it: metrics-gated ladders (§3, Wave 3) ask you to show growth *between*
applications, and a saved baseline is the only way to do that.

### Step 6 — Submit with the live URL

Fill the form using §5 below. Always include:

- the **live chain-native URL** (`https://base.xono.ai`);
- the **reviewer page**, `https://base.xono.ai/ecosystem` — see below;
- the **numbers from step 5**, as numbers, with the window stated;
- the **public repo URL** (§1.1);
- the **deployed + verified contract address**, if step 4 was done.

#### The `/ecosystem` page

`src/components/EcosystemPage.jsx` is built for exactly one reader: the grant reviewer
who opens your link with four minutes to spend. Every deployment has it at
`/ecosystem`, chain-native without any per-chain edit, and it answers in their order —
who this is on their chain, live traction, how deep the native integration goes, why
this chain specifically, then one way into the product.

Prefer it over a slide deck: it renders the **same** `/metrics/grant` response you
quoted in step 5, live, from the deployment they are already looking at. A reviewer who
wants to check a number can, and that is the point.

When a programme **asks** for a deck, send one — `npm run build:deck` writes a
nine-slide `deploy/deck/<chain>.html` built from that chain's live contract and check
results, and ⌘P exports the landscape PDF a form expects. Only Rootstock names a deck
among the open grants; the rest of the demand is the equity and accelerator track
(Animoca, Alliance DAO, Outlier Ventures, a16z CSX, Arbitrum Gaming Ventures, Base
Batches, BNB MVB). Full list and rationale in [pitch-deck.md](pitch-deck.md). Attach it
**alongside** the live page, never instead of it.

It is also honest by construction, which is the part that protects the application:
the contract row reads "Not yet deployed — mint stubbed" until
`VITE_CONTRACT_<CHAIN>` is set, and the seeded-world disclosure sits directly under the
traction block. **Do not remove either before submitting.** A reviewer who discovers
the mint stub or the seed data on their own has found you hiding something; a reviewer
who reads it in your own words has found you being straight with them.

Then add the row to the tracker in §6 with the date.

---

## 3. Recommended order

Sequence by odds, not alphabetically. Each wave's output is the credential the next wave
asks for.

### Wave 1 — fast, high-approval, small checks

Land these first: small grants approve in weeks and each one becomes the track record
the larger programs require.

| # | Program | Chain | Max | Why first |
|---|---|---|---|---|
| 5 | Base Builder Grants | `base` | ~$25K | Retroactive, low-ceremony, and Base's builder funnel is the least gate-kept of the majors |
| 7 | SKALE $2M Indie Game Accelerator | `skale` | ~$100K | Explicitly indie-game-shaped, and zero-gas pairs with our gasless UX with no paymaster stack |
| 9 | Scroll Community Grants (micro tier) | `scroll` | ~$50K | Tiered — the microgrant is the low-bar entry, then the project grant |
| 8 | Tezos Ecosystem Bounty | `tezos` | ~$30K | Bounty-shaped, low friction, decided fast |
| 3 | Superteam Earn (regional) | `solana` | ~$10K | Fastest cheque on the list; a regional Superteam decision beats a foundation queue |
| 2 | Gitcoin QF (now via Giveth) | any | ~$20K | Chain-agnostic and community-driven, but needs §1.1 and the reframing in §5.3 |
| 4 | DoraHacks | any | ~$50K | One profile feeds many ecosystems — the per-chain builds are directly reusable |

### Wave 2 — games-native chains, where we are the ideal candidate

These chains fund games specifically, so odds-per-application are far better than the
crowded general-purpose majors.

| # | Program | Chain | Max | Why |
|---|---|---|---|---|
| 11 / 14 | Ronin Ecosystem Grants / Ronin Forge | `ronin` | ~$300K | A games-only chain — a geospatial land game is squarely their ICP, and one deployment serves both programs |
| 12 | Beam Foundation | `beam` | ~$250K | A gaming-dedicated Avalanche L1; the mandate is literally games |
| 30 | Oasys — Gaming grants | `oasys` | ~$200K | JP-market gaming L1, less competition from Western applicants |
| 31 | Arbitrum Gaming Catalyst (GCP) | `arbitrum` | ~$150K | Milestone tranches via Questbook — our roadmap maps cleanly onto tranches |

### Wave 3 — metrics-gated ladders

Only worth applying to once §2 step 5 produces numbers worth quoting. The pattern is the
same each time: take the seed tier, run for a season, then apply to the growth tier with
the delta.

| # | Program | Chain | Max | Ladder |
|---|---|---|---|---|
| 18 / 29 | Starknet Seed → Growth | `starknet` | ~$1M | Seed has a low bar; Growth is metrics-gated — take Seed first, purely to unlock Growth |
| 19 / 24 | Aptos Ecosystem (DoraHacks) → Aptos Foundation | `aptos` | ~$150K | #24 requires a live product with traction; #19 is the accessible rung below it |
| 17 | MultiversX Growth Games | `multiversx` | ~$1.5M | A competition, not a form — you are ranked against other projects on traction |
| 33 | SafePal Builder's Grant | `solana` | ~$100K | Judged on MAU/community, so it is a direct read of the `/metrics/grant` numbers |

### Wave 4 — equity accelerators, last

| # | Program | Max | Dilution |
|---|---|---|---|
| 49 | Outlier Ventures Base Camp | ~$200K | ~6% |
| 51 | Alliance DAO | ~$500K | ~7% |
| 52 | a16z crypto CSX | ~$500K | equity |
| 50 | Animoca Brands | ~$500K | equity (warm intro) |
| 47 | Arbitrum Gaming Ventures | ~$150K | investment |

These cost equity, and equity is cheapest to sell when you have leverage. Every
non-dilutive grant landed in Waves 1–3 raises the valuation you negotiate here. Apply
last, deliberately.

---

## 4. Do not apply to

Five programs are dead ends today. Skipping them saves the single largest block of wasted
application hours. All five are documented in
[grants.md §0](grants.md#0-status-corrections--verify-before-spending-application-hours)
and [§2](grants.md#deliberately-not-shipped).

| # | Program | Why not |
|---|---|---|
| 26 / 42 | **TON Grants & Bounties** | 🔴 **Paused** — the `ton-society/grants-and-bounties` README states new submissions/applications are not being accepted. The Bounties track and hackathons/Fast Grants remain live. Build the Telegram Mini App for *distribution* if you want it — it is the highest-leverage surface we have — but do not schedule it *for* the grant |
| 22 | **Optimism Retro Funding (RetroPGF)** | 🔴 **Paused** (Council dissolution, June 2026). The surviving Season 9 Growth Grants score DEX TVL and trading volume, which structurally excludes a game |
| 39 | **Kadena Eco Grants** | 🔴 **Organisation ceased operations** (Oct 2025). Chainweb EVM never reached mainnet, the documented testnet host no longer resolves in DNS, and Kadena has no entry in `ethereum-lists/chains`. There is nothing to deploy to — deliberately not configured |
| 43 | **Aztec Grants** | 🔴 Per Aztec's own docs: unaudited stack with critical bugs expected, under-constrained circuits, privacy not guaranteed, **no standard NFT contract**, and **no arbitrary-message signing** — our `signMessage` / `signPurchase` login cannot work at all. The build would ship unable to log a user in |
| 32 | **Celestia Foundation** | 🟠 Celestia is a **data-availability layer, not a wallet chain**. The program wants a sovereign-rollup / DA narrative, not a deployment — there is no "deploy CryptoLand on Celestia" to do |

Two more to handle with care rather than skip:

- **#21 Avalanche Retro9000** is 🟢 **active** and a realistic target — but it scores **AVAX
  burned by your verified contracts**, and our DB-canonical model with a stubbed mint emits
  at most one transaction per purchase. Do §2 step 4 first, and read
  [grants.md §7](grants.md#7-on-chain-impact--the-gap-that-matters-most) before applying.
- **#46 Avalanche Foundation Research Grants** is a research track — not a funding route
  for the game itself.

Revisit Aztec only if it ships an audited mainnet with an NFT standard and message
signing.

---

## 5. What to put in the application

### 5.1 Lead with the live product

Most applications are roadmaps. Ours is not — open the first paragraph with the URL and
the fact that it works today, then the numbers. Concretely:

1. **The live URL for their chain**, presented as a chain-native app, not a multichain app
   with their logo on it. That is exactly what the per-chain build produces: their
   ecosystem's accent, copy, and wallet list (see
   [multichain.md → chain profiles](multichain.md#per-chain-presentation-chain-profiles)).
2. **Real numbers from `/metrics/grant`**, with the window stated ("30-day window,
   pulled 2026-07-25"). Never round up, never project. A modest true number beats an
   impressive estimate, because the follow-up question is always "how did you measure
   that?" — and the answer is a documented, reproducible endpoint.
3. **What the money buys**, in their vocabulary.

### 5.2 Match the program's own language

Reviewers score against their own published criteria. Read the `Needs` column in
[grants.md §3](grants.md#3-the-52-programs) and answer it in the words the program uses:

| If the program asks for | Lead with |
|---|---|
| Gaming / player retention | Guardian AI agents, raids, retention_d1/d7, `guardians_deployed` |
| AI-native mechanics (#25, #36, #40, #10) | Guardian agents are core gameplay and already shipped — not a planned feature |
| Onchain impact (#21, #5) | `nft_mints_onchain`, the `nft_mints` tx-hash table, plus the §2 step 4 plan |
| Traction (#24, #33, #44, #17, #18/#29) | DAU/WAU/MAU + D1/D7 retention + volume, straight from the endpoint |
| Mobile-first (#16, #15) | PWA + Bubblewrap TWA path, mobile-first framing (see [grants.md §5](grants.md#5-programs-needing-more-than-a-chain-switch)) |
| Gasless / abstracted onboarding (#7, #5) | Email/guest accounts today; SKALE's true zero-gas needs no bundler or paymaster |
| Ecosystem-native deployment | A dedicated subdomain, dedicated backend, dedicated DB for *their* chain |

Do not send the same body text to two programs. The chain-specific `pitch` field in
`src/config/profiles.js` exists precisely so each deployment already states *why this
chain* in one sentence — reuse it as the application's opening line.

### 5.3 The "public good, not personal gain" reframing (Giveth / Gitcoin — #2)

Giveth states that **projects focused on personal gain are ineligible for GIVbacks**. A
game that *sells tiles* is a poor fit as-framed, and submitting it as-is is the single
most likely way to waste a QF round.

**Reframe the fundable artifact.** What is being funded is not the tile sales; it is the
open-source infrastructure underneath them:

| Do not fund | Fund |
|---|---|
| Tile sales / game revenue | The **open-source geospatial engine** — Z14 slippy-map tile math, deterministic tile↔ID mapping, GeoJSON rendering pipeline |
| Player acquisition | The **multichain adapter layer** — 13 adapter families behind one interface, an interface-conformance test suite, and a config-only path to adding a chain |
| Marketing | **Map tooling and reference implementations** other projects can reuse |

This is honest, not a dodge: the adapter layer and the tile engine genuinely are reusable
by any project, and they are the parts a QF round should fund. Requirements: the public
repo and OSI licence from §1.1, plus a community push — QF rewards the *number* of
contributors, not the amount. QF chains for GG24 are **Arbitrum, Celo and Ethereum**, and
the round is operated on **giveth.io**, not a Gitcoin round manager
([grants.md §0](grants.md#0-status-corrections--verify-before-spending-application-hours)).

### 5.4 Answer the question they will ask next

Three follow-ups arrive in almost every review. Pre-empt them:

- *"Is this really deployed on our chain, or is it a multichain app?"* → the subdomain,
  the accent, the wallet list, the per-chain DB.
- *"How do you measure that?"* → the `/metrics/grant` endpoint, described in one sentence.
- *"What happens if we fund you?"* → a milestone list that maps onto §2 step 4 (deploy,
  verify, move recurring actions on-chain), not a feature wish-list.

---

## 6. Tracking

Every program from [grants.md §3](grants.md#3-the-52-programs) that is actionable — all 52
minus the six ruled out in §4 — pre-filled as **Not started**. Update `Status` and
`Applied` in place as you go; keep the `/metrics/grant` snapshot you submitted alongside
the row.

`Status` values: `Not started` · `Drafting` · `Submitted` · `In review` · `Approved` ·
`Rejected` · `Deferred`.

### Wave 1 — fast wins

| Program | Chain | Status | Applied | Amount | Next action |
|---|---|---|---|---|---|
| #5 Base Builder Grants | `base` | Not started | — | ~$25K | Build + deploy `base.xono.ai` |
| #7 SKALE Indie Game Accelerator | `skale` | Not started | — | ~$100K | Build `skale` (Nebula hub); note zero-gas UX |
| #9 Scroll Community Grants (micro) | `scroll` | Not started | — | ~$50K | Apply to microgrant tier first |
| #8 Tezos Ecosystem Bounty | `tezos` | Not started | — | ~$30K | Find a matching open bounty |
| #3 Superteam Earn | `solana` | Not started | — | ~$10K | Pick the right regional Superteam |
| #2 Gitcoin QF (via Giveth) | any (ARB/CELO/ETH) | Not started | — | ~$20K | §1.1 public repo + licence, then §5.3 reframing |
| #4 DoraHacks | any | Not started | — | ~$50K | Create the org profile; reuse per-chain builds |

### Wave 2 — games-native chains

| Program | Chain | Status | Applied | Amount | Next action |
|---|---|---|---|---|---|
| #11 Ronin Ecosystem Grants | `ronin` | Not started | — | ~$300K | Build + deploy `ronin.xono.ai` |
| #14 Ronin Forge | `ronin` | Not started | — | ~$300K | Same deployment as #11 — apply after it |
| #12 Beam Foundation | `beam` | Not started | — | ~$250K | Build + deploy `beam.xono.ai` |
| #30 Oasys Gaming grants | `oasys` | Not started | — | ~$200K | Build + deploy; consider JP-market framing |
| #31 Arbitrum Gaming Catalyst (GCP) | `arbitrum` | Not started | — | ~$150K | Draft milestone tranches for Questbook |

### Wave 3 — metrics-gated ladders

| Program | Chain | Status | Applied | Amount | Next action |
|---|---|---|---|---|---|
| #18 Starknet Seed | `starknet` | Not started | — | ~$1M | Take Seed first to unlock Growth |
| #29 Starknet Growth | `starknet` | Not started | — | ~$1M | Blocked on #18 + a metrics delta |
| #19 Aptos Ecosystem (DoraHacks) | `aptos` | Not started | — | ~$150K | Accessible rung; Move deploy differentiates |
| #24 Aptos Foundation | `aptos` | Not started | — | ~$100K | Requires live product + traction — after #19 |
| #17 MultiversX Growth Games | `multiversx` | Not started | — | ~$1.5M | Competition format — enter with traction |
| #33 SafePal Builder's Grant | `solana` | Not started | — | ~$100K | Quote MAU/community from `/metrics/grant` |

### Wave 4 — equity / accelerators (last)

| Program | Chain | Status | Applied | Amount | Next action |
|---|---|---|---|---|---|
| #49 Outlier Ventures Base Camp | any | Not started | — | ~$200K (~6%) | Only after Waves 1–3 give leverage |
| #51 Alliance DAO | any | Not started | — | ~$500K (~7%) | Only after Waves 1–3 |
| #52 a16z crypto CSX | any | Not started | — | ~$500K (equity) | Only after Waves 1–3 |
| #50 Animoca Brands | any | Not started | — | ~$500K (equity) | Needs a warm intro |
| #47 Arbitrum Gaming Ventures | `arbitrum` | Not started | — | ~$150K (investment) | Pair with #31 outcome |

### Unsequenced — apply opportunistically as rounds open

| Program | Chain | Status | Applied | Amount | Next action |
|---|---|---|---|---|---|
| #1 Alchemy startup credits | any | Not started | — | ~$5K credits | Point `VITE_RPC_<CHAIN>` at Alchemy endpoints |
| #10 Game3 Foundation | any | Not started | — | ~$50K | Lead with Guardian AI agents |
| #44 BNB Chain MVB S10 | `bnb` | Not started | — | ~$300K | Cohort program — needs working game + users |
| #25 Polygon Community Grants S2 | `polygon` | Not started | — | ~$100K | Use the AI-agent hook |
| #27 Polygon Community Grants S2/3 | `polygon` | Not started | — | ~$50K | Season-gated via Questbook |
| #21 Avalanche Retro9000 | `avalanche` | Not started | — | ~$100K | Do §2 step 4 first — scores AVAX burned |
| #46 Avalanche Research Grants | `avalanche` | Not started | — | ~$50K | Research track only — not for the game |
| #15 Celo Builder Fund (CeloPG) | `celo` | Not started | — | ~$250K | Mobile/consumer framing |
| #28 Prezenti (Celo Community) | `celo` | Not started | — | ~$50K | Round-window gated — watch for the anchor pool |
| #20 Moonbeam Interim Grant | `moonbeam` | Not started | — | ~$150K | Less crowded ecosystem |
| #38 Hedera (HBAR Foundation) | `hedera` | Not started | — | ~$250K | Enterprise-formal process — budget time |
| #40 Injective Ecosystem / AI fund | `injective` | Not started | — | ~$150K | Needs a finance or AI-agent hook (chainId 1776) |
| #6 Radix Booster Grants | `radix` | Not started | — | ~$160K | $5K MVP tier → $140K Growth ladder |
| #16 Solana Mobile Builder Grants | `solana` | Not started | — | ~$100K | PWA → Bubblewrap TWA; `wallet-standard-mobile` ≥ 0.5.0 |
| #34 Solana Foundation (4 tracks) | `solana` | Not started | — | ~$250K | Gaming is a named 2026 priority |
| #41 Solana Foundation (rolling) | `solana` | Not started | — | ~$100K | Pair with a Colosseum hackathon |
| #35 Sui Foundation Grants / RFP | `sui` | Not started | — | ~$200K | Wait for a matching open RFP |
| #23 Cardano CAP + Project Catalyst | `cardano` | Not started | — | ~$100K | Catalyst QF is the accessible path |
| #48 Cardano Accelerator (Fall '26) | `cardano` | Not started | — | ~$100K | Theme "Real-World Trust" — weak fit, low priority |
| #36 NEAR Foundation Funding | `near` | Not started | — | ~$200K | AI-agent / chain-abstraction hook |
| #13 Stellar Community Fund | `stellar` | Not started | — | ~$150K | Quarterly rounds — community-voted |
| #37 Algorand Foundation Grants | `algorand` | Not started | — | ~$150K | xGov community funding path |
| #45 Tezos Foundation Grants | `tezos` | Not started | — | ~$50K | ~8% base rate — completeness matters |

### Ruled out — do not apply (see §4)

| Program | Reason |
|---|---|
| #26 TON Mini App / Open League | Paused |
| #42 TON Memelandia / TON grants | Paused |
| #22 Optimism Retro Funding | Paused; survivors score DEX TVL |
| #39 Kadena Eco Grants | Org ceased operations; no EVM mainnet |
| #43 Aztec Grants | Unaudited, no NFT standard, no message signing |
| #32 Celestia Foundation | DA layer, not a wallet chain |

---

## Related docs

- [grants.md](grants.md) — the 52-program matrix, status corrections, non-chain
  requirements, and the on-chain-impact gap.
- [multichain.md](multichain.md) — per-chain build model, deployment topology, chain
  profiles, and the grant-owner deploy steps.
- [blockchain.md](blockchain.md) — adapter interface, `CryptoLandTile.sol`, wallet auth.
- [backend.md](backend.md) — endpoints, schema, and the `blocks.chain` column.
