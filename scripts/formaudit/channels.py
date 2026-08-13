"""
channels.py — for programmes with no web form, find the channel they DO use.

§23 established that most remaining programmes publish documentation, not a form:
31 of 76 pages were docs, 18 were support desks, and zero were applications. That
is not a dead end — it means the submission route is stated in prose instead of
implemented as a form. Tezos already told us so ("proposal by email").

So this reads each landing page and extracts, verbatim:

  * mailto: targets and any grant-ish email address in the copy
  * the sentence that explains how to submit
  * governance-forum links (a proposal thread is the route on DAO programmes)
  * portal links (Notion, Questbook, CharmVerse, Common Ground)
  * any stated deadline

Everything is quoted, never paraphrased — a channel we cannot quote is a channel
we have not actually found.
"""
import asyncio
import json
import pathlib
import re

import zendriver as zd

HERE = pathlib.Path(__file__).parent
TARGETS = json.loads((HERE / "channels.json").read_text())
OUT = HERE / "channels.jsonl"
PROXIES = ["http://127.0.0.1:8891", "http://127.0.0.1:8892", "http://127.0.0.1:8893"]

READ = r"""
(() => {
  const txt = (document.body ? document.body.innerText : '').replace(/[ \t]+/g, ' ');
  const links = Array.from(document.querySelectorAll('a[href]')).map(a => a.href);
  const mailto = links.filter(h => h.startsWith('mailto:')).map(h => h.slice(7).split('?')[0]);
  const portal = links.filter(h => /notion\.(so|site)|questbook|charmverse|commonground|dework|gitcoin|karmahq|forum\.|gov\./i.test(h)).slice(0, 12);
  return JSON.stringify({
    url: location.href, title: document.title.slice(0, 120),
    text: txt.slice(0, 9000), mailto: Array.from(new Set(mailto)).slice(0, 8),
    portal: Array.from(new Set(portal)).slice(0, 12),
  });
})()
"""

EMAIL = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
# Sentences that explain the route.
HOWTO = re.compile(
    r"[^.!?\n]{0,180}(submit (your |a |the )?(proposal|application|idea|proposal via)|"
    r"send (us |your )?(an? )?(email|proposal|application)|apply (by|via|through|at)|"
    r"email (us|your)|reach out (to|at)|application process|to apply|how to apply|"
    r"post (your |a )?(proposal|application)|open (a|an) (issue|proposal)|"
    r"pull request|via the forum|on the forum|forum post)[^.!?\n]{0,220}[.!?]", re.I)
DEADLINE = re.compile(
    r"[^.!?\n]{0,120}(deadline|closes on|close on|applications? (open|close)|"
    r"submissions? (open|close)|by [A-Z][a-z]+ \d{1,2},? 20\d\d|"
    r"until [A-Z][a-z]+ \d{1,2})[^.!?\n]{0,140}[.!?]", re.I)
NOISE = re.compile(r"(cookie|privacy policy|newsletter|subscribe to our)", re.I)


def extract(d):
    t = re.sub(r"\n{2,}", "\n", d.get("text", ""))
    emails = [e for e in EMAIL.findall(t) if not re.search(r"(example|sentry|\.png|\.jpg)", e, re.I)]
    grants = [e for e in emails if re.search(r"grant|fund|eco|bd|partner|hello|info|contact", e, re.I)]
    howto = [m.group(0).strip() for m in HOWTO.finditer(t) if not NOISE.search(m.group(0))][:4]
    dead = [m.group(0).strip() for m in DEADLINE.finditer(t) if not NOISE.search(m.group(0))][:3]
    return {
        "emails": list(dict.fromkeys((d.get("mailto") or []) + grants + emails))[:6],
        "howto": howto,
        "deadline": dead,
        "portal": d.get("portal", []),
        "title": d.get("title", ""),
    }


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
                    "--disable-dev-shm-usage", "--window-size=1400,1400"])
            rec = {"n": p["n"], "name": p["name"], "chain": p["chain"],
                   "amount": p["amount"], "url": p["url"]}
            try:
                tab = await asyncio.wait_for(browser.get(p["url"]), timeout=90)
                await tab.sleep(11)
                for _ in range(5):
                    await tab.evaluate("(()=>{window.scrollBy(0,window.innerHeight);return '1'})()",
                                       await_promise=False)
                    await tab.sleep(0.6)
                raw = await asyncio.wait_for(tab.evaluate(READ, await_promise=False), timeout=30)
                rec.update(extract(json.loads(raw)))
            except Exception as e:
                rec["error"] = (str(e) or type(e).__name__)[:110]
            with OUT.open("a") as fh:
                fh.write(json.dumps(rec) + "\n")
            bits = []
            if rec.get("emails"):
                bits.append("email:" + rec["emails"][0][:34])
            if rec.get("howto"):
                bits.append("howto x%d" % len(rec["howto"]))
            if rec.get("portal"):
                bits.append("portal x%d" % len(rec["portal"]))
            if rec.get("deadline"):
                bits.append("deadline")
            print("  %-3s %-30s %s" % (rec["n"], rec["name"][:30],
                                       ", ".join(bits) or (rec.get("error") or "nothing found")),
                  flush=True)
            if rec.get("error"):
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
