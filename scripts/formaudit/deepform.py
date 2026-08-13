"""
deepform.py — read every question on a form, not just the ones on screen.

A single top-document read returns 0 fields on most real application forms, for
three separate reasons, and each needs its own handling:

  * Google Forms  renders questions as div[role=listitem] with the label in a
                  heading — many have no <input> at all until focused.
  * Typeform      shows ONE question per screen and advances on a button; a
                  single read sees 1 of 30.
  * Airtable/Tally render via React after load, and paginate on "Next".

So this scrolls, reads with a probe that understands all four shapes, then
CLICKS FORWARD and re-reads, accumulating unique questions until the form stops
advancing. Read-only: it never types into a field and never submits.

Output: deep.jsonl — one record per form with the full accumulated question list.
"""
import asyncio
import json
import pathlib
import sys

import zendriver as zd

HERE = pathlib.Path(__file__).parent
FORMS = json.loads((HERE / (sys.argv[sys.argv.index("--in")+1] if "--in" in sys.argv else "forms.json")).read_text())
OUT = HERE / (sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else "deep.jsonl")
PROXIES = (["http://127.0.0.1:8891", "http://127.0.0.1:8892", "http://127.0.0.1:8893"]
           if "--isp" in sys.argv else
           ["http://127.0.0.1:8895", "http://127.0.0.1:8896", "http://127.0.0.1:8897"])

# One probe that understands all four form engines.
PROBE = r"""
(() => {
  const seen = new Set(), out = [];
  const push = (label, type, req) => {
    label = (label || '').trim().replace(/\s+/g, ' ').slice(0, 110);
    if (!label || label.length < 3) return;
    if (/^(search|select\.\.\.|choose|loading|untitled)$/i.test(label)) return;
    const k = label.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ l: label, t: type, req: !!req });
  };
  const vis = (e) => { const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };

  // 1. Google Forms — the question lives in the listitem's heading.
  document.querySelectorAll('div[role="listitem"]').forEach((li) => {
    const h = li.querySelector('[role="heading"]');
    if (!h) return;
    const txt = h.innerText || '';
    const req = /\*\s*$/.test(txt.trim()) || !!li.querySelector('[aria-label*="Required"],[aria-label*="required"]');
    const kind = li.querySelector('textarea') ? 'textarea'
      : li.querySelector('[role="radiogroup"]') ? 'choice'
      : li.querySelector('[role="listbox"]') ? 'dropdown'
      : li.querySelector('input[type="date"]') ? 'date' : 'text';
    push(txt.replace(/\s*\*\s*$/, ''), kind, req);
  });

  // 2. Typeform — the current question is a heading near the input.
  document.querySelectorAll('[data-qa*="question"], h1, [class*="question"]').forEach((q) => {
    if (!vis(q)) return;
    const txt = (q.innerText || '').trim();
    if (txt.length > 6 && txt.length < 200 && !/^(next|ok|submit|back)$/i.test(txt)) {
      push(txt, 'typeform-q', /\*/.test(txt));
    }
  });

  // 3. Airtable / Tally / native — labelled controls.
  document.querySelectorAll(
    'input:not([type=hidden]):not([type=submit]):not([type=button]), textarea, select, [contenteditable="true"], [role="textbox"]'
  ).forEach((e) => {
    if (!vis(e)) return;
    let l = e.getAttribute('aria-label') || e.getAttribute('placeholder') || '';
    if (!l && e.id) { const t = document.querySelector('label[for="' + CSS.escape(e.id) + '"]'); if (t) l = t.innerText; }
    if (!l && e.closest('label')) l = e.closest('label').innerText;
    // Airtable/Tally put the label in a sibling block above the control.
    if (!l) { const p = e.closest('div'); const prev = p && p.previousElementSibling;
              if (prev && prev.innerText && prev.innerText.length < 120) l = prev.innerText; }
    if (!l) l = e.getAttribute('name') || '';
    const type = e.tagName.toLowerCase() === 'input' ? (e.type || 'text') : e.tagName.toLowerCase();
    push(l, type, e.required || e.getAttribute('aria-required') === 'true');
  });

  // 4. Airtable field headers render as their own labelled blocks.
  document.querySelectorAll('[data-testid*="field"], [class*="formField"], [class*="field-label"]').forEach((e) => {
    if (!vis(e)) return;
    const txt = (e.innerText || '').split('\n')[0];
    if (txt && txt.length > 2 && txt.length < 110) push(txt, 'field', /\*/.test(e.innerText || ''));
  });

  const t = document.documentElement.innerHTML.toLowerCase();
  return JSON.stringify({
    url: location.href, title: document.title.slice(0, 90), fields: out,
    captcha: ['recaptcha', 'hcaptcha', 'turnstile', 'security checkpoint'].filter((k) => t.includes(k)),
    login: /sign in with google|continue with google|sign in to continue/.test(t),
    // Something to click to reach the next page of questions.
    next: (() => {
      const c = Array.from(document.querySelectorAll('button, a, [role=button], div[tabindex]'))
        .filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
        .filter((b) => /^(next|ok|continue|start|begin|siguiente|→)$/i.test((b.innerText || '').trim()));
      return c.length ? c[0].innerText.trim().slice(0, 20) : null;
    })(),
  });
})()
"""

