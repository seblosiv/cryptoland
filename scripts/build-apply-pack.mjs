#!/usr/bin/env node
/**
 * build-apply-pack.mjs — a ready-to-paste answer sheet per grant programme.
 *
 *   node scripts/build-apply-pack.mjs          # every actionable programme
 *   node scripts/build-apply-pack.mjs 57       # just Rootstock
 *
 * WHY THIS EXISTS.
 * The zendriver sweep (documentation/program-requirements.md §18) recorded the
 * real fields of every reachable application form. Eleven of those forms sit
 * behind a captcha, which gates the *submit click* — not the answers. So the
 * expensive part of applying (assembling correct, chain-specific, verifiable
 * copy) is fully automatable and the cheap part is not.
 *
 * This emits one Markdown file per programme containing the actual field list
 * from the audit, each with a drafted answer built from repo data — the chain's
 * own `grantAngle`, its live contract, its post-deployment checks. Open the form,
 * paste down the page, solve the captcha, submit.
 *
 * Everything is READ, never typed: a wrong contract address in an application is
 * a reviewer checking a dead address on a live chain.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'deploy', 'apply')
const AUDIT = join(ROOT, 'scripts', 'formaudit', 'results-2026-08-11.jsonl')

const { CHAINS, MAINNET_CHAINS } = await import(join(ROOT, 'src/lib/blockchain/config.js'))
const { PROFILES } = await import(join(ROOT, 'src/config/profiles.js'))
const { DEPLOYMENTS, deploymentTally } = await import(join(ROOT, 'deploy/apex/deployments.mjs'))
const { PROGRAMS } = await import(join(ROOT, 'deploy/apex/programs.mjs'))

const TALLY = deploymentTally()

/* ── repo facts ─────────────────────────────────────────────────────────── */

const LIVE = {}
for (const c of MAINNET_CHAINS) {
  const f = join(ROOT, 'env', `.env.${c.key}`)
  if (!existsSync(f)) continue
  const k = c.key.toUpperCase().replace(/-/g, '_')
  const m = readFileSync(f, 'utf8').match(new RegExp(`^VITE_CONTRACT_${k}=(.+)$`, 'm'))
  if (m && m[1].trim()) LIVE[c.key] = m[1].trim()
}
const LIVE_COUNT = Object.keys(LIVE).length

/** The audit record for a programme — prefer the second-hop form (n + 1000). */
const audit = new Map()
for (const line of readFileSync(AUDIT, 'utf8').trim().split('\n')) {
  const r = JSON.parse(line)
  const key = r.n % 1000
  const prev = audit.get(key)
  // A record with real fields beats one without; the form hop beats the landing page.
  if (!prev || (r.nFields ?? 0) > (prev.nFields ?? 0)) audit.set(key, r)
}

// The crawl located the REAL application URL for programmes whose landing page
// linked only to docs or a support widget. These win over the audit record: a
// form host reached by crawling is the application, even when its fields render
// inside an iframe we cannot read from the top document.
// deep-forms.json wins over forms-found.json: it is the paginated read that walks
// a Typeform screen by screen and scrolls an Airtable to the bottom, so it holds
// the WHOLE question list rather than the first screen.
const FOUND = join(ROOT, 'scripts', 'formaudit', 'forms-found.json')
const DEEP = join(ROOT, 'scripts', 'formaudit', 'deep-forms.json')
for (const src of [FOUND, DEEP]) {
  if (!existsSync(src)) continue
  for (const [k, f] of Object.entries(JSON.parse(readFileSync(src, 'utf8')))) {
    const n = Number(k)
    const prev = audit.get(n) ?? {}
    // Never trade a longer question list for a shorter one.
    const better = (f.fields_list?.length ?? 0) >= (prev.nFields ?? 0)
    audit.set(n, {
      ...prev,
      url: f.url,
      captcha: (Array.isArray(f.captcha) ? f.captcha.length : f.captcha) ? ['recaptcha'] : [],
      fields: better ? (f.fields_list ?? prev.fields ?? []) : prev.fields,
      nFields: better ? (f.fields_list?.length ?? prev.nFields ?? 0) : prev.nFields,
      pages: f.pages ?? prev.pages,
      viaCrawl: f.via ?? 'deep-read',
      // Screenshot-verified verdicts must survive the merge, or a URL confirmed
      // to be the wrong form still renders as a normal, usable sheet.
      verified: f.verified ?? prev.verified,
      verified_note: f.verified_note ?? prev.verified_note,
      verified_on: f.verified_on ?? prev.verified_on,
    })
  }
}

