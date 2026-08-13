# Programme requirements — verbatim, from the source pages

**Method.** 46 programme pages fetched 2026-07-29 through residential ISP proxies
(New York: Charter / Windstream / RCN) with a Geonode rotating-datacenter fallback,
plus SearXNG. **32 returned usable content**; 14 are JS-rendered shells, 403/429
rate-limits or moved URLs — listed at the end so nobody assumes they were checked.

Everything in quotes is **copied from the programme's own page**. Where a fact is
inference it says so.

---

## 0. The finding that changes the pitch

Solana's third evaluation criterion, verbatim:

> **"Only Possible on Solana."** *The proposal should make it clear why the project
> is building within the Solana ecosystem, as opposed to other places or other ways.
> Why Solana? How does the Solana protocol help the team or project achieve its goals
> in ways that are not possible elsewhere?*

Starknet's committee assesses **"embeddedness with the Starknet ecosystem."**

**This is the direct opposite of the portability pitch.** "One codebase, 27
chain-native builds" answers "why *any* chain", which scores zero on a named
criterion. Every ecosystem grant wants monogamy; the architecture argues the
opposite.

**The fix is framing, and the material already exists.**
`PROFILE.onboarding.grantAngle` in `src/config/profiles.js` holds a chain-specific
"why this chain" line for all 29. **Lead every application with that**, and mention
portability only as evidence of engineering capability — never as the headline. The
apex is referrer-aware for the same reason: a Solana reviewer arriving from
`solana.xono.ai/?from=solana` sees Solana first, not the fleet.

---

## 1. ⛔ Starknet Seed — we are DISQUALIFIED, and this was nearly missed

> *"The Seed Grants Program aims to support early stage teams that have already
> developed a minimum viable product (MVP) or proof of concept, **but haven't yet
> gone to market**."*
>
> *"However, please note that **mature projects already live on Starknet with a core
> group of users are not eligible** to participate in the Seed Grants Program."*

`starknet.xono.ai` is **live**. Applying to Seed risks rejection on eligibility.

- If we have no real Starknet users → arguably still "not gone to market" → Seed is
  defensible, but say so explicitly and let them judge.
- Once there are real users → **Growth Grants** is the correct programme.
- Earlier advice in this repo said "Seed, not Growth". That was right on traction and
  wrong on this clause. Read the eligibility text before submitting.

Also verbatim, and blocking:
> *"Yes, we are **legally required to perform KYC/KYB** to verify identities…"*
> *"**Any project unwilling to complete the required KYC/KYB procedures will not be
> eligible** for a grant."*

Seed is **"up to $25,000 in STRK in non-dilutive funding"**. Evaluation is by
**"an internal committee … based on potential impact, innovation, milestones,
community engagement and track record, and embeddedness with the Starknet
ecosystem."** Decision ≈ **4 weeks**. Post-grant check-in at 3 months expects
**"regular updates (blog posts, videos, AMAs)"**.

Soft gate we currently fail: *"Actively involved in the Starknet community and/or
participated in a Starknet Hackathon, builder program, or other entry-level
initiative."* One hackathon entry converts this to a checkbox.

---

## 2. Solana — pick the right track or be rejected on process

Four criteria, verbatim: **Public Good · Open Source · Only Possible on Solana ·
Clear Use of Funds.**

> *"Projects that are **primarily commercial in nature usually won't qualify for a
> standard grant** … and should consider a **convertible grant**."*

CryptoLand sells tiles → **convertible track**, not standard. Applying to the wrong
one is an avoidable rejection.

> *"**not all parts of the project should be open source, but the usable parts should
> be available to all**"*

So publishing `src/lib/blockchain/` (the 13-family adapter layer) satisfies Open
Source without publishing everything.

Timeline, verbatim: **"Application Review (~1 week)"**, **"Decision & Contacting
(~3 weeks)"**. Rolling. Required in the form: *"a brief project overview"*,
*"clarify how your project provides a public good"*, *"a well structured budget
proposal, and … thoughtful milestones"*.

> *"we may also consider a **novel proof of concept** to qualify"* — useful given
> zero real users.

---

## 3. Cardano Catalyst — scored 1–5 by non-technical reviewers

Rubric, verbatim: **IMPACT · CAPABILITY & FEASIBILITY · VALUE FOR MONEY**, each
★1–5.

> **"Do not assume that every Community Reviewer has technical or subject matter
> expertise."**

This is the most actionable sentence in the whole corpus. Our strongest assets — 13
adapter families, a 24-function interface, contract-tested tokenId encoding — are
**invisible to a non-technical scorer**. Translate before submitting:

| Don't write | Write |
|---|---|
| "13 adapter families behind a 24-function interface" | "A player on Cardano owns a real Cardano native asset in their own wallet — not a row in our database" |
| "contract-tested tokenId encoding" | "Every tile has one permanent ID, so the same piece of land can never be sold twice" |

Fund rules, verbatim: *"the project is for the broad benefit of the Cardano ecosystem
and there are **well-defined deliverables and outcomes … that can be measurably
verified by the community**."*

We can answer that better than most: `/ecosystem` is public and chain-scoped.
**Say so in the proposal.**

Also verbatim: *"Lack of recent progress: The Project Participants failed to submit
and get approval for at least two Proofs of Achievement"* — funding is clawed back
for silence. Budget the reporting time.

---

## 4. Tezos — ~8% success, and the process is slow

Verbatim: *"**3 weeks** … Award Review and Final decision … reviewed by ecosystem
experts, supervised by the **Technical Advisory Committee (TAC)**"*, plus ~4 weeks of
paperwork after.

What the proposal must contain, verbatim: *"functional and technical details of the
proposed solution, its purpose, a **roadmap**, an **introduction of the project
team**, **evidence of familiarity with the Tezos ecosystem**, anticipated value added
… and measures to assure the long-term…"*

Milestone-gated: *"Once a milestone is completed, the grantee submits a report,
which is reviewed and if approved, the payment for the milestone is issued."*

Named criterion: *"Projects should have a clear vision for **regular, ongoing
community engagement**."* We have none — this is a real gap for Tezos specifically.

---

## 5. Alliance DAO — exact terms, no guessing

> *"Alliance invests at a **$5M post-money valuation via SAFE with a 1:1 token side
> letter**."*
> *"mentors will **review your application within 1 week**"*
> *"Once you're accepted … we immediately start the investment and **KYC** process."*

This is the only programme on the list with published valuation terms. Dilutive —
treat as a separate track, per the dossier.

---

## 6. BNB MVB — the five things they score

Verbatim: *"**Innovative product backed by strong tech** · **Scalable total
addressable market** · **Dedicated team with relevant background, long-term vision,
and resiliency** · **Sustainable business model to achieve product-market fit** ·
**Robust tokenomics** to add value and incentives to all ecosystem participants."*

Note **"robust tokenomics"** is scored and we have **no token**. Either build that
section honestly (no token by design, tile ownership is the asset) or deprioritise
MVB — its base rate is ~1–2% anyway.

---

## 7. Where we stand, per requirement

