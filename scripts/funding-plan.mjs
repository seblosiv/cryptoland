#!/usr/bin/env node
/**
 * funding-plan.mjs — what does it cost to deploy every contract to MAINNET,
 * and can that funding actually be withdrawn from Binance?
 * =====================================================================
 *   node scripts/funding-plan.mjs            # table
 *   node scripts/funding-plan.mjs --json     # machine-readable
 *
 * Two questions, and the second is the one that bites. "Deploying costs $3"
 * is useless if the exchange you hold funds on cannot send that token on that
 * network — and exchanges disable withdrawals per-network silently. Binance
 * lists RON and MNT under `FIAT_MONEY` with `withdrawEnable: true`, which a
 * naive check reads as "yes, withdrawable" when there is no on-chain route at
 * all. An earlier hand-written version of this table had exactly that bug.
 *
 * Sources, in order of authority:
 *   1. Live `eth_gasPrice` × observed deploy gas, for EVM.
 *   2. Amounts OBSERVED during the testnet deployments, for non-EVM — not
 *      estimates. Solana's 1.75 SOL is the rent that closing the program
 *      actually refunded (1.7077404 SOL); Radix's 90 XRD is the 84.01 XRD the
 *      stokenet publish actually paid.
 *   3. Exchange withdrawal availability from each exchange's own PUBLIC
 *      network-config endpoint, never from an article.
 *
 * `WITHDRAW_MULTIPLE` headroom exists because a gas spike between funding and
 * deploying strands the deployment, and a second withdrawal costs more in fees
 * than the headroom does.
 */

import { MAINNET_CHAINS } from '../src/lib/blockchain/config.js'

const JSON_OUT = process.argv.includes('--json')
const DEPLOY_GAS = 3_200_000n   // what CryptoLandTile.sol actually used on Oasys + Ronin

/**
 * Headroom depends on what the cost actually IS, and a flat multiple gets this
 * badly wrong. An EVM deploy is priced by a volatile gas auction, so it wants
 * real headroom. Solana's cost is *rent* for a fixed-size program, Cardano's is
 * a min-ADA UTXO floor and NEAR's is storage staking — all deterministic
 * functions of byte size, which cannot spike between funding and deploying.
 * Applying 10x to those said "withdraw 17.5 SOL" ($1,288) for a $129 cost.
 */
const HEADROOM = { gas: 10, rent: 1.3 }
const RENT_PRICED = new Set(['solana', 'cardano', 'near', 'stellar', 'flow', 'algorand', 'sui'])
const headroomFor = (key, family) =>
  (family !== 'evm' && RENT_PRICED.has(key)) ? HEADROOM.rent : HEADROOM.gas

// ── non-EVM: amounts observed during the real testnet deployments ────────────
const NON_EVM = {
  // REFUNDABLE, and the only "cost" here that is not a fee: this is rent for the
  // program account. `solana program close` returns it — which is exactly how it
  // was measured (1.7077404 SOL came back from the 245KB build). The irreversible
  // part of a Solana deploy is the tx fees, ~0.01 SOL.
  // Size-optimising the build took the program 245,496 B -> 207,488 B, so the
  // deposit fell 1.71 -> 1.45 SOL. Rent is deterministic in byte count, hence the
  // small headroom.
  solana:     { amt: 1.5,  sym: 'SOL',  cg: 'solana',           why: 'REFUNDABLE rent for the 207KB program (~1.45 SOL) + fees; reclaimed via `solana program close`' },
  radix:      { amt: 90,   sym: 'XRD',  cg: 'radix',            why: '84.01 XRD publish fee observed on stokenet' },
  near:       { amt: 3,    sym: 'NEAR', cg: 'near',             why: 'storage staking for the 133KB wasm + gas' },
  cardano:    { amt: 25,   sym: 'ADA',  cg: 'cardano',          why: 'reference-script UTXO min-ADA + fee' },
  stellar:    { amt: 15,   sym: 'XLM',  cg: 'stellar',          why: 'contract upload + instance rent' },
  ton:        { amt: 1,    sym: 'TON',  cg: 'the-open-network', why: 'collection deploy + storage' },
  multiversx: { amt: 0.5,  sym: 'EGLD', cg: 'elrond-erd-2',     why: 'deploy gas' },
  starknet:   { amt: 20,   sym: 'STRK', cg: 'starknet',         why: 'declare + deploy (the class is large)' },
  sui:        { amt: 0.6,  sym: 'SUI',  cg: 'sui',              why: 'publish + storage-rebate deposit' },
  tezos:      { amt: 1.5,  sym: 'XTZ',  cg: 'tezos',            why: 'origination burn for 7.7KB + storage' },
  algorand:   { amt: 1,    sym: 'ALGO', cg: 'algorand',         why: 'app creation min-balance + fees' },
  aptos:      { amt: 0.15, sym: 'APT',  cg: 'aptos',            why: 'publish gas (33,834 units observed)' },
  flow:       { amt: 2,    sym: 'FLOW', cg: 'flow',             why: 'account storage minimum + deploy' },
}

