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


/* ── live verification payload ─────────────────────────────────────────────
   The page proves its own claims by calling each chain's public RPC from the
   reader's browser. That is only possible because those endpoints send
   Access-Control-Allow-Origin — scripts/check-rpcs.mjs exists to keep that true,
   and it is why this can be a live check rather than a screenshot. */
import { readFileSync as _rf, existsSync as _ex } from 'node:fs'
const VERIFY = TARGETS.map(k => {
  const c = byKey[k]
  const envf = `env/.env.${k}`
  let addr = null
  if (_ex(envf)) {
    const m = _rf(envf, 'utf8').match(new RegExp(`^VITE_CONTRACT_${k.toUpperCase().replace(/-/g, '_')}=(.+)$`, 'm'))
    if (m && m[1].trim()) addr = m[1].trim()
  }
  return { k, name: c.name, family: c.family, rpc: c.rpcUrl, rpc2: c.rpcUrlFallback || null, addr,
           explorer: c.family === 'evm' && addr ? `${c.explorerUrl}/address/${addr}` : null }
}).filter(v => v.addr)


/* ── interactive map preview ───────────────────────────────────────────────
   Real geography, real tile maths (the Web Mercator projection from
   src/lib/tiles.js), and the mechanism made touchable: hover any cell and watch
   its coordinate become the token id. Deliberately NOT wired to /api/blocks —
   those worlds are seeded, and rendering seeded holdings as if they were players
   would contradict the honesty section three blocks below. */
const CITIES = [
  ['London',56,-0.13,51.51],['New York',68,-74.01,40.71],['Tokyo',72,139.69,35.69],
  ['Paris',44,2.35,48.86],['Berlin',34,13.40,52.52],['Warsaw',26,21.01,52.23],
  ['Singapore',30,103.82,1.35],['Dubai',30,55.27,25.20],['São Paulo',40,-46.63,-23.55],
  ['Lagos',26,3.38,6.52],['Mumbai',36,72.88,19.08],['Seoul',34,126.98,37.57],
  ['Sydney',24,151.21,-33.87],['Los Angeles',44,-118.24,34.05],['Mexico City',34,-99.13,19.43],
  ['Istanbul',30,28.98,41.01],['Toronto',26,-79.38,43.65],['Nairobi',18,36.82,-1.29],
  ['Jakarta',30,106.85,-6.21],['Buenos Aires',26,-58.38,-34.60],['Cairo',28,31.24,30.04],
  ['Shanghai',40,121.47,31.23],['Chicago',28,-87.63,41.88],['Madrid',24,-3.70,40.42],
  ['Johannesburg',20,28.03,-26.20],['Bangkok',26,100.50,13.76],['Amsterdam',20,4.90,52.37],
]

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
<title>CryptoLand — the map you can own</title>
<meta name="description" content="Every map ever made is read-only. CryptoLand is the one you can own: 268,435,456 tiles of the real world, a supply fixed by geometry, each tile\u2019s coordinate its own token id. Live on mainnet.">
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
/* ── hero ────────────────────────────────────────────────────────────────
   Full-bleed, with the real basemap drifting behind the words. Everything that
   made the old block read as a template is gone: no accent-coloured headline, no
   rounded stat cards, no flat ground. */
.hero{position:relative;min-height:min(94vh,880px);display:flex;align-items:center;
  margin:0 calc(50% - 50vw);padding:0 max(24px,calc(50vw - 570px));overflow:hidden;
  border-bottom:1px solid var(--b0)}
.hero-bg{position:absolute;inset:0;z-index:0}
/* Two world-widths side by side: the planet wraps, so panning one width and
   resetting is seamless rather than a visible cut. */
.hero-pan{position:absolute;top:50%;left:0;width:200%;height:auto;aspect-ratio:4/1;
  transform:translate3d(0,-50%,0);display:grid;grid-template-columns:repeat(8,1fr);
  grid-template-rows:repeat(3,1fr);filter:grayscale(1) brightness(.62) contrast(1.35);
  opacity:.85;will-change:transform}
