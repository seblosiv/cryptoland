"""
Security invariants for the native-wallet purchase path (CLAUDE.md §4).

Every test here is a way someone could take a tile without paying for it, or
pay for one and not get it. These are behavioural tests against a real app and
a real database — not source greps — because the thing being protected is money.

    server/.venv/bin/python -m pytest server/tests/test_chain_pay.py -q
"""
import os
import sys
import tempfile
import time
from pathlib import Path

import pytest

_SERVER = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_SERVER))

# Must be set before main is imported: it reads them at module scope.
_TMP_DB = Path(tempfile.mkdtemp(prefix="cryptoland-test-")) / "test.db"
os.environ["CRYPTOLAND_DB"] = str(_TMP_DB)
os.environ["CRYPTOLAND_CHAIN"] = "base"
os.environ["CRYPTOLAND_TREASURY_BASE"] = "0x000000000000000000000000000000000000BEEF"

from fastapi.testclient import TestClient  # noqa: E402

import chain_pay as _chain_pay  # noqa: E402
import main  # noqa: E402

TREASURY = os.environ["CRYPTOLAND_TREASURY_BASE"]
TILE_TX, TILE_TY = 8000, 5000
TILE_KEY = f"{TILE_TX}:{TILE_TY}"


@pytest.fixture(scope="module")
def client():
    # The real limits (20/min on /chain/quote) are deliberate in production but
    # would make this file fail on test count rather than on behaviour.
    main.limiter.enabled = False
    with TestClient(main.app) as c:
        yield c
    main.limiter.enabled = True


