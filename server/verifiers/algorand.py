"""
verifiers/algorand.py — confirm an ALGO payment landed in the treasury.

── Why the INDEXER and not the algod host in config.js ───────────────────────
`chain.rpcs` for Algorand is [mainnet-api.4160.nodely.dev,
mainnet-api.algonode.cloud] — both **algod** (node) endpoints. algod is the
right thing for adapters/algorand.js, which submits with `sendRawTransaction`
and then polls `/v2/transactions/pending/{txid}`, but it is the wrong thing
here: algod keeps only a short rolling window of transactions it has recently
seen in its pool, and once a txn ages out of that window the same path 404s.
A verifier that ran a minute late would read a settled payment as "not found".

The **indexer** is the service that answers "give me transaction X" for the
whole chain history, over `GET /v2/transactions/{txid}`. Its hostname is the
algod hostname with `-api.` swapped for `-idx.`, which is how the endpoints
below are derived — so a paid RPC override in `config.js` carries across
automatically instead of being silently ignored.

**This is an endpoint not present in `config.js` and therefore not covered by
`scripts/check-rpcs.mjs`.** Both derived hosts (mainnet-idx.4160.nodely.dev and
mainnet-idx.algonode.cloud) were confirmed live while writing this; neither is
health-checked by the pre-flight sweep. If `check-rpcs.mjs` grows an Algorand
row, add the indexer alongside the algod host.

One thing the indexer gives us for free that algod does not: `current-round`
comes back in the same response as the transaction, so the confirmation count
costs no extra request.
"""
from __future__ import annotations

import aiohttp

from chain_pay import HEADERS, HTTP_TIMEOUT, PaymentProof, from_base_units
from chain_registry import Chain

# Last-resort indexers for Algorand MAINNET, used only when the derivation from
# chain.rpcs yields nothing (e.g. a private algod whose host does not follow the
# -api./-idx. convention). Deliberately gated on the mainnet genesis id — a
# testnet build must never silently fall back to a mainnet indexer.
_MAINNET_INDEXERS = (
    "https://mainnet-idx.algonode.cloud",
    "https://mainnet-idx.4160.nodely.dev",
)
_MAINNET_GENESIS = "mainnet-v1.0"


def _indexers(chain: Chain) -> list[str]:
    urls: list[str] = []
    for raw in chain.rpcs:
        u = (raw or "").rstrip("/")
        if not u:
            continue
        # Nodely and AlgoNode both name the pair …-api.<host> / …-idx.<host>.
        cand = u.replace("-api.", "-idx.") if "-api." in u else None
        if cand and cand not in urls:
            urls.append(cand)
    if chain.chain_id == _MAINNET_GENESIS:
        for k in _MAINNET_INDEXERS:
            if k not in urls:
                urls.append(k)
    return urls


async def _get(session: aiohttp.ClientSession, url: str):
    """GET returning (status, parsed-json-or-None). Raises only on transport."""
    async with session.get(url, headers=HEADERS, timeout=HTTP_TIMEOUT) as r:
        if r.status in (400, 404):
            # 404 = unknown txid, 400 = not decodable as a txid. Both are
            # "we have nothing", not "the node broke".
            return r.status, None
        if r.status != 200:
            raise RuntimeError(f"Algorand indexer HTTP {r.status}")
        return 200, await r.json(content_type=None)


