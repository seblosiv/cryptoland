# Pitch deck

`scripts/build-deck.mjs` generates one self-contained HTML deck **per chain** from
the repo's own data. Nothing in a slide is typed by hand.

```bash
npm run build:deck                       # every non-halted mainnet chain → deploy/deck/
node scripts/build-deck.mjs rootstock    # one chain
node scripts/build-deck.mjs --neutral    # the chain-agnostic deck only
node scripts/build-deck.mjs --artifact rootstock   # body-only, for a host that supplies <head>
```

Output is git-ignored (`deploy/deck/`) because it is regenerable, and it is
**offline-complete** — no font CDN, no script tag pointing anywhere, no image
requests. It opens from a USB stick, and ⌘P produces a landscape PDF at
297 × 167 mm, which is the format an application form actually accepts.

---

## 1. Who actually asks for one

Fewer programmes than you would guess. `documentation/program-requirements.md` §7
measures deck frequency at **5%**, and of the 44 open/rolling programmes only
**Rootstock Grants** names a deck in its own copy.

The real audience is the equity and accelerator track, where a deck is assumed
even when the form does not list it:

| Programme | Why a deck |
|---|---|
| Rootstock Grants | The only grant programme that says so outright |
| Animoca — Minds Investment Programme | Investment, equity |
| Alliance DAO | Accelerator, ~7% equity |
| Outlier Ventures Base Camp | Accelerator, ~6% equity |
| a16z crypto CSX | Accelerator, equity |
| Arbitrum Gaming Ventures | Equity |
| Base Batches | $10K grant plus a $50K investment track |
| BNB Chain MVB S10 | Accelerator cohort |

For everything else, `documentation/submitting-grants.md` §"Live metrics page" is
explicit that a **live `/metrics/grant` page beats a slide deck** — it renders the
same numbers and a reviewer can refresh it. Send the deck when it is asked for.
Do not attach it in place of the live page.

---

## 1b. The narrative, rebuilt 2026-08-13

The first version opened with the product and put "28 chains, 14 VM families" on
slide 6. Both were wrong for this reader. §0 is explicit that every ecosystem
grant scores monogamy, so a portability slide argues *against* us — and a
pre-seed reader does not fund a feature list, they fund a thesis.

The arc is now: **insight → product as consequence → why this chain → on-chain
proof → the mechanism → honest traction → one ask.**

- **Slide 2 is the insight**, not the product: *"Every square metre of Earth has
  been mapped. None of it is ownable."* That is the sentence the deck is built to
  earn.
- **Slide 7 is the mechanism** — `tokenId = (x << 15) | y`, set at display size.
  Ownership is not a database row pointing at a place; the identifier *encodes*
  the place, so anyone can compute the token for any point on Earth without
  asking us. It is the most elegant true thing this project has, and it replaced
  the multichain brag entirely.
- **The ask is one unlock**, not four line items: move the daily loop on-chain.

**Every mention of another chain is gone.** A sweep asserts zero occurrences of
`28 chains`, `28 mainnet`, `14 VM families`, `on all 18` or `every chain` across
all 33 chain decks. The shared EVM deployment record writes its checks in fleet
language ("bytecode present on all 18"), which printed on the exclusivity slide
would tell a Rootstock reviewer they are one of eighteen — `chainCheck()` rewrites
that text into the chain's own terms at build time.

---

## 2. Why the deck is per-chain and not one file

This is the whole design constraint, and it comes from
`documentation/program-requirements.md` §0. Solana's third evaluation criterion is
verbatim **"Only Possible on Solana"**, and Starknet's committee scores
**"embeddedness with the Starknet ecosystem"**.

A deck whose headline is *"one codebase, 27 chain-native builds"* answers
*"why any chain"* — which scores **zero** on a named criterion, and reads to a
reviewer as a project that will leave. So:

- **Slide 3 is the chain's own `PROFILE.onboarding.grantAngle`**, in that chain's
  vocabulary, with `nativeTerm` and `chainStat` beside it.
- **Slide 4 is that chain's live contract** and the checks that were run against
  it after deployment.
- **Portability is slide 6**, framed as evidence the team ships — never the thesis.

The neutral deck (`index.html`) drops slides 3 and 4 entirely. It exists for a
general audience, not for an ecosystem grant.

---

## 3. Where each number comes from

Every fact is read at build time. Transcribing a contract address into a slide by
hand is how a reviewer ends up checking a wrong address on a live chain.