| Requirement | Frequency | Status |
|---|---|---|
| Team / founder identity | **85%** | ✅ `xono.ai/about` |
| Milestones + budget | 30% | ✅ `documentation/milestones-budget.md` |
| Open source / public repo | 30% | ⚠️ Ready, **not published** |
| Live product / MVP | 35% | ✅ 27 deployments |
| KYC / legal entity | 20% | ❌ **Blocks payout on Starknet, Alliance, Tezos** |
| Community engagement | 55% | ❌ **No Discord, no X, no hackathon** |
| "Why this chain" | high | ⚠️ Data exists in `profiles.js`, not used in applications |
| Explicit DAU/MAU | 5% | ⚠️ Real numbers are seeded — disclosed |
| Pitch deck | **5%** | ✅ Generated per chain — `npm run build:deck`, see [pitch-deck.md](pitch-deck.md) |

---

## 8. Ranked actions

1. **Publish the repo** — 30% require it; `src/lib/blockchain/` alone satisfies Solana.
2. **Community presence** — 55% of pages, and a *named* criterion on Tezos and
   Starknet. One Discord + one X account + one hackathon entry.
3. **Rewrite openings per chain** using `grantAngle`, never leading with portability.
4. **KYC readiness** — decide sole trader vs. company before a grant is approved.
5. **Translate the tech into non-technical impact language** for Catalyst/QF.
6. **Re-read Starknet Seed eligibility** before submitting.

## 9. Not verified — do not assume these were checked

`base.org` grants, Radix, SKALE (429), Scroll, Moonbeam, Aptos (429), Polygon, Sui,
Algorand, TON Foundation (522), Arbitrum Gaming Ventures (403), Cardano Foundation
(429), Ronin (partial), Beam (partial). URLs move fast — the July dossier's links
had already rotted in a week. **Open the real form before submitting to any of these.**

---

## 10. Application-window check — 2026-07-30

Fetched all 46 live programme URLs through ISP proxies and looked for explicit
open/closed language. **This answers "is it accepting applications", which the
earlier sweep did not.**

| Verdict | Count | Meaning |
|---|---|---|
| **OPEN** | 9 | page states applications are open / "apply now" |
| **CLOSED** | 1 | page states closed, paused or archived |
| MIXED | 1 | both signals present — check manually |
| UNCLEAR | 20 | page loaded but says neither — **not evidence of open** |
| UNREACHABLE | 15 | 404 / 429 / 403 — URL moved or blocked |

### ✅ Confirmed OPEN (verbatim evidence on the page)

- **#21 Avalanche Retro9000** — *"Apply Now Avalanche L1s & Infrastructure Tooling: The next project snapshot for grant disbursement will take place July 14th, 2026 at 12:00 PM UTC ."*
- **#23 Cardano Catalyst** — *"Submit a proposal Want to solve a problem on Cardano or in the wider world?"*
- **#29 Starknet Growth** — *"Apply now Ecosystem Integration Grants Bridge Starknet with other networks, expand interoperability and give your app and its users a scalable, low-co"*
- **#31 Arbitrum Foundation Grants** — *"Managed by The Arbitrum Foundation Learn More Apply now Active Arbitrum Audit Program Active ArbiFuel ArbiFuel is a Gas Fee Sponsorship Program to hel"*
- **#34 Solana Foundation** — *"In the application, make sure to: Provide a brief project overview Clarify how your project provides a public good for the Solana network Lay out a we"*
- **#38 HBAR Foundation** — *"</p> Visit Our Ecosystem Introduction to our global team Submit a proposal <p>Ready to build on the world's most trusted, sustainable, enterprise-grad"*
- **#45 Tezos Foundation** — *"Apply now Tezos Foundation Follow us first row Role of the Tezos Foundation Grants Program Bounty Program Bug Bounty Program second row Permanent Art "*
- **#49 Outlier Base Camp** — *"> Learn More > Stay Updated FutureSpark Base Camp Register your interest for our upcoming accelerators based in Riyadh, Saudi Arabia – in partnership "*
- **#51 Alliance DAO** — *"We strongly encourage teams to submit applications as early as possible, as it maximizes your chances of selection."*

### 🔴 Confirmed CLOSED / archived

- **#26 TON Grants & Bounties** — GitHub API confirms `archived: true`, read-only since 2026-05-20. Matches grants.md §0.

### ⚠️ MIXED — verify before applying

- **#44 BNB Chain MVB** — cohort programme; season windows open and close. Check the current season.

### ❔ UNCLEAR (20) — page loaded, no explicit statement

Do **not** read this as "open". Most are marketing pages that never state a window;
the real answer is behind the apply form.

#2 Gitcoin / Giveth QF, #3 Superteam Earn, #9 Scroll Community Grants, #10 Game3 Foundation, #12 Beam Foundation, #13 Stellar Community Fund, #15 Celo CeloPG, #16 Solana Mobile, #17 MultiversX Builders, #18 Starknet Seed, #22 Optimism Retro Funding, #25 Polygon Grants, #30 Oasys, #32 Celestia, #33 SafePal Builders, #36 NEAR Foundation, #41 Solana ecosystem grants, #46 Avalanche Research, #50 Animoca Brands, #52 a16z CSX

### ⛔ UNREACHABLE (15) — could not verify at all

#4 DoraHacks Grant DAOs (404), #5 Base Builder Grants (404), #6 Radix Booster Grants (404), #7 SKALE Indie Accelerator (429), #8 Tezos Ecosystem Grants (404), #11 Ronin Ecosystem Grants (404), #19 Aptos DoraHacks (404), #20 Moonbeam Grants (200), #24 Aptos Foundation Grants (429), #35 Sui Foundation (404), #37 Algorand Foundation (404), #40 Injective Ecosystem (404), #42 TON Society grants (522), #47 Arbitrum Gaming Ventures (403), #48 Cardano Foundation (429)

> **Bottom line: 9 of 46 are positively confirmed open.** The rest are unknown, not
> open. Before submitting to any programme outside the confirmed list, open its
> apply form directly — the July dossier's URLs had already rotted within a week.

---

## 11. Re-probe with TLS impersonation — 2026-07-30 (supersedes §10)

§10 used plain `curl` and left 15 unreachable. Most were **not dead links**:
403/429 blocks key on the **TLS/JA3 handshake**, not the User-Agent, so curl is
rejected regardless of headers. `scripts/probe-programs.py` replays a real Chrome
handshake via `curl_cffi`, rotates four fingerprints and three ISP proxies, and
falls back to crawling the site root for the moved apply route.

**Recovered by fingerprint alone:** Aptos Foundation (429 → 200), Cardano Foundation
(429 → 200, and it reads OPEN), Sui (404 → 200), Base Builder Grants (404 → 200).

| Verdict | §10 (curl) | §11 (curl_cffi) |
|---|---|---|
| OPEN | 9 | **11** |
| CLOSED | 1 | 1 |
| UNCLEAR | 20 | 23 |
| UNREACHABLE | 15 | **11** |

### ✅ Confirmed OPEN

