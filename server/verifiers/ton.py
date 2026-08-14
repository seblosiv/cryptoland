"""
verifiers/ton.py — native TON payments.

── The problem this file exists to solve ────────────────────────────────────
Every other family hands the server a transaction hash. TON does not.
`adapters/ton.js::payNative()` returns `result.boc` from TonConnect — the
**signed external message**, a bag-of-cells the wallet broadcast. There is no
transaction hash at that moment because there is no transaction yet: a
validator has to include the message before one exists, and the hash it gets
is computed from the resulting transaction, not from anything the wallet knew.

So this verifier cannot look a hash up. It has to resolve a *message* to the
transaction that carried it, in three steps:

  1. Parse the BOC and compute the **representation hash of its root cell**.
     That value is the external message's identity on TON, and it is fully
     determined at signing time — which is why it is the only handle a wallet
     can hand back before inclusion.
  2. Ask an indexer which transaction consumed that message:
     `GET /api/v3/transactionsByMessage?msg_hash=<hex>&direction=in`.
     toncenter's v3 index keys inbound messages by exactly this hash.
  3. Read the resulting transaction's `out_msgs` and sum what went to the
     treasury.

Step 1 is implemented here in ~60 lines of pure stdlib rather than pulled from
`pytoniq`/`tonsdk`, because neither is in `server/requirements.txt` and a
payment path should not acquire a dependency to hash 200 bytes.

── Why the representation hash is what it is ────────────────────────────────
A TON cell hashes as `sha256(d1 ‖ d2 ‖ data ‖ depth(ref)… ‖ hash(ref)…)`, where
`d1 = refs + 8·exotic + 32·level` and `d2 = ⌊bits/8⌋ + ⌈bits/8⌉`. Two details
bite:

  * `d1` bit 4 (value 16) is a **BoC framing flag** ("this cell carries its own
    hashes"), not part of the cell, so it must be masked off before hashing.
    Leaving it in changes the hash of every cell that has it.
  * The data bytes are hashed **exactly as serialised**, including the
    completion tag in the final byte when the bit length is not a multiple of
    8. BoC already stores them that way, so re-padding is not just unnecessary,
    it is wrong.

Validated against mainnet, not against a spec reading — see the module's own
notes in documentation and the report: the body cell of message
`1aoECRZr3fgaqO8QHWF2CPmIlgxaRYKt/OBQPpjtbJg=` hashes to the
`message_content.hash` toncenter independently reports, and rebuilding the full
external-message cell around that body reproduces the message hash itself.

── What is still NOT proven ─────────────────────────────────────────────────
No BOC produced by a real TonConnect wallet has ever been through this code.
The proof above used a BOC re-serialised from a real mainnet external message,
which has the same cell hash but not the same bytes. Wallets that return a
non-standard BoC framing — the `has_idx` variant, the legacy `0x68ff65f3` /
`0xacc3a728` magics, or a hex-encoded BOC — are handled speculatively here and
have not been observed. Treat the first live TON payment as a test.
"""
from __future__ import annotations

import base64
import binascii
import hashlib
import os
from typing import Optional
from urllib.parse import quote

import aiohttp

from chain_pay import HEADERS, HTTP_TIMEOUT, ChainPayError, PaymentProof, from_base_units

# toncenter's free tier is ~1 request/second and this path makes one call per
# poll. An API key lifts that; it is optional and read from the environment
# because it is a credential.
_API_KEY = (os.getenv("TONCENTER_API_KEY") or os.getenv("CRYPTOLAND_TONCENTER_API_KEY") or "").strip()

_BOC_MAGIC = b"\xb5\xee\x9c\x72"


# ── addresses ────────────────────────────────────────────────────────────────
#
# TON is the reason the contract insists on canonical-form comparison. The SAME
# account has at least five valid string spellings:
#
#   0:04c99e67…83a82                                raw, lower case
#   0:04C99E67…83A82                                raw, upper case
#   EQAEyZ5nRykQlQSil20FMdiiz28_sbjVVuDOksh_YIg6gie  friendly, bounceable
#   UQAEyZ5nRykQlQSil20FMdiiz28_sbjVVuDOksh_YIg6gid  friendly, non-bounceable
#   …and each friendly form in standard base64 as well as base64url
#
# A treasury configured as `EQ…` compared as a string against the raw address an
# indexer returns rejects every correct payment. Both forms are reduced to
# `<workchain>:<32-byte hash, lower hex>` before anything is compared.

