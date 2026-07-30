#!/usr/bin/env python3
"""probe-forums.py — the technique that resolved the last 13 programmes.

Marketing pages are the one place a grant programme's real status is never
written. Discourse governance forums expose /search.json and /t/<id>.json, and
funding a programme requires a public proposal — so a forum cannot go quietly
stale the way a landing page can.

Two kinds of answer come out of this:
  · POSITIVE — a recent thread naming the programme and its funding
    (this is how Celo's grants were found to run as "Prezenti", not CeloPG)
  · NEGATIVE — zero grant threads on a chain's own governance forum is itself
    evidence the programme is gone (SKALE, Injective, Celestia, NEAR)

Usage:  python3 scripts/probe-forums.py
Then record findings in deploy/apex/programs.mjs, which is the source of truth.
"""
import json, subprocess, urllib.parse

F = [
 ("#7  SKALE",       "forum.skale.network",         "grant"),
 ("#9  Scroll",      "forum.scroll.io",             "grant"),
 ("#40 Injective",   "gov.injective.network",       "grant"),
 ("#32 Celestia",    "forum.celestia.org",          "grants program"),
 ("#36 NEAR",        "gov.near.org",                "grants program"),
 ("#22 Optimism",    "gov.optimism.io",             "grants season 10"),
 ("#15 Celo",        "forum.celo.org",              "Prezenti apply"),
]

def get(url):
    try:
        o=subprocess.run(["curl","-s","--max-time","20",url],capture_output=True,text=True,timeout=40).stdout
        return json.loads(o)
    except Exception:
        return None

for label, host, q in F:
    d = get(f"https://{host}/search.json?q={urllib.parse.quote(q)}%20order%3Alatest")
    print(f"\n{label:<16} {host}")
    if not d or not d.get("topics"):
        print("   (no results)"); continue
    for t in d["topics"][:4]:
        print(f"   {t['created_at'][:10]}  {t['title'][:74]}")
