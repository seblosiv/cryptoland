"""
verifiers/solana.py — SOL payments.

The client half is `payNative()` in `src/lib/blockchain/adapters/solana.js`: it
builds a single `SystemProgram.transfer` and hands the wallet either
`signAndSendTransaction` or `signTransaction` + `sendRawTransaction`. Either way
what comes back — and what arrives here as `tx_hash` — is the **first signature
of the transaction, base58-encoded**. Solana calls that the "transaction
signature"; it is the thing `getTransaction` takes and the thing solscan puts in
a URL. It is not a hash of anything, which matters for one reason: an
ill-formed value makes the RPC reject the *parameter* rather than answer "not
found", so both outcomes have to end up as `pending`.

── Why the amount comes from the balance deltas ──────────────────────────────
`meta.preBalances` / `meta.postBalances` are parallel to the transaction's
resolved account list, so

    paid = postBalances[i(treasury)] - preBalances[i(treasury)]

is the treasury's *net* lamport change across the whole transaction. That is
what "what the treasury received" actually means, and it survives every
instruction shape: one transfer, five transfers, a transfer nested in a CPI, or
a transfer emitted by a program we have never heard of. Parsing
`instructions[].parsed` instead would read only the top level and would miss
CPI'd lamport movement entirely — and "sum only the outputs to `treasury`" is
exactly a net-delta question, because a transaction can credit the same account
from several instructions at once.

The delta is also the honest number in the one case where the two disagree: if a
transaction credits the treasury 2 SOL and debits it 1.9 SOL, the treasury
received 0.1 SOL, and no amount of instruction parsing should be allowed to
report 2.

── Why `chain.confirmations = 32` is read as "finalized" ─────────────────────
Solana does not have EVM-style confirmation depth. A slot becomes *rooted* when
a supermajority of stake has voted it in — which happens roughly 32 slots after
the block, which is where the 32 in the registry comes from. Once rooted the
slot is final by construction, so the meaningful test is not "count 32 blocks",
it is "is `confirmationStatus` finalized". `getSignatureStatuses` reports that
directly (and sets `confirmations: null` for a rooted slot precisely because
counting stops being meaningful), so a `finalized` status satisfies the
registry's 32 outright. A transaction that is merely `confirmed` still reports
its numeric depth so the UI can show honest progress.

── Address comparison ────────────────────────────────────────────────────────
Solana addresses are base58 of a 32-byte ed25519 public key, and base58's
alphabet is **case-significant** — `A` and `a` are different digits, so
`So1...` and `so1...` are different keys. Lower-casing either side, as the EVM
verifier correctly does for hex, would let two genuinely distinct addresses
compare equal, which is a payment credited to the wrong recipient. So the
comparison here is an exact string match on the canonical base58 form (a 32-byte
key has exactly one such encoding, so there is no second form to normalise to).
Only surrounding whitespace is stripped.
"""
from __future__ import annotations

import aiohttp

from chain_pay import ChainPayError, PaymentProof, _rpc, from_base_units
from chain_registry import Chain

# The System program's transfer is what the adapter builds, but nothing here
# requires it: the balance delta is agnostic to which program moved the money.
_COMMITMENT_SEEN = "confirmed"   # earliest point a payment is worth reporting on
_COMMITMENT_FINAL = "finalized"  # the point it becomes irreversible


def _account_list(tx: dict) -> list[str]:
    """
    The transaction's fully resolved account list, in the order the balance
    arrays use.

    With `encoding: jsonParsed` the RPC resolves address-lookup-table entries
    into `message.accountKeys` (each entry carrying `source: "lookupTable"`), so
    normally this is just a field read. Older nodes, and any node answering a
    legacy encoding, return only the static keys — and then the balance arrays
    are longer than the key list. In that case the documented layout is
    `static keys, then loadedAddresses.writable, then loadedAddresses.readonly`,
    so we rebuild it rather than fail to find a treasury that lives in a lookup
    table. Getting this wrong would report a real payment as "not sent to the
    treasury", which is a permanent rejection — the worst verdict to be wrong
    about.
    """
    msg = (tx.get("transaction") or {}).get("message") or {}
    keys = [k.get("pubkey") if isinstance(k, dict) else k for k in (msg.get("accountKeys") or [])]

    meta = tx.get("meta") or {}
    if len(keys) < len(meta.get("preBalances") or []):
        loaded = meta.get("loadedAddresses") or {}
        keys += list(loaded.get("writable") or [])
        keys += list(loaded.get("readonly") or [])
    return [str(k) for k in keys if k]


