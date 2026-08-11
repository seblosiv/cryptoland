/**
 * All 52 grant / accelerator programmes — the single source of truth for
 * documentation/grants.md, documentation/program-requirements.md and the
 * /status board.
 *
 * `status` is what a probe actually established, never an assumption:
 *   OPEN     — the page or form says so, in words, and `evidence` quotes them
 *   ROLLING  — accepts applications continuously, no window
 *   FLUX     — the programme is being restructured; confirm before writing
 *   PROPOSAL — funded by governance proposal, there is no application form
 *   NO-FORM  — alive, but nothing public to apply to (retroactive / VC / invite)
 *   DEAD     — closed, archived, or the programme page 404s
 *   BLOCKED  — deliberately not pursued; `evidence` says why
 *
 * `verified` is the date THAT status was last established by a probe. Anything
 * older than ~2 weeks should be re-run before it is cited — the July dossier's
 * URLs had already rotted within a week of being written.
 *
 * Re-verify with:  node scripts/probe-render.mjs
 *                  python3 scripts/probe-forums.py     ← governance forums
 */

export const VERIFIED_ON = '2026-07-31';

// Expanded from 52 to 60 on 2026-07-31. The original 52 came from a single July
// dossier; scraping five grant aggregators and diffing surfaced 83 names it never
// mentioned, of which 8 verified as open. Treat the list as a living set, not a
// fixed one — re-run the aggregator diff before each submission round.

// Successor sweep 2026-07-31: a foundation that shuts a grants council rarely
// stops funding — it renames. Three programmes previously recorded as dead or
// form-less turned out to have live successors worth real money (#5 Base
// Batches, #37 Algorand xGov, #50 Animoca Minds). Always ask "what replaced
// it?" before writing a programme off.

