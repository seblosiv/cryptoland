"""
verifiers/sui.py — confirm a SUI payment landed in the treasury.

Reads `sui_getTransactionBlock` with `showBalanceChanges` and sums what the
treasury gained.

── Why balanceChanges and not the transaction's inputs ──────────────────────
Sui is an object model: a "transfer" is a PTB that splits a coin object and
transfers the resulting object. There is no `to`/`value` pair to read, and
reconstructing intent from the programmable-transaction commands would mean
re-implementing Sui's execution semantics. `balanceChanges` is the node's own
statement of what each address's balance did, which is exactly the question.

A negative amount is the payer, positive the recipient, and gas is already
netted into the payer's figure — so the treasury's positive entry is clean.

── The endpoint caveat, which is real ───────────────────────────────────────
config.js documents that Sui **deprecated JSON-RPC on its own public
fullnodes**: `fullnode.mainnet.sui.io` answers `-32601` to every method. The
endpoints in `chain.rpcs` are third parties that still serve it, and
`chain.graphqlUrl` exists as the modern route. This verifier speaks JSON-RPC
across `chain.rpcs`, which was confirmed working against
`sui-rpc.publicnode.com` — but if those third parties drop it too, this needs
rewriting against GraphQL rather than patching.
"""
from __future__ import annotations

import aiohttp

from chain_pay import HEADERS, HTTP_TIMEOUT, PaymentProof, from_base_units
from chain_registry import Chain

SUI_COIN = "0x2::sui::SUI"


def _norm(addr: str) -> str:
    """
    Sui addresses are 32-byte hex. Like Aptos, the leading-zero padding is not
    consistent between callers, so compare unpadded.
    """
    a = (addr or "").strip().lower()
    if a.startswith("0x"):
        a = a[2:]
    return a.lstrip("0") or "0"


def _owner_address(owner) -> str:
    """
    `owner` is a tagged union: {"AddressOwner": "0x…"} for a plain account, or
    ObjectOwner/Shared/Immutable for things that are not a wallet. Only an
    AddressOwner can be our treasury.
    """
    if isinstance(owner, dict):
        return owner.get("AddressOwner") or ""
    if isinstance(owner, str):
        return owner
    return ""


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
        raise RuntimeError(str(body["error"].get("message", body["error"])))
    return body.get("result")


async def verify(
    chain: Chain,
    tx_hash: str,
    treasury: str,
    min_amount: int,
    session: aiohttp.ClientSession,
) -> PaymentProof:
    digest = (tx_hash or "").strip()
    if not digest:
        return PaymentProof(ok=False, error="No transaction digest supplied")

    treasury_n = _norm(treasury)
    last_err = ""

    for url in chain.rpcs:
        try:
            result = await _rpc(session, url, "sui_getTransactionBlock", [
                digest,
                {"showBalanceChanges": True, "showEffects": True, "showInput": False},
            ])
            if not result:
                last_err = "Transaction not found yet"
                continue

            effects = result.get("effects") or {}
            status = (effects.get("status") or {}).get("status", "")
            if status and status.lower() != "success":
                err = (effects.get("status") or {}).get("error", "")
                return PaymentProof(
                    ok=False,
                    error=f"Transaction failed on-chain: {err or status}",
                )

            paid = 0
            payer = ""
            for change in result.get("balanceChanges") or []:
                if change.get("coinType") != SUI_COIN:
                    continue
                try:
                    amount = int(change.get("amount", 0))
                except (TypeError, ValueError):
                    continue
                addr = _owner_address(change.get("owner"))
                if amount < 0 and not payer:
                    payer = addr
                if amount > 0 and _norm(addr) == treasury_n:
                    paid += amount

            if paid == 0:
                return PaymentProof(
                    ok=False, payer=payer,
                    error="The treasury address received no SUI in this transaction",
                )
            if paid < min_amount:
                return PaymentProof(
                    ok=False, paid=paid, payer=payer,
                    error=(
                        f"Underpaid: treasury received "
                        f"{from_base_units(paid, chain.decimals):.9f} {chain.symbol}, "
                        f"expected at least "
                        f"{from_base_units(min_amount, chain.decimals):.9f}"
                    ),
                )

            # A transaction block returned with effects is already executed and
            # checkpointed on Sui; there is no confirmation count to accumulate.
            return PaymentProof(ok=True, paid=paid, payer=payer,
                                confirmations=chain.confirmations)

        except Exception as exc:
            last_err = str(exc)
            continue

    return PaymentProof(ok=False, pending=True,
                        error=last_err or "No Sui endpoint responded")
