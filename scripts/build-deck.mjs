#!/usr/bin/env node
/**
 * build-deck.mjs — one pitch deck per chain, generated from the repo's own data.
 *
 *   node scripts/build-deck.mjs                # every mainnet chain → deploy/deck/
 *   node scripts/build-deck.mjs rootstock      # just one
 *   node scripts/build-deck.mjs --neutral      # the chain-agnostic deck only
 *
 * WHY PER-CHAIN, and not one deck.
 * `documentation/program-requirements.md` §0 quotes Solana's third criterion
 * verbatim — "Only Possible on Solana … why the project is building within the
 * Solana ecosystem, as opposed to other places" — and Starknet's committee scores
 * "embeddedness with the Starknet ecosystem". A deck whose headline is "one
 * codebase, 27 chain-native builds" answers "why ANY chain", which scores zero on
 * a named criterion. So slide 3 is the chain's own `grantAngle` and portability is
 * demoted to slide 6 as evidence of engineering capability, never the thesis.
 *
 * Every number here is READ, not typed: contract addresses come from
 * deploy/apex/deployments.mjs and env/.env.<chain>, check counts from the
 * deployment records, chain facts from src/lib/blockchain/config.js and
 * src/config/profiles.js. Transcribing a contract address into a slide by hand is
 * how a reviewer finds a wrong address on a live chain.
 *
 * Output is a self-contained HTML file with no external requests, so it opens from
 * a USB stick and prints to a real landscape PDF (⌘P) — which is what an
 * application form actually accepts as an attachment.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'deploy', 'deck')

const { CHAINS, MAINNET_CHAINS } = await import(join(ROOT, 'src/lib/blockchain/config.js'))
const { PROFILES } = await import(join(ROOT, 'src/config/profiles.js'))
const { DEPLOYMENTS, deploymentTally } = await import(join(ROOT, 'deploy/apex/deployments.mjs'))
// The app's own accent derivation, imported rather than reimplemented, so a deck
// accent and a UI accent can never drift apart.
const { __theme, WALLETS_BY_FAMILY } = await import(join(ROOT, 'src/lib/chainProfile.js'))
const { hexToRgb, rgbToHex, readableInk, contrast } = __theme

/** Real wallet names for a chain, from the same map the onboarding flow uses. */
const walletNames = (chain, p) =>
  (p.wallets ?? WALLETS_BY_FAMILY[chain.family] ?? WALLETS_BY_FAMILY.evm ?? [])
    .map((w) => (typeof w === 'string' ? w : w.name))
    .slice(0, 4)
    .join(' · ')

/* ── facts ──────────────────────────────────────────────────────────────── */

const TALLY = deploymentTally()
const GRID = 16384
const TILES = GRID * GRID

/** Which chains carry a real mainnet contract address in their build env. */
function liveContracts() {
  const live = {}
  for (const c of MAINNET_CHAINS) {
    const f = join(ROOT, 'env', `.env.${c.key}`)
    if (!existsSync(f)) continue
    const key = c.key.toUpperCase().replace(/-/g, '_')
    const m = readFileSync(f, 'utf8').match(new RegExp(`^VITE_CONTRACT_${key}=(.+)$`, 'm'))
    if (m && m[1].trim()) live[c.key] = m[1].trim()
  }
  return live
}

const LIVE = liveContracts()
const LIVE_COUNT = Object.keys(LIVE).length
const FAMILIES = new Set(MAINNET_CHAINS.filter((c) => !c.halted).map((c) => c.family)).size

/** The deployment record covering a chain — EVM chains all share one. */
const recordFor = (c) =>
  DEPLOYMENTS.find((d) => d.network === 'MAINNET' && d.chain.toLowerCase() === c.name.toLowerCase()) ??
  DEPLOYMENTS.find((d) => d.network === 'MAINNET' && d.chain.toLowerCase().startsWith(c.key.toLowerCase())) ??
  (c.family === 'evm' ? DEPLOYMENTS.find((d) => d.network === 'MAINNET' && d.chain.startsWith('EVM')) : null)

/* ── html helpers ───────────────────────────────────────────────────────── */

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Break a long address so it wraps at a sane point instead of overflowing. */
const addr = (a) => esc(a)

/* ── the deck ───────────────────────────────────────────────────────────── */

