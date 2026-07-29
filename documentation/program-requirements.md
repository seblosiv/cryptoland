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
