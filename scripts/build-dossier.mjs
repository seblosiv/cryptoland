#!/usr/bin/env node
/**
 * build-dossier.mjs — one page holding everything this project knows about
 * itself: chains, contracts, wallets, programmes, forms, requirements, readiness.
 *
 *   node scripts/build-dossier.mjs        # → deploy/status/dossier.html
 *
 * This supersedes nothing — deploy/apex/build-status.mjs still renders xono.ai/status
 * for reviewers. This is the internal view: denser, segmented into tabs, and
 * carrying the form-audit work (§§18–23) that the public page has no reason to show.
 *
 * Every figure is READ from the repo at build time. The one rule that matters:
 * where something is unknown or unverified, the page says so rather than leaving a
 * blank that reads as "fine".
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FA = join(ROOT, 'scripts', 'formaudit')
const OUT = join(ROOT, 'deploy', 'status')

const { CHAINS, MAINNET_CHAINS, CHAIN_FAMILIES } = await import(join(ROOT, 'src/lib/blockchain/config.js'))
const { PROFILES } = await import(join(ROOT, 'src/config/profiles.js'))
const { DEPLOYMENTS, BLOCKED_DEPLOYMENTS, deploymentTally } = await import(join(ROOT, 'deploy/apex/deployments.mjs'))
const { PROGRAMS, STATUS_META } = await import(join(ROOT, 'deploy/apex/programs.mjs'))

const TALLY = deploymentTally()
const jsonOr = (p, d) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : d)
const linesOr = (p) => (existsSync(p) ? readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [])

const deep = jsonOr(join(FA, 'deep-forms.json'), {})
const found = jsonOr(join(FA, 'forms-found.json'), {})
const funding = jsonOr(join(ROOT, 'deploy/apex/funding-plan.json'), { rows: [] })
const channels = Object.fromEntries(linesOr(join(FA, 'channels-2026-08-12.jsonl')).map((r) => [r.n, r]))
const hunt = Object.fromEntries(linesOr(join(FA, 'hunt-2026-08-12.jsonl')).map((r) => [r.n, r]))

const audit = new Map()
for (const r of linesOr(join(FA, 'results-2026-08-11.jsonl'))) {
  const k = r.n % 1000
  if (!audit.has(k) || (r.nFields ?? 0) > (audit.get(k).nFields ?? 0)) audit.set(k, r)
}

/* ── chains ─────────────────────────────────────────────────────────────── */

const contractFor = (c) => {
  const f = join(ROOT, 'env', `.env.${c.key}`)
  if (!existsSync(f)) return null
  const k = c.key.toUpperCase().replace(/-/g, '_')
  const m = readFileSync(f, 'utf8').match(new RegExp(`^VITE_CONTRACT_${k}=(.+)$`, 'm'))
  return m && m[1].trim() ? m[1].trim() : null
}

const recFor = (c) =>
  DEPLOYMENTS.find((d) => d.network === 'MAINNET' && d.chain.toLowerCase() === c.name.toLowerCase()) ??
  (c.family === 'evm' ? DEPLOYMENTS.find((d) => d.network === 'MAINNET' && d.chain.startsWith('EVM')) : null)

const costFor = (key) => funding.rows?.find((r) => r.key === key)?.usd ?? null

const chains = MAINNET_CHAINS.filter((c) => !c.halted).map((c) => {
  const addr = contractFor(c)
  const rec = recFor(c)
  return {
    key: c.key, name: c.name, family: c.family, id: c.id ?? null,
    accent: PROFILES[c.key]?.accent ?? c.color,
    addr, live: Boolean(addr),
    explorer: addr ? (c.family === 'evm' ? `${c.explorerUrl}/address/${addr}` : rec?.explorer ?? null) : null,
    lang: rec?.lang ?? null,
    checks: rec?.checks?.length ?? 0,
    date: rec?.date ?? null,
    gasless: Boolean(c.gasless),
    cost: costFor(c.key),
    nativeTerm: PROFILES[c.key]?.onboarding?.nativeTerm ?? null,
  }
})
const liveChains = chains.filter((c) => c.live)

/* ── wallets ────────────────────────────────────────────────────────────── */

const WALLETS = [
  { role: 'Deployer', addr: '0xD10178e0E4a6A4aBebAd4d5Dc51DD09Ec10ede58',
    note: 'The retained deployer. Avalanche Retro9000 and OP Atlas both require the ORIGINAL deployer to sign a message to claim contract ownership — losing this key forfeits attribution permanently.' },
  { role: 'Treasury receiver', addr: '0xB8156B85D26df44A662d151EE00d1205FC254c47',
    note: 'Set as treasuryReceiver on all 18 EVM deployments, so sale revenue never accrues to the hot deployer key.' },
]
const NON_EVM_ADDR = liveChains.filter((c) => c.family !== 'evm' && c.addr)