const CG_EVM = {
  polygon: 'matic-network', avalanche: 'avalanche-2', base: 'ethereum', arbitrum: 'ethereum',
  ronin: 'ronin', bnb: 'binancecoin', optimism: 'ethereum', scroll: 'ethereum', celo: 'celo',
  moonbeam: 'moonbeam', beam: 'beam-2', oasys: 'oasys', hedera: 'hedera-hashgraph',
  injective: 'injective-protocol', mantle: 'mantle', taiko: 'ethereum', ethereum: 'ethereum',
  // RBTC is Rootstock's gas token and is pegged 1:1 to BTC via the PowPeg, so
  // bitcoin is its correct price feed. `rootstock-infrastructure-framework` is
  // RIF — a different, unpegged token, and pricing gas with it is simply wrong.
  rootstock: 'bitcoin', flare: 'flare-networks',
  skale: null, 'skale-europa': null,
}

/**
 * How to actually get the native token onto each chain.
 *
 * `binance` is the network name to pick in Binance's withdrawal dialog —
 * picking the wrong one loses the funds, so it is spelled exactly. Verified
 * against Binance's own public network config; a chain is only marked
 * fundable-from-Binance if a REAL network (never FIAT_MONEY) has
 * withdrawEnable true.
 *
 * `alt` is the fallback when Binance has no on-chain route, verified against
 * each of those exchanges' public endpoints too.
 */
const ROUTE = {
  // ── direct from Binance ────────────────────────────────────────────────────
  polygon:    { binance: 'MATIC' },
  ethereum:   { binance: 'ETH' },
  base:       { binance: 'BASE' },
  arbitrum:   { binance: 'ARBITRUM' },
  optimism:   { binance: 'OPTIMISM' },
  scroll:     { binance: 'SCROLL' },
  bnb:        { binance: 'BSC' },
  avalanche:  { binance: 'AVAXC' },
  celo:       { binance: 'CELO' },
  hedera:     { binance: 'HBAR' },
  flare:      { binance: 'FLR' },
  injective:  { binance: 'INJ' },
  solana:     { binance: 'SOL' },
  aptos:      { binance: 'APT' },
  sui:        { binance: 'SUI' },
  cardano:    { binance: 'ADA' },
  near:       { binance: 'NEAR' },
  stellar:    { binance: 'XLM' },
  algorand:   { binance: 'ALGO' },
  multiversx: { binance: 'EGLD' },
  tezos:      { binance: 'XTZ' },
  flow:       { binance: 'FLOW' },
  // Starknet fees are payable in ETH, and Binance withdraws ETH straight to
  // Starknet — cheaper and simpler than sourcing STRK.
  starknet:   { binance: 'STARKNET', note: 'withdraw ETH on the STARKNET network; fees payable in ETH' },

  // ── Binance has no on-chain route; verified alternative ────────────────────
  ronin:      { alt: 'Gate.io (RON network)', why: 'Binance lists RON as FIAT_MONEY only — no on-chain withdrawal' },
  mantle:     { alt: 'KuCoin or Gate.io (Mantle network)', why: 'Binance lists MNT as FIAT_MONEY only' },
  oasys:      { alt: 'Gate.io or HTX (OAS network)', why: 'OAS is not listed on Binance at all' },
  beam:       { alt: 'Gate.io (BEAM network)', why: 'Binance BEAM withdrawal is disabled' },
  radix:      { alt: 'Gate.io or KuCoin (XRD network)', why: 'XRD is not listed on Binance' },
  ton:        { alt: 'OKX or Bybit', why: 'Binance TON withdrawal is disabled; Gate.io has delisted it' },

  // ── needs a bridge; no exchange sells the right asset on the right chain ───
  taiko:      { bridge: 'withdraw ETH to Ethereum L1, then bridge.taiko.xyz',
                why: 'Taiko gas is ETH, and no exchange withdraws ETH onto Taiko. The TAIKO token is governance, not gas — sending it would not pay for a deploy' },
  moonbeam:   { bridge: 'Squid/Wormhole from Base, or a swap service',
                why: 'every exchange checked (Binance/Gate/KuCoin/Bitget/HTX) offers only WRAPPED GLMR on Base or BSC. Wrapped GLMR cannot pay Moonbeam gas' },
  rootstock:  { bridge: 'PowPeg (0.005 BTC minimum peg-in) or a swap service',
                why: 'RBTC is delisted on Gate and disabled on KuCoin. PowPeg is permissionless but parks ~0.005 BTC, which is recoverable via peg-out' },

  // ── no funding needed ──────────────────────────────────────────────────────
  skale:          { free: 'sFUEL faucet', why: 'gasless chain. Deployment is instead gated behind a deployer whitelist — a request to the SKALE team, not money' },
  'skale-europa': { free: 'sFUEL faucet', why: 'gasless chain; same deployer whitelist as Nebula' },
}