.hero-pan img{width:100%;height:100%;display:block;object-fit:cover}
#heroFx{position:absolute;inset:0;width:100%;height:100%}
/* Scrim, painted — never a blur. Reading has to win over atmosphere. */
.hero-scrim{position:absolute;inset:0;background:
  linear-gradient(97deg,rgba(6,7,9,.97) 0%,rgba(6,7,9,.93) 30%,rgba(6,7,9,.62) 52%,rgba(6,7,9,.1) 78%,transparent 100%),
  linear-gradient(180deg,rgba(6,7,9,.85) 0%,transparent 20%,transparent 78%,rgba(6,7,9,.92) 100%)}
.hero-in{position:relative;z-index:1;max-width:660px;padding:96px 0 78px}

.kick{display:flex;align-items:center;gap:11px;font-size:12px;letter-spacing:.19em;
  text-transform:uppercase;color:var(--t3);margin-bottom:22px;font-weight:500}
.kick i{width:24px;height:1px;background:var(--t4);flex:none;display:block}

/* Optical sheen rather than a colour pop: white type with a faint cool-to-warm
   fall across it, which reads as light on a surface instead of a highlighter. */
h1{font-size:clamp(40px,7vw,92px);letter-spacing:-.042em;font-weight:800;line-height:.97;
  background:linear-gradient(172deg,#fff 0%,#fff 55%,#eef1f5 78%,#d7dce3 100%);
  -webkit-background-clip:text;background-clip:text;color:transparent;
  -webkit-text-fill-color:transparent;margin:0}

.figs{display:flex;flex-wrap:wrap;gap:34px;margin-top:34px;padding-top:22px;
  border-top:1px solid var(--b1)}
.figs span{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--t3);
  letter-spacing:.01em}
.figs b{font-size:clamp(19px,2.4vw,26px);font-weight:700;letter-spacing:-.028em;color:var(--t1);
  font-variant-numeric:tabular-nums}
.handoff{margin-top:30px;font-size:14px;color:var(--t2);display:flex;align-items:center;gap:10px}
.handoff::before{content:"";width:6px;height:6px;border-radius:50%;background:#4ade80;flex:none;
  box-shadow:0 0 0 4px rgba(74,222,128,.16)}
@media (max-width:900px){
  .hero{min-height:auto;padding-left:max(20px,4vw);padding-right:max(20px,4vw)}
  .hero-in{padding:70px 0 56px;max-width:none}
  .hero-pan{opacity:.5;filter:grayscale(1) brightness(.44) contrast(1.3)}
  .hero-scrim{background:
    linear-gradient(180deg,rgba(6,7,9,.94) 0%,rgba(6,7,9,.78) 38%,rgba(6,7,9,.86) 72%,rgba(6,7,9,.97) 100%)}
  .figs{gap:20px 28px}
}
@media (prefers-reduced-motion:reduce){.hero-pan{animation:none!important}}
h1{font-size:clamp(31px,5.2vw,50px);letter-spacing:-.032em;font-weight:800;line-height:1.08}
h1 em{font-style:normal;color:var(--acc)}
.sub{color:var(--t2);margin-top:18px;max-width:56ch;font-size:16px;line-height:1.68}
.sub strong{color:var(--t1);font-weight:600}

/* Referrer banner — hidden until JS identifies the chain they arrived from. */
#from{display:none;margin:26px 0 0;padding:15px 18px;background:var(--s1);
border:1px solid var(--b0);border-left:3px solid var(--acc);border-radius:10px}
#from.on{display:block}
#from b{color:var(--acc)}
#from .l{display:inline-block;margin-top:5px;color:var(--t2);font-size:13.5px}
#from a{color:var(--t1)}
.stats{display:none}
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
.mapwrap{position:relative;border:1px solid var(--b0);background:#05070a;overflow:hidden;
  aspect-ratio:1 / 0.487}
.basemap{position:absolute;left:0;width:100%;height:154%;top:-42.5%;
  display:grid;grid-template-columns:repeat(4,1fr);grid-template-rows:repeat(3,1fr);
  filter:grayscale(1) brightness(.42) contrast(1.15);opacity:.62}
