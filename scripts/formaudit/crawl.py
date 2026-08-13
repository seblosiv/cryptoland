"""
crawl.py — find the real application form by crawling, not guessing.

The §18 sweep followed the FIRST link whose text matched /apply|submit/. That is
why ten programmes resolved to a docs page, a linktree or a support widget. This
walks each programme's grants page properly:

  1. collect every link on the page — same-domain routes AND any third-party form
     host (Airtable / Tally / Typeform / Google Forms) linked from anywhere;
  2. rank them by how much they look like an application route;
  3. actually OPEN the top few and count real fields.

A search hit or a promising URL is a guess. A page with eight labelled inputs is
evidence. Only the second is reported as found.

Writes results incrementally — a long crawl that dies at target 30 must not throw
away the first 29.
"""
import asyncio
import json
import pathlib
import re
import sys
from urllib.parse import urljoin, urlparse

import zendriver as zd

HERE = pathlib.Path(__file__).parent
NEED = json.loads((HERE / (sys.argv[sys.argv.index("--in")+1] if "--in" in sys.argv else "need.json")).read_text())
OUT = HERE / (sys.argv[sys.argv.index("--out")+1] if "--out" in sys.argv else "crawl.jsonl")
PROXIES = ["http://127.0.0.1:8895", "http://127.0.0.1:8896", "http://127.0.0.1:8897"]

STRONG = re.compile(r"(airtable\.com|tally\.so|typeform\.com|docs\.google\.com/forms|"
                    r"jotform|fillout\.com|deform\.cc|questbook|smartsheet|paperform)", re.I)
ROUTEY = re.compile(r"(/apply|/application|/submit|/proposal|grant-application|"
                    r"apply-now|/rfp|/form|/funding)", re.I)
JUNK = re.compile(r"(twitter\.com|x\.com|facebook|youtube|linkedin|discord|telegram|"
                  r"linktr\.ee|github\.com/[^/]+$|/blog|/news|/privacy|/terms|"
                  r"docs\.|mailto:|\.pdf$)", re.I)

LINKS = r"""
(() => {
  const as = Array.from(document.querySelectorAll('a[href]')).map(a => ({
    h: a.href, t: (a.innerText || '').trim().replace(/\s+/g,' ').slice(0,50) }));
  // Some sites never render an <a> to the form — it is an iframe, a JS handler or
  // a bare URL in the copy. Scrape the raw HTML for known form hosts too.
  const hosts = (document.documentElement.innerHTML.match(
    /https?:\/\/[^"'\s<>\\]*(airtable\.com|tally\.so|typeform\.com|docs\.google\.com\/forms|jotform|fillout\.com|deform\.cc|questbook)[^"'\s<>\\]*/gi) || [])
    .map(h => ({ h: h, t: 'embedded form' }));
  return JSON.stringify(as.concat(hosts).slice(0, 500));
})()
"""

# Same probe as the audit, trimmed to what ranking needs.
FIELDS = r"""
(() => {
  const vis = (e) => { const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  const label = (e) => {
    let l = e.getAttribute('aria-label') || e.getAttribute('placeholder') || '';
    if (!l && e.id) { const t = document.querySelector('label[for="'+CSS.escape(e.id)+'"]'); if (t) l = t.innerText; }
    if (!l && e.closest('label')) l = e.closest('label').innerText;
    if (!l) l = e.getAttribute('name') || '';
    return l.trim().replace(/\s+/g,' ').slice(0,70);
  };
  const f = Array.from(document.querySelectorAll('input:not([type=hidden]):not([type=submit]), textarea, select'))
    .filter(vis)
    .map(e => ({ t: e.tagName.toLowerCase()==='input' ? (e.type||'text') : e.tagName.toLowerCase(),
                 l: label(e), req: e.required || e.getAttribute('aria-required')==='true' }))
    .filter(x => x.l && x.l.length > 2 && !['checkbox','radio'].includes(x.t)
                 && !/search|select\.\.\.|newsletter|subscribe/i.test(x.l));
  const txt = document.documentElement.innerHTML.toLowerCase();
  return JSON.stringify({
    url: location.href, title: document.title.slice(0,80), n: f.length, fields: f.slice(0,40),
    captcha: ['recaptcha','hcaptcha','turnstile','just a moment','security checkpoint']
      .filter(k => txt.includes(k)),
    wallet: /connect wallet|sign in with wallet|walletconnect/.test(txt),
    login: /sign in with google|continue with google|sign in with github/.test(txt),
  });
})()
"""


