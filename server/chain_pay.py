"""
chain_pay.py — native-wallet tile purchases.

The user connects a wallet on the chain they are already on, sends the tile's
price in that chain's own token to our treasury, and the server verifies that
transaction on-chain before writing the tile. No NOWPayments, no card, no
bridge — on Base you pay ETH on Base.

── Why payment is a plain transfer and not contract.claimTile() ───────────────
CryptoLandTile.claimTile() exists and works, but it charges a single flat
`tilePriceWei` for every tile on the planet and refunds anything above it
(CryptoLandTile.sol, "Refund any overpayment"). Tiles are not flat-priced —
a Tokyo tile is ~$76 and an ocean tile is $12 — so a flat on-chain price either
sells Tokyo for the ocean price or prices the ocean out of existence. The
deployed contracts also have `tilePriceWei = 0`, which disables claimTile
outright.

A direct transfer to the treasury carries the exact per-tile price, needs no
contract redeployment, and works identically on all 14 adapter families — the
one operation every chain in the world supports. The NFT mint stays a separate
step (contract.mint(), owner/minter-gated) so a chain with no contract deployed
still sells tiles.

── The invariants this module exists to hold (CLAUDE.md §4) ──────────────────
* The price is computed HERE, from tile_pricing.py, never accepted from the
  client. (The NOWPayments path does accept a client `usd_amount`; that is a
  known hole, documented in documentation/backend.md, and deliberately not
  repeated.)
* A quote binds tile + chain + amount + payer + deadline, and is single-use.
* A transaction hash is single-use across the whole table — one payment can
  never settle two tiles.
* Verification reads the chain, not the client: recipient, amount and
  confirmation count all come from an RPC the server chose.
"""
from __future__ import annotations

import asyncio
import os
import secrets
import time
from dataclasses import dataclass
from decimal import Decimal, ROUND_UP
from typing import Optional

import aiohttp

from chain_registry import Chain, get_chain
from tile_pricing import tile_base_price

# ── tunables ─────────────────────────────────────────────────────────────────

# How long a quote is honoured. Long enough to approve in a wallet and have the
# tx land; short enough that a token's USD price cannot drift far. Token prices
# move; a stale quote is a mispriced sale in whichever direction hurts.
QUOTE_TTL_SECONDS = int(os.getenv("CRYPTOLAND_QUOTE_TTL", "900"))  # 15 min

# Accept a payment that is a little short. Wallets round, and some chains
# deduct the fee from the transfer amount. Matches the 95% floor /np/finalize
# already applies to NOWPayments, so both rails behave the same.
MIN_PAYMENT_RATIO = 0.95

# CoinGecko is rate-limited on the free tier and the box runs 32 backends, so
# cache hard. A price this stale is fine: the 5% tolerance above absorbs it.
RATE_CACHE_TTL = int(os.getenv("CRYPTOLAND_RATE_TTL", "120"))

# How far past the TTL a cached rate may still be served when the feed is
# unavailable. 30 x 120s = one hour of feed outage before quoting stops, which
# is the difference between "CoinGecko rate-limited us" and "nobody can buy a
# tile". Token prices rarely move enough in an hour to matter against the 5%
# payment tolerance, and a stale quote is still bounded by QUOTE_TTL_SECONDS.
STALE_RATE_FACTOR = int(os.getenv("CRYPTOLAND_STALE_RATE_FACTOR", "30"))

HTTP_TIMEOUT = aiohttp.ClientTimeout(total=12)
HEADERS = {"User-Agent": "CryptoLand/1.0 (+https://xono.ai)"}


class ChainPayError(Exception):
    """Anything that should surface to the caller as a clean 4xx."""


class _FeedUnavailable(Exception):
    """
    The price feed did not answer usefully (rate limit, 5xx, garbage body).

    Internal and deliberately NOT a ChainPayError: it means "try the cache",
    not "tell the user". Only if the cache is empty or too old does it become a
    ChainPayError the caller sees.
    """


# ── treasury addresses ───────────────────────────────────────────────────────

def treasury_for(chain: Chain) -> Optional[str]:
    """
    Where buyers send money on this chain.

    Read from the environment, never from the client and never from a committed
    file: the client naming its own recipient is the whole attack, and a
    treasury address in git is a treasury address in every fork.

        CRYPTOLAND_TREASURY_BASE=0x...        # per chain, wins
        CRYPTOLAND_TREASURY_EVM=0x...         # per family, covers all 21 EVM chains
        CRYPTOLAND_TREASURY=...               # last resort

    A chain with no treasury configured simply does not offer the native path;
    it is not an error, and the off-chain rail keeps working. That mirrors how a
    blank VITE_CONTRACT_<CHAIN> leaves minting stubbed instead of breaking.
    """
    key = chain.key.upper().replace("-", "_")
    for var in (
        f"CRYPTOLAND_TREASURY_{key}",
        f"CRYPTOLAND_TREASURY_{chain.family.upper()}",
        "CRYPTOLAND_TREASURY",
    ):
        val = (os.getenv(var) or "").strip()
        if val:
            return val
    return None


