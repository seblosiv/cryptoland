/**
 * build-apex.mjs — the apex landing page for xono.ai.
 *
 * WHO THIS IS FOR, and why it reads the way it does.
 *
 * The likely visitor is a grant reviewer who arrived from ONE per-chain
 * subdomain — say ton.xono.ai — and followed the apex link out of curiosity.
 * That is a hostile moment if handled badly: an application to TON says "we
 * built this natively for TON", and a page headlined "27 chain-native builds"
 * tells them the same thing was said 26 other times. Every specific claim on the
 * subdomain retroactively reads as a template with the variables swapped, and a
 * grid of equal cards invites them to feel like 1/27th of someone's attention.
 *
 * Three deliberate choices answer that:
 *
 *  1. The fleet count is NOT the headline. The claim is one product with a
 *     portable architecture — 13 adapter families, not 27 forks. Investors fund
 *     reach; "this runs natively everywhere and we went deep on yours" is a
 *     strength, "here are 27 identical apps" is a red flag. Same facts.
 *
 *  2. The page is REFERRER-AWARE. Arriving from ton.xono.ai (or ?from=ton) pins
 *     TON to the top in its own accent and says so plainly. A reviewer should
 *     never have to find their own ecosystem in row 17 of a table.
 *
 *  3. Disclosure is specific and unapologetic, not a blanket hedge. Exactly
 *     which numbers are seeded, which are real, and what is next on-chain. A
 *     reviewer who discovers the seeding themselves is a lost grant; one who is
 *     told precisely what it is has been given a reason to trust the rest.
 *
 * Generated from config.js + profiles.js, so it cannot drift from what is
 * actually deployed.
 */
import { writeFileSync, mkdirSync } from 'node:fs'

const { MAINNET_CHAINS } = await import('../../src/lib/blockchain/config.js')
const { PROFILES } = await import('../../src/config/profiles.js')

const TARGETS = ['polygon','avalanche','base','arbitrum','ronin','bnb','optimism','scroll','celo',
  'moonbeam','beam','oasys','skale','hedera','injective','solana','ton','aptos','sui','starknet',
  'cardano','near','stellar','algorand','multiversx','radix','tezos']

const byKey = Object.fromEntries(MAINNET_CHAINS.map(c => [c.key, c]))
const esc = s => String(s ?? '').replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]))

// Same contrast derivation as the app: a brand hex chosen for a white site is
// often unreadable on near-black, so lighten it only as far as 4.5:1 on #141414.
const hex2rgb = h => { const s=h.replace('#',''); return [0,2,4].map(i=>parseInt(s.slice(i,i+2),16)) }
const lum = rgb => { const [r,g,b]=rgb.map(v=>{const c=v/255;return c<=0.03928?c/12.92:((c+0.055)/1.055)**2.4}); return 0.2126*r+0.7152*g+0.0722*b }
const contrast = (a,b) => { const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p); return (x+0.05)/(y+0.05) }
const S1 = hex2rgb('#141414')
function ui(hex){ const rgb=hex2rgb(hex); if(contrast(rgb,S1)>=4.5) return hex
  let lo=0,hi=1,best=[255,255,255]
  for(let i=0;i<12;i++){const t=(lo+hi)/2;const m=rgb.map(v=>v+(255-v)*t)
    if(contrast(m,S1)>=4.5){best=m;hi=t}else lo=t}
  return '#'+best.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('') }

const families = [...new Set(TARGETS.map(k => byKey[k].family))]
const evmCount = TARGETS.filter(k => byKey[k].family === 'evm').length

const meta = TARGETS.map(k => {
  const c = byKey[k], p = PROFILES[k] ?? {}
  return { k, name: c.name, family: c.family, accent: ui(p.accent ?? c.color),
           cur: c.nativeCurrency?.symbol ?? '', gasless: !!c.gasless,
           term: p.onboarding?.nativeTerm ?? 'an NFT' }
})

const cards = meta.map(m => `      <a class="card" data-chain="${m.k}" data-family="${esc(m.family)}"
         href="https://${m.k}.xono.ai" style="--a:${m.accent}">
        <span class="you">You came from here</span>
        <div class="row"><span class="dot"></span><span class="name">${esc(m.name)}</span></div>
        <div class="term">${esc(m.term)}</div>
        <div class="meta"><span class="cur">${esc(m.cur)}</span>${m.gasless ? '<span class="gas">zero gas</span>' : ''}<span class="eco">/ecosystem →</span></div>
      </a>`).join('\n')

