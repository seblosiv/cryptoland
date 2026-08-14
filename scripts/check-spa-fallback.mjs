#!/usr/bin/env node
/**
 * check-spa-fallback.mjs — the white-screen regression guard.
 *
 * A missing /assets/* file MUST return 404. When Caddy's `try_files … /index.html`
 * applied to every path, a request for a bundle from an older deploy came back as
 * index.html with HTTP 200 and content-type text/html. The browser loads that as a
 * module script, execution fails silently, #root stays empty — a white page with a
 * clean console, which is what a grant reviewer would have seen.
 *
 * Run before and after every deploy:
 *   node scripts/check-spa-fallback.mjs
 *   node scripts/check-spa-fallback.mjs beam base      # subset
 *
 * Exits 1 if any subdomain regresses.
 */
const CHAINS = process.argv.slice(2).length ? process.argv.slice(2) : [
  'polygon','avalanche','base','arbitrum','ronin','bnb','optimism','scroll','celo',
  'moonbeam','beam','oasys','skale','hedera','injective','solana','ton','aptos','sui',
  'starknet','cardano','near','stellar','algorand','multiversx','radix','tezos',
  'mantle','taiko','rootstock','flare','flow',
]
const DOMAIN = process.env.CRYPTOLAND_DOMAIN ?? 'xono.ai'

async function head(url) {
  try {
    const r = await fetch(url, { redirect: 'manual' })
    return { status: r.status, ct: r.headers.get('content-type') ?? '' }
  } catch (e) { return { status: 0, ct: `ERR ${e.message.slice(0, 40)}` } }
}

let bad = 0
console.log(`checking ${CHAINS.length} subdomains on ${DOMAIN}\n`)
for (const c of CHAINS) {
  const base = `https://${c}.${DOMAIN}`
  const [site, miss, deep] = await Promise.all([
    head(base),
    head(`${base}/assets/index-DOESNOTEXIST12345.js`),
    head(`${base}/ecosystem`),                       // SPA deep link must still work
  ])
  const okSite = site.status === 200
  const okMiss = miss.status === 404
  const okDeep = deep.status === 200
  const ok = okSite && okMiss && okDeep
  if (!ok) bad++
  console.log(`  ${ok ? '✅' : '❌'} ${c.padEnd(12)} site=${site.status} ` +
              `missing-asset=${miss.status}${okMiss ? '' : ` (${miss.ct.slice(0, 24)})`} ` +
              `deep-link=${deep.status}`)
}
console.log()
if (bad) {
  console.log(`${bad} subdomain(s) REGRESSED.`)
  console.log('A missing asset returning HTML is the white-screen bug. Check that')
  console.log('the Caddyfile has `handle /assets/* { file_server }` BEFORE the')
  console.log('try_files fallback — see scripts/deploy-chain.sh.')
  process.exit(1)
}
console.log('all clear — missing assets 404, deep links still resolve')
