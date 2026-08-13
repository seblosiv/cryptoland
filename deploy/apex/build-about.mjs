/**
 * build-about.mjs — /about : who is behind CryptoLand.
 *
 * WHY THIS PAGE EXISTS. A sweep of 41 grant programme pages through ISP proxies
 * found team/founder information demanded on 85% of the readable ones (17/20) —
 * more than open source (30%), more than a live product (35%), more than any
 * traction metric (5%). It is the single most-required thing in the entire grant
 * corpus, and the site had none of it: zero hits for team, founder, contact or
 * any social handle.
 *
 * Deliberately factual. Every claim here is checkable against the live
 * deployments or the repo. No invented achievements, no fabricated company, no
 * "10+ years of experience" filler — a reviewer who disproves one line stops
 * believing the rest of the application.
 */
import { writeFileSync, mkdirSync } from 'node:fs'

/**
 * Render a string as an inline SVG image rather than HTML text.
 *
 * WHY: the founder NAME is drawn as SVG rather than marked up, so a naive text
 * extractor gets nothing. The EMAIL is deliberately plain, selectable text — a
 * grant reviewer has to be able to copy it, and hiding it from a human to
 * inconvenience a scraper is the wrong trade.
 *
 * HONEST LIMIT: this stops naive scraping only. The text still lives in the SVG
 * source, so anyone who looks at the markup, or runs OCR, can read it. It raises
 * the cost; it does not make the data private. Indexing is kept off by three
 * layers that actually bind: noindex meta tags, an X-Robots-Tag header from
 * Caddy, and a robots.txt disallow naming 15 AI and search crawlers.
 *
 * Accessibility is preserved with role="img" + aria-label so screen readers and
 * keyboard users are unaffected.
 */
const svgText = (text, { size = 42, weight = 800, fill = 'var(--t1)', letter = '-0.03em', label } = {}) => {
  const w = Math.ceil(text.length * size * 0.58)
  const h = Math.ceil(size * 1.32)
  return `<svg role="img" aria-label="${esc(label ?? text)}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"
    style="max-width:100%;height:auto;display:block" xmlns="http://www.w3.org/2000/svg">
    <text x="0" y="${Math.round(size)}" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif"
      font-size="${size}" font-weight="${weight}" letter-spacing="${letter}" fill="${fill}">${esc(text)}</text>
  </svg>`
}
const esc = s => String(s ?? '').replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]))


const { MAINNET_CHAINS } = await import('../../src/lib/blockchain/config.js')
const TARGETS = 27
const FAMILIES = [...new Set(MAINNET_CHAINS.map(c => c.family))].length

const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>About — CryptoLand</title>
<meta name="description" content="Who builds CryptoLand.">
<!-- THIS PAGE ONLY: keep the founder's identity out of search indexes and AI
     training corpora. Everything else on xono.ai stays fully indexable - a grant
     reviewer must be able to find the product. noarchive also suppresses
     cached copies, which otherwise outlive any later change here. -->
<meta name="robots" content="noindex, nofollow, noarchive, nosnippet, noimageindex">
<meta name="googlebot" content="noindex, nofollow, noarchive, nosnippet">
<meta name="google" content="nositelinkssearchbox">
<!-- Named AI/LLM crawlers. These are honoured voluntarily; see robots.txt for
     the same list, and the X-Robots-Tag header for the case where a crawler
     fetches the file without parsing the HTML. -->
<meta name="GPTBot" content="noindex, nofollow">
<meta name="OAI-SearchBot" content="noindex, nofollow">
<meta name="ChatGPT-User" content="noindex, nofollow">
<meta name="ClaudeBot" content="noindex, nofollow">
<meta name="anthropic-ai" content="noindex, nofollow">
<meta name="Google-Extended" content="noindex, nofollow">
<meta name="PerplexityBot" content="noindex, nofollow">
<meta name="CCBot" content="noindex, nofollow">
<meta name="Applebot-Extended" content="noindex, nofollow">
<meta name="Bytespider" content="noindex, nofollow">
<meta name="meta-externalagent" content="noindex, nofollow">

