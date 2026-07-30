#!/usr/bin/env python3
"""
probe-browser.py — resolve the programmes that HTTP clients cannot.

curl_cffi defeats TLS fingerprinting but executes no JavaScript, so it cannot read
SPA-rendered pages (23 "UNCLEAR" rows) or pass interactive challenges. This drives a
real headless Chrome via zendriver, which uses the CDP directly and leaves far fewer
automation traces than webdriver-based tools.

Deliberately uses Chrome for Testing from the Playwright cache — never the user's
own Chrome profile.

    python3 scripts/probe-browser.py targets.json out.json [limit]
"""
import asyncio, json, re, sys, random

CHROME = ("/Users/blackside/Library/Caches/ms-playwright/chromium-1228/"
          "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/"
          "Google Chrome for Testing")

GEO = ("http://geonode_22mcas5VgY:36a810f3-d149-4dcc-b97b-291068879ec4"
       "@rotating-datacenter.geonode.io:9000")

CLOSED = r"(applications? (are )?(now )?closed|no longer accepting|not accepting|submissions? closed|currently paused|is paused|programme? (has )?(ended|concluded)|discontinued|applications will (re)?open)"
OPEN   = r"(apply now|applications? (are )?open|submit (your |a )?(application|proposal)|rolling basis|accepting applications|apply here|start your application|open for submissions)"


async def probe(browser, t):
    """One page. Opens its own tab (reusing the default tab raises StopIteration in
    zendriver), waits for real content rather than a fixed sleep, then scrolls so
    lazily-rendered apply CTAs below the fold are included."""
    page = None
    try:
        page = await browser.get(t["u"], new_tab=True)
        # Poll until the SPA has painted something substantial, up to ~12s.
        txt = ""
        for _ in range(12):
            await page.sleep(1)
            try:
                cur = await page.evaluate("document.body ? document.body.innerText : ''")
            except Exception:
                cur = ""
            if isinstance(cur, str) and len(cur) > 400:
                txt = cur
                break
            if isinstance(cur, str):
                txt = cur
        # Scroll to pull in below-the-fold, lazily-rendered CTAs.
        for _ in range(5):
            try:
                await page.scroll_down(500)
                await page.sleep(0.45)
            except Exception:
                break
        try:
            more = await page.evaluate("document.body ? document.body.innerText : ''")
            if isinstance(more, str) and len(more) > len(txt):
                txt = more
        except Exception:
            pass
        try:
            links = await page.evaluate(
                "JSON.stringify([...document.querySelectorAll('a')]"
                ".filter(a=>/grant|apply|fund|proposal|submission/i.test(a.href+a.innerText))"
                ".slice(0,8).map(a=>a.innerText.trim().slice(0,40)+' -> '+a.href))"
            )
            links = json.loads(links) if isinstance(links, str) else []
        except Exception:
            links = []
    except Exception as e:
        return {**t, "verdict": "ERROR", "err": str(e)[:90], "chars": 0,
                "open_ev": [], "closed_ev": [], "links": []}
    finally:
        if page:
            try: await page.close()
            except Exception: pass

    sents = [s.strip() for s in re.split(r"(?<=[.!?\n])\s+", txt) if 15 < len(s.strip()) < 320]
    cl = [s for s in sents if re.search(CLOSED, s, re.I)][:2]
    op = [s for s in sents if re.search(OPEN, s, re.I)][:2]
    if not txt.strip():   v = "BLANK"
    elif cl and not op:   v = "CLOSED"
    elif cl and op:       v = "MIXED"
    elif op:              v = "OPEN"
    else:                 v = "UNCLEAR"
    return {**t, "verdict": v, "chars": len(txt), "open_ev": op[:1],
            "closed_ev": cl[:1], "links": links[:5]}


async def main():
    import zendriver as zd
    targets = json.load(open(sys.argv[1]))
    if len(sys.argv) > 3:
        targets = targets[:int(sys.argv[3])]

    # NOTE: Chrome cannot take proxy credentials on --proxy-server; supplying
    # user:pass there yields ERR_NO_SUPPORTED_PROXIES and every page fails to load.
    # Auth would have to be answered via CDP Fetch.authRequired. These programme
    # pages are public and rate-limiting was a TLS-fingerprint issue (already solved
    # by curl_cffi in probe-programs.py), so the browser runs direct — it is here to
    # execute JavaScript, not to evade blocks.
    browser = await zd.start(
        browser_executable_path=CHROME,
        headless=True,
        no_sandbox=True,
        browser_args=["--disable-dev-shm-usage",
                      "--disable-blink-features=AutomationControlled"],
    )
    out = []
    try:
        for t in targets:
            r = await probe(browser, t)
            out.append(r)
            ev = (r.get("closed_ev") or r.get("open_ev") or [""])[0][:62]
            print(f'{t["id"]:>3} {t["n"][:26]:<27} {r["verdict"]:<9}{r["chars"]:>7}  {ev}', flush=True)
            await asyncio.sleep(random.uniform(1.0, 2.2))
    finally:
        await browser.stop()

    json.dump(out, open(sys.argv[2], "w"), indent=1)
    from collections import Counter
    print("\n" + str(Counter(r["verdict"] for r in out).most_common()))


if __name__ == "__main__":
    asyncio.run(main())