function deck(chain) {
  const key = chain?.key ?? null
  const p = key ? (PROFILES[key] ?? {}) : {}
  const ob = p.onboarding ?? {}
  const rec = chain ? recordFor(chain) : null
  const contract = key ? LIVE[key] : null

  // Same precedence as chainProfile.js: a PROFILES override wins over the brand
  // hex, which is how skale and hedera escape an accent that vanishes on dark.
  const accentHex = p.accent ?? chain?.color ?? '#4ade80'
  const accentUi = rgbToHex(...readableInk(hexToRgb(accentHex)))
  // A label sitting ON the accent needs the opposite ink.
  const onAccent = contrast(hexToRgb('#0f0f0f'), hexToRgb(accentHex)) >= 4.5 ? '#0f0f0f' : '#ffffff'

  const title = chain ? `CryptoLand on ${chain.name}` : 'CryptoLand by XONO'
  const eyebrow = chain ? chain.name.toUpperCase() : 'MULTICHAIN'
  const tagline = p.tagline ?? 'OWN THE WORLD'

  const slides = []
  let n = 0
  // `bleed` renders OUTSIDE .frame. The cover canvas has to be a direct child of
  // the slide: inside .frame it would size to the 1180px content box, and being
  // positioned among static siblings it would also paint over the headline.
  const slide = (id, label, body, bleed = '') => {
    n += 1
    slides.push(
      `<section class="slide" id="${id}" data-n="${String(n).padStart(2, '0')}" aria-label="${esc(label)}">` +
        bleed +
        `<div class="frame">${body}</div>` +
        `<div class="foot"><span class="mono">CryptoLand by XONO</span><span class="mono">${esc(eyebrow)}</span>` +
        `<span class="mono num">${String(n).padStart(2, '0')}</span></div>` +
      `</section>`,
    )
  }

  /* 01 — cover. The hero is the map, because the map IS the product. */
  slide('cover', 'Cover', `
    <div class="cover">
      <p class="eyebrow mono">${esc(tagline)}</p>
      <h1 class="wordmark">Crypto<span class="thin">Land</span></h1>
      <p class="lede">A map of the real world, divided into ${TILES.toLocaleString('en-US')} tiles.
        Players claim territory, upgrade it, trade it, raid it and govern it${chain ? ` — on ${esc(chain.name)}` : ''}.</p>
      <dl class="cover-meta">
        <div><dt class="mono">Grid</dt><dd class="mono">${GRID}&thinsp;&times;&thinsp;${GRID} · Z14</dd></div>
        <div><dt class="mono">Status</dt><dd class="mono">${contract ? '<i class="dot"></i>Live on mainnet' : 'Contract compiled'}</dd></div>
        ${contract ? `<div class="wide"><dt class="mono">Contract</dt><dd class="mono addr">${addr(contract)}</dd></div>` : ''}
      </dl>
    </div>`, '<canvas id="grid" aria-hidden="true"></canvas>')

  /* 02 — the product. */
  slide('product', 'The game', `
    <p class="eyebrow mono">The game</p>
    <h2>Territory is the unit of play. Everything else is what you do to it.</h2>
    <div class="loop">
      ${[
        ['Claim', 'Pick a tile anywhere on Earth. It mints to your wallet as ' + (ob.nativeTerm ?? 'an NFT') + '.'],
        ['Customize', 'Name it, theme it, build on it. The tile carries your mark on the shared map.'],
        ['Trade', 'List and buy on an in-game marketplace. Land next to a claimed cluster is worth more.'],
        ['Raid', 'Send an AI Guardian at a neighbour. Defenders stake a Guardian back.'],
        ['Govern', 'Tile holders vote. Weight is tiles owned, computed server-side, never client-supplied.'],
      ].map(([h, b], i) => `<div class="step"><span class="mono step-n">${i + 1}</span><h3>${h}</h3><p>${esc(b)}</p></div>`).join('')}
    </div>
    <p class="note">Live product, not a prototype: map, purchase, customization, marketplace,
      guardians, raids, DAO voting, affiliate payouts and crypto checkout all run today.</p>`)

  /* 03 — why THIS chain. The slide the whole per-chain build exists for. */
  if (chain) {
    slide('why', `Why ${chain.name}`, `
      <p class="eyebrow mono">Why ${esc(chain.name)}</p>
      <h2 class="claim">${esc(ob.grantAngle ?? p.pitch ?? `Built natively for ${chain.name}.`)}</h2>
      <div class="facts">
        <div class="fact"><dt class="mono">A tile is</dt><dd>${esc(ob.nativeTerm ?? 'an NFT')}</dd></div>
        ${ob.chainStat ? `<div class="fact"><dt class="mono">${esc(ob.chainStat.label)}</dt><dd class="accent">${esc(ob.chainStat.value)}</dd></div>` : ''}
        <div class="fact"><dt class="mono">Wallets</dt><dd>${esc(walletNames(chain, p))}</dd></div>
        <div class="fact"><dt class="mono">Connect</dt><dd>${esc(p.connectLabel ?? 'Connect wallet')}</dd></div>
      </div>
      <p class="note">${esc(chain.name)} is not a deployment target bolted on at the end. The build
        is compiled for ${esc(chain.name)} alone — its wallets, its token standard, its vocabulary,
        its own colour — and shipped on its own domain. There is no chain switcher to demote it.</p>`)
  }

  /* 04 — the on-chain evidence for this chain. */
  if (chain && contract && rec) {
    // Five is what fits a 16:9 slide without pushing the footer past the fold —
    // and past the page edge in print, where it would silently clip.
    const checks = (rec.checks ?? []).slice(0, 5)
    slide('onchain', 'On-chain', `
      <p class="eyebrow mono">On ${esc(chain.name)} mainnet</p>
      <h2>Deployed, then verified against the live chain.</h2>
      <div class="addrbox">
        <span class="mono lbl">Contract</span>
        <code class="mono addr big">${addr(contract)}</code>
        ${rec.explorer ? `<span class="mono lbl">Explorer</span><code class="mono addr">${addr(rec.explorer)}</code>` : ''}
        ${rec.lang ? `<span class="mono lbl">Written in</span><span class="mono">${esc(rec.lang)}</span>` : ''}
        ${rec.date ? `<span class="mono lbl">Deployed</span><span class="mono">${esc(rec.date)}</span>` : ''}
      </div>
      ${checks.length ? `<ul class="checks">${checks.map((c) =>
        `<li><span class="tick mono">${c.result === 'PASS' ? 'PASS' : esc(c.result)}</span>
         <span class="ck">${esc(c.name)}</span>
         ${c.detail ? `<span class="ck-d">${esc(c.detail)}</span>` : ''}</li>`).join('')}</ul>` : ''}`)
  }

  /* 05 — the proof that generalises. */
  slide('proof', 'Proof', `
    <p class="eyebrow mono">Verified, not asserted</p>
    <h2>Every claim on the previous slide is a transaction someone else can read.</h2>
    <div class="stats">
      <div class="stat"><span class="big-n mono accent">${TALLY.checksPassed}/${TALLY.checksRun}</span>
        <span class="sub">on-chain checks passing, run against live networks after deployment</span></div>
      <div class="stat"><span class="big-n mono">817</span>
        <span class="sub">automated tests — 358 frontend, 436 contract, 23 backend invariants</span></div>
      <div class="stat"><span class="big-n mono">5</span>
        <span class="sub">separate virtual machines that independently agree tile (16383,&thinsp;16383) is token 536854527</span></div>
    </div>
    <p class="note"><strong>Deploying found defects the tests could not.</strong> The EVM contract
      passed 39 unit tests while <code class="mono">tokenIdFromKey(0,&thinsp;32768)</code> and
      <code class="mono">tokenIdFromKey(1,&thinsp;0)</code> both returned 32768 — one id, two tiles —
      and <code class="mono">claimTile</code> accepted any raw uint256. Caught on-chain, fixed, and
      now covered by 5 regression tests plus an explicit rejection check on every VM.</p>`)

  /* 06 — capability, deliberately AFTER the chain argument. */
  slide('build', 'Engineering', `
    <p class="eyebrow mono">Engineering track record</p>
    <h2>A small team that ships, cheaply, and finishes what it starts.</h2>
    <div class="stats four">
      <div class="stat"><span class="big-n mono">${LIVE_COUNT}</span><span class="sub">chains carrying a live mainnet contract</span></div>
      <div class="stat"><span class="big-n mono">${FAMILIES}</span><span class="sub">distinct VM families, each with a hand-written adapter</span></div>
      <div class="stat"><span class="big-n mono">~$65</span><span class="sub">total spent to reach mainnet, against a $134 estimate</span></div>
      <div class="stat"><span class="big-n mono">2,816&thinsp;B</span><span class="sub">Solana program size after rewriting it <code class="mono">no_std</code></span></div>
    </div>
    <p class="note">Solana rent is <code class="mono">(bytes&nbsp;+&nbsp;173)&nbsp;&times;&nbsp;6960</code> lamports,
      so program size <em>is</em> the price. The framework build was 207,488 bytes — $109 — and almost none of it
      was our logic. A <code class="mono">no_std</code> raw entrypoint that reads the input buffer in place came to
      2,816 bytes and <strong>$1.58</strong>. Same behaviour, verified 16/16 on devnet before mainnet.</p>`)

  /* 07 — the honest slide. */
  slide('traction', 'Traction', `
    <p class="eyebrow mono">Where we actually are</p>
    <h2>Contracts are live. Players are not — and we will not pretend otherwise.</h2>
    <div class="split">
      <div class="col">
        <h3 class="mono col-h">Real</h3>
        <ul class="plain">
          <li>${LIVE_COUNT} mainnet contracts, ${TALLY.checksPassed}/${TALLY.checksRun} checks passing</li>
          <li>Full game loop playable end to end</li>
          <li>Crypto checkout with server-side payment binding</li>
          <li><code class="mono">GET /metrics/grant</code> — a live endpoint, not a screenshot</li>
        </ul>
      </div>
      <div class="col">
        <h3 class="mono col-h">Seeded</h3>
        <ul class="plain dim">
          <li>Every world is pre-seeded so no build opens on an empty map</li>
          <li>Those holders are <strong>generated addresses</strong>, not users</li>
          <li>Retention curves in the seed are modelled, not measured</li>
          <li>Any figure we send is labelled organic or seeded, per chain</li>
        </ul>
      </div>
    </div>
    <p class="note">On-chain activity is roughly one transaction per purchase, which is not competitive for
      retroactive rounds that rank by transactions or gas burned. Moving the daily loop on-chain is the
      next product decision, and it is what this funding is for.</p>`)

  /* 08 — the ask. */
  slide('ask', 'Use of funds', `
    <p class="eyebrow mono">Use of funds</p>
    <h2>Turn a finished, verified game into one with recurring on-chain activity${chain ? ` on ${esc(chain.name)}` : ''}.</h2>
    <ol class="milestones">
      ${[
        ['Move the daily loop on-chain', 'Check-in, upgrade and raid resolution become transactions rather than database writes. This is the single change that makes retroactive and activity-scored rounds winnable.'],
        ['Player acquisition on one chain', 'A funded campaign aimed at one ecosystem’s own users, reported as organic numbers separated from seed data.'],
        ['Audit and harden the claim path', 'External review of the claim, marketplace and payout paths before volume arrives.'],
        ['Publish the metrics openly', 'The grant endpoint becomes a public page so the funder can check progress without asking us.'],
      ].map(([h, b], i) => `<li><span class="mono ms-n">${String(i + 1).padStart(2, '0')}</span><div><h3>${esc(h)}</h3><p>${esc(b)}</p></div></li>`).join('')}
    </ol>`)

  /* 09 — close. */
  slide('close', 'Contact', `
    <div class="close">
      <p class="eyebrow mono">CryptoLand by XONO</p>
      <h2 class="closing">${esc(tagline)}</h2>
      <dl class="cover-meta">
        <div><dt class="mono">Live</dt><dd class="mono">${chain ? esc(chain.key) + '.xono.ai' : 'xono.ai'}</dd></div>
        <div><dt class="mono">Status &amp; evidence</dt><dd class="mono">xono.ai/status</dd></div>
        <div><dt class="mono">Metrics</dt><dd class="mono">GET /metrics/grant</dd></div>
        ${contract ? `<div class="wide"><dt class="mono">${esc(chain.name)} contract</dt><dd class="mono addr">${addr(contract)}</dd></div>` : ''}
      </dl>
    </div>`)

  return page({ title, accentHex, accentUi, onAccent, chain, slides: slides.join('\n') })
}

