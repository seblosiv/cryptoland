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
| `.label` | Uppercase micro-label |
| `.input` | Text input on `var(--s2)` |
| `.divider` | 1px separator using `--b0` |
| `.live-dot` | Pulsing "live" indicator |
| `.modal-backdrop` | Full-screen dim behind modals |
| `.drag-handle` | Mobile sheet grab handle |
| `.mono` | Applies `--mono` |
| `.allow-select` | Opts back into text selection |

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

## Layout System

- **Full viewport:** `html, body, #root` are `width/height: 100%`, `overflow: hidden`
- **Map layer:** `position: absolute; inset: 0` (fills the viewport behind everything)
- **UI panels:** `position: fixed` with explicit `top/right/bottom/left` placement
- **Z-index stack:** Map → UI panels → tooltip → modal
- **Safe areas:** mobile UI uses `--sat/--sar/--sab/--sal` so controls clear the notch and home indicator
- **Touch targets:** on coarse pointers, buttons are forced to a 44×44px minimum
