#!/usr/bin/env python3
"""
probe-deep.py — go past the landing page.

The earlier probes read one page and gave up, leaving 33 programmes "UNCLEAR".
That was a tooling failure, not a real ambiguity: the open/closed answer usually
lives one click deeper, on the apply page, the FAQ, or a docs sub-page.

This one, per programme:
  1. renders the landing page in a real browser (zendriver / Chrome for Testing),
  2. finds every link that looks like an application route,
  3. FOLLOWS up to 4 of them and reads those pages too,
  4. also hunts deadlines, cohort windows and round dates.

    python3 scripts/probe-deep.py targets.json out.json
"""
import asyncio, json, re, sys, random
from urllib.parse import urljoin, urlparse

CHROME = ("/Users/blackside/Library/Caches/ms-playwright/chromium-1228/"
          "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/"
          "Google Chrome for Testing")

CLOSED = r"(applications? (are |is )?(now )?closed|no longer accepting|not accepting|submissions? (are )?closed|currently paused|is paused|programme? (has )?(ended|concluded)|discontinued|has concluded|closed for submissions|applications will (re)?open)"
OPEN   = r"(apply now|applications? (are |is )?open|submit (your |a )?(application|proposal)|rolling basis|accepting applications|apply here|start your application|open for submissions|now accepting)"
DEADLINE = r"((?:deadline|closes?|due|ends?|cohort|round|batch|season|applications? close)[^.\n]{0,60}(?:20\d\d|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*))"
APPLYISH = r"(apply|grant|fund|proposal|submission|program|rfp)"


async def read_page(browser, url, wait=8):
    """Render one page and return (text, links)."""
    page = None
    try:
        page = await browser.get(url, new_tab=True)
        txt = ""
        for _ in range(wait):
            await page.sleep(1)
            try:
                cur = await page.evaluate("document.body ? document.body.innerText : ''")
            except Exception:
                cur = ""
            if isinstance(cur, str):
                txt = cur
                if len(cur) > 600:
                    break
        for _ in range(4):
            try:
                await page.scroll_down(600); await page.sleep(0.4)
            except Exception:
                break
        try:
            more = await page.evaluate("document.body ? document.body.innerText : ''")
            if isinstance(more, str) and len(more) > len(txt):
                txt = more
        except Exception:
            pass
        try:
            raw = await page.evaluate(
                "JSON.stringify([...document.querySelectorAll('a')]"
                ".map(a=>({h:a.href,t:(a.innerText||'').trim().slice(0,60)}))"
                ".filter(x=>x.h && x.h.startsWith('http')))")
            links = json.loads(raw) if isinstance(raw, str) else []
        except Exception:
            links = []
        return txt, links
    except Exception:
        return "", []
    finally:
        if page:
            try: await page.close()
            except Exception: pass


def classify(txt):
    sents = [s.strip() for s in re.split(r"(?<=[.!?\n])\s+", txt) if 12 < len(s.strip()) < 340]
    cl = [s for s in sents if re.search(CLOSED, s, re.I)][:2]
    op = [s for s in sents if re.search(OPEN, s, re.I)][:2]
    if cl and not op: return "CLOSED", cl, op
    if cl and op:     return "MIXED", cl, op
    if op:            return "OPEN", cl, op
    return "UNCLEAR", cl, op


async def probe(browser, t):
    txt, links = await read_page(browser, t["u"])
    verdict, cl, op = classify(txt)
    deadlines = list(dict.fromkeys(re.findall(DEADLINE, txt, re.I)))[:3]
    visited = [t["u"]]

    # Follow apply-ish links until the answer is decisive.
    if verdict == "UNCLEAR":
        host = urlparse(t["u"]).netloc
        cands, seen = [], set()
        for l in links:
            h = l.get("h", "")
            if h in seen or h in visited: continue
            text = l.get("t", "")
            if not re.search(APPLYISH, h + " " + text, re.I): continue
            # Skip obvious noise, but otherwise follow off-site apply routes too:
            # Questbook, Typeform, DoraHacks and friends are where the real form lives.
            if re.search(r"(twitter|x\.com|discord|telegram|linkedin|youtube|github\.com/[^/]+$)", h, re.I):
                continue
            seen.add(h); cands.append(h)
        for c in cands[:4]:
            sub_txt, _ = await read_page(browser, c, wait=6)
            visited.append(c)
            v2, cl2, op2 = classify(sub_txt)
            deadlines += [d for d in re.findall(DEADLINE, sub_txt, re.I) if d not in deadlines][:2]
            if v2 in ("OPEN", "CLOSED", "MIXED"):
                verdict, cl, op = v2, cl2, op2
                t = {**t, "resolved_at": c}
                break
    return {**t, "verdict": verdict, "chars": len(txt),
            "open_ev": op[:1], "closed_ev": cl[:1],
            "deadlines": deadlines[:3], "pages_read": len(visited)}


async def main():
    import zendriver as zd
    targets = json.load(open(sys.argv[1]))
    browser = await zd.start(browser_executable_path=CHROME, headless=True,
                             no_sandbox=True,
                             browser_args=["--disable-dev-shm-usage",
                                           "--disable-blink-features=AutomationControlled"])
    out = []
    try:
        for t in targets:
            r = await probe(browser, t)
            out.append(r)
            extra = f" [{r['pages_read']}p]" + (f" ⏰{r['deadlines'][0][:40]}" if r["deadlines"] else "")
            print(f'{t["id"]:>3} {t["n"][:26]:<27} {r["verdict"]:<9}{extra}', flush=True)
            json.dump(out, open(sys.argv[2], "w"), indent=1)
            await asyncio.sleep(random.uniform(0.8, 1.6))
    finally:
        await browser.stop()
    from collections import Counter
    print("\n" + str(Counter(r["verdict"] for r in out).most_common()))


if __name__ == "__main__":
    asyncio.run(main())