# ── USD → native token ───────────────────────────────────────────────────────

_rate_cache: dict[str, tuple[float, float]] = {}  # coingecko_id -> (usd, fetched_at)
_rate_lock = asyncio.Lock()


async def usd_per_native(chain: Chain, session: Optional[aiohttp.ClientSession] = None) -> float:
    """
    USD value of one whole native token. Raises rather than guessing: quoting a
    price from a stale or missing rate is how a tile gets sold for a fraction of
    its worth.
    """
    if not chain.coingecko_id:
        raise ChainPayError(f"No price feed configured for {chain.name}")

    now = time.time()
    cached = _rate_cache.get(chain.coingecko_id)
    if cached and now - cached[1] < RATE_CACHE_TTL:
        return cached[0]

    async with _rate_lock:
        # Another coroutine may have filled it while we waited.
        cached = _rate_cache.get(chain.coingecko_id)
        if cached and time.time() - cached[1] < RATE_CACHE_TTL:
            return cached[0]

        url = (
            "https://api.coingecko.com/api/v3/simple/price"
            f"?ids={chain.coingecko_id}&vs_currencies=usd"
        )
        own_session = session is None
        session = session or aiohttp.ClientSession(timeout=HTTP_TIMEOUT)
        try:
            async with session.get(url, headers=HEADERS, timeout=HTTP_TIMEOUT) as r:
                if r.status != 200:
                    # 429 is the one to expect, not the exception: CoinGecko's
                    # free tier is rate-limited per IP, and this box runs 32
                    # backends behind ONE IP, each with its own cache. Treating
                    # an HTTP error as fatal here would refuse to sell a tile
                    # while a perfectly good price sits in the cache — which is
                    # exactly what happened the first time the pre-flight swept
                    # every chain. Fall through to the stale-rate path.
                    raise _FeedUnavailable(f"price feed returned HTTP {r.status}")
                data = await r.json()
            rate = float(data.get(chain.coingecko_id, {}).get("usd") or 0)
        except Exception as exc:  # rate limit, network, JSON — all the same here
            # Serve a stale rate rather than blocking a sale outright, but only
            # for a bounded window, then fail honestly. The 5% payment tolerance
            # absorbs the drift.
            if cached and time.time() - cached[1] < RATE_CACHE_TTL * STALE_RATE_FACTOR:
                age = int(time.time() - cached[1])
                print(f"[ChainPay] {chain.symbol}: {exc}; using rate cached {age}s ago")
                return cached[0]
            raise ChainPayError(f"Could not price {chain.symbol}: {exc}") from exc
        finally:
            if own_session:
                await session.close()

        if rate <= 0:
            raise ChainPayError(f"Price feed gave no usable rate for {chain.symbol}")

        _rate_cache[chain.coingecko_id] = (rate, time.time())
        return rate


def to_base_units(amount_tokens: float, decimals: int) -> int:
    """
    Whole tokens -> the chain's integer base unit (wei, lamport, drop…).

    Must go through Decimal(str(x)), and the two obvious shortcuts are both
    wrong at 18 decimals:

        int(0.1 * 10**18)      -> float64 multiply, loses the low digits
        f"{0.1:.18f}"          -> 0.100000000000000006, because that IS the
                                  float; formatting to full width prints the
                                  representation error rather than hiding it

    str(0.1) gives Python's shortest round-tripping repr, "0.1", so
    Decimal(str(x)) recovers the number the user actually meant.

    Rounds UP: the result is what we ask a buyer to send, and rounding down
    could quote fractionally under the tile's price. The bias is at most one
    base unit — a single wei — so it costs the buyer nothing real.
    """
    if amount_tokens <= 0:
        raise ChainPayError("Refusing to quote a non-positive amount")
    scaled = Decimal(str(amount_tokens)) * (Decimal(10) ** decimals)
    return int(scaled.to_integral_value(rounding=ROUND_UP))


def from_base_units(amount: int, decimals: int) -> float:
    return amount / (10 ** decimals)


# ── quoting ──────────────────────────────────────────────────────────────────