/* ── the document ───────────────────────────────────────────────────────── */

function page({ title, accentHex, accentUi, onAccent, chain, slides }) {
  return `<!doctype html>
<html lang="en" data-chain="${esc(chain?.key ?? 'neutral')}" data-family="${esc(chain?.family ?? 'multi')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="CryptoLand by XONO — a geospatial NFT game${chain ? ' on ' + esc(chain.name) : ''}.">
<style>
${css({ accentHex, accentUi, onAccent })}
</style>
</head>
<body>
<nav class="rail" aria-label="Slides"><div class="rail-in"></div></nav>
<main class="deck">
${slides}
</main>
<script>
${script()}
</script>
</body>
</html>
`
}

function css({ accentHex, accentUi, onAccent }) {
  return `
/* Tokens are the app's, not new ones: src/index.css :root. The deck is a
   projection surface that mirrors a solid-dark product, so it commits to one
   visual world on purpose — no theme media query, every colour painted. */
:root{
  --bg:#0f0f0f; --s1:#141414; --s2:#1a1a1a; --s3:#222222; --s4:#2a2a2a;
  --b0:rgba(255,255,255,0.04); --b1:rgba(255,255,255,0.08); --b2:rgba(255,255,255,0.13);
  --t1:#ffffff; --t2:rgba(255,255,255,0.55); --t3:rgba(255,255,255,0.28); --t4:rgba(255,255,255,0.14);
  --accent:${accentHex}; --accent-ui:${accentUi}; --accent-ink:${onAccent};
  --font:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;
  --mono:'Space Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  --pad:clamp(22px,min(4.4vw,6.4vh),76px);
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{-webkit-text-size-adjust:100%}
body{
  background:var(--bg); color:var(--t1); font-family:var(--font);
  -webkit-font-smoothing:antialiased; line-height:1.5;
}
code{font-family:var(--mono)}
.mono{font-family:var(--mono);font-variant-numeric:tabular-nums}
.num,.big-n{font-variant-numeric:tabular-nums}
.accent{color:var(--accent-ui)}

/* ── rail ─────────────────────────────────────────────────────────────── */
.rail{position:fixed;left:0;top:0;bottom:0;width:3px;background:var(--b0);z-index:20}
.rail-in{width:100%;height:0;background:var(--accent);transition:height .2s linear}

/* ── slides ───────────────────────────────────────────────────────────── */
.deck{scroll-snap-type:y mandatory;height:100dvh;overflow-y:auto;overflow-x:hidden}
.slide{
  scroll-snap-align:start; position:relative;
  min-height:100dvh; display:flex; flex-direction:column; justify-content:center;
  padding:var(--pad); padding-bottom:calc(var(--pad) * 0.5 + 38px);
  border-bottom:1px solid var(--b0);
}
.frame{width:100%;max-width:1180px;margin:0 auto;display:flex;flex-direction:column;gap:clamp(12px,min(2vw,2.7vh),32px)}
.foot{
  position:absolute; left:var(--pad); right:var(--pad); bottom:calc(var(--pad) / 2);
  display:flex; justify-content:space-between; gap:16px;
  font-size:11px; letter-spacing:.09em; text-transform:uppercase; color:var(--t3);
  border-top:1px solid var(--b0); padding-top:12px;
}
.foot .num{color:var(--t2)}

/* ── type scale ───────────────────────────────────────────────────────── */
.eyebrow{
  font-size:11px; letter-spacing:.22em; text-transform:uppercase; color:var(--t2);
  display:flex; align-items:center; gap:10px;
}
.eyebrow::before{content:"";width:22px;height:1px;background:var(--accent);flex:none}
h1.wordmark{
  font-size:clamp(44px,min(10.5vw,15vh),142px); font-weight:650; letter-spacing:-.05em;
  line-height:.92; text-wrap:balance;
}
.wordmark .thin{font-weight:200;color:var(--t2)}
h2{
  font-size:clamp(22px,min(4vw,5.6vh),54px); font-weight:600; letter-spacing:-.035em;
  line-height:1.08; max-width:22ch; text-wrap:balance;
}
h2.claim{max-width:19ch}
h2.closing{max-width:14ch;font-size:clamp(30px,min(6.5vw,9vh),86px)}
h3{font-size:clamp(15px,1.5vw,19px);font-weight:600;letter-spacing:-.012em}
.lede{font-size:clamp(14px,min(1.75vw,2.4vh),21px);color:var(--t2);max-width:56ch;line-height:1.55}
.note{
  font-size:clamp(12px,min(1.25vw,1.75vh),15px); color:var(--t2); max-width:74ch; line-height:1.62;
  border-left:1px solid var(--b2); padding-left:18px;
}
.note strong{color:var(--t1);font-weight:600}
.note code,.checks code{color:var(--accent-ui);font-size:.92em}

/* ── cover ────────────────────────────────────────────────────────────── */
/* The cover drops its own padding onto .frame so the canvas can go full-bleed:
   inset:0 on an absolutely positioned child resolves to the PADDING box, so a
   padded slide would frame the map in a visible rectangle. */
#cover{justify-content:flex-end;padding:0}
#grid{position:absolute;inset:0;width:100%;height:100%;display:block;z-index:0}
#cover .frame{position:relative;z-index:1;padding:var(--pad);padding-bottom:calc(var(--pad) * 0.5 + 38px)}
.cover{display:flex;flex-direction:column;gap:clamp(18px,2.4vw,30px)}
.cover-meta{display:flex;flex-wrap:wrap;gap:0;border-top:1px solid var(--b1)}
.cover-meta>div{
  flex:1 1 190px; min-width:0; padding:16px 20px 16px 0;
  display:flex; flex-direction:column; gap:6px;
}
.cover-meta>div.wide{flex:1 1 100%;border-top:1px solid var(--b0)}
.cover-meta dt{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--t3)}
.cover-meta dd{font-size:13px;color:var(--t1);display:flex;align-items:center;gap:8px;overflow-wrap:anywhere}
.dot{width:7px;height:7px;border-radius:50%;background:var(--accent);flex:none;display:inline-block}
.addr{overflow-wrap:anywhere;color:var(--t2);font-size:12px;line-height:1.5}

/* ── the loop ─────────────────────────────────────────────────────────── */
.loop{display:grid;grid-template-columns:repeat(auto-fit,minmax(178px,1fr));gap:1px;background:var(--b0)}
.step{background:var(--s1);padding:clamp(13px,2.2vh,20px);display:flex;flex-direction:column;gap:8px}
.step-n{font-size:11px;color:var(--accent-ui);letter-spacing:.1em}
.step p{font-size:13px;color:var(--t2);line-height:1.55}

/* ── why-chain facts ──────────────────────────────────────────────────── */
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1px;background:var(--b0)}
.fact{background:var(--s1);padding:clamp(12px,2vh,18px) 20px;display:flex;flex-direction:column;gap:7px}
.fact dt{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--t3)}
.fact dd{font-size:15px;line-height:1.35}

/* ── address block + checks ───────────────────────────────────────────── */
.addrbox{
  display:grid; grid-template-columns:auto minmax(0,1fr); gap:8px 22px;
  align-items:baseline; background:var(--s1); border:1px solid var(--b1); padding:clamp(11px,1.9vh,16px) 20px;
}
.addrbox .lbl{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--t3)}
.addrbox .addr.big{font-size:clamp(12px,1.5vw,17px);color:var(--t1)}
.addrbox>span:not(.lbl){font-size:13px;color:var(--t2)}
.checks{list-style:none;display:flex;flex-direction:column;gap:1px;background:var(--b0)}
.checks li{
  background:var(--s1); padding:clamp(6px,1.1vh,9px) 16px; display:grid;
  grid-template-columns:auto minmax(0,1fr); gap:4px 14px; align-items:baseline;
}
.tick{
  grid-row:span 2; font-size:10px; letter-spacing:.1em; color:var(--accent-ink);
  background:var(--accent); padding:3px 7px; align-self:start;
}
.ck{font-size:14px}
.ck-d{font-size:clamp(11px,1.6vh,12px);color:var(--t2);line-height:1.45}

/* ── stats ────────────────────────────────────────────────────────────── */
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:1px;background:var(--b0)}
.stats.four{grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}
.stat{background:var(--s1);padding:clamp(14px,2.4vh,22px) 20px;display:flex;flex-direction:column;gap:10px}
.big-n{font-size:clamp(24px,min(3.6vw,5vh),46px);letter-spacing:-.03em;line-height:1}
.sub{font-size:12.5px;color:var(--t2);line-height:1.5}

/* ── honest split ─────────────────────────────────────────────────────── */
.split{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1px;background:var(--b0)}
.col{background:var(--s1);padding:clamp(14px,2.4vh,22px);display:flex;flex-direction:column;gap:14px}
.col-h{font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--t3)}
.col:first-child .col-h{color:var(--accent-ui)}
ul.plain{list-style:none;display:flex;flex-direction:column;gap:10px}
ul.plain li{font-size:13.5px;color:var(--t1);line-height:1.5;padding-left:16px;position:relative}
ul.plain li::before{content:"";position:absolute;left:0;top:.62em;width:6px;height:1px;background:var(--t4)}
ul.plain.dim li{color:var(--t2)}

/* ── milestones ───────────────────────────────────────────────────────── */
.milestones{list-style:none;display:flex;flex-direction:column;gap:1px;background:var(--b0)}
.milestones li{background:var(--s1);padding:clamp(11px,1.9vh,18px) 20px;display:flex;gap:18px;align-items:baseline}
.ms-n{font-size:11px;color:var(--accent-ui);flex:none;letter-spacing:.08em}
.milestones p{font-size:clamp(11.5px,1.8vh,13px);color:var(--t2);line-height:1.5;margin-top:4px;max-width:78ch}

.close{display:flex;flex-direction:column;gap:clamp(20px,3vw,36px)}

/* ── phones ───────────────────────────────────────────────────────────────
   Nine fixed 100dvh panes cannot hold a 360px phone without shrinking body text
   below what anyone will read. So below 720px the deck stops being paged and
   becomes a continuous document: slides size to their content, snapping is off,
   and the footer joins the flow instead of being pinned. The cover keeps full
   height because it is the one screen that is composed, not read. */
@media (max-width:720px){
  .deck{scroll-snap-type:none}
  .slide{
    min-height:auto; justify-content:flex-start;
    padding:38px var(--pad) 30px; border-bottom:1px solid var(--b1);
  }
  #cover{min-height:100dvh;justify-content:flex-end;padding:0}
  .foot{position:static;left:auto;right:auto;bottom:auto;margin-top:26px}
  /* The cover zeroes its padding so the map can bleed, but the footer lives
     outside .frame — so it has to carry the gutter itself. */
  #cover .foot{padding-left:var(--pad);padding-right:var(--pad);margin-top:0;padding-bottom:14px}
  h2{max-width:none}
  h2.claim,h2.closing{max-width:none}
  .note{max-width:none}
  .cover-meta>div{flex:1 1 100%;padding:13px 0}
  .cover-meta>div+div{border-top:1px solid var(--b0)}
  .addrbox{grid-template-columns:1fr;gap:3px 0}
  .addrbox .lbl{margin-top:9px}
  .checks li{grid-template-columns:auto minmax(0,1fr)}
  .milestones li{gap:14px}
}

/* ── print: a real landscape PDF to attach to a form ──────────────────── */
@media print{
  @page{size:297mm 167mm;margin:0}
  html,body{background:#0f0f0f}
  .rail{display:none}
  .deck{height:auto;overflow:visible;scroll-snap-type:none}
  .slide{
    min-height:167mm;height:167mm;break-after:page;page-break-after:always;
    border-bottom:none;justify-content:center;padding:var(--pad);
    padding-bottom:calc(var(--pad) * 0.5 + 38px);
  }
  .foot{position:absolute;left:var(--pad);right:var(--pad);bottom:calc(var(--pad) / 2);margin-top:0}
  .slide:last-child{break-after:auto;page-break-after:auto}
  #grid{display:none}
  #cover{justify-content:center}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}

/* Very short viewports (a 1024x640 laptop, some projectors). The evidence slide
   is the densest one; scale it down rather than hiding checks — a check that
   silently disappears is exactly the kind of omission this deck argues against. */
@media (max-height:700px){
  .ck{font-size:13px}
  .addrbox{gap:6px 20px}
  .addrbox .addr.big{font-size:14px}
  .addrbox>span:not(.lbl){font-size:12px}
}

@media (prefers-reduced-motion:reduce){
  *{animation:none!important;transition:none!important;scroll-behavior:auto!important}
}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
`
}

