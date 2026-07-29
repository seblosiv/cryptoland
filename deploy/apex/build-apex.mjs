/**
 * build-apex.mjs — generate the apex landing page for xono.ai.
 *
 * The apex is the URL that goes at the top of a grant application when the point
 * being made is "this ships as N chain-native builds". Each per-chain subdomain
 * argues for one chain; this page is the only place the whole fleet is visible
 * at once. Generated from config.js + profiles.js so it can never drift from
 * what is actually deployed.
 */
import { writeFileSync, mkdirSync } from 'node:fs'

const { MAINNET_CHAINS } = await import('../../src/lib/blockchain/config.js')
const { PROFILES } = await import('../../src/config/profiles.js')

const TARGETS = ['polygon','avalanche','base','arbitrum','ronin','bnb','optimism','scroll','celo',
  'moonbeam','beam','oasys','skale','hedera','injective','solana','ton','aptos','sui','starknet',
  'cardano','near','stellar','algorand','multiversx','radix','tezos']

const byKey = Object.fromEntries(MAINNET_CHAINS.map(c => [c.key, c]))
const esc = s => String(s ?? '').replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]))

// Same contrast derivation the app uses: a brand hex chosen for a white site is
// often unreadable on near-black, so lighten it until it clears 4.5:1 on #141414.
const hex2rgb = h => { const s=h.replace('#',''); return [0,2,4].map(i=>parseInt(s.slice(i,i+2),16)) }
const lum = rgb => { const [r,g,b]=rgb.map(v=>{const c=v/255;return c<=0.03928?c/12.92:((c+0.055)/1.055)**2.4}); return 0.2126*r+0.7152*g+0.0722*b }
const contrast = (a,b) => { const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p); return (x+0.05)/(y+0.05) }
const S1 = hex2rgb('#141414')
function ui(hex){ let rgb=hex2rgb(hex); if(contrast(rgb,S1)>=4.5) return hex
  let lo=0,hi=1,best=[255,255,255]
  for(let i=0;i<12;i++){const t=(lo+hi)/2;const m=rgb.map(v=>v+(255-v)*t)
    if(contrast(m,S1)>=4.5){best=m;hi=t}else lo=t}
  return '#'+best.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('') }

const cards = TARGETS.map(k => {
  const c = byKey[k], p = PROFILES[k] ?? {}
  const accent = ui(p.accent ?? c.color)
  const term = p.onboarding?.nativeTerm ?? 'an NFT'
  return `    <a class="card" href="https://${k}.xono.ai" style="--a:${accent}">
      <div class="row"><span class="dot"></span><span class="name">${esc(c.name)}</span></div>
      <div class="term">a tile is ${esc(term)}</div>
      <div class="meta">${esc(c.nativeCurrency?.symbol ?? '')}${c.gasless ? ' · zero gas' : ''}</div>
    </a>`
}).join('\n')

const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CryptoLand — one game, ${TARGETS.length} chain-native builds</title>
<meta name="description" content="A geospatial territory game on a 16,384 x 16,384 tile grid over the real world, shipped as ${TARGETS.length} chain-native deployments from one codebase.">
<meta property="og:title" content="CryptoLand — one game, ${TARGETS.length} chain-native builds">
<meta property="og:description" content="268,435,456 claimable tiles over the real world. One codebase, ${TARGETS.length} chain-native deployments.">
<meta property="og:type" content="website">
<style>
:root{--bg:#0f0f0f;--s1:#141414;--s2:#1a1a1a;--s3:#222;--b0:rgba(255,255,255,.08);
--b1:rgba(255,255,255,.14);--t1:#fff;--t2:#a8a8a8;--t3:#6e6e6e}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--t1);font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;
-webkit-font-smoothing:antialiased;padding:0 20px 80px}
.wrap{max-width:1080px;margin:0 auto}
header{padding:72px 0 44px;border-bottom:1px solid var(--b0)}
h1{font-size:clamp(30px,5vw,48px);letter-spacing:-.03em;font-weight:800;line-height:1.1}
h1 em{font-style:normal;color:#4ade80}
.sub{color:var(--t2);margin-top:16px;max-width:62ch;font-size:16px}
.stats{display:flex;flex-wrap:wrap;gap:10px;margin-top:26px}
.stat{background:var(--s2);border:1px solid var(--b0);border-radius:10px;padding:10px 14px}
.stat b{display:block;font-size:19px;letter-spacing:-.02em}
.stat span{color:var(--t3);font-size:10.5px;text-transform:uppercase;letter-spacing:.08em}
h2{margin:44px 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:var(--t3)}
.lede{color:var(--t2);margin-bottom:22px;max-width:70ch}
.grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(232px,1fr))}
.card{display:block;background:var(--s1);border:1px solid var(--b0);border-radius:12px;
padding:15px 16px;text-decoration:none;color:inherit;transition:border-color .15s,background .15s}
.card:hover{background:var(--s2);border-color:var(--a)}
.row{display:flex;align-items:center;gap:9px}
.dot{width:8px;height:8px;border-radius:50%;background:var(--a);flex:0 0 auto}
.name{font-weight:700;letter-spacing:-.01em}
.term{color:var(--t2);font-size:12.5px;margin-top:7px}
.meta{color:var(--a);font-size:10.5px;margin-top:9px;text-transform:uppercase;letter-spacing:.07em;font-weight:700}
footer{margin-top:52px;padding-top:22px;border-top:1px solid var(--b0);color:var(--t3);font-size:12.5px;max-width:74ch}
footer a{color:var(--t2)}
</style></head><body><div class="wrap">
<header>
  <h1>One game.<br><em>${TARGETS.length} chain-native builds.</em></h1>
  <p class="sub">CryptoLand divides the real world into a 16,384 × 16,384 tile grid — 268,435,456 claimable
  territories of about 2.4 km² each. Players buy, customise, trade, raid and govern land, with AI Guardian
  agents defending it while they are offline.</p>
  <div class="stats">
    <div class="stat"><b>${TARGETS.length}</b><span>Chain builds</span></div>
    <div class="stat"><b>13</b><span>Adapter families</span></div>
    <div class="stat"><b>268M</b><span>Tiles</span></div>
    <div class="stat"><b>~2.4 km²</b><span>Per tile</span></div>
  </div>
</header>
<h2>Pick a chain</h2>
<p class="lede">Every link below is a separate deployment: its own bundle, its own database, its own wallet
flow and its own live chain-head badge read from that chain's own node. Nothing is shared between them.</p>
<div class="grid">
${cards}
</div>
<footer>
  Each build exposes <code>/ecosystem</code> — a reviewer page with that chain's live traction, its native
  integration spec, and an explicit statement of what is and is not yet deployed on-chain.
  <br><br>
  <strong>Worlds are currently seeded demo data</strong> generated by <code>server/seed_chain.py</code>, with
  chain-correct addresses and modelled retention. No NFT contract is deployed yet, so on-chain minting is
  stubbed. Both facts are stated on every <code>/ecosystem</code> page — we would rather say so here than
  let a reviewer find out on their own.
</footer>
</div></body></html>`

mkdirSync('deploy/apex/dist', { recursive: true })
writeFileSync('deploy/apex/dist/index.html', html)
console.log(`apex page: ${TARGETS.length} chains, ${(html.length/1024).toFixed(1)} KB`)