/** Match a programme's `chain` string to a CHAINS entry. */
function chainFor(p) {
  const s = String(p.chain).toLowerCase()
  if (s === 'any') return null
  return MAINNET_CHAINS.find((c) => s.includes(c.name.toLowerCase().split(' ')[0])) ?? null
}

const recordFor = (c) =>
  DEPLOYMENTS.find((d) => d.network === 'MAINNET' && d.chain.toLowerCase() === c.name.toLowerCase()) ??
  (c.family === 'evm' ? DEPLOYMENTS.find((d) => d.network === 'MAINNET' && d.chain.startsWith('EVM')) : null)

/* ── the answers ────────────────────────────────────────────────────────── */

const ONE_LINER =
  'CryptoLand is a map of the real world divided into 268,435,456 tiles that players claim, upgrade, trade, raid and govern as NFTs.'

function answers(p) {
  const c = chainFor(p)
  const prof = c ? (PROFILES[c.key] ?? {}) : {}
  const ob = prof.onboarding ?? {}
  const rec = c ? recordFor(c) : null
  const contract = c ? LIVE[c.key] : null
  const name = c ? c.name : 'multiple chains'

  const whyChain = c
    ? (ob.grantAngle ?? prof.pitch ?? `Built natively for ${name}.`) +
      ` A tile is ${ob.nativeTerm ?? 'an NFT'} on ${name}, held in the player's own wallet.` +
      ` The build is compiled for ${name} alone — its wallets, its token standard, its vocabulary — and ships on its own domain. There is no chain switcher.`
    : 'CryptoLand ships as a separate chain-native build per ecosystem rather than one multi-chain app, so each ecosystem gets a first-class native client.'

  // The 18 EVM chains share ONE deployment record, whose `explorer` is Etherscan.
  // Quoting that to a Rootstock reviewer sends them to the wrong chain's explorer
  // to look up an address that is not there, so EVM links are derived from the
  // chain's own explorerUrl instead.
  const explorer = c && contract
    ? (c.family === 'evm' ? `${c.explorerUrl}/address/${contract}` : rec?.explorer ?? null)
    : null

  const checkLine = rec?.checks?.length
    ? `\nVerified after deployment with ${rec.checks.length} on-chain checks, all passing: ` +
      rec.checks.slice(0, 3).map((k) => k.name).join('; ') + '.'
    : ''

  const evidence = contract
    ? `Live on ${name} mainnet at \`${contract}\`.` +
      (explorer ? ` Explorer: ${explorer}` : '') + checkLine
    : `Contract compiled and unit-tested; not yet deployed to ${name} mainnet.`

  return {
    'Project name': 'CryptoLand (by XONO)',
    'One-liner': ONE_LINER,
    'Website': c ? `https://${c.key}.xono.ai` : 'https://xono.ai',
    'What it does': `${ONE_LINER}\n\nThe loop is: claim a tile anywhere on Earth, customise it, trade it on an in-game marketplace, raid a neighbour with an AI Guardian, and vote on governance with weight derived from tiles owned. All of it runs today — map, purchase, customisation, marketplace, guardians, raids, DAO voting, affiliate payouts and crypto checkout.`,
    [`Why ${name}`]: whyChain,
    'On-chain evidence': evidence,
    'Traction (state honestly)':
      `Contracts are live; players are not, and we say so. Real: ${LIVE_COUNT} mainnet contracts with ${TALLY.checksPassed}/${TALLY.checksRun} on-chain checks passing, a complete playable game loop, and a live \`GET /metrics/grant\` endpoint a reviewer can query directly. Seeded: every world is pre-seeded so no build opens on an empty map, and those holders are generated addresses, not users. Any number we quote is labelled organic or seeded.`,
    'Multichain, stated plainly': (() => {
      const c = chainFor(p)
      const n = c ? c.name : 'this chain'
      return `Yes — CryptoLand ships a separate chain-native build per ecosystem, and ${LIVE_COUNT} carry a live mainnet contract today. We say so up front rather than let a reviewer discover it.\n\n` +
        `What that does NOT mean is a chain switcher with ${n} as one entry in a dropdown. Each build is compiled for one chain only — its wallets, its token standard, its vocabulary, its own domain — so a ${n} player never sees another chain's branding, tiles or stats. The portability is an engineering property of how we build, not a hedge on where we commit.\n\n` +
        `Treat the ${LIVE_COUNT} deployments as evidence the team ships and finishes, and judge the ${n} build on its own.`
    })(),
    'Team':
      'Small independent team. Engineering track record on this project: ' +
      `${LIVE_COUNT} mainnet deployments across ${new Set(MAINNET_CHAINS.filter((x) => !x.halted).map((x) => x.family)).size} distinct VM families, each with a hand-written adapter, reached for roughly $65 total. The Solana program was rewritten no_std from 207,488 bytes to 2,816 — $109 of rent down to $1.58.`,
    'Use of funds':
      '1) Move the daily loop on-chain — check-in, upgrade and raid resolution become transactions rather than database writes. This is the single change that makes activity-scored and retroactive rounds winnable. ' +
      '2) Player acquisition on one chain, reported as organic numbers kept separate from seed data. ' +
      '3) External audit of the claim, marketplace and payout paths before volume arrives. ' +
      '4) Publish the metrics endpoint as a public page so the funder can check progress without asking us.',
    'Amount requested': p.amount ? `Aligned to this programme's range (${p.amount}).` : 'To be scoped.',
    'Open source': 'MIT licensed. Repository published; the chain adapter layer is the reusable public-good component.',
    'Contact': 'seblosiv@gmail.com',
  }
}

