"""
verifiers/stellar.py — confirm an XLM payment landed in the treasury.

Reads Horizon, the Stellar Development Foundation's REST indexer, exactly the
way `verify_evm` reads a JSON-RPC node: recipient, amount and confirmation count
all come from an endpoint the server chose, never from the client.

── Why Horizon and not the Soroban RPC ───────────────────────────────────────
`chain.rpcs` for Stellar is [horizon.stellar.org, mainnet.sorobanrpc.com] — two
endpoints, but only the first is an indexer. The second is the Soroban JSON-RPC
(stellar.js submits through it in `submitXdr`), and it is unusable here for
three independent reasons:

  * it speaks JSON-RPC over POST and will not answer a Horizon REST path at all;
  * its `getTransaction` returns the envelope and result as base64 XDR, which
    cannot be decoded without the Stellar SDK (not a server dependency); and
  * it retains only a rolling window of recent ledgers, so a "not found" from it
    is never evidence of anything.

So the Soroban host is filtered out below rather than tried and failed. The
practical consequence is honest and worth stating: **Stellar verification has a
single endpoint.** There is no second public Horizon in `config.js`, and
`horizon.publicnode.com` — the obvious candidate — 404s on `/transactions/{hash}`
and is not one. If Horizon is down the verdict is `pending`, which is the safe
direction, but it will stay pending until Horizon returns.

── Why the amount never touches a float ──────────────────────────────────────
Horizon reports `amount` as a DECIMAL STRING in whole XLM ("1043.8734886"), not
in stroops. `float("1043.8734886") * 10**7` is 10438734885.999998 — off by one
stroop in the direction that underpays us, and worse at larger amounts. The
conversion here is pure integer/string arithmetic (see `_to_stroops`).
"""
from __future__ import annotations

import re

import aiohttp

from chain_pay import HEADERS, HTTP_TIMEOUT, PaymentProof, from_base_units
from chain_registry import Chain

# A Stellar transaction may hold at most 100 operations (protocol limit), so one
# page of 200 can never truncate the set we are summing over.
_OPS_PAGE = 200

# Hosts in chain.rpcs that are NOT Horizon. See the module docstring.
_NOT_HORIZON = ("sorobanrpc", "soroban-rpc", "/soroban")

# 32 bytes of hex, lower-cased. Horizon is case-sensitive on this path segment.
_HASH_RE = re.compile(r"^[0-9a-f]{64}$")


def _horizons(chain: Chain) -> list[str]:
    """The endpoints in chain.rpcs that can actually answer a Horizon path."""
    urls: list[str] = []
    for raw in chain.rpcs:
        u = (raw or "").rstrip("/")
        if not u or any(bad in u.lower() for bad in _NOT_HORIZON):
            continue
        if u not in urls:
            urls.append(u)
    return urls


def _to_stroops(amount: str, decimals: int) -> int:
    """
    Horizon's decimal XLM string -> integer stroops, exactly.

    "1043.8734886" -> 10438734886.  Never `float()`, never `Decimal` scaling
    that could inherit a binary rounding mode: split on the point, pad the
    fraction to the chain's decimals, and add two integers.

    Raises on anything that is not a plain non-negative decimal, including more
    fractional digits than XLM has — that would mean Horizon changed shape, and
    silently truncating money is not an acceptable response to that.
    """
    s = str(amount).strip()
    if not re.fullmatch(r"\d+(\.\d+)?", s):
        raise ValueError(f"Horizon returned an unparseable amount: {amount!r}")
    whole, _, frac = s.partition(".")
    if len(frac) > decimals:
        raise ValueError(f"Horizon amount {amount!r} has more than {decimals} decimals")
    return int(whole) * (10 ** decimals) + int(frac.ljust(decimals, "0") or "0")


async def _get(session: aiohttp.ClientSession, url: str):
    """GET returning (status, parsed-json-or-None). Raises only on transport."""
    async with session.get(url, headers=HEADERS, timeout=HTTP_TIMEOUT) as r:
        if r.status == 404:
            return 404, None
        if r.status != 200:
            raise RuntimeError(f"Horizon HTTP {r.status}")
        # Horizon answers application/hal+json, which aiohttp will not decode
        # under its default content-type guard.
        return 200, await r.json(content_type=None)