CLICK_NEXT = r"""
(() => {
  const c = Array.from(document.querySelectorAll('button, a, [role=button], div[tabindex]'))
    .filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
    .filter((b) => /^(next|ok|continue|start|begin|siguiente|→)$/i.test((b.innerText || '').trim()));
  if (!c.length) return 'none';
  c[0].click();
  return 'clicked';
})()
"""

SCROLL = "(() => { window.scrollBy(0, window.innerHeight * 0.9); return String(window.scrollY); })()"


async def read(tab):
    raw = await asyncio.wait_for(tab.evaluate(PROBE, await_promise=False), timeout=30)
    return json.loads(raw) if isinstance(raw, str) else {}


async def deep(browser, f):
    rec = {"n": f["n"], "name": f["name"], "url": f["url"], "pages": 0, "fields": []}
    try:
        tab = await asyncio.wait_for(browser.get(f["url"]), timeout=110)
        await tab.sleep(14)

        # Lazy blocks only render once scrolled into view.
        for _ in range(6):
            await tab.evaluate(SCROLL, await_promise=False)
            await tab.sleep(0.8)

        seen, first = set(), None
        for page in range(14):
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
            if not d.get("next"):
                break
            r = await asyncio.wait_for(tab.evaluate(CLICK_NEXT, await_promise=False), timeout=20)
            if r != "clicked":
                break
            await tab.sleep(4.5)
            for _ in range(3):
                await tab.evaluate(SCROLL, await_promise=False)
                await tab.sleep(0.5)
            # Two consecutive pages with nothing new means the form is not advancing.
            if new == 0 and page > 1:
                break

        rec["captcha"] = first.get("captcha") if first else []
        rec["login"] = first.get("login") if first else False
        rec["title"] = first.get("title") if first else ""
    except Exception as e:
        rec["error"] = (str(e) or type(e).__name__)[:130]
    return rec


async def main():
    per = (len(FORMS) + len(PROXIES) - 1) // len(PROXIES)
    for pi, proxy in enumerate(PROXIES):
        block = FORMS[pi * per:(pi + 1) * per]
        if not block:
            continue
        browser = None
        for f in block:
            if browser is None:
                browser = await zd.start(headless=True, browser_args=[
                    "--proxy-server=" + proxy, "--no-sandbox",
                    "--disable-dev-shm-usage", "--window-size=1400,1400"])
            try:
                r = await asyncio.wait_for(deep(browser, f), timeout=300)
            except Exception as e:
                r = {"n": f["n"], "name": f["name"], "url": f["url"], "error": "timeout " + str(e)[:40]}
            with OUT.open("a") as fh:
                fh.write(json.dumps(r) + "\n")
            print("  %-3s %-30s %2d questions over %s page(s) %s" % (
                r["n"], r["name"][:30], len(r.get("fields", [])), r.get("pages", "?"),
                (r.get("error") or "")[:40]), flush=True)
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