def _crc16(data: bytes) -> int:
    """CRC-16/XMODEM — the checksum in a user-friendly TON address."""
    crc = 0
    for byte in data:
        crc ^= byte << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) & 0xFFFF if crc & 0x8000 else (crc << 1) & 0xFFFF
    return crc


def _b64_any(text: str) -> Optional[bytes]:
    """Decode standard base64 or base64url, tolerating missing padding."""
    s = text.strip()
    pad = "=" * (-len(s) % 4)
    for fn in (base64.urlsafe_b64decode, base64.b64decode):
        try:
            return fn(s + pad)
        except Exception:
            continue
    return None


def normalize_address(addr: str) -> Optional[str]:
    """`<workchain>:<hex>` for any valid spelling, else None."""
    if not addr:
        return None
    s = str(addr).strip()

    if ":" in s:
        wc, _, tail = s.partition(":")
        tail = tail.strip().lower()
        try:
            wc_i = int(wc, 10)
        except ValueError:
            return None
        if len(tail) != 64:
            return None
        try:
            bytes.fromhex(tail)
        except ValueError:
            return None
        return f"{wc_i}:{tail}"

    raw = _b64_any(s)
    if raw is None or len(raw) != 36:
        return None
    tag = raw[0] & 0x7F               # high bit = test-only, not part of identity
    if tag not in (0x11, 0x51):       # bounceable / non-bounceable
        return None
    if _crc16(raw[:34]) != int.from_bytes(raw[34:36], "big"):
        # A bad checksum is a typo, not another encoding. Say so by refusing it
        # rather than silently comparing a corrupted address.
        return None
    wc = int.from_bytes(raw[1:2], "big", signed=True)
    return f"{wc}:{raw[2:34].hex()}"


# ── BOC → message hash ───────────────────────────────────────────────────────

def _parse_boc(raw: bytes) -> tuple[list[dict], list[int]]:
    """
    Deserialise a bag-of-cells into a flat cell list plus the root indices.

    Only the fields a representation hash needs are kept. Cells are stored in
    topological order with references pointing forward, which is what lets
    `_cell_hashes` resolve them in one reverse pass.
    """
    if len(raw) < 6:
        raise ChainPayError("Not a bag-of-cells: too short")
    if raw[0:4] != _BOC_MAGIC:
        raise ChainPayError("Not a standard bag-of-cells (bad magic)")

    flags = raw[4]
    has_idx = bool(flags & 0x80)
    size = flags & 0x07               # bytes per cell reference
    off_bytes = raw[5]
    if not 1 <= size <= 4 or not 1 <= off_bytes <= 8:
        raise ChainPayError("Malformed bag-of-cells header")

    pos = 6

    def take(n: int) -> int:
        nonlocal pos
        if pos + n > len(raw):
            raise ChainPayError("Truncated bag-of-cells")
        val = int.from_bytes(raw[pos:pos + n], "big")
        pos += n
        return val

    cell_count = take(size)
    root_count = take(size)
    take(size)                        # absent cells — always 0 in practice
    total = take(off_bytes)
    roots = [take(size) for _ in range(root_count)]
    if has_idx:
        pos += cell_count * off_bytes
    data = raw[pos:pos + total]

    cells: list[dict] = []
    cur = 0
    for _ in range(cell_count):
        if cur + 2 > len(data):
            raise ChainPayError("Truncated cell descriptor")
        d1, d2 = data[cur], data[cur + 1]
        cur += 2
        refs_n = d1 & 0x07
        level = d1 >> 5
        if d1 & 0x10:                 # cell carries its own hashes; skip them
            cur += (level + 1) * 32 + (level + 1) * 2
        data_len = (d2 >> 1) + (d2 & 1)
        cell_data = data[cur:cur + data_len]
        if len(cell_data) != data_len:
            raise ChainPayError("Truncated cell data")
        cur += data_len
        refs = []
        for _ in range(refs_n):
            refs.append(int.from_bytes(data[cur:cur + size], "big"))
            cur += size
        # Mask bit 4 back off: it is BoC framing, never part of the cell.
        cells.append({"d1": d1 & ~0x10, "d2": d2, "data": cell_data, "refs": refs})

    if not roots or any(r >= len(cells) for r in roots):
        raise ChainPayError("Bag-of-cells has no usable root")
    return cells, roots


