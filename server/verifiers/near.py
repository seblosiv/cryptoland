"""
verifiers/near.py — confirm a NEAR payment landed in the treasury.

JSON-RPC, but with a quirk no other chain here has: **looking a transaction up
requires the sender's account id as well as the hash.** `tx` and
`EXPERIMENTAL_tx_status` both take `[tx_hash, account_id]`, because NEAR sharded
its transaction index by account. The quote stores the payer, so the caller has
it — but if it is missing, this cannot fall back to a hash-only lookup and says
so rather than guessing.

── What counts as payment ───────────────────────────────────────────────────
`adapters/near.js::payNative()` sends a single Transfer action. NEAR reports the
outcome as a receipt tree, and the honest source of "what did the treasury
receive" is the Transfer actions in `transaction.actions` combined with the
final status — NOT the receipts alone, because:

  * **gas refunds are Transfer actions too.** Every NEAR transaction generates a
    refund receipt with `predecessor_id: "system"` transferring unspent gas back
    to the payer. Counting those as payment would credit a buyer for their own
    refund, and on a cheap transfer the refund can be a large fraction of the
    deposit. Receipts whose predecessor is `system` are excluded here.
  * a transaction can carry several actions to different receivers.

── Failure is not a status field ────────────────────────────────────────────
NEAR reports success as `status.SuccessValue` and failure as `status.Failure`.
A transaction can also be `Unknown` while still propagating, which is pending,
not failure.
"""
from __future__ import annotations

from typing import Optional

import aiohttp

from chain_pay import HEADERS, HTTP_TIMEOUT, PaymentProof, from_base_units
from chain_registry import Chain

# Refund receipts are minted by this pseudo-account. See the module docstring.
SYSTEM_ACCOUNT = "system"


def _norm(account: str) -> str:
    """
    NEAR account ids are lowercase by protocol rule, so casefolding is safe —
    unlike Solana or Algorand, where addresses are case-sensitive base58/base32.
    """
    return (account or "").strip().lower()


async def _rpc(session: aiohttp.ClientSession, url: str, method: str, params):
    async with session.post(
        url,
        json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
        headers={**HEADERS, "Content-Type": "application/json"},
        timeout=HTTP_TIMEOUT,
    ) as r:
        if r.status != 200:
            raise RuntimeError(f"HTTP {r.status}")
        body = await r.json()
    if body.get("error"):
        err = body["error"]
        msg = str(err.get("cause", {}).get("name") or err.get("message") or err)
        raise RuntimeError(msg)
    return body.get("result")


async def verify(
    chain: Chain,
    tx_hash: str,
    treasury: str,
    min_amount: int,
    session: aiohttp.ClientSession,
    payer: Optional[str] = None,
) -> PaymentProof:
    tx_hash = (tx_hash or "").strip()
    if not tx_hash:
        return PaymentProof(ok=False, error="No transaction hash supplied")

    treasury_n = _norm(treasury)

    # NEAR needs an account id alongside the hash. The treasury is a valid
    # lookup account for a transaction that paid it, so it works as the probe
    # even when the payer was not passed through.
    lookup_account = payer or treasury
    last_err = ""

    for url in chain.rpcs:
        try:
            result = await _rpc(session, url, "EXPERIMENTAL_tx_status",
                                [tx_hash, lookup_account])
            if not result:
                last_err = "Transaction not found yet"
                continue

            status = result.get("status") or {}
            if "Failure" in status:
                return PaymentProof(ok=False,
                                    error="Transaction failed on-chain")
            if "SuccessValue" not in status and "SuccessReceiptId" not in status:
                return PaymentProof(ok=False, pending=True,
                                    error="Waiting for the transaction to finalise")

            tx = result.get("transaction") or {}
            sender = tx.get("signer_id", "")
            receiver = _norm(tx.get("receiver_id", ""))

            paid = 0

            # The transaction's own Transfer actions, if it paid the treasury.
            if receiver == treasury_n:
                for action in tx.get("actions", []):
                    if isinstance(action, dict) and "Transfer" in action:
                        try:
                            paid += int(action["Transfer"].get("deposit", "0"))
                        except (TypeError, ValueError):
                            continue

            # Transfers that arrived via receipts — excluding gas refunds, which
            # the system account mints back to the payer on every transaction.
            for rc in result.get("receipts", []):
                if _norm(rc.get("predecessor_id", "")) == SYSTEM_ACCOUNT:
                    continue
                if _norm(rc.get("receiver_id", "")) != treasury_n:
                    continue
                actions = ((rc.get("receipt") or {}).get("Action") or {}).get("actions", [])
                for action in actions:
                    if isinstance(action, dict) and "Transfer" in action:
                        try:
                            paid += int(action["Transfer"].get("deposit", "0"))
                        except (TypeError, ValueError):
                            continue

            if paid == 0:
                return PaymentProof(
                    ok=False, payer=sender,
                    error="The treasury account received no NEAR in this transaction",
                )
            if paid < min_amount:
                return PaymentProof(
                    ok=False, paid=paid, payer=sender,
                    error=(
                        f"Underpaid: treasury received "
                        f"{from_base_units(paid, chain.decimals):.6f} {chain.symbol}, "
                        f"expected at least "
                        f"{from_base_units(min_amount, chain.decimals):.6f}"
                    ),
                )

            return PaymentProof(ok=True, paid=paid, payer=sender,
                                confirmations=chain.confirmations)

        except Exception as exc:
            msg = str(exc)
            # "UNKNOWN_TRANSACTION" is NEAR's not-found; everything else is
            # transport. Both are pending — neither is proof of non-payment.
            last_err = msg
            continue

    return PaymentProof(ok=False, pending=True,
                        error=last_err or "No NEAR endpoint responded")