export const PROGRAMS = [
  // ── Confirmed OPEN ────────────────────────────────────────────────────────
  { n: 2, name: 'Gitcoin / Giveth QF', chain: 'Any', amount: '~$20K', equity: '0%',
    status: 'OPEN', verified: '2026-07-30', url: 'https://giveth.io',
    evidence: '"Applications open"',
    note: 'Needs the public repo + OSS licence + public-good framing.' },
  { n: 3, name: 'Superteam Earn', chain: 'Solana', amount: '~$10K', equity: '0%',
    status: 'OPEN', verified: '2026-07-30', url: 'https://superteam.fun/earn/grants',
    evidence: '"Apply Now"', note: 'Fast regional grant.' },
  { n: 6, name: 'Radix Grants Program', chain: 'Radix', amount: '~$160K', equity: '0%',
    status: 'OPEN', verified: '2026-07-30',
    url: 'https://developers.radixdlt.com/grants',
    evidence: 'live Google Form: "Radix Grants Program Application Form"',
    note: '$5K MVP → $140K Growth ladder. Confirmed by opening the form itself.' },
  { n: 8, name: 'Tezos Ecosystem Grants', chain: 'Tezos', amount: '~$30K', equity: '0%',
    status: 'OPEN', verified: '2026-07-30', url: 'https://tezos.foundation/grants',
    evidence: '"Apply now"', note: 'Low-friction bounty track.' },
  { n: 10, name: 'Game3 Foundation', chain: 'Any', amount: '~$50K', equity: '0%',
    status: 'OPEN', verified: '2026-07-30', url: 'https://game3.gg',
    evidence: 'probe: OPEN', note: 'gaming × blockchain × AI — the Guardian agents fit.' },
  { n: 12, name: 'Beam Foundation', chain: 'Beam', amount: '~$250K', equity: '0%',
    status: 'OPEN', verified: '2026-07-30', url: 'https://onbeam.com',
    evidence: 'probe: OPEN', note: 'Gaming-dedicated Avalanche L1.' },
  { n: 13, name: 'Stellar Community Fund (SCF#11)', chain: 'Stellar', amount: '~$150K', equity: '0%',
    status: 'OPEN', verified: '2026-07-31', url: 'https://communityfund.stellar.org',
    evidence: '"Submissions Open For SCF#11" — up to $150,000 in XLM',
    note: 'Quarterly rounds, community-voted.' },
  { n: 15, name: 'Celo — Prezenti Grants (Season 3)', chain: 'Celo', amount: '~$250K', equity: '0%',
    status: 'OPEN', verified: '2026-07-31', url: 'https://www.prezenti.xyz',
    evidence: '"Prezenti Grants: Season 3 Plan" (23 Jul 2026) — $165,000 redeployed',
    note: 'NOT "CeloPG" — the programme is called Prezenti. That naming is why celopg.eco read as unclear through five automated passes.' },
  { n: 16, name: 'Solana Mobile Builder Grants', chain: 'Solana', amount: '~$100K', equity: '0%',
    status: 'OPEN', verified: '2026-07-30', url: 'https://solanamobile.com',
    evidence: 'probe: OPEN', note: 'Mobile-first + Solana Mobile Stack.' },
  { n: 17, name: 'MultiversX Growth Games', chain: 'MultiversX', amount: '~$1.5M', equity: '0%',
    status: 'OPEN', verified: '2026-07-30', url: 'https://multiversx.com/growthgames',
    evidence: '"apply for a grant"', note: 'Competition format — traction ranks.' },
  { n: 18, name: 'Starknet Seed Grants', chain: 'Starknet', amount: '~$25K', equity: '0%',
    status: 'OPEN', verified: '2026-07-30', url: 'https://www.starknet.io/grants/',
    evidence: 'probe: OPEN', note: 'Low-bar seed tier; Growth is metrics-gated.' },
  { n: 19, name: 'Aptos Ecosystem Grants', chain: 'Aptos', amount: '~$150K', equity: '0%',
    status: 'OPEN', verified: '2026-07-31', url: 'https://aptosfoundation.org/grants',
    evidence: 'multiple live tracks; "Apply for up to $25K in third-party audits"',
    note: 'A real Move deployment differentiates us here.' },
  { n: 20, name: 'Moonbeam Grants', chain: 'Moonbeam', amount: '~$150K', equity: '0%',
    status: 'DEAD', verified: '2026-07-30', url: 'https://moonbeam.foundation',
    evidence: 'Moonbeam Foundation support, 2026-08-11: "Moonbeam and Moonriver have migrated to Base and the chains wound down." Verified on-chain: block 16796699 static across repeated samples, last block ~27.6h old, primary RPC dead. Binance shows GLMR/Moonbeam with BOTH deposit and withdrawal disabled, while GLMR on BSC and Base remain open.', note: 'Less crowded ecosystem.' },
  { n: 21, name: 'Avalanche Retro9000', chain: 'Avalanche', amount: '~$100K', equity: '0%',
    status: 'OPEN', verified: '2026-07-30', url: 'https://retro9000.avax.network',
    evidence: '"Apply Now"', deadline: 'snapshot 17 Jul 2026 has PASSED — confirm the next window',
    note: 'RETROACTIVE — ranks by AVAX burned by your contracts. Structurally hard for us at ~1 tx/purchase.' },
  { n: 23, name: 'Cardano Project Catalyst', chain: 'Cardano', amount: '~$100K', equity: '0%',
    status: 'OPEN', verified: '2026-07-30', url: 'https://projectcatalyst.io',
    evidence: '"Submit a proposal"', note: 'Catalyst QF is the accessible path.' },
  { n: 24, name: 'Aptos Foundation Grants', chain: 'Aptos', amount: '~$100K', equity: '0%',
    status: 'OPEN', verified: '2026-07-30', url: 'https://aptosfoundation.org/grants',
    evidence: 'probe: OPEN', note: 'Requires live product + traction.' },
  { n: 25, name: 'Polygon Community Grants', chain: 'Polygon', amount: '~$100K', equity: '0%',
    status: 'OPEN', verified: '2026-07-30', url: 'https://polygon.technology/village',
    evidence: '"APPLY NOW"', note: 'The AI hook (Guardian agents) helps.' },
  { n: 27, name: 'Polygon Community Grants S2/S3', chain: 'Polygon', amount: '~$50K', equity: '0%',
    status: 'OPEN', verified: '2026-07-30', url: 'https://polygon.technology/village',
    evidence: 'same programme surface as #25', note: 'Questbook, season-based.' },
  { n: 28, name: 'Prezenti — Celo Community Grants', chain: 'Celo', amount: '~$50K', equity: '0%',
    status: 'OPEN', verified: '2026-07-31', url: 'https://www.prezenti.xyz',
    evidence: 'Season 3 funded (forum.celo.org, 23 Jul 2026)',
    note: 'Same programme as #15 — they are one entity, not two.' },
  { n: 29, name: 'Starknet Growth Grants', chain: 'Starknet', amount: '~$1M', equity: '0%',
    status: 'OPEN', verified: '2026-07-30', url: 'https://www.starknet.io/grants/',
    evidence: '"Apply now Ecosystem Integration Grants"', note: 'Metrics-gated.' },
  { n: 31, name: 'Arbitrum Foundation Grants', chain: 'Arbitrum', amount: '~$150K', equity: '0%',
    status: 'OPEN', verified: '2026-07-30', url: 'https://arbitrum.foundation/grants',
    evidence: '"Apply now Active Arbitrum Audit Program / ArbiFuel"',
    note: 'Milestone tranches via Questbook.' },
  { n: 33, name: "SafePal Builder's Grant", chain: 'Solana', amount: '~$100K', equity: '0%',
    status: 'OPEN', verified: '2026-07-30', url: 'https://www.safepal.com',
    evidence: 'probe: OPEN', deadline: '2026',
    note: 'Judged on MAU/community — cite /metrics/grant.' },
  { n: 34, name: 'Solana Foundation Grants', chain: 'Solana', amount: '~$250K', equity: '0%',
    status: 'OPEN', verified: '2026-07-30', url: 'https://solana.org/grants-funding',
    evidence: '"Provide a brief project overview… public good"',
    note: 'Gaming is a named 2026 priority.' },
  { n: 35, name: 'Sui Foundation Grants', chain: 'Sui', amount: '~$200K', equity: '0%',
    status: 'OPEN', verified: '2026-07-30', url: 'https://sui.io/developers',
    evidence: '"Apply now"', note: 'Match an open RFP.' },
  { n: 38, name: 'HBAR Foundation', chain: 'Hedera', amount: '~$250K', equity: '0%',
    status: 'OPEN', verified: '2026-07-30', url: 'https://hbarfoundation.org',
    evidence: '"Submit a proposal"', note: 'Enterprise-formal process.' },
  { n: 41, name: 'Solana Foundation (rolling)', chain: 'Solana', amount: '~$100K', equity: '0%',
    status: 'ROLLING', verified: '2026-07-30', url: 'https://solana.org/grants-funding',
    evidence: '"rolling basis"', note: 'Pair with a Colosseum hackathon.' },
  { n: 44, name: 'BNB Chain MVB S10', chain: 'BNB', amount: '~$300K', equity: '0%',
    status: 'OPEN', verified: '2026-07-30', url: 'https://www.bnbchain.org/en/developers/mvb',
    evidence: 'probe: OPEN', note: 'Cohort programme — season windows open and close.' },
  { n: 45, name: 'Tezos Foundation Grants', chain: 'Tezos', amount: '~$50K', equity: '0%',
    status: 'OPEN', verified: '2026-07-30', url: 'https://tezos.foundation/grants',
    evidence: '"Apply now"', note: '~8% base rate — completeness matters.' },
  { n: 47, name: 'Arbitrum Gaming Ventures', chain: 'Arbitrum', amount: '~$150K', equity: 'equity',
    status: 'OPEN', verified: '2026-07-30', url: 'https://arbitrum.foundation',
    evidence: '"APPLY NOW"', note: 'Investment — dilutive.' },
  { n: 48, name: 'Cardano Foundation', chain: 'Cardano', amount: '~$100K', equity: '0%',
    status: 'OPEN', verified: '2026-07-30', url: 'https://cardanofoundation.org',
    evidence: 'probe: OPEN', note: 'Accelerator theme "Real-World Trust" — weak fit.' },
  { n: 49, name: 'Outlier Ventures Base Camp', chain: 'Any', amount: '~$200K', equity: '~6%',
    status: 'OPEN', verified: '2026-07-30', url: 'https://outlierventures.io',
    evidence: '"Register your interest for our upcoming accelerators"',
    note: 'Accelerator — dilutive.' },
  { n: 51, name: 'Alliance DAO', chain: 'Any', amount: '~$500K', equity: '~7%',
    status: 'OPEN', verified: '2026-07-30', url: 'https://alliance.xyz',
    evidence: '"submit applications as early as possible"', note: 'Accelerator — dilutive.' },

  // ── Rolling / always-on ───────────────────────────────────────────────────
  { n: 1, name: 'Alchemy startup credits', chain: 'Any', amount: '~$5K credits', equity: '0%',
    status: 'ROLLING', verified: '2026-07-30', url: 'https://www.alchemy.com/startups',
    evidence: 'credits programme, always open',
    note: 'Not cash. Point VITE_RPC_<CHAIN> at Alchemy endpoints.' },

  // ── In flux — confirm before writing ──────────────────────────────────────
  { n: 22, name: 'Optimism Retro Funding', chain: 'Optimism', amount: '~$100K', equity: '0%',
    status: 'FLUX', verified: '2026-07-31', url: 'https://gov.optimism.io/t/10732',
    evidence: '"Council Dissolution Proposal: Dissolve the Grants Council" (25 Jun 2026), contested. No successor route found: Governance Fund Missions has nothing newer than Dec 2025 and app.optimism.io/retropgf is "Page not found"',
    note: 'Retro Funding was already paused. Current work is "S9 Impact Autopsy & S10 Capital Efficiency". There is currently NO open way in.' },

  // ── Funded by proposal, no application form ───────────────────────────────
  { n: 9, name: 'Scroll Community Grants', chain: 'Scroll', amount: '~$50K', equity: '0%',
    status: 'PROPOSAL', verified: '2026-07-31', url: 'https://forum.scroll.io',
    evidence: 'Delegated Council Program + Operations Committee; retroactive DCP pilots',
    note: 'No application form exists — apply by governance proposal. The live Tally form on scroll.io is a BD INTAKE form, not grants.' },

  // ── Alive but nothing public to apply to ──────────────────────────────────
  { n: 5, name: 'Base Batches (was: Base Builder Grants)', chain: 'Base', amount: '$10K grant + $50K investment', equity: '0% / equity on the investment',
    status: 'OPEN', verified: '2026-07-31', url: 'https://www.basebatches.xyz',
    evidence: '"The top 15 teams will receive a $10k grant, acceptance to an 8 week virtual program… A minimum of 3 teams will receive a $50k investment from the Base Ecosystem Fund"',
    note: 'STARTUP TRACK FITS US: "pre-product, pre-launch, or pre-seed and have raised less than ~$250k". The retroactive grants.base.eth nomination route still exists separately, but Batches is a real open application.' },
  { n: 50, name: 'Animoca — Minds Investment Programme', chain: 'Any', amount: 'up to $10M fund', equity: 'equity',
    status: 'OPEN', verified: '2026-07-31', url: 'https://build.hellominds.ai/en/program',
    evidence: '"APPLICATIONS OPEN — Ready to apply" (Animoca Brands, 2026)',
    note: 'animocabrands.com itself has no application path — the money moves through Minds. The Build East demo-day cohort closed 26 Jun 2026, but the programme page is still taking applications.' },
  { n: 52, name: 'a16z crypto CSX', chain: 'Any', amount: '~$500K', equity: 'equity',
    status: 'NO-FORM', verified: '2026-07-31', url: 'https://a16zcrypto.com/accelerator/',
    evidence: 'page live (/csx/ redirects here); states no cohort or deadline. ~3% acceptance rate', note: 'Accelerator — dilutive.' },
  { n: 14, name: 'Ronin Forge', chain: 'Ronin', amount: '~$300K', equity: '0%',
    status: 'NO-FORM', verified: '2026-07-31', url: 'https://roninchain.com',
    evidence: 'roninchain.com/grants returns Ronin\'s own 404 page',
    note: 'Same deployment as #11. No public grants page.' },

  // ── Dead / no programme found ─────────────────────────────────────────────
  { n: 4, name: 'DoraHacks Grant DAOs', chain: 'Any', amount: '~$50K', equity: '0%',
    status: 'DEAD', verified: '2026-07-31', url: 'https://dorahacks.io',
    evidence: 'dorahacks.io/grant returns 404',
    note: 'DoraHacks is a hackathon platform; grants run per-ecosystem, not centrally.' },
  { n: 7, name: 'SKALE Indie Game Accelerator', chain: 'SKALE', amount: '~$100K', equity: '0%',
    status: 'DEAD', verified: '2026-07-31', url: 'https://skale.space',
    evidence: 'skale.space/developers AND /grants both 404; ZERO grant threads on forum.skale.network',
    note: 'A chain funding a programme leaves a public governance trail. There is none.' },
  { n: 11, name: 'Ronin Ecosystem Grants', chain: 'Ronin', amount: '~$300K', equity: '0%',
    status: 'DEAD', verified: '2026-07-31', url: 'https://roninchain.com',
    evidence: 'roninchain.com/grants returns Ronin\'s own "This page could not be found"',
    note: 'Games-only chain, strong fit — but no live programme page.' },
  { n: 26, name: 'TON Grants & Bounties', chain: 'TON', amount: '~$50K', equity: '0%',
    status: 'DEAD', verified: '2026-07-30', url: 'https://github.com/ton-society/grants-and-bounties',
    evidence: 'GitHub repo archived:true since 2026-05-20',
    note: 'The Mini App build is still the highest-leverage distribution surface — just do not schedule it FOR the grant.' },
  { n: 30, name: 'Oasys Gaming Grants', chain: 'Oasys', amount: '~$200K', equity: '0%',
    status: 'DEAD', verified: '2026-07-31', url: 'https://www.oasys.games',
    evidence: 'oasys.games/grants returns its own 404 page', note: 'JP-market gaming L1.' },
  { n: 32, name: 'Celestia Foundation', chain: 'Celestia', amount: '~$100K', equity: '0%',
    status: 'DEAD', verified: '2026-07-31', url: 'https://forum.celestia.org',
    evidence: 'only an Ecosystem Delegation Program (2025); no grants threads',
    note: 'Also a DA layer, not a wallet chain — see config.js NOTE.' },
  { n: 36, name: 'NEAR — House of Stake (replaces Foundation grants)', chain: 'NEAR', amount: '~$200K', equity: '0%',
    status: 'PROPOSAL', verified: '2026-07-31', url: 'https://houseofstake.org',
    evidence: 'live governance: 9 proposals, 281 voters; remit covers "Ecosystem funding rules" and "Public goods funding, ecosystem support programs"',
    note: 'The Foundation grants form is gone; funding now runs through House of Stake governance. No form — you write a proposal. The AI-agent / chain-abstraction hook fits.' },
  { n: 37, name: 'Algorand xGov (replaces Foundation Grants)', chain: 'Algorand', amount: '~$150K', equity: '0%',
    status: 'OPEN', verified: '2026-07-31', url: 'https://xgov.algorand.co',
    evidence: 'live funded proposals: "88,888 Tooling Retroactive — [Approved]" (1 month ago), "[Funded] Valar improvements to xGov Beta"',
    note: 'The classic grants page IS dead (algorand.foundation/grants → algorand.co/grants → 404). Funding moved to xGov, which is community-voted and largely RETROACTIVE — ship first, then propose.' },
  { n: 40, name: 'Injective Ecosystem / AI fund', chain: 'Injective', amount: '~$150K', equity: '0%',
    status: 'DEAD', verified: '2026-07-31', url: 'https://gov.injective.network',
    evidence: 'ZERO grant threads on gov.injective.network; the DoraHacks Injective Grant DAO (dorahacks.io/injective) now 404s too',
    note: 'Two independent routes both gone.' },
  { n: 42, name: 'TON Society grants', chain: 'TON', amount: '~$100K', equity: '0%',
    status: 'DEAD', verified: '2026-07-30', url: 'https://github.com/ton-society/grants-and-bounties',
    evidence: 'same archived repo as #26; society.ton.org returns Cloudflare 522 and ton.org mentions no grants',
    note: 'Both TON grant tracks are closed and no successor is visible.' },
  { n: 46, name: 'Avalanche Research Grants', chain: 'Avalanche', amount: '~$50K', equity: '0%',
    status: 'OPEN', verified: '2026-07-30', url: 'https://build.avax.network/grants',
    evidence: '"Apply Now"', note: 'Research track only — not for the game itself.' },

  // ── Deliberately not pursued ──────────────────────────────────────────────
  { n: 39, name: 'Kadena Eco Grants', chain: 'Kadena', amount: '~$100K', equity: '0%',
    status: 'BLOCKED', verified: '2026-07-30', url: 'https://kadena.io',
    evidence: 'organisation ceased operations Oct 2025; Chainweb EVM never reached mainnet',
    note: 'Not configured. See config.js NOTE.' },
  { n: 43, name: 'Aztec Grants (privacy)', chain: 'Aztec', amount: '~$50K', equity: '0%',
    status: 'BLOCKED', verified: '2026-07-30', url: 'https://aztec.network',
    evidence: 'unaudited stack, no standard NFT contract, and NO arbitrary-message signing',
    note: 'Without message signing our wallet login cannot work at all. Not shipped.' },

  // ── Discovered 2026-07-31 by scraping five grant aggregators and diffing
  //    against the original 52. The July dossier was one source; it was not the
  //    whole universe. Four of these are EVM chains, which for us is a CONFIG
  //    ENTRY, not an integration — adapters/evm.js already covers any EVM chain.
  { n: 53, name: 'Ethereum Foundation ESP', chain: 'Any / EVM', amount: '~$100K', equity: '0%',
    status: 'OPEN', verified: '2026-07-31', url: 'https://esp.ethereum.foundation/applicants',
    evidence: '"Submit your application"',
    note: 'The most credible name on the list. Wants public-goods framing and open source — the same angle as Gitcoin #2.' },
  { n: 54, name: 'Filecoin Foundation', chain: 'Any', amount: '~$100K', equity: '0%',
    status: 'OPEN', verified: '2026-07-31', url: 'https://fil.org/grants',
    evidence: '"Apply Now"',
    note: 'Real fit: tile metadata and map assets are exactly what decentralised storage is for. Would need an IPFS/Filecoin pin for tile art.' },
  { n: 55, name: 'Mantle Grants', chain: 'Mantle (EVM)', amount: '~$100K', equity: '0%',
    status: 'ROLLING', verified: '2026-07-31', url: 'https://www.mantle.xyz/grants',
    evidence: '"rolling basis"',
    note: 'CHAIN NOW CONFIGURED (2026-07-31): id 5000, RPC verified, build target added. Ready to apply.' },
  { n: 56, name: 'Taiko Grants', chain: 'Taiko (EVM)', amount: '~$50K', equity: '0%',
    status: 'OPEN', verified: '2026-07-31', url: 'https://taiko.xyz/ecosystem',
    evidence: '"Submit a project"', note: 'CHAIN NOW CONFIGURED: id 167000, based rollup. Ready to apply.' },
  { n: 57, name: 'Rootstock Grants', chain: 'Rootstock (EVM)', amount: '~$50K', equity: '0%',
    status: 'OPEN', verified: '2026-07-31', url: 'https://rootstock.io/grants',
    evidence: '"apply for"',
    note: 'CHAIN NOW CONFIGURED: id 30, merge-mined by Bitcoin miners, gas in RBTC. The only build whose pitch is Bitcoin rather than Ethereum.' },
  { n: 58, name: 'Flare Grants', chain: 'Flare (EVM)', amount: '~$50K', equity: '0%',
    status: 'OPEN', verified: '2026-07-31', url: 'https://flare.network/grants',
    evidence: '"Apply for"', note: 'CHAIN NOW CONFIGURED: id 14. Brand red #e62058 was unreadable either way (4.30 on black, 4.46 on white) so the accent is #d81b52.' },
  { n: 59, name: 'The Graph Foundation', chain: 'Any / EVM', amount: '~$60K', equity: '0%',
    status: 'OPEN', verified: '2026-07-31', url: 'https://thegraph.com/grants',
    evidence: '"Apply for"',
    note: 'Would want a subgraph indexing tile ownership — which we should build anyway for the empire pages.' },
  { n: 60, name: 'Flow Ecosystem Support', chain: 'Flow', amount: '~$100K', equity: '0%',
    status: 'OPEN', verified: '2026-07-31', url: 'https://developers.flow.com/ecosystem/grants',
    evidence: '"grant application"',
    note: 'CHAIN NOW CONFIGURED (2026-07-31): 14th adapter family, Cadence contract written. NFT-native — the chain NBA Top Shot runs on, so a land NFT is what it was designed for. Ready to apply.' },
];

export const STATUS_META = {
  'OPEN':     { label: 'Open',            cls: 'ok',    rank: 0 },
  'ROLLING':  { label: 'Rolling',         cls: 'ok',    rank: 1 },
  'FLUX':     { label: 'Restructuring',   cls: 'warn',  rank: 2 },
  'PROPOSAL': { label: 'By proposal',     cls: 'warn',  rank: 3 },
  'NO-FORM':  { label: 'No public form',  cls: 'muted', rank: 4 },
  'DEAD':     { label: 'Closed / gone',   cls: 'bad',   rank: 5 },
  'BLOCKED':  { label: 'Not pursued',     cls: 'muted', rank: 6 },
};

export const tally = () =>
  PROGRAMS.reduce((a, p) => ((a[p.status] = (a[p.status] || 0) + 1), a), {});
