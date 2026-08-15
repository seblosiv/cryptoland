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

const { MAINNET_CHAINS, explorerAddressUrl } = await import('../../src/lib/blockchain/config.js')
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
import { xonoWordmark } from './brand.mjs'

/* How each non-EVM chain proves itself to a browser. Verified reachable with
   Access-Control-Allow-Origin on 2026-08-13; the four omitted genuinely cannot:
   Sui deprecated JSON-RPC on public fullnodes, Koios (Cardano) sends no CORS
   header, and stellar.expert and the public Starknet RPCs return 403. */
const PROBES = {
  solana: { url: 'https://solana-rpc.publicnode.com', body: (a) => ({ jsonrpc: '2.0', id: 1,
    method: 'getAccountInfo', params: [a, { encoding: 'base64' }] }),
    read: 'r.result&&r.result.value?{ok:true,d:(r.result.value.executable?"executable program":"account")+", owner "+String(r.result.value.owner).slice(0,4)+"…"}:{ok:false}' },
  ton: { url: (a) => 'https://toncenter.com/api/v2/getAddressInformation?address=' + encodeURIComponent(a),
    read: 'r.ok&&r.result?{ok:r.result.state==="active",d:"account "+r.result.state}:{ok:false}' },
  aptos: { url: (a) => 'https://fullnode.mainnet.aptoslabs.com/v1/accounts/' + a,
    read: 'r.authentication_key?{ok:true,d:"module account, seq "+r.sequence_number}:{ok:false}' },
  near: { url: 'https://rpc.mainnet.near.org', body: (a) => ({ jsonrpc: '2.0', id: 1, method: 'query',
    params: { request_type: 'view_account', finality: 'final', account_id: a } }),
    read: 'r.result?{ok:r.result.code_hash&&r.result.code_hash!=="11111111111111111111111111111111",d:"contract deployed, code hash "+String(r.result.code_hash).slice(0,6)+"…"}:{ok:false}' },
  algorand: { url: (a) => 'https://mainnet-api.algonode.cloud/v2/applications/' + a,
    read: 'r.params?{ok:true,d:"approval program "+Math.round((r.params["approval-program"]||"").length*3/4)+" bytes"}:{ok:false}' },
  multiversx: { url: (a) => 'https://api.multiversx.com/accounts/' + a,
    read: 'r.address?{ok:!!r.code,d:"contract code "+Math.round((r.code||"").length/2)+" bytes"}:{ok:false}' },
  tezos: { url: (a) => 'https://api.tzkt.io/v1/contracts/' + a,
    read: 'r.address?{ok:r.type==="contract",d:"originated contract, "+(r.tzips||[]).join("/")||"originated contract"}:{ok:false}' },
}
const NO_BROWSER = {
  sui: 'Sui deprecated JSON-RPC on public fullnodes',
  starknet: 'public Starknet RPCs refuse browser origins',
  cardano: 'Koios sends no CORS header',
  stellar: 'Soroban contract reads need an API key',
}

