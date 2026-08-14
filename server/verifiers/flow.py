"""
verifiers/flow.py — confirm a FLOW payment landed in the treasury.

Flow's Access API is REST. Two calls: the transaction result (for status) and
its events (for the amount).

── Why the amount comes from the TokensDeposited event ──────────────────────
`adapters/flow.js::payNative()` submits a Cadence transaction that withdraws
from the payer's vault and deposits into the recipient's receiver capability.
Cadence has no `value` field on a transaction the way an EVM chain does — the
movement of FLOW exists only as the `FlowToken.TokensDeposited` event the
contract emits. So that event IS the record, and there is nothing else to read.

── The payload encoding, which is where this gets fiddly ────────────────────
Each event's `payload` is base64, and inside it is JSON-Cadence — a
self-describing tree, not a flat object. A real one looks like:

    {"value":{"id":"A.1654653399040a61.FlowToken.TokensDeposited",
              "fields":[{"name":"amount","value":{"type":"UFix64","value":"0.00582000"}},
                        {"name":"to","value":{"type":"Optional",
                                              "value":{"type":"Address","value":"0xf919…"}}}]}}

Note `to` is an **Optional** wrapping the Address — a deposit to an account
with no receiver capability carries `null` there. Reaching straight for
`fields[1].value.value` happens to work on this shape and breaks on that one,
so the parser below walks by field NAME and unwraps Optionals explicitly.

── UFix64 → base units ──────────────────────────────────────────────────────
Amounts are decimal strings with exactly 8 decimal places ("0.00582000"). The
conversion is string arithmetic: `float("0.00582") * 10**8` is 581999.9999…,
which truncates to one unit short and would read a correct payment as underpaid.
"""
from __future__ import annotations

import base64
import json
from decimal import Decimal
from typing import Optional

import aiohttp

from chain_pay import HEADERS, HTTP_TIMEOUT, PaymentProof, from_base_units
from chain_registry import Chain

# FlowToken on mainnet. The event type is fully qualified by contract address,
# so this is also what keeps a look-alike token's event from being counted.
FLOW_TOKEN_ADDRESS = "1654653399040a61"
DEPOSIT_EVENT = f"A.{FLOW_TOKEN_ADDRESS}.FlowToken.TokensDeposited"


def _norm(addr: str) -> str:
    """Flow addresses appear with and without the 0x prefix; unify them."""
    a = (addr or "").strip().lower()
    return a[2:] if a.startswith("0x") else a


def _ufix64_to_base_units(value: str, decimals: int) -> int:
    """
    "0.00582000" -> 582000, exactly. Never via float — see the module docstring.
    """
    return int((Decimal(str(value)) * (Decimal(10) ** decimals)).to_integral_value())


def _unwrap(node):
    """Peel Optionals so a field's real value is reachable."""
    while isinstance(node, dict) and node.get("type") == "Optional":
        node = node.get("value")
        if node is None:
            return None
    return node


def _field(fields, name):
    """Look a Cadence event field up BY NAME, not by position."""
    for f in fields or []:
        if f.get("name") == name:
            return _unwrap(f.get("value"))
    return None


def _parse_deposit(payload_b64: str):
    """-> (amount_str, to_address) or (None, None) if this is not usable."""
    try:
        decoded = json.loads(base64.b64decode(payload_b64))
    except Exception:
        return None, None
    fields = (decoded.get("value") or {}).get("fields") or []
    amount_node = _field(fields, "amount")
    to_node = _field(fields, "to")
    amount = amount_node.get("value") if isinstance(amount_node, dict) else None
    to_addr = to_node.get("value") if isinstance(to_node, dict) else None
    return amount, to_addr


async def _get(session: aiohttp.ClientSession, url: str) -> Optional[dict]:
    async with session.get(url, headers=HEADERS, timeout=HTTP_TIMEOUT) as r:
        if r.status in (404, 400):
            return None
        if r.status != 200:
            raise RuntimeError(f"HTTP {r.status}")
        return await r.json()


async def verify(
    chain: Chain,
    tx_hash: str,
    treasury: str,
    min_amount: int,
    session: aiohttp.ClientSession,
) -> PaymentProof:
    tx_id = (tx_hash or "").strip()
    if tx_id.startswith("0x"):
        tx_id = tx_id[2:]
    if not tx_id:
        return PaymentProof(ok=False, error="No transaction id supplied")

    treasury_n = _norm(treasury)
    last_err = ""

    for base in chain.rpcs:
        base = base.rstrip("/")
        try:
            result = await _get(session, f"{base}/v1/transaction_results/{tx_id}")
            if result is None:
                last_err = "Transaction not found yet"
                continue

            status = str(result.get("status", "")).upper()
            if not status or status == "UNKNOWN":
                # Flow answers 200 with status "Unknown" for a transaction id it
                # has never seen, rather than 404. Reporting that as "waiting to
                # be sealed" would tell someone who fat-fingered a hash that
                # their payment is on the way.
                last_err = "Transaction not found yet"
                continue
            if status != "SEALED":
                # EXECUTED/FINALIZED/PENDING all mean "not settled yet" on Flow.
                return PaymentProof(ok=False, pending=True,
                                    error=f"Waiting to be sealed (status: {status})")

            if result.get("error_message"):
                return PaymentProof(
                    ok=False,
                    error=f"Transaction failed on-chain: {result['error_message'][:120]}",
                )

            paid = 0
            for ev in result.get("events", []):
                if ev.get("type") != DEPOSIT_EVENT:
                    continue
                amount, to_addr = _parse_deposit(ev.get("payload", ""))
                # `to` is Optional: a deposit with no receiver has null here and
                # must not be credited to anyone.
                if amount is None or to_addr is None:
                    continue
                if _norm(to_addr) != treasury_n:
                    continue
                try:
                    paid += _ufix64_to_base_units(amount, chain.decimals)
                except Exception:
                    continue

            if paid == 0:
                return PaymentProof(
                    ok=False,
                    error="The treasury account received no FLOW in this transaction",
                )
            if paid < min_amount:
                return PaymentProof(
                    ok=False, paid=paid,
                    error=(
                        f"Underpaid: treasury received "
                        f"{from_base_units(paid, chain.decimals):.8f} {chain.symbol}, "
                        f"expected at least "
                        f"{from_base_units(min_amount, chain.decimals):.8f}"
                    ),
                )

            # SEALED is Flow's final state — there is no deeper confirmation.
            return PaymentProof(ok=True, paid=paid, confirmations=chain.confirmations)

        except Exception as exc:
            last_err = str(exc)
            continue

    return PaymentProof(ok=False, pending=True,
                        error=last_err or "No Flow endpoint responded")
