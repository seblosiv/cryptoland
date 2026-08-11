#!/usr/bin/env node
/**
 * watch-withdrawals.mjs — is a suspended withdrawal network back yet?
 *
 *   node scripts/watch-withdrawals.mjs            # one check
 *   node scripts/watch-withdrawals.mjs --json     # machine-readable
 *
 * Binance suspends withdrawal networks for runtime upgrades and node
 * maintenance, then quietly re-enables them. "Suspended" in their UI is a
 * temporary state, not a delisting — the config still carries a live fee and
 * minimum. Moonbeam is the chain this project is blocked on: native GLMR is not
 * obtainable anywhere else. Every exchange checked (Gate.io, KuCoin, HTX,
 * Bitget, BingX) offers only wrapped GLMR on Base/BSC, which cannot pay Moonbeam
 * gas, and no bridge carries it — LI.FI, GasZip, Symbiosis, Relay, Squid,
 * Layerswap, Meson, Socket, Orbiter, deBridge, Across, Hyperlane and Celer
 * cBridge were all checked. cBridge reaches Moonbeam but only for MANTA and ZLK.
 *
 * So the reopening of this one flag is the whole unblock. Run it from cron.
 */

const WATCH = [
  { coin: 'GLMR', network: 'GLMR', label: 'Moonbeam',  need: 10 },
  { coin: 'OAS',  network: 'OAS',  label: 'Oasys',     need: 5 },
  { coin: 'XRD',  network: 'XRD',  label: 'Radix',     need: 100 },
]

const res = await fetch(
  'https://www.binance.com/bapi/capital/v1/public/capital/getNetworkCoinAll',
  { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(30000) },
).then((r) => r.json())

const by = Object.fromEntries((res.data ?? []).map((c) => [c.coin.toUpperCase(), c]))
const out = []
for (const w of WATCH) {
  const coin = by[w.coin]
  // FIAT_MONEY is a pseudo-network with no on-chain route; Binance reports
  // withdrawEnable:true on it for coins that cannot actually be withdrawn.
  const net = (coin?.networkList ?? []).find((n) => n.network === w.network && n.network !== 'FIAT_MONEY')
  out.push({
    chain: w.label, coin: w.coin, network: w.network,
    listed: Boolean(net),
    open: Boolean(net?.withdrawEnable),
    min: net?.withdrawMin ?? null,
    fee: net?.withdrawFee ?? null,
    enough: net ? Number(net.withdrawMin) <= w.need * 10 : null,
  })
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(out, null, 2))
} else {
  for (const r of out) {
    const state = !r.listed ? 'NOT LISTED' : r.open ? 'OPEN ✅' : 'suspended'
    console.log(`  ${r.chain.padEnd(10)} ${r.coin}/${r.network.padEnd(6)} ${state.padEnd(11)} min=${r.min} fee=${r.fee}`)
  }
  const open = out.filter((r) => r.open)
  console.log(open.length
    ? `\n  ▶ ${open.map((r) => r.chain).join(', ')} can be withdrawn now — fund the deployer and deploy.`
    : '\n  nothing reopened yet')
}
// Non-zero while everything is still shut, so cron can act on the exit code.
process.exit(out.some((r) => r.open) ? 0 : 1)
