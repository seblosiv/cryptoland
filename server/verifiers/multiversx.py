"""
MultiversX payment verification.

The simplest of the three: `src/lib/blockchain/adapters/multiversx.js` ->
`payNative()` builds a plain move-balance — `value` set, `data` empty, gasLimit
exactly GAS_MOVE_BALANCE — so the transaction has one receiver and one amount,
and verification is the EVM shape with a REST call instead of JSON-RPC.

── The two APIs are not one API ──────────────────────────────────────────────
chain_registry ships two endpoints and they are different products, exactly as
the adapter's `usingGateway()` comment says:

    chain.rpcs[0]  https://api.multiversx.com      indexer  GET /transactions/{hash}
                                                   -> the transaction, flat
    chain.rpcs[1]  https://gateway.multiversx.com  node     GET /transaction/{hash}
                                                   -> {"data": {"transaction": …}}

Note the PATH differs too — plural on the indexer, singular on the node.
`GET https://gateway.multiversx.com/transactions/{hash}` is a 404, verified.
Both shapes are handled here rather than skipping one, because the fallback
existing at all is the point: when the indexer is down, the node still knows
whether the money moved.

── Base units ───────────────────────────────────────────────────────────────
`value` is a DECIMAL STRING of integer base units ("5212020778577084" = 0.0052
EGLD at 18dp). It is parsed with int(), never float: 1 EGLD is 1e18 and doubles
run out of integer precision at 2^53, so float() would quietly round the low
digits of every realistic amount.
"""
from __future__ import annotations

from typing import Optional

import aiohttp

from chain_pay import ChainPayError, HEADERS, HTTP_TIMEOUT, PaymentProof, from_base_units
from chain_registry import Chain

# The network's own vocabulary. "pending" is a transaction the network has
# accepted but not finished executing — retryable. The rest are settled
# failures: "invalid" in particular means it was rejected outright (bad nonce,
# insufficient funds), so the money never left.
STATUS_SUCCESS = "success"
STATUS_PENDING = {"pending", "received", "partially-executed"}
STATUS_FAILED = {"fail", "failed", "invalid", "not-executed", "rewards"}


def _is_gateway(url: str) -> bool:
    """Mirrors usingGateway() in the adapter, so the browser and the server
    decide 'which API is this' by the same rule."""
    return "gateway" in (url or "").lower()


async def _get_json(session: aiohttp.ClientSession, url: str):
    async with session.get(url, headers=HEADERS, timeout=HTTP_TIMEOUT) as r:
        if r.status == 404:
            # Not indexed yet, or never existed. Indistinguishable, and both
            # mean "ask again later" rather than "you did not pay".
            return None
        if r.status != 200:
            raise ChainPayError(f"HTTP {r.status}")
        # Both APIs answer text/plain on some error paths, so do not let
        # aiohttp's mimetype check turn a readable body into an exception.
        return await r.json(content_type=None)


async def _head_depth(
    session: aiohttp.ClientSession, base: str, tx: dict, gateway: bool
) -> Optional[int]:
    """
    How deep the transaction is buried, or None if the head cannot be read.

    Two sources because the two APIs expose different things about a
    transaction. The node returns `blockNonce`, which is directly comparable to
    the shard's `erd_nonce`. The indexer does not return a block nonce at all —
    only `round` — so there the depth is measured in rounds against the newest
    block in the same shard. Rounds that produced no block make that a slight
    over-count of blocks; it is an honest measure of elapsed depth either way,
    and MultiversX's confirmations requirement in chain_registry is 1.
    """
    try:
        if gateway:
            shard = tx.get("destinationShard", tx.get("receiverShard"))
            body = await _get_json(session, f"{base}/network/status/{shard}")
            head = int((body or {}).get("data", {}).get("status", {}).get("erd_nonce") or 0)
            mined = int(tx.get("blockNonce") or 0)
        else:
            shard = tx.get("receiverShard", tx.get("destinationShard"))
            body = await _get_json(session, f"{base}/blocks?size=1&shard={shard}")
            head = int((body or [{}])[0].get("round") or 0)
            mined = int(tx.get("round") or 0)
        if head and mined and head >= mined:
            return head - mined + 1
    except Exception:
        pass
    return None


async def verify(
    chain: Chain,
    tx_hash: str,
    treasury: str,
    min_amount: int,
    session: aiohttp.ClientSession,
) -> PaymentProof:
    """
    Confirm a move-balance of >= min_amount EGLD landed on the treasury.

    Address comparison is an exact string match on the bech32 form. Bech32 is
    case-SENSITIVE in the sense that matters — the checksum is computed over one
    case, mixed case is invalid by spec, and every MultiversX tool emits
    lowercase `erd1…` — so lowercasing here would be a no-op that only served to
    make a genuinely different string look equal. The adapter already refuses to
    send to anything `new Address(to)` cannot parse, so both ends agree on the
    canonical form before a single unit moves.
    """
    treasury = (treasury or "").strip()
    if not treasury.startswith("erd1"):
        return PaymentProof(ok=False, error="Treasury address is not a MultiversX bech32 address")

    last_err = ""
    for base in chain.rpcs:
        base = base.rstrip("/")
        gateway = _is_gateway(base)
        try:
            path = f"{base}/transaction/{tx_hash}" if gateway else f"{base}/transactions/{tx_hash}"
            body = await _get_json(session, path)
            if body is None:
                last_err = "Transaction not found yet"
                continue

            # The node wraps; the indexer does not.
            tx = body.get("data", {}).get("transaction") if gateway else body
            if not isinstance(tx, dict) or not tx:
                last_err = "Transaction not found yet"
                continue

            status = str(tx.get("status") or "").lower()
            if status in STATUS_PENDING:
                return PaymentProof(ok=False, pending=True, error=f"Waiting to execute ({status})")
            if status != STATUS_SUCCESS:
                # Includes the empty string: an answer with no status is not an
                # answer we are willing to settle a sale on.
                return PaymentProof(
                    ok=False,
                    error=f"Transaction did not succeed on-chain ({status or 'unknown status'})",
                )

            receiver = str(tx.get("receiver") or "").strip()
            payer = str(tx.get("sender") or "").strip()
            if receiver != treasury:
                return PaymentProof(
                    ok=False,
                    payer=payer,
                    error="Payment was not sent to the treasury address",
                )

            # int(), not float() — see the module docstring.
            paid = int(str(tx.get("value") or "0"))

            # `success` on MultiversX already means the network executed the
            # transaction inside a block, which is the whole of what
            # confirmations=1 asks for; the depth below is the detail we show
            # the user. When neither head endpoint answers we therefore report
            # the requirement as met rather than stranding a settled payment
            # behind a cosmetic number.
            confs = await _head_depth(session, base, tx, gateway)
            if confs is None:
                confs = chain.confirmations

            if paid < min_amount:
                return PaymentProof(
                    ok=False,
                    paid=paid,
                    payer=payer,
                    confirmations=confs,
                    error=(
                        f"Underpaid: received {from_base_units(paid, chain.decimals):.8f} "
                        f"{chain.symbol}, expected at least "
                        f"{from_base_units(min_amount, chain.decimals):.8f}"
                    ),
                )

            if confs < chain.confirmations:
                return PaymentProof(
                    ok=False, pending=True, paid=paid, payer=payer, confirmations=confs,
                    error=f"Confirming ({confs}/{chain.confirmations})",
                )

            return PaymentProof(ok=True, paid=paid, payer=payer, confirmations=confs)

        except Exception as exc:
            last_err = str(exc)
            continue

    return PaymentProof(ok=False, pending=True, error=last_err or "No API endpoint responded")
