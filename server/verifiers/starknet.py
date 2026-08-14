"""
Starknet payment verification.

THE THING THAT MAKES THIS CHAIN DIFFERENT: on Starknet there is no native value
field to read. STRK is an ERC-20 token like any other — the fee token happens to
be a contract — so `starknet_getTransactionByHash` has no `value` for us and the
EVM shape (`tx.to == treasury`, `tx.value >= amount`) simply does not exist.

`src/lib/blockchain/adapters/starknet.js` -> `payNative()` sends

    contract_address: STRK_FEE_TOKEN
    entry_point:      'transfer'
    calldata:         [recipient, amount_low, amount_high]

so the only on-chain evidence of a payment is the `Transfer` event the STRK
contract emits. This module reads the receipt and sums those events.

Consequences worth stating, because they change the threat model:

  * The transaction's own `sender_address` is the ACCOUNT that ran the call, and
    an account contract can move somebody else's tokens only with an allowance.
    The `from` felt inside the Transfer event is whose balance actually dropped,
    so that is what we report as the payer.
  * A single INVOKE can carry many calls, and a real one routinely does — the
    receipt used to develop this had 69 events. We therefore sum ONLY the
    transfers whose `to` is the treasury, exactly as documentation/native-
    payments.md §6 requires. A multicall that pays the treasury 3 STRK and a DEX
    500 STRK is a 3 STRK payment.
  * We never trust an event's claimed emitter: `from_address` is stamped by the
    sequencer, so filtering on it is what stops "here is a Transfer event from my
    own worthless token" being accepted as STRK.
"""
from __future__ import annotations

from typing import Optional

import aiohttp

from chain_pay import PaymentProof, _rpc, from_base_units
from chain_registry import Chain


# ── the STRK fee token ───────────────────────────────────────────────────────
# MUST stay in step with STRK_FEE_TOKEN in
# src/lib/blockchain/adapters/starknet.js — that is the contract the wallet is
# told to call, and verifying a different one would accept a different token as
# payment. There is no shared source of truth for it (the adapter hardcodes it
# too), so it is checked against the chain instead of taken on faith:
#
#   starknet_call symbol()   -> ['0x0', '0x5354524b', '0x4']   ByteArray "STRK"
#   starknet_call decimals() -> 0x12                           = 18
#
# run against both mainnet endpoints in chain_registry on 2026-08-14, and 18
# matches CHAINS['starknet'].decimals so quotes and receipts share a unit.
STRK_FEE_TOKEN = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d"

# starknet_keccak("Transfer") = keccak256("Transfer") truncated to its low 250
# bits. Hardcoded rather than computed so this module needs no keccak
# implementation at import time; recompute with:
#
#   from eth_hash.auto import keccak
#   hex(int.from_bytes(keccak(b"Transfer"), "big") & ((1 << 250) - 1))
TRANSFER_SELECTOR = "0x99cd8bde557814842a3121e8ddfd433a539b8c9f14bf31ebf108d12e6196e9"

# Cairo u256 is two felts on the wire: value = low + (high << 128).
U256_SHIFT = 128


def _felt(value) -> Optional[str]:
    """
    Canonical form of a Starknet address/felt.

    THE TRAP, and it is a real one: a felt is a NUMBER, not a fixed-width byte
    string. The adapter sends the treasury as
    `0x04718f…` while the RPC returned that same contract in event
    `from_address` as `0x4718f…` — same address, different string. A naive
    `a.lower() == b.lower()` therefore rejects a payment that was made
    correctly, which is the worst failure this module could have.

    Strip the padding and compare the number. Same rule, and the same
    implementation, as normalizeAddress() in the adapter — they have to agree or
    the browser and the server disagree about who owns what.
    """
    if value is None:
        return None
    raw = str(value).strip().lower()
    if not raw:
        return None
    if raw.startswith("0x"):
        body = raw[2:]
    elif raw.isdigit():
        # Some tooling hands felts back as decimal strings.
        body = format(int(raw), "x")
    else:
        body = raw
    body = body.lstrip("0")
    if body and (len(body) > 64 or any(c not in "0123456789abcdef" for c in body)):
        return None
    return f"0x{body or '0'}"