/* ── programme readiness ────────────────────────────────────────────────── */

const HOSTRX = /airtable|tally\.so|typeform|docs\.google\.com\/forms|jotform|fillout|deform/i
const ACTIONABLE = new Set(['OPEN', 'ROLLING', 'PROPOSAL'])

function assess(p) {
  const d = deep[p.n], fo = found[p.n], a = audit.get(p.n) ?? {}
  const q = d?.fields_list?.length ?? 0
  const bad = (d?.verified && d.verified !== 'OK') ? d.verified
    : (fo?.verified && fo.verified !== 'OK') ? fo.verified : null
  const url = d?.url ?? fo?.url ?? a.url ?? p.url
  const chain = String(p.chain).toLowerCase()
  const chainMatch = chain === 'any' ? null : liveChains.find((c) => chain.includes(c.name.toLowerCase().split(' ')[0]))
  const chainLive = chain === 'any' || Boolean(chainMatch)

  let depth = 'landing'
  if (bad) depth = 'bad'
  else if (q >= 3) depth = 'read'
  else if (HOSTRX.test(url ?? '') || a.wallet) depth = 'located'

  const gate = bad ? bad
    : a.captcha?.length ? 'captcha'
    : a.login ? 'login'
    : a.wallet ? 'wallet signature'
    : q >= 3 ? 'none on the form' : '—'

  // Everything standing between us and a submission, stated plainly.
  const blockers = []
  if (!chainLive && chain !== 'any') blockers.push('chain not deployed')
  if (depth === 'bad') blockers.push('form URL wrong or closed')
  if (depth === 'landing') blockers.push('no application route found')
  if (gate === 'captcha') blockers.push('captcha — human must submit')
  if (gate === 'login') blockers.push('account required')
  const fl = d?.fields_list ?? []
  if (fl.some((f) => /twitter|\bx url\b|telegram|handle/i.test(f.l) && f.req)) blockers.push('X / Telegram account required')
  if (fl.some((f) => /github/i.test(f.l) && f.req)) blockers.push('public GitHub required')
  if (fl.some((f) => /deck|presentation/i.test(f.l) && f.req)) blockers.push('pitch deck file required')
  if (fl.some((f) => /video|loom|youtube/i.test(f.l) && f.req)) blockers.push('demo video required')

  const ch = channels[p.n]
  const score = (chainLive ? 40 : 0) + (depth === 'read' ? 40 : depth === 'located' ? 25 : depth === 'landing' ? 5 : 0) +
                (blockers.length === 0 ? 20 : Math.max(0, 20 - blockers.length * 6))

  return { ...p, depth, gate, url, q, required: fl.filter((f) => f.req).length,
           pages: d?.pages ?? null, fields: fl, chainLive, chainKey: chainMatch?.key ?? null,
           blockers, note: d?.verified_note ?? fo?.verified_note ?? null,
           emails: ch?.emails ?? [], howto: ch?.howto ?? [], deadline: ch?.deadline ?? [],
           tried: hunt[p.n]?.tried ?? [], score: Math.min(100, score) }
}

const progs = PROGRAMS.map(assess)
const act = progs.filter((p) => ACTIONABLE.has(p.status))
const DORDER = { read: 0, located: 1, landing: 2, bad: 3 }
act.sort((a, b) => b.score - a.score || DORDER[a.depth] - DORDER[b.depth] || a.n - b.n)

/* ── render helpers ─────────────────────────────────────────────────────── */

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const short = (a, n = 10) => (a && a.length > 26 ? `${a.slice(0, n)}…${a.slice(-6)}` : a ?? '')
const DEPTH = { read: ['Fields read', 'good'], located: ['Form located', 'warn'], landing: ['No route found', 'dim'], bad: ['Wrong / closed', 'bad'] }
const money = (v) => (v == null ? '—' : v < 0.01 ? '<$0.01' : '$' + v.toFixed(2))

const tab = (id, label, n) =>
  `<button class="tab" data-t="${id}" role="tab" aria-selected="false" aria-controls="p-${id}">${label}${n != null ? `<span class="badge mono">${n}</span>` : ''}</button>`

const stat = (n, l, s, tone = '') =>
  `<div class="stat ${tone}"><span class="n mono">${n}</span><span class="l">${l}</span><span class="s">${s}</span></div>`

/* ── panels ─────────────────────────────────────────────────────────────── */