/**
 * CoinGecko's free tier rate-limits per source IP, and it does so with a 429
 * that `.json()` happily parses into an object with no prices in it. Run from a
 * shared/datacentre IP, a single unretried pass silently lost 12 of 34 prices
 * and the total under-reported by $16 — so this retries with backoff and treats
 * "no `usd` key for any requested id" as a failure worth retrying, not a result.
 */
async function coingecko(ids) {
  // Prices and gas prices have different reachability, and insisting on one
  // host for both loses data either way: this laptop cannot reach Flare's or
  // Rootstock's RPC, and the prod box is hard rate-limited by CoinGecko no
  // matter how patient the backoff is. So prices may be fetched wherever they
  // work and handed to wherever the RPCs work:
  //   node scripts/funding-plan.mjs --dump-prices px.json   # somewhere with CG
  //   node scripts/funding-plan.mjs --prices px.json        # somewhere with RPCs
  const load = process.argv.indexOf('--prices')
  if (load !== -1) {
    const { readFileSync } = await import('node:fs')
    return JSON.parse(readFileSync(process.argv[load + 1], 'utf8'))
  }
  // CoinGecko's limit is intermittent on every host tried, so --dump-prices
  // ACCUMULATES: it merges into any existing cache and only requests ids still
  // missing. Re-running until it reports nothing missing converges, where a
  // single overwrite-and-hope pass kept losing a different batch each time.
  const px = {}
  const dumpAt = process.argv.indexOf('--dump-prices')
  if (dumpAt !== -1) {
    const { readFileSync, existsSync } = await import('node:fs')
    const f = process.argv[dumpAt + 1]
    if (existsSync(f)) Object.assign(px, JSON.parse(readFileSync(f, 'utf8')))
  }
  const need = ids.filter((id) => px[id]?.usd === undefined)
  for (let i = 0; i < need.length; i += 8) {
    const batch = need.slice(i, i + 8)
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const r = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${batch.join(',')}&vs_currencies=usd`,
          { signal: AbortSignal.timeout(25000) })
        if (r.status === 429) throw new Error('rate limited')
        const j = await r.json()
        if (batch.some((id) => j?.[id]?.usd !== undefined)) { Object.assign(px, j); break }
        throw new Error('no prices in response')
      } catch {
        await new Promise((r) => setTimeout(r, 2500 * 2 ** attempt))
      }
    }
    await new Promise((r) => setTimeout(r, 1500))
  }
  const missing = ids.filter((id) => px[id]?.usd === undefined)
  if (missing.length) console.error(`  ! no price for: ${missing.join(', ')}\n`)
  return px
}

async function gasPrice(url) {
  try {
    const r = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_gasPrice', params: [] }),
      signal: AbortSignal.timeout(20000),
    }).then((x) => x.json())
    return r?.result ? BigInt(r.result) : null
  } catch { return null }
}

const ids = [...new Set([...Object.values(CG_EVM), ...Object.values(NON_EVM).map((n) => n.cg)].filter(Boolean))]
const px = await coingecko(ids)

const dump = process.argv.indexOf('--dump-prices')
if (dump !== -1) {
  const { writeFileSync } = await import('node:fs')
  writeFileSync(process.argv[dump + 1], JSON.stringify(px, null, 1))
  console.log(`wrote ${Object.keys(px).length} prices to ${process.argv[dump + 1]}`)
  process.exit(0)
}

const rows = await Promise.all(MAINNET_CHAINS.map(async (c) => {
  const route = ROUTE[c.key] ?? {}
  const base = { key: c.key, family: c.family, route }
  if (c.family === 'evm') {
    const wei = await gasPrice(c.rpcUrl)
    const cg = CG_EVM[c.key]
    if (wei === null) return { ...base, sym: c.nativeCurrency?.symbol, error: 'RPC did not answer' }
    const native = Number(wei * DEPLOY_GAS) / 1e18
    return {
      ...base, sym: c.nativeCurrency?.symbol, native,
      gwei: Number(wei) / 1e9,
      usd: cg && px[cg]?.usd ? native * px[cg].usd : (c.gasless ? 0 : null),
      why: c.gasless ? 'gasless chain (sFUEL has no market value)' : `${DEPLOY_GAS} gas at live price`,
    }
  }
  const n = NON_EVM[c.key]
  if (!n) return { ...base, error: 'no cost model' }
  return { ...base, sym: n.sym, native: n.amt, usd: px[n.cg]?.usd ? n.amt * px[n.cg].usd : null, why: n.why }
}))

if (JSON_OUT) { console.log(JSON.stringify({ deployGas: String(DEPLOY_GAS), rows }, null, 2)); process.exit(0) }

const fmt = (r) => {
  if (r.route.free) return `FREE — ${r.route.free}`
  if (r.route.binance) return `Binance → ${r.route.binance}`
  if (r.route.alt) return `NOT Binance → ${r.route.alt}`
  if (r.route.bridge) return `BRIDGE → ${r.route.bridge.slice(0, 44)}`
  return '?'
}

let total = 0, fundTotal = 0
const groups = [
  ['FUNDABLE DIRECTLY FROM BINANCE', (r) => r.route.binance],
  ['NEEDS A DIFFERENT EXCHANGE',     (r) => r.route.alt],
  ['NEEDS A BRIDGE',                 (r) => r.route.bridge],
  ['NO FUNDING NEEDED',              (r) => r.route.free],
]
for (const [title, pred] of groups) {
  const g = rows.filter(pred).sort((a, b) => (b.usd ?? -1) - (a.usd ?? -1))
  if (!g.length) continue
  console.log(`\n═══ ${title} (${g.length}) ═══`)
  console.log(`  ${'chain'.padEnd(14)}${'deploy'.padStart(10)}  ${'fund'.padStart(11)}  route`)
  for (const r of g) {
    if (r.error) { console.log(`  ${r.key.padEnd(14)}${'—'.padStart(10)}  ${'—'.padStart(11)}  ${fmt(r)}  [${r.error}]`); continue }
    const hr = headroomFor(r.key, r.family)
    const fund = r.native * hr
    if (r.usd !== null) { total += r.usd; fundTotal += r.usd * hr }
    console.log(`  ${r.key.padEnd(14)}${(r.usd === null ? '?' : '$' + r.usd.toFixed(2)).padStart(10)}  ` +
      `${(fund < 0.001 ? '~0' : fund.toPrecision(3)).padStart(7)} ${(r.sym ?? '').padEnd(5)} ${fmt(r)}`)
  }
}

console.log(`\n  ${rows.length} mainnet chains`)
console.log(`  Actual deploy cost, all chains:  $${total.toFixed(2)}`)
console.log(`  Recommended to withdraw (${HEADROOM.gas}x on gas-priced, ${HEADROOM.rent}x on rent-priced): $${fundTotal.toFixed(2)}`)
const noPrice = rows.filter((r) => !r.error && r.usd === null).map((r) => r.key)
if (noPrice.length) console.log(`  no price feed (excluded from total): ${noPrice.join(', ')}`)
const errs = rows.filter((r) => r.error)
if (errs.length) console.log(`  could not price: ${errs.map((r) => `${r.key} (${r.error})`).join(', ')}`)
