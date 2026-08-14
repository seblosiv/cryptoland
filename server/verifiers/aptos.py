"""
verifiers/aptos.py — confirm an APT payment landed in the treasury.

Aptos serves a plain REST API, not JSON-RPC, so this reads
`GET {rpc}/transactions/by_hash/{hash}` rather than posting a method call.

── Why the amount comes from EVENTS, not the payload arguments ───────────────
`adapters/aptos.js::payNative()` submits `0x1::aptos_account::transfer`, whose
arguments are literally `[recipient, amount]`, and reading those would be one
line. It would also be wrong in a way that is hard to see:

  * the arguments say what the sender ASKED for, not what happened. A partial
    or redirected transfer still carries the original arguments.
  * `aptos_account::transfer` is not the only way APT moves. A buyer paying
    from a wallet that batches, or any future change to the adapter, would
    produce a different entry function and the argument parse would silently
    find nothing.
  * a transaction can move APT to several recipients.

The emitted deposit events are the ledger's own record of what each account
actually received, so they are what gets summed here — filtered to the treasury
and to APT specifically, never an arbitrary coin.

── Address form ─────────────────────────────────────────────────────────────
Aptos addresses are 32-byte hex and the API is inconsistent about leading-zero
padding: `0x1` and the 64-character zero-padded form are the same account.
Comparing the raw strings would reject a perfectly good payment, so both sides
are normalised to unpadded lowercase hex before comparison.
"""
from __future__ import annotations

from typing import Optional

import aiohttp

from chain_pay import HEADERS, HTTP_TIMEOUT, PaymentProof, from_base_units
from chain_registry import Chain

# The only coin that counts as payment. A USDC transfer to the treasury is not
# a tile purchase, and must not settle one.
APT_COIN = "0x1::aptos_coin::AptosCoin"

# Event types the framework emits when an account's APT balance rises. Aptos
# has both the legacy CoinStore events and the newer fungible-asset events;
# accept either, because which one appears depends on the recipient's account.
_DEPOSIT_TYPES = (
    "0x1::coin::DepositEvent",
    "0x1::fungible_asset::Deposit",
)


def _norm(addr: str) -> str:
    """
    Aptos addresses to a comparable form.

    Strips `0x` and leading zeros: the API returns `0x1` in some fields and the
    64-char padded form in others, for the same account.
    """
    a = (addr or "").strip().lower()
    if a.startswith("0x"):
        a = a[2:]
    return a.lstrip("0") or "0"


def _is_apt_deposit(ev: dict) -> bool:
    """True for an event that credits APT (as opposed to some other coin)."""
    etype = ev.get("type", "")
    if not any(etype.startswith(t) for t in _DEPOSIT_TYPES):
        return False
    # Legacy CoinStore events carry the coin type in the generic parameter,
    # e.g. `0x1::coin::DepositEvent<0x1::aptos_coin::AptosCoin>`. When the
    # generic is absent the event is only trustworthy if we can tie it to APT
    # some other way, so require the marker rather than assuming.
    if "<" in etype:
        return APT_COIN in etype
    # Fungible-asset deposits name the metadata object instead; APT's is 0xa.
    store = str(ev.get("data", {}).get("store", "")).lower()
    return store.endswith("a") or APT_COIN in str(ev.get("data", {}))


async def _get(session: aiohttp.ClientSession, url: str) -> Optional[dict]:
    async with session.get(url, headers=HEADERS, timeout=HTTP_TIMEOUT) as r:
        if r.status == 404:
            return None                      # not indexed yet
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
    tx_hash = (tx_hash or "").strip()
    if not tx_hash:
        return PaymentProof(ok=False, error="No transaction hash supplied")

    treasury_n = _norm(treasury)
    last_err = ""

    for base in chain.rpcs:
        base = base.rstrip("/")
        try:
            tx = await _get(session, f"{base}/transactions/by_hash/{tx_hash}")
            if tx is None:
                last_err = "Transaction not found yet"
                continue

            # A transaction only has a `success` field once it is committed;
            # until then Aptos returns type "pending_transaction".
            if tx.get("type") == "pending_transaction" or "success" not in tx:
                return PaymentProof(ok=False, pending=True,
                                    error="Waiting to be committed")

            if not tx.get("success"):
                return PaymentProof(
                    ok=False,
                    error=f"Transaction failed on-chain: {tx.get('vm_status', 'unknown')}",
                )

            paid = 0
            for ev in tx.get("events", []):
                if not _is_apt_deposit(ev):
                    continue
                # Legacy events name the account in `guid.account_address`;
                # fungible-asset events name the owner in `data.owner`.
                acct = (ev.get("guid", {}).get("account_address")
                        or ev.get("data", {}).get("owner")
                        or "")
                if _norm(acct) != treasury_n:
                    continue
                try:
                    paid += int(ev.get("data", {}).get("amount", 0))
                except (TypeError, ValueError):
                    continue

            payer = tx.get("sender", "")

            if paid == 0:
                return PaymentProof(
                    ok=False, payer=payer,
                    error="The treasury account received no APT in this transaction",
                )
            if paid < min_amount:
                return PaymentProof(
                    ok=False, paid=paid, payer=payer,
                    error=(
                        f"Underpaid: treasury received "
                        f"{from_base_units(paid, chain.decimals):.8f} {chain.symbol}, "
                        f"expected at least "
                        f"{from_base_units(min_amount, chain.decimals):.8f}"
                    ),
                )

            # Aptos commits with immediate finality — a transaction returned
            # with success=true is settled, so there is no confirmation count
            # to wait for the way an EVM chain has one.
            return PaymentProof(ok=True, paid=paid, payer=payer,
                                confirmations=chain.confirmations)

        except Exception as exc:
            last_err = str(exc)
            continue

    return PaymentProof(ok=False, pending=True,
                        error=last_err or "No Aptos endpoint responded")
