#!/usr/bin/env node
/**
 * build-grant-status.mjs — one page showing where the grant research actually is.
 *
 *   node scripts/build-grant-status.mjs
 *
 * Consolidates four separate artefacts into a single readable view:
 *   deploy/apex/programs.mjs                     — programme, status, amount
 *   scripts/formaudit/results-*.jsonl            — the 65-page audit
 *   scripts/formaudit/{forms-found,deep-forms}   — located forms + question lists
 *   env/.env.<chain>                             — which chains are live on mainnet
 *
 * The point is honesty about depth: a programme with 44 read questions and a
 * programme whose URL we have never confirmed both used to look like "researched".
 * Every row here states which of those it is.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FA = join(ROOT, 'scripts', 'formaudit')
const OUT = join(ROOT, 'deploy', 'status')

const { PROGRAMS } = await import(join(ROOT, 'deploy/apex/programs.mjs'))
const { MAINNET_CHAINS } = await import(join(ROOT, 'src/lib/blockchain/config.js'))
const { deploymentTally } = await import(join(ROOT, 'deploy/apex/deployments.mjs'))
const TALLY = deploymentTally()

const readJSON = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {})
const deep = readJSON(join(FA, 'deep-forms.json'))
const found = readJSON(join(FA, 'forms-found.json'))

const audit = new Map()
const auditFile = join(FA, 'results-2026-08-11.jsonl')
if (existsSync(auditFile)) {
  for (const l of readFileSync(auditFile, 'utf8').trim().split('\n')) {
    const r = JSON.parse(l)
    const k = r.n % 1000
    if (!audit.has(k) || (r.nFields ?? 0) > (audit.get(k).nFields ?? 0)) audit.set(k, r)
  }
}

/* Which chains carry a live mainnet contract. */
const liveChains = []
for (const c of MAINNET_CHAINS) {
  const f = join(ROOT, 'env', `.env.${c.key}`)
  if (!existsSync(f)) continue
  const k = c.key.toUpperCase().replace(/-/g, '_')
  const m = readFileSync(f, 'utf8').match(new RegExp(`^VITE_CONTRACT_${k}=(.+)$`, 'm'))
  if (m && m[1].trim()) liveChains.push({ key: c.key, name: c.name, addr: m[1].trim(), family: c.family })
}
const liveNames = liveChains.map((c) => c.name.toLowerCase().split(' ')[0])

const FORMHOST = /airtable|tally\.so|typeform|docs\.google\.com\/forms|jotform|fillout|deform/i

/** Depth of research on one programme, as one of five honest states. */
function classify(p) {
  const d = deep[p.n]
  const fo = found[p.n]
  const a = audit.get(p.n) ?? {}
  const q = d?.fields_list?.length ?? 0
  const url = d?.url ?? fo?.url ?? a.url ?? p.url
  const badState = (d?.verified && d.verified !== 'OK') ? d.verified
    : (fo?.verified && fo.verified !== 'OK') ? fo.verified : null
  const note = d?.verified_note ?? fo?.verified_note ?? null

  let depth, gate
  if (badState) {
    depth = 'bad'
    gate = badState
  } else if (q >= 3) {
    depth = 'read'
    gate = a.captcha?.length ? 'captcha' : a.login ? 'login' : a.wallet ? 'wallet' : 'open'
  } else if (FORMHOST.test(url ?? '')) {
    depth = 'located'
    gate = 'fields unread'
  } else if (a.wallet) {
    depth = 'located'
    gate = 'wallet'
  } else if (a.captcha?.length) {
    depth = 'landing'
    gate = 'captcha'
  } else {
    depth = 'landing'
    gate = '—'
  }
  const ch = String(p.chain).toLowerCase()
  return {
    ...p, q, url, depth, gate, note,
    pages: d?.pages ?? null,
    required: d?.fields_list?.filter((x) => x.req).length ?? 0,
    chainLive: ch === 'any' || liveNames.some((r) => ch.includes(r)),
  }
}

const ACTIONABLE = new Set(['OPEN', 'ROLLING', 'PROPOSAL'])
const rows = PROGRAMS.map(classify)
const act = rows.filter((r) => ACTIONABLE.has(r.status))