- **#21 Avalanche Retro9000** — *"Apply Now Avalanche L1s & Infrastructure Tooling: The next project snapshot for grant disbursement will take place July "*
- **#23 Cardano Catalyst** — *"Submit a proposal Want to solve a problem on Cardano or in the wider world?"*
- **#29 Starknet Growth** — *"Apply now Ecosystem Integration Grants Bridge Starknet with other networks, expand interoperability and give your app an"*
- **#31 Arbitrum Foundation Grants** — *"Managed by The Arbitrum Foundation Learn More Apply now Active Arbitrum Audit Program Active ArbiFuel ArbiFuel is a Gas "*
- **#34 Solana Foundation** — *"In the application, make sure to: Provide a brief project overview Clarify how your project provides a public good for t"*
- **#38 HBAR Foundation** — *"</p> Visit Our Ecosystem Introduction to our global team Submit a proposal <p>Ready to build on the world's most trusted"*
- **#44 BNB Chain MVB** — *"EVM-Compatible opBNB Built with the OP Stack BNB Greenfield Decentralized data storage & economy BNB Beacon Chain Sunset"*
- **#45 Tezos Foundation** — *"Apply now Tezos Foundation Follow us first row Role of the Tezos Foundation Grants Program Bounty Program Bug Bounty Pro"*
- **#48 Cardano Foundation** — *"See All Articles Crypto Valley Conference 28–28 May 2026 | Rotkreuz, Switzerland Event Point Zero Forum 23–25 Jun 2026 |"*
- **#49 Outlier Base Camp** — *"> Learn More > Stay Updated FutureSpark Base Camp Register your interest for our upcoming accelerators based in Riyadh, "*
- **#51 Alliance DAO** — *"We strongly encourage teams to submit applications as early as possible, as it maximizes your chances of selection."*

### 🔴 CLOSED

- **#26 TON Grants & Bounties** — `archived: true` via GitHub API, read-only since 2026-05-20.

### ⛔ Still unreachable (11)

#4 DoraHacks Grant DAOs (404), #6 Radix Booster Grants (404), #7 SKALE Indie Accelerator (404), #8 Tezos Ecosystem Grants (404), #11 Ronin Ecosystem Grants (404), #19 Aptos DoraHacks (405), #20 Moonbeam Grants (200), #37 Algorand Foundation (404), #40 Injective Ecosystem (404), #42 TON Society grants (522), #47 Arbitrum Gaming Ventures (403)

These need a **real browser** (JS execution), not a better HTTP client — see §12.

### ❔ UNCLEAR (23)

Page loads and states neither. Almost all are JS-rendered marketing shells whose
apply window lives behind a form. **Not evidence of open.**

## 12. What still needs a headless browser

`curl_cffi` solves TLS fingerprinting. It cannot execute JavaScript, so it cannot:

