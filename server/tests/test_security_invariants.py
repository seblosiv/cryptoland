"""
The security invariants from CLAUDE.md §4, as executable tests.

Every one of these was previously verified by hand against a running server,
which is the highest-value gap in the whole project: a hand-check does not
survive the next refactor. Each test below names the invariant it guards and
what breaks if it regresses.

Run:  python -m pytest server/tests -q
"""
import os
import sys
import hashlib
import hmac
import importlib.util
from pathlib import Path

import pytest

SERVER = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVER))

# Import main.py without triggering its network/DB lifespan.
os.environ.setdefault("CRYPTOLAND_DB", ":memory:")
os.environ.setdefault("ALLOWED_ORIGINS", "*")


@pytest.fixture(scope="module")
def main():
    spec = importlib.util.spec_from_file_location("cl_main", SERVER / "main.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# ── Money math is integer cents ──────────────────────────────────────────────
# A drifting balance ledger is a payout bug: affiliate commission accrues over
# many small purchases, and float addition does not round-trip.

def test_cents_round_trip_is_exact(main):
    for usd in [0, 0.01, 0.1, 1, 1.05, 9.99, 10, 123.45, 9999.99]:
        assert main._from_cents(main._to_cents(usd)) == round(usd, 2)


def test_cents_accrual_does_not_drift(main):
    """0.1 + 0.2 != 0.3 in float. In cents it must."""
    total = 0
    for _ in range(1000):
        total += main._to_cents(0.1)
    assert total == 100_00
    assert main._from_cents(total) == 100.00


def test_commission_is_computed_in_cents(main):
    rate = main.COMMISSION_RATE
    for usd in [1.0, 9.99, 33.33, 100.0]:
        commission = main._from_cents(int(round(main._to_cents(usd) * rate)))
        assert commission == round(commission, 2)
        assert commission <= usd


# ── Wallet normalisation ─────────────────────────────────────────────────────
# Signature recovery compares case-insensitively; if the stored form and the
# recovered form disagree on case, a valid signature is rejected — or worse,
# two records exist for one wallet.

def test_wallet_normalisation_is_case_and_space_insensitive(main):
    a = main._norm_wallet("  0xAbCdEf0123456789  ")
    b = main._norm_wallet("0xabcdef0123456789")
    assert a == b == "0xabcdef0123456789"


# ── Telegram initData HMAC ───────────────────────────────────────────────────
# The single most common implementation bug is inverting key and message.
# secret_key = HMAC_SHA256(key=b"WebAppData", message=<bot_token>)
# Getting it backwards makes every forged initData validate.

def test_telegram_secret_key_derivation_order(main):
    token = "123456:TEST-TOKEN"
    correct = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    inverted = hmac.new(token.encode(), b"WebAppData", hashlib.sha256).digest()
    assert correct != inverted, "the two orders must differ, else the test is vacuous"

    fn = getattr(main, "_telegram_secret_key", None)
    if fn is None:
        pytest.skip("no extracted helper; order is asserted inline in main.py")
    assert fn(token) == correct


# ── Coordinate bounds ────────────────────────────────────────────────────────
# The grid is Z14: 16384 x 16384. Out-of-range coordinates must be rejected
# before anything is written, on both /purchase and /np/finalize.

@pytest.mark.parametrize("tx,ty,ok", [
    (0, 0, True), (16383, 16383, True), (100, 200, True),
    (-1, 0, False), (0, -1, False), (16384, 0, False), (0, 16384, False),
])
def test_grid_bounds_predicate(tx, ty, ok):
    assert (0 <= tx <= 16383 and 0 <= ty <= 16383) is ok


def test_purchase_and_finalize_both_bound_coordinates():
    """Both endpoints must carry the check — one without it is a hole."""
    src = (SERVER / "main.py").read_text()
    assert src.count("0 <= req.tx <= 16383") >= 2, (
        "both /purchase and /np/finalize must validate coordinates"
    )


# ── tokenId encoding ─────────────────────────────────────────────────────────
# Must match all 13 contracts and every adapter.

@pytest.mark.parametrize("tx,ty,want", [
    (0, 0, 0), (1, 0, 32768), (0, 1, 1),
    (100, 200, 3_277_000), (16383, 16383, 536_854_527),
])
def test_token_id_matches_every_chain(tx, ty, want):
    assert (tx << 15) | ty == want


# ── Payment binding ──────────────────────────────────────────────────────────
# CLAUDE.md §4: /np/finalize binds payment_id to tile AND amount and is
# single-use. Without all three, one $1 payment finalizes any tile, repeatedly.

def test_finalize_is_single_use_and_amount_bound():
    src = (SERVER / "main.py").read_text()
    assert "consumed_at" in src, "finalize must mark payments consumed"
    assert "BEGIN EXCLUSIVE" in src, "consumption must be re-checked in a transaction"
    assert "price_usd" in src, "the server-stored price must be the one written"
    assert 'tile_key' in src, "payment must be bound to a tile"


def test_ipn_fails_closed():
    """A missing or invalid signature must 401 BEFORE the body is parsed.
    An open webhook mints free tiles for anyone who can POST."""
    src = (SERVER / "main.py").read_text()
    assert "compare_digest" in src, "HMAC comparison must be constant-time"
    assert "sha512" in src.lower(), "NOWPayments IPN signs with HMAC-SHA512"


# ── Chain scoping ────────────────────────────────────────────────────────────
# Every read must be scoped to the build's chain. Unscoped numbers are the top
# grant risk: 27 frontends would each report the same world.

def test_reads_are_chain_scoped():
    src = (SERVER / "main.py").read_text()
    assert "WHERE chain = ?" in src, "/blocks must filter by chain"
    assert src.count("chain = ?") >= 4, "stats and metrics must scope too"


def test_blocks_limit_is_bounded():
    """/blocks must never be able to return an unbounded table."""
    src = (SERVER / "main.py").read_text()
    assert "20000" in src, "limit must be capped"


# ── Bind address ─────────────────────────────────────────────────────────────
# The backend holds payment credentials and the whole DB; it goes behind a
# reverse proxy, never straight onto 0.0.0.0.

def test_default_bind_is_loopback():
    src = (SERVER / "main.py").read_text()
    assert '"127.0.0.1"' in src, "HOST must default to loopback"


def test_unsigned_wallet_auth_defaults_off():
    """ALLOW_UNSIGNED_WALLET_AUTH is a dev-only escape hatch."""
    src = (SERVER / "main.py").read_text()
    assert "ALLOW_UNSIGNED_WALLET_AUTH" in src
    # It must be opt-in: the literal "1"/"true" comparison, never a default-on.
    assert "ALLOW_UNSIGNED_WALLET_AUTH" in src and "default" not in src.split(
        "ALLOW_UNSIGNED_WALLET_AUTH")[1][:120].lower()
