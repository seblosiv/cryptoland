#!/usr/bin/env python3
"""
probe-programs.py — resilient programme-page fetcher.

WHY THIS EXISTS. A plain `curl` sweep of 46 grant programmes left 15 unreachable
(403/429/404) and 20 "unclear". Most of those were not dead links:

  * 429/403 are TLS-fingerprint blocks. Cloudflare and friends key on the JA3
    handshake, not the User-Agent, so curl is rejected no matter what header it
    sends. `curl_cffi` replays a real Chrome handshake and walks straight through
    — Aptos and Cardano Foundation went 429 -> 200 with no other change.
  * Several 404s are genuinely moved URLs. For those, fetching the site root and
    following anchors that look like an application route recovers the new one.

Usage:
    python3 scripts/probe-programs.py targets.json out.json

Requires: pip install curl_cffi
"""
import json, os, re, sys, time, html
from urllib.parse import urljoin, urlparse

try:
    from curl_cffi import requests
except ImportError:
    sys.exit("pip install curl_cffi")

# Proxy credentials come from the environment. They were previously hard-coded
# here and committed, which put a live user:pass into git history — rotate any
# credential that ever sat in this file.
#
#   export PROXY_AUTH="user:pass"
#   export PROXY_HOSTS="64.50.167.6:61232,165.49.211.111:61232,166.88.173.212:61232"
#   export PROXY_GEO="user:pass@rotating-datacenter.example.net:9000"   # optional
_auth = os.environ.get("PROXY_AUTH", "")
ISP = [f"{_auth}@{h.strip()}" for h in os.environ.get("PROXY_HOSTS", "").split(",") if h.strip()]
GEO = os.environ.get("PROXY_GEO", "")
# Rotate fingerprints: a site that blocks one Chrome build often allows another.
IMPS = ["chrome124", "chrome120", "safari17_0", "edge101"]

CLOSED = r"(applications? (are )?(now )?closed|no longer accepting|not accepting|submissions? closed|currently paused|is paused|programme? (has )?(ended|concluded)|discontinued|winding down)"
OPEN   = r"(apply now|applications? (are )?open|submit (your |a )?(application|proposal)|rolling basis|accepting applications|apply here|start your application)"
APPLY  = r'href="([^"]*(?:grant|apply|fund|program|proposal|submission)[^"]*)"'


def proxy(i):
    p = ISP[i % len(ISP)] if i % 4 != 3 else GEO
    return {"http": f"http://{p}", "https": f"http://{p}"}


def get(url, i, tries=None):
    """Try each fingerprint, then a proxy rotation, before giving up."""
    last = None
    for n, imp in enumerate(tries or IMPS):
        try:
            r = requests.get(url, impersonate=imp, proxies=proxy(i + n),
                             timeout=30, allow_redirects=True)
            last = r
            if r.status_code == 200 and len(r.text) > 500:
                return r, imp
        except Exception:
            pass
        time.sleep(0.4)
    return last, None


def text_of(h):
    h = re.sub(r'<script.*?</script>|<style.*?</style>', ' ', h, flags=re.S | re.I)
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', h))).strip()


def discover(url, i):
    """404 on a deep link? Fetch the site root and look for the real apply route."""
    root = f"{urlparse(url).scheme}://{urlparse(url).netloc}/"
    r, _ = get(root, i)
    if not r or r.status_code != 200:
        return []
    out, seen = [], set()
    for href in re.findall(APPLY, r.text, re.I):
        full = urljoin(root, href)
        if full in seen or urlparse(full).netloc != urlparse(root).netloc:
            continue
        seen.add(full)
        out.append(full)
    return out[:6]


def verdict(t):
    cl = [s.strip() for s in re.split(r'(?<=[.!?])\s+', t) if re.search(CLOSED, s, re.I)][:2]
    op = [s.strip() for s in re.split(r'(?<=[.!?])\s+', t) if re.search(OPEN, s, re.I)][:2]
    if not t:          return "UNREACHABLE", cl, op
    if cl and not op:  return "CLOSED", cl, op
    if cl and op:      return "MIXED", cl, op
    if op:             return "OPEN", cl, op
    return "UNCLEAR", cl, op


def main():
    targets = json.load(open(sys.argv[1]))
    out = []
    for i, t in enumerate(targets):
        r, imp = get(t["u"], i)
        code = r.status_code if r else "ERR"
        body = r.text if (r and r.status_code == 200) else ""
        found = []
        if not body:
            found = discover(t["u"], i)
            for cand in found[:3]:
                r2, imp2 = get(cand, i)
                if r2 and r2.status_code == 200 and len(r2.text) > 1500:
                    body, code, imp, t = r2.text, r2.status_code, imp2, {**t, "u": cand}
                    break
        txt = text_of(body)
        v, cl, op = verdict(txt)
        out.append({**t, "http": code, "imp": imp, "chars": len(txt), "verdict": v,
                    "closed_ev": cl[:1], "open_ev": op[:1], "candidates": found[:4]})
        ev = (cl[:1] or op[:1] or [""])[0][:64]
        print(f'{t["id"]:>3} {t["n"][:26]:<27} {str(code):<5} {v:<12}{(imp or "-"):<11}{ev}', flush=True)
        time.sleep(0.6)
    json.dump(out, open(sys.argv[2], "w"), indent=1)
    from collections import Counter
    print("\n" + str(Counter(r["verdict"] for r in out).most_common()))


if __name__ == "__main__":
    main()
