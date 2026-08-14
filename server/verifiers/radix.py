"""
Radix payment verification.

`src/lib/blockchain/adapters/radix.js` -> `payNative()` submits a manifest —
`withdraw` / `TAKE_FROM_WORKTOP` / `try_deposit_or_abort` — and returns
`transactionIntentHash`, a `txid_rdx1…` bech32m string. Radix identifies a
transaction by that INTENT hash, not by a payload or notarized hash, so it is
the only one of the three that the Gateway will look up.

── Why balance changes and not the manifest ─────────────────────────────────
The manifest is what was ASKED for; the receipt's balance changes are what
HAPPENED. `try_deposit_or_abort` can abort, an account can be configured to
refuse a resource, and a manifest is user-supplied text in the first place. So
the amount comes from `balance_changes.fungible_balance_changes`, filtered to
the treasury entity and the XRD resource — the ledger's own accounting of who
ended up with what.

── Decimal strings, not floats ──────────────────────────────────────────────
The Gateway reports a balance change as a decimal string of WHOLE XRD
("44066.701193980565915618"), while a quote is in attos. The conversion is a
string shift — mirror of attosToXrd() in the adapter — because XRD has 18
decimals and float64 runs out of integer precision at 2^53: `float("44066.70…")
* 1e18` loses the last five digits of that number, and Decimal's default 28-
digit context is not obviously enough headroom either. Shifting the digits
cannot be wrong.
"""
from __future__ import annotations

import re
from typing import Optional

import aiohttp

from chain_pay import ChainPayError, HEADERS, HTTP_TIMEOUT, PaymentProof, from_base_units
from chain_registry import Chain

# XRD's resource address, mirroring XRD_RESOURCE in the adapter. Verified
# against mainnet on 2026-08-14 with POST /state/entity/details:
#   details.type = "FungibleResource", divisibility = 18
#   metadata symbol = "XRD", name = "Radix"
# 18 matches CHAINS['radix'].decimals, so quotes and receipts share a unit.
#
# NOTE for anyone copying an XRD address out of a doc or a prompt: the "x"
# padding runs are load-bearing. `resource_rdx1tknxxxxxxxxxxradxrd…` (one extra
# x) is a real-looking string that the Gateway rejects as invalid bech32m — it
# is not XRD, it is nothing. Only ever paste this from a live query.
XRD_RESOURCES = frozenset({
    "resource_rdx1tknxxxxxxxxxradxrdxxxxxxxxx009923554798xxxxxxxxxradxrd",       # mainnet
    "resource_tdx_2_1tknxxxxxxxxxradxrdxxxxxxxxx009923554798xxxxxxxxxtfd2jc",    # stokenet
})

# Radix commits are BFT-final, so the states are few and unambiguous.
STATUS_SUCCESS = "committedsuccess"
STATUS_FAILED = {"committedfailure", "rejected", "permanentlyrejected"}

_DECIMAL_RE = re.compile(r"^-?\d+(\.\d+)?$")


def _to_base_units(value: str, decimals: int) -> Optional[int]:
    """
    "44066.701193980565915618" -> 44066701193980565915618 attos.

    Pure string arithmetic: split on the point, pad or truncate the fraction to
    `decimals` digits, concatenate. Returns None on anything that is not a plain
    decimal, so an unexpected format (scientific notation, a null, a number
    type) is caught by the caller rather than silently read as zero — under-
    counting a payment is a refund request, and silently is the worst way to do
    it.
    """
    s = str(value).strip()
    if not _DECIMAL_RE.match(s):
        return None
    neg = s.startswith("-")
    if neg:
        s = s[1:]
    whole, _, frac = s.partition(".")
    if len(frac) > decimals:
        # More precision than the resource has cannot happen for XRD, but
        # truncating (not rounding) keeps the figure conservative if it ever does.
        frac = frac[:decimals]
    units = int(whole + frac.ljust(decimals, "0"))
    return -units if neg else units


async def _committed_details(session: aiohttp.ClientSession, gateway: str, intent_hash: str):
    """
    POST /transaction/committed-details. None means "the Gateway does not have
    it", which covers both not-yet-committed and never-existed.

    A malformed intent hash comes back 400, and that is deliberately treated the
    same way rather than as a rejection: by the time this runs the user's money
    has already left their wallet (documentation/native-payments.md §6), so a
    hash the server cannot parse is a reason to keep asking, never a reason to
    tell someone they did not pay.
    """
    async with session.post(
        f"{gateway}/transaction/committed-details",
        json={"intent_hash": intent_hash, "opt_ins": {"balance_changes": True}},
        headers={**HEADERS, "Content-Type": "application/json"},
        timeout=HTTP_TIMEOUT,
    ) as r:
        if r.status in (400, 404):
            return None
        if r.status != 200:
            raise ChainPayError(f"Gateway HTTP {r.status}")
        return await r.json(content_type=None)


