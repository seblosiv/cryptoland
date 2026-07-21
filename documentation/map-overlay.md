# Map Block Overlay — Design & Implementation

## Purpose

This document describes how purchased block images are rendered on the map.
It exists to prevent future regressions from well-intentioned refactors.

---

## The Problem with `maplibregl.Marker`

Early versions used `new maplibregl.Marker({ element: el })` to place block images on the map.
This caused blocks to visibly "float" away from their tiles during zoom animation.

**Root cause:** MapLibre's `Marker._update()` — which sets the element's `style.transform` to
reposition it — only fires on `move` and `moveend` events, not on every animation frame.
During smooth zoom, MapLibre animates the camera every RAF frame internally, but Marker elements
only reposition at event boundaries. The result: 1–2 frame lag where the image drifts off its tile.

**This cannot be fixed** by hooking `render` and changing `width`/`height` externally, because
the `translate(x, y)` positioning is owned and overwritten by `Marker._update()` on its own schedule.

---

## The Solution: Custom DOM Overlay

### DOM Structure

```
<div id="root">                          React root
  <div style="position:absolute;inset:0"> Map container (containerRef)
    <canvas .../>                         MapLibre GL canvas  (added by MapLibre)
    <div.maplibregl-control-container/>   MapLibre controls   (added by MapLibre)
    <div style="position:absolute;inset:0;pointer-events:none">  ← overlay (overlayRef)
      <div data-key="602:770" style="position:absolute;top:0;left:0;..."/>  block A
      <div data-key="603:769" style="position:absolute;top:0;left:0;..."/>  block B
      ...
    </div>
  </div>
</div>
```

The overlay div is appended **inside `map.on('load')`**, after MapLibre has already appended
its canvas and controls. This guarantees it sits on top in the stacking order without needing
any z-index hacks.

### Positioning Logic

`positionOverlayEls(map)` is registered on MapLibre's `render` event:

```js
map.on('render', () => positionOverlayEls(map))
```

MapLibre fires `render` on every animation frame during zoom/pan. Inside `positionOverlayEls`:

```js
const p1 = map.project([nwLng, nwLat])   // NW corner → pixel {x, y}
const p2 = map.project([seLng, seLat])   // SE corner → pixel {x, y}
el.style.transform = `translate(${p1.x}px, ${p1.y}px)`
el.style.width     = `${p2.x - p1.x}px`
el.style.height    = `${p2.y - p1.y}px`
```

Because this runs inside the same RAF cycle as MapLibre's paint, the block divs are always
exactly aligned with their tiles — no lag, no float.

### Geographic Coordinates Pre-Computed

Each block's NW and SE corner coordinates are computed **once** in `syncOverlayEls` when the
element is created, and stored in `blocksDataRef`:

```js
const nw = tileNW(block.tx,     block.ty,     PURCHASE_ZOOM)
const se = tileNW(block.tx + 1, block.ty + 1, PURCHASE_ZOOM)
blocksDataRef.current.set(block.key, { el, nwLng: nw.lng, nwLat: nw.lat, seLng: se.lng, seLat: se.lat, sig })
```

`positionOverlayEls` reads from `blocksDataRef` directly — no tile math on every frame.

---

## Scope Rule — The Most Important Thing

The overlay `<div>` is created as a local `const overlay` inside `map.on('load', () => { ... })`.
It is immediately stored in `overlayRef.current`.

```js
map.on('load', () => {
  const overlay = document.createElement('div')
  // ...
  containerRef.current.appendChild(overlay)
  overlayRef.current = overlay   // ← stored in ref immediately
  // ...
})
```

**The cleanup function runs outside this callback scope.** `overlay` is not accessible there.
Always use `overlayRef.current` in cleanup:

```js
return () => {
  overlayRef.current?.remove()   // ✅ correct — ref is always in scope
  // overlay.remove()            // ❌ wrong — overlay is undefined here (out of scope)
}
```

Violating this rule caused a full black-screen crash (the app rendered nothing) because
the cleanup threw a ReferenceError during React's unmount phase.

---

## What NOT To Do

| Action | Why it breaks |
|--------|--------------|
| Replace with `maplibregl.Marker` | Floating blocks during zoom (Marker._update lag) |
| Call `positionOverlayEls` only on `zoom`/`move` events | Same lag during animation |
| Append overlay before `map.on('load')` | Overlay ends up behind the canvas (invisible) |
| Reference local `overlay` variable in cleanup | ReferenceError → black screen |
| Use `map.project()` outside `render` handler | Positions are one frame stale during animation |

---

## Updating Blocks

When the Zustand store's `blocks` map changes (new purchase, page load):

1. `syncOverlayEls(blocks)` — diff against `blocksDataRef`, create/remove DOM elements
2. `positionOverlayEls(map)` — immediate positioning pass for new elements
3. Subsequent frames: `render` event keeps everything aligned automatically

Signature (`sig`) comparison prevents unnecessary DOM churn:
```js
const sig = `${block.imageUrl}|${block.color}|${block.owner}|${block.label}`
if (existing && existing.sig === sig) continue  // skip — nothing changed
```

---

## Fade / Visibility

Blocks fade in as they become large enough to show content:

| Tile pixel width | Opacity |
|-----------------|---------|
| < 6px | 0 (hidden) |
| 6–20px | linear fade (0 → 1) |
| > 20px | 1 (fully visible) |

This means images are visible from approximately zoom 8 onwards.