@dataclass
class Quote:
    quote_id: str
    tile_key: str
    tx: int
    ty: int
    chain_key: str
    chain_name: str
    owner: str
    price_usd: float
    native_amount: int      # integer base units — the authoritative figure
    native_display: float   # whole tokens, for the UI only
    symbol: str
    decimals: int
    usd_per_token: float
    treasury: str
    payer: Optional[str]
    created_at: int
    expires_at: int

    def to_public(self) -> dict:
        """What the browser is allowed to see. `native_amount` is a string
        because JSON numbers are IEEE doubles and 18-decimal wei does not
        survive one."""
        return {
            "quote_id": self.quote_id,
            "tile_key": self.tile_key,
            "chain": self.chain_key,
            "chain_name": self.chain_name,
            "price_usd": round(self.price_usd, 2),
            "native_amount": str(self.native_amount),
            "native_display": self.native_display,
            "symbol": self.symbol,
            "decimals": self.decimals,
            "usd_per_token": self.usd_per_token,
            "treasury": self.treasury,
            "expires_at": self.expires_at,
            "expires_in": max(0, self.expires_at - int(time.time())),
        }


async def build_quote(
    *,
    tx: int,
    ty: int,
    chain_key: str,
    owner: str,
    payer: Optional[str] = None,
    sold_count: int = 0,
    multiplier: float = 1.0,
    session: Optional[aiohttp.ClientSession] = None,
) -> Quote:
    """
    Price a tile and lock that price in for QUOTE_TTL_SECONDS.

    `multiplier` carries the live market-event multiplier from price_events.py
    so the wallet charges what the map showed. It is clamped: a runaway feed
    must not be able to bill someone 50x.
    """
    if not (0 <= tx <= 16383 and 0 <= ty <= 16383):
        raise ChainPayError("Tile coordinates out of range")

    chain = get_chain(chain_key)
    if chain is None:
        raise ChainPayError(f"Unknown chain: {chain_key}")
    if not chain.native_pay:
        raise ChainPayError(chain.native_pay_note or f"{chain.name} does not accept native payment")

    treasury = treasury_for(chain)
    if not treasury:
        raise ChainPayError(f"No treasury address configured for {chain.name}")

    base = tile_base_price(tx, ty)
    scarcity = 1.0 + (max(0, sold_count) / (16384 * 16384)) * 3.0
    mult = min(3.0, max(0.25, float(multiplier or 1.0)))
    price_usd = round(base * scarcity * mult, 2)

    rate = await usd_per_native(chain, session=session)
    tokens = price_usd / rate
    native_amount = to_base_units(tokens, chain.decimals)
    if native_amount <= 0:
        raise ChainPayError("Computed a zero on-chain amount; refusing to quote")

    now = int(time.time())
    return Quote(
        quote_id=secrets.token_hex(16),
        tile_key=f"{tx}:{ty}",
        tx=tx,
        ty=ty,
        chain_key=chain.key,
        chain_name=chain.name,
        owner=owner,
        price_usd=price_usd,
        native_amount=native_amount,
        native_display=round(from_base_units(native_amount, chain.decimals), 8),
        symbol=chain.symbol,
        decimals=chain.decimals,
        usd_per_token=rate,
        treasury=treasury,
        payer=payer,
        created_at=now,
        expires_at=now + QUOTE_TTL_SECONDS,
    )


# ── on-chain verification ────────────────────────────────────────────────────

@dataclass
class PaymentProof:
    ok: bool
    error: str = ""
    paid: int = 0                 # base units actually received by the treasury
    payer: str = ""               # who sent it
    confirmations: int = 0
    pending: bool = False         # true = ask again later, not a rejection


async def _rpc(session: aiohttp.ClientSession, url: str, method: str, params: list):
    """One JSON-RPC call. Raises on transport or protocol error."""
    async with session.post(
        url,
        json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
        headers={**HEADERS, "Content-Type": "application/json"},
        timeout=HTTP_TIMEOUT,
    ) as r:
        if r.status != 200:
            raise ChainPayError(f"RPC HTTP {r.status}")
        body = await r.json()
    if "error" in body and body["error"]:
        raise ChainPayError(str(body["error"].get("message", body["error"])))
    return body.get("result")