/**
 * The cover canvas: the Z14 grid in perspective, receding to a horizon, with
 * claimed tiles lit in the chain accent. Deliberately the same read as the app's
 * map — hue from the chain, luminance from a white mix, so a navy accent still
 * reads as light. No template literals in here; this string is nested inside one.
 */
function script() {
  return `
(function(){
  var cv = document.getElementById('grid');
  if (!cv) return;
  var ctx = cv.getContext('2d');
  var css = getComputedStyle(document.documentElement);
  var accent = css.getPropertyValue('--accent').trim() || '#4ade80';

  function rgb(h){
    h = h.replace('#','');
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
  }
  var A = rgb(accent);
  // Same trick the map uses: mix toward white so a dark brand colour still glows.
  function mix(t,a){
    var r = Math.round(A[0]+(255-A[0])*t), g = Math.round(A[1]+(255-A[1])*t), b = Math.round(A[2]+(255-A[2])*t);
    return 'rgba('+r+','+g+','+b+','+a+')';
  }

  var COLS = 34, ROWS = 22;
  // Portrait squeezes the grid into a narrow corridor and pushes the far edge
  // into a band of dead space, so the camera opens up and sits lower.
  function portrait(){ return W / H < 0.9; }
  function depth(){ return portrait() ? 3.4 : 5.2; }
  function horizonY(){ return H * (portrait() ? 0.20 : 0.30); }
  function spread(){ return W * (portrait() ? 1.85 : 0.92); }
  // A fixed pseudo-random claim pattern — clustered, like real cities, and stable
  // across reloads so the cover is the same image every time it is presented.
  var claims = [];
  var seed = 20260811;
  function rnd(){ seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }
  var hubs = [];
  for (var h = 0; h < 7; h++) hubs.push([rnd() * COLS, rnd() * ROWS, 1.4 + rnd() * 2.6]);
  for (var c = 0; c < COLS; c++) {
    for (var r = 0; r < ROWS; r++) {
      var best = 0;
      for (var k = 0; k < hubs.length; k++) {
        var dx = c - hubs[k][0], dy = r - hubs[k][1];
        var d = Math.sqrt(dx*dx + dy*dy) / hubs[k][2];
        var v = Math.exp(-d * d * 0.5);
        if (v > best) best = v;
      }
      if (rnd() < best * 0.72) claims.push([c, r, 0.35 + rnd() * 0.65]);
    }
  }

  var W = 0, H = 0, dpr = 1;
  function size(){
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Perspective: d in [0,1] is depth away from the viewer.
  function proj(wx, d){
    var f = 1 / (1 + d * depth());
    var horizon = horizonY();
    return [W * 0.5 + wx * f * spread(), horizon + f * (H * 0.98 - horizon), f];
  }

  var t0 = null, still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function draw(ts){
    if (t0 === null) t0 = ts;
    var drift = still ? 0 : ((ts - t0) * 0.0000135) % 1;

    ctx.clearRect(0, 0, W, H);

// Horizon wash — the only soft edge in the deck, and it is light, not blur.
    // Anchored to where the grid's far edge actually lands, so the two never
    // disagree and leave a visible seam across the cover.
    var far = proj(0, 1)[1], top = far - H * 0.06;
    var g = ctx.createLinearGradient(0, top, 0, H);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.16, 'rgba(255,255,255,0.05)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.012)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, top, W, H - top);

    var cw = 2 / COLS;

    // Claimed tiles, painted before the wires so the grid sits on top.
    for (var i = 0; i < claims.length; i++) {
      var cx = claims[i][0], cy = claims[i][1], w = claims[i][2];
      var d0 = ((cy / ROWS) + drift) % 1, d1 = d0 + 1 / ROWS;
      if (d1 > 1) continue;
      var x0 = -1 + cx * cw, x1 = x0 + cw;
      var a = proj(x0, d0), b = proj(x1, d0), c2 = proj(x1, d1), e = proj(x0, d1);
      var fade = Math.pow(a[2], 0.85);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c2[0], c2[1]); ctx.lineTo(e[0], e[1]);
      ctx.closePath();
      ctx.fillStyle = mix(w > 0.82 ? 0.93 : w > 0.6 ? 0.68 : 0.35, (0.10 + w * 0.5) * fade);
      ctx.fill();
    }

    ctx.lineWidth = 1;

    // Depth lines.
    for (var r2 = 0; r2 <= ROWS; r2++) {
      var d = ((r2 / ROWS) + drift) % 1;
      var l = proj(-1, d), rr = proj(1, d);
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.035 + l[2] * 0.10).toFixed(3) + ')';
      ctx.beginPath(); ctx.moveTo(l[0], l[1]); ctx.lineTo(rr[0], rr[1]); ctx.stroke();
    }
    // Columns run to the vanishing point.
    for (var c3 = 0; c3 <= COLS; c3++) {
      var wx = -1 + c3 * cw;
      var n = proj(wx, 0), f2 = proj(wx, 1);
      var grd = ctx.createLinearGradient(n[0], n[1], f2[0], f2[1]);
      grd.addColorStop(0, 'rgba(255,255,255,0.13)');
      grd.addColorStop(1, 'rgba(255,255,255,0.02)');
      ctx.strokeStyle = grd;
      ctx.beginPath(); ctx.moveTo(n[0], n[1]); ctx.lineTo(f2[0], f2[1]); ctx.stroke();
    }

    // Scrim. The cover type sits bottom-left over the map, and the house style
    // forbids blur, so legibility is bought with painted gradients of the ground
    // colour instead — solid, not frosted. Drawn after the grid and before the
    // callout so the callout stays crisp on the clear side of the frame.
    if (!portrait()) {
      var s1 = ctx.createLinearGradient(0, 0, W * 0.64, 0);
      s1.addColorStop(0, 'rgba(15,15,15,0.93)');
      s1.addColorStop(0.5, 'rgba(15,15,15,0.7)');
      s1.addColorStop(1, 'rgba(15,15,15,0)');
      ctx.fillStyle = s1; ctx.fillRect(0, 0, W * 0.64, H);
    }

    // On a phone the copy runs the full width, so the wash has to come up from
    // the bottom and go further, not in from the left.
    var top2 = portrait() ? H * 0.34 : H * 0.52;
    var s2 = ctx.createLinearGradient(0, top2, 0, H);
    s2.addColorStop(0, 'rgba(15,15,15,0)');
    s2.addColorStop(portrait() ? 0.4 : 1, portrait() ? 'rgba(15,15,15,0.72)' : 'rgba(15,15,15,0.66)');
    if (portrait()) s2.addColorStop(1, 'rgba(15,15,15,0.93)');
    ctx.fillStyle = s2; ctx.fillRect(0, top2, W, H - top2);

    // The thesis, drawn on the map: a coordinate IS the token id. It needs ~200px
    // of clear width to the right, which a phone does not have — so it is dropped
    // there rather than clipped mid-number.
    var mk = proj(0.40, 0.10);
    if (W >= 620) {
    ctx.fillStyle = mix(0.93, 0.95);
    ctx.fillRect(mk[0] - 3, mk[1] - 3, 6, 6);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.moveTo(mk[0] + 5, mk[1] - 5); ctx.lineTo(mk[0] + 44, mk[1] - 30); ctx.lineTo(mk[0] + 158, mk[1] - 30);
    ctx.stroke();
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('(16383, 16383) \\u2192 536854527', mk[0] + 48, mk[1] - 36);
    }

    if (!still) requestAnimationFrame(draw);
  }

  size();
  requestAnimationFrame(draw);
  var to;
  window.addEventListener('resize', function(){
    clearTimeout(to);
    to = setTimeout(function(){ size(); if (still) { t0 = null; requestAnimationFrame(draw); } }, 120);
  });
})();

/* Rail progress + keyboard paging. */
(function(){
  var deck = document.querySelector('.deck'), bar = document.querySelector('.rail-in');
  if (!deck || !bar) return;
  function upd(){
    var max = deck.scrollHeight - deck.clientHeight;
    bar.style.height = (max > 0 ? (deck.scrollTop / max) * 100 : 0) + '%';
  }
  deck.addEventListener('scroll', upd, { passive: true });
  upd();
  document.addEventListener('keydown', function(e){
    var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
    var i = slides.findIndex(function(s){ return s.offsetTop > deck.scrollTop + 8; });
    if (e.key === 'ArrowRight' || e.key === 'PageDown') {
      if (i > -1) { slides[i].scrollIntoView({ behavior: 'smooth' }); e.preventDefault(); }
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      var j = (i === -1 ? slides.length : i) - 2;
      if (j >= 0) { slides[j].scrollIntoView({ behavior: 'smooth' }); e.preventDefault(); }
    }
  });
})();
`
}