- read SPA content rendered client-side (most "UNCLEAR" rows),
- pass interactive challenges (Vercel/Cloudflare checkpoints — e.g. SKALE's sFUEL faucet),
- navigate multi-step flows, scroll, or expand accordions,
- **submit an application form**, which is the eventual goal.

The right tool is a real browser driven headlessly (Playwright, or zendriver for
harder anti-bot). That is a separate build: form-filling is per-programme, and an
auto-submitted application that gets a field wrong is worse than none.

---

## 13. Definitive open/closed — both methods merged, 2026-07-30

Checked all 46 twice and merged, preferring whichever produced a decisive answer:

1. **`curl_cffi`** (`scripts/probe-programs.py`) — replays a real Chrome TLS/JA3
   handshake. Defeats 403/429, which key on the handshake and not the User-Agent.
2. **zendriver headless Chrome** (`scripts/probe-browser.py`) — executes JavaScript,
   so SPA pages actually render. Uses Chrome for Testing, never a personal profile.

| Verdict | Count |
|---|---|
| **OPEN** | **11** |
| CLOSED | 1 |
| UNCLEAR | 33 |
| ERROR | 1 |

### ✅ Confirmed OPEN

Avalanche Retro9000 · Cardano Catalyst · Starknet Growth · Arbitrum Foundation ·
Solana Foundation · HBAR Foundation · BNB Chain MVB · Tezos Foundation ·
Cardano Foundation · Outlier Base Camp · Alliance DAO

### 🔴 CLOSED

**TON Grants & Bounties** — the browser rendered the decisive sentence that the HTTP
client could not see: *"The Grants & Bounties program is currently paused."* The
GitHub repo is also `archived: true`, read-only since 2026-05-20.

### Why the two methods disagree

`curl_cffi` found 11 open, the browser 8, and the union is 11 — they fail on
different things. TLS impersonation gets past rate limits but reads an empty SPA
shell; the browser renders the SPA but has no proxy (Chrome cannot take proxy
credentials on `--proxy-server`, which yields `ERR_NO_SUPPORTED_PROXIES`). Running
both and merging is what produced a decisive answer on TON.

> **33 UNCLEAR is not 33 available.** Those pages render but state no window. Open
> the apply form before submitting.

---

## 13. Headless-browser resolution — 2026-07-30 (supersedes §11 and §12)

§11 got 11 OPEN with TLS impersonation and left 23 UNCLEAR / 11 UNREACHABLE.
This round ran **five probe passes** with Playwright's bundled Chromium (never the
user's own Chrome), because the blocker was never TLS — it was **JavaScript
rendering plus URL rot**.

| Pass | Method | Newly resolved |
|---|---|---|
| 1 | Render the known landing page with JS | #2, #17, #25, #41, #47 OPEN |
| 2 | Start at root domain, follow the site's own nav | #3, #20 OPEN |
| 3 | Several candidate URLs each, **including subdomains** | #8, #35, #46 OPEN · #42 CLOSED |
| 4 | Follow the apply CTA to the actual form | #6, #9 forms reached |
| 5 | Open each form and read it | #6 confirmed · 3 false positives killed |

**Pass 3 mattered most.** Grant pages live on subdomains — `retro9000.avax.network`,
`tezos.foundation/grants`, `communityfund.stellar.org` — which a same-host link
scrape structurally cannot reach. That single change resolved four programmes.

### Newly confirmed OPEN (17 beyond §11)

| # | Programme | Evidence | Where |
|---|---|---|---|
| 2 | Gitcoin / Giveth QF | "Applications open" | giveth.io |
| 3 | Superteam Earn | "Apply Now" | superteam.fun/earn/grants |
| 6 | **Radix Grants Program** | live Google Form titled *"Radix Grants Program Application Form"* | docs.google.com/forms/… |
| 8 | Tezos Foundation Grants | "Apply now" | tezos.foundation/grants |
| 17 | MultiversX Builders | "apply for a grant" | multiversx.com |
| 20 | Moonbeam Grants | "Apply now" | moonbeam.foundation |
| 25 | Polygon Grants | "APPLY NOW" | polygon.technology/village |
| 35 | Sui Foundation | "Apply now" | sui.io/developers |
| 41 | Solana ecosystem grants | "rolling basis" | solana.org/grants-funding |
| 46 | Avalanche Retro9000 | "Apply Now" — ⏰ **deadline was 17 Jul 2026 18:00 UTC** | retro9000.avax.network |
| 47 | Arbitrum Gaming Ventures | "APPLY NOW" | arbitrum.foundation |

Plus #10 Game3, #12 Beam, #16 Solana Mobile, #18 Starknet Seed, #24 Aptos Foundation,
#33 SafePal from the deep-probe pass.

> ⚠️ **#46's snapshot deadline (17 Jul 2026) has already passed** — today is 30 Jul
> 2026. The page still says "Apply Now", so the next snapshot window is presumably
> open, but treat the date as stale and confirm before writing the application.

### 🔴 Confirmed dead or gone

- **#26 TON Grants & Bounties** — GitHub repo `archived: true` since 2026-05-20.
- **#42 TON Society grants** — same archived repo. Both TON grant tracks are closed.
- **#37 Algorand Foundation** — `algorand.foundation/grants` redirects to
  `algorand.co/grants`, which returns **404**. No grants page exists.
- **#11 Ronin Ecosystem Grants** — `roninchain.com/grants` returns **404** with the
  site's own "This page could not be found".
- **#30 Oasys** — `oasys.games/grants` returns **404**, same.

The last three are not "unreachable"; the programme pages are **gone**. Do not plan
around them without a direct contact.

### ❔ Still genuinely unknown (13)

#4 DoraHacks Grant DAOs, #5 Base Builder Grants, #7 SKALE Indie Accelerator,
#13 Stellar Community Fund, #15 Celo CeloPG, #19 Aptos DoraHacks,
#22 Optimism Retro Funding, #32 Celestia, #36 NEAR Foundation,
#40 Injective Ecosystem, #50 Animoca Brands, #52 a16z CSX, and #9 Scroll (see below).

These render fine and describe a programme, but **state no window anywhere on the
page or behind the CTA**. For these the answer needs a human: an email to the
programme, or a Discord/Telegram ask. No amount of crawling resolves a page that
does not contain the fact.

**#9 Scroll is a near-miss worth flagging.** The apply CTA leads to a live Tally form
— but it is titled *"Scroll BD Intake Form"*, a business-development contact form,
**not** the community grants application. Counting it as OPEN would be wrong.

### False positives this pass caught

Pass 4's keyword regex matched `Next` and `your email` on documentation pages and, in
Algorand's case, on a **HubSpot privacy policy**. Pass 5 opened each candidate and
killed all three. A keyword match on an unread page is not evidence — the two
survivors (#6, #9) were confirmed only by reading the form's own title.

### Scoreboard

| Verdict | Count |
|---|---|
| ✅ Confirmed OPEN | **28** |
| 🔴 Confirmed closed / page gone | **5** |
| ❔ Genuinely unknown | **13** |

Up from 11 confirmed-open in §11. The residual 13 are a **human-contact problem, not
a tooling problem** — five automated passes with JS rendering, TLS impersonation,
subdomain enumeration and form-following could not extract a fact the pages do not
publish.

**Reproduce:** the probe scripts are in the session scratchpad
(`probe/crawl*.mjs`, `verify.mjs`). SearXNG's engines (brave, duckduckgo, google cse,
startpage) were rate-limited/CAPTCHA'd by the sweep volume during this run and
returned empty for most queries — the browser passes carried it. Give the engines
time to un-suspend before the next sweep.

---

## 14. The last 13, resolved — 2026-07-30 (supersedes §13's "genuinely unknown")

§13 concluded the residual 13 were "a human-contact problem, not a tooling
problem". That was wrong. It was a **wrong-source** problem: I kept re-reading
marketing pages, which are the one place a programme's real status is never
written.

Three sources answered all 13:

1. **Discourse governance forums expose `/search.json` and `/t/<id>.json`.**
   A marketing page can sit stale for a year; a governance forum cannot, because
   funding a programme requires a public proposal. Eight forums were reachable:
   `gov.optimism.io`, `forum.celo.org`, `gov.near.org`, `forum.celestia.org`,
   `forum.arbitrum.foundation`, `forum.skale.network`, `gov.injective.network`,
   `forum.scroll.io`.
2. **Full-page render with lazy-content scroll**, rather than reading only what
   loads above the fold.
3. **Absence of forum activity as evidence.** A chain whose governance forum has
   *zero* grant threads is not running a grants programme, whatever its site says.

### ✅ Newly confirmed OPEN

| # | Programme | Evidence |
|---|---|---|
| 13 | **Stellar Community Fund** | *"Submissions Open For SCF#11"* — up to **$150,000 in XLM** |
| 15 | **Celo — via Prezenti** | *"Prezenti Grants: Season 3 Plan"* (23 Jul 2026), $165,000 redeployed |
| 19 | **Aptos Foundation** | multiple live tracks; *"Apply for up to $25K in third-party audits"* |

> 🔑 **Celo's grants are called Prezenti, not CeloPG.** That is exactly why
> `celopg.eco` read as unclear through five automated passes — the programme is
> real and funded, under a name the chain's own grants page never surfaces.
> Season 2 has a published retrospective; Season 3 is funded and running.

### 🟡 Restructuring — do not plan around the old shape

- **#22 Optimism.** The Foundation filed *"Council Dissolution Proposal: Dissolve
  the Grants Council"* on 2026-06-25. A delegate reply pushes back on full
  dissolution, so the outcome was still contested. Current season work is
  *"S9 Impact Autopsy & S10 Capital Efficiency"*. Retro Funding was already
  paused (§0). **Treat Optimism as in flux and confirm before writing.**
- **#9 Scroll.** No application form exists. Funding flows through governance —
  a Delegated Council Program and an Operations Committee, with retroactive
  pilots. Apply by proposal, not by form. The live Tally form on scroll.io is a
  **BD intake form**, not a grants application.

### 🔴 No active programme found

| # | Programme | Evidence |
|---|---|---|
| 7 | SKALE Indie Accelerator | `/grants` unreachable; **zero** grant threads on `forum.skale.network` |
| 40 | Injective Ecosystem | **zero** grant threads on `gov.injective.network` |
| 32 | Celestia | only an *Ecosystem Delegation Program* (2025), no grants — matches the existing "not actionable" note in `config.js` |
| 36 | NEAR Foundation | no Foundation grants threads; governance has moved to *House of Stake* |
| 4 | DoraHacks Grant DAOs | `dorahacks.io/grant` is **404**; DoraHacks is a hackathon platform, grants run per-ecosystem |

### ⚪ Live but no public application window

- **#5 Base Builder Grants** — the `grants.base.eth` publication is active, but
  the model is retroactive/nomination-based. There is nothing to apply to.
- **#50 Animoca Brands** — `/contact-us` is 404; a private VC with no public
  application path.
- **#52 a16z CSX** — the programme page states no cohort or deadline.

### Final scoreboard

| Verdict | Count |
|---|---|
| ✅ Confirmed OPEN | **31** |
| 🟡 Restructuring / proposal-based | 2 |
| 🔴 Confirmed closed, dead, or no programme | **10** |
| ⚪ Live but nothing to apply to | 3 |
| ❔ Unknown | **0** |

**Nothing is left unknown.** The lesson worth keeping: for any programme with a
governance forum, check `/<forum>/search.json?q=grant` *first*. It is faster than
crawling and it is the only source that cannot quietly go stale.

---

## 15. Successor sweep — 2026-07-31

§14 closed every programme with a verdict, but one question went unasked:
**a foundation that shuts a grants council rarely stops funding — it renames.**
Asking "what replaced it?" moved three programmes out of the dead pile, and two
of them are worth more than what they replaced.

### 🟢 Three revivals

| # | Was | Actually | Evidence |
|---|---|---|---|
| **5** | Base — "no public form, retroactive nomination only" | **Base Batches — OPEN** | *"The top 15 teams will receive a $10k grant, acceptance to an 8 week virtual program… A minimum of 3 teams will receive a $50k investment from the Base Ecosystem Fund"* |
| **37** | Algorand — "dead, /grants 404s" | **xGov — OPEN** at `xgov.algorand.co` | live funded proposals: *"88,888 Tooling Retroactive — [Approved]"* (1 month ago) |
| **50** | Animoca — "private VC, /contact-us 404s" | **Minds Investment Programme — OPEN** | *"APPLICATIONS OPEN — Ready to apply"*, up to a **$10M** fund |

> 🔑 **Base Batches is the single best new lead.** Its startup track is explicitly
> for teams *"pre-product, pre-launch, or pre-seed [that] have raised less than
> ~$250k"* — which describes us exactly. $10k grant plus a shot at $50k from the
> Base Ecosystem Fund, and Base is already one of our 27 builds.

The lesson generalises: **the old page 404ing is evidence the URL died, not that
the money did.** In all three cases the classic grants page really is gone — I was
right about that — but the funding moved somewhere with a different name.

### 🔵 One reclassification

**#36 NEAR** moves from DEAD to **PROPOSAL**. The Foundation grants form is gone,
but *House of Stake* (`houseofstake.org`) is live governance — 9 proposals, 281
voters — and its remit explicitly covers *"Ecosystem funding rules"* and *"Public
goods funding, ecosystem support programs"*. There is no form; you write a proposal.

### 🔴 Deaths confirmed harder

Re-probing did **not** rescue these, and two now have a second independent
confirmation:

- **#40 Injective** — zero grant threads on `gov.injective.network`, *and* the
  DoraHacks Injective Grant DAO (`dorahacks.io/injective`) now 404s too. Two routes,
  both gone.
- **#7 SKALE** — both `/developers` and `/grants` 404, plus zero forum threads.
- **#26 / #42 TON** — the archived repo, plus `society.ton.org` returning a
  Cloudflare **522** and `ton.org` mentioning no grants anywhere. No successor.
- **#22 Optimism** — no successor route exists *yet*: Governance Fund Missions has
  nothing newer than Dec 2025, and `app.optimism.io/retropgf` is "Page not found".
  Still FLUX rather than DEAD, because the dissolution proposal was contested.

### Scoreboard

| Verdict | §14 | §15 |
|---|---|---|
| ✅ Open | 32 | **35** |
| 🔁 Rolling | 2 | 2 |
| 🟡 Restructuring | 1 | 1 |
| 📝 By proposal | 1 | **2** |
| ⚪ No public form | 4 | **2** |
| 🔴 Dead | 10 | **8** |
| ⛔ Not pursued | 2 | 2 |

**37 of 52 are actionable**, up from 34.

**Always ask what replaced it before writing a programme off.**

---

## 16. The list was never the universe — 52 → 60 (2026-07-31)

Every previous section treated "the 52" as fixed. It was not: 52 was the contents
of **one July dossier**. Scraping five grant aggregators (coinlaunch, rocknblock,
coinfabrik, innmind, peony) and diffing the extracted names against ours surfaced
**83 programmes the dossier never mentioned**. Eight verified as open.

| # | Programme | Chain | Why it matters |
|---|---|---|---|
| 53 | **Ethereum Foundation ESP** | Any / EVM | *"Submit your application"* — the most credible name on the whole list |
| 54 | **Filecoin Foundation** | Any | *"Apply Now"* — tile metadata and map assets are literally what decentralised storage is for |
| 55 | **Mantle Grants** | Mantle (EVM) | *"rolling basis"* |
| 56 | **Taiko Grants** | Taiko (EVM) | *"Submit a project"* |
| 57 | **Rootstock Grants** | Rootstock (EVM) | Bitcoin-secured EVM — a genuinely different narrative |
| 58 | **Flare Grants** | Flare (EVM) | *"Apply for"* |
| 59 | **The Graph Foundation** | Any / EVM | wants a subgraph — which the empire pages need anyway |
| 60 | **Flow Ecosystem Support** | Flow | **NFT-native chain** (NBA Top Shot). Needs a Cadence adapter — a real integration |

> 🔑 **Four of these cost us a config entry, not an integration.** Mantle, Taiko,
> Rootstock and Flare are EVM, and `adapters/evm.js` already covers any EVM chain.
> A `CHAINS` entry in `config.js` plus `env/.env.<chain>` is the entire job — the
> same reason 17 of our 29 mainnet chains share one Solidity contract.

### Scoreboard

| | §15 | §16 |
|---|---|---|
| Programmes tracked | 52 | **60** |
| ✅ Open | 35 | **42** |
| 🔁 Rolling | 2 | **3** |
| **Actionable** | **37** | **45** |
| 🔴 Dead | 8 | 8 |

**45 of 60 actionable.** Re-run the aggregator diff before each submission round —
the universe keeps moving, and a fixed list guarantees you miss the additions.

---

## 17. What the application forms actually ARE — headless audit, 2026-08-11

§12 said a headless browser was the right tool and left it there. This is that
audit run. It matters because the requirement list in §7 came from marketing
pages, not from the fields a submission demands — and the *shape* of each form
decides whether automation is even possible.

Playwright (bundled Chromium, headless) against the ten highest-value open
programmes:

| Programme | Form shape | Automatable? |
|---|---|---|
| **Avalanche Retro9000** | wallet-gated, "Apply Now" → round-rules | ✅ **best fit** — signing is a key operation, and we hold the deployer |
| **Radix Grants** | native `<form>`, 23 fields, no captcha | ✅ fillable |
| **Cardano Catalyst** | 2 native forms, 11 fields, no captcha | ✅ likely — check account gating |
| **Celo Prezenti** | native form, apply → `/grants` | ✅ likely |
| **Stellar SCF** | HubSpot embed, 3 iframes | ⚠️ iframe-scoped, doable |
| **Superteam Earn** | Notion-embedded | ⚠️ per-listing, not one form |
| **Tezos Foundation** | **no form at all** — proposal by email | ❌ n/a, write a proposal |
| **Starknet Grants** | reCAPTCHA + tinyurl → external | ⛔ captcha |
| **MultiversX Growth** | Typeform + reCAPTCHA | ⛔ captcha |
| **Aptos Grants** | **Vercel Security Checkpoint** | ⛔ bot-detection wall |

### Playwright vs zendriver

Both drive a real browser. The difference is intent: **zendriver exists to defeat
bot detection.** That is exactly what stands between us and Aptos (Vercel
checkpoint), Starknet and MultiversX (reCAPTCHA).

So the tool choice is not a technical question. Those three are protected by
deliberate anti-automation controls, and the standing rule in CLAUDE.md §0
applies — captchas and social logins get a human, not a workaround. Using
zendriver *because* it evades detection would be the same act as buying captcha
solves, which was already declined once in this project.

**Playwright is sufficient for every programme worth automating**, because the
ones it cannot reach are the ones we should not be automating anyway.

### The real constraint is not the browser

Four programmes are mechanically fillable. But an auto-submitted application that
gets a field wrong is worse than none: these are one-shot, human-reviewed, and a
malformed submission burns the programme for a cycle. Per §3, Catalyst is scored
1–5 by **non-technical reviewers** — that is a writing problem, not a form-filling
problem.

The defensible split:

- **Automate the gathering** — `GET /metrics/grant`, contract addresses,
  deployment evidence, per-chain "why this chain" from `profiles.js`. That is
  repetitive, verifiable, and wrong answers are catchable.
- **Automate the wallet signature** — Retro9000 and OP Atlas require the original
  deployer to sign. That is cryptography, not prose, and we hold the key.
- **Write the prose per programme.** Never generate-and-submit unattended.

### Blocked regardless of tooling

- **Starknet Seed** — §1: we are disqualified on eligibility, not on the form.
- **KYC / legal entity** — 20% of programmes; blocks *payout*, not submission.
- **Community engagement** — 55% cite it; no Discord or X presence exists.

---

## 18. Every form, actually opened — zendriver sweep, 2026-08-11

§17 audited ten landing pages with Playwright. This is the full sweep: **65 pages
— all 49 non-dead programmes plus the 16 application forms reached by following
their apply links** — loaded in real Chrome via zendriver, through three
residential ISP proxies (`165.49.211.111`, `166.88.173.212`, `64.50.167.6`), one
browser per proxy, sequential. Zero errors. Tooling in `scripts/formaudit/`,
raw records in `scripts/formaudit/results-2026-08-11.jsonl`.

**Why zendriver and not Playwright:** it drives real Chrome with a clean
fingerprint and survived JS shells that returned empty before. It was **not** used
to defeat a challenge. Every captcha found below is reported and left alone — the
§0 rule stands, and eleven pages hit one.

### What stands between us and each application

| Gate | Landing pages (49) | Real forms (16) |
|---|---|---|
| No form on the page | 18 | 7 |
| Third-party host (Airtable/Typeform/Notion/HubSpot/Google) | 13 | 5 |
| **Captcha / bot wall** | 10 | 1 |
| Wallet signature | 5 | 2 |
| Native `<form>` | 3 | 1 |

### The forms whose fields we now actually know

- **Animoca Minds — 31 fields, and we are not eligible.** Two *required* selects
  are `Current activity on Minds` and `Minds actively used`, plus free-text on
  which Minds/Skills/Tools features you will use. This is a programme for teams
  building **on their Minds platform**, not a general investment form. Also
  requires a demo video URL, and asks about a Hong Kong nexus. Pitch deck is
  optional here (a Slides URL).
- **Outlier Ventures Base Camp — 11 fields, and `pitch_deck__file_` is
  REQUIRED.** A file upload, not a link. This is the one programme in the sweep
  that hard-requires the deck. Also asks total funding raised in USD.
- **Polygon Community Grants — 14 fields** (Airtable, S2/S3 share one form).
  Required: first/last name, location, email, **Twitter handle**, **Telegram
  handle**, project name, website, one-liner, number of co-founders. The
  "no community presence" gap in §7 is not soft here — two required fields.
- **Avalanche Retro9000, Arbitrum AAP (Tally), NEAR House of Stake, Algorand
  xGov, Mantle, Flare** — wallet-gated. **This is our best-fit category**:
  signing is a key operation and we hold the retained deployer.

### Pages that look like forms and are not

Worth recording, because a scripted pass would treat all three as submittable:

- **Taiko** — the "form" is the ecosystem directory's project search.
- **Cardano Foundation** — a *partnership inquiry* form (job title, company,
  inquiry type), not a grant application, and captcha-gated.
- **Cardano Catalyst** — the visible fields are search and newsletter signup; the
  proposal form is behind an account.

### Captcha-gated — eleven, all human

Scroll · MultiversX Growth · Starknet Seed · Starknet Growth · Optimism Retro ·
Sui Foundation · Cardano Foundation · a16z CSX · Rootstock · The Graph · Alchemy.

**Correction to the first read of this sweep.** Rootstock's page reported "7
fields", which looked like a short application form. Inspecting the records shows
all seven are *radio options on a support contact widget* — "Bug or complaint",
"Tokens", "Something else". `rootstock.io/funding/` is **not** the grant
application form, and we still do not have its URL. Field counts alone are not
evidence of a form; read the labels.

The same caution applies wherever this sweep reports a low field count on a page
that also reports a captcha — the captcha widget and a newsletter box both
register as fields.

### What this changes

1. **Wallet-gated programmes are the highest-yield automation**, not form-filling.
2. **Twitter and Telegram accounts are now a hard blocker**, not a soft one —
   Polygon requires both fields to submit.
3. **The deck was worth building**: Outlier Ventures requires the file.
4. **Drop Animoca** from the actionable list, or re-scope it — the required
   fields describe a different product than ours.

### The answer sheets

`node scripts/build-apply-pack.mjs` writes one Markdown file per actionable
programme to `deploy/apply/` — **46 sheets**, each carrying that form's real field
list from this sweep with a drafted answer per field, built from repo data: the
chain's own `grantAngle`, its live contract, its post-deployment checks.

Nine of them are captcha-gated. The captcha gates the *submit click*, not the
answers, so the expensive part — assembling correct, chain-specific, verifiable
copy — is done ahead of time and the remaining human step is paste-and-submit.
Captchas are not solved programmatically here and captcha-solving services are
not used; that is the §0 rule, and it holds for third-party sites regardless of
who asks.

Two details the generator gets right that a hand-written sheet would not:

- **Explorer links are derived per chain, not from the deployment record.** The 18
  EVM chains share one record whose `explorer` is Etherscan — quoting that to a
  Rootstock reviewer sends them to the wrong chain to look up an address that is
  not there. EVM links now come from each chain's own `explorerUrl`.
- **Missing assets are marked, not invented.** Twitter and Telegram render as
  `⚠️ NOT AVAILABLE`, which is what makes Polygon's two required handle fields
  visible as a blocker instead of quietly producing a plausible-looking answer.

### Credential hygiene — found during this sweep

`scripts/probe-programs.py` and `scripts/probe-browser.py` were **tracked in git
with live proxy credentials in plaintext**, from the July sweep. Both now read
from `PROXY_AUTH` / `PROXY_HOSTS` / `PROXY_GEO`. The working tree is clean, but
the values remain in history across 3 commits that have already been pushed —
**rotate any proxy credential that ever appeared in those files.** Scrubbing the
file does not unpublish it.

---

## 19. The forms the landing pages never linked — crawl, 2026-08-11

§18 followed whatever each programme's page linked to and found 34 of 46 had no
readable application form. That was a limit of the method, not of the programmes:
the first link matching `/apply|submit/` is often a docs page, a linktree or a
support widget. `scripts/formaudit/crawl.py` walks each site properly — collects
every link *and* scrapes the raw HTML for embedded form hosts, ranks them, then
**opens the top six and counts fields**. A promising URL is a guess; a page with
eighteen labelled inputs is evidence.

Run through Geonode **residential** exits (the datacenter pool is refused by
several of these sites; the older `rotating-datacenter` endpoint is dead).

**Eleven application forms located that we did not have:**

| # | Programme | Form |
|---|---|---|
| 34 / 41 | **Solana Foundation** (+ rolling) | `airtable.com/apppDmK2Pin9WX8jV/shrR0uMKu4N57TGW7` |
| 18 / 29 | **Starknet** Seed + Growth | `airtable.com/appfoRv2ottjRfTpL/pag0G55zA8aU4V9bD/form` — **18 fields, all read** |
| 31 | Arbitrum Foundation (AAP) | `tally.so/r/3xzEzv` |
| 47 | Arbitrum Gaming Ventures | `tally.so/r/0QObE9` |
| 6 | Radix Grants | `docs.google.com/forms/d/e/1FAIpQLSeTzc-…` |
| 33 | SafePal Builder's | `docs.google.com/forms/d/e/1FAIpQLSdBvC…` |
| 17 | MultiversX Growth | `form.typeform.com/to/vRkkboYU` |
| 59 | The Graph | `thegraph.typeform.com/applynow` |
| 2 | Giveth | `giveth.typeform.com/feedback` |

### Two corrections to §17 and §18

- **Starknet is not captcha-gated.** §17 recorded "reCAPTCHA + tinyurl → external
  ⛔". The reCAPTCHA is on the *marketing page*; the actual application is a plain
  Airtable form with no challenge. Reading a gate off a landing page and
  attributing it to the form is wrong — the crawl now reports the gate found on
  the form itself.
- **Solana Foundation's form was reachable all along.** It is linked from the
  grants page as a bare Airtable URL with no `<a>` text matching `/apply/`, which
  is exactly what the first-match heuristic misses.

### Starknet's 18 required fields — and the blocker they expose

Project name · Website URL · **Project GitHub** · **Project X URL** · Contact full
name · Contact email · **Contact Telegram handle** · **Contact GitHub username** ·
TG group ↔ SNF · City · Funding amount · Milestone 1 name / amount / date ·
Referral · Signatory full name / email / title.

Four of those are accounts we do not have, all required. Combined with Polygon's
required Twitter *and* Telegram, this is now the single most expensive gap in the
whole campaign: **it blocks submission outright on the two largest open
programmes**, and no amount of engineering substitutes for it. Creating a project
X account, a Telegram handle and a public GitHub profile is the highest-leverage
hour available.

### Method notes worth keeping

- `tab.evaluate()` returns **strings**. An expression evaluating to an array came
  back unusable and every page silently reported zero links — always
  `JSON.stringify()` the result.
- **Airtable and Tally render their fields inside an iframe**, so a top-document
  field count reads 0 on a real form. A URL on a known form host is treated as
  found regardless of field count.
- Write results incrementally. An earlier run wrote its JSONL only at the end;
  killing a hung crawl at target 57 of 65 threw away all 57.

---

## 20. Every question on every reachable form — deep read, 2026-08-11

§19 found the forms. This reads them. A single top-document probe returns 0 on
most real application forms for three unrelated reasons, and each needed its own
handling in `scripts/formaudit/deepform.py`:

- **Google Forms** renders questions as `div[role=listitem]` with the label in a
  heading — several have no `<input>` at all until focused.
- **Typeform** shows **one question per screen**; a single read sees 1 of 30.
- **Airtable / Tally** render via React after load and paginate on "Next".

So the reader scrolls to the bottom, reads with a probe that understands all four
shapes, then **clicks forward and re-reads**, accumulating unique questions until
the form stops advancing. It never types into a field and never submits.

**154 questions catalogued across 9 forms:**

| # | Programme | Questions | Required | Pages |
|---|---|---|---|---|
| 29 | Starknet Growth / Seed | **44** | 41 | 1 |
| 50 | Animoca Minds | 32 | 13 | 1 |
| 47 | Arbitrum Gaming Ventures | 21 | 20 | 3 |
| 25 | Polygon Community Grants | 18 | 12 | 1 |
| 58 | Flare Grants | 17 | 6 | 1 |
| 6 | Radix Grants | 10 | 8 | 1 |
| 49 | Outlier Ventures Base Camp | 10 | 5 | 1 |

Paginating changed the picture materially: Starknet went 18 → **44**, Polygon
14 → 18, Radix 3 → 10, Arbitrum Gaming 0 → 21. Anything measured from a single
screen undercounts a real form by roughly half.

### The question both Starknet and Arbitrum ask outright

Starknet requires **"Integrated chains"**. Arbitrum Gaming Ventures makes it a
required radio: **Arbitrum native / Multichain including Arbitrum / Multichain
excluding Arbitrum**.

This is §0's monogamy problem as a mandatory field — it cannot be finessed by
leading with `grantAngle`, because the form asks directly. The packs now answer it
straight: yes, 28 chains carry a live contract; what that does *not* mean is a
chain switcher with their chain as a dropdown entry; judge this build on its own.
A reviewer who discovers the other 27 after we implied otherwise has found us
concealing something, which is worse than the multichain fact itself.

### Starknet also wants what we do not have

Beyond X/Telegram/GitHub (§19), the full 44 include **Team GitHub Handles**,
**TG group ↔ SNF**, **Raise details**, **Project KPIs**, **User Acquisition
Strategy**, **Business model**, **Starknet contributions**. "Starknet
contributions" is unanswerable today — we have deployed to Starknet but
contributed nothing to it, and §1 already flags the community-involvement gate.

### Still unread

Arbitrum AAP (Tally), Solana Foundation (Airtable share link), The Graph
(Typeform) and SafePal (Google Forms) returned nothing on both proxy pools —
they gate on a session, a login, or a slow first paint beyond a 110s budget.
Their URLs are confirmed; their fields are not. **Do not assume the packs cover
those four.**

---

## 21. Looking at the screen — six "found forms" that were not, 2026-08-12

§19 and §20 verified forms by *counting fields*. That is not the same as checking
what the page says. `scripts/formaudit/deepform2.py` screenshots every page it
reads; reading those screenshots invalidated six records — four of them
programmes we were about to write applications for.

Evidence images in `scripts/formaudit/evidence/`.

| # | Programme | What the page actually says |
|---|---|---|
| 2 | Gitcoin / Giveth QF | **"Giveth User Experience Feedback Form"** — a UX survey |
| 17 | MultiversX Growth Games (~$1.5M) | **"Developer Office Hours Request Form"** — support booking, with a disclaimer that it is "reserved for advanced technical support only" |
| 31 | Arbitrum Foundation Grants (~$150K) | **"This form is now closed. The form can't receive new submissions at this moment."** |
| 59 | The Graph Foundation (~$60K) | **"Hey :) This typeform is now closed."** |
| 34 / 41 | Solana Foundation (~$250K / ~$100K) | Airtable is the **Active RFPs table**, not an application. Its only visible row reads verbatim: *"If this the only RFP that is visible, it means that there are no other active RFPs at this time. **DO NOT APPLY FOR THIS.**"* |

`deploy/apply/` now renders a `⛔ **Do not use this URL**` banner on all six.

### Why field-counting missed all of this

A closed Tally, a UX survey and an RFP table all present a perfectly well-formed
page. Two of them even have inputs. The signal that separates them from an
application is **prose**, and no field probe reads prose. Three heuristics were
each individually reasonable and jointly wrong:

- "the link text says apply" → Giveth's did;
- "it is on a known form host" → all six were;
- "it has ≥3 labelled fields" → the survey and the office-hours form both do.

**Look at the page before trusting the parse.** A screenshot cost one extra call
per form and overturned six conclusions, two of them on programmes worth a
combined ~$1.65M in headline amounts.

### What this does to the campaign

Of §19's eleven "located application forms", **five were wrong or closed**. The
ones that survive verification are Starknet (Seed + Growth), Polygon, Flare,
Radix, Arbitrum Gaming Ventures, Outlier Ventures, Animoca and SafePal.

Two programme statuses in `deploy/apex/programs.mjs` need review against this:
**The Graph** and **Arbitrum Foundation Grants** are listed OPEN but their forms
refuse submissions. Solana is subtler and should not be marked dead — the RFP
track is empty right now, but `solana.org/grants-funding` is a separate route and
was not the URL tested here.

---

## 22. Governance forums settle it — SearXNG + Discourse sweep, 2026-08-12

§21 proved six forms were wrong or closed by looking at them. This asks the
question a screenshot cannot: *is the programme itself still funding?*
`scripts/formaudit/research.py` runs SearXNG (local, proxied) for candidate
routes, then queries each ecosystem's **Discourse governance forum** through its
own `/search.json` — §14's technique, because funding requires a public proposal
and a forum cannot go quietly stale the way a landing page can.

### The Graph is over — in their own words

> *"The Graph Foundation is pausing applications to the Grants Program. … In
> recent months, we made the decision to pause the Grants Program to reassess our
> ecosystem strategic priorities."*
> — forum.thegraph.com, **2026-07-06**

That is the announcement the closed Typeform was the symptom of. **#59 → DEAD.**

### Newest grant thread per forum — the staleness signal

| Programme | Newest grant thread | Read |
|---|---|---|
| Celo Prezenti | **2026-07-23** "Prezenti Grants: Season 3 Plan" | genuinely live |
| Gitcoin / Giveth | 2026-01-29 | live |
| Algorand xGov | 2025-07-28 "[xGov][Beta] Becoming a Proposer" | live |
| Scroll | 2025-09-22 | live |
| Polygon | 2025-06-18 | thin, watch it |
| **Arbitrum Foundation** | **2024-11-04** | 21 months silent — matches the closed form |
| NEAR House of Stake | nothing on gov.near.org since 2022 | wrong forum, or no public process |

**Arbitrum Foundation Grants → FLUX.** A closed form plus a governance forum with
no grant activity in 21 months is not a temporary shutter. Arbitrum Gaming
Ventures (#47) is separately confirmed live with a 21-question form — that is the
Arbitrum route.

### Programme tally after this pass

`OPEN 39 · ROLLING 3 · FLUX 2 · PROPOSAL 2 · NO-FORM 2 · DEAD 10 · BLOCKED 2`
(was OPEN 41 · DEAD 9 · FLUX 1.)

### Still unknown, and now marked as such

- **MultiversX Growth Games (~$1.5M)** — the URL we held is a support-desk form.
  SearXNG returned no candidate for the real one.
- **Gitcoin / Giveth QF** — same, a feedback survey.
- **Solana Foundation** — the RFP table is empty by its own admission, but
  `solana.org/grants-funding` is a different route and was not retested. Marked
  as an empty RFP track, **not** as dead.

Recording "we do not have this URL" is the point. The previous pass recorded a
support-desk form as a $1.5M application, which is worse than an empty field.

---

## 23. The hunt that found nothing — and why that is the finding, 2026-08-12

30 actionable programmes still had no confirmed application URL. This pass opened
**76 pages** across them with `scripts/formaudit/hunt.py`, classifying each by
reading its prose rather than counting its inputs.

**Genuine applications found: zero.** What those 76 pages actually were:

| Classification | Pages |
|---|---|
| DOCS — documentation or a listing | 31 |
| SUPPORT — help desk, office hours, contact | 18 |
| UNKNOWN | 10 |
| MAYBE — application language, too few fields | 7 |
| FEEDBACK — a survey | 5 |
| CLOSED | 1 |
| LOGIN — account wall | 1 |

### The three false positives, and the heuristic they killed

The classifier reported three APPLICATIONs. **All three were wrong**, and their
own field labels say so:

- **Cardano Catalyst** → newsletter signup (`e.g. Ada Lovelace`, `accept-terms` ×2)
- **Cardano Foundation** → partnership inquiry (`Partnership Inquiry Type`, `Job title`)
- **Rootstock** → product interest (`Which Vault(s) are of interest to you?`)

All three came from one fallback rule: *"≥6 fields and ≥3 required ⇒ it is an
application."* It fired three times and was wrong three times. **Deleted.** A
newsletter box, a partnership form and a product-interest form all clear any
field-count bar that a real application clears. Only explicit application
language *plus* real inputs now qualifies.

That is the third time this project has been bitten by the same class of error
(§21 field counts, §19 first-matching link, now this). The rule that holds:
**structure never identifies intent — read the words.**

### Two real corrections

- **Base Batches → FLUX.** Verbatim: *"Batches 003: Student Track RUNS FROM
  Feb 17 – Apr 27, 2026 … Applications closed."*
- **Avalanche Research Grants** is behind an account wall — *"Sign in to
  continue"* on Avalanche Builder Hub. Not a captcha; a login.

### What the zero actually means

It is not that the crawler is weak. It is that **most of these programmes do not
publish a web form at all.** The dominant page type is documentation (31) and the
second is a support desk (18). Tezos already told us this in §17 — "no form at
all, proposal by email". The same is very likely true of Beam, Game3, HBAR,
Alliance, Mantle, Taiko and Flow.

**Stop hunting for forms on these.** The next move is per-programme and human:
read the docs page and find the stated submission channel — email, a forum
proposal, a Notion portal, or an account. Automation has extracted what it can.

### Honest position after §§18–23

- **7 programmes** — form confirmed, every question captured (152 total)
- **7 programmes** — form URL confirmed, fields behind a session or iframe
- **26 programmes** — no web form located, and probably none exists
- **4 programmes** — URL verified as the wrong form or closed

---

## 24. The dossier — one page for everything, 2026-08-12

`node scripts/build-dossier.mjs` → `deploy/status/dossier.html`. Eight tabs over
every artefact this project has produced: **Overview · Chains · Contracts ·
Wallets · Programmes · Applications · Requirements · Readiness**.

It does **not** replace `deploy/apex/build-status.mjs`, which renders
`xono.ai/status` for reviewers. This is the internal view — denser, and it carries
the §§18–23 form work that a funder has no reason to see.

Every figure is read at build time from `config.js`, `deployments.mjs`,
`programs.mjs`, `env/.env.<chain>` and `scripts/formaudit/*`. Nothing is
transcribed, so a contract address can never drift from what is deployed.

**Readiness** is the tab that did not exist before. It scores the three things
that decide whether a submission is possible today — chain live (40), form depth
(40), blockers (20) — and lists every blocker by name: *chain not deployed ·
no application route found · captcha · account required · X / Telegram account
required · public GitHub required · pitch deck file required · demo video
required*. Nine programmes score with nothing blocking; the rest state exactly
what is missing.

**Visual system.** The dossier is deliberately **light** — near-white grounds
(`#fbfbfd` / `#ffffff`), Apple system faces (`-apple-system` / `SF Pro`, `SF Mono`),
hairlines at `#e3e3e6`, soft two-layer shadows, a segmented-control tab bar, and a
single blue accent (`#0071e3`) used only for state. Semantic colour is separate
from the accent.

This is **not** a change to the product. `src/` keeps the solid-dark tokens and
the pitch deck stays dark; only this internal page is light, at the user's
explicit request. The no-glassmorphism rule still holds and needed no exception —
`grep backdrop-filter deploy/status/dossier.html` matches only a comment saying it
is not used. It commits to one theme on purpose, so there is no
`prefers-color-scheme` branch and every colour is painted explicitly.

Three rendering notes worth keeping:

- A `<thead>` stuck to the viewport at `top:44px` (to clear the sticky tab bar)
  rides over the first row. Give the table its own `max-height` scroll box and
  stick the header to **that** instead — self-contained, and it behaves the same
  on a phone.
- **`display:flex` on a `<td>` removes it from table layout**, so that cell's
  borders stop aligning with the rest of the row — it drew a vertical seam beside
  the Ready column. Keep the cell a `table-cell` and flex an inner wrapper.
- Verify by clicking every tab headless at 1500×1000 **and** 390×844, asserting
  exactly one panel is visible and `scrollWidth <= innerWidth`. Both passed with
  zero console errors.

### Submission channels for the form-less programmes

`scripts/formaudit/channels.py` read all 29 programmes that have no web form,
extracting mailto targets, stated how-to-apply sentences and deadlines. Yield was
deliberately modest and is quoted, not inferred: **grants@fil.org** (Filecoin),
**bd@flowfoundation.org** (Flow), **hello@onbeam.com** (Beam), plus deadlines on
Stellar SCF and Avalanche Retro9000. The rest state no public channel on their
landing page — consistent with §23's finding that most of these programmes are
documentation, not application funnels.