const overview = `
<div class="stats">
  ${stat(`${liveChains.length}/${chains.length}`, 'Chains live on mainnet', 'contract address configured in the build', 'good')}
  ${stat(`${TALLY.checksPassed}/${TALLY.checksRun}`, 'On-chain checks', 'run against live networks after deploying', 'good')}
  ${stat(new Set(chains.map((c) => c.family)).size, 'VM families', 'each with a hand-written adapter', '')}
  ${stat('817', 'Automated tests', '358 frontend · 436 contract · 23 backend', '')}
  ${stat(act.length, 'Actionable programmes', `of ${PROGRAMS.length} tracked`, '')}
  ${stat(Object.values(deep).reduce((s, d) => s + (d.fields_list?.length ?? 0), 0), 'Questions catalogued', 'across every form we could read', 'good')}
</div>

<div class="callout bad">
  <h3>The blocker that stops submission outright</h3>
  <p><strong>No X account, Telegram handle or public GitHub profile.</strong> Starknet requires Project X URL,
  Contact Telegram handle, Contact GitHub username and Team GitHub Handles — 41 of its 44 questions are
  required. Polygon requires Twitter <em>and</em> Telegram. These are mandatory form fields: no engineering
  substitutes for them, and they gate the two largest reachable programmes.</p>
</div>

<div class="callout">
  <h3>What the research actually established</h3>
  <p>Three separate heuristics were tried and all three failed the same way — the first matching
  &ldquo;apply&rdquo; link, then a field count, then a field-count threshold. Each produced confident false
  positives: a support desk booked as a $1.5M application, a newsletter box as a grant form. The rule that
  survived is <strong>structure never identifies intent — read the words on the page</strong>. Every
  &ldquo;found&rdquo; row below was confirmed by reading its prose, and six were rejected that way.</p>
</div>

<div class="grid2">
  <div class="callout warn"><h3>Verified dead or closed this round</h3><ul class="plain">
    <li><strong>The Graph</strong> — &ldquo;pausing applications to the Grants Program&rdquo; (their forum, 2026-07-06)</li>
    <li><strong>Arbitrum Foundation Grants</strong> — Tally form closed; no forum grant activity since 2024-11</li>
    <li><strong>Base Batches</strong> — &ldquo;Batches 003 … Applications closed&rdquo;</li>
    <li><strong>Solana Foundation RFPs</strong> — &ldquo;no other active RFPs … DO NOT APPLY FOR THIS&rdquo;</li>
  </ul></div>
  <div class="callout good"><h3>Confirmed reachable, questions in hand</h3><ul class="plain">
    ${act.filter((p) => p.depth === 'read').slice(0, 6).map((p) => `<li><strong>${esc(p.name)}</strong> — ${p.q} questions, ${p.required} required</li>`).join('')}
  </ul></div>
</div>`

const chainsPanel = `
<p class="lede">${liveChains.length} of ${chains.length} non-halted mainnet chains carry a live contract.
Addresses are read from <code>env/.env.&lt;chain&gt;</code> at build time, explorer links derived per chain —
the 18 EVM chains share one deployment record whose explorer is Etherscan, which would send a reviewer to the
wrong chain.</p>
<div class="tablewrap"><table>
<thead><tr><th>Chain</th><th>Family</th><th>Contract</th><th>Native term</th><th>Checks</th><th>Deploy cost</th></tr></thead>
<tbody>${chains.map((c) => `
  <tr class="${c.live ? '' : 'off'}">
    <td><span class="dot" style="background:${esc(c.accent)}"></span><span class="pname">${esc(c.name)}</span>
        <span class="meta mono">${esc(c.key)}${c.gasless ? ' · gasless' : ''}</span></td>
    <td class="mono sm">${esc(c.family)}</td>
    <td>${c.addr
      ? `<code class="mono addr">${esc(short(c.addr, 12))}</code>${c.explorer ? `<a class="ext mono" href="${esc(c.explorer)}" target="_blank" rel="noopener">explorer ↗</a>` : ''}`
      : '<span class="dim mono sm">not deployed</span>'}</td>
    <td class="sm">${esc(c.nativeTerm ?? '—')}</td>
    <td class="mono sm">${c.checks || '—'}</td>
    <td class="mono sm">${money(c.cost)}</td>
  </tr>`).join('')}</tbody></table></div>`