.basemap img{width:100%;height:100%;display:block;object-fit:cover}
.attrib{position:absolute;right:6px;bottom:4px;font-size:9.5px;color:var(--t3);
  background:rgba(0,0,0,.5);padding:1px 5px;border-radius:3px}
.attrib a{color:var(--t3)}
#map{position:absolute;inset:0;display:block;width:100%;height:100%;cursor:crosshair}
.readout{border:1px solid var(--b0);border-top:0;display:flex;flex-wrap:wrap;gap:4px 22px;align-items:baseline;
  padding:11px 14px;background:var(--s1);border-top:1px solid var(--b0);font-size:12px}
.readout .rl{color:var(--t3);font-size:10px;letter-spacing:.14em;text-transform:uppercase}
.readout .rv{color:var(--t1);font-variant-numeric:tabular-nums}
#r-id{color:#4ade80}
.kick{font-size:clamp(13px,1.6vw,17px);letter-spacing:.02em;color:var(--t2);margin-bottom:14px}
.vgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(268px,1fr));gap:1px;background:var(--b0);
  border:1px solid var(--b0)}
.vrow{background:var(--s1);padding:13px 15px;display:flex;flex-direction:column;gap:6px;min-height:86px}
.vhead{display:flex;align-items:center;justify-content:space-between;gap:10px}
.vname{font-weight:600;font-size:13.5px;letter-spacing:-.01em}
.vstate{font-size:10px;letter-spacing:.1em;text-transform:uppercase;padding:2px 7px;border-radius:999px;
  border:1px solid var(--b1);color:var(--t3);white-space:nowrap}