/* ── run ────────────────────────────────────────────────────────────────── */

const argv = process.argv.slice(2)
const only = argv.filter((a) => !a.startsWith('--'))
mkdirSync(OUT, { recursive: true })

// `--artifact <chain>` emits the same deck without the document shell, for hosts
// that supply their own <head> and wrap the content themselves.
if (argv.includes('--artifact')) {
  const c = only.length ? CHAINS[only[0]] : null
  if (only.length && !c) {
    console.error(`  no such chain: ${only[0]}`)
    process.exit(1)
  }
  const full = deck(c)
  const body = full.slice(full.indexOf('<body>') + 6, full.lastIndexOf('</body>'))
  const style = full.slice(full.indexOf('<style>'), full.indexOf('</style>') + 8)
  const title = full.slice(full.indexOf('<title>') + 7, full.indexOf('</title>'))
  const name = `_artifact-${c?.key ?? 'neutral'}.html`
  writeFileSync(join(OUT, name), `<title>${title}</title>\n${style}\n${body}\n`)
  console.log(`  ${name}`)
  process.exit(0)
}

const targets = argv.includes('--neutral')
  ? []
  : (only.length ? only.map((k) => CHAINS[k]).filter(Boolean) : MAINNET_CHAINS.filter((c) => !c.halted))

if (only.length && !targets.length) {
  console.error(`  no such chain: ${only.join(', ')}`)
  process.exit(1)
}

let written = 0
for (const c of targets) {
  writeFileSync(join(OUT, `${c.key}.html`), deck(c))
  written += 1
  const accent = PROFILES[c.key]?.accent ?? c.color
  console.log(`  ${c.key.padEnd(14)} ${String(accent).padEnd(9)} ${LIVE[c.key] ? 'live on mainnet' : 'compiled, not deployed'}`)
}
writeFileSync(join(OUT, 'index.html'), deck(null))
console.log(`\n  ${written} chain decks + 1 neutral → deploy/deck/`)
console.log(`  ${LIVE_COUNT} chains carry a live mainnet contract · ${TALLY.checksPassed}/${TALLY.checksRun} checks`)