async def verify(
    chain: Chain,
    tx_hash: str,
    treasury: str,
    min_amount: int,
    session: aiohttp.ClientSession,
) -> PaymentProof:
    """
    Confirm a classic native-XLM Payment operation credited the treasury.

    `tx_hash` is what `payNative()` in adapters/stellar.js returns: the 64-char
    hex hash Soroban RPC's sendTransaction (or Horizon's POST /transactions)
    assigned to the submitted envelope.

    Deliberately strict about operation shape — only `type: "payment"` with
    `asset_type: "native"` counts:

      * an ISSUED asset (credit_alphanum4/12) is not XLM, however the wallet
        labelled it, and accepting one would sell a tile for a token we minted
        no claim to;
      * `path_payment_strict_*` and `create_account` also move XLM to a
        destination, but our adapter emits neither, and "I paid through a path
        payment" is exactly the shape that makes attribution arguable. This
        mirrors `verify_evm` refusing a transfer routed through a contract.

    `paid` is the SUM of the qualifying operations addressed to the treasury —
    a Stellar transaction carries up to 100 operations and may pay many
    recipients, so the transaction's total is not our number.
    """
    endpoints = _horizons(chain)
    if not endpoints:
        return PaymentProof(
            ok=False, pending=True,
            error="No Horizon endpoint is configured for Stellar",
        )

    # Hex is case-insensitive as a value but not as a URL path segment; Horizon
    # 404s an upper-cased hash. Normalising is safe precisely because the hash
    # is hex — contrast the ADDRESSES below, which must never be case-folded.
    h = (tx_hash or "").strip().lower()
    if not _HASH_RE.match(h):
        # Pending, not rejected: a malformed hash is far more likely a truncated
        # value in flight than a claim of payment we should deny outright.
        return PaymentProof(
            ok=False, pending=True,
            error="Not a Stellar transaction hash yet (expected 64 hex characters)",
        )

    treasury = (treasury or "").strip()
    if not treasury:
        return PaymentProof(ok=False, error="No treasury address configured")

    last_err = ""
    for base in endpoints:
        try:
            status, tx = await _get(session, f"{base}/transactions/{h}")
            if status == 404 or tx is None:
                # Horizon 404s both while the tx is unconfirmed and if it never
                # existed. Neither is proof of non-payment.
                last_err = "Transaction not found on Horizon yet"
                continue

            if tx.get("successful") is not True:
                return PaymentProof(ok=False, error="Transaction failed on-chain")

            ledger = int(tx.get("ledger") or 0)
            if not ledger:
                return PaymentProof(ok=False, pending=True, error="Waiting for ledger close")

            status, ops = await _get(session, f"{base}/transactions/{h}/operations?limit={_OPS_PAGE}")
            if status == 404 or ops is None:
                last_err = "Operations not indexed yet"
                continue

            paid = 0
            payer = ""
            saw_non_native = False
            for op in (ops.get("_embedded", {}) or {}).get("records", []) or []:
                if op.get("type") != "payment":
                    continue
                # Stellar addresses are StrKey base32 and are CASE-SENSITIVE:
                # the trailing bytes are a CRC-16 checksum over the raw key, so
                # `.lower()` produces a string that is not an address at all and
                # can never equal the treasury. Compare the bytes as given.
                if op.get("to") != treasury:
                    continue
                if op.get("asset_type") != "native":
                    # An issued asset paid to the treasury. Note it so the
                    # rejection can say why, but never count it.
                    saw_non_native = True
                    continue
                paid += _to_stroops(op.get("amount", "0"), chain.decimals)
                if not payer:
                    # The operation's own source, which on a fee-bumped or
                    # multi-source transaction is the account that actually
                    # parted with the XLM — not necessarily tx.source_account.
                    payer = op.get("from") or tx.get("source_account") or ""

            if paid <= 0:
                if saw_non_native:
                    return PaymentProof(
                        ok=False,
                        error=f"Payment was not in native {chain.symbol} — an issued asset does not settle a tile",
                    )
                return PaymentProof(
                    ok=False,
                    error="Payment was not sent to the treasury address",
                )

            # Horizon's root reports the network it is indexing and its ingest
            # head in one call, so the passphrase check is free. A Horizon
            # pointed at testnet would otherwise verify a testnet payment
            # against a mainnet sale.
            status, root = await _get(session, f"{base}/")
            if status != 200 or root is None:
                raise RuntimeError("Horizon root did not answer")
            passphrase = root.get("network_passphrase")
            if passphrase and chain.chain_id and passphrase != chain.chain_id:
                last_err = f"Horizon at {base} is indexing '{passphrase}', not {chain.name}"
                continue
            head = int(root.get("history_latest_ledger") or root.get("core_latest_ledger") or 0)
            confs = max(0, head - ledger + 1) if head else 0

            if paid < min_amount:
                return PaymentProof(
                    ok=False,
                    paid=paid,
                    payer=payer,
                    confirmations=confs,
                    error=(
                        f"Underpaid: treasury received {from_base_units(paid, chain.decimals):.7f} "
                        f"{chain.symbol}, expected at least "
                        f"{from_base_units(min_amount, chain.decimals):.7f}"
                    ),
                )

            # Stellar has deterministic finality: once SCP closes a ledger it is
            # never reorganised, so chain.confirmations is 1 and this gate is
            # really "has the ledger closed and been ingested".
            if confs < chain.confirmations:
                return PaymentProof(
                    ok=False, pending=True, paid=paid, payer=payer, confirmations=confs,
                    error=f"Confirming ({confs}/{chain.confirmations})",
                )

            return PaymentProof(ok=True, paid=paid, payer=payer, confirmations=confs)

        except Exception as exc:
            last_err = str(exc)
            continue

    # Every endpoint failed or had nothing. Pending, never rejected — the money
    # may well be sitting in the treasury while Horizon is having a bad day.
    return PaymentProof(ok=False, pending=True, error=last_err or "No Horizon endpoint responded")