async def verify(
    chain: Chain,
    tx_hash: str,
    treasury: str,
    min_amount: int,
    session: aiohttp.ClientSession,
) -> PaymentProof:
    """
    Confirm a plain `pay` transaction credited the treasury in microAlgos.

    `tx_hash` is what `payNative()` in adapters/algorand.js returns: the
    Algorand txid — 52 characters of base32 (a 32-byte SHA-512/256 digest),
    NOT a hex hash. It comes from `sent.txid ?? sent.txId ?? txn.txID()`.

    Strict about type, for two reasons that are not the same:

      * `tx-type` must be `"pay"`. An `axfer` moves an ASA — including USDC, or
        a token the payer minted himself a second earlier and named "ALGO" —
        and an ASA is not the native token. `axfer` carries its amount under
        `asset-transfer-transaction`, so reading `payment-transaction` on one
        would simply find nothing; rejecting it explicitly says why.
      * a top-level `appl` can move ALGO through `inner-txns`. Our adapter never
        emits one, and attributing an inner payment to the caller is the same
        ambiguity `verify_evm` refuses when it insists on a direct transfer.

    `paid` is what the TREASURY received, which on Algorand is up to two fields:
    `amount` when it is the `receiver`, plus `close-amount` when it is also the
    `close-remainder-to` — a closing payment sweeps the sender's entire residual
    balance to that address, and a buyer who closed their account into our
    treasury demonstrably paid us both.
    """
    endpoints = _indexers(chain)
    if not endpoints:
        return PaymentProof(
            ok=False, pending=True,
            error="No Algorand indexer could be derived from the configured endpoints",
        )

    # Algorand txids and addresses are unpadded base32 over the UPPERCASE
    # alphabet [A-Z2-7], and the last 4 bytes of an address are a checksum over
    # the public key. Case-folding either one yields a string that decodes to
    # different bytes — `.lower()` here would make every comparison fail. Strip
    # whitespace and change nothing else.
    txid = (tx_hash or "").strip()
    treasury = (treasury or "").strip()
    if not txid:
        return PaymentProof(ok=False, pending=True, error="No Algorand transaction id yet")
    if not treasury:
        return PaymentProof(ok=False, error="No treasury address configured")

    last_err = ""
    for base in endpoints:
        try:
            status, body = await _get(session, f"{base}/v2/transactions/{txid}")
            if status != 200 or body is None:
                # Not indexed yet, or never existed. Ask again later.
                last_err = "Transaction not indexed yet"
                continue

            txn = body.get("transaction") or {}
            if not txn:
                last_err = "Indexer returned no transaction body"
                continue

            # The indexer echoes which network it is serving. Free, and it is the
            # only thing standing between a misconfigured endpoint and a TestNet
            # payment settling a MainNet tile — an Algorand keypair produces the
            # SAME address on every network, so the mismatch is otherwise silent.
            genesis = txn.get("genesis-id")
            if genesis and chain.chain_id and genesis != chain.chain_id:
                last_err = f"Indexer at {base} is serving '{genesis}', not {chain.chain_id}"
                continue

            tx_type = txn.get("tx-type")
            if tx_type != "pay":
                return PaymentProof(
                    ok=False,
                    error=(
                        f"Not a native {chain.symbol} payment (transaction type '{tx_type}'). "
                        "An ASA transfer or application call does not settle a tile."
                    ),
                )

            pay = txn.get("payment-transaction") or {}
            paid = 0
            if pay.get("receiver") == treasury:
                paid += int(pay.get("amount") or 0)
            if pay.get("close-remainder-to") == treasury:
                paid += int(pay.get("close-amount") or 0)

            if paid <= 0:
                return PaymentProof(
                    ok=False,
                    error="Payment was not sent to the treasury address",
                )

            payer = txn.get("sender") or ""
            confirmed = int(txn.get("confirmed-round") or 0)
            if not confirmed:
                return PaymentProof(
                    ok=False, pending=True, paid=paid, payer=payer,
                    error="Waiting to be confirmed in a round",
                )

            head = int(body.get("current-round") or 0)
            confs = max(0, head - confirmed + 1) if head else 0

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

            # Algorand blocks are final the moment they are written — the
            # protocol has no forks to reorganise — so chain.confirmations is 1
            # and this is really "has a round been committed".
            if confs < chain.confirmations:
                return PaymentProof(
                    ok=False, pending=True, paid=paid, payer=payer, confirmations=confs,
                    error=f"Confirming ({confs}/{chain.confirmations})",
                )

            return PaymentProof(ok=True, paid=paid, payer=payer, confirmations=confs)

        except Exception as exc:
            last_err = str(exc)
            continue

    return PaymentProof(ok=False, pending=True, error=last_err or "No Algorand indexer responded")