/* ── render ─────────────────────────────────────────────────────────────── */

/** Best-guess answer for a field label, else a marked TODO. */
function answerFor(label, a) {
  const l = label.toLowerCase()
  const pick = (...keys) => keys.map((k) => a[k]).find(Boolean)
  if (/first name/.test(l)) return 'Sebastian'
  if (/last name|surname/.test(l)) return 'Losiv'
  if (/^name\b|full name|your name|founder/.test(l)) return 'Sebastian Losiv'
  if (/e-?mail/.test(l)) return a.Contact
  if (/company|project name|organisation|organization/.test(l)) return a['Project name']
  if (/github/.test(l)) return 'https://github.com/ (repository — confirm the public URL before submitting)'
  if (/website|url|link/.test(l) && !/video|deck|linkedin|twitter|github|\bx\b/.test(l)) return a.Website
  if (/one.?liner|tagline|short desc|summary/.test(l)) return a['One-liner']
  if (/describe|what does|about the project|problem|solution|overview/.test(l)) return a['What it does']
  // "Integrated chains" / "Arbitrum native or multichain?" is a FACTUAL question,
  // and it is §0's monogamy problem as a required field. Answer it straight, then
  // reframe — a reviewer who finds the other chains later reads it as concealment.
  if (/integrated chains|other chains|multichain|chains (you|supported)/.test(l)) return a['Multichain, stated plainly']
  if (/why|ecosystem/.test(l)) return pick(...Object.keys(a).filter((k) => k.startsWith('Why')))
  if (/chain/.test(l) && !/blockchain address|chain id/.test(l)) return pick(...Object.keys(a).filter((k) => k.startsWith('Why')))
  if (/traction|users|metrics|progress/.test(l)) return a['Traction (state honestly)']
  if (/team|experience|background|founders/.test(l)) return a.Team
  if (/fund|budget|milestone|use of/.test(l)) return a['Use of funds']
  if (/amount|requested|grant size/.test(l)) return a['Amount requested']
  if (/open source|licen/.test(l)) return a['Open source']
  if (/contract|address|deploy/.test(l)) return a['On-chain evidence']
  if (/location|country/.test(l)) return 'Remote'
  if (/\bx url\b|\bx\.com|twitter|telegram|discord|handle|tg group|signatory/.test(l)) return '⚠️ NOT AVAILABLE — no account exists yet. This is a hard blocker on forms where it is required.'
  if (/deck|presentation|pitch/.test(l)) return 'Attach deploy/deck/<chain>.html printed to PDF (⌘P → landscape).'
  if (/video|demo|loom|youtube/.test(l)) return '⚠️ TODO — no demo video recorded yet.'
  if (/date|when/.test(l)) return '2026'
  return '⚠️ TODO — no drafted answer; read the question and write one.'
}

