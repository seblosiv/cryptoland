"""
audit.py — what does each grant application actually ASK for?

Reads targets.json, loads each programme page in zendriver (real Chrome, headless)
through a residential ISP proxy, and records the SHAPE of the application:

  - native <form>            → the fields are in the page, readable
  - Google Form / Typeform   → embedded, one question at a time, often login-gated
  - Airtable / Notion / Tally → third-party host
  - wallet-gated             → needs a signature, not a password
  - captcha / bot wall       → STOP. Reported, never worked around.

The last line matters and is deliberate: CLAUDE.md §0 says captchas and social
logins are anti-bot controls that get a human, not a workaround. zendriver is used
here because it drives real Chrome with a clean fingerprint and survives the
JS-heavy shells that returned empty to a plain fetch — NOT to defeat a challenge.
Anything that presents one is recorded as human-gated and left alone.

Run:  python3 audit.py            # all targets
      python3 audit.py 5          # first 5, for a smoke test
"""
import asyncio
import json
import sys
import pathlib
import zendriver as zd

HERE = pathlib.Path(__file__).parent
TARGETS = json.loads((HERE / "targets.json").read_text())
OUT = HERE / (sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else "results.jsonl")
SHOTS = HERE / "shots"
SHOTS.mkdir(exist_ok=True)

PROXIES = ["http://127.0.0.1:8891", "http://127.0.0.1:8892", "http://127.0.0.1:8893"]

# One IIFE, evaluated in the page, returning a JSON string. Everything the audit
# needs comes back in a single round trip.
PROBE = r"""
(() => {
  const txt = document.documentElement.innerHTML.toLowerCase();
  const has = (...ks) => ks.filter(k => txt.includes(k));

  const vis = (e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden';
  };

  // What a field is actually labelled — placeholder, aria-label, or its <label>.
  const label = (e) => {
    let l = e.getAttribute('aria-label') || e.getAttribute('placeholder') || '';
    if (!l && e.id) {
      const t = document.querySelector('label[for="' + CSS.escape(e.id) + '"]');
      if (t) l = t.innerText;
    }
    if (!l && e.closest('label')) l = e.closest('label').innerText;
    if (!l) l = e.getAttribute('name') || '';
    return l.trim().replace(/\s+/g, ' ').slice(0, 70);
  };

  const fields = Array.from(
    document.querySelectorAll('input:not([type=hidden]):not([type=submit]), textarea, select')
  ).filter(vis).map((e) => ({
    t: e.tagName.toLowerCase() === 'input' ? (e.type || 'text') : e.tagName.toLowerCase(),
    l: label(e),
    req: e.required || e.getAttribute('aria-required') === 'true',
  })).slice(0, 60);

  const apply = Array.from(document.querySelectorAll('a, button'))
    .filter(vis)
    .map((e) => ({
      t: (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40),
      h: (e.getAttribute && e.getAttribute('href')) || '',
    }))
    .filter((x) => /appl|submit|start|proposal|register|get started|sign up|form/i.test(x.t))
    .slice(0, 6);

  return JSON.stringify({
    url: location.href,
    title: document.title.slice(0, 80),
    captcha: has('recaptcha', 'hcaptcha', 'turnstile', 'just a moment',
                 'security checkpoint', 'checking your browser', 'cf-challenge',
                 'attention required'),
    host: has('docs.google.com/forms', 'typeform', 'airtable', 'notion.so',
              'notion.site', 'jotform', 'hsforms', 'hubspot', 'tally.so',
              'fillout.com', 'deform.cc', 'questbook', 'karmahq', 'gitcoin',
              'smartsheet', 'monday.com', 'luma', 'paperform'),
    wallet: /connect wallet|sign in with wallet|walletconnect|connect your wallet/.test(txt),
    login: /sign in with google|log in with google|continue with google|sign in with github|discord\.com\/oauth/.test(txt),
    forms: document.querySelectorAll('form').length,
    nFields: fields.length,
    fields: fields,
    apply: apply,
    iframes: document.querySelectorAll('iframe').length,
    bodyLen: document.body ? document.body.innerText.length : 0,
  });
})()
"""