def rank(href, text, base):
    if JUNK.search(href):
        return -1
    s = 0
    if STRONG.search(href):
        s += 12
    if ROUTEY.search(href):
        s += 6
    if re.search(r"apply|application|submit|proposal", text or "", re.I):
        s += 5
    if re.search(r"grant|fund", href, re.I):
        s += 2
    if urlparse(href).netloc == urlparse(base).netloc:
        s += 1
    return s


async def load(browser, url, wait=11):
    tab = await asyncio.wait_for(browser.get(url), timeout=45)
    await tab.sleep(wait)
    return tab


async def work(browser, p):
    rec = {"n": p["n"], "name": p["name"], "start": p["url"], "best": None, "tried": []}
    try:
        tab = await load(browser, p["url"])
        links = await asyncio.wait_for(tab.evaluate(LINKS, await_promise=False), timeout=25)
        if isinstance(links, str):
            links = json.loads(links)
        cands = []
        seen = set()
        for l in (links or []):
            h = urljoin(p["url"], l.get("h") or "")
            if not h.startswith("http") or h in seen:
                continue
            seen.add(h)
            s = rank(h, l.get("t"), p["url"])
            if s >= 4:
                cands.append((s, h))
        cands.sort(reverse=True)

        best = None
        for s, h in cands[:6]:
            try:
                t2 = await load(browser, h, wait=9)
                raw = await asyncio.wait_for(t2.evaluate(FIELDS, await_promise=False), timeout=25)
                d = json.loads(raw) if isinstance(raw, str) else {}
                rec["tried"].append({"u": h, "n": d.get("n", 0), "cap": bool(d.get("captcha"))})
                if d.get("n", 0) >= 3 and (not best or d["n"] > best["n"]):
                    best = d
                if best and best["n"] >= 8:
                    break
            except Exception as e:
                rec["tried"].append({"u": h, "err": str(e)[:50]})
        rec["best"] = best
    except Exception as e:
        rec["error"] = str(e)[:120]
    return rec


async def main():
    args = [a for a in sys.argv[1:] if a.isdigit()]
    only = {int(x) for x in args} if args else None
    targets = [t for t in NEED if not only or t["n"] in only]
    per = (len(targets) + len(PROXIES) - 1) // len(PROXIES)
    for pi, proxy in enumerate(PROXIES):
        block = targets[pi * per:(pi + 1) * per]
        if not block:
            continue
        browser = None
        for p in block:
            if browser is None:
                browser = await zd.start(headless=True, browser_args=[
                    "--proxy-server=" + proxy, "--no-sandbox",
                    "--disable-dev-shm-usage", "--window-size=1400,1100"])
            try:
                r = await asyncio.wait_for(work(browser, p), timeout=240)
            except Exception as e:
                r = {"n": p["n"], "name": p["name"], "error": "timeout %s" % str(e)[:40]}
            with OUT.open("a") as fh:
                fh.write(json.dumps(r) + "\n")
            b = r.get("best")
            print("  %-3s %-32s %s" % (
                r["n"], r["name"][:32],
                ("%2d fields  %s" % (b["n"], b["url"][:64])) if b
                else ("tried %d, none had a form" % len(r.get("tried", [])))), flush=True)
            if r.get("error"):
                try:
                    await browser.stop()
                except Exception:
                    pass
                browser = None
        if browser:
            try:
                await browser.stop()
            except Exception:
                pass


asyncio.run(main())