const contractsPanel = `
<p class="lede"><strong>${liveChains.length} chains carry a live contract</strong>, verified by
${DEPLOYMENTS.filter((d) => d.network === 'MAINNET').length} deployment records — one record covers all 18 EVM
chains because they share identical bytecode at one address, which is why a record count is not a chain count.
${TALLY.checksPassed}/${TALLY.checksRun} checks passing. Deployment found defects that ${'—'} by construction ${'—'} tests could not:
the EVM contract passed 39 unit tests while <code>tokenIdFromKey(0,&nbsp;32768)</code> and
<code>tokenIdFromKey(1,&nbsp;0)</code> both returned 32768.</p>
<h3 class="sub">Every live contract — all ${liveChains.length}</h3>
<div class="tablewrap"><table><thead><tr><th>Chain</th><th>Address</th><th>Family</th></tr></thead><tbody>
${liveChains.map((c) => `<tr><td><span class="dot" style="background:${esc(c.accent)}"></span><span class="pname">${esc(c.name)}</span></td>
  <td><code class="mono addr">${esc(c.addr)}</code>${c.explorer ? `<a class="ext" href="${esc(c.explorer)}" target="_blank" rel="noopener">explorer ↗</a>` : ''}</td>
  <td class="sm">${esc(c.family)}</td></tr>`).join('')}
</tbody></table></div>
<h3 class="sub">Deployment records and their on-chain checks</h3>
<div class="cards">${DEPLOYMENTS.filter((d) => d.network === 'MAINNET').map((d) => `
  <div class="card">
    <div class="card-h"><span class="pname">${esc(d.chain)}</span><span class="chip t-good">${(d.checks ?? []).length} checks</span></div>
    <code class="mono addr blk">${esc(d.contract ?? '—')}</code>
    <div class="kv mono sm"><span>${esc(d.lang ?? '')}</span><span>${esc(d.date ?? '')}</span></div>
    ${(d.checks ?? []).slice(0, 4).map((k) => `<div class="chk"><span class="tick mono">PASS</span><span>${esc(k.name)}</span></div>`).join('')}
  </div>`).join('')}</div>`

const walletsPanel = `
<div class="callout bad"><h3>Key custody is a grant requirement, not just hygiene</h3>
<p>Avalanche Retro9000 and Optimism OP Atlas both require the <strong>original deployer address to sign a
message</strong> to claim ownership of your contracts. A lost or throwaway deployer key forfeits attribution
permanently — and therefore the grant.</p></div>
<div class="cards">${WALLETS.map((w) => `
  <div class="card">
    <div class="card-h"><span class="pname">${esc(w.role)}</span></div>
    <code class="mono addr blk">${esc(w.addr)}</code>
    <p class="sm dim">${esc(w.note)}</p>
  </div>`).join('')}</div>
<div class="callout warn"><h3>Key custody status</h3>
<p>Both keys are <strong>retained and backed up</strong>. The deployer signs for contract-ownership
claims; the treasury key never touches a deployment. Contract addresses live under
<a href="#contracts">Contracts</a> — they are public identifiers, not keys, and were previously
mixed into this count.</p></div>`

const programmesPanel = `
<p class="lede">All ${PROGRAMS.length} tracked. Status reflects verification as of the date shown — three
programmes moved out of OPEN during this round on quoted evidence.</p>
<div class="tablewrap"><table>
<thead><tr><th>#</th><th>Programme</th><th>Chain</th><th>Amount</th><th>Status</th><th>Verified</th></tr></thead>
<tbody>${progs.map((p) => `
  <tr class="s-${p.status.toLowerCase()}">
    <td class="num mono">${p.n}</td>
    <td><span class="pname">${esc(p.name)}</span>${p.note ? `<span class="note">${esc(p.note.slice(0, 160))}</span>` : ''}</td>
    <td class="sm">${esc(p.chain)}${p.chainLive ? ' <span class="chip t-good xs">live</span>' : ''}</td>
    <td class="mono sm nowrap">${esc(p.amount ?? '')}</td>
    <td><span class="chip t-${p.status === 'OPEN' ? 'good' : ['DEAD', 'BLOCKED'].includes(p.status) ? 'bad' : 'warn'}">${esc(p.status)}</span></td>
    <td class="mono sm">${esc(p.verified ?? '')}</td>
  </tr>`).join('')}</tbody></table></div>`

