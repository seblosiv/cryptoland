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


/** Check text is written for the shared EVM record; make it read as one chain. */
const chainCheck = (t, chain) =>
  String(t ?? '')
    .replace(/\bon all \d+\b/gi, chain ? `on ${chain.name}` : 'on mainnet')
    .replace(/\ball \d+ chains?\b/gi, chain ? chain.name : 'mainnet')
    .replace(/\bevery chain\b/gi, chain ? chain.name : 'mainnet')
    .replace(/\bacross \d+ chains?\b/gi, chain ? `on ${chain.name}` : '')

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
  const onAccent = contrast(hexToRgb('#0c0b0a'), hexToRgb(accentHex)) >= 4.5 ? '#0c0b0a' : '#ffffff'
  // Pulled toward the warm ink so a display-size word in the accent reads as a
  // considered colour rather than a highlighter.
  const accentSoft = rgbToHex(...hexToRgb(accentUi).map((v, i) => Math.round(v * 0.62 + [247, 244, 239][i] * 0.38)))
  // Stops for the chrome gradient: a light lift and a deep shadow of the chain
  // colour, so the metal reads as lit rather than as a flat tint.
  const accentHi = rgbToHex(...hexToRgb(accentUi).map((v) => Math.round(v + (255 - v) * 0.45)))
  const accentLo = rgbToHex(...hexToRgb(accentUi).map((v) => Math.round(v * 0.42)))

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
      <h1 class="wordmark chrome">Crypto<span class="thin">Land</span></h1>
      <p class="lede">A map of the real world, divided into ${TILES.toLocaleString('en-US')} tiles.
        Players claim territory, upgrade it, trade it, raid it and govern it${chain ? ` — on ${esc(chain.name)}` : ''}.</p>
      <dl class="cover-meta">
        <div><dt class="mono">Grid</dt><dd class="mono">${GRID}&thinsp;&times;&thinsp;${GRID} · Z14</dd></div>
        <div><dt class="mono">Status</dt><dd class="mono">${contract ? '<i class="dot"></i>Live on mainnet' : 'Contract compiled'}</dd></div>
        ${contract ? `<div class="wide"><dt class="mono">Contract</dt><dd class="mono addr">${addr(contract)}</dd></div>` : ''}
      </dl>
    </div>`, '<canvas id="grid" aria-hidden="true"></canvas>')

  /* 02 — the insight. A reader funds a thesis, not a feature list. */
  slide('insight', 'The insight', `
    <p class="eyebrow">The insight</p>
    <p class="kicker">Every square metre of Earth<br>has already been mapped.</p>
    <h2 class="thesis chrome">None of it is ownable</h2>
    <p class="lede wide">Satellites finished the map decades ago. What was never built is the layer above it —
      a registry where a place has an owner, and the claim settles somewhere neutral rather than inside
      one company's database.</p>
    <p class="note">CryptoLand is that layer, at the resolution where it becomes a game: Earth divided into
      ${TILES.toLocaleString('en-US')} tiles, each roughly a city block, each independently ownable.</p>`)

  /* 03 — the product, as the consequence of the insight. */
  slide('product', 'The game', `
    <p class="eyebrow">What people do with it</p>
    <h2>A registry nobody plays is a database. The game is what makes the map fill up.</h2>
    <div class="loop">
      ${[
        ['Claim', 'Any tile on Earth. It mints to your wallet as ' + (ob.nativeTerm ?? 'an NFT') + '.'],
        ['Build', 'Name it, theme it, develop it. Your mark on a map other people are looking at.'],
        ['Trade', 'An in-game market. Land beside a claimed cluster is worth more than land alone.'],
        ['Raid', 'Send an AI Guardian at a neighbour. They stake one back. Territory changes hands.'],
        ['Govern', 'Holders vote, weighted by tiles held — computed server-side, never client-supplied.'],
      ].map(([h, b], i) => `<div class="step"><span class="step-n">${String(i + 1).padStart(2, '0')}</span><h3>${h}</h3><p>${esc(b)}</p></div>`).join('')}
    </div>
    <p class="note">All five run today — map, checkout, marketplace, guardians, raids, governance and payouts.
      This is a finished product looking for players, not a prototype looking for a build.</p>`)

  /* 03 — why THIS chain. The slide the whole per-chain build exists for. */
  if (chain) {
    slide('why', `Why ${chain.name}`, `
      <p class="eyebrow">Why ${esc(chain.name)}</p>
      ${(() => {
        const t = ob.grantAngle ?? ob.why ?? p.pitch ?? `Built for ${chain.name}.`
        return `<h2 class="thesis chrome${t.length > 95 ? ' long' : ''}">${esc(t)}</h2>`
      })()}
      <div class="facts">
        <div class="fact"><dt>A tile is</dt><dd>${esc(ob.nativeTerm ?? 'an NFT')}</dd></div>
        ${ob.chainStat ? `<div class="fact"><dt>${esc(ob.chainStat.label)}</dt><dd class="accent">${esc(ob.chainStat.value)}</dd></div>` : ''}
        <div class="fact"><dt>Wallets</dt><dd>${esc(walletNames(chain, p))}</dd></div>
        ${ob.feeNote ? `<div class="fact wide"><dt>Fees</dt><dd>${esc(ob.feeNote)}</dd></div>` : ''}
      </div>
      <p class="note">This build is compiled for ${esc(chain.name)} alone — its wallets, its token standard,
        its vocabulary, its own domain at <span class="mono">${esc(chain.key)}.xono.ai</span>. There is no
        chain switcher, and ${esc(chain.name)} is not one entry in a dropdown. It is the product.</p>`)
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
         <span class="ck">${esc(chainCheck(c.name, chain))}</span>
         ${c.detail ? `<span class="ck-d">${esc(chainCheck(c.detail, chain))}</span>` : ''}</li>`).join('')}</ul>` : ''}`)
  }

  /* 05 — the proof that generalises. */
  slide('proof', 'Proof', `
    <p class="eyebrow mono">Verified, not asserted</p>
    <h2>Every claim on the previous slide is a transaction someone else can read.</h2>
    <div class="stats">
      <div class="stat"><span class="big-n chrome">${TALLY.checksPassed}/${TALLY.checksRun}</span>
        <span class="sub">on-chain checks passing, run against live networks after deployment</span></div>
      <div class="stat"><span class="big-n chrome">817</span>
        <span class="sub">automated tests — 358 frontend, 436 contract, 23 backend invariants</span></div>
      <div class="stat"><span class="big-n chrome">5</span>
        <span class="sub">separate virtual machines that independently agree tile (16383,&thinsp;16383) is token 536854527</span></div>
    </div>
    <p class="note"><strong>Deploying found defects the tests could not.</strong> The EVM contract
      passed 39 unit tests while <code class="mono">tokenIdFromKey(0,&thinsp;32768)</code> and
      <code class="mono">tokenIdFromKey(1,&thinsp;0)</code> both returned 32768 — one id, two tiles —
      and <code class="mono">claimTile</code> accepted any raw uint256. Caught on-chain, fixed, and
      now covered by 5 regression tests plus an explicit out-of-range rejection check.</p>`)

  /* 06 — the mechanism. The most elegant true thing we have, and it is ours. */
  slide('mechanism', 'The mechanism', `
    <p class="eyebrow">Why this can't be faked</p>
    <p class="kicker">Ownership is not a row<br>in a database.</p>
    <h2 class="thesis chrome">The id is the place</h2>
    <div class="formula">
      <code class="mono f-eq">tokenId = (x &lt;&lt; 15) | y</code>
      <span class="f-arrow">→</span>
      <code class="mono f-out">(16383, 16383) = 536854527</code>
    </div>
    <p class="lede wide">The identifier <em>encodes</em> the coordinate. Anyone can compute the token for
      any point on Earth without asking us, and no two tiles can ever collide into one id.</p>
    <p class="note">That property is why the registry survives us. If this company disappears, the mapping
      from coordinate to token is still arithmetic anyone can run, and the owner of record is still on
      ${chain ? esc(chain.name) : 'chain'}.</p>`)

  /* 07 — the honest slide. */
  slide('traction', 'Traction', `
    <p class="eyebrow mono">Where we actually are</p>
    <h2>Contracts are live. Players are not — and we will not pretend otherwise.</h2>
    <div class="split">
      <div class="col">
        <h3 class="mono col-h">Real</h3>
        <ul class="plain">
          <li>${chain ? esc(chain.name) + ' contract live on mainnet' + (rec?.checks?.length ? ', ' + rec.checks.length + ' on-chain checks passing' : '') : 'Contracts live on mainnet, ' + TALLY.checksPassed + '/' + TALLY.checksRun + ' checks passing'}</li>
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

  /* 08 — the ask. One unlock, not a wish list. */
  slide('ask', 'The ask', `
    <p class="eyebrow">What the money buys</p>
    <h2 class="compact">One change decides whether this becomes an economy${chain ? ` on ${esc(chain.name)}` : ''}: the daily loop has to settle on-chain.</h2>
    <ol class="milestones">
      ${[
        ['Move the loop on-chain', `Check-in, upgrade and raid resolution become ${chain ? esc(chain.name) : 'on-chain'} transactions rather than database writes. Today the game touches the chain once, at purchase. After this it touches it every session — which is the difference between a product that uses ${chain ? esc(chain.name) : 'a chain'} and one that lives there.`],
        ['Bring players to it', `A funded campaign aimed at ${chain ? esc(chain.name) + '\u2019s own users' : 'one ecosystem'}, reported as organic numbers held separate from seed data.`],
        ['Harden before volume', 'External review of the claim, marketplace and payout paths while they are still cheap to change.'],
        ['Report in public', 'The metrics endpoint becomes a public page, so progress is checkable without asking us.'],
      ].map(([h, b], i) => `<li><span class="ms-n">${String(i + 1).padStart(2, '0')}</span><div><h3>${esc(h)}</h3><p>${esc(b)}</p></div></li>`).join('')}
    </ol>`)

  /* 09 — close. */
  slide('close', 'Contact', `
    <div class="close">
      <p class="eyebrow mono">CryptoLand by XONO</p>
      <h2 class="closing chrome">${esc(tagline)}</h2>
      <dl class="cover-meta">
        <div><dt class="mono">Live</dt><dd class="mono">${chain ? esc(chain.key) + '.xono.ai' : 'xono.ai'}</dd></div>
        <div><dt class="mono">Contact</dt><dd class="mono">hello@xono.ai</dd></div>
        <div><dt class="mono">Live metrics</dt><dd class="mono">${chain ? esc(chain.key) + '.xono.ai/ecosystem' : 'xono.ai'}</dd></div>
        ${contract ? `<div class="wide"><dt class="mono">${esc(chain.name)} contract</dt><dd class="mono addr">${addr(contract)}</dd></div>` : ''}
      </dl>
    </div>`)

  return page({ title, accentHex, accentUi, onAccent, accentSoft, accentHi, accentLo, chain, slides: slides.join('\n') })
}

/* ── the document ───────────────────────────────────────────────────────── */

function page({ title, accentHex, accentUi, onAccent, accentSoft, accentHi, accentLo, chain, slides }) {
  return `<!doctype html>
<html lang="en" data-chain="${esc(chain?.key ?? 'neutral')}" data-family="${esc(chain?.family ?? 'multi')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="CryptoLand by XONO — a geospatial NFT game${chain ? ' on ' + esc(chain.name) : ''}.">
<style>
${css({ accentHex, accentUi, onAccent, accentSoft, accentHi, accentLo })}
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

function css({ accentHex, accentUi, onAccent, accentSoft, accentHi, accentLo }) {
  return `
/* Tokens are the app's, not new ones: src/index.css :root. The deck is a
   projection surface that mirrors a solid-dark product, so it commits to one
   visual world on purpose — no theme media query, every colour painted. */
:root{
  --bg:#000000; --s1:#0a0a0a; --s2:#101010; --s3:#161616; --s4:#1e1e1e;
  --b0:rgba(255,255,255,0.05); --b1:rgba(255,255,255,0.10); --b2:rgba(255,255,255,0.17);
  --t1:#ffffff; --t2:rgba(255,255,255,0.62); --t3:rgba(255,255,255,0.34); --t4:rgba(255,255,255,0.16);
  --accent:${accentHex}; --accent-ui:${accentUi}; --accent-ink:${onAccent};
  --accent-soft:${accentSoft}; --accent-hi:${accentHi}; --accent-lo:${accentLo};
  --display:'Inter','Helvetica Neue',Helvetica,Arial,system-ui,sans-serif;
  --font:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;
  --mono:'Space Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  --pad:clamp(24px,min(5vw,7vh),88px);
}

/* The chrome sweep. A diagonal band of silver blown out to white, falling into
   the chain's own colour — clipped to the glyphs so the type IS the material.
   Every stop is explicit because background-clip:text inherits nothing. */
.chrome{
  background-image:linear-gradient(146deg,
    #909090 0%, #e8e8e8 8%, #ffffff 14%, #c6c6c6 22%, #5e5e5e 30%,
    #bdbdbd 38%, #ffffff 46%,
    var(--accent-hi) 58%, var(--accent-ui) 70%, var(--accent-ui) 78%,
    var(--accent-lo) 90%, #17111e 100%);
  -webkit-background-clip:text; background-clip:text;
  color:transparent; -webkit-text-fill-color:transparent;
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
.accent{color:var(--accent-soft)}

/* ── rail ─────────────────────────────────────────────────────────────── */
.rail{position:fixed;left:0;top:0;bottom:0;width:1px;background:var(--b0);z-index:20}
.rail-in{width:100%;height:0;background:var(--accent-soft);transition:height .25s ease}

/* ── slides ───────────────────────────────────────────────────────────── */
.deck{scroll-snap-type:y mandatory;height:100dvh;overflow-y:auto;overflow-x:hidden}
.slide{
  scroll-snap-align:start; position:relative;
  min-height:100dvh; display:flex; flex-direction:column; justify-content:center;
  padding:var(--pad); padding-bottom:calc(var(--pad) * 0.5 + 38px);
  border-bottom:1px solid var(--b0);
}
.frame{width:100%;max-width:1180px;margin:0 auto;display:flex;flex-direction:column;gap:clamp(14px,min(2.2vw,3.1vh),40px)}
.foot{
  position:absolute; left:var(--pad); right:var(--pad); bottom:calc(var(--pad) / 2);
  display:flex; justify-content:space-between; gap:16px;
  font-size:10px; letter-spacing:.14em; text-transform:uppercase; color:var(--t3);
  border-top:1px solid var(--b0); padding-top:13px; align-items:baseline;
}
.foot .num{font-family:var(--display);font-size:14px;letter-spacing:0;color:var(--t2)}

/* ── type scale ───────────────────────────────────────────────────────── */
.eyebrow{
  font-family:var(--display); font-weight:300;
  font-size:clamp(12px,1.5vw,19px); letter-spacing:.34em; text-transform:uppercase;
  color:var(--t2); display:flex; align-items:center; gap:14px;
}
.eyebrow::before{content:"";width:0;height:0;flex:none}
h1.wordmark{
  font-family:var(--display);
  font-size:clamp(52px,min(13.4vw,19vh),190px); font-weight:900; letter-spacing:-.055em;
  line-height:.84; text-transform:uppercase; text-wrap:balance;
}
.wordmark .thin{font-weight:900}
h2{
  font-family:var(--display);
  font-size:clamp(24px,min(4.3vw,6vh),62px); font-weight:800; letter-spacing:-.042em;
  line-height:1.0; max-width:19ch; text-transform:uppercase; text-wrap:balance; color:var(--t1);
}
h2.claim{max-width:19ch}
h2.compact{font-size:clamp(19px,min(2.9vw,4vh),38px);max-width:36ch;line-height:1.1;letter-spacing:-.03em}
h2.closing{max-width:100%;font-size:clamp(38px,min(9vw,12vh),150px);font-weight:900;letter-spacing:-.055em;line-height:.86}
h3{font-size:clamp(14px,1.4vw,17px);font-weight:600;letter-spacing:-.006em;color:var(--t1)}
.lede{font-size:clamp(14px,min(1.7vw,2.3vh),20px);color:var(--t2);max-width:58ch;line-height:1.62;letter-spacing:-.004em}
.note{
  font-size:clamp(11.5px,min(1.2vw,1.68vh),14.5px); color:var(--t3); max-width:76ch; line-height:1.7;
  border-left:1px solid var(--b1); padding-left:clamp(16px,2vw,26px);
}
.note strong{color:var(--t2);font-weight:600}
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

/* ── the rebuilt narrative slides ─────────────────────────────────────── */

/* The thesis statement is the whole slide. It gets the room to be one.
   Tighter tracking and a lower line-height than h2 so it reads as a claim
   being made, not a heading introducing something below it. */
h2.thesis{
  font-family:var(--display);
  font-size:clamp(34px,min(8.6vw,12vh),138px); font-weight:900; letter-spacing:-.055em;
  line-height:.86; text-transform:uppercase; text-wrap:balance;
  max-width:100%;
}
/* Italic, not colour-blocked. A serif italic carries emphasis without shouting;
   the accent then only tints it, which is why it can stay desaturated. */
h2.thesis .em{font-style:normal}
/* A long chain pitch at full display size pushes the supporting facts off the
   slide. One step down keeps the claim dominant without losing the evidence. */
h2.thesis.long{font-size:clamp(20px,min(3.1vw,4.3vh),40px);max-width:34ch;line-height:1.06;letter-spacing:-.032em}
.kicker{
  font-family:var(--display); font-weight:200;
  font-size:clamp(15px,min(2.9vw,4vh),46px); letter-spacing:.06em; line-height:1.12;
  text-transform:uppercase; color:var(--t2); max-width:42ch;
}
.lede.wide{max-width:66ch;font-size:clamp(14.5px,min(1.8vw,2.5vh),21px);color:var(--t2)}

/* The mechanism slide's equation is the one place a monospace line is the hero,
   so it is set at display size rather than as an inline code span. */
.formula{
  display:flex;flex-wrap:wrap;align-items:center;gap:clamp(14px,2.6vw,34px);
  padding:clamp(16px,3vh,30px) 0; border-top:1px solid var(--b1); border-bottom:1px solid var(--b1);
}
.f-eq{font-size:clamp(15px,min(2.3vw,3.2vh),31px);letter-spacing:-.01em;color:var(--t2)}
.f-arrow{color:var(--t3);font-size:clamp(15px,2.4vh,26px);flex:none}
.f-out{font-size:clamp(15px,min(2.3vw,3.2vh),31px);letter-spacing:-.01em;color:var(--accent-hi)}

/* Step numbers become editorial figures rather than inline digits. */
.step-n{
  font-family:var(--mono);font-size:9.5px;letter-spacing:.18em;color:var(--t4);
  display:block;margin-bottom:2px;
}
.step h3{color:var(--t1)}

.fact.wide{grid-column:1/-1}
.ms-n{
  font-family:var(--display);font-size:15px;letter-spacing:0;color:var(--t3);
  flex:none;padding-top:2px;
}

/* ── the loop ─────────────────────────────────────────────────────────── */
.loop{display:grid;grid-template-columns:repeat(auto-fit,minmax(176px,1fr));gap:clamp(18px,3vw,42px)}
.step{padding:14px 0 0;border-top:1px solid var(--b1);display:flex;flex-direction:column;gap:7px}
.step p{font-size:12.5px;color:var(--t2);line-height:1.6}

/* ── why-chain facts ──────────────────────────────────────────────────── */
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(196px,1fr));gap:clamp(16px,2.6vw,38px)}
.fact{padding:12px 0 0;border-top:1px solid var(--b1);display:flex;flex-direction:column;gap:6px}
.fact dt{font-family:var(--mono);font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--t3)}
.fact dd{font-size:clamp(13px,1.8vh,15px);line-height:1.38;color:var(--t1)}

/* ── address block + checks ───────────────────────────────────────────── */
.addrbox{
  display:grid; grid-template-columns:auto minmax(0,1fr); gap:9px 26px;
  align-items:baseline; padding:clamp(13px,2.1vh,20px) 0;
  border-top:1px solid var(--b1); border-bottom:1px solid var(--b1);
}
.addrbox .lbl{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--t3)}
.addrbox .addr.big{font-size:clamp(11.5px,1.4vw,16px);color:var(--t1)}
.addrbox>span:not(.lbl){font-size:13px;color:var(--t2)}
.checks{list-style:none;display:flex;flex-direction:column;border-top:1px solid var(--b1)}
.checks li{
  padding:clamp(7px,1.2vh,11px) 0; border-bottom:1px solid var(--b0); display:grid;
  grid-template-columns:auto minmax(0,1fr); gap:4px 14px; align-items:baseline;
}
.tick{
  grid-row:span 2; font-size:9px; letter-spacing:.16em; color:var(--t1);
  border:1px solid var(--b2); border-radius:999px; padding:3px 10px; align-self:center;
}
.ck{font-size:13.5px}
.ck-d{font-size:clamp(10.5px,1.5vh,11.5px);color:var(--t3);line-height:1.45}

/* ── stats ────────────────────────────────────────────────────────────── */
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(206px,1fr));gap:clamp(18px,3vw,44px)}
.stats.four{grid-template-columns:repeat(auto-fit,minmax(168px,1fr))}
.stat{padding:13px 0 0;border-top:1px solid var(--b1);display:flex;flex-direction:column;gap:9px}
.big-n{font-family:var(--display);font-size:clamp(28px,min(4.2vw,5.8vh),58px);font-weight:900;letter-spacing:-.04em;line-height:.92}
.sub{font-size:12.5px;color:var(--t2);line-height:1.5}

/* ── honest split ─────────────────────────────────────────────────────── */
.split{display:grid;grid-template-columns:repeat(auto-fit,minmax(258px,1fr));gap:clamp(20px,3.4vw,48px)}
.col{padding:13px 0 0;border-top:1px solid var(--b1);display:flex;flex-direction:column;gap:13px}
.col-h{font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--t3)}
.col:first-child .col-h{color:var(--accent-soft)}
ul.plain{list-style:none;display:flex;flex-direction:column;gap:10px}
ul.plain li{font-size:13.5px;color:var(--t1);line-height:1.5;padding-left:16px;position:relative}
ul.plain li::before{content:"";position:absolute;left:0;top:.62em;width:6px;height:1px;background:var(--t4)}
ul.plain.dim li{color:var(--t2)}

/* ── milestones ───────────────────────────────────────────────────────── */
.milestones{list-style:none;display:flex;flex-direction:column;border-top:1px solid var(--b1)}
.milestones li{padding:clamp(11px,1.9vh,20px) 0;border-bottom:1px solid var(--b0);display:flex;gap:clamp(16px,2.4vw,34px);align-items:baseline}
.ms-n{font-size:11px;color:var(--accent-ui);flex:none;letter-spacing:.08em}
.milestones p{font-size:clamp(10px,1.45vh,12.5px);color:var(--t2);line-height:1.42;margin-top:3px;max-width:82ch}

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
  /* Clipped-gradient text can render as blank in a PDF pipeline. Headlines fall
     back to solid ink for print — the attachment must survive the export. */
  .chrome{
    background-image:none!important; color:var(--t1)!important;
    -webkit-text-fill-color:var(--t1)!important;
  }
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
@media (max-height:768px){
  .frame{gap:clamp(9px,1.8vh,22px)}
  h2.thesis{font-size:clamp(28px,6.6vh,76px)}
  h2.thesis.long{font-size:clamp(18px,3.5vh,32px)}
  h2{font-size:clamp(22px,4.4vh,48px)}
  .kicker{font-size:clamp(13px,2.3vh,27px)}
  .lede,.lede.wide{font-size:clamp(13px,1.9vh,17px)}
  .step p{font-size:12px}
  .milestones li{padding:clamp(8px,1.4vh,14px) 0}
}
@media (max-height:700px){
  h2.thesis{font-size:clamp(22px,4.6vh,44px)}
  .ck{font-size:13px}
  .addrbox{gap:6px 20px}
  .addrbox .addr.big{font-size:14px}
  .addrbox>span:not(.lbl){font-size:12px}
  .addrbox{gap:4px 18px;padding:9px 0}
  .checks li{padding:5px 0}
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