function render(p) {
  const a = answers(p)
  const r = audit.get(p.n)
  const c = chainFor(p)
  const fields = (r?.fields ?? []).filter(
    (f) => f.l && f.l.length > 2 && !['checkbox', 'radio'].includes(f.t) && !/search|select\.\.\./i.test(f.l),
  )

  // A URL verified as the wrong form or a closed one must say so loudly — a sheet
  // that silently points at a support widget wastes a submission slot.
  const bad = r?.verified && r.verified !== 'OK'
  const gate = bad
    ? `⛔ **${r.verified}** — ${r.verified_note} Verified ${r.verified_on}. **Do not use this URL.**`
    : r?.captcha?.length
    ? `🔴 **CAPTCHA (${r.captcha.join(', ')})** — a human must solve it and press submit. Everything below is ready to paste.`
    : r?.login
      ? '🔑 **SSO login required** — sign in first, then paste.'
      : r?.wallet
        ? '🔑 **Wallet signature required** — connect the retained deployer key, then paste.'
        : '✅ No gate detected on the form itself.'

  const L = []
  L.push(`# ${p.name}`)
  L.push('')
  L.push(`| | |`)
  L.push(`|---|---|`)
  L.push(`| Programme | #${p.n} · ${p.status} · ${p.amount ?? '?'} |`)
  L.push(`| Chain | ${p.chain}${c && LIVE[c.key] ? ' — live on mainnet' : ''} |`)
  L.push(`| Form | ${r?.url ?? p.url} |`)
  L.push(`| Gate | ${gate.replace(/\|/g, '/')} |`)
  if (p.note) L.push(`| Note | ${p.note.replace(/\|/g, '/')} |`)
  L.push('')

  if (fields.length) {
    L.push(`## Fields, as the form actually presents them (${fields.length})`)
    L.push('')
    for (const f of fields) {
      L.push(`### ${f.l}${f.req ? ' *(required)*' : ''}`)
      L.push(`\`${f.t}\``)
      L.push('')
      L.push(answerFor(f.l, a))
      L.push('')
    }
  } else {
    L.push('## Fields')
    L.push('')
    L.push('_No readable application fields at this URL — the page is gated, the form is in an iframe, or **this is not the application form at all** (several programmes\' "apply" links land on a support widget or a docs page). Find the real URL by hand, then use the prepared answers below._')
    L.push('')
  }

  L.push('## Prepared answers (use for anything not matched above)')
  L.push('')
  for (const [k, v] of Object.entries(a)) {
    L.push(`### ${k}`)
    L.push(v)
    L.push('')
  }
  return L.join('\n')
}

/* ── run ────────────────────────────────────────────────────────────────── */

const only = process.argv.slice(2).filter((x) => !x.startsWith('--')).map(Number)
const ACTIONABLE = new Set(['OPEN', 'ROLLING', 'PROPOSAL'])
const targets = PROGRAMS.filter((p) => (only.length ? only.includes(p.n) : ACTIONABLE.has(p.status)))

mkdirSync(OUT, { recursive: true })

// Sweep stale sheets. When a programme goes DEAD or FLUX it stops being
// generated, but its last file would linger on disk looking perfectly usable —
// which is how someone ends up writing an application to a closed programme.
if (!only.length) {
  for (const f of readdirSync(OUT)) {
    if (f.endsWith('.md')) rmSync(join(OUT, f))
  }
}

let gated = 0
for (const p of targets) {
  const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
  writeFileSync(join(OUT, `${String(p.n).padStart(2, '0')}-${slug}.md`), render(p))
  const r = audit.get(p.n)
  if (r?.captcha?.length) gated += 1
}
console.log(`  ${targets.length} answer sheets → deploy/apply/`)
console.log(`  ${gated} need a human to clear a captcha; the answers are drafted for all of them.`)
