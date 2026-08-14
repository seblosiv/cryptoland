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
    status: 'OPEN', verified: '2026-08-12', url: 'https://giveth.io',
    evidence: '"Applications open"',
    note: 'giveth.typeform.com/feedback is a User Experience Feedback Form, not an application. The real QF round URL is still unknown.' },
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
    status: 'OPEN', verified: '2026-08-12', url: 'https://multiversx.com/growthgames',
    evidence: '"apply for a grant"', note: 'The typeform previously recorded as the application is "Developer Office Hours Request Form" (technical support booking), NOT Growth Games. The real application URL is unknown — SearXNG found no candidate. Find it before drafting anything.' },
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
  // 🔴 Both Polygon entries were OPEN on the strength of "APPLY NOW" on the
  // marketing page. The marketing page is not the programme. Rendering the
  // actual grant portal (polygon.questbook.xyz) on 2026-08-14 shows
  // "Program Closed" three times, and @0xPolygon posted that Season 2
  // recipients have already been SELECTED. No Season 3 exists in any source.
  // This is §21's lesson again: read the portal, not the landing page.
  { n: 25, name: 'Polygon Community Grants', chain: 'Polygon', amount: '~$100K', equity: '0%',
    status: 'DEAD', verified: '2026-08-14', url: 'https://polygon.questbook.xyz/',
    evidence: '"Program Closed" on the Questbook portal; S2 recipients already selected',
    note: 'polygon.technology/village still says APPLY NOW — stale marketing surface. Watch for a Season 3 announcement rather than applying.' },
  { n: 27, name: 'Polygon Community Grants S2/S3', chain: 'Polygon', amount: '~$50K', equity: '0%',
    status: 'DEAD', verified: '2026-08-14', url: 'https://polygon.questbook.xyz/',
    evidence: 'same closed portal as #25; no Season 3 announced anywhere',
    note: 'Duplicate surface of #25. Both dead until a new season opens.' },
  { n: 28, name: 'Prezenti — Celo Community Grants', chain: 'Celo', amount: '~$50K', equity: '0%',
    status: 'OPEN', verified: '2026-07-31', url: 'https://www.prezenti.xyz',
    evidence: 'Season 3 funded (forum.celo.org, 23 Jul 2026)',
    note: 'Same programme as #15 — they are one entity, not two.' },
  { n: 29, name: 'Starknet Growth Grants', chain: 'Starknet', amount: '~$1M', equity: '0%',
    status: 'OPEN', verified: '2026-07-30', url: 'https://www.starknet.io/grants/',
    evidence: '"Apply now Ecosystem Integration Grants"', note: 'Metrics-gated.' },
  { n: 31, name: 'Arbitrum Foundation Grants', chain: 'Arbitrum', amount: '~$150K', equity: '0%',
    status: 'FLUX', verified: '2026-08-12', url: 'https://arbitrum.foundation/grants',
    evidence: '"This form is now closed. The form cannot receive new submissions at this moment."',
    note: 'Tally application form CLOSED (verified by screenshot 2026-08-12). Newest grant thread on forum.arbitrum.foundation is 2024-11-04, so likely dormant rather than briefly shut. Arbitrum Gaming Ventures (#47) IS live — use that route.' },
  { n: 33, name: "SafePal Builder's Grant", chain: 'Solana', amount: '~$100K', equity: '0%',
    status: 'OPEN', verified: '2026-07-30', url: 'https://www.safepal.com',
    evidence: 'probe: OPEN', deadline: '2026',
    note: 'Judged on MAU/community — cite /metrics/grant.' },
  { n: 34, name: 'Solana Foundation Grants', chain: 'Solana', amount: '~$250K', equity: '0%',
    status: 'OPEN', verified: '2026-08-12', url: 'https://solana.org/grants-funding',
    evidence: '"Provide a brief project overview… public good"',
    note: 'The Airtable reached by crawling is the Solana Foundation Active RFPs table, not an application form. Its only visible row reads: "If this the only RFP that is visible, it means that there are no other active RFPs at this time. DO NOT APPLY FOR THIS." The general route at solana.org/grants-funding was NOT retested — treat the RFP track as empty, not the programme as dead.' },
  { n: 35, name: 'Sui Foundation Grants', chain: 'Sui', amount: '~$200K', equity: '0%',
    status: 'OPEN', verified: '2026-07-30', url: 'https://sui.io/developers',
    evidence: '"Apply now"', note: 'Match an open RFP.' },
  { n: 38, name: 'HBAR Foundation', chain: 'Hedera', amount: '~$250K', equity: '0%',
    status: 'OPEN', verified: '2026-07-30', url: 'https://hbarfoundation.org',
    evidence: '"Submit a proposal"', note: 'Enterprise-formal process.' },
  { n: 41, name: 'Solana Foundation (rolling)', chain: 'Solana', amount: '~$100K', equity: '0%',
    status: 'ROLLING', verified: '2026-08-14', url: 'https://solana.org/grants-funding',
    evidence: '"rolling basis"',
    note: 'Same Airtable RFP table as #34 — no active RFPs as of 2026-08-12. ⚠️ The 24-input Google Form linked from solana.org (docs.google.com/forms/d/e/1FAIpQLScy2RwYkNF2Leklwn…) is a HIRING form, not a grant application: its required fields are "What positions are you hiring for?", "Full Time or Contract roles?", "Ideal locations for hiring talent". §21 again — a form-shaped URL on a grants page is not the grant form. Do not draft against it.' },
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
    status: 'FLUX', verified: '2026-08-12', url: 'https://www.basebatches.xyz',
    evidence: '"Batches 003: Student Track RUNS FROM Feb 17 - Apr 27, 2026 … Applications closed"',
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
  // Opening the actual Airtable (2026-08-14) changed this from OPEN to
  // invitation-only: a REQUIRED field asks "Which Taiko Team Member(s) Did You
  // Receive Your Invitation to Apply?". "Submit a project" on the ecosystem
  // page is not an open call — you cannot answer that question cold.
  { n: 56, name: 'Taiko Grants', chain: 'Taiko (EVM)', amount: '~$50K', equity: '0%',
    status: 'NO-FORM', verified: '2026-08-14',
    url: 'https://airtable.com/appiHMc0glvIWmuan/shrvmPOFrTleLFQJd',
    evidence: 'Airtable required field: "Which Taiko Team Member(s) Did You Receive Your Invitation to Apply? *"',
    note: 'INVITE-ONLY. 16 inputs; Project Name*, Applicant Email*, Applicant Telegram*, Project Website* — plus the invitation field, which is the blocker. Chain IS configured (id 167000, based rollup) so we are technically ready; the route in is a relationship, not a form. Approach a team member first, e.g. via the Taiko Discord, rather than drafting an application.' },
  { n: 57, name: 'Rootstock Grants', chain: 'Rootstock (EVM)', amount: '~$50K', equity: '0%',
    status: 'OPEN', verified: '2026-07-31', url: 'https://rootstock.io/grants',
    evidence: '"apply for"',
    note: 'CHAIN NOW CONFIGURED: id 30, merge-mined by Bitcoin miners, gas in RBTC. The only build whose pitch is Bitcoin rather than Ethereum.' },
  { n: 58, name: 'Flare Grants', chain: 'Flare (EVM)', amount: '~$50K', equity: '0%',
    status: 'OPEN', verified: '2026-07-31', url: 'https://flare.network/grants',
    evidence: '"Apply for"', note: 'CHAIN NOW CONFIGURED: id 14. Brand red #e62058 was unreadable either way (4.30 on black, 4.46 on white) so the accent is #d81b52.' },
  { n: 59, name: 'The Graph Foundation', chain: 'Any / EVM', amount: '~$60K', equity: '0%',
    status: 'DEAD', verified: '2026-08-12', url: 'https://thegraph.com/grants',
    evidence: '"The Graph Foundation is pausing applications to the Grants Program … we made the decision to pause the Grants Program to reassess our ecosystem strategic priorities."',
    note: 'PAUSED. Announced on forum.thegraph.com 2026-07-06, corroborated by the application Typeform returning "Hey :) This typeform is now closed." Do not submit. DEEP CRAWL 2026-08-14 confirms the grants Typeform (/applynow) still has ZERO inputs. But a SEPARATE Typeform is live: thegraph.typeform.com/to/rhYddDRu, titled "Inbound Partnership Form" with isFormClosed:false. That is NOT the grants programme — it is partnerships/integrations — so the DEAD status stands. It is, however, a real open channel to the Foundation if we ever want to approach them about being a subgraph consumer rather than a grantee.' },
  // Marked OPEN on the evidence '"grant application"' — but that string is in
  // the *instructions*, not an open round. Rendering the page on 2026-08-14:
  // "Round 1 has been closed on August 16, 2025. Please stay tuned for the next
  // round." No round since, almost a year on. A keyword match is not a status.
  // ── Added 2026-08-14 from an aggregator diff (CLAUDE.md §6: the list is not
  // fixed). Five candidates surfaced; three were already dead by their own
  // words, which is why each carries its verbatim evidence.
  { n: 61, name: 'IOTA DLT Foundation Grants', chain: 'IOTA', amount: 'Tier1 $10K / Tier2 $50K / Tier3 $50K+', equity: '0%',
    status: 'OPEN', verified: '2026-08-14', url: 'https://iotadlt.foundation/grants',
    evidence: 'Tiered rubric live: "Tier 1: up to $10,000 — KYC NOT required"',
    note: 'BEST EFFORT-TO-REWARD of the new five. IOTA EVM verified live: chainId 8822, RPC json-rpc.evm.iotaledger.net, access-control-allow-origin:* (browser-usable) — so this is the EVM-cheap path: CHAINS entry + env template + build target, ~2-4h, no adapter, existing bytecode deploys as-is. TWO CAVEATS: (1) iota.org/build/grants and iotalabs.io/grants both REDIRECT to homepage — only the separate Abu Dhabi DLT Foundation entity has a live page, and its published accounts stop at 2024; (2) categories are Open Source Dev / Research / Education / Events — NO games category, so pitch the adapter + Move contract as reusable open-source tooling, not as a game. Page describes an application form but links none: email contact@iotadlt.foundation to confirm the programme is live BEFORE building. IOTA is also steering toward a Move L1, so a committee may want Move (non-EVM-expensive, ~1-2 weeks, though Sui/Aptos Move work transfers — IOTA docs are adapted from Sui\'s).' },
  { n: 62, name: 'Circle Grants (Arc / USDC)', chain: 'Arc / multi', amount: 'undisclosed', equity: '0%',
    status: 'OPEN', verified: '2026-08-14', url: 'https://www.circle.com/grant',
    evidence: '"Grants for exceptional teams building on Arc and the Circle Developer Platform"; relaunched 2026-05-14',
    note: 'The only unambiguously open, well-funded one of the five — but a PAYMENTS PIVOT, not an integration. All six focus areas are fintech (agentic payments, stablecoin FX, treasury, lending); a land-NFT game is none of them. Amount is NOT published anywhere — do not quote a figure. Requires KYC/KYB ("applicable screenings") and evidence of usage/revenue. Portal is account-gated JS behind a Circle sign-in; bare URL not resolvable. Real cost 2-4 weeks and it touches the §4 security invariants (/np/finalize, IPN HMAC). Only angle: Guardian agents as "agentic economic activity" + USDC-native settlement replacing NOWPayments.' },
  { n: 63, name: 'Chainlink BUILD', chain: 'multi', amount: 'n/a', equity: 'TOKEN SUPPLY %',
    status: 'DEAD', verified: '2026-08-14', url: 'https://chain.link/blog/build-program-evolution',
    evidence: '"existing arrangements under the Build program are being concluded"; token-reward claims ended 2026-07-07. chain.link/community/grants returns HTTP 404.',
    note: 'Disqualifying even if alive: BUILD took a percentage of the project TOKEN SUPPLY, and CryptoLand has no token. Successor is "commercial agreements involving fees paid in LINK" — that is a vendor relationship where WE pay. VRF would genuinely suit raid outcomes, but it is a service to buy, per-chain, with no grant attached.' },
  { n: 64, name: 'Aleph Zero Ecosystem Funding', chain: 'Aleph Zero', amount: 'n/a', equity: 'venture',
    status: 'DEAD', verified: '2026-08-14', url: 'https://alephzero.org/blog/sunset-of-the-aleph-zero-evm/',
    evidence: '"The Foundation will be winding down"; official post "Sunset of the Aleph Zero EVM"; ecosystem-funding-program URL redirects to homepage',
    note: 'The CHAIN is going, not just the programme: Aleph Zero EVM RPC returns NXDOMAIN and the Substrate L1 RPC times out. Would also be non-EVM-expensive (ink! contract + new adapter family) — integrating a chain that is switching off. Privacy/ZK thesis is the opposite of a public geospatial land game anyway.' },
  { n: 60, name: 'Flow Ecosystem Support', chain: 'Flow', amount: '~$100K', equity: '0%',
    status: 'FLUX', verified: '2026-08-14',
    url: 'https://developers.flow.com/ecosystem/developer-support-hub/grants',
    evidence: '"Round 1 has been closed on August 16, 2025. Please stay tuned for the next round."',
    note: 'FLUX not DEAD: the programme explicitly promises another round, and GrantDAO still funds ~50k FLOW per round. Watch for Round 2 rather than applying. Chain is configured (14th adapter family, Cadence contract) so we can move the day it opens. bd@flowfoundation.org is the direct channel meanwhile.' },
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