async def probe(browser, t):
    """Load one programme page and describe its application form."""
    rec = {"n": t["n"], "name": t["name"], "chain": t["chain"], "src": t["url"]}
    try:
        tab = await asyncio.wait_for(browser.get(t["url"]), timeout=45)
        await tab.sleep(7)          # JS shells need time; several are SPA-rendered
        raw = await asyncio.wait_for(tab.evaluate(PROBE, await_promise=False), timeout=30)
        if isinstance(raw, str):
            rec.update(json.loads(raw))
        else:
            rec["error"] = "probe returned %s" % type(raw).__name__
        try:
            await tab.save_screenshot(str(SHOTS / ("%02d.png" % t["n"])))
        except Exception:
            pass
    except Exception as e:
        rec["error"] = str(e)[:140]
    return rec


def verdict(r):
    """One word for what stands between us and this form."""
    if r.get("error"):
        return "ERROR"
    if r.get("captcha"):
        return "CAPTCHA"
    if r.get("login"):
        return "SSO-LOGIN"
    if r.get("wallet"):
        return "WALLET"
    if r.get("host"):
        return "HOSTED:" + r["host"][0][:14]
    if r.get("nFields", 0) >= 3:
        return "NATIVE-FORM"
    if r.get("apply"):
        return "APPLY-LINK"
    return "NO-FORM"


async def main():
    # Strip flag pairs before reading the positional limit, or "--out x" is parsed
    # as the limit and the run dies after loading every page.
    argv = list(sys.argv[1:])
    only = None
    pos = []
    i = 0
    while i < len(argv):
        if argv[i] == "--only":
            only = {int(x) for x in argv[i + 1].split(",")}; i += 2
        elif argv[i] == "--out":
            i += 2
        else:
            pos.append(argv[i]); i += 1
    if only:
        targets = [t for t in TARGETS if t["n"] in only]
    else:
        targets = TARGETS[:int(pos[0])] if pos else TARGETS
    done = []

    # One browser per proxy, targets split into three contiguous blocks — the box
    # has 2 cores, so this is three sequential passes, never a fan-out.
    per = (len(targets) + len(PROXIES) - 1) // len(PROXIES)
    for pi, proxy in enumerate(PROXIES):
        block = targets[pi * per:(pi + 1) * per]
        if not block:
            continue
        print("\n== proxy %s — %d targets ==" % (proxy.rsplit(":", 1)[-1], len(block)), flush=True)
        browser = None
        for t in block:
            if browser is None:
                browser = await zd.start(
                    headless=True,
                    browser_args=[
                        "--proxy-server=" + proxy,
                        "--no-sandbox",
                        "--disable-dev-shm-usage",
                        "--window-size=1400,1100",
                    ],
                )
            try:
                r = await asyncio.wait_for(probe(browser, t), timeout=90)
            except Exception as e:
                r = dict(t); r["error"] = "outer timeout: %s" % str(e)[:60]
            r["proxy"] = proxy
            done.append(r)
            with OUT.open("a") as fh:      # append as we go, never only at the end
                fh.write(json.dumps(r) + "\n")
            print("  %-2s %-38s %-13s fields=%-3s forms=%-2s %s" % (
                r["n"], r["name"][:38], verdict(r), r.get("nFields", "-"),
                r.get("forms", "-"), (r.get("error") or "")[:44]), flush=True)
            # A dead browser poisons the rest of the block; restart on error.
            if r.get("error"):
                try:
                    await browser.stop()
                except Exception:
                    pass
                browser = None
        if browser is not None:
            try:
                await browser.stop()
            except Exception:
                pass

    print("\n  %d probed → %s" % (len(done), OUT), flush=True)


if __name__ == "__main__":
    asyncio.run(main())