async def _confirmations(session, url, chain: Chain, tx_hash: str, slot: int) -> tuple[int, bool]:
    """
    (confirmations, is_final).

    `getSignatureStatuses` is the authority: it is the only call that reports
    Solana's own notion of commitment. `searchTransactionHistory` is required or
    an older signature simply comes back null even though it is long finalized.
    """
    try:
        res = await _rpc(
            session, url, "getSignatureStatuses",
            [[tx_hash], {"searchTransactionHistory": True}],
        )
        status = ((res or {}).get("value") or [None])[0]
    except ChainPayError:
        status = None

    if status:
        # `confirmations: null` means rooted — the node has stopped counting
        # because the slot can no longer be rolled back.
        if status.get("confirmationStatus") == _COMMITMENT_FINAL or status.get("confirmations") is None:
            return max(chain.confirmations, 1), True
        return int(status.get("confirmations") or 0), False

    # Fallback for a node that will not answer getSignatureStatuses: if the
    # finalized head has already passed the transaction's slot, that slot is
    # rooted and the transaction with it.
    head = int(await _rpc(session, url, "getSlot", [{"commitment": _COMMITMENT_FINAL}]) or 0)
    if slot and head >= slot:
        return max(chain.confirmations, 1), True
    return 0, False


async def verify(
    chain: Chain,
    tx_hash: str,
    treasury: str,
    min_amount: int,
    session: aiohttp.ClientSession,
) -> PaymentProof:
    """Confirm `tx_hash` credited `treasury` at least `min_amount` lamports."""
    treasury = (treasury or "").strip()
    if not treasury:
        return PaymentProof(ok=False, error="No treasury address configured for Solana")

    signature = (tx_hash or "").strip()
    if not signature:
        return PaymentProof(ok=False, pending=True, error="No transaction signature yet")

    last_err = ""
    for url in chain.rpcs:
        try:
            tx = await _rpc(
                session, url, "getTransaction",
                [signature, {
                    "encoding": "jsonParsed",
                    "maxSupportedTransactionVersion": 0,
                    "commitment": _COMMITMENT_SEEN,
                }],
            )
            if tx is None:
                # Not in this node's ledger yet, or its history window has
                # rolled past it. Both mean "ask another node, then ask again".
                last_err = "Transaction not found yet"
                continue

            meta = tx.get("meta") or {}
            if meta.get("err") is not None:
                # The runtime rolled the whole transaction back, so no lamports
                # moved. Permanent: re-polling can never turn this into a
                # payment.
                return PaymentProof(ok=False, error="Transaction failed on-chain")

            keys = _account_list(tx)
            pre = meta.get("preBalances") or []
            post = meta.get("postBalances") or []
            if not keys or len(keys) != len(pre) or len(pre) != len(post):
                # A shape we do not understand must not become a verdict.
                raise ChainPayError("Balance arrays do not line up with the account list")

            payer = keys[0] if keys else ""   # index 0 is always the fee payer

            idxs = [i for i, k in enumerate(keys) if k == treasury]
            if not idxs:
                return PaymentProof(
                    ok=False,
                    payer=payer,
                    error="Payment was not sent to the treasury address",
                )

            # Sum across every index the treasury occupies. The runtime
            # deduplicates the account list so this is normally one entry, but
            # summing costs nothing and cannot under-report.
            #
            # This is a NET delta by construction. If the treasury were also the
            # fee payer the fee would be netted out of it — correctly, because
            # the treasury would really be that much poorer. Our flow never
            # makes the treasury sign, so it does not arise in practice.
            paid = sum(int(post[i]) - int(pre[i]) for i in idxs)

            if paid <= 0:
                return PaymentProof(
                    ok=False,
                    payer=payer,
                    error="The treasury account received no SOL in this transaction",
                )

            slot = int(tx.get("slot") or 0)
            confs, final = await _confirmations(session, url, chain, signature, slot)

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

            if not final:
                return PaymentProof(
                    ok=False, pending=True, paid=paid, payer=payer, confirmations=confs,
                    error=f"Confirming ({confs}/{chain.confirmations})",
                )

            return PaymentProof(ok=True, paid=paid, payer=payer, confirmations=confs)

        except Exception as exc:
            # Includes a malformed signature, which the RPC rejects as a bad
            # parameter rather than answering "not found".
            last_err = str(exc)
            continue

    # Every endpoint failed. Pending, not rejected — the money may well be there.
    return PaymentProof(ok=False, pending=True, error=last_err or "No RPC endpoint responded")