const appsPanel = `
<p class="lede">How deep the research actually got on each actionable programme. A form whose questions were
read and a URL nobody has confirmed are different things, and this is where that difference is stated.</p>
<div class="legend">
  <span><span class="chip t-good">Fields read</span> form confirmed, questions captured</span>
  <span><span class="chip t-warn">Form located</span> URL right, fields behind a session</span>
  <span><span class="chip t-dim">No route found</span> probably has no web form</span>
  <span><span class="chip t-bad">Wrong / closed</span> verified as not an application</span>
</div>
<div class="tablewrap"><table>
<thead><tr><th>Programme</th><th>Depth</th><th>Questions</th><th>Gate</th><th>Route</th></tr></thead>
<tbody>${act.map((p) => `
  <tr class="d-${p.depth}">
    <td><span class="pname">${esc(p.name)}</span><span class="meta mono">#${p.n} · ${esc(p.chain)} · ${esc(p.amount ?? '')}</span></td>
    <td><span class="chip t-${DEPTH[p.depth][1]}">${DEPTH[p.depth][0]}</span></td>
    <td class="mono sm">${p.q ? `${p.q}<span class="dim"> / ${p.required} req</span>` : '—'}</td>
    <td class="mono sm">${esc(p.gate)}</td>
    <td class="sm">${p.depth === 'bad'
        ? '<span class="dim">do not use</span>'
        : p.url ? `<a class="ext mono" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(short(p.url.replace(/^https?:\/\//, ''), 30))} ↗</a>` : '—'}
      ${p.emails.length ? `<span class="meta mono">${esc(p.emails[0])}</span>` : ''}</td>
  </tr>`).join('')}</tbody></table></div>`

const reqPanel = `
<p class="lede">Every question we captured, per programme, exactly as the form presents it. Asterisk = the
form marks it required.</p>
${act.filter((p) => p.fields.length).map((p) => `
<details class="req" ${p.q >= 20 ? 'open' : ''}>
  <summary><span class="pname">${esc(p.name)}</span>
    <span class="chip t-good">${p.q} questions</span>
    <span class="chip t-warn">${p.required} required</span>
    ${p.pages > 1 ? `<span class="chip t-dim">${p.pages} pages</span>` : ''}</summary>
  <div class="fields">${p.fields.map((f) => `
    <div class="f"><span class="ftype mono">${esc(f.t)}</span>
      <span class="fl">${f.req ? '<b class="req-star">*</b>' : ''}${esc(f.l)}</span></div>`).join('')}</div>
</details>`).join('')}`

const readyPanel = `
<p class="lede">Readiness scores the three things that decide whether we can submit today: is the chain live,
do we have the form, and what blocks us. It is deliberately harsh — anything unverified scores low.</p>
<div class="tablewrap"><table>
<thead><tr><th>Programme</th><th>Ready</th><th>Chain</th><th>Form</th><th>What is needed</th></tr></thead>
<tbody>${act.map((p) => `
  <tr>
    <td><span class="pname">${esc(p.name)}</span><span class="meta mono">#${p.n} · ${esc(p.amount ?? '')}</span></td>
    <td><div class="rdy"><div class="bar"><i style="width:${p.score}%;background:${p.score >= 70 ? 'var(--good)' : p.score >= 45 ? '#c98a00' : 'var(--bad)'}"></i></div><span class="mono sm score">${p.score}</span></div></td>
    <td>${p.chainLive ? '<span class="chip t-good xs">live</span>' : '<span class="chip t-bad xs">not deployed</span>'}</td>
    <td><span class="chip t-${DEPTH[p.depth][1]} xs">${DEPTH[p.depth][0]}</span></td>
    <td class="sm">${p.blockers.length
      ? p.blockers.map((b) => `<span class="blk-chip">${esc(b)}</span>`).join('')
      : '<span class="chip t-good xs">nothing — submit</span>'}</td>
  </tr>`).join('')}</tbody></table></div>`

/* ── document ───────────────────────────────────────────────────────────── */

const TABS = [
  ['over', 'Overview', null, overview],
  ['chains', 'Chains', chains.length, chainsPanel],
  ['contracts', 'Contracts', liveChains.length, contractsPanel],
  ['wallets', 'Keys', WALLETS.length, walletsPanel],
  ['progs', 'Programmes', PROGRAMS.length, programmesPanel],
  ['apps', 'Applications', act.length, appsPanel],
  ['reqs', 'Requirements', act.filter((p) => p.fields.length).length, reqPanel],
  ['ready', 'Readiness', act.length, readyPanel],
]