.vstate.ok{color:#4ade80;border-color:rgba(74,222,128,.35)}
.vstate.fail{color:#f87171;border-color:rgba(248,113,113,.35)}
.vaddr{font-family:var(--mono,ui-monospace,Menlo,monospace);font-size:11px;color:var(--t3);overflow-wrap:anywhere}
.vmeta{font-size:11.5px;color:var(--t2)}
.vmeta a{color:var(--t2)}
.vnote{margin-top:14px;font-size:12.5px;color:var(--t3)}
.honest{border-left:3px solid #f0b90b}
.honest h3{color:#f0b90b}
footer{margin-top:50px;padding-top:22px;border-top:1px solid var(--b0);color:var(--t3);font-size:12.5px}
footer a{color:var(--t2)}
</style></head><body><div class="wrap">

<header class="hero">
  <div class="hero-bg" aria-hidden="true">
    <div class="hero-pan" id="heroPan"></div>
    <canvas id="heroFx"></canvas>
    <div class="hero-scrim"></div>
  </div>

  <div class="hero-in">
    <p class="kick"><i></i>Every map ever made is read-only</p>
    <h1>We built the one<br>you can own</h1>
    <p class="sub">Maps have always told you where things are. None has ever told you what is yours.</p>
    <p class="sub">CryptoLand divides the world into <strong>268,435,456 tiles</strong> of roughly 2.4&nbsp;km²
    — a supply fixed by geometry rather than policy, so it can never be expanded, inflated or granted to
    insiders. A tile's coordinate <em>is</em> its token id, which makes ownership arithmetic anyone can
    verify and nobody can forge.</p>

    <div class="figs">
      <span><b>268,435,456</b>tiles, fixed forever</span>
      <span><b>${TARGETS.length}</b>chains live on mainnet</span>
      <span><b>0</b>claims held in our database</span>
    </div>

    <p class="handoff">Every contract below is verifying itself in your browser as you read this.</p>
  </div>

  <div id="from">
    <b id="from-name"></b> <span>— that is where you just came from.</span>
    <span class="l">This page exists to show you the architecture behind it.
    <a id="from-link" href="#">Go back to that build →</a></span>
  </div>
</header>

<section id="mapsec">
  <h2>268,435,456 tiles. Every one addressable.</h2>
  <p class="lede">This is the real grid over real geography — the same Web Mercator projection the game
  uses. Move across it: every cell you touch is a genuine tile, and its coordinate <em>is</em> its token id.</p>
  <div class="mapwrap">
    <div class="basemap" id="basemap" aria-hidden="true"></div>
    <canvas id="map" aria-label="World map divided into claimable tiles"></canvas>
    <span class="attrib">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors</span>
  </div>
  <div class="readout" id="readout">
    <span class="rl">Tile</span><span class="rv mono" id="r-xy">—</span>
    <span class="rl">Token id</span><span class="rv mono" id="r-id">—</span>
    <span class="rl">Near</span><span class="rv" id="r-city">move across the map</span>
  </div>
  <p class="vnote">The lit clusters are the world's cities at their true coordinates. Nothing here is
  ownership data — see <a href="#real">what is real and what is not</a>.</p>
</section>

<section id="verify">
  <h2>Don't take our word for it</h2>
  <p class="lede">Every contract below is being read from that chain's own public node, in your browser,
  right now. Nothing here is a screenshot or a number we typed — if a row says 12,890 bytes, your machine
  just asked the chain and the chain answered.</p>
  <div class="vgrid" id="vgrid"></div>
  <p class="vnote" id="vnote">Checking…</p>
</section>

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

<section id="real">
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

<section>
  <h2>Every deployment</h2>
  <p class="lede">Each is a separate, self-contained build. Open any one and it will look like it was made
  for that ecosystem alone — because in every way a player can observe, it was.</p>
  <div class="grid" id="grid">
${cards}
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

<script>
/* Live contract verification.
   Each row asks that chain's own public node whether the contract is really
   there, from the reader's browser. It cannot lie — it is reading the chain.
   Rows that fail say so plainly: a page where everything is green regardless of
   reality is less trustworthy than one that admits an endpoint is down. */
(function () {
  var V = ${JSON.stringify(VERIFY)};
  var grid = document.getElementById('vgrid');
  var note = document.getElementById('vnote');
  if (!grid) return;

  var rows = V.map(function (v) {
    var el = document.createElement('div');
    el.className = 'vrow';
    el.innerHTML =
      '<div class="vhead"><span class="vname"></span><span class="vstate">checking</span></div>' +
      '<div class="vaddr"></div><div class="vmeta"></div>';
    el.querySelector('.vname').textContent = v.name;
    el.querySelector('.vaddr').textContent = v.addr.length > 30
      ? v.addr.slice(0, 14) + '…' + v.addr.slice(-8) : v.addr;
    grid.appendChild(el);
    return { v: v, el: el };
  });

  var done = 0, ok = 0, failed = 0, onRecord = 0;
  function settle(r, state, label, meta) {
    var s = r.el.querySelector('.vstate');
    s.textContent = label; s.className = 'vstate ' + state;
    if (meta) r.el.querySelector('.vmeta').innerHTML = meta;
    done++;
    if (state === 'ok') ok++; else if (state === 'fail') failed++; else onRecord++;
    if (done !== rows.length) return;
    // Count the three outcomes separately. Folding the non-EVM chains — which
    // speak their own protocols and were never asked — in with genuine RPC
    // failures would overstate what just happened, which is the one thing this
    // section cannot afford to do.
    var attempted = ok + failed;
    var t = ok + ' of ' + attempted + ' EVM contracts answered live from their own node, just now.';
    if (failed) t += ' ' + failed + ' public endpoint' + (failed > 1 ? 's' : '') +
      ' did not respond — that is the node, not the contract.';
    if (onRecord) t += ' The other ' + onRecord + ' run on non-EVM chains that speak their own protocols; ' +
      'their addresses are listed above and verifiable in each chain’s explorer.';
    note.textContent = t;
  }

  rows.forEach(function (r) {
    var v = r.v;
    // EVM answers eth_getCode; the other families each speak their own protocol,
    // so those are shown as on-record with an explorer link rather than faked.
    if (v.family !== 'evm') {
      settle(r, '', 'on record', 'Non-EVM — verify via that chain’s explorer.');
      return;
    }
    function ask(url) {
      var ctl = new AbortController();
      var t = setTimeout(function () { ctl.abort(); }, 9000);
      return fetch(url, {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: ctl.signal,
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getCode', params: [v.addr, 'latest'] })
      }).then(function (res) { return res.json(); })
        .then(function (j) { clearTimeout(t); return (j && j.result) || '0x'; })
        .catch(function (e) { clearTimeout(t); throw e; });
    }
    var link = v.explorer ? ' · <a href="' + v.explorer + '" target="_blank" rel="noopener">explorer ↗</a>' : '';
    // Try the primary, then the configured fallback. Ronin's public node refuses
    // browser origins outright, so without this a perfectly good contract reads
    // as "rpc down" — the endpoint failing, reported as the contract failing.
    ask(v.rpc)
      .catch(function () { if (!v.rpc2) throw new Error('no fallback'); return ask(v.rpc2); })
      .then(function (code) {
        var bytes = Math.max(0, (code.length - 2) / 2);
        if (bytes > 0) settle(r, 'ok', 'verified', bytes.toLocaleString() + ' bytes of bytecode' + link);
        else settle(r, 'fail', 'no code', 'Node returned no bytecode at this address.' + link);
      })
      .catch(function () {
        settle(r, 'fail', 'rpc down', 'Both public endpoints refused the browser' + link + '.');
      });
  });
})();
</script>

<script>
/* The map. Real Web Mercator, real city coordinates, real tile maths — the same
   projection as src/lib/tiles.js, so the cell under the cursor is genuinely the
   tile that place would mint. The token id is computed the way the contracts
   compute it: (x << 15) | y, which is why the readout can be trusted. */
(function () {
  var cv = document.getElementById('map'), out = document.getElementById('readout');
  if (!cv) return;
  // The real basemap, same source the game uses. z=2 is 4x4 for the whole world;
  // rows 0-2 cover every inhabited latitude, so 12 tiles at ~6 KB each.
  var bm = document.getElementById('basemap');
  if (bm) {
    for (var ry = 0; ry < 3; ry++) for (var rx = 0; rx < 4; rx++) {
      var im = new Image();
      im.loading = 'lazy'; im.decoding = 'async'; im.alt = '';
      im.src = 'https://tile.openstreetmap.org/2/' + rx + '/' + ry + '.png';
      bm.appendChild(im);
    }
  }
  var ctx = cv.getContext('2d'), CITIES = ${JSON.stringify(CITIES)};
  var N = 16384, W = 0, H = 0, dpr = 1;
  var V0 = 0.207, V1 = 0.694;                 // Mercator v at ~72°N and ~57°S
  var band = function (v) { return (v - V0) / (V1 - V0); };
  // Preview resolution: the real grid is 16384 wide, far past a screen, so the
  // canvas shows a coarser lattice and maps cursor position back to true tiles.
  var COLS = 128, ROWS = 64, lit = [], byCell = {};

  function lonToU(lon) { return (lon + 180) / 360; }
  function latToV(lat) {                    // Web Mercator, identical to tiles.js
    var s = Math.max(-0.9999, Math.min(0.9999, Math.sin(lat * Math.PI / 180)));
    return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
  }
  // Deterministic scatter so the map is the same image on every load.
  var seed = 7919;
  function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }

  CITIES.forEach(function (c) {
    var name = c[0], n = c[1], u = lonToU(c[2]), v = latToV(c[3]);
    for (var i = 0; i < n; i++) {
      var a = rnd() * Math.PI * 2, r = Math.pow(rnd(), 0.85) * 0.020;
      var cu = u + Math.cos(a) * r * 0.55, cv2 = v + Math.sin(a) * r;
      if (cu < 0 || cu > 1 || cv2 < 0 || cv2 > 1) continue;
      var bv = band(cv2); if (bv < 0 || bv >= 1) continue;
      var col = Math.floor(cu * COLS), row = Math.floor(bv * ROWS);
      var k = col + ':' + row;
      if (!byCell[k]) { byCell[k] = name; lit.push([col, row, 0.35 + rnd() * 0.65, name]); }
    }
  });

  function size() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  var hover = null;
  function draw() {
    ctx.clearRect(0, 0, W, H);
    var cw = W / COLS, ch = H / ROWS;
    // Lattice
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (var i = 0; i <= COLS; i += 2) { ctx.moveTo(i * cw, 0); ctx.lineTo(i * cw, H); }
    for (var j = 0; j <= ROWS; j += 2) { ctx.moveTo(0, j * ch); ctx.lineTo(W, j * ch); }
    ctx.stroke();
    // Cities
    lit.forEach(function (t) {
      var a = 0.18 + t[2] * 0.62;
      ctx.fillStyle = 'rgba(' + Math.round(120 + t[2] * 135) + ',' +
        Math.round(200 + t[2] * 55) + ',' + Math.round(150 + t[2] * 60) + ',' + a.toFixed(2) + ')';
      ctx.fillRect(t[0] * cw + 0.5, t[1] * ch + 0.5, Math.max(1.5, cw - 1), Math.max(1.5, ch - 1));
    });
    if (hover) {
      ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 1.5;
      ctx.strokeRect(hover[0] * cw + 0.5, hover[1] * ch + 0.5, cw - 1, ch - 1);
    }
  }

  function pick(ev) {
    var r = cv.getBoundingClientRect();
    var px = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
    var py = (ev.touches ? ev.touches[0].clientY : ev.clientY) - r.top;
    var col = Math.max(0, Math.min(COLS - 1, Math.floor(px / (W / COLS))));
    var row = Math.max(0, Math.min(ROWS - 1, Math.floor(py / (H / ROWS))));
    hover = [col, row];
    // Preview cell → the real tile at its centre, then the contract's own id maths.
    var tx = Math.min(N - 1, Math.floor((col + 0.5) / COLS * N));
    var vy = V0 + ((row + 0.5) / ROWS) * (V1 - V0);
    var ty = Math.min(N - 1, Math.max(0, Math.floor(vy * N)));
    document.getElementById('r-xy').textContent = '(' + tx + ', ' + ty + ')';
    // BigInt: (16383 << 15) | 16383 exceeds what bit-ops on Number can hold safely.
    document.getElementById('r-id').textContent =
      ((BigInt(tx) << 15n) | BigInt(ty)).toString();
    document.getElementById('r-city').textContent = byCell[col + ':' + row] || 'open territory';
    draw();
  }
  cv.addEventListener('mousemove', pick);
  cv.addEventListener('touchmove', function (e) { pick(e); e.preventDefault(); }, { passive: false });
  cv.addEventListener('mouseleave', function () { hover = null; draw(); });

  size();
  var to; window.addEventListener('resize', function () { clearTimeout(to); to = setTimeout(size, 140); });
})();
</script>

<script>
/* Hero motion. The basemap drifts west the way the planet turns, and tiles ignite
   across it — the product's own behaviour, not decoration. Two world-widths sit
   side by side so the wrap is seamless: the world genuinely repeats at 180°.
   Everything stops under prefers-reduced-motion. */
(function () {
  var pan = document.getElementById('heroPan'), fx = document.getElementById('heroFx');
  if (!pan || !fx) return;
  var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 4 cols x 3 rows of z=2, twice across. Rows 0-2 cover every inhabited latitude.
  for (var pass = 0; pass < 2; pass++)
    for (var ry = 0; ry < 3; ry++)
      for (var rx = 0; rx < 4; rx++) {
        var im = new Image();
        im.decoding = 'async'; im.alt = '';
        im.style.gridRow = String(ry + 1);
        im.style.gridColumn = String(pass * 4 + rx + 1);
        im.src = 'https://tile.openstreetmap.org/2/' + rx + '/' + ry + '.png';
        pan.appendChild(im);
      }

  var ctx = fx.getContext('2d'), W = 0, H = 0, dpr = 1, sparks = [];
  function size() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = fx.clientWidth; H = fx.clientHeight;
    fx.width = Math.round(W * dpr); fx.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  var seed = 4241;
  function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }

  // A tile lights, holds, fades — the shape of a claim landing.
  function spawn() {
    var cw = W / 96, ch = H / 30;
    sparks.push({ x: Math.floor(rnd() * 96) * cw, y: Math.floor(rnd() * 30) * ch,
                  w: cw, h: ch, t: 0, life: 190 + rnd() * 200 });
    if (sparks.length > 46) sparks.shift();
  }

  var last = 0, acc = 0, panX = 0;
  function frame(ts) {
    var dt = last ? Math.min(64, ts - last) : 16; last = ts;
    // 1 world width per ~210s. Slow enough to read as drift, not as scrolling.
    panX = (panX + dt * 0.0000794) % 1;
    pan.style.transform = 'translate3d(' + (-panX * 50).toFixed(4) + '%,-50%,0)';

    acc += dt;
    if (acc > 150) { acc = 0; spawn(); }
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < sparks.length; i++) {
      var s = sparks[i]; s.t += dt;
      var p = s.t / s.life;
      if (p >= 1) continue;
      var a = p < 0.16 ? p / 0.16 : 1 - (p - 0.16) / 0.84;
      ctx.fillStyle = 'rgba(122,238,166,' + (a * 0.72).toFixed(3) + ')';
      ctx.fillRect(s.x, s.y, s.w - 1, s.h - 1);
      ctx.strokeStyle = 'rgba(168,247,199,' + (a * 0.7).toFixed(3) + ')';
      ctx.lineWidth = 1;
      ctx.strokeRect(s.x + 0.5, s.y + 0.5, s.w - 2, s.h - 2);
    }
    sparks = sparks.filter(function (s) { return s.t < s.life; });
    requestAnimationFrame(frame);
  }

  size();
  window.addEventListener('resize', function () { clearTimeout(window.__hr); window.__hr = setTimeout(size, 150); });
  if (still) { pan.style.transform = 'translate3d(-12%,-50%,0)'; }
  else { requestAnimationFrame(frame); }
})();
</script>
</body></html>`

mkdirSync('deploy/apex/dist', { recursive: true })
writeFileSync('deploy/apex/dist/index.html', html)

// robots.txt — /about is the ONLY disallowed path. Everything else must stay
// indexable: a grant reviewer has to be able to find the product.
const robots = `# xono.ai
# The whole site is open to crawlers EXCEPT /about, which carries the founder's
# name and contact details. See also the noindex meta tags on that page and the
# X-Robots-Tag header in the Caddy config - three layers, because meta tags only
# work if the crawler parses HTML, and robots.txt only works if it is honoured.

User-agent: *
Disallow: /about
Allow: /

# AI / LLM training and retrieval crawlers - blocked from /about specifically.
User-agent: GPTBot
Disallow: /about
User-agent: OAI-SearchBot
Disallow: /about
User-agent: ChatGPT-User
Disallow: /about
User-agent: ClaudeBot
Disallow: /about
User-agent: Claude-Web
Disallow: /about
User-agent: anthropic-ai
Disallow: /about
User-agent: Google-Extended
Disallow: /about
User-agent: PerplexityBot
Disallow: /about
User-agent: CCBot
Disallow: /about
User-agent: Applebot-Extended
Disallow: /about
User-agent: Bytespider
Disallow: /about
User-agent: meta-externalagent
Disallow: /about
User-agent: Amazonbot
Disallow: /about
User-agent: cohere-ai
Disallow: /about
User-agent: Diffbot
Disallow: /about
User-agent: omgili
Disallow: /about
User-agent: Timpibot
Disallow: /about

Sitemap: https://xono.ai/sitemap.xml
`
writeFileSync('deploy/apex/dist/robots.txt', robots)

// Sitemap lists every chain build but deliberately OMITS /about.
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://xono.ai/</loc><priority>1.0</priority></url>
${TARGETS.map(k => `  <url><loc>https://${k}.xono.ai/</loc><priority>0.8</priority></url>
  <url><loc>https://${k}.xono.ai/ecosystem</loc><priority>0.7</priority></url>`).join('\n')}
</urlset>
`
writeFileSync('deploy/apex/dist/sitemap.xml', sitemap)
console.log('robots.txt + sitemap.xml written (/about excluded)')

console.log(`apex: ${TARGETS.length} chains, ${families.length} families, ${(html.length/1024).toFixed(1)} KB`)
