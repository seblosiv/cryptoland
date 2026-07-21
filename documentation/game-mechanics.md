# Game Mechanics

## World Grid

The entire world map is divided into a uniform tile grid at **Web Mercator zoom level 14**.

| Property | Value |
|----------|-------|
| Zoom level | 14 |
| Grid dimensions | 16384 × 16384 tiles |
| Total tiles | 268,435,456 |
| Tile size at equator | ~2.4 km × 2.4 km |
| Tile size near poles | Smaller (Mercator distortion) |
| Coordinate system | WGS-84 (longitude/latitude) |

Tiles are only purchasable at zoom 14. The map can be explored at any zoom level (2–18), but the purchase grid is fixed. The tile grid overlay is only shown at map zoom ≥ 12 (tiles are too small to render below that threshold).

### Tile Addressing

Each tile is identified by its `(tx, ty)` integer coordinates in the Web Mercator grid:
- `tx`: column, `0` to `16383` (left = west, right = east)
- `ty`: row, `0` to `16383` (top = north, bottom = south)

**Tile key:** canonical string `"tx:ty"` — used as DB primary key and store Map key.

### Coordinate Conversion

**World coordinates → tile:** `lngLatToTile(lng, lat, 14)`

Uses standard Web Mercator projection:
```
x = floor((lng + 180) / 360 × 16384)
sinLat = sin(lat × π / 180)
y = floor((1 - ln((sinLat+1) / (1-sinLat)) / 2π) / 2 × 16384)
```

**Tile → world coordinates:** `tileNW(tx, ty, 14)` returns northwest corner.

---

## Pricing Model

Every tile has a unique deterministic base price plus a global scarcity multiplier.

### Base Price

```
hash = (tx × 1619 + ty × 2971) mod 1000 / 1000    [0.0 – 1.0]
base = 1 + hash × 4                                [$1.00 – $5.00]
bonus = 0.8 if tile latitude is 25°N – 60°N        [settled land premium]
basePrice = base + bonus                            [$1.00 – $5.80]
```

The `25°N–60°N` latitude band covers most of North America, Europe, China, Japan — densely populated regions cost more.

### Scarcity Multiplier

As more tiles are purchased globally, all remaining tiles become more expensive:

```
multiplier = 1 + (soldCount / TOTAL_TILES) × 3
```

- At 0% sold: multiplier = 1.0 (full supply)
- At 50% sold: multiplier = 2.5
- At 100% sold: multiplier = 4.0 (maximum scarcity)

### Final Price

```
finalPrice = basePrice × multiplier
```

This is the USD price shown in `PurchasePanel` and used in `PaymentModal`.

---

## Ownership Rules

- Each tile has exactly one owner (or no owner — "available").
- A tile can only be purchased if it has no current owner.
- Re-purchasing your own tile updates the record (idempotent — useful for adding images/labels).
- Attempting to purchase another user's tile returns `409 Conflict` from the API.

---

## Purchase Flow

The purchase flow is a multi-step modal that simulates blockchain payment.

```
Step 1: select     — Choose payment currency
Step 2: payment    — Display QR code, countdown timer, amount
Step 3: confirming — Waiting for "blockchain" confirmation
Step 4: confirmed  — Success; tile registered in DB
        error      — Any failure at steps 2–3
```

### Step 1 — Currency Selection

User selects one of 6 cryptocurrencies. The USD price of the tile is shown. Clicking "Continue" calls `startPayment()`.

### Step 2 — Payment

`startPayment()` computes:
- USD price (base × scarcity at time of purchase)
- Crypto amount: `usdPrice / RATES[currency].rate`
- Payment address (hardcoded per currency for simulation)
- QR code URI (e.g., `ethereum:0xABC?amount=0.001234`)

A 30-minute countdown starts (`paymentTimeLeft = 1800`). Timer ticks every second.

If timer reaches 0: step transitions to `'error'` with "Payment expired" message.

The "Simulate Confirmation" button skips real blockchain verification and immediately moves to step 3.

### Step 3 — Confirming

A 2-second artificial delay (simulated blockchain latency). Fires `POST /blocks`.

### Step 4 — Confirmed

Backend returns saved block. Store updates:
- `blocks` Map gets new entry
- `stats` refreshed from server

---

## Cryptocurrency Support

| Currency | Symbol | Rate (USD) | Decimals |
|----------|--------|-----------|----------|
| Bitcoin | BTC | $65,000 | 8 |
| Ethereum | ETH | $3,200 | 6 |
| Solana | SOL | $180 | 4 |
| Tether | USDT | $1 | 2 |
| BNB | BNB | $580 | 4 |
| Polygon | MATIC | $0.90 | 2 |

Rates are hardcoded constants. Payment addresses are static placeholders (simulation only — no real transactions occur).

---

## Visual Ownership

Owned tiles appear on the map as colored polygons:
- Fill color = owner's assigned hex color (semi-transparent)
- Border = same color (full opacity)
- Hover = gold highlight
- Selected = bright gold highlight

Blocks with an `imageUrl` render an additional DOM marker (positioned at tile center) showing the image and optional label. Markers scale with zoom and fade out below zoom 8.

---

## Leaderboard

The `Sidebar` shows a top-10 city leaderboard based on block concentration. Currently hardcoded with seeded data values. Cities are ranked by total blocks purchased in their area.

---

## Live Feed

The `LiveFeed` ticker shows a continuously scrolling stream of recent purchases. It initializes from real DB data (top 40 blocks) and augments with simulated entries every 3–8 seconds to create the impression of ongoing market activity.