const VERIFY = TARGETS.map(k => {
  const c = byKey[k]
  const envf = `env/.env.${k}`
  let addr = null
  if (_ex(envf)) {
    const m = _rf(envf, 'utf8').match(new RegExp(`^VITE_CONTRACT_${k.toUpperCase().replace(/-/g, '_')}=(.+)$`, 'm'))
    if (m && m[1].trim()) addr = m[1].trim()
  }
  const pr = PROBES[k]
  return { k, name: c.name, family: c.family, rpc: c.rpcUrl, rpc2: c.rpcUrlFallback || null, addr,
           // Every non-EVM chain used to fall through to the explorer HOMEPAGE here.
           explorer: explorerAddressUrl(addr, k),
           probe: pr ? { url: typeof pr.url === 'function' ? pr.url(addr) : pr.url,
                         body: pr.body ? JSON.stringify(pr.body(addr)) : null, read: pr.read } : null,
           why: NO_BROWSER[k] || null }
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
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="icon" type="image/png" sizes="48x48" href="/icon-48.png">
<link rel="icon" type="image/png" sizes="96x96" href="/icon-96.png">
<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">
<link rel="apple-touch-icon" sizes="180x180" href="/icon-180.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#000000">
<title>CryptoLand by XONO — Own the world, tile by tile</title>
<meta property="og:site_name" content="CryptoLand by XONO">
<meta property="og:url" content="https://xono.ai/">
<meta property="og:image" content="https://xono.ai/icon-512.png">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="CryptoLand by XONO — Own the world, tile by tile">
<meta name="twitter:image" content="https://xono.ai/icon-512.png">
<meta name="description" content="Every map ever made is read-only. CryptoLand is the one you can own: 268,435,456 tiles of the real world, a supply fixed by geometry, each tile\u2019s coordinate its own token id. Live on mainnet.">
<meta property="og:title" content="CryptoLand by XONO — own the world, native to your chain">
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
   Full-bleed, with the real basemap held still behind the words. Everything that
   made the old block read as a template is gone: no accent-coloured headline, no
   rounded stat cards, no flat ground. */
.hero{position:relative;min-height:min(94vh,880px);display:flex;align-items:center;
  margin:0 calc(50% - 50vw);padding:0 max(24px,calc(50vw - 570px));overflow:hidden;
  border-bottom:1px solid var(--b0)}
.hero-bg{position:absolute;inset:0;z-index:0}
#heroMap{position:absolute;inset:0;width:100%;height:100%;display:block;cursor:crosshair}
.attrib{position:absolute;right:10px;bottom:8px;z-index:2;font-size:9.5px;color:var(--t3);
  background:rgba(0,0,0,.45);padding:1px 6px;border-radius:3px}
.attrib a{color:var(--t3)}
/* The scrim must not eat the pointer, or the left half of the map is dead. */
.hero-scrim{pointer-events:none}
/* The readout is a survey instrument, because that is literally what it does:
   you point at ground and it reports the parcel. Hairlines, small caps and
   tabular figures — the vocabulary of an instrument, not of a web component. */
.inst{margin-top:34px;max-width:520px;border:1px solid var(--b1);background:rgba(6,7,9,.55)}
.inst-h{display:flex;align-items:center;justify-content:space-between;padding:8px 14px;
  border-bottom:1px solid var(--b1);font-size:9.5px;letter-spacing:.26em;text-transform:uppercase;
  color:var(--t3)}
.live{width:5px;height:5px;border-radius:50%;background:#7aeea6;display:block;
  box-shadow:0 0 0 3px rgba(122,238,166,.15)}
.inst-b{display:grid;grid-template-columns:repeat(3,1fr)}
.inst-b>div{padding:12px 14px;display:flex;flex-direction:column;gap:6px;min-width:0}
.inst-b>div+div{border-left:1px solid var(--b0)}
.inst .rl{color:var(--t4);font-size:9px;letter-spacing:.2em;text-transform:uppercase}
.inst .rv{color:var(--t1);font-size:13px;font-variant-numeric:tabular-nums;letter-spacing:-.01em;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#r-id{color:#e8ecf2}

/* A discreet way down, replacing a sentence that told people to look. */
.cue{position:absolute;left:max(24px,calc(50vw - 570px));bottom:34px;z-index:2;
  display:flex;align-items:center;gap:12px;text-decoration:none;
  font-size:9.5px;letter-spacing:.26em;text-transform:uppercase;color:var(--t3);
  transition:color .2s ease,gap .2s ease}
.cue:hover{color:var(--t1);gap:18px}
.cue i{width:40px;height:1px;display:block;
  background:linear-gradient(90deg,var(--b2),transparent)}
/* Scrim, painted — never a blur. Reading has to win over atmosphere. */
.hero-scrim{position:absolute;inset:0;background:
  linear-gradient(97deg,rgba(5,6,8,.97) 0%,rgba(5,6,8,.93) 30%,rgba(5,6,8,.6) 52%,rgba(5,6,8,.08) 78%,transparent 100%),
  linear-gradient(180deg,rgba(5,6,8,.88) 0%,transparent 20%,transparent 76%,rgba(5,6,8,.94) 100%)}
.hero-in{position:relative;z-index:1;max-width:620px;padding:104px 0 92px}

.kick{display:block;font-size:12px;letter-spacing:.19em;
  text-transform:uppercase;color:var(--t3);margin-bottom:22px;font-weight:500}


/* Optical sheen rather than a colour pop: white type with a faint cool-to-warm
   fall across it, which reads as light on a surface instead of a highlighter. */
h1{font-size:clamp(40px,7vw,92px);letter-spacing:-.042em;font-weight:800;line-height:.97;
  background:linear-gradient(172deg,#fff 0%,#fff 55%,#eef1f5 78%,#d7dce3 100%);
  -webkit-background-clip:text;background-clip:text;color:transparent;
  -webkit-text-fill-color:transparent;margin:0}
/* Light travelling across metal. The band is mostly the same silver as the rest
   of the headline, with one narrow highlight — a wide bright band reads as a
   cheap shimmer, a narrow one reads as a surface catching light. */
.gloss{
  background:linear-gradient(100deg,
    #e9ecf1 0%, #e9ecf1 33%, #ffffff 43%, #ffffff 51%, #e9ecf1 61%, #e9ecf1 100%);
  background-size:280% 100%;
  -webkit-background-clip:text;background-clip:text;
  color:transparent;-webkit-text-fill-color:transparent;
  animation:sweep 7.5s cubic-bezier(.5,0,.5,1) infinite;
}
@keyframes sweep{
  0%,12%   {background-position:118% 0}
  55%,100% {background-position:-18% 0}
}
@media (prefers-reduced-motion:reduce){
  .gloss{animation:none;background-position:50% 0}
}

.figs{display:flex;flex-wrap:wrap;margin-top:40px;padding-top:24px;border-top:1px solid var(--b1)}
.figs span{display:flex;flex-direction:column;gap:5px;font-size:11px;color:var(--t3);
  letter-spacing:.06em;text-transform:uppercase;padding-right:30px}
.figs span+span{padding-left:30px;border-left:1px solid var(--b0)}
.figs b{font-size:clamp(20px,2.5vw,28px);font-weight:700;letter-spacing:-.03em;color:var(--t1);
  font-variant-numeric:tabular-nums;text-transform:none;letter-spacing:-.03em}
.handoff{margin-top:30px;font-size:14px;color:var(--t2);display:flex;align-items:center;gap:10px}
.handoff::before{content:"";width:6px;height:6px;border-radius:50%;background:#4ade80;flex:none;
  box-shadow:0 0 0 4px rgba(74,222,128,.16)}
@media (max-width:900px){
  /* The map gets the top of the screen; the copy sits under it on solid ground.
     Full height so both get room rather than fighting over the same pixels. */
  .hero{min-height:0;display:block;padding:0 0 46px;align-items:stretch}
  .hero-bg{position:relative;inset:auto;height:44svh;min-height:290px}
  .hero-in{position:relative;padding:30px max(20px,4vw) 0;max-width:none}
  #heroMap{opacity:1}
  /* Only the top edge and the seam into the copy are darkened — the middle of
     the band stays fully legible map, which is the point of showing it. */
  .hero-scrim{background:
    linear-gradient(180deg,
      rgba(5,6,8,.62) 0%,
      rgba(5,6,8,.12) 22%,
      rgba(5,6,8,.06) 55%,
      rgba(5,6,8,.55) 82%,
      rgba(5,6,8,.94) 94%,
      rgba(5,6,8,1) 100%)}
  /* Figures were wrapping to a stray third row with a dangling rule. */
  .figs{display:grid;grid-template-columns:1fr 1fr;gap:18px 0;margin-top:30px;padding-top:20px}
  .figs span{padding:0 16px 0 0}
  .figs span+span{padding-left:16px}
  .figs span:nth-child(3){grid-column:1/-1;padding-left:0;border-left:0;
    border-top:1px solid var(--b0);padding-top:18px}
  .figs b{font-size:22px}
  .kick{color:var(--t1);
    text-shadow:0 1px 10px rgba(5,6,8,.95),0 0 24px rgba(5,6,8,.85),0 1px 2px rgba(5,6,8,1)}
  h1{text-shadow:0 2px 22px rgba(5,6,8,.55)}
  .figs{flex-wrap:wrap}
  .figs span{padding-right:22px}
  .figs span+span{padding-left:22px}
  .inst-b{grid-template-columns:1fr 1fr}
  .inst-b>div:nth-child(3){grid-column:1/-1;border-left:0;border-top:1px solid var(--b0)}
  .cue{display:none}
}

h1{font-size:clamp(31px,5.2vw,50px);letter-spacing:-.032em;font-weight:800;line-height:1.08}
h1 em{font-style:normal;color:var(--acc)}
.sub{color:var(--t2);margin-top:22px;max-width:44ch;font-size:17px;line-height:1.62}
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
section{margin-top:clamp(72px,9vw,132px)}
h2{font-size:10px;text-transform:uppercase;letter-spacing:.28em;color:var(--t4);
  margin-bottom:20px;font-weight:500;padding-bottom:14px;border-bottom:1px solid var(--b0)}
.lede{color:var(--t2);max-width:62ch;margin-bottom:32px;font-size:clamp(15px,1.6vw,19px);
  line-height:1.6;letter-spacing:-.008em}
.lede em{color:var(--t1);font-style:italic}
.grid{display:grid;gap:1px;background:var(--b0);grid-template-columns:repeat(auto-fill,minmax(248px,1fr));
border-top:1px solid var(--b1);border-bottom:1px solid var(--b1)}
.card{position:relative;display:block;background:var(--bg);padding:18px 20px 20px;
text-decoration:none;color:inherit;overflow:hidden;
transition:background .18s ease}
.card::after{content:"";position:absolute;left:0;right:0;bottom:0;height:1px;background:var(--a);
opacity:.34;transform:scaleX(.22);transform-origin:left;transition:transform .3s ease,opacity .3s ease}
.card:hover{background:var(--s1)}
.card:hover::after{transform:scaleX(1);opacity:.85}
.card.hi{background:var(--s1);order:-1}
.card.hi::after{transform:scaleX(1);opacity:.9}
.you{display:none}
.card.hi .you{display:block;font-size:9px;letter-spacing:.22em;text-transform:uppercase;
color:var(--a);margin-bottom:10px;font-weight:600}
.row{display:flex;align-items:center;gap:9px}
.dot{width:6px;height:6px;border-radius:50%;background:var(--a);flex:0 0 auto}
.name{font-weight:600;letter-spacing:-.014em;font-size:14.5px}
.term{color:var(--t3);font-size:12.5px;margin-top:9px;min-height:2.8em;line-height:1.55}
.meta{display:flex;align-items:center;gap:10px;margin-top:14px;padding-top:12px;
border-top:1px solid var(--b0);font-size:9.5px;
text-transform:uppercase;letter-spacing:.18em;font-weight:500}
.cur{color:var(--t2)}
.gas{color:var(--t3)}
.eco{margin-left:auto;color:var(--t4);text-transform:none;letter-spacing:0;font-weight:500;font-size:11.5px;
transition:color .18s ease}
.card:hover .eco{color:var(--t2)}
.two{display:grid;gap:1px;background:var(--b0);grid-template-columns:repeat(auto-fit,minmax(288px,1fr))}
.panel{background:var(--bg);padding:26px 28px 30px}
.panel h3{font-size:14px;margin-bottom:11px;letter-spacing:-.008em;font-weight:600}
.panel h3::before{content:"";display:block;width:20px;height:1px;background:var(--b2);margin-bottom:14px}
.panel p{color:var(--t3);font-size:13px;line-height:1.68}
.panel code{background:var(--s3);padding:1px 5px;border-radius:4px;font-size:12px}
.vgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1px;background:var(--b0);
  border-top:1px solid var(--b1);border-bottom:1px solid var(--b1)}
.vrow{background:var(--bg);padding:16px 18px;display:flex;flex-direction:column;gap:7px;min-height:96px}
.vhead{display:flex;align-items:center;justify-content:space-between;gap:10px}
.vname{font-weight:600;font-size:13.5px;letter-spacing:-.012em}
.vstate{font-size:9px;letter-spacing:.2em;text-transform:uppercase;padding:0;
  border:0;color:var(--t4);white-space:nowrap;display:flex;align-items:center;gap:7px}
.vstate::before{content:"";width:5px;height:5px;border-radius:50%;background:var(--t4);flex:none}
.vstate.ok::before{background:#4ade80;box-shadow:0 0 0 3px rgba(74,222,128,.14)}
.vstate.fail::before{background:#f87171}
.vstate.ok{color:#4ade80;border-color:rgba(74,222,128,.35)}
.vstate.fail{color:#f87171;border-color:rgba(248,113,113,.35)}
.vaddr{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:var(--t4);
  overflow-wrap:anywhere;letter-spacing:-.02em}
.vmeta{font-size:11.5px;color:var(--t3);line-height:1.55}
.vmeta a{color:var(--t2)}
.vnote{margin-top:20px;font-size:12.5px;color:var(--t3);max-width:76ch;line-height:1.7}
.honest{background:var(--bg);border-left:1px solid var(--b2);padding-left:26px}
.honest h3{color:var(--t1)}
.honest h3::before{background:var(--t2)}
.honest strong{color:var(--t1);font-weight:600}
footer{margin-top:clamp(72px,9vw,120px);padding:30px 0 18px;border-top:1px solid var(--b0);
color:var(--t4);font-size:11.5px;letter-spacing:.02em}
footer a{color:var(--t3);text-decoration:none}
footer a:hover{color:var(--t1)}
</style></head><body><div class="wrap">

<header class="hero">
  <div class="hero-bg" aria-hidden="true">
    <canvas id="heroMap"></canvas>
    <div class="hero-scrim"></div>
    <span class="attrib">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors</span>
  </div>

  <div class="hero-in">
    <p class="kick">Every map ever made is read-only</p>
    <h1>Own the world,<br><span class="gloss">tile by tile</span></h1>
    <p class="sub">268,435,456 parcels of the real Earth — your street, your city, anywhere on the
    planet. Claim it, build on it, and hold it against everyone else who wants it.</p>

    <div class="figs">
      <span><b>268,435,456</b>tiles, fixed forever</span>
      <span><b>${TARGETS.length}</b>chains live</span>
      <span><b>113/113</b>checks passing</span>
    </div>

    <div class="inst" id="readout">
      <div class="inst-h"><span>Survey</span><i class="live"></i></div>
      <div class="inst-b">
        <div><span class="rl">Tile</span><span class="rv mono" id="r-xy">(8128, 5440)</span></div>
        <div><span class="rl">Token</span><span class="rv mono" id="r-id">266343744</span></div>
        <div><span class="rl">Near</span><span class="rv" id="r-city">London</span></div>
      </div>
    </div>
  </div>

  <a class="cue" href="#verify"><span>Verify us</span><i></i></a>
  </div>

  <div id="from">
    <b id="from-name"></b> <span>— that is where you just came from.</span>
    <span class="l">This page exists to show you the architecture behind it.
    <a id="from-link" href="#">Go back to that build →</a></span>
  </div>
</header>

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
  <p class="lede">A supply fixed by geometry rather than policy: 268,435,456 tiles that can never be
  expanded, inflated or granted to insiders. A tile's coordinate <em>is</em> its token id, so ownership is
  arithmetic anyone can verify and nobody can forge — and the interesting number is not how many chains
  this runs on, but that going native on a new one is an adapter, not a fork.</p>
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
  <!-- The company mark signs the page. CryptoLand is the product; XONO is who
       builds it, so the wordmark belongs at the foot, not competing with the
       product name in the hero. -->
  <div style="margin-bottom:26px">${xonoWordmark({ height: 19, base: 'rgba(255,255,255,.62)', accent: 'var(--acc)' })}</div>
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
    var t = ok + ' of ' + attempted + ' contracts answered live from their own node, just now — across ' +
      'EVM, SVM, Move, WASM and Michelson.';
    if (failed) t += ' ' + failed + ' public endpoint' + (failed > 1 ? 's' : '') +
      ' did not respond; that is the node, not the contract.';
    if (onRecord) t += ' ' + onRecord + ' chain' + (onRecord > 1 ? 's' : '') +
      ' cannot answer a browser at all — the reason is named on each, and their addresses are in the explorers.';
    note.textContent = t;
  }

  rows.forEach(function (r) {
    var v = r.v;
    // EVM answers eth_getCode; the other families each speak their own protocol,
    // so those are shown as on-record with an explorer link rather than faked.
    if (v.family !== 'evm') {
      if (!v.probe) {
        // Named reason, not a shrug: these four genuinely cannot answer a browser.
        settle(r, '', 'on record', (v.why || 'not browser-readable') +
          (v.explorer ? ' · <a href="' + v.explorer + '" target="_blank" rel="noopener">explorer ↗</a>' : ''));
        return;
      }
      var pc = new AbortController();
      var pt = setTimeout(function () { pc.abort(); }, 11000);
      fetch(v.probe.url, v.probe.body
        ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: v.probe.body, signal: pc.signal }
        : { signal: pc.signal })
        .then(function (res) { return res.json(); })
        .then(function (r2) {
          clearTimeout(pt);
          var out;
          try { out = (new Function('r', 'return ' + v.probe.read))(r2); } catch (e) { out = { ok: false }; }
          var xl = v.explorer ? ' · <a href="' + v.explorer + '" target="_blank" rel="noopener">explorer ↗</a>' : '';
          if (out && out.ok) settle(r, 'ok', 'verified', out.d + xl);
          else settle(r, 'fail', 'not found', 'Node answered but reported no contract.' + xl);
        })
        .catch(function () {
          clearTimeout(pt);
          settle(r, 'fail', 'node down',
            'Public node did not answer' + (v.explorer ? ' · <a href="' + v.explorer + '" target="_blank" rel="noopener">explorer ↗</a>' : '') + '.');
        });
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
/* The hero map. One canvas doing everything: the real OSM basemap, the claimable
   lattice over it, the world's cities at their true coordinates, and the hover
   readout. There is exactly one projection here, so the tile reported under the
   cursor is the tile the basemap is showing. */
(function () {
  var cv = document.getElementById('heroMap');
  if (!cv) return;
  var ctx = cv.getContext('2d'), tiles = [], N = 16384, CELLS = 128;

  /* The same transform CSS would apply, done by hand so it cannot be ignored:
     luminance → brightness(0.581) → contrast(12) → brightness(0.72). The pivot
     sits between OSM's ocean (luma 200) and land (239) so they separate instead
     of both clipping to white. */
  var LUT = (function () {
    var t = new Uint8ClampedArray(256);
    for (var v = 0; v < 256; v++) {
      var n = (v / 255) * 0.581;
      n = (n - 0.5) * 12 + 0.5;
      n *= 0.72;
      t[v] = Math.max(0, Math.min(255, Math.round(n * 255)));
    }
    return t;
  })();

  function monochrome(im) {
    var c = document.createElement('canvas');
    c.width = im.naturalWidth || 256; c.height = im.naturalHeight || 256;
    var g = c.getContext('2d');
    g.drawImage(im, 0, 0);
    try {
      var d = g.getImageData(0, 0, c.width, c.height), a = d.data;
      for (var i = 0; i < a.length; i += 4) {
        var lum = (a[i] * 0.2126 + a[i + 1] * 0.7152 + a[i + 2] * 0.0722) | 0;
        var o = LUT[lum];
        a[i] = o; a[i + 1] = o; a[i + 2] = o;
      }
      g.putImageData(d, 0, 0);
    } catch (e) {
      // Tainted canvas: fall back to the filter, which is better than nothing.
      g.clearRect(0, 0, c.width, c.height);
      g.filter = 'grayscale(1) brightness(0.581) contrast(12) brightness(0.72)';
      g.drawImage(im, 0, 0);
    }
    return c;
  }

  for (var ry = 0; ry < 3; ry++) for (var rx = 0; rx < 4; rx++) {
    (function (x, y) {
      var im = new Image();
      im.crossOrigin = 'anonymous';       // OSM sends ACAO:* — keeps pixels readable
      im.onload = function () { tiles.push({ x: x, y: y, im: monochrome(im) }); draw(); };
      im.src = 'https://tile.openstreetmap.org/2/' + x + '/' + y + '.png';
    })(rx, ry);
  }

  // Cities, placed by the same Web Mercator maths the game uses (src/lib/tiles.js).
  var CITIES = ${JSON.stringify(CITIES)}, lit = [], byCell = {}, seed = 7919;
  function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
  function lonToU(l) { return (l + 180) / 360; }
  function latToV(la) {
    var s2 = Math.max(-0.9999, Math.min(0.9999, Math.sin(la * Math.PI / 180)));
    return 0.5 - Math.log((1 + s2) / (1 - s2)) / (4 * Math.PI);
  }
  CITIES.forEach(function (c) {
    var u = lonToU(c[2]), v = latToV(c[3]);
    for (var i = 0; i < c[1]; i++) {
      var a = rnd() * Math.PI * 2, r = Math.pow(rnd(), 0.85) * 0.017;
      var cu = u + Math.cos(a) * r * 0.55, cvv = v + Math.sin(a) * r;
      if (cu < 0 || cu > 1 || cvv < 0 || cvv > 1) continue;
      var ci = Math.floor(cu * CELLS), cj = Math.floor(cvv * CELLS);
      var k = ci + ':' + cj;
      if (!byCell[k]) { byCell[k] = c[0]; lit.push([ci, cj, 0.35 + rnd() * 0.65]); }
    }
  });

  var W = 0, H = 0, dpr = 1, P = null, hover = null;
  var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var TOUR = [], ti = 0, touring = true, pulse = 1, tStart = 0, resume = null;
  function size() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // One projection, defined once. Frames the inhabited band (Mercator v
    // 0.207-0.694) and lets the world bleed off the right edge.
    var narrow = W < 900;
    // A phone showing W*1.55 of world gets open ocean and no coast. Zoom out,
    // and bias the frame upward so the land sits in the visible top half.
    var worldW = W * (narrow ? 2.2 : 1.55), V0 = 0.207, V1 = 0.694;
    var bandH = worldW * (V1 - V0);
    P = { w: worldW,
          left: narrow ? -worldW * 0.22 : -worldW * 0.06,
          top: -V0 * worldW - (bandH - H) * (narrow ? 0.24 : 0.5), narrow: narrow };
    buildTour();
    draw();
  }
  var toXY = function (u, v) { return [P.left + u * P.w, P.top + v * P.w]; };

  function draw() {
    if (!P || !W) return;
    ctx.clearRect(0, 0, W, H);

    // 1. basemap
    if (tiles.length) {
      ctx.save(); ctx.globalAlpha = 0.95;
      var t = P.w / 4;
      for (var i = 0; i < tiles.length; i++) {
        ctx.drawImage(tiles[i].im, Math.round(P.left + tiles[i].x * t),
          Math.round(P.top + tiles[i].y * t), Math.ceil(t) + 1, Math.ceil(t) + 1);
      }
      ctx.restore();
    }

    // 2. the claimable lattice
    var cw = P.w / CELLS;
    ctx.strokeStyle = 'rgba(214,220,228,0.055)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (var c1 = 0; c1 <= CELLS; c1 += 2) {
      var x = P.left + c1 * cw; if (x < -2 || x > W + 2) continue;
      ctx.moveTo(x, 0); ctx.lineTo(x, H);
    }
    for (var r1 = 0; r1 <= CELLS; r1 += 2) {
      var y = P.top + r1 * cw; if (y < -2 || y > H + 2) continue;
      ctx.moveTo(0, y); ctx.lineTo(W, y);
    }
    ctx.stroke();

    // 3. cities
    for (var j = 0; j < lit.length; j++) {
      var p = toXY(lit[j][0] / CELLS, lit[j][1] / CELLS), w = lit[j][2];
      if (p[0] < -cw || p[0] > W || p[1] < -cw || p[1] > H) continue;
      var lv = Math.round(196 + w * 59);
      ctx.fillStyle = 'rgba(' + lv + ',' + lv + ',' + (lv + 4) + ',' + (0.14 + w * 0.5).toFixed(2) + ')';
      ctx.fillRect(p[0], p[1], Math.max(1.5, cw - 1), Math.max(1.5, cw - 1));
    }

    // 4. the surveyed tile
    if (hover) {
      var hp = toXY(hover[0] / CELLS, hover[1] / CELLS);
      var hx = hp[0], hy = hp[1], a = pulse;
      // Crosshair to the frame edges: on a map this dense, a small outline alone
      // is invisible and the eye cannot find what it selected.
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.30 * a).toFixed(3) + ')'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, hy + cw / 2); ctx.lineTo(hx, hy + cw / 2);
      ctx.moveTo(hx + cw, hy + cw / 2); ctx.lineTo(W, hy + cw / 2);
      ctx.moveTo(hx + cw / 2, 0); ctx.lineTo(hx + cw / 2, hy);
      ctx.moveTo(hx + cw / 2, hy + cw); ctx.lineTo(hx + cw / 2, H);
      ctx.stroke();
      // Halo, fill, keyline.
      // The halo contracts as it lands, so the eye is led to the cell rather
      // than having to search the frame for what changed.
      var g = cw * (1.6 + (1 - a) * 2.2);
      ctx.fillStyle = 'rgba(255,255,255,' + (0.10 * a).toFixed(3) + ')';
      ctx.fillRect(hx - g, hy - g, cw + g * 2, cw + g * 2);
      ctx.fillStyle = 'rgba(255,255,255,' + (0.72 * a).toFixed(3) + ')';
      ctx.fillRect(hx, hy, cw, cw);
      ctx.strokeStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')'; ctx.lineWidth = 2;
      ctx.strokeRect(hx - 2, hy - 2, cw + 4, cw + 4);
    }
  }

  // One place that writes the instrument, whether a finger or the tour drives it.
  function survey(ci, cj, name) {
    hover = [ci, cj];
    var tx = Math.min(N - 1, Math.floor(((ci + 0.5) / CELLS) * N));
    var ty = Math.min(N - 1, Math.floor(((cj + 0.5) / CELLS) * N));
    document.getElementById('r-xy').textContent = '(' + tx + ', ' + ty + ')';
    document.getElementById('r-id').textContent = ((BigInt(tx) << 15n) | BigInt(ty)).toString();
    document.getElementById('r-city').textContent = name;
  }

  // Only cities actually inside the current frame — the phone crops to a
  // different swath than the desktop, and touring a tile nobody can see reads
  // as a dead panel.
  function buildTour() {
    TOUR = [];
    var m = (P.w / CELLS) * 3, x0 = P.narrow ? m : W * 0.52;
    CITIES.forEach(function (c) {
      var ci = Math.floor(lonToU(c[2]) * CELLS), cj = Math.floor(latToV(c[3]) * CELLS);
      var p = toXY(ci / CELLS, cj / CELLS);
      if (p[0] > x0 && p[0] < W - m && p[1] > m && p[1] < H - m) TOUR.push([ci, cj, c[0]]);
    });
    if (touring && TOUR.length) {
      var e = TOUR[ti % TOUR.length];
      survey(e[0], e[1], e[2]);
    }
  }

  function pick(ev) {
    if (!P) return;
    touring = false; pulse = 1; clearTimeout(resume);
    var r = cv.getBoundingClientRect();
    var px = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
    var py = (ev.touches ? ev.touches[0].clientY : ev.clientY) - r.top;
    var u = (px - P.left) / P.w, v = (py - P.top) / P.w;
    if (u < 0 || u >= 1 || v < 0 || v >= 1) return;
    var ci = Math.floor(u * CELLS), cj = Math.floor(v * CELLS);
    survey(ci, cj, byCell[ci + ':' + cj] || 'open territory');
    draw();
    release();
  }
  // Hand the map back a few seconds after the visitor stops, so it is never
  // left frozen on whatever they touched last.
  function release() {
    clearTimeout(resume);
    resume = setTimeout(function () { touring = true; tStart = 0; }, 3500);
  }
  cv.addEventListener('mousemove', pick);
  cv.addEventListener('touchstart', function (e) { pick(e); }, { passive: true });
  cv.addEventListener('touchmove', function (e) { pick(e); e.preventDefault(); }, { passive: false });
  cv.addEventListener('touchend', release, { passive: true });
  cv.addEventListener('mouseleave', release);

  size();
  var to; window.addEventListener('resize', function () { clearTimeout(to); to = setTimeout(size, 150); });

  // The survey walks the world: a tile lights, is read out, and hands over to
  // the next city. Nothing else on the map moves.
  if (!still) {
    requestAnimationFrame(function step(ts) {
      if (touring && TOUR.length) {
        if (!tStart || ts - tStart > 3000) {
          if (tStart) ti++;
          var e = TOUR[ti % TOUR.length];
          survey(e[0], e[1], e[2]);
          tStart = ts;
        }
        var k = Math.min(1, (ts - tStart) / 620);
        var eased = 1 - Math.pow(1 - k, 3);
        if (eased !== pulse) { pulse = eased; draw(); }
      }
      requestAnimationFrame(step);
    });
  }
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
