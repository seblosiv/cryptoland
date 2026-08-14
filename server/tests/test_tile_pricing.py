"""
The server's price must equal the browser's price, tile for tile.

server/tile_pricing.py is generated from src/lib/tiles.js. If someone edits the
JS pricing model and forgets `node scripts/gen-tile-pricing.mjs`, the map quotes
one number and POST /chain/quote charges another — the user signs a wallet
transaction for a price they were never shown. That is the failure this catches.

Vectors are JS-computed (scripts/gen-tile-pricing.mjs), so this is a genuine
cross-language parity check, not the Python grading its own homework.

Runs under pytest, or standalone:  python3 server/tests/test_tile_pricing.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from tile_pricing import (  # noqa: E402
    GRID_N,
    MIN_TILE_PRICE_USD,
    TOTAL_TILES,
    geo_region,
    scarcity_multiplier,
    tile_base_price,
    tile_nw,
)

_VECTORS_PATH = os.path.join(os.path.dirname(__file__), "tile_pricing_vectors.json")

with open(_VECTORS_PATH) as fh:
    _DATA = json.load(fh)


def test_constants_match_the_js():
    assert _DATA["min_tile_price_usd"] == MIN_TILE_PRICE_USD
    assert _DATA["grid_n"] == GRID_N
    assert TOTAL_TILES == GRID_N * GRID_N


def test_price_matches_js_on_every_vector():
    """Every generated vector, to the cent."""
    mismatches = []
    for v in _DATA["vectors"]:
        got = tile_base_price(v["tx"], v["ty"])
        if abs(got - v["price"]) > 0.005:
            mismatches.append(
                f'  {v["tx"]}:{v["ty"]} ({v["note"]}) js={v["price"]} py={got}'
            )
    assert not mismatches, (
        "server/tile_pricing.py disagrees with src/lib/tiles.js on "
        f'{len(mismatches)}/{len(_DATA["vectors"])} tiles. Re-run '
        "`node scripts/gen-tile-pricing.mjs`.\n" + "\n".join(mismatches[:20])
    )


def test_tile_nw_matches_js_geography():
    """A wrong lng/lat lands the tile in the wrong pricing region entirely."""
    for v in _DATA["vectors"]:
        lng, lat = tile_nw(v["tx"], v["ty"])
        assert abs(lng - v["lng"]) < 1e-9, f'{v["tx"]}:{v["ty"]} lng'
        assert abs(lat - v["lat"]) < 1e-9, f'{v["tx"]}:{v["ty"]} lat'


def test_price_never_below_the_floor():
    """
    The floor is what keeps a purchase above every chain's dust limit and above
    NOWPayments' minimum. Ocean tiles are the ones that would breach it.
    """
    for v in _DATA["vectors"]:
        assert tile_base_price(v["tx"], v["ty"]) >= MIN_TILE_PRICE_USD


def test_price_is_deterministic():
    """Quote, wallet round-trip, then verify — all three must agree."""
    for tx, ty in [(0, 0), (8192, 8192), (16383, 16383), (4821, 2733)]:
        assert tile_base_price(tx, ty) == tile_base_price(tx, ty)


def test_ocean_falls_back_to_the_default_region():
    # Mid-Pacific, far from any classified region.
    assert geo_region(-150.0, 5.0) == (12, 6)


def test_scarcity_scales_from_1x_to_4x():
    assert scarcity_multiplier(0) == 1.0
    assert abs(scarcity_multiplier(TOTAL_TILES) - 4.0) < 1e-9
    assert scarcity_multiplier(-5) == 1.0  # never negative


if __name__ == "__main__":
    failures = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"  ✓ {name}")
            except AssertionError as exc:
                failures += 1
                print(f"  ✗ {name}\n{exc}")
    total = len([n for n in globals() if n.startswith("test_")])
    print(f"\n{total - failures}/{total} passed")
    sys.exit(1 if failures else 0)
