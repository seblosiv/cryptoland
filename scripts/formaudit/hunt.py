"""
hunt.py — find the application URL for the 30 programmes that still lack one, and
CLASSIFY each candidate by reading its prose.

The lesson from §21: field counts cannot tell an application apart from a support
desk, a feedback survey, a closed form or a docs page. All of those render fine
and several have inputs. What separates them is what the page SAYS.

So every candidate is opened, screenshotted, and classified from its own text:

  APPLICATION  a grant/funding form asking about a project
  SUPPORT      a help desk / office hours / contact form
  FEEDBACK     a survey
  CLOSED       explicitly not accepting submissions
  LOGIN        an account wall
  DOCS         documentation or a listing page
  UNKNOWN      none of the above matched confidently

Only APPLICATION is reported as found. Everything else is recorded with the
sentence that decided it, so the call can be checked.
"""
import asyncio
import json
import pathlib
import re
import sys
from urllib.parse import urljoin, urlparse

import zendriver as zd

HERE = pathlib.Path(__file__).parent
TARGETS = json.loads((HERE / "hunt.json").read_text())
OUT = HERE / "hunt.jsonl"
SHOTS = HERE / "hunt_shots"
SHOTS.mkdir(exist_ok=True)
PROXIES = ["http://127.0.0.1:8891", "http://127.0.0.1:8892", "http://127.0.0.1:8893"]

STRONG = re.compile(r"(airtable\.com|tally\.so|typeform\.com|docs\.google\.com/forms|jotform|"
                    r"fillout\.com|deform\.cc|questbook|charmverse|smartsheet|paperform|hsforms)", re.I)
ROUTEY = re.compile(r"(/apply|/application|/submit|/proposal|grant-application|apply-now|/rfp|/form)", re.I)
JUNK = re.compile(r"(twitter\.com|x\.com|facebook|youtube|linkedin|discord|telegram|linktr\.ee|"
                  r"/privacy|/terms|/cookie|mailto:|\.pdf$|/blog/|/news/)", re.I)

LINKS = r"""
(() => {
  const as = Array.from(document.querySelectorAll('a[href]')).map(a => ({
    h: a.href, t: (a.innerText || '').trim().replace(/\s+/g,' ').slice(0,60) }));
  const embedded = (document.documentElement.innerHTML.match(
    /https?:\/\/[^"'\s<>\\]*(airtable\.com|tally\.so|typeform\.com|docs\.google\.com\/forms|jotform|fillout\.com|deform\.cc|questbook|charmverse)[^"'\s<>\\]*/gi) || [])
    .map(h => ({ h: h, t: 'embedded form' }));
  return JSON.stringify(as.concat(embedded).slice(0, 600));
})()
"""

# Everything the classifier needs: prose, headings, fields, and the page title.
READ = r"""
(() => {
  const vis = (e) => { const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  const heads = Array.from(document.querySelectorAll('h1,h2,[role=heading]'))
    .filter(vis).map(e => (e.innerText||'').trim().replace(/\s+/g,' ')).filter(Boolean).slice(0,8);
  const fields = Array.from(document.querySelectorAll(
    'input:not([type=hidden]):not([type=submit]):not([type=button]), textarea, select'))
    .filter(vis).map(e => {
      let l = e.getAttribute('aria-label') || e.getAttribute('placeholder') || '';
      if (!l && e.id) { const t = document.querySelector('label[for="'+CSS.escape(e.id)+'"]'); if (t) l = t.innerText; }
      if (!l && e.closest('label')) l = e.closest('label').innerText;
      if (!l) l = e.getAttribute('name') || '';
      return { t: e.tagName.toLowerCase()==='input' ? (e.type||'text') : e.tagName.toLowerCase(),
               l: (l||'').trim().replace(/\s+/g,' ').slice(0,90),
               req: e.required || e.getAttribute('aria-required')==='true' };
    }).filter(x => x.l && x.l.length > 2 && !/search/i.test(x.l)).slice(0,50);
  const body = (document.body ? document.body.innerText : '').replace(/\s+/g,' ');
  const t = document.documentElement.innerHTML.toLowerCase();
  return JSON.stringify({
    url: location.href, title: document.title.slice(0,120), heads: heads,
    fields: fields, text: body.slice(0, 2600), len: body.length,
    captcha: ['recaptcha','hcaptcha','turnstile','security checkpoint'].filter(k => t.includes(k)),
    wallet: /connect wallet|walletconnect|sign in with wallet/.test(t),
  });
})()
"""

CLOSED_RE = re.compile(r"(this (type)?form is (now )?closed|can'?t receive new submissions|"
                       r"no longer accepting|applications? (are )?(now )?closed|submissions? (are )?closed|"
                       r"pausing applications|program(me)? is paused|currently paused|do not apply)", re.I)
SUPPORT_RE = re.compile(r"(office hours|technical support|support (request|ticket)|help ?desk|"
                        r"contact (us|support)|bug or complaint|report an issue|partnership inquiry)", re.I)
FEEDBACK_RE = re.compile(r"(feedback form|user experience|survey|how was your experience|rate your)", re.I)
LOGIN_RE = re.compile(r"(sign in to continue|you need permission|create an account to|log in to apply|"
                      r"sign up for free to)", re.I)
APPLY_RE = re.compile(r"(grant application|apply for (a )?grant|funding (application|request)|"
                      r"proposal (form|submission)|application form|tell us about your project|"
                      r"project name|funding amount|milestone)", re.I)


