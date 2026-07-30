#!/usr/bin/env node
/**
 * check-rpcs.mjs — is every configured RPC reachable FROM A BROWSER?
 * ==================================================================
 * Run before a submission round:  node scripts/check-rpcs.mjs
 *
 * Public RPC endpoints rot constantly, and they rot silently. A single audit
 * pass found six chains pointing at `rpc.ankr.com/*`, which had started
 * answering **HTTP 200 with a JSON-RPC error body** ("Unauthorized: you must
 * authenticate") — so any check that only looks at the status code says the
 * endpoint is fine. It also found `eth.llamarpc.com` returning Cloudflare 521,
 * `solana-mainnet.rpc.extrnode.com` gone from DNS entirely, and Polygon's own
 * `polygon-rpc.com` answering 401.
 *
 * Three things are checked, because passing only the first two is what let the
 * dead endpoints sit in config unnoticed:
 *
 *   1. it responds at all
 *   2. the BODY is a real result, not a JSON-RPC error wearing a 200
 *   3. it sends Access-Control-Allow-Origin — without it the browser cannot
 *      read the response no matter how healthy the server is. This is why
 *      Cardano's Koios endpoint looks perfect from curl and fails in the app.
 *
 * Not part of `npm test`: it makes ~50 live network calls, so it is a
 * deliberate pre-flight step rather than something that fails CI when an
 * unrelated public node has a bad afternoon.
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)
const ORIGIN = 'https://check.cryptoland.game'

// Per-family probe: how to ask that chain for its head.
const POST = {
  evm:      { method: 'eth_blockNumber', params: [] },
  solana:   { method: 'getSlot' },
  starknet: { method: 'starknet_blockNumber', params: [] },
  sui:      { method: 'sui_getLatestCheckpointSequenceNumber', params: [] },
  near:     { method: 'status', params: [] },
  ton:      { method: 'getMasterchainInfo', params: {} },
}
const GET_PATH = {
  aptos:      '',
  multiversx: '/network/status/4294967295',
  tezos:      '/chains/main/blocks/head/header',
  algorand:   '/v2/status',
  stellar:    '/',
  radix:      '',
  cardano:    '',   // resolved per-URL below (koios vs mithril)
}

function pathFor(family, url) {
  if (family === 'cardano') return url.includes('koios') ? '/tip' : '/certificates'
  return GET_PATH[family] ?? ''
}

async function probe(family, url) {
  const args = ['-s', '-i', '-m', '20', '-H', `Origin: ${ORIGIN}`]
  // Stellar spans two protocols: Horizon is REST, Soroban is JSON-RPC and
  // rejects GET with 405. Same family, different shape.
  const isSoroban = family === 'stellar' && /soroban/i.test(url)
  if (isSoroban) {
    args.push('-X', 'POST', '-H', 'Content-Type: application/json',
      '-d', JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getLatestLedger' }), url)
  } else if (POST[family]) {
    args.push('-X', 'POST', '-H', 'Content-Type: application/json',
      '-d', JSON.stringify({ jsonrpc: '2.0', id: 1, ...POST[family] }), url)
  } else {
    args.push(url.replace(/\/$/, '') + pathFor(family, url))
  }

  let out
  try {
    ({ stdout: out } = await run('curl', args, { maxBuffer: 8 << 20 }))
  } catch {
    return { state: 'DEAD', detail: 'curl failed' }
  }
  if (!out) return { state: 'DEAD', detail: 'no output' }
  if (!out.trim()) return { state: 'DEAD', detail: 'empty response' }

  const [head, ...rest] = out.split('\r\n\r\n')
  const body = rest.join('\r\n\r\n')
  const lines = head.split('\n')
  const code = lines[0]?.split(/\s+/)[1] ?? '?'
  const acao = lines
    .find((l) => l.toLowerCase().startsWith('access-control-allow-origin'))
    ?.split(':').slice(1).join(':').trim()

  if (!/^2/.test(code)) return { state: `HTTP${code}`, detail: body.slice(0, 70) }
  // A 200 carrying a JSON-RPC error is the failure mode that hid for months.
  // But only a NON-EMPTY error counts: MultiversX returns `"error":""` on every
  // successful call, and a naive substring match reported its healthy gateway as
  // broken. A checker that cries wolf stops being run.
  const errored =
    /"error"\s*:\s*(?!""|null)\S/.test(body) ||
    /Unauthorized|API key is not allowed|must authenticate/i.test(body)
  if (errored) return { state: 'RPC-ERR', detail: body.slice(0, 70) }
  if (!acao) return { state: 'NO-CORS', detail: 'browser cannot read this' }
  return { state: 'ok', detail: body.replace(/\s+/g, ' ').slice(0, 54) }
}

const { MAINNET_CHAINS } = await import('../src/lib/blockchain/config.js')

const targets = []
for (const c of MAINNET_CHAINS) {
  targets.push({ key: c.key, family: c.family, role: 'primary', url: c.rpcUrl })
  if (c.rpcUrlFallback && c.rpcUrlFallback !== c.rpcUrl) {
    targets.push({ key: c.key, family: c.family, role: 'fallback', url: c.rpcUrlFallback })
  }
  // Cardano's browser-reachable source is statusUrl (Mithril), not rpcUrl
  // (Koios sends no CORS header). Without this the run reported "no working
  // endpoint at all: cardano" while the badge was in fact working.
  if (c.statusUrl && c.statusUrl !== c.rpcUrl) {
    targets.push({ key: c.key, family: c.family, role: 'status', url: c.statusUrl })
  }
}

const results = await Promise.all(
  targets.map(async (t) => ({ ...t, ...(await probe(t.family, t.url)) }))
)

const bad = []
for (const r of results) {
  const ok = r.state === 'ok'
  if (!ok) bad.push(r)
  console.log(
    `${ok ? '✓' : '✗'} ${r.key.padEnd(14)}${r.role.padEnd(9)}${r.state.padEnd(9)}${r.url.slice(0, 56)}`
  )
}

// Endpoints that are known to fail a BROWSER probe and are kept on purpose,
// each covered by a working sibling. Listed so a real regression is not lost in
// noise the reader has to re-diagnose every run.
const EXPECTED = {
  'solana/fallback':
    'canonical Solana endpoint — 403s browser origins, but wallet adapters and ' +
    'server-side calls use it; publicnode is the primary',
  'cardano/primary':
    'Koios has no CORS header; Mithril (fallback) is the browser-reachable source',
}

console.log(`\n${results.length} endpoints · ${results.length - bad.length} usable · ${bad.length} not`)
const unexpected = []
for (const b of bad) {
  const known = EXPECTED[`${b.key}/${b.role}`]
  if (known) console.log(`   ${b.key}/${b.role}: ${b.state} — expected: ${known}`)
  else { unexpected.push(b); console.log(`   ${b.key}/${b.role}: ${b.state} — ${b.detail}`) }
}
if (!unexpected.length && bad.length) console.log('   (no unexpected failures)')

// A chain with NO working endpoint is the real failure — a dead spare is worth
// knowing about but does not break that build.
const byChain = new Map()
for (const r of results) {
  const cur = byChain.get(r.key) ?? false
  byChain.set(r.key, cur || r.state === 'ok')
}
const dark = [...byChain].filter(([, ok]) => !ok).map(([k]) => k)
if (dark.length) {
  console.error(`\nFAIL — no working endpoint at all: ${dark.join(', ')}`)
  process.exit(1)
}
console.log('\nEvery mainnet chain has at least one browser-usable endpoint.')