<style>
:root{--bg:#0f0f0f;--s1:#141414;--s2:#1a1a1a;--s3:#222;--b0:rgba(255,255,255,.08);
--t1:#fff;--t2:#a8a8a8;--t3:#6e6e6e;--acc:#4ade80}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--t1);font:15px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;
-webkit-font-smoothing:antialiased;padding:0 20px 90px}
.wrap{max-width:820px;margin:0 auto}
a{color:var(--acc)}
header{padding:64px 0 30px}
.back{display:inline-block;margin-bottom:26px;color:var(--t3);text-decoration:none;font-size:13px}
.back:hover{color:var(--t2)}
h1{font-size:clamp(28px,4.6vw,42px);letter-spacing:-.03em;font-weight:800;line-height:1.1}
.role{color:var(--t2);margin-top:10px;font-size:16px}
.who{display:flex;gap:22px;align-items:flex-start;margin-top:30px;flex-wrap:wrap}
.avatar{width:104px;height:104px;border-radius:14px;border:1px solid var(--b0);
object-fit:cover;flex:0 0 auto;background:var(--s2)}
.bio{flex:1 1 360px;color:var(--t2)}
.bio p+p{margin-top:12px}
h2{font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:var(--t3);margin:44px 0 14px}
.panel{background:var(--s1);border:1px solid var(--b0);border-radius:12px;padding:19px 21px}
.panel+.panel{margin-top:10px}
.panel h3{font-size:14.5px;margin-bottom:7px}
.panel p{color:var(--t2);font-size:13.5px}
.grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(215px,1fr))}
.links{display:flex;flex-wrap:wrap;gap:9px;margin-top:6px}
.link{display:inline-flex;align-items:center;gap:7px;background:var(--s2);border:1px solid var(--b0);
border-radius:9px;padding:10px 15px;text-decoration:none;color:var(--t1);font-size:13.5px}
.link:hover{border-color:var(--acc)}
.link span{color:var(--t3);font-size:11.5px}
code{background:var(--s3);padding:1px 5px;border-radius:4px;font-size:12.5px}
.honest{border-left:3px solid #f0b90b}
.honest h3{color:#f0b90b}
footer{margin-top:46px;padding-top:20px;border-top:1px solid var(--b0);color:var(--t3);font-size:12.5px}
</style></head><body><div class="wrap">

<header>
  <a class="back" href="/">← CryptoLand</a>
  <h1 style="margin-bottom:2px">${svgText('Seb Bochenek', { size: 42, label: 'Founder name' })}</h1>
  <div class="role">Founder &amp; engineer — CryptoLand</div>

  <div class="who">
    <img class="avatar" src="/founder.jpg" width="104" height="104"
         alt="Founder portrait" loading="lazy" decoding="async">
    <div class="bio">
      <p>I build CryptoLand: a geospatial territory game over the real world, shipped as
      ${TARGETS} chain-native deployments from a single codebase.</p>
      <p>The engineering position is that going native on a new chain should be an adapter,
      not a fork. ${FAMILIES} adapter families cover every supported ecosystem behind one
      24-function interface, contract-tested in the suite, so a chain's own primitives —
      an ASA, a Move object, an FA2 token — reach the player rather than a lowest common
      denominator.</p>
    </div>
  </div>

  <div class="panel" style="margin-top:22px">
    <h3>Registered entity</h3>
    <p><strong>CryptoLand LTD</strong> — Mahé, Seychelles.<br>
    Grants are received by the company; KYC/KYB can be completed on request, which
    Starknet, Alliance DAO and Tezos each require before funds are released.</p>
  </div>

  <div class="links">
    <a class="link" href="https://www.linkedin.com/in/sebbusiness/" rel="me noopener" target="_blank">LinkedIn <span>@sebbusiness</span></a>
    <a class="link" href="mailto:hello@xono.ai">Email <span>hello@xono.ai</span></a>
    <a class="link" href="/">The game <span>27 live deployments</span></a>
  </div>
</header>

<h2>What is shipped</h2>
<div class="grid">
  <div class="panel"><h3>${TARGETS} live deployments</h3><p>Each with its own bundle, database and backend,
  reachable at <code>&lt;chain&gt;.xono.ai</code>. Nothing is shared between them.</p></div>
  <div class="panel"><h3>${FAMILIES} adapter families</h3><p>One 24-function interface. 15 EVM chains share a
  single adapter; the rest — Move, Cairo, UTXO, Soroban, ESDT, FA2 — each have their own.</p></div>
  <div class="panel"><h3>Live chain proof</h3><p>Every build reads its own chain's head from that chain's own
  node and shows it, so the integration is checkable against a block explorer.</p></div>
  <div class="panel"><h3>Telegram Mini App</h3><p>The TON build runs inside Telegram, with server-side
  <code>initData</code> HMAC verification rather than trusting the client.</p></div>
</div>

<h2>Where I need help</h2>
<div class="panel honest">
  <h3>Said plainly, because you would find it anyway</h3>
  <p><strong>No NFT contract is deployed yet</strong> — on-chain minting is stubbed and every build honestly
  reports zero on-chain mints. <strong>The worlds are seeded demo data</strong> so no deployment looks
  abandoned; they are generated with chain-correct addresses and modelled retention, not real players.<br><br>
  What a grant unlocks, concretely: contract deployment and audit on the target chain, moving recurring
  gameplay on-chain so activity accrues, and user acquisition to replace seeded worlds with real ones.</p>
</div>

<footer>
  Every per-chain deployment also exposes <code>/ecosystem</code> — that chain's live traction, its native
  integration spec, and the same disclosures as above.
</footer>

</div>
</body></html>`

mkdirSync('deploy/apex/dist', { recursive: true })
writeFileSync('deploy/apex/dist/about.html', html)
console.log(`about page: ${(html.length/1024).toFixed(1)} KB`)