def _cell_hashes(cells: list[dict]) -> tuple[list[bytes], list[int]]:
    hashes: list[Optional[bytes]] = [None] * len(cells)
    depths = [0] * len(cells)
    for i in range(len(cells) - 1, -1, -1):
        cell = cells[i]
        depth = 0
        for r in cell["refs"]:
            if r <= i or hashes[r] is None:
                raise ChainPayError("Bag-of-cells is not in topological order")
            depth = max(depth, depths[r] + 1)
        rep = bytes([cell["d1"], cell["d2"]]) + cell["data"]
        rep += b"".join(depths[r].to_bytes(2, "big") for r in cell["refs"])
        rep += b"".join(hashes[r] for r in cell["refs"])
        hashes[i] = hashlib.sha256(rep).digest()
        depths[i] = depth
    return hashes, depths  # type: ignore[return-value]


def message_hash(handle: str) -> str:
    """
    The 32-byte message hash, hex, for whatever the adapter handed us.

    Accepts a BOC (base64, base64url or hex — TonConnect returns base64), and
    also a bare 32-byte hash in hex or base64 so that a caller who already
    resolved one is not forced to re-encode it.
    """
    s = (handle or "").strip()
    if not s:
        raise ChainPayError("No TON transaction handle supplied")

    candidates: list[bytes] = []
    hexish = s[2:] if s.lower().startswith("0x") else s
    try:
        candidates.append(binascii.unhexlify(hexish))
    except Exception:
        pass
    decoded = _b64_any(s)
    if decoded is not None:
        candidates.append(decoded)

    for raw in candidates:
        if raw[:4] == _BOC_MAGIC:
            cells, roots = _parse_boc(raw)
            hashes, _ = _cell_hashes(cells)
            return hashes[roots[0]].hex()

    for raw in candidates:
        if len(raw) == 32:
            return raw.hex()

    raise ChainPayError("Unrecognised TON handle: not a bag-of-cells and not a 32-byte hash")


# ── indexer ──────────────────────────────────────────────────────────────────

def _api_bases(chain) -> list[str]:
    """
    Map each configured RPC to a toncenter v3 REST base.

    The registry points at `/api/v2/jsonRPC` because that is what the browser
    adapter uses. v2 has no way to ask "which transaction consumed this
    message", which is the only question this file has, so the v3 index is
    derived from the same host rather than hard-coded — an operator who points
    `VITE_RPC_TON` at their own toncenter keeps their own endpoint.
    """
    bases: list[str] = []
    for url in chain.rpcs:
        u = (url or "").strip().rstrip("/")
        if not u:
            continue
        if "/api/v2" in u:
            base = u.split("/api/v2")[0] + "/api/v3"
        elif u.endswith("/api/v3"):
            base = u
        else:
            base = u + "/api/v3"
        if base not in bases:
            bases.append(base)
    return bases


async def _get(session: aiohttp.ClientSession, url: str) -> dict:
    headers = dict(HEADERS)
    headers["Accept"] = "application/json"
    if _API_KEY:
        headers["X-API-Key"] = _API_KEY
    async with session.get(url, headers=headers, timeout=HTTP_TIMEOUT) as r:
        if r.status == 429:
            raise ChainPayError("Indexer rate limit")
        if r.status != 200:
            raise ChainPayError(f"Indexer HTTP {r.status}")
        return await r.json(content_type=None)


