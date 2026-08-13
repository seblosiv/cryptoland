"""
research.py — find the REAL route and the CURRENT status for the programmes whose
forms turned out wrong or closed (§21), plus a status re-check on the rest.

Two sources, deliberately:

  1. SearXNG (local, already proxied through the ISP pool) — broad, but a
     marketing page can go stale for a year without anyone noticing.
  2. Discourse governance forums, via each forum's own /search.json — CLAUDE.md
     §14 calls this the decisive technique: funding a programme requires a public
     proposal, so a governance forum cannot go quietly stale the way a landing
     page can. Absence of recent grant threads is itself evidence.

Output: research.json — ranked candidate URLs and dated forum threads per
programme, for a browser pass to confirm. Nothing here is treated as a conclusion.
"""
import json
import pathlib
import re
import time
import urllib.parse
import urllib.request

HERE = pathlib.Path(__file__).parent
SEARX = "http://127.0.0.1:8888/search"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"

# The programmes §21 invalidated, plus the high-value ones worth re-confirming.
TARGETS = [
    {"n": 17, "name": "MultiversX Growth Games", "site": "multiversx.com",
     "forum": None, "q": ["MultiversX Growth Games grant apply", "MultiversX grants program application 2026"]},
    {"n": 34, "name": "Solana Foundation Grants", "site": "solana.org",
     "forum": None, "q": ["Solana Foundation grants application form", "solana.org grants apply 2026"]},
    {"n": 31, "name": "Arbitrum Foundation Grants", "site": "arbitrum.foundation",
     "forum": "https://forum.arbitrum.foundation", "q": ["Arbitrum Foundation grant program apply 2026", "Arbitrum grants application open"]},
    {"n": 59, "name": "The Graph Foundation", "site": "thegraph.com",
     "forum": "https://forum.thegraph.com", "q": ["The Graph Foundation grants apply 2026", "The Graph grant program application"]},
    {"n": 2, "name": "Gitcoin / Giveth QF", "site": "giveth.io",
     "forum": "https://forum.giveth.io", "q": ["Giveth QF round apply project", "Gitcoin grants round application 2026"]},
    {"n": 9, "name": "Scroll Community Grants", "site": "scroll.io",
     "forum": "https://forum.scroll.io", "q": ["Scroll community grants apply 2026"]},
    {"n": 25, "name": "Polygon Community Grants", "site": "polygon.technology",
     "forum": "https://forum.polygon.technology", "q": ["Polygon community grants season apply 2026"]},
    {"n": 15, "name": "Celo Prezenti", "site": "prezenti.xyz",
     "forum": "https://forum.celo.org", "q": ["Prezenti Celo grants apply round"]},
    {"n": 37, "name": "Algorand xGov", "site": "algorand.co",
     "forum": "https://forum.algorand.org", "q": ["Algorand xGov proposal submit 2026"]},
    {"n": 36, "name": "NEAR House of Stake", "site": "houseofstake.org",
     "forum": "https://gov.near.org", "q": ["NEAR House of Stake grant proposal submit"]},
]

STRONG = re.compile(r"(airtable\.com|tally\.so|typeform\.com|docs\.google\.com/forms|"
                    r"jotform|fillout\.com|deform\.cc|questbook|charmverse)", re.I)
ROUTEY = re.compile(r"(/apply|/application|/submit|/proposal|grant-application|apply-now|/rfp|/form)", re.I)
JUNK = re.compile(r"(twitter\.com|x\.com|facebook|youtube|linkedin|reddit|wikipedia|"
                  r"coindesk|cointelegraph|linktr\.ee|/privacy|/terms)", re.I)
CLOSED = re.compile(r"(closed|paused|no longer|discontinued|wound down|sunset|concluded|ended)", re.I)


def get(url, timeout=45):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def search(q):
    u = SEARX + "?" + urllib.parse.urlencode({"q": q, "format": "json"})
    try:
        return json.loads(get(u)).get("results", [])
    except Exception as e:
        print("    ! searx: %s" % str(e)[:60], flush=True)
        return []


def discourse(base, q="grant"):
    """A governance forum cannot go quietly stale — a programme needs public posts."""
    try:
        d = json.loads(get(base.rstrip("/") + "/search.json?q=" +
                           urllib.parse.quote(q) + "&order=latest"))
        out = []
        for t in (d.get("topics") or [])[:8]:
            out.append({"title": t.get("title", "")[:90],
                        "created": (t.get("created_at") or "")[:10],
                        "posts": t.get("posts_count"),
                        "url": base.rstrip("/") + "/t/" + str(t.get("slug")) + "/" + str(t.get("id"))})
        return out
    except Exception as e:
        return [{"error": str(e)[:70]}]


out = []
for t in TARGETS:
    print("\n== #%s %s" % (t["n"], t["name"]), flush=True)
    rec = {**t, "candidates": [], "forum_threads": [], "closed_signals": []}

    queries = list(t["q"]) + ["site:%s apply grant" % t["site"]]
    seen = set()
    for q in queries:
        for r in search(q):
            u = r.get("url") or ""
            if not u or u in seen or JUNK.search(u):
                continue
            seen.add(u)
            s = 0
            if STRONG.search(u):
                s += 10
            if ROUTEY.search(u):
                s += 5
            if t["site"].split(".")[0] in u:
                s += 3
            if re.search(r"grant|fund", u, re.I):
                s += 1
            blurb = (r.get("content") or "") + " " + (r.get("title") or "")
            if CLOSED.search(blurb) and re.search(r"grant|program|round", blurb, re.I):
                rec["closed_signals"].append({"u": u, "t": blurb[:130]})
            if s >= 4:
                rec["candidates"].append({"u": u, "s": s, "t": (r.get("title") or "")[:70]})
        time.sleep(1.1)

    rec["candidates"].sort(key=lambda x: -x["s"])
    rec["candidates"] = rec["candidates"][:6]
    for c in rec["candidates"]:
        print("   %2d  %s" % (c["s"], c["u"][:88]), flush=True)

    if t["forum"]:
        rec["forum_threads"] = discourse(t["forum"])
        for th in rec["forum_threads"][:4]:
            if "error" in th:
                print("   forum: %s" % th["error"], flush=True)
            else:
                print("   [%s] %s" % (th["created"], th["title"][:74]), flush=True)
    if rec["closed_signals"]:
        print("   ⚠ closed-signal: %s" % rec["closed_signals"][0]["t"][:100], flush=True)

    out.append(rec)

(HERE / "research.json").write_text(json.dumps(out, indent=1))
print("\n  wrote research.json — %d programmes" % len(out))