async def verify(
    chain: Chain,
    tx_hash: str,
    treasury: str,
    min_amount: int,
    session: aiohttp.ClientSession,
) -> PaymentProof:
    """
    Confirm the treasury's XRD balance rose by >= min_amount in this transaction.

    Addresses are compared as exact strings. Radix bech32m is emitted lowercase
    by every tool in the ecosystem and its checksum is computed over a single
    case, so case-folding would not canonicalise anything — it would only let two
    genuinely different strings compare equal. The adapter already refuses to
    send to anything that does not start with the network's account prefix, so
    both ends agree on the form before a single atto moves.
    """
    treasury = (treasury or "").strip()
    if not treasury.startswith("account_"):
        return PaymentProof(ok=False, error="Treasury address is not a Radix account address")

    last_err = ""
    for gateway in chain.rpcs:
        gateway = gateway.rstrip("/")
        try:
            body = await _committed_details(session, gateway, tx_hash)
            if not body:
                last_err = "Transaction not committed yet"
                continue

            tx = body.get("transaction") or {}
            status = str(tx.get("transaction_status") or "").replace("_", "").lower()
            if status in STATUS_FAILED:
                return PaymentProof(
                    ok=False,
                    error=f"Transaction did not succeed on-chain ({tx.get('transaction_status')})",
                )
            if status != STATUS_SUCCESS:
                # Pending / CommitPendingOutcomeUnknown / anything new.
                return PaymentProof(
                    ok=False, pending=True,
                    error=f"Waiting to commit ({tx.get('transaction_status') or 'unknown'})",
                )

            changes = tx.get("balance_changes") or {}
            # Both lists, because together they are the treasury's NET XRD for
            # this transaction. `fungible_fee_balance_changes` normally only
            # touches the fee payer and the consensus manager, but if the
            # treasury ever appears there it appears as a cost, and netting it
            # in keeps `paid` conservative instead of flattering.
            rows = list(changes.get("fungible_balance_changes") or []) + \
                   list(changes.get("fungible_fee_balance_changes") or [])

            paid = 0
            for row in rows:
                if row.get("entity_address") != treasury:
                    continue
                if row.get("resource_address") not in XRD_RESOURCES:
                    continue  # some other token — not money, for our purposes
                delta = _to_base_units(row.get("balance_change"), chain.decimals)
                if delta is None:
                    # We cannot read our own money. Do not guess in either
                    # direction; poll and let a human notice.
                    return PaymentProof(
                        ok=False, pending=True,
                        error="Gateway returned a balance change this server could not parse",
                    )
                paid += delta

            # Radix commits are final the moment they commit — there is no
            # deeper burial to wait for, unlike a probabilistic chain. The
            # ledger state version is still reported as a monotonic depth so the
            # generic `confs < chain.confirmations` gate below means something.
            head = int((body.get("ledger_state") or {}).get("state_version") or 0)
            mined = int(tx.get("state_version") or 0)
            confs = max(1, head - mined + 1) if head and mined else chain.confirmations

            if paid <= 0:
                return PaymentProof(
                    ok=False,
                    confirmations=confs,
                    error="No XRD from this transaction reached the treasury address",
                )

            if paid < min_amount:
                return PaymentProof(
                    ok=False,
                    paid=paid,
                    confirmations=confs,
                    error=(
                        f"Underpaid: received {from_base_units(paid, chain.decimals):.8f} "
                        f"{chain.symbol}, expected at least "
                        f"{from_base_units(min_amount, chain.decimals):.8f}"
                    ),
                )

            if confs < chain.confirmations:
                return PaymentProof(
                    ok=False, pending=True, paid=paid, confirmations=confs,
                    error=f"Confirming ({confs}/{chain.confirmations})",
                )

            # `payer` is left empty on purpose. A Radix manifest has no single
            # "from" field — the withdrawing account and the fee-paying account
            # are chosen independently by the wallet at review time — so any
            # address picked out of the balance changes would be a guess. The
            # quote already binds the payer, and inventing one here would put a
            # wrong address in the audit trail.
            return PaymentProof(ok=True, paid=paid, confirmations=confs)

        except Exception as exc:
            last_err = str(exc)
            continue

    return PaymentProof(ok=False, pending=True, error=last_err or "No Gateway endpoint responded")