def _tx_failed(tx: dict) -> Optional[str]:
    """A human reason the transaction did not do what it was asked, or None."""
    descr = tx.get("description") or {}
    if descr.get("aborted"):
        return "Transaction aborted on-chain"
    compute = descr.get("compute_ph") or {}
    if not compute.get("skipped"):
        if compute.get("success") is False:
            return "Wallet contract rejected the transfer"
        try:
            if int(compute.get("exit_code") or 0) != 0:
                return f"Wallet contract exited {compute.get('exit_code')}"
        except (TypeError, ValueError):
            pass
    action = descr.get("action") or {}
    if action:
        if action.get("success") is False:
            return "Transfer was not sent (action phase failed)"
        try:
            if int(action.get("result_code") or 0) != 0:
                return f"Transfer was not sent (action code {action.get('result_code')})"
        except (TypeError, ValueError):
            pass
    return None


async def verify(
    chain,
    tx_hash: str,
    treasury: str,
    min_amount: int,
    session: aiohttp.ClientSession,
) -> PaymentProof:
    """
    Confirm a TON transfer reached the treasury.

    `tx_hash` is normally a BOC (see the module docstring). The transaction it
    resolves to is the **sender's** — the wallet's — so the amount comes from
    that transaction's outbound internal messages, filtered to the treasury.
    Wallets send with mode 3 (`PAY_GAS_SEPARATELY`), so the recipient is
    credited the full `value` and no fee is taken out of it.

    Residual assumption, stated because it cannot be checked cheaply: this
    proves the wallet *emitted* a message carrying `value` to the treasury, and
    TON guarantees delivery of a created internal message. It does not re-read
    the treasury's own side, so a message that bounces — which requires the
    treasury account to be uninitialised — would be counted. The treasury is our
    own funded account, so that cannot happen without us breaking it ourselves.
    """
    treasury_canon = normalize_address(treasury)
    if not treasury_canon:
        return PaymentProof(ok=False, error="Treasury address is not a valid TON address")

    try:
        msg_hash = message_hash(tx_hash)
    except ChainPayError as exc:
        # A handle we cannot even parse is a permanent verdict: no amount of
        # waiting turns it into a transaction.
        return PaymentProof(ok=False, error=str(exc))

    last_err = ""
    for base in _api_bases(chain):
        try:
            body = await _get(
                session,
                f"{base}/transactionsByMessage"
                f"?msg_hash={quote(msg_hash, safe='')}&direction=in&limit=10",
            )
            txs = body.get("transactions") or []

            if not txs:
                # The handle may have been a transaction hash rather than a
                # message hash — cheap to check, and it makes the verifier work
                # for anyone who resolved the BOC themselves.
                body = await _get(
                    session, f"{base}/transactions?hash={quote(msg_hash, safe='')}&limit=10"
                )
                txs = body.get("transactions") or []

            if not txs:
                return PaymentProof(
                    ok=False, pending=True,
                    error="Waiting for a validator to include the message",
                )

            tx = txs[0]
            failed = _tx_failed(tx)
            if failed:
                return PaymentProof(ok=False, error=failed)

            account = normalize_address(tx.get("account") or "")
            payer = ""
            paid = 0

            if account == treasury_canon:
                # The treasury's own transaction: the payment is its in_msg.
                in_msg = tx.get("in_msg") or {}
                if in_msg.get("bounced"):
                    return PaymentProof(ok=False, error="Payment bounced back to the sender")
                paid = int(in_msg.get("value") or 0)
                payer = normalize_address(in_msg.get("source") or "") or ""
            else:
                payer = account or ""
                for out in tx.get("out_msgs") or []:
                    if normalize_address(out.get("destination") or "") == treasury_canon:
                        paid += int(out.get("value") or 0)

            if paid <= 0:
                return PaymentProof(
                    ok=False, payer=payer,
                    error="Payment was not sent to the treasury address",
                )

            confs = 1
            if chain.confirmations > 1:
                # Only worth a second call when the registry actually asks for
                # depth: on TON a transaction the indexer can place in a
                # masterchain block is already committed.
                info = await _get(session, f"{base}/masterchainInfo")
                head = int((info.get("last") or {}).get("seqno") or 0)
                seen = int(tx.get("mc_block_seqno") or 0)
                confs = max(0, head - seen + 1) if seen else 0

            if paid < min_amount:
                return PaymentProof(
                    ok=False, paid=paid, payer=payer, confirmations=confs,
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

    return PaymentProof(ok=False, pending=True, error=last_err or "No TON indexer responded")
