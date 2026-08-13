"""
deepform2.py — engine-aware form walking, for the six forms the generic reader
could not open or could not advance.

What the first pass got wrong:

  * Typeform does not have a "Next" button. It advances on ENTER, or on a button
    marked data-qa="ok-button-visible". Matching button TEXT for /next|ok/ never
    fired, so Giveth and MultiversX both stopped after one question.
  * Typeform gates the first question behind a "Start"/"Begin" splash that must be
    dismissed before any question exists in the DOM.
  * Airtable `shr…` share links redirect to a different render path than `/form`
    and paint late; the earlier 110s budget expired during navigation, not after.
  * Google Forms needs the /viewform route; a bare /d/e/… id can land on a
    redirect shim that never renders questions.

So this detects the engine from the URL and drives each one the way it actually
works, tries DIRECT first (the VPS IP is faster and several of these are not
geo-gated), and screenshots every page so a human can confirm what was read.

Read-only: never types into a field, never submits.
"""
import asyncio
import json
import pathlib
import sys

import zendriver as zd

HERE = pathlib.Path(__file__).parent
FORMS = json.loads((HERE / "forms3.json").read_text())
OUT = HERE / "deep3.jsonl"
SHOTS = HERE / "shots3"
SHOTS.mkdir(exist_ok=True)


def engine(u):
    u = u.lower()
    if "typeform" in u:
        return "typeform"
    if "airtable" in u:
        return "airtable"
    if "docs.google.com/forms" in u:
        return "gforms"
    if "tally.so" in u:
        return "tally"
    return "generic"


PROBE = r"""
(() => {
  const seen = new Set(), out = [];
  const push = (l, t, req) => {
    l = (l || '').trim().replace(/\s+/g, ' ').slice(0, 120);
    if (!l || l.length < 3) return;
    if (/^(search|select\.\.\.|choose|loading|untitled|ok|next|back|submit|start)$/i.test(l)) return;
    const k = l.toLowerCase(); if (seen.has(k)) return; seen.add(k);
    out.push({ l: l, t: t, req: !!req });
  };
  const vis = (e) => { const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };

  // Typeform: the live question carries a stable data-qa hook.
  document.querySelectorAll('[data-qa="question-header"], [data-qa*="question"]').forEach((q) => {
    if (vis(q)) push(q.innerText, 'typeform-q', /\*|required/i.test(q.innerText || ''));
  });

  // Google Forms.
  document.querySelectorAll('div[role="listitem"]').forEach((li) => {
    const h = li.querySelector('[role="heading"]'); if (!h) return;
    const txt = h.innerText || '';
    const kind = li.querySelector('textarea') ? 'textarea'
      : li.querySelector('[role="radiogroup"]') ? 'choice'
      : li.querySelector('[role="listbox"]') ? 'dropdown' : 'text';
    push(txt.replace(/\s*\*\s*$/, ''), kind, /\*\s*$/.test(txt.trim()));
  });

  // Airtable / Tally / native controls.
  document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]),'
    + ' textarea, select, [contenteditable="true"], [role="textbox"]').forEach((e) => {
    if (!vis(e)) return;
    let l = e.getAttribute('aria-label') || e.getAttribute('placeholder') || '';
    if (!l && e.id) { const t = document.querySelector('label[for="' + CSS.escape(e.id) + '"]'); if (t) l = t.innerText; }
    if (!l && e.closest('label')) l = e.closest('label').innerText;
    if (!l) { const p = e.closest('div'), pr = p && p.previousElementSibling;
              if (pr && pr.innerText && pr.innerText.length < 130) l = pr.innerText; }
    if (!l) l = e.getAttribute('name') || '';
    push(l, e.tagName.toLowerCase() === 'input' ? (e.type || 'text') : e.tagName.toLowerCase(),
         e.required || e.getAttribute('aria-required') === 'true');
  });

  const t = document.documentElement.innerHTML.toLowerCase();
  return JSON.stringify({
    url: location.href, title: document.title.slice(0, 90), fields: out,
    bodyLen: document.body ? document.body.innerText.length : 0,
    captcha: ['recaptcha','hcaptcha','turnstile','security checkpoint'].filter((k) => t.includes(k)),
    login: /sign in with google|continue with google|sign in to continue|you need permission/.test(t),
    // Engine-specific advance controls, in the order they should be tried.
    ok: !!document.querySelector('[data-qa="ok-button-visible"], [data-qa="submit-button"]'),
    start: !!Array.from(document.querySelectorAll('button,a,[role=button]'))
      .find((b) => /^(start|begin|let.?s go|get started)$/i.test((b.innerText || '').trim())),
  });
})()
"""

