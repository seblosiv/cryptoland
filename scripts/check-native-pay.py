#!/usr/bin/env python3
"""
check-native-pay.py — is native wallet payment actually ready on each chain?

Pre-flight, in the same spirit as scripts/check-rpcs.mjs: run it before turning
the path on, and before every submission round. It spends nothing and signs
nothing — it only asks the four questions that decide whether a real buyer's
payment could be priced and verified today:

  1. does the registry allow native payment on this chain?   (gasless/halted)
  2. is there a verifier for its family?                     (server/verifiers/)
  3. is a treasury address configured?                       (env)
  4. does the price feed answer for its token?               (live CoinGecko)

and then actually builds a quote for a real tile, which exercises the pricing
port, the USD→base-unit maths and the rate cache together.

    server/.venv/bin/python scripts/check-native-pay.py
    server/.venv/bin/python scripts/check-native-pay.py base solana
    CRYPTOLAND_TREASURY_EVM=0x… server/.venv/bin/python scripts/check-native-pay.py

Exit code is 1 if any chain is MISCONFIGURED — that is, it looks enabled but
would fail a real payment. Chains that are simply not set up yet are reported
as OFF and do not fail the run: an unconfigured chain degrades to the off-chain
rail by design, which is not an error.

Reads live prices, so it is deliberately NOT part of `pytest server/tests`.
"""
import argparse
import asyncio
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "server"))

import aiohttp  # noqa: E402

import chain_pay  # noqa: E402
from chain_registry import CHAINS  # noqa: E402

# A real, unremarkable land tile — Germany, so it exercises a populated pricing
# region rather than the ocean fallback.
SAMPLE_TX, SAMPLE_TY = 8600, 5400

GREEN, RED, YELLOW, DIM, RESET = "\033[32m", "\033[31m", "\033[33m", "\033[2m", "\033[0m"
if not sys.stdout.isatty():
    GREEN = RED = YELLOW = DIM = RESET = ""


async def check(chain, session):
    """-> (state, detail) where state is READY | OFF | BROKEN."""
    if not chain.native_pay:
        return "OFF", chain.native_pay_note

    if not chain_pay.family_supported(chain.family):
        return "OFF", f"no verifier for family '{chain.family}'"

    treasury = chain_pay.treasury_for(chain)
    if not treasury:
        return "OFF", "no treasury configured (CRYPTOLAND_TREASURY_*)"

    # Past here the chain LOOKS enabled, so anything that fails is a real
    # misconfiguration a buyer would hit — not a chain nobody switched on.
    try:
        rate = await chain_pay.usd_per_native(chain, session=session)
    except Exception as exc:
        return "BROKEN", f"price feed: {exc}"

    try:
        quote = await chain_pay.build_quote(
            tx=SAMPLE_TX, ty=SAMPLE_TY, chain_key=chain.key,
            owner="preflight", session=session,
        )
    except Exception as exc:
        return "BROKEN", f"quote: {exc}"

    if quote.native_amount <= 0:
        return "BROKEN", "quote produced a zero on-chain amount"

    return "READY", (
        f"${quote.price_usd} = {quote.native_display} {quote.symbol} "
        f"@ ${rate:,.4f} → {treasury[:10]}…"
    )


async def warm_prices(chains, session):
    """
    Fetch every token's price in ONE request and seed the rate cache.

    Without this the sweep asks CoinGecko once per chain, and ~20 sequential
    calls trips the free tier's rate limit — reporting a dozen perfectly healthy
    chains as BROKEN because the checker DDoSed itself. `simple/price` takes a
    comma-separated id list, so one call covers all 34.

    Best-effort: on failure each chain just fetches its own price as before.
    """
    ids = sorted({c.coingecko_id for c in chains if c.coingecko_id})
    if not ids:
        return
    url = ("https://api.coingecko.com/api/v3/simple/price"
           f"?ids={','.join(ids)}&vs_currencies=usd")
    try:
        async with session.get(url, headers=chain_pay.HEADERS,
                               timeout=chain_pay.HTTP_TIMEOUT) as r:
            if r.status != 200:
                print(f"{YELLOW}  price pre-fetch: HTTP {r.status} "
                      f"— falling back to per-chain lookups{RESET}\n")
                return
            data = await r.json()
    except Exception as exc:
        print(f"{YELLOW}  price pre-fetch failed ({exc}); per-chain lookups{RESET}\n")
        return

    now = time.time()
    got = 0
    for cg_id, payload in data.items():
        usd = float(payload.get("usd") or 0)
        if usd > 0:
            chain_pay._rate_cache[cg_id] = (usd, now)
            got += 1
    print(f"{DIM}  priced {got}/{len(ids)} tokens in one request{RESET}\n")


async def main(keys):
    chains = [CHAINS[k] for k in keys] if keys else list(CHAINS.values())
    missing = [k for k in keys if k not in CHAINS]
    if missing:
        print(f"{RED}unknown chain(s): {', '.join(missing)}{RESET}")
        return 2

    print(f"{DIM}tile {SAMPLE_TX}:{SAMPLE_TY} · live prices · nothing is spent{RESET}\n")

    counts = {"READY": 0, "OFF": 0, "BROKEN": 0}
    async with aiohttp.ClientSession() as session:
        await warm_prices(chains, session)
        for chain in chains:
            state, detail = await check(chain, session)
            counts[state] += 1
            colour = {"READY": GREEN, "OFF": DIM, "BROKEN": RED}[state]
            print(f"  {colour}{state:<7}{RESET} {chain.key:<14} {DIM}{detail}{RESET}")

    print()
    print(f"  {GREEN}{counts['READY']} ready{RESET} · "
          f"{DIM}{counts['OFF']} off{RESET} · "
          f"{RED if counts['BROKEN'] else DIM}{counts['BROKEN']} broken{RESET}")

    if counts["BROKEN"]:
        print(f"\n{RED}A chain above advertises native payment but would fail a real "
              f"purchase. Fix or unset its treasury before shipping.{RESET}")
        return 1
    if counts["READY"] == 0:
        print(f"\n{YELLOW}No chain accepts native payment yet. Set a treasury address "
              f"— e.g. CRYPTOLAND_TREASURY_EVM=0x… covers all EVM chains at once.{RESET}")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("chains", nargs="*", help="chain keys to check (default: all)")
    args = ap.parse_args()
    sys.exit(asyncio.run(main([c.lower() for c in args.chains])))