def classify(d):
    """Decide what this page IS, and return the sentence that decided it."""
    blob = " ".join(d.get("heads", [])) + " " + d.get("title", "") + " " + d.get("text", "")
    def hit(rx):
        m = rx.search(blob)
        if not m:
            return None
        s = max(0, m.start() - 70)
        return blob[s:m.end() + 90].strip()
    for kind, rx in (("CLOSED", CLOSED_RE), ("SUPPORT", SUPPORT_RE),
                     ("FEEDBACK", FEEDBACK_RE), ("LOGIN", LOGIN_RE)):
        e = hit(rx)
        if e:
            return kind, e
    nreq = sum(1 for f in d.get("fields", []) if f.get("req"))
    e = hit(APPLY_RE)
    # An application needs BOTH application language and real inputs.
    if e and len(d.get("fields", [])) >= 3:
        return "APPLICATION", e
    # DELETED: "≥6 fields and ≥3 required ⇒ application". It fired three times and
    # was wrong all three: a newsletter signup, a partnership-inquiry form and a
    # product-interest form all clear that bar. Field counts cannot identify an
    # application — only explicit application language plus real inputs can.
    if e:
        return "MAYBE", e
    return ("DOCS" if d.get("len", 0) > 1200 else "UNKNOWN"), (d.get("heads") or [""])[0][:120]


def rank(href, text, base):
    if JUNK.search(href):
        return -1
    s = 0
    if STRONG.search(href):
        s += 12
    if ROUTEY.search(href):
        s += 6
    if re.search(r"appl(y|ication)|submit|proposal", text or "", re.I):
        s += 5
    if re.search(r"grant|fund", href, re.I):
        s += 2
    if urlparse(href).netloc == urlparse(base).netloc:
        s += 1
    return s


async def load(browser, url, wait=10):
    tab = await asyncio.wait_for(browser.get(url), timeout=90)
    await tab.sleep(wait)
    for _ in range(4):
        await tab.evaluate("(()=>{window.scrollBy(0,window.innerHeight);return '1'})()", await_promise=False)
        await tab.sleep(0.6)
    return tab


async def hunt(browser, p):
    rec = {"n": p["n"], "name": p["name"], "start": p["url"], "tried": [], "found": None}
    try:
        tab = await load(browser, p["url"])
        raw = await asyncio.wait_for(tab.evaluate(LINKS, await_promise=False), timeout=30)
        links = json.loads(raw) if isinstance(raw, str) else []

        cands, seen = [], set()
        for l in links or []:
            h = urljoin(p["url"], l.get("h") or "")
            if not h.startswith("http") or h in seen:
                continue
            seen.add(h)
            s = rank(h, l.get("t"), p["url"])
            if s >= 5:
                cands.append((s, h))
        cands.sort(reverse=True)

        # Always classify the landing page itself too — some ARE the form.
        d0 = json.loads(await asyncio.wait_for(tab.evaluate(READ, await_promise=False), timeout=30))
        k0, e0 = classify(d0)
        rec["tried"].append({"u": p["url"], "kind": k0, "why": e0[:150], "n": len(d0.get("fields", []))})
        if k0 == "APPLICATION":
            rec["found"] = {"url": d0["url"], "fields": d0["fields"], "why": e0[:150],
                            "captcha": d0.get("captcha"), "wallet": d0.get("wallet")}

        for s, h in cands[:5]:
            if rec["found"]:
                break
            try:
                t2 = await load(browser, h, wait=9)
                d = json.loads(await asyncio.wait_for(t2.evaluate(READ, await_promise=False), timeout=30))
                k, e = classify(d)
                rec["tried"].append({"u": h, "kind": k, "why": e[:150], "n": len(d.get("fields", []))})
                try:
                    await t2.save_screenshot(str(SHOTS / ("%s-%s.png" % (p["n"], k))))
                except Exception:
                    pass
                if k == "APPLICATION":
                    rec["found"] = {"url": d["url"], "fields": d["fields"], "why": e[:150],
                                    "captcha": d.get("captcha"), "wallet": d.get("wallet")}
            except Exception as ex:
                rec["tried"].append({"u": h, "kind": "ERROR", "why": (str(ex) or type(ex).__name__)[:60]})
    except Exception as ex:
        rec["error"] = (str(ex) or type(ex).__name__)[:120]
    return rec


async def main():
    per = (len(TARGETS) + len(PROXIES) - 1) // len(PROXIES)
    for pi, proxy in enumerate(PROXIES):
        block = TARGETS[pi * per:(pi + 1) * per]
        if not block:
            continue
        browser = None
        for p in block:
            if browser is None:
                browser = await zd.start(headless=True, browser_args=[
                    "--proxy-server=" + proxy, "--no-sandbox",
                    "--disable-dev-shm-usage", "--window-size=1400,1300"])
            try:
                r = await asyncio.wait_for(hunt(browser, p), timeout=330)
            except Exception as e:
                r = {"n": p["n"], "name": p["name"], "start": p["url"],
                     "error": "outer " + (str(e) or type(e).__name__)[:40], "tried": []}
            with OUT.open("a") as fh:
                fh.write(json.dumps(r) + "\n")
            f = r.get("found")
            kinds = ",".join(sorted({t["kind"] for t in r.get("tried", [])}))
            print("  %-3s %-30s %s" % (
                r["n"], r["name"][:30],
                ("FOUND %2d fields  %s" % (len(f["fields"]), f["url"][:58])) if f
                else ("no application — saw [%s]" % kinds)), flush=True)
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