def _transfer_amount_to(event: dict, treasury_felt: str) -> tuple[Optional[str], int]:
    """
    (payer, amount) for one STRK Transfer event, or (None, 0) if it is not a
    transfer to the treasury.

    Two on-wire layouts exist and both are accepted, because which one you get is
    a property of the token's compiler, not of the payment:

        Cairo 1  keys = [selector, from, to]   data = [low, high]
        Cairo 0  keys = [selector]             data = [from, to, low, high]

    The live STRK contract is Cairo 1 (verified against mainnet), so that path is
    the one that runs; the legacy branch costs three lines and cannot be
    ambiguous, since a Cairo 1 event always carries three keys.
    """
    keys = event.get("keys") or []
    data = event.get("data") or []
    if not keys or _felt(keys[0]) != _felt(TRANSFER_SELECTOR):
        return None, 0

    if len(keys) >= 3 and len(data) >= 2:
        frm, to, low, high = keys[1], keys[2], data[0], data[1]
    elif len(data) >= 4:
        frm, to, low, high = data[0], data[1], data[2], data[3]
    else:
        return None, 0

    if _felt(to) != treasury_felt:
        return None, 0

    amount = int(str(low), 16) + (int(str(high), 16) << U256_SHIFT)
    return _felt(frm), amount


async def verify(
    chain: Chain,
    tx_hash: str,
    treasury: str,
    min_amount: int,
    session: aiohttp.ClientSession,
) -> PaymentProof:
    """
    Confirm the treasury received >= min_amount STRK in this transaction.

    Same endpoint discipline as verify_evm: every URL in chain.rpcs is tried
    before the payment is called bad, and anything that is only a transport or
    indexing failure comes back `pending`. A non-existent hash raises
    TXN_HASH_NOT_FOUND out of `_rpc`, which lands in the same bucket — "not
    indexed yet" and "never existed" are indistinguishable from here, and the
    safe reading of an ambiguous answer is "ask again later", never "you did not
    pay".
    """
    treasury_felt = _felt(treasury)
    if not treasury_felt or treasury_felt == "0x0":
        # A misconfigured treasury must not silently match the burn address.
        return PaymentProof(ok=False, error="Treasury address is not a valid Starknet felt")

    last_err = ""
    for url in chain.rpcs:
        try:
            receipt = await _rpc(session, url, "starknet_getTransactionReceipt", [tx_hash])
            if not receipt:
                last_err = "Transaction not found yet"
                continue

            # REVERTED is a settled fact about a settled transaction: the
            # transfer did not happen and never will under this hash.
            exec_status = str(receipt.get("execution_status") or "").upper()
            if exec_status and exec_status != "SUCCEEDED":
                return PaymentProof(
                    ok=False,
                    error=f"Transaction did not succeed on-chain ({exec_status.title()})",
                )

            # RECEIVED / PRE_CONFIRMED transactions have no block yet. They are
            # real and will very likely land — poll, do not judge.
            mined_in = receipt.get("block_number")
            if mined_in is None:
                finality = str(receipt.get("finality_status") or "unconfirmed")
                return PaymentProof(ok=False, pending=True, error=f"Waiting to be included ({finality})")

            paid = 0
            payer = ""
            for event in receipt.get("events") or []:
                if _felt(event.get("from_address")) != _felt(STRK_FEE_TOKEN):
                    continue  # some other token's Transfer — not money to us
                frm, amount = _transfer_amount_to(event, treasury_felt)
                if amount:
                    paid += amount
                    payer = payer or (frm or "")

            head = int(await _rpc(session, url, "starknet_blockNumber", []))
            confs = max(0, head - int(mined_in) + 1)

            if paid == 0:
                return PaymentProof(
                    ok=False,
                    confirmations=confs,
                    error="No STRK from this transaction reached the treasury address",
                )

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

    return PaymentProof(ok=False, pending=True, error=last_err or "No RPC endpoint responded")
