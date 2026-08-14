"""
verifiers/tezos.py — confirm an XTZ payment landed in the treasury.

── The endpoint problem, stated plainly ──────────────────────────────────────
`chain.rpcs` for Tezos is [rpc.tzkt.io/mainnet, prod.tcinfra.net/rpc/mainnet].
Both are **bare Tezos node RPCs**, and a bare node RPC has no "fetch operation
by hash" route at all. An operation lives inside a block, so looking one up
means already knowing its level — the node is content-addressed by block, not by
operation. That is why adapters/tezos.js `waitForTx()` scans blocks rather than
querying a hash.

The **TzKT API** (`https://api.tzkt.io/v1/operations/transactions/{hash}`) is
built for exactly this question, and is run by the same operator as the
`rpc.tzkt.io` host already trusted in `config.js`.

🔴 **`api.tzkt.io` is NOT in `config.js` and is therefore NOT covered by
`scripts/check-rpcs.mjs`.** It is a real, undeclared third-party dependency of
the Tezos payment rail. Two things reduce the exposure but do not remove it:

  1. a transport failure here is `pending`, never a rejection, so a TzKT outage
     delays settlement instead of telling a buyer they did not pay; and
  2. `_verify_via_node()` below falls back to the CONFIGURED node RPCs with the
     same bounded block scan the adapter uses, so a recent payment still
     verifies with TzKT completely unavailable.

The fallback is bounded (`_MAX_SCAN` blocks) so a stalled poller can never fan
out into hundreds of RPC fetches. It covers the case that matters — a buyer who
paid moments ago — and returns `pending` for anything older, which is the
correct answer while our only hash index is down.

── Why the whole operation GROUP is summed ───────────────────────────────────
One Tezos operation hash covers a group: the manager operation the wallet signed
plus every `internal_operation_result` it triggered. A single hash can credit
several addresses — verified live against
`opTCGgQL7dK7dQHGWRrG75zPNieyZ8W1c9jdMZPh7WvipCTNrpo`, which pays 5000000 mutez
to a KT1 and then internally forwards 250000, 500000 and 4250000 mutez to three
different tz-addresses. Only the contents addressed to the treasury are counted.
"""
from __future__ import annotations

import re
from urllib.parse import urlparse

import aiohttp

from chain_pay import HEADERS, HTTP_TIMEOUT, PaymentProof, from_base_units
from chain_registry import Chain

# Validation-pass index of manager operations (transactions, originations) in a
# block. 0 = consensus, 1 = voting, 2 = anonymous, 3 = manager. Same constant
# adapters/tezos.js uses.
_MANAGER_PASS = 3

# How far back the node-RPC fallback will walk. Tezos blocks are ~8s, so 12
# blocks is ~1.6 minutes — comfortably longer than the gap between a wallet
# injecting a payment and the first verify poll.
_MAX_SCAN = 12

# base58check, 51 chars, "o" prefix. Base58 excludes 0, O, I and l.
_OPHASH_RE = re.compile(r"^o[1-9A-HJ-NP-Za-km-z]{50}$")


def _tzkt_api(chain: Chain) -> str:
    """
    The TzKT API host matching this build's network, derived from the configured
    node RPC rather than hard-coded, so a testnet build does not silently query
    mainnet. Mainnet (`https://api.tzkt.io/v1`) is the only one verified live;
    the `api.<net>.tzkt.io` shape for other networks follows TzKT's documented
    convention but is unverified here, and Shadownet in particular has had no
    working TzKT host since Ghostnet was retired (see adapters/tezos.js).
    """
    net = ""
    for raw in chain.rpcs:
        parts = [p for p in urlparse(raw or "").path.split("/") if p]
        if parts:
            net = parts[-1].lower()
            break
    if not net or net == "mainnet":
        return "https://api.tzkt.io/v1"
    return f"https://api.{net}.tzkt.io/v1"


async def _get_json(session: aiohttp.ClientSession, url: str):
    """GET returning (status, parsed-json-or-None). Raises only on transport."""
    async with session.get(url, headers=HEADERS, timeout=HTTP_TIMEOUT) as r:
        if r.status in (400, 404):
            # TzKT answers 400 for a hash that is not base58check-shaped and 404
            # for an unknown route; neither is a node failure.
            return r.status, None
        if r.status != 200:
            raise RuntimeError(f"HTTP {r.status}")
        return 200, await r.json(content_type=None)