const DEPTH = {
  read: { label: 'Fields read', tone: 'good', blurb: 'Form confirmed and every question captured.' },
  located: { label: 'Form located', tone: 'warn', blurb: 'Real form URL confirmed; questions not yet readable.' },
  landing: { label: 'Landing page only', tone: 'dim', blurb: 'No application URL confirmed yet.' },
  bad: { label: 'Wrong / closed', tone: 'bad', blurb: 'URL verified as not an application, or closed.' },
}
const order = { read: 0, located: 1, landing: 2, bad: 3 }
act.sort((a, b) => order[a.depth] - order[b.depth] || b.q - a.q || a.n - b.n)

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const count = (d) => act.filter((r) => r.depth === d).length
const totalQ = Object.values(deep).reduce((s, d) => s + (d.fields_list?.length ?? 0), 0)

const card = (n, l, sub, tone) =>
  `<div class="stat ${tone}"><span class="n">${n}</span><span class="l">${l}</span><span class="s">${sub}</span></div>`

const row = (r) => `
  <tr class="d-${r.depth}">
    <td class="num mono">${r.n}</td>
    <td><span class="pname">${esc(r.name)}</span>
        <span class="meta mono">${esc(r.chain)}${r.chainLive ? ' · live' : ''} · ${esc(r.status)}</span>
        ${r.note ? `<span class="note">${esc(r.note.slice(0, 190))}</span>` : ''}</td>
    <td class="mono amt">${esc(r.amount ?? '')}</td>
    <td><span class="chip t-${DEPTH[r.depth].tone}">${DEPTH[r.depth].label}</span></td>
    <td class="mono q">${r.q ? `${r.q}<span class="req"> / ${r.required} req</span>` : '—'}</td>
    <td class="mono gate">${esc(r.gate)}</td>
  </tr>`

