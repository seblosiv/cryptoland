"""
verifiers/cardano.py — confirm an ADA payment landed in the treasury.

Reads Koios (`POST /tx_info`) and sums the transaction's outputs that pay the
treasury address.

── Why "sum only the treasury's outputs" is the whole job here ──────────────
Cardano is UTXO, and this is the one family where the naive reading is
catastrophically wrong. A transaction does not have "a recipient and an amount":
it consumes inputs and produces several outputs, and **most of the value in a
typical transaction is change returning to the sender**. `total_output` on the
response is the sum of ALL outputs — using it would credit a buyer for their own
change and settle a tile for a payment that never arrived.

So every output is inspected and only those whose `payment_addr.bech32` equals
the treasury are counted.

── CORS is irrelevant here, and that is the point ───────────────────────────
config.js notes Koios sends no `Access-Control-Allow-Origin`, which is why the
browser cannot read it and why the chain-head badge uses Mithril instead. That
constraint does not apply server-side: this runs in the backend, so Koios is
simply the best index available.

⚠️ The client half of this path does not exist. `adapters/cardano.js::payNative()`
posts to `/cardano/build-payment`, a route that has never been implemented in
`server/main.py` (nor has `/cardano/build-mint`, which `mintTile` has always
called). CIP-30 wallets have no send primitive, so the transaction must be built
server-side. Until that route exists, Cardano native payment cannot complete and
this verifier will not be reached — it is written so the remaining work is one
endpoint, not two.
"""
from __future__ import annotations

import aiohttp

from chain_pay import HEADERS, HTTP_TIMEOUT, PaymentProof, from_base_units
from chain_registry import Chain


def _norm(addr: str) -> str:
    """
    Cardano bech32 addresses are lowercase by encoding, so casefolding is safe
    and guards against a treasury configured with stray capitals.
    """
    return (addr or "").strip().lower()


def _output_address(out: dict) -> str:
    """
    Koios nests the address as `payment_addr.bech32`; some responses also carry
    a flat `payment_addr` string. Handle both rather than assuming one.
    """
    pa = out.get("payment_addr")
    if isinstance(pa, dict):
        return pa.get("bech32") or ""
    if isinstance(pa, str):
        return pa
    return out.get("address") or ""


async def verify(
    chain: Chain,
    tx_hash: str,
    treasury: str,
    min_amount: int,
    session: aiohttp.ClientSession,
) -> PaymentProof:
    tx_hash = (tx_hash or "").strip().lower()
    if tx_hash.startswith("0x"):
        tx_hash = tx_hash[2:]
    if not tx_hash:
        return PaymentProof(ok=False, error="No transaction hash supplied")

    treasury_n = _norm(treasury)
    last_err = ""

    for base in chain.rpcs:
        base = base.rstrip("/")
        try:
            async with session.post(
                f"{base}/tx_info",
                json={"_tx_hashes": [tx_hash]},
                headers={**HEADERS, "Content-Type": "application/json"},
                timeout=HTTP_TIMEOUT,
            ) as r:
                if r.status != 200:
                    raise RuntimeError(f"HTTP {r.status}")
                rows = await r.json()

            if not rows:
                # Koios returns an empty array for a hash it has not indexed.
                last_err = "Transaction not found yet"
                continue

            tx = rows[0]

            # A transaction present in tx_info is already in a block; if the
            # block fields are absent it is still being indexed.
            if not tx.get("block_height") and not tx.get("block_hash"):
                return PaymentProof(ok=False, pending=True,
                                    error="Waiting to be included in a block")

            paid = 0
            for out in tx.get("outputs") or []:
                if _norm(_output_address(out)) != treasury_n:
                    continue
                try:
                    paid += int(out.get("value", 0))
                except (TypeError, ValueError):
                    continue

            payer = ""
            inputs = tx.get("inputs") or []
            if inputs:
                payer = _output_address(inputs[0])

            if paid == 0:
                return PaymentProof(
                    ok=False, payer=payer,
                    error="No output in this transaction pays the treasury address",
                )
            if paid < min_amount:
                return PaymentProof(
                    ok=False, paid=paid, payer=payer,
                    error=(
                        f"Underpaid: treasury received "
                        f"{from_base_units(paid, chain.decimals):.6f} {chain.symbol}, "
                        f"expected at least "
                        f"{from_base_units(min_amount, chain.decimals):.6f}"
                    ),
                )

            return PaymentProof(ok=True, paid=paid, payer=payer,
                                confirmations=chain.confirmations)

        except Exception as exc:
            last_err = str(exc)
            continue

    return PaymentProof(ok=False, pending=True,
                        error=last_err or "No Cardano endpoint responded")