def _settle(chain: Chain, paid: int, payer: str, confs: int, min_amount: int) -> PaymentProof:
    """The amount/confirmation verdict, shared by both lookup paths."""
    if paid < min_amount:
        return PaymentProof(
            ok=False,
            paid=paid,
            payer=payer,
            confirmations=confs,
            error=(
                f"Underpaid: treasury received {from_base_units(paid, chain.decimals):.6f} "
                f"{chain.symbol}, expected at least "
                f"{from_base_units(min_amount, chain.decimals):.6f}"
            ),
        )
    if confs < chain.confirmations:
        return PaymentProof(
            ok=False, pending=True, paid=paid, payer=payer, confirmations=confs,
            error=f"Confirming ({confs}/{chain.confirmations})",
        )
    return PaymentProof(ok=True, paid=paid, payer=payer, confirmations=confs)


# ── Path 1: the TzKT indexer ────────────────────────────────────────────────

async def _verify_via_tzkt(
    chain: Chain, op_hash: str, treasury: str, min_amount: int,
    session: aiohttp.ClientSession,
) -> PaymentProof | None:
    """
    Verdict via TzKT, or None to mean "TzKT could not answer — try the node".

    None is deliberately distinct from a pending PaymentProof: it hands control
    to the fallback, whereas a pending proof is already the final answer.
    """
    api = _tzkt_api(chain)

    status, ops = await _get_json(session, f"{api}/operations/transactions/{op_hash}")
    if status != 200 or ops is None:
        return None
    if not isinstance(ops, list) or not ops:
        # A well-formed hash TzKT has never seen returns []. Not indexed yet.
        return None

    paid = 0
    payer = ""
    level = 0
    saw_failed_to_treasury = False
    for op in ops:
        # Tezos addresses are base58check and MIXED CASE — tz1/tz2/tz3/tz4 and
        # KT1 differ from each other only in that prefix, and the trailing bytes
        # are a checksum over the raw key hash. `.lower()` would turn a valid
        # address into a string that decodes to nothing, so every comparison
        # would fail and no payment would ever verify. Compare as given.
        if (op.get("target") or {}).get("address") != treasury:
            continue
        if op.get("status") != "applied":
            # Tezos backtracks an entire group when any content fails, so this
            # means the transfer did not happen — a permanent verdict, not a wait.
            saw_failed_to_treasury = True
            continue
        paid += int(op.get("amount") or 0)
        level = level or int(op.get("level") or 0)
        if not payer:
            # `initiator` is the tz1 that signed the group; it is present only on
            # INTERNAL operations, where `sender` is the forwarding contract.
            # Prefer it so `payer` is always the human who paid.
            payer = (
                (op.get("initiator") or {}).get("address")
                or (op.get("sender") or {}).get("address")
                or ""
            )

    if paid <= 0:
        if saw_failed_to_treasury:
            return PaymentProof(
                ok=False,
                error="The transfer to the treasury did not succeed on-chain",
            )
        return PaymentProof(ok=False, error="Payment was not sent to the treasury address")

    status, head = await _get_json(session, f"{api}/head")
    if status != 200 or head is None:
        return None
    # TzKT reports which chain it is indexing. Free, and it is what stops a
    # testnet index from settling a mainnet sale.
    chain_id = head.get("chainId")
    if chain_id and chain.chain_id and chain_id != chain.chain_id:
        return None
    confs = max(0, int(head.get("level") or 0) - level + 1) if level else 0

    return _settle(chain, paid, payer, confs, min_amount)


# ── Path 2: the configured node RPCs, bounded block scan ────────────────────

