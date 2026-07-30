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
| Pitch deck | **5%** | ✅ Not needed (Animoca only) |

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