async def verify_evm(
    chain: Chain,
    tx_hash: str,
    treasury: str,
    min_amount: int,
    session: aiohttp.ClientSession,
) -> PaymentProof:
    """
    Confirm a plain native-token transfer landed in the treasury.

    Deliberately strict about shape: we require a direct EOA->treasury transfer,
    so `to` is the treasury and `value` is the amount. A payment routed through
    a contract would need trace/log parsing to attribute, and "I sent it via a
    contract" is exactly the shape an attacker would use to make attribution
    ambiguous.

    Public RPCs rot (scripts/check-rpcs.mjs exists because of it), so every
    endpoint is tried before the payment is called bad. A transport failure must
    never read as "you did not pay".
    """
    last_err = ""
    for url in chain.rpcs:
        try:
            tx = await _rpc(session, url, "eth_getTransactionByHash", [tx_hash])
            if tx is None:
                # Not indexed yet, or wrong chain. Both mean "try again".
                last_err = "Transaction not found yet"
                continue

            receipt = await _rpc(session, url, "eth_getTransactionReceipt", [tx_hash])
            if receipt is None:
                return PaymentProof(ok=False, pending=True, error="Waiting to be mined")

            if str(receipt.get("status", "0x1")).lower() not in ("0x1", "1"):
                return PaymentProof(ok=False, error="Transaction reverted on-chain")

            to_addr = (tx.get("to") or "").lower()
            if to_addr != treasury.lower():
                return PaymentProof(
                    ok=False,
                    error="Payment was not sent to the treasury address",
                )

            value = int(tx.get("value", "0x0"), 16)
            payer = (tx.get("from") or "").lower()

            head = int(await _rpc(session, url, "eth_blockNumber", []), 16)
            mined_in = int(receipt.get("blockNumber", "0x0"), 16)
            confs = max(0, head - mined_in + 1) if mined_in else 0

            if value < min_amount:
                return PaymentProof(
                    ok=False,
                    paid=value,
                    payer=payer,
                    confirmations=confs,
                    error=(
                        f"Underpaid: received {from_base_units(value, chain.decimals):.8f} "
                        f"{chain.symbol}, expected at least "
                        f"{from_base_units(min_amount, chain.decimals):.8f}"
                    ),
                )

            if confs < chain.confirmations:
                return PaymentProof(
                    ok=False, pending=True, paid=value, payer=payer, confirmations=confs,
                    error=f"Confirming ({confs}/{chain.confirmations})",
                )

            return PaymentProof(ok=True, paid=value, payer=payer, confirmations=confs)

        except Exception as exc:
            last_err = str(exc)
            continue

    # Every endpoint failed. Pending, not rejected — the money may well be there.
    return PaymentProof(ok=False, pending=True, error=last_err or "No RPC endpoint responded")


# A family with no verifier cannot take native payment, which is enforced here
# rather than left to the caller to remember.
#
# `evm` lives in this file as the reference implementation; every other family
# is a module in server/verifiers/ exporting `verify()`, discovered by filename.
# Adding a family is adding a file — there is no registry to keep in step, and
# a broken or half-written module disables its own chain instead of taking the
# whole backend down at import time.
VERIFIERS = {
    "evm": verify_evm,
}


_discovered = False


def _discover_verifiers():
    """
    Load server/verifiers/*.py once, on first use.

    LAZY ON PURPOSE, and this is not a style choice. Every verifier module does
    `from chain_pay import PaymentProof, …`, so importing one imports this
    module. If discovery ran at import time, then importing `verifiers.stellar`
    first would execute chain_pay, which would re-enter `verifiers.stellar`
    while it is still half-executed — `verify` not yet defined — and silently
    register nothing for that family. The symptom is a chain that reports
    "verification not implemented" depending only on which module Python
    happened to load first.

    Deferring until the first call means every module is fully initialised by
    the time we look at it, whatever the import order was.
    """
    global _discovered
    if _discovered:
        return
    _discovered = True

    import importlib
    import pkgutil

    try:
        import verifiers as _pkg
    except Exception as exc:  # package missing entirely
        print(f"[ChainPay] no verifiers package: {exc}")
        return

    for mod in pkgutil.iter_modules(_pkg.__path__):
        if mod.name.startswith("_"):
            continue
        try:
            m = importlib.import_module(f"verifiers.{mod.name}")
            fn = getattr(m, "verify", None)
            if fn is None:
                print(f"[ChainPay] verifiers.{mod.name} has no verify(); skipped")
                continue
            VERIFIERS[mod.name] = fn
        except Exception as exc:
            # One bad module must not cost the other 30 chains their payments.
            print(f"[ChainPay] verifiers.{mod.name} failed to load: {exc}")


async def verify_payment(
    chain: Chain,
    tx_hash: str,
    treasury: str,
    min_amount: int,
    session: Optional[aiohttp.ClientSession] = None,
) -> PaymentProof:
    """Dispatch to the right family verifier."""
    _discover_verifiers()
    verifier = VERIFIERS.get(chain.family)
    if verifier is None:
        return PaymentProof(
            ok=False,
            error=f"On-chain verification is not implemented for {chain.family}",
        )

    own = session is None
    session = session or aiohttp.ClientSession(timeout=HTTP_TIMEOUT)
    try:
        return await verifier(chain, tx_hash, treasury, min_amount, session)
    finally:
        if own:
            await session.close()


def family_supported(family: str) -> bool:
    _discover_verifiers()
    return family in VERIFIERS