const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CryptoLand — own the world, native to your chain</title>
<meta name="description" content="A geospatial territory game over the real world: 268,435,456 claimable tiles. One codebase, ${families.length} adapter families, deployed natively on ${TARGETS.length} chains.">
<meta property="og:title" content="CryptoLand — own the world, native to your chain">
<meta property="og:description" content="268,435,456 claimable tiles over the real world. One codebase, ${families.length} adapter families, native on every chain it ships to.">
<meta property="og:type" content="website">
<style>
:root{--bg:#0f0f0f;--s1:#141414;--s2:#1a1a1a;--s3:#222;--b0:rgba(255,255,255,.08);
--b1:rgba(255,255,255,.14);--t1:#fff;--t2:#a8a8a8;--t3:#6e6e6e;--acc:#4ade80}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--t1);font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;
-webkit-font-smoothing:antialiased;padding:0 20px 90px}
.wrap{max-width:1080px;margin:0 auto}
header{padding:70px 0 40px}
h1{font-size:clamp(31px,5.2vw,50px);letter-spacing:-.032em;font-weight:800;line-height:1.08}
h1 em{font-style:normal;color:var(--acc)}
.sub{color:var(--t2);margin-top:18px;max-width:60ch;font-size:16.5px}
/* Referrer banner — hidden until JS identifies the chain they arrived from. */
#from{display:none;margin:26px 0 0;padding:15px 18px;background:var(--s1);
border:1px solid var(--b0);border-left:3px solid var(--acc);border-radius:10px}
#from.on{display:block}
#from b{color:var(--acc)}
#from .l{display:inline-block;margin-top:5px;color:var(--t2);font-size:13.5px}
#from a{color:var(--t1)}
.stats{display:flex;flex-wrap:wrap;gap:9px;margin-top:26px}
.stat{background:var(--s2);border:1px solid var(--b0);border-radius:10px;padding:11px 15px}
.stat b{display:block;font-size:19px;letter-spacing:-.02em}
.stat span{color:var(--t3);font-size:10.5px;text-transform:uppercase;letter-spacing:.08em}
section{margin-top:52px}
h2{font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:var(--t3);margin-bottom:8px}
.lede{color:var(--t2);max-width:72ch;margin-bottom:20px}
.grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(238px,1fr))}
.card{position:relative;display:block;background:var(--s1);border:1px solid var(--b0);
border-radius:12px;padding:15px 16px;text-decoration:none;color:inherit;
transition:border-color .15s,background .15s,transform .15s}
.card:hover{background:var(--s2);border-color:var(--a);transform:translateY(-1px)}
.card.hi{border-color:var(--a);background:var(--s2);order:-1;box-shadow:0 0 0 1px var(--a)}
.you{display:none}
.card.hi .you{display:inline-block;position:absolute;top:-9px;left:14px;background:var(--a);
color:#0f0f0f;font-size:9.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;
padding:2px 8px;border-radius:99px}
.row{display:flex;align-items:center;gap:9px}
.dot{width:8px;height:8px;border-radius:50%;background:var(--a);flex:0 0 auto}
.name{font-weight:700;letter-spacing:-.01em}
.term{color:var(--t2);font-size:12.5px;margin-top:7px;min-height:2.6em}
.meta{display:flex;align-items:center;gap:8px;margin-top:10px;font-size:10.5px;
text-transform:uppercase;letter-spacing:.07em;font-weight:700}
.cur{color:var(--a)}
.gas{color:var(--t3)}
.eco{margin-left:auto;color:var(--t3);text-transform:none;letter-spacing:0;font-weight:600;font-size:11.5px}
.card:hover .eco{color:var(--t2)}
.two{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(310px,1fr))}
.panel{background:var(--s1);border:1px solid var(--b0);border-radius:12px;padding:19px 21px}
.panel h3{font-size:14.5px;margin-bottom:9px;letter-spacing:-.01em}
.panel p{color:var(--t2);font-size:13.5px}
.panel code{background:var(--s3);padding:1px 5px;border-radius:4px;font-size:12px}
.honest{border-left:3px solid #f0b90b}
.honest h3{color:#f0b90b}
footer{margin-top:50px;padding-top:22px;border-top:1px solid var(--b0);color:var(--t3);font-size:12.5px}
footer a{color:var(--t2)}
</style></head><body><div class="wrap">

<header>
  <h1>Own the world.<br><em>Native to your chain.</em></h1>
  <p class="sub">CryptoLand divides the real world into a 16,384 × 16,384 tile grid — 268,435,456 claimable
  territories of roughly 2.4 km². Players buy, customise, trade, raid and govern land, with AI Guardian
  agents defending it while they are offline.</p>

  <div id="from">
    <b id="from-name"></b> <span>— that is where you just came from.</span>
    <span class="l">This page exists to show you the architecture behind it.
    <a id="from-link" href="#">Go back to that build →</a></span>
  </div>

  <div class="stats">
    <div class="stat"><b>268M</b><span>Claimable tiles</span></div>
    <div class="stat"><b>~2.4 km²</b><span>Per tile</span></div>
    <div class="stat"><b>${families.length}</b><span>Adapter families</span></div>
    <div class="stat"><b>1</b><span>Codebase</span></div>
  </div>
</header>

<section>
  <h2>The architecture</h2>
  <p class="lede">The interesting number is not how many chains this runs on — it is that going native on a
  new one is an adapter, not a fork.</p>
  <div class="two">
    <div class="panel">
      <h3>${families.length} adapter families, not ${TARGETS.length} forks</h3>
      <p>Every chain implements the same 24-function adapter interface, contract-tested in CI. ${evmCount} EVM chains
      share a single adapter; the other ${families.length - 1} families — Move, Cairo, UTXO, Soroban, ESDT, FA2 and the rest —
      each have their own. One codebase, one game, one set of mechanics.</p>
    </div>
    <div class="panel">
      <h3>Native, not wrapped</h3>
      <p>A tile is whatever that ecosystem's own primitive is: an ASA on Algorand, a Move object on Aptos,
      an FA2 token on Tezos, a native asset on Cardano. Wallets, fee language and the asset model come from
      the chain, not from a lowest common denominator.</p>
    </div>
    <div class="panel">
      <h3>Isolated deployments</h3>
      <p>Each build is its own bundle, its own database and its own backend. Nothing is shared, so one
      ecosystem's world, players and metrics can never appear inside another's.</p>
    </div>
    <div class="panel">
      <h3>Verifiable from the page</h3>
      <p>Every build reads the current head of its own chain from that chain's own node and shows it live —
      a number you can check against a block explorer in ten seconds.</p>
    </div>
  </div>
</section>

<section>
  <h2>Every deployment</h2>
  <p class="lede">Each is a separate, self-contained build. Open any one and it will look like it was made
  for that ecosystem alone — because in every way a player can observe, it was.</p>
  <div class="grid" id="grid">
${cards}
  </div>
</section>

<section>
  <h2>What is real, and what is not</h2>
  <div class="panel honest">
    <h3>Read this before you check the numbers</h3>
    <p><strong>The worlds are seeded.</strong> Owners, purchases and activity were generated by
    <code>server/seed_chain.py</code> with chain-correct addresses and modelled retention, so no build looks
    abandoned. They are demo data and we would rather say so here than have you work it out.<br><br>
    <strong>No NFT contract is deployed yet</strong>, so on-chain minting is stubbed and every build reports
    <code>0</code> on-chain mints. The tile ledger is the database; the chain is the payment rail and the
    intended anchor.<br><br>
    <strong>What is genuinely live:</strong> the game loop, wallet authentication, payments, the per-chain
    adapters, and the chain-head reading on each build. Each deployment's <code>/ecosystem</code> page
    reports its own traction from its own database and states the same caveats.</p>
  </div>
</section>

<footer>
  <a href="/about" style="color:var(--acc)">About &amp; who builds this →</a><br><br>
  Every build exposes <code>/ecosystem</code> — that chain's live traction, its native integration spec, and
  an explicit statement of what is and is not deployed on-chain.
</footer>

</div>
<script>
// Surface the ecosystem the visitor arrived from. A reviewer who came from
// ton.xono.ai should see TON acknowledged at the top, not have to find it in
// row 17 — that is the whole difference between "one of 27" and "yours".
(function () {
  var names = ${JSON.stringify(Object.fromEntries(meta.map(m => [m.k, m.name])))};
  var accents = ${JSON.stringify(Object.fromEntries(meta.map(m => [m.k, m.accent])))};
  var key = null;

  // ?from=ton wins (survives referrer-stripping), then the actual referrer.
  var q = new URLSearchParams(location.search).get('from');
  if (q && names[q]) key = q;
  if (!key && document.referrer) {
    try {
      var h = new URL(document.referrer).hostname.split('.')[0];
      if (names[h]) key = h;
    } catch (e) { /* opaque or malformed referrer — stay neutral */ }
  }
  if (!key) return;   // Direct visit: no claim about where they came from.

  document.documentElement.style.setProperty('--acc', accents[key]);
  var card = document.querySelector('.card[data-chain="' + key + '"]');
  if (card) card.classList.add('hi');
  document.getElementById('from-name').textContent = 'CryptoLand on ' + names[key];
  var link = document.getElementById('from-link');
  link.href = 'https://' + key + '.xono.ai';
  link.textContent = 'Back to the ' + names[key] + ' build →';
  document.getElementById('from').classList.add('on');
})();
</script>
</body></html>`

mkdirSync('deploy/apex/dist', { recursive: true })
writeFileSync('deploy/apex/dist/index.html', html)
console.log(`apex: ${TARGETS.length} chains, ${families.length} families, ${(html.length/1024).toFixed(1)} KB`)