| Slide content | Source |
|---|---|
| Contract address, live/compiled status | `env/.env.<chain>` → `VITE_CONTRACT_<KEY>` |
| Explorer URL, language, deploy date, checks | `deploy/apex/deployments.mjs` |
| Total checks passing | `deploymentTally()` |
| Chain name, family, brand colour | `src/lib/blockchain/config.js` |
| Tagline, grant angle, native term, chain stat | `src/config/profiles.js` |
| Wallet names | `WALLETS_BY_FAMILY` in `src/lib/chainProfile.js` |
| Accent + readable ink derivation | `__theme` in `src/lib/chainProfile.js` |

Because the accent derivation is **imported rather than reimplemented**, a deck
accent and a UI accent cannot drift. Cardano `#0033ad` is 1.82:1 on `--s1` and is
lifted to `#5a7bca` for text in both places by the same function.

Slide 7 is deliberately the honest one: it separates what is real (contracts,
checks, the game loop) from what is seeded (every holder in every world is a
generated address). Per `CLAUDE.md`, a reviewer who discovers that difference on
their own is a lost grant.

---

## 4. Design

The deck uses the app's tokens, not new ones — `--bg #0f0f0f`, `--s1`–`--s4`,
white-alpha hairlines, one accent — so `grep -rn "backdrop-filter" deploy/deck/`
returns zero, same as `src/`.

Two decisions worth recording:

- **It commits to one theme on purpose.** A deck is a projection surface for a
  solid-dark product, so there is no `prefers-color-scheme` branch. Every colour
  is painted explicitly rather than inherited, so the page holds on any host.
- **Monospace carries the data.** Addresses, coordinates, byte counts, gas and
  check results are all set in `--mono`. That is the subject's own vernacular; a
  deck about a coordinate grid should set its numbers in the grid's typeface.

The cover canvas is the Z14 grid in perspective with claimed tiles lit in the
chain accent, using the same `mixWhite` trick as the map so a navy accent still
reads as light. Legibility over it is bought with **painted gradients of the
ground colour**, never blur.

Three layout rules that were arrived at by rendering, not by reasoning:

1. The canvas is a direct child of `.slide`, not of `.frame`. Inside `.frame` it
   sized to the 1180px content box, and — being positioned among static siblings —
   painted *over* the headline.
2. `inset: 0` resolves to the **padding box**, so the cover drops its own padding
   onto `.frame` to let the map go full-bleed.
3. The type scale takes `min(vw, vh)`. Scaling on width alone let a 1024 × 640
   laptop push a slide past its own page — which is invisible on screen and
   **clips silently in print**.

### Phones stop being a deck

Below **720px** the deck is no longer paged. Nine fixed `100dvh` panes cannot hold
a 360px phone without shrinking body text below anything anyone will read, so
slides size to their content, scroll-snap is off, and `.foot` joins the flow
instead of being pinned. The cover keeps full height — it is the one screen that
is composed rather than read.

The map is recomposed for portrait too: a landscape camera squeezed into a phone
becomes a narrow corridor under a band of dead space. Portrait widens the spread
to `1.85 × W`, drops the depth from 5.2 to 3.4, raises the horizon, and swaps the
left-side scrim for a bottom-up one because the copy now runs full width. The
tokenId callout needs ~200px of clear space to its right, so below 620px it is
**dropped rather than clipped mid-number**.

Two ordering traps here: the `@media print` block must come *after* the phone
block and restate `justify-content`, `padding` and the pinned `.foot`, or a narrow
print box inherits the phone layout; and `#cover` zeroes its padding for the
full-bleed map, so its footer — which lives outside `.frame` — has to carry the
gutter itself or it bleeds off the screen edge.

---

## 5. Verifying a change

There is no unit test for a deck; render it. Playwright lives on the prod box
(`/root/wallets/node_modules/playwright`), headless Chromium only.

At **1600 × 900, 1280 × 720 and 1024 × 640** (the paged range):

- no slide is taller than the viewport — a tall slide pushes its footer past the
  fold on screen and **clips** in print;
- `document.documentElement.scrollWidth <= window.innerWidth`;
- no `pageerror` and no console errors.

At **393 × 852 and 360 × 740** (`isMobile: true`), slides taller than the viewport
are *expected* — that is the document layout, not a failure. Check instead that
there is no horizontal scroll, that the cover footer sits inside the gutter, and
that long addresses wrap rather than overflow.

In **print**, under `emulateMedia({ media: 'print' })` at 1122 × 631, every slide
must be exactly 631px with `scrollHeight === clientHeight`.

Last verified 2026-08-11: 33 chain decks + neutral, all slides fit across the
paged range, phone layout clean at 393 and 360, 9/9 print pages exact.