const html = `<title>CryptoLand — grant research status</title>
<style>
:root{
  --bg:#0f0f0f;--s1:#141414;--s2:#1a1a1a;--s3:#222;--b0:rgba(255,255,255,.04);
  --b1:rgba(255,255,255,.08);--b2:rgba(255,255,255,.13);
  --t1:#fff;--t2:rgba(255,255,255,.55);--t3:rgba(255,255,255,.30);
  --good:#4ade80;--warn:#fbbf24;--bad:#f87171;--dim:rgba(255,255,255,.35);
  --font:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;
  --mono:'Space Mono',ui-monospace,SFMono-Regular,Menlo,monospace;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--t1);font-family:var(--font);line-height:1.5;
  -webkit-font-smoothing:antialiased;padding:clamp(18px,4vw,44px)}
.mono{font-family:var(--mono);font-variant-numeric:tabular-nums}
.wrap{max-width:1060px;margin:0 auto;display:flex;flex-direction:column;gap:clamp(20px,3vw,34px)}
.eyebrow{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--t2);
  display:flex;align-items:center;gap:10px}
.eyebrow::before{content:"";width:20px;height:1px;background:var(--good)}
h1{font-size:clamp(25px,4.4vw,44px);font-weight:600;letter-spacing:-.03em;line-height:1.08;text-wrap:balance}
.lede{color:var(--t2);font-size:clamp(14px,1.6vw,16px);max-width:70ch}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:1px;background:var(--b0)}
.stat{background:var(--s1);padding:16px 16px 18px;display:flex;flex-direction:column;gap:5px}
.stat .n{font-family:var(--mono);font-size:clamp(23px,3vw,33px);letter-spacing:-.02em;line-height:1}
.stat .l{font-size:12.5px;font-weight:600}
.stat .s{font-size:11.5px;color:var(--t2);line-height:1.45}
.stat.good .n{color:var(--good)}.stat.warn .n{color:var(--warn)}
.stat.bad .n{color:var(--bad)}.stat.dim .n{color:var(--dim)}
.tablewrap{overflow-x:auto;border:1px solid var(--b1)}
table{border-collapse:collapse;width:100%;min-width:720px}
th{position:sticky;top:0;background:var(--s2);text-align:left;font-size:10px;letter-spacing:.14em;
  text-transform:uppercase;color:var(--t3);padding:10px 12px;border-bottom:1px solid var(--b1);font-weight:600}
td{padding:11px 12px;border-bottom:1px solid var(--b0);vertical-align:top;font-size:13.5px}
tr:last-child td{border-bottom:none}
tr.d-read{background:var(--s1)}tr.d-located{background:#151515}
tr.d-landing{background:var(--bg)}tr.d-bad{background:#171313}
.num{color:var(--t3);font-size:11.5px;width:40px}
.pname{display:block;font-weight:600;letter-spacing:-.01em}
.meta{display:block;font-size:11px;color:var(--t3);margin-top:3px}
.note{display:block;font-size:11.5px;color:var(--warn);margin-top:6px;line-height:1.45;max-width:62ch}
.amt{color:var(--t2);font-size:12px;white-space:nowrap}
.q{font-size:12.5px}.q .req{color:var(--t3);font-size:11px}
.gate{font-size:11.5px;color:var(--t2)}
.chip{display:inline-block;font-size:10.5px;letter-spacing:.05em;padding:3px 8px;
  border:1px solid var(--b2);white-space:nowrap}
.t-good{color:var(--good);border-color:rgba(74,222,128,.35)}
.t-warn{color:var(--warn);border-color:rgba(251,191,36,.35)}
.t-bad{color:var(--bad);border-color:rgba(248,113,113,.35)}
.t-dim{color:var(--dim)}
.block{background:var(--s1);border-left:2px solid var(--bad);padding:16px 18px}
.block h2{font-size:15px;margin-bottom:8px}
.block p{font-size:13px;color:var(--t2);line-height:1.6;max-width:74ch}
.block strong{color:var(--t1)}
.legend{display:flex;flex-wrap:wrap;gap:14px;font-size:11.5px;color:var(--t2)}
.foot{border-top:1px solid var(--b0);padding-top:14px;font-size:11px;color:var(--t3);
  display:flex;flex-wrap:wrap;gap:8px 20px}
@media (max-width:640px){td,th{padding:9px 9px}.note{display:none}}
</style>

<div class="wrap">
  <div>
    <p class="eyebrow mono">Grant research · ${new Date().toISOString().slice(0, 10)}</p>
    <h1>Where the research actually stands</h1>
    <p class="lede">${PROGRAMS.length} programmes tracked, ${act.length} actionable.
      ${liveChains.length} of ${MAINNET_CHAINS.filter((c) => !c.halted).length} chains carry a live mainnet
      contract with ${TALLY.checksPassed}/${TALLY.checksRun} on-chain checks passing. Every row below states
      how deeply that programme was actually verified — a form whose questions were read and a URL nobody
      has confirmed are not the same thing.</p>
  </div>

  <div class="stats">
    ${card(count('read'), 'Fields read', 'Form confirmed, all questions captured', 'good')}
    ${card(count('located'), 'Form located', 'URL confirmed, questions not readable', 'warn')}
    ${card(count('landing'), 'Landing page only', 'No application URL confirmed yet', 'dim')}
    ${card(count('bad'), 'Wrong or closed', 'URL verified as not an application', 'bad')}
    ${card(totalQ, 'Questions catalogued', 'across every form that could be read', 'good')}
  </div>

  <div class="block">
    <h2>The blocker that stops submission outright</h2>
    <p><strong>No X account, Telegram handle or public GitHub profile.</strong>
      Starknet requires Project X URL, Contact Telegram handle, Contact GitHub username and Team GitHub
      Handles — 41 of its 44 questions are required. Polygon requires Twitter <em>and</em> Telegram.
      These are mandatory fields: the forms cannot be submitted without them, and no amount of
      engineering substitutes. This gates the two largest open programmes.</p>
  </div>

  <div class="legend">
    <span><span class="chip t-good">Fields read</span> form confirmed + questions captured</span>
    <span><span class="chip t-warn">Form located</span> URL right, fields behind a session or iframe</span>
    <span><span class="chip t-dim">Landing page only</span> application URL still unknown</span>
    <span><span class="chip t-bad">Wrong / closed</span> verified as not an application</span>
  </div>

  <div class="tablewrap">
    <table>
      <thead><tr><th>#</th><th>Programme</th><th>Amount</th><th>Depth</th><th>Questions</th><th>Gate</th></tr></thead>
      <tbody>${act.map(row).join('')}</tbody>
    </table>
  </div>

  <div class="foot">
    <span class="mono">Sources: programs.mjs · formaudit/*.jsonl · deep-forms.json · env/.env.&lt;chain&gt;</span>
    <span class="mono">Regenerate: node scripts/build-grant-status.mjs</span>
  </div>
</div>
`

mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'grant-status.html'), html)
console.log(`  ${act.length} actionable programmes → deploy/status/grant-status.html`)
console.log(`  read ${count('read')} · located ${count('located')} · landing ${count('landing')} · bad ${count('bad')}`)
console.log(`  ${totalQ} questions catalogued`)