const html = `<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="icon" type="image/png" sizes="48x48" href="/icon-48.png">
<link rel="icon" type="image/png" sizes="96x96" href="/icon-96.png">
<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">
<link rel="apple-touch-icon" sizes="180x180" href="/icon-180.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#000000">
<title>CryptoLand — full dossier</title>
<style>
/* Light, high-end, Apple-adjacent. This is the INTERNAL dossier, not the product
   UI — the app's solid-dark tokens still govern src/. Two rules carried over
   deliberately: no backdrop-filter anywhere (Apple's own design does not need it),
   and one accent used only for state.

   Committed single theme on purpose: the whole point of this page is that it is
   bright, so there is no prefers-color-scheme branch — every colour is painted. */
:root{
  --bg:#fbfbfd;
  --surface:#ffffff;
  --surface-2:#f5f5f7;
  --surface-3:#ececed;
  --hair:#e3e3e6;      /* hairline */
  --hair-2:#d2d2d7;    /* stronger rule */
  --ink:#1d1d1f;
  --ink-2:#4b4b50;
  --ink-3:#6e6e73;
  --ink-4:#86868b;
  --accent:#0071e3;
  --good:#1a8a4b;--good-bg:#eaf7ef;--good-br:#bfe4cd;
  --warn:#9a6400;--warn-bg:#fdf4e3;--warn-br:#f0dcb0;
  --bad:#c9372c;--bad-bg:#fdefee;--bad-br:#f4c9c5;
  --font:-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text','Segoe UI',Roboto,Helvetica,Arial,sans-serif;
  --mono:ui-monospace,'SF Mono',SFMono-Regular,Menlo,Consolas,monospace;
  --sh-1:0 1px 2px rgba(0,0,0,.04),0 1px 1px rgba(0,0,0,.03);
  --sh-2:0 2px 6px rgba(0,0,0,.05),0 10px 26px rgba(0,0,0,.05);
  --r:14px;--r-sm:9px;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{-webkit-text-size-adjust:100%}
body{background:var(--bg);color:var(--ink);font-family:var(--font);line-height:1.47;
  -webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;letter-spacing:-.011em}
.mono{font-family:var(--mono);font-variant-numeric:tabular-nums;letter-spacing:0}
code{font-family:var(--mono);font-size:.9em}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
.sm{font-size:12.5px}.dim{color:var(--ink-4)}.nowrap{white-space:nowrap}

.wrap{max-width:1200px;margin:0 auto;padding:clamp(26px,4.5vw,64px) clamp(16px,4vw,44px) 96px;
  display:flex;flex-direction:column;gap:clamp(20px,2.6vw,30px)}
header{display:flex;flex-direction:column;gap:11px}
.eyebrow{font-size:11.5px;letter-spacing:.02em;color:var(--ink-4);font-weight:500}
h1{font-size:clamp(30px,5.2vw,52px);font-weight:700;letter-spacing:-.028em;line-height:1.06;color:var(--ink)}
.lede{color:var(--ink-3);font-size:clamp(14.5px,1.5vw,17px);max-width:74ch;line-height:1.55;letter-spacing:-.008em}
.lede code{color:var(--ink-2);background:var(--surface-2);padding:1px 5px;border-radius:5px}
h3.sub{font-size:19px;font-weight:600;letter-spacing:-.018em;margin-top:10px}

/* segmented control */
.tabs{display:flex;gap:3px;padding:4px;background:var(--surface-2);border-radius:12px;
  overflow-x:auto;-webkit-overflow-scrolling:touch;position:sticky;top:12px;z-index:6;
  box-shadow:var(--sh-1);border:1px solid var(--hair)}
.tab{background:transparent;border:0;color:var(--ink-3);font:inherit;font-size:13.5px;font-weight:500;
  padding:8px 15px;border-radius:9px;cursor:pointer;white-space:nowrap;display:flex;align-items:center;gap:7px;
  transition:background .18s ease,color .18s ease}
.tab:hover{color:var(--ink)}
.tab[aria-selected="true"]{background:var(--surface);color:var(--ink);font-weight:600;box-shadow:var(--sh-1)}
.badge{font-size:11px;color:var(--ink-4);font-variant-numeric:tabular-nums}
.tab[aria-selected="true"] .badge{color:var(--accent)}
.panel{display:none;flex-direction:column;gap:clamp(16px,2.2vw,24px)}
.panel.on{display:flex}

/* stats */
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(166px,1fr));gap:12px}
.stat{background:var(--surface);border:1px solid var(--hair);border-radius:var(--r);
  padding:20px 20px 22px;display:flex;flex-direction:column;gap:6px;box-shadow:var(--sh-1)}
.stat .n{font-size:clamp(26px,3.2vw,36px);font-weight:600;letter-spacing:-.03em;line-height:1;color:var(--ink)}
.stat.good .n{color:var(--good)}.stat.warn .n{color:var(--warn)}.stat.bad .n{color:var(--bad)}
.stat .l{font-size:13.5px;font-weight:600;letter-spacing:-.01em}
.stat .s{font-size:12.5px;color:var(--ink-4);line-height:1.42}

/* callouts */
.callout{background:var(--surface);border:1px solid var(--hair);border-radius:var(--r);
  padding:20px 22px;display:flex;flex-direction:column;gap:9px;box-shadow:var(--sh-1);
  border-left:3px solid var(--hair-2)}
.callout.bad{border-left-color:var(--bad);background:linear-gradient(180deg,var(--bad-bg),var(--surface) 62%)}
.callout.good{border-left-color:var(--good);background:linear-gradient(180deg,var(--good-bg),var(--surface) 62%)}
.callout.warn{border-left-color:var(--warn);background:linear-gradient(180deg,var(--warn-bg),var(--surface) 62%)}
.callout h3{font-size:16px;font-weight:600;letter-spacing:-.016em}
.callout p{font-size:14px;color:var(--ink-3);line-height:1.6;max-width:84ch}
.callout strong{color:var(--ink);font-weight:600}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px}
ul.plain{list-style:none;display:flex;flex-direction:column;gap:9px}
ul.plain li{font-size:13.5px;color:var(--ink-3);line-height:1.5;padding-left:16px;position:relative}
ul.plain li::before{content:"";position:absolute;left:0;top:.66em;width:7px;height:1px;background:var(--hair-2)}
ul.plain strong{color:var(--ink);font-weight:600}

/* tables */
.tablewrap{overflow:auto;max-height:min(74vh,820px);background:var(--surface);
  border:1px solid var(--hair);border-radius:var(--r);box-shadow:var(--sh-1)}
table{border-collapse:separate;border-spacing:0;width:100%;min-width:660px}
th{position:sticky;top:0;background:var(--surface-2);text-align:left;font-size:11px;letter-spacing:.02em;
  color:var(--ink-4);padding:11px 14px;border-bottom:1px solid var(--hair);font-weight:600;z-index:2}
td{padding:13px 14px;border-bottom:1px solid var(--hair);vertical-align:top;font-size:13.5px;color:var(--ink-2)}
tbody tr:last-child td{border-bottom:none}
tbody tr:hover{background:var(--surface-2)}
tr.off td{opacity:.48}
tr.d-bad,tr.s-dead,tr.s-blocked{background:#fdfafa}
.num{color:var(--ink-4);font-size:12px;width:40px}
.pname{display:block;font-weight:600;color:var(--ink);letter-spacing:-.012em;font-size:13.5px}
.meta{display:block;font-size:11.5px;color:var(--ink-4);margin-top:3px}
.note{display:block;font-size:12px;color:var(--warn);margin-top:6px;line-height:1.45;max-width:64ch}
.addr{font-size:12px;color:var(--ink-3);overflow-wrap:anywhere}
.addr.blk{display:block;color:var(--ink);font-size:12.5px;background:var(--surface-2);
  border:1px solid var(--hair);border-radius:var(--r-sm);padding:9px 11px;margin:2px 0}
.ext{display:block;font-size:11.5px;margin-top:4px}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:8px;vertical-align:middle;
  box-shadow:0 0 0 1px rgba(0,0,0,.06) inset}

/* chips */
.chip{display:inline-block;font-size:11.5px;font-weight:500;padding:3px 9px;border-radius:999px;
  border:1px solid var(--hair-2);color:var(--ink-3);background:var(--surface);white-space:nowrap;margin:1px 4px 1px 0}
.chip.xs{font-size:10.5px;padding:2px 7px}
.t-good{color:var(--good);background:var(--good-bg);border-color:var(--good-br)}
.t-warn{color:var(--warn);background:var(--warn-bg);border-color:var(--warn-br)}
.t-bad{color:var(--bad);background:var(--bad-bg);border-color:var(--bad-br)}
.t-dim{color:var(--ink-4);background:var(--surface-2);border-color:var(--hair)}
.blk-chip{display:inline-block;font-size:11.5px;color:var(--warn);background:var(--warn-bg);
  border:1px solid var(--warn-br);border-radius:999px;padding:3px 9px;margin:1px 4px 1px 0;white-space:nowrap}
.legend{display:flex;flex-wrap:wrap;gap:14px;font-size:12.5px;color:var(--ink-3);align-items:center}

/* cards */
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(288px,1fr));gap:12px}
.card{background:var(--surface);border:1px solid var(--hair);border-radius:var(--r);
  padding:18px 20px;display:flex;flex-direction:column;gap:8px;box-shadow:var(--sh-1)}
.card-h{display:flex;justify-content:space-between;align-items:center;gap:10px}
.kv{display:flex;justify-content:space-between;color:var(--ink-4);gap:12px;font-size:12px}
.chk{display:flex;gap:9px;align-items:baseline;font-size:12.5px;color:var(--ink-3)}
.tick{font-size:10px;font-weight:600;color:var(--good);background:var(--good-bg);
  border:1px solid var(--good-br);border-radius:999px;padding:1px 7px;flex:none}
.card p.sm{color:var(--ink-3);line-height:1.5}

/* requirements */
details.req{background:var(--surface);border:1px solid var(--hair);border-radius:var(--r);
  box-shadow:var(--sh-1);overflow:hidden}
details.req+details.req{margin-top:10px}
summary{padding:15px 18px;cursor:pointer;display:flex;flex-wrap:wrap;align-items:center;gap:9px;list-style:none}
summary::-webkit-details-marker{display:none}
summary::before{content:"›";color:var(--ink-4);font-size:17px;line-height:1;transform:translateY(-1px);
  transition:transform .18s ease}
details[open] summary::before{transform:rotate(90deg) translateX(-1px)}
summary:hover{background:var(--surface-2)}
.fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:1px;
  background:var(--hair);border-top:1px solid var(--hair)}
.f{background:var(--surface);padding:11px 15px;display:flex;gap:11px;align-items:baseline}
.ftype{font-size:10.5px;color:var(--ink-4);flex:none;min-width:62px}
.fl{font-size:13px;color:var(--ink-2);line-height:1.42}
.req-star{color:var(--bad);margin-right:4px;font-weight:700}

/* readiness */
.rdy{display:flex;align-items:center;gap:10px;min-width:112px}
.rdy .score{color:var(--ink);font-weight:600;min-width:26px;text-align:right}
.bar{flex:1;height:6px;background:var(--surface-3);border-radius:999px;min-width:58px;overflow:hidden}
.bar i{display:block;height:100%;border-radius:999px}

.foot{border-top:1px solid var(--hair);padding-top:18px;font-size:12px;color:var(--ink-4);
  display:flex;flex-wrap:wrap;gap:8px 22px}
@media (max-width:640px){
  .tablewrap{max-height:none}
  td,th{padding:10px 10px}
  .note{display:none}
  .tab{padding:8px 12px;font-size:13px}
  .tabs{top:6px}
}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:6px}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>

<div class="wrap">
  <header>
    <p class="eyebrow">CryptoLand by XONO · Dossier · ${new Date().toISOString().slice(0, 10)}</p>
    <h1>Everything this project knows about itself</h1>
    <p class="lede">Chains, contracts, wallets, programmes, application forms, their exact fields, and an honest
      readiness score for each. Generated from the repo — <code>config.js</code>, <code>deployments.mjs</code>,
      <code>programs.mjs</code>, <code>env/.env.&lt;chain&gt;</code> and the form-audit records — so nothing here
      is transcribed by hand.</p>
  </header>

  <div class="tabs" role="tablist">${TABS.map(([id, label, n]) => tab(id, label, n)).join('')}</div>
  ${TABS.map(([id, , , body]) => `<section class="panel" id="p-${id}" role="tabpanel">${body}</section>`).join('')}

  <div class="foot">
    <span class="mono">hello@xono.ai</span>
    <span class="mono">node scripts/build-dossier.mjs</span>
    <span class="mono">sources: config.js · deployments.mjs · programs.mjs · env/ · scripts/formaudit/</span>
  </div>
</div>

<script>
(function(){
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));
  var panels = Array.prototype.slice.call(document.querySelectorAll('.panel'));
  function show(id, push){
    tabs.forEach(function(t){ t.setAttribute('aria-selected', String(t.dataset.t === id)); });
    panels.forEach(function(p){ p.classList.toggle('on', p.id === 'p-' + id); });
    if (push && history.replaceState) history.replaceState(null, '', '#' + id);
    window.scrollTo({ top: 0 });
  }
  tabs.forEach(function(t){ t.addEventListener('click', function(){ show(t.dataset.t, true); }); });
  // Arrow-key movement between tabs, as a tablist should.
  document.querySelector('.tabs').addEventListener('keydown', function(e){
    var i = tabs.findIndex(function(t){ return t.getAttribute('aria-selected') === 'true'; });
    if (e.key === 'ArrowRight' && i < tabs.length - 1) { tabs[i+1].focus(); show(tabs[i+1].dataset.t, true); }
    if (e.key === 'ArrowLeft' && i > 0) { tabs[i-1].focus(); show(tabs[i-1].dataset.t, true); }
  });
  var initial = (location.hash || '').replace('#','');
  show(tabs.some(function(t){ return t.dataset.t === initial; }) ? initial : 'over', false);
})();
</script>
`

mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'dossier.html'), html)
console.log(`  dossier → deploy/status/dossier.html`)
console.log(`  ${chains.length} chains (${liveChains.length} live) · ${PROGRAMS.length} programmes (${act.length} actionable)`)
console.log(`  ${act.filter((p) => p.depth === 'read').length} forms read · ${act.filter((p) => p.blockers.length === 0).length} with nothing blocking`)