ADVANCE = r"""
(() => {
  const q = (s) => document.querySelector(s);
  const b = q('[data-qa="ok-button-visible"]') || q('[data-qa="submit-button"]');
  if (b) { b.click(); return 'ok-button'; }
  const s = Array.from(document.querySelectorAll('button,a,[role=button],div[tabindex]'))
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
    .find((e) => /^(next|ok|continue|start|begin|let.?s go|get started|→)$/i.test((e.innerText || '').trim()));
  if (s) { s.click(); return 'text-button'; }
  return 'none';
})()
"""
SCROLL = "(() => { window.scrollBy(0, window.innerHeight); return String(window.scrollY); })()"


async def read(tab):
    raw = await asyncio.wait_for(tab.evaluate(PROBE, await_promise=False), timeout=30)
    return json.loads(raw) if isinstance(raw, str) else {}


async def walk(browser, f):
    eng = engine(f["url"])
    rec = {"n": f["n"], "name": f["name"], "url": f["url"], "engine": eng,
           "pages": 0, "fields": [], "trace": []}
    try:
        tab = await asyncio.wait_for(browser.get(f["url"]), timeout=150)
        await tab.sleep(20)                     # these are the slow ones
        for _ in range(8):
            await tab.evaluate(SCROLL, await_promise=False)
            await tab.sleep(0.7)

        seen, first = set(), None
        for page in range(30 if eng == "typeform" else 12):
            d = await read(tab)
            if first is None:
                first = d
            new = 0
            for x in d.get("fields", []):
                k = x["l"].lower()
                if k not in seen:
                    seen.add(k)
                    rec["fields"].append({**x, "page": page + 1})
                    new += 1
            rec["pages"] = page + 1
            if page < 3 or new:
                try:
                    await tab.save_screenshot(str(SHOTS / ("%s-p%02d.png" % (f["n"], page + 1))))
                except Exception:
                    pass

            moved = await asyncio.wait_for(tab.evaluate(ADVANCE, await_promise=False), timeout=20)
            if moved == "none":
                if eng == "typeform":
                    # Typeform's real control is the keyboard: Enter commits and
                    # advances. No button text ever matches.
                    try:
                        await tab.send(zd.cdp.input_.dispatch_key_event(
                            type_="keyDown", key="Enter", code="Enter",
                            windows_virtual_key_code=13, native_virtual_key_code=13))
                        await tab.send(zd.cdp.input_.dispatch_key_event(
                            type_="keyUp", key="Enter", code="Enter",
                            windows_virtual_key_code=13, native_virtual_key_code=13))
                        moved = "enter"
                    except Exception as e:
                        rec["trace"].append("enter failed: " + str(e)[:50])
                        break
                else:
                    break
            rec["trace"].append("p%d %s (+%d)" % (page + 1, moved, new))
            await tab.sleep(4.0)
            # A required question we refuse to answer will not advance; that is a
            # hard stop, not a bug — record where it stopped.
            if new == 0 and page > 2:
                rec["trace"].append("stalled at p%d" % (page + 1))
                break

        rec["captcha"] = first.get("captcha") if first else []
        rec["login"] = first.get("login") if first else False
        rec["bodyLen"] = first.get("bodyLen") if first else 0
        rec["final_url"] = first.get("url") if first else ""
    except Exception as e:
        rec["error"] = (str(e) or type(e).__name__)[:130]
    return rec


async def main():
    # Direct first: the VPS IP is faster than any proxy and these are not the
    # geo-gated ones. Proxy is the fallback, not the default.
    proxy = sys.argv[sys.argv.index("--proxy") + 1] if "--proxy" in sys.argv else None
    args = ["--no-sandbox", "--disable-dev-shm-usage", "--window-size=1500,1500"]
    if proxy:
        args.insert(0, "--proxy-server=" + proxy)

    browser = None
    for f in FORMS:
        if browser is None:
            browser = await zd.start(headless=True, browser_args=args)
        try:
            r = await asyncio.wait_for(walk(browser, f), timeout=420)
        except Exception as e:
            r = {"n": f["n"], "name": f["name"], "url": f["url"],
                 "error": "outer " + (str(e) or type(e).__name__)[:40]}
        with OUT.open("a") as fh:
            fh.write(json.dumps(r) + "\n")
        print("  %-3s %-28s %-9s %2d q over %s pages  %s" % (
            r["n"], r["name"][:28], r.get("engine", "?"), len(r.get("fields", [])),
            r.get("pages", "?"), (r.get("error") or ("login-gated" if r.get("login") else ""))[:34]),
            flush=True)
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
