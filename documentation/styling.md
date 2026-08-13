# Styling & Design System

## Overview

CryptoLand uses Tailwind CSS 4 for utility classes combined with a custom CSS layer in `src/index.css` for design tokens, component classes, and animations.

The visual theme is **solid dark** — opaque near-black surfaces, hairline white-alpha borders, and a single green accent reserved for active/selected states. It should read like a native dark mobile app.

> **No glassmorphism.** Panels are opaque. There is no `backdrop-filter`, blur or translucent panel anywhere in `src/` (verified: zero occurrences). This is a deliberate, repeatedly-reaffirmed product decision — do not reintroduce frosted or blurred panels.

**Per-chain accent.** Each per-chain deployment additionally sets `--chain-accent` and `--chain-accent-dim` at boot via `applyProfileTheme()` in [`src/lib/chainProfile.js`](../src/lib/chainProfile.js). Chain theming changes **the accent colour and the copy only** — never the layout or the visual language. See [multichain.md](multichain.md#per-chain-presentation-chain-profiles).

---

## Typography

Two Google Fonts loaded in `index.html`, exposed as tokens:

| Token | Family | Usage |
|---|---|---|
| `--font` | Inter | All UI text |
| `--mono` | Space Mono | Addresses, prices, coordinates, tickers |

---

## Design Tokens

All defined in `:root` in `src/index.css`.

### Surfaces (opaque, no transparency)

| Variable | Value | Usage |
|---|---|---|
| `--bg` | `#0f0f0f` | Page background |
| `--s1` | `#141414` | Panels, modals |
| `--s2` | `#1a1a1a` | Cards, inputs, raised rows |
| `--s3` | `#222222` | Hover / selected rows |
| `--s4` | `#2a2a2a` | Highest elevation |

### Borders (white-alpha hairlines)

| Variable | Value | Usage |
|---|---|---|
| `--b0` | `rgba(255,255,255,0.04)` | Default hairline |
| `--b1` | `rgba(255,255,255,0.08)` | Emphasised |
| `--b2` | `rgba(255,255,255,0.13)` | Strongest |

### Text

| Variable | Value | Usage |
|---|---|---|
| `--t1` | `#ffffff` | Primary |
| `--t2` | `rgba(255,255,255,0.55)` | Secondary |
| `--t3` | `rgba(255,255,255,0.28)` | Tertiary / hints |
| `--t4` | `rgba(255,255,255,0.14)` | Disabled / faintest |

### Accent & status

| Variable | Value | Usage |
|---|---|---|
| `--green` | `#4ade80` | Accent — active, available, owned, success |
| `--green-d` | `rgba(74,222,128,0.12)` | Accent fill |
| `--green-b` | `rgba(74,222,128,0.22)` | Accent border |
| `--red` | `#f87171` | Error, danger, sold |
| `--amber` | — | Warning / scarcity |
| `--chain-accent` | per-deployment | The chain's brand hex. **Fills only** — buttons, dots, the live pulse |
| `--chain-accent-dim` | `--chain-accent` + `22` | Low-opacity variant, for badge/panel backgrounds |
| `--chain-accent-ink` | `#0f0f0f` or `#ffffff` | A label readable **on** the accent — picked by whichever wins on contrast |
| `--chain-accent-ui` | accent lightened to ≥4.5:1 on `--s1` | **Ink** — any accent-coloured text, icon or logomark |

> **Fill vs ink.** `--chain-accent` is the brand colour and is right for a solid
> shape. It is *not* automatically right for text: Cardano `#0033ad` is **1.82:1**
> against `--s1`, Radix `#052cc0` is **1.87:1**, Stellar `#7d00ff` is **2.91:1**,
> Base `#0052ff` is **3.20:1** — all below the 4.5:1 AA bar, as 12.5px body copy.
> Use `--chain-accent-ui` for anything you read and `--chain-accent-ink` for a
> label sitting on the accent. Both are derived from the brand hex at boot, so the
> ~20 chains that already pass keep their exact colour and nothing is hand-tuned
> per chain. `src/test/theme.test.js` fails the build if a chain resolves to an
> unreadable pair.

`.btn` and `.btn-hero` therefore read `background: var(--chain-accent, var(--green))`
and `color: var(--chain-accent-ink, #0f0f0f)`. Before that they were hardcoded to
`var(--green)` with `#0f0f0f` text, which put a CryptoLand-green CTA in the middle of
an otherwise entirely blue Base screen — on the largest element of every onboarding
step, on all 29 builds. The `var(--x, fallback)` form keeps the generic (non-chain)
build green.

### Radii, shadows, layout

| Group | Variables |
|---|---|
| Radii | `--r-sm`, `--r-md`, `--r-lg`, `--r-pill` |
| Shadows | `--sh-sm`, `--sh-md`, `--sh-lg` |
| Safe areas | `--sat`, `--sar`, `--sab`, `--sal` (iOS notch insets) |
| Layout | `--feed-h` (live-feed ticker height; shrinks on mobile) |

---

## Component Classes

Real classes defined in `src/index.css`:

| Class | Purpose |
|---|---|
| `.panel` | Opaque surface container — `var(--s1)`, `--r-lg`, `--sh-lg` |
| `.card` | Inset content block on `var(--s2)` |
| `.btn` | Primary button (inline-flex, `--font`) |
| `.btn-ghost` | Secondary/transparent button |
| `.btn-hero` | Large CTA (intro overlay "Enter CryptoLand") |
| `.badge`, `.badge-dim`, `.badge-green` | Small status chips |
| `.pill` | Rounded label (`--r-pill`) |
| `.label` | Uppercase micro-label — 9px / 500 / `.18em` |
| `.label-c` | Centred `.label`; pays back the trailing letter-space |
| `.figure` | Mono, tabular figures, `-.03em` — every number in the UI |
| `.rule` | Short hairline above a heading (`::before`) |
| `.input` | Text input on `var(--s2)` |
| `.divider` | 1px separator using `--b0` |
| `:focus-visible` | Accent ring — chain accent, `--green` fallback |
| `.live-dot` | Pulsing "live" indicator |
| `.modal-backdrop` | Full-screen dim behind modals |
| `.drag-handle` | Mobile sheet grab handle |
| `.mono` | Applies `--mono` |
| `.allow-select` | Opts back into text selection |

---

## The instrument register

Brought over from the apex homepage (`deploy/apex/build-apex.mjs`), whose hero
readout is the surface in this project that reads most finished. It is a
**shared** layer in `src/index.css`, so all 27 chain builds inherit it — no
per-chain CSS, no per-chain components. It changes no colour, no copy and no
onboarding step; it is type, hairlines and edges only.

**Micro-labels are small and widely tracked, not large and bold.** `.label` is
9px / 500 / `.18em`, down from 10px / 600 / `.08em`. Letter-spacing appends a
trailing gap after the final character, which visibly throws a centred label off
its axis — `.label-c` subtracts it back. Only the centred variant does, because
a negative margin on every label would drag whatever follows it inline.

**Every figure is tabular.** `.figure` sets `font-variant-numeric: tabular-nums`
plus `-.03em`. This is not decoration: the HUD counters change while you are
looking at them, and proportional digits shift width underneath, so the number
twitches on every update. Fixed advance holds it still.

**Surfaces are defined by hairlines.** `.panel` / `.card` / `.pill` carry a 1px
`--b0`/`--b1` edge, as do the HUD stat strip, the logo cluster and the search
field. Those three had none while every button beside them did, so the top
chrome read as two different systems.

**Focus is visible.** Every control in the app sets `outline: none`, which left
keyboard users with nothing. `:focus-visible` now draws a ring in the build's own
accent — correctness and polish in the same rule.

**Looping motion stops under `prefers-reduced-motion`.** Entrances still run at a
length that reads as instant; the live dot, tickers and spinner stop.

> ⚠️ Wide tracking costs width. On a 390px screen it tipped the onboarding stat
> labels onto a second line, so the chips read unevenly; they now shed a little
> size below ~430px. Do **not** reach for `white-space: nowrap` there — the third
> chip is per-chain and Radix's "Readable transactions" is 21 characters, which
> would run straight out of the box. That grid is also
> `repeat(3, minmax(0,1fr))`, not `1fr 1fr 1fr`: a bare `1fr` is floored at
> min-content, so a long third label widened its own column and squeezed the
> other two on that chain alone. Side padding is **6px**: the column is 95px at
> 390px and "TRANSACTIONS" needs ~79px, so 8px left it grazing the border.
>
> Check this by measuring, not by looking — `scrollWidth > clientWidth` on the
> label, across the chains with the longest `chainStat.label` (radix, sui, near,
> flow, rootstock). A 1px spill is invisible in a screenshot and still wrong.

### The signal feed: colour as a rule, not a wash

The feed was the loudest surface in the app — yellow-washed war rows, a
red-washed card per scarcity alert, seven saturated hues from `SIG_COLOR` in a
260px column, and weights up to 900. The fix is one rule: **a signal's colour
appears as a 2px rule, never as a fill.** Cards are `--s2` with a `--b1`
hairline and `box-shadow: inset 2px 0 0 <type colour>` — inset rather than
`border-left` so row metrics are untouched. Separators are `--b0`, not tinted
per type, so a mixed run no longer stacks differently-coloured hairlines.

**Emoji were removed only where they duplicated something already on screen**,
never where they carried information:

| Removed | Because |
|---|---|
| 🥇🥈🥉 in the war rows | the rank is already set as a tabular numeral (`01`, `02`) |
| `sig.icon` in the war rows | `sig.text` already starts with the country's flag — for ranks 4-6 the server sets `icon` to that same flag, so it drew **twice** (a visibly doubled flag on the UK row) |
| 🔴🟠⚠️ on scarcity cards | the server picks that blob from the same percentage thresholds as `sig.color`, which is now the rule — severity was stated twice |
| the green `+` badge in war rows | `sig.sub` already contains the `+` |
| the emoji inside every `TYPE_LABEL` | `"🔴 SCARCITY"` sat beside a separate 🔴 beside text giving the percentage: the same fact three times |

In the ticker the tinted, colour-bordered, colour-texted pill became a **5px
square** in the type colour plus a `.label` — square rather than round, because
the product is a grid of tiles. That is one use of the hue instead of four.

---

## Favicons and app icons

Generated per chain at build time by `scripts/chain-icons.mjs`, called from the
`chainMeta()` plugin's `writeBundle` so every build path emits them.

What was there before: `public/favicon.svg` was a purple lightning bolt from an
unrelated project — 9.5 KB of gaussian-blur filters, in a design system whose
first rule is that nothing blurs — and `manifest.json` pointed at
`/icons/icon-*.png`, **a directory that has never existed**. The SPA rewrite
answered each of those requests with `index.html`, so every "icon" was 3.6 KB of
HTML served as `image/png`: installing the app gave a broken tile, and
`apple-touch-icon` and the TON Connect `iconUrl` were dead too.

The mark is the apex mark — one filled tile on a grid, three elements, drawn on
a 64-unit grid so every edge lands on a whole pixel at 16/32/48/96/128/192/512.
**The tile takes the chain's accent**, resolved the same way
`src/lib/chainProfile.js` resolves it (a `PROFILES.accent` override, else the
`CHAINS` entry's `color`), so 32 open tabs are told apart by colour rather than
by reading 32 near-identical titles.

> No rasteriser dependency. The mark is flat colour on axis-aligned rectangles,
> so it is rasterised into an RGBA buffer and PNG-encoded with `node:zlib` — no
> browser, no canvas, no native module, and byte-identical output on the laptop,
> the box and CI. Emits SVG, PNG at nine sizes, `favicon.ico`,
> `apple-touch-icon.png`, and a per-chain `manifest.json` carrying the accent as
> `theme_color`.

### What was deliberately left alone

90 of the 96 accent references in `src/components/` are a hardcoded
`var(--green)`; only 6 use `var(--chain-accent-*, var(--green))`. So on a
non-green build the brand wordmark, buttons and map are the chain's colour while
most state indicators stay CryptoLand green. That is a real inconsistency with
§3.4's "theming = accent + copy", but it is a **colour** change across 90 call
sites and was out of scope for this pass. Worth doing deliberately, not as a
side effect of a typography change.

---

## Animations

`@keyframes` defined in `index.css`:

`pulse-dot`, `fade-up`, `fade-in`, `scale-in`, `sheet-up`, `slide-in-right`,
`ticker`, `spin`, `ping`, `news-scroll`, `alert-flash`

Notable uses: `sheet-up` for mobile bottom sheets, `slide-in-right` for the desktop purchase panel, `ticker` / `news-scroll` for the live feed, `spin` for the payment-confirming spinner, `alert-flash` for scarcity alerts.

---

## Map Styling

MapLibre GL overrides in `index.css` — restyled to the **solid** theme (no blur):

```css
.maplibregl-ctrl-group {
  background: var(--s2) !important;
  border: none !important;
  border-radius: var(--r-md) !important;
  overflow: hidden;
}
.maplibregl-canvas { outline: none; }
.maplibregl-ctrl-attrib { /* attribution restyled/minimised */ }
```

### OSM raster layer paint
Applied via MapLibre layer paint properties (not CSS), to darken the basemap so
tiles and UI read clearly on top:

```js
'raster-saturation': -0.8,     // near-grayscale
'raster-brightness-min': 0,
'raster-brightness-max': 0.35  // darkened
```

---


### Modal scrims — radial, never blurred

A full-screen modal sits on top of the map, and the map **is** the product. A flat
`rgba(0,0,0,0.92)` crushed it to pure black, so the first thing a player saw of a
geospatial game was an empty void until the modal closed.

The fix is a radial gradient — dense behind the card where text must stay
readable, much lighter at the edges so coastlines, labels and city lights read
through:

```css
radial-gradient(ellipse 78% 68% at 50% 50%,
  rgba(0,0,0,0.90) 0%, rgba(0,0,0,0.86) 30%,
  rgba(0,0,0,0.62) 58%, rgba(0,0,0,0.34) 82%, rgba(0,0,0,0.20) 100%)
```

**Not `backdrop-filter: blur()`.** That is the glassmorphism this project has
rejected repeatedly, and it also costs a compositor pass over the whole viewport
on every frame while a WebGL map animates underneath. The card itself stays
opaque `--s1`, so contrast inside it is unaffected.

Applied to `ChainOnboarding`, `PersonalPlaceOnboarding` and `EmpireCard` — the
last two still carried `backdropFilter: 'blur(6px)'` and were the only real
violations left in `src/`.


## Layout System

- **Full viewport:** `html, body, #root` are `width/height: 100%`, `overflow: hidden`
- **Map layer:** `position: absolute; inset: 0` (fills the viewport behind everything)
- **UI panels:** `position: fixed` with explicit `top/right/bottom/left` placement
- **Z-index stack:** Map → UI panels → tooltip → modal
- **Safe areas:** mobile UI uses `--sat/--sar/--sab/--sal` so controls clear the notch and home indicator
- **Touch targets:** on coarse pointers, buttons are forced to a 44×44px minimum