def _sum_group(group: dict, treasury: str) -> tuple[int, str, bool]:
    """
    (mutez credited to the treasury, payer, saw-a-failed-transfer) for one
    operation group as a bare node RPC returns it.

    Node-RPC amounts are STRINGS; internal transfers live under
    `metadata.internal_operation_results` with their status under `result`,
    not `operation_result`.
    """
    paid = 0
    payer = ""
    failed = False
    for content in group.get("contents") or []:
        meta = content.get("metadata") or {}
        if content.get("kind") == "transaction" and content.get("destination") == treasury:
            if (meta.get("operation_result") or {}).get("status") == "applied":
                paid += int(content.get("amount") or 0)
                payer = payer or content.get("source") or ""
            else:
                failed = True
        for internal in meta.get("internal_operation_results") or []:
            if internal.get("kind") != "transaction" or internal.get("destination") != treasury:
                continue
            if (internal.get("result") or {}).get("status") == "applied":
                paid += int(internal.get("amount") or 0)
                # The group's own signer, not the forwarding contract in
                # `internal["source"]`.
                payer = payer or (content.get("source") or "")
            else:
                failed = True
    return paid, payer, failed


async def _verify_via_node(
    chain: Chain, op_hash: str, treasury: str, min_amount: int,
    session: aiohttp.ClientSession,
) -> PaymentProof:
    """Fallback for when TzKT is unreachable — see the module docstring."""
    last_err = ""
    for raw in chain.rpcs:
        base = (raw or "").rstrip("/")
        if not base:
            continue
        try:
            status, header = await _get_json(session, f"{base}/chains/main/blocks/head/header")
            if status != 200 or header is None:
                last_err = "Node returned no head header"
                continue
            if header.get("chain_id") and chain.chain_id and header["chain_id"] != chain.chain_id:
                last_err = f"Node at {base} is on '{header['chain_id']}', not {chain.chain_id}"
                continue
            head = int(header.get("level") or 0)
            if not head:
                last_err = "Node head has no level"
                continue

            for level in range(head, max(head - _MAX_SCAN, 0), -1):
                status, groups = await _get_json(
                    session, f"{base}/chains/main/blocks/{level}/operations/{_MANAGER_PASS}"
                )
                if status != 200 or not isinstance(groups, list):
                    continue
                group = next((g for g in groups if g.get("hash") == op_hash), None)
                if group is None:
                    continue
                paid, payer, failed = _sum_group(group, treasury)
                if paid <= 0:
                    if failed:
                        return PaymentProof(
                            ok=False,
                            error="The transfer to the treasury did not succeed on-chain",
                        )
                    return PaymentProof(ok=False, error="Payment was not sent to the treasury address")
                return _settle(chain, paid, payer, max(0, head - level + 1), min_amount)

            last_err = f"Operation not in the last {_MAX_SCAN} blocks"
        except Exception as exc:
            last_err = str(exc)
            continue

    return PaymentProof(ok=False, pending=True, error=last_err or "No Tezos endpoint responded")


# ── The contract ────────────────────────────────────────────────────────────

async def verify(
    chain: Chain,
    tx_hash: str,
    treasury: str,
    min_amount: int,
    session: aiohttp.ClientSession,
) -> PaymentProof:
    """
    Confirm an XTZ transfer credited the treasury.

    `tx_hash` is what `payNative()` in adapters/tezos.js returns: the Beacon
    OPERATION hash (`out.transactionHash ?? out.opHash`) — base58check with an
    "o" prefix, 51 characters. It is not a hex hash and must not be case-folded.

    The amount is `amount` in MUTEZ (1 XTZ = 1,000,000), read straight off the
    operation. Unlike Stellar there is no decimal-string conversion to get wrong:
    both TzKT and the node RPC report integers (the node reports them as
    integer-valued strings).

    Only `status == "applied"` counts. Anything else — failed, backtracked,
    skipped — means the group was rolled back and no XTZ moved.
    """
    op_hash = (tx_hash or "").strip()
    treasury = (treasury or "").strip()
    if not _OPHASH_RE.match(op_hash):
        # Pending rather than rejected: a malformed hash is much more likely a
        # value truncated in flight than a false claim we should deny outright.
        return PaymentProof(
            ok=False, pending=True,
            error="Not a Tezos operation hash yet (expected 51 base58 characters starting with 'o')",
        )
    if not treasury:
        return PaymentProof(ok=False, error="No treasury address configured")

    try:
        verdict = await _verify_via_tzkt(chain, op_hash, treasury, min_amount, session)
    except Exception:
        # A TzKT transport failure is not a verdict — fall through to the node.
        verdict = None
    if verdict is not None:
        return verdict

    return await _verify_via_node(chain, op_hash, treasury, min_amount, session)
