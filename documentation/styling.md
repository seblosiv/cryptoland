# Styling & Design System

## Overview

CryptoLand uses Tailwind CSS 4 for utility classes combined with a custom CSS layer in `src/index.css` for design tokens, component classes, and animations. The visual theme is **dark gold** — deep near-black surfaces with warm gold accents and glassmorphism panels.

---

## Typography

Two Google Fonts loaded in `index.html`:

| Font | Family | Usage |
|------|--------|-------|
| Space Mono | `font-mono` | Primary monospace — numbers, coordinates, code values |
| Syne | `font-sans` | Headings, labels, UI text |

---

## CSS Custom Properties (Design Tokens)

Defined in `:root` in `index.css`.

### Surface Colors

| Variable | Value | Usage |
|----------|-------|-------|
| `--bg` | `#08080c` | Page background |
| `--surface` | `#0e0e14` | Card/panel base |
| `--surface-2` | `#14141e` | Elevated panels |
| `--surface-3` | `#1c1c28` | Highest elevation |

### Border Colors

| Variable | Value | Usage |
|----------|-------|-------|
| `--border` | `rgba(255,255,255, 0.055)` | Subtle dividers |
| `--border-2` | `rgba(255,255,255, 0.09)` | Panel borders |
| `--border-bright` | `rgba(212,175,100, 0.35)` | Gold accent borders |

### Text Colors

| Variable | Value | Usage |
|----------|-------|-------|
| `--text` | `#f0ede8` | Primary body text |
| `--muted` | `#5a5868` | Secondary/disabled text |
| `--dim` | `#363444` | Placeholder/ghost text |

### Accent Colors

| Variable | Value | Usage |
|----------|-------|-------|
| `--accent` | `#d4af64` | Primary gold accent |
| `--accent-glow` | `rgba(212,175,100, 0.4)` | Glow/shadow for accent |
| `--accent-dim` | `rgba(212,175,100, 0.6)` | Muted gold |

### Status Colors

| Variable | Value | Usage |
|----------|-------|-------|
| `--green` | `#4ade80` | Success, available, owned |
| `--red` | `#f87171` | Error, danger |
| `--blue` | `#60a5fa` | Info |

---

## Component Classes

### `.glass`
Glassmorphism panel — standard variant.
```css
background: rgba(14, 14, 20, 0.82);
backdrop-filter: blur(28px) saturate(1.4);
border: 1px solid var(--border-2);
border-radius: 12px;
box-shadow: 0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04);
```

### `.glass-bright`
Enhanced glassmorphism — used for primary panels (HUD, PurchasePanel).
```css
background: rgba(14, 14, 20, 0.88);
backdrop-filter: blur(40px) saturate(1.6);
border: 1px solid var(--border-bright);
box-shadow: 0 12px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(212,175,100,0.08), inset 0 1px 0 rgba(212,175,100,0.06);
```

### `.btn-neon`
Primary CTA button.
```css
background: linear-gradient(135deg, var(--accent), #b8943e);
color: #08080c;
font-weight: 700;
text-transform: uppercase;
letter-spacing: 0.1em;
border-radius: 8px;
padding: 10px 20px;
```
Hover: `translateY(-1px)`, brighter glow.
Active: `translateY(0)`.

### `.btn-ghost`
Secondary button.
```css
background: transparent;
border: 1px solid var(--border-2);
color: var(--muted);
```
Hover: `background: var(--surface-2)`, text becomes `var(--text)`.

### `.pulse-dot`
Animated status indicator (used in HUD logo).
```css
width: 7px;
height: 7px;
border-radius: 50%;
background: var(--green);
```
After pseudo-element: ring pulse animation (scale 1→2.5, opacity 1→0, 2.4s infinite).

### `.blink`
Step-function opacity blink.
```css
animation: blink 1s steps(1) infinite;
/* keyframes: 0%/100% opacity 1, 50% opacity 0 */
```

### `.accent`
```css
color: var(--accent);
```

### `.accent-dim`
```css
color: var(--accent-dim);
```

### `.muted`
```css
color: var(--muted);
```

---

## Animations

All defined as `@keyframes` in `index.css`.

| Name | Duration | Timing | Usage |
|------|----------|--------|-------|
| `introIn` | 0.5s | cubic-bezier(0.16,1,0.3,1) | Intro overlay entrance (translateY + opacity) |
| `panelIn` | 0.24s | cubic-bezier(0.16,1,0.3,1) | Right panel slide-in (translateX + scale) |
| `panelUp` | 0.22s | cubic-bezier(0.16,1,0.3,1) | Leaderboard drawer open (translateY + scale) |
| `fadeUp` | 0.15s | ease-out | Tooltip entrance (translateY + opacity) |
| `ticker-slide` | 90s | linear, infinite | LiveFeed horizontal scroll (translateX 0 → -50%) |
| `spin` | 1s | linear, infinite | Payment confirming spinner (rotate 360°) |
| `popIn` | 0.35s | cubic-bezier(0.34,1.56,0.64,1) | Confirmed checkmark (scale 0→1, with bounce) |
| `pulse` | 2.4s | ease-out, infinite | HUD pulse dot ring |
| `blink` | 1s | steps(1), infinite | Countdown timer warning |

---

## Map Styling

MapLibre GL canvas overrides in `index.css`:

```css
.maplibregl-canvas { outline: none; }
```

Attribution and logo elements hidden:
```css
.maplibregl-ctrl-attrib,
.maplibregl-ctrl-logo { display: none !important; }
```

Control buttons (zoom +/-) restyled to glass theme:
```css
.maplibregl-ctrl-group {
  background: rgba(14,14,20,0.82);
  border: 1px solid var(--border-2);
  backdrop-filter: blur(20px);
}
.maplibregl-ctrl button { color: var(--muted); }
.maplibregl-ctrl button:hover { color: var(--accent); }
```

### OSM Raster Layer Paint
Applied via MapLibre layer paint properties (not CSS):
```js
'raster-saturation': -0.8,    // near-grayscale
'raster-brightness-min': 0,
'raster-brightness-max': 0.35  // darkened
```

---

## Layout System

- **Full viewport:** `html, body, #root` are `width/height: 100%`, `overflow: hidden`
- **Map layer:** `position: absolute; inset: 0` (fills viewport behind everything)
- **UI panels:** `position: fixed` with specific `top/right/bottom/left` placement
- **Z-index stack:** Map (0) → Vignette (5) → UI panels (10) → Tooltip (20) → Modal (50)
- **Vignette:** `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.7) 100%)` — darkens map edges