def _register(client, email):
    r = client.post("/auth/register", json={"email": email, "password": "correct horse battery"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def alice(client):
    return _register(client, "alice@example.com")


@pytest.fixture(scope="module")
def bob(client):
    return _register(client, "bob@example.com")


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def _no_network(monkeypatch):
    """
    Pin the token price. Without this the tests hit CoinGecko, which is slow,
    rate-limited and would make the assertions depend on the market.
    """
    async def fake_rate(chain, session=None):
        return 2000.0  # $2000 per ETH — round numbers make the maths checkable
    monkeypatch.setattr(_chain_pay, "usd_per_native", fake_rate)


def _stub_verify(monkeypatch, **kw):
    """Replace on-chain verification with a controlled result."""
    async def fake(chain, tx_hash, treasury, min_amount, session=None):
        return _chain_pay.PaymentProof(**kw)
    monkeypatch.setattr(_chain_pay, "verify_payment", fake)


def _quote(client, token, tx=TILE_TX, ty=TILE_TY, **over):
    body = {"tx": tx, "ty": ty, "tile_key": f"{tx}:{ty}", "country": "Germany"}
    body.update(over)
    return client.post("/chain/quote", json=body, headers=_auth(token))


# ── quoting ──────────────────────────────────────────────────────────────────

def test_pay_info_reports_enabled_for_a_configured_chain(client):
    info = client.get("/chain/pay-info").json()
    assert info["enabled"] is True
    assert info["symbol"] == "ETH"
    assert info["chain"] == "base"


def test_quote_requires_authentication(client):
    r = client.post("/chain/quote", json={"tx": 1, "ty": 1, "tile_key": "1:1"})
    assert r.status_code == 401


def test_quote_rejects_out_of_grid_coordinates(client, alice):
    for tx, ty in [(-1, 0), (0, -1), (16384, 0), (0, 16384), (99999, 99999)]:
        r = _quote(client, alice, tx=tx, ty=ty)
        assert r.status_code == 400, f"{tx}:{ty} was accepted"


def test_quote_rejects_tile_key_that_disagrees_with_coordinates(client, alice):
    """Otherwise the price is computed for one tile and written to another."""
    r = client.post("/chain/quote",
                    json={"tx": 10, "ty": 10, "tile_key": "9999:9999"},
                    headers=_auth(alice))
    assert r.status_code == 400


def test_price_is_server_computed_and_ignores_the_client(client, alice):
    """
    The whole point of this path. /np/payment takes `usd_amount` from the
    browser; this must not. Sending price fields must change nothing.
    """
    from tile_pricing import tile_base_price

    honest = _quote(client, alice).json()
    attack = _quote(client, alice, price_usd=0.01, usd_amount=0.01,
                    native_amount="1", price=0.01).json()

    assert honest["price_usd"] == attack["price_usd"]
    assert honest["native_amount"] == attack["native_amount"]
    # And it equals the real price for that tile, not something invented.
    assert abs(honest["price_usd"] - tile_base_price(TILE_TX, TILE_TY)) < 0.01


def test_quote_converts_usd_to_base_units_exactly(client, alice):
    q = _quote(client, alice).json()
    expected_eth = q["price_usd"] / 2000.0
    assert q["symbol"] == "ETH"
    assert q["decimals"] == 18
    # native_amount is a STRING: 18-decimal wei does not survive a JSON number.
    assert isinstance(q["native_amount"], str)
    assert abs(int(q["native_amount"]) / 10**18 - expected_eth) < 1e-12
    assert q["treasury"] == TREASURY


def test_quote_refuses_a_tile_that_is_already_owned(client, alice, monkeypatch):
    _stub_verify(monkeypatch, ok=True, paid=10**30, payer="0xabc")
    q = _quote(client, alice, tx=100, ty=100).json()
    assert client.post("/chain/verify",
                       json={"quote_id": q["quote_id"], "tx_hash": "0xowned"},
                       headers=_auth(alice)).status_code == 200
    r = _quote(client, alice, tx=100, ty=100)
    assert r.status_code == 409


# ── verification ─────────────────────────────────────────────────────────────

def test_verify_requires_authentication(client, alice):
    q = _quote(client, alice, tx=200, ty=200).json()
    r = client.post("/chain/verify", json={"quote_id": q["quote_id"], "tx_hash": "0x1"})
    assert r.status_code == 401


def test_another_user_cannot_settle_your_quote(client, alice, bob, monkeypatch):
    """Otherwise Bob's payment could claim a tile into Alice's name, or worse."""
    _stub_verify(monkeypatch, ok=True, paid=10**30, payer="0xabc")
    q = _quote(client, alice, tx=201, ty=201).json()
    r = client.post("/chain/verify",
                    json={"quote_id": q["quote_id"], "tx_hash": "0xbob"},
                    headers=_auth(bob))
    assert r.status_code == 403


def test_underpayment_is_rejected(client, alice, monkeypatch):
    _stub_verify(monkeypatch, ok=False, error="Underpaid: received 0.001 ETH", paid=10**15)
    q = _quote(client, alice, tx=202, ty=202).json()
    r = client.post("/chain/verify",
                    json={"quote_id": q["quote_id"], "tx_hash": "0xshort"},
                    headers=_auth(alice))
    assert r.status_code == 402
    # And the tile must NOT have been written.
    assert client.get(f"/blocks/202:202").status_code in (404, 200)
    got = client.get("/blocks/202:202")
    if got.status_code == 200:
        assert not got.json(), "tile was written despite underpayment"


def test_a_confirming_transaction_returns_202_not_an_error(client, alice, monkeypatch):
    """A slow chain must read as 'wait', never as 'you did not pay'."""
    _stub_verify(monkeypatch, ok=False, pending=True, error="Confirming (1/3)", confirmations=1)
    q = _quote(client, alice, tx=203, ty=203).json()
    r = client.post("/chain/verify",
                    json={"quote_id": q["quote_id"], "tx_hash": "0xslow"},
                    headers=_auth(alice))
    assert r.status_code == 202
    assert r.json()["pending"] is True


def test_successful_verification_writes_the_tile_at_the_server_price(client, alice, monkeypatch):
    _stub_verify(monkeypatch, ok=True, paid=10**30, payer="0xdeadbeef", confirmations=5)
    q = _quote(client, alice, tx=204, ty=204).json()
    r = client.post("/chain/verify",
                    json={"quote_id": q["quote_id"], "tx_hash": "0xgood"},
                    headers=_auth(alice))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["tile_key"] == "204:204"
    assert abs(body["price"] - q["price_usd"]) < 0.01
    assert body["chain"] == "Base"
    assert body["tx_hash"] == "0xgood"


def test_a_quote_can_only_be_settled_once(client, alice, monkeypatch):
    """Replaying one payment must not mint a second tile."""
    _stub_verify(monkeypatch, ok=True, paid=10**30, payer="0xabc")
    q = _quote(client, alice, tx=205, ty=205).json()
    first = client.post("/chain/verify",
                        json={"quote_id": q["quote_id"], "tx_hash": "0xonce"},
                        headers=_auth(alice))
    assert first.status_code == 200
    again = client.post("/chain/verify",
                        json={"quote_id": q["quote_id"], "tx_hash": "0xonce"},
                        headers=_auth(alice))
    assert again.status_code == 409


def test_one_transaction_cannot_pay_for_two_tiles(client, alice, monkeypatch):
    """
    The attack this blocks: open two quotes, pay once, settle both. The unique
    index on (chain, tx_hash) is the guarantee.
    """
    _stub_verify(monkeypatch, ok=True, paid=10**30, payer="0xabc")
    q1 = _quote(client, alice, tx=206, ty=206).json()
    q2 = _quote(client, alice, tx=207, ty=207).json()
    assert client.post("/chain/verify",
                       json={"quote_id": q1["quote_id"], "tx_hash": "0xreused"},
                       headers=_auth(alice)).status_code == 200
    r = client.post("/chain/verify",
                    json={"quote_id": q2["quote_id"], "tx_hash": "0xreused"},
                    headers=_auth(alice))
    assert r.status_code == 409, "the same payment settled two tiles"


def test_expired_quotes_are_refused(client, alice, monkeypatch):
    """A stale quote is a stale token price; honouring it is a mispriced sale."""
    _stub_verify(monkeypatch, ok=True, paid=10**30, payer="0xabc")
    q = _quote(client, alice, tx=208, ty=208).json()
    import aiosqlite, asyncio

    async def expire():
        async with aiosqlite.connect(main.DB_PATH) as db:
            await db.execute("UPDATE chain_quotes SET expires_at = ? WHERE quote_id = ?",
                             (int(time.time()) - 10, q["quote_id"]))
            await db.commit()
    # TestClient runs its own loop; use a fresh one for this out-of-band write.
    asyncio.run(expire())

    r = client.post("/chain/verify",
                    json={"quote_id": q["quote_id"], "tx_hash": "0xexpired"},
                    headers=_auth(alice))
    assert r.status_code == 410


def test_unknown_quote_is_404(client, alice):
    r = client.post("/chain/verify",
                    json={"quote_id": "0" * 32, "tx_hash": "0xnope"},
                    headers=_auth(alice))
    assert r.status_code == 404


# ── treasury configuration ───────────────────────────────────────────────────

def test_treasury_comes_from_env_and_falls_back_by_family(monkeypatch):
    from chain_registry import get_chain
    base = get_chain("base")

    monkeypatch.delenv("CRYPTOLAND_TREASURY_BASE", raising=False)
    monkeypatch.setenv("CRYPTOLAND_TREASURY_EVM", "0xfamily")
    assert _chain_pay.treasury_for(base) == "0xfamily"

    monkeypatch.setenv("CRYPTOLAND_TREASURY_BASE", "0xspecific")
    assert _chain_pay.treasury_for(base) == "0xspecific", "per-chain must win"

    monkeypatch.delenv("CRYPTOLAND_TREASURY_BASE", raising=False)
    monkeypatch.delenv("CRYPTOLAND_TREASURY_EVM", raising=False)
    monkeypatch.delenv("CRYPTOLAND_TREASURY", raising=False)
    assert _chain_pay.treasury_for(base) is None, "must not invent an address"


def test_dead_rpcs_report_pending_not_rejection():
    """
    The single most damaging way to get this wrong.

    Public RPCs rot constantly — scripts/check-rpcs.mjs exists because of it. If
    an unreachable node made verification return "rejected", a buyer whose money
    is already on-chain would be told they never paid. It must read as "ask
    again later" so the poll keeps going and the tile eventually settles.
    """
    import asyncio
    import dataclasses

    import aiohttp

    from chain_registry import get_chain

    dead = dataclasses.replace(
        get_chain("base"),
        rpc_url="http://127.0.0.1:9/nope",       # discard port — refuses instantly
        rpc_fallback="http://127.0.0.1:9/nope2",
    )

    async def run():
        async with aiohttp.ClientSession() as session:
            return await _chain_pay.verify_evm(dead, "0x" + "ab" * 32, "0xbeef", 1, session)

    proof = asyncio.run(run())
    assert proof.pending is True
    assert proof.ok is False


def test_gasless_and_halted_chains_do_not_accept_native_payment():
    """SKALE's sFUEL is valueless; charging it would be charging nothing."""
    from chain_registry import get_chain
    assert get_chain("skale").native_pay is False
    assert get_chain("moonbeam").native_pay is False
    assert get_chain("base").native_pay is True
