/**
 * check-funding.js — has the deployer been funded, and on which chains?
 * =====================================================================
 *   cd contracts && npx hardhat run scripts/check-funding.js --network polygon
 *
 * The --network flag is only there to satisfy Hardhat; this talks to every
 * configured mainnet directly, because the question is never "is one chain
 * funded" but "which of the twelve can I deploy right now".
 *
 * For each chain it reports the balance, what a deploy costs at the CURRENT gas
 * price, and whether the balance actually covers it. That last column is the
 * point: a non-zero balance is not the same as a fundable deploy, and finding
 * out otherwise means a failed transaction after the money has already moved.
 *
 * It also re-checks chainId per network. A reachable RPC on the wrong network
 * is a real failure mode here — Ronin renumbered Saigon out from under us and
 * nothing noticed, because the endpoint answered perfectly well.
 */
const hre = require('hardhat')
const { ethers } = require('ethers')

// What CryptoLandTile.sol actually consumed deploying on Oasys and Ronin.
const DEPLOY_GAS = 3_200_000n

const DEPLOYER = process.env.DEPLOYER_ADDRESS
  ?? '0xD10178e0E4a6A4aBebAd4d5Dc51DD09Ec10ede58'

// Every EVM mainnet we have a build target for, cheapest-first so the trivial
// ones are visible at a glance.
const NETWORKS = [
  'polygon', 'ethereum', 'base', 'arbitrum', 'optimism', 'scroll', 'bnb',
  'avalanche', 'celo', 'hedera', 'flare', 'injective',
  'ronin', 'mantle', 'oasys', 'beam', 'taiko', 'moonbeam', 'rootstock',
  'skale', 'skale-europa',
]

async function main() {
  console.log(`deployer: ${DEPLOYER}\n`)
  console.log(`  ${'network'.padEnd(14)}${'balance'.padStart(16)}${'deploy needs'.padStart(16)}   status`)

  const ready = []
  const results = await Promise.all(NETWORKS.map(async (name) => {
    const cfg = hre.config.networks[name]
    if (!cfg?.url) return { name, err: 'not configured' }
    try {
      // staticNetwork with no network makes ethers v6 attempt detection anyway
      // and fail; hand it the expected chainId. The identity check below is done
      // with a raw eth_chainId instead, so declaring it here cannot mask a
      // mismatch — which is the whole reason the check exists.
      const p = new ethers.JsonRpcProvider(cfg.url, cfg.chainId, { staticNetwork: true })
      const reported = await p.send('eth_chainId', [])
      if (parseInt(reported, 16) !== cfg.chainId) {
        return { name, err: `WRONG NETWORK — RPC says ${parseInt(reported, 16)}, config says ${cfg.chainId}` }
      }
      // getFeeData() routes through per-chain oracles and those break
      // independently of the node — Polygon's gas station 500s while the RPC
      // itself is perfectly healthy. Fall back to a plain eth_gasPrice so one
      // flaky oracle does not blank out a chain that is actually fine.
      const bal = await p.getBalance(DEPLOYER)
      let gasPrice = 0n
      try {
        const fee = await p.getFeeData()
        gasPrice = fee.gasPrice ?? fee.maxFeePerGas ?? 0n
      } catch { /* fall through */ }
      if (gasPrice === 0n) {
        try { gasPrice = BigInt(await p.send('eth_gasPrice', [])) } catch { /* leave 0 */ }
      }
      return { name, bal, need: gasPrice * DEPLOY_GAS }
    } catch (e) {
      return { name, err: String(e.shortMessage ?? e.message).slice(0, 46) }
    }
  }))

  for (const r of results) {
    if (r.err) { console.log(`  ${r.name.padEnd(14)}${'—'.padStart(16)}${'—'.padStart(16)}   ${r.err}`); continue }
    // A gasless chain needs no balance at all, so "0 < 0" must not read as short.
    const ok = r.bal >= r.need
    if (ok && (r.bal > 0n || r.need === 0n)) ready.push(r.name)
    console.log(
      `  ${r.name.padEnd(14)}${ethers.formatEther(r.bal).slice(0, 14).padStart(16)}` +
      `${ethers.formatEther(r.need).slice(0, 14).padStart(16)}   ` +
      `${r.bal === 0n && r.need > 0n ? 'not funded' : ok ? 'READY TO DEPLOY' : 'UNDERFUNDED'}`
    )
  }

  console.log(`\n  ${ready.length}/${NETWORKS.length} ready to deploy`)
  if (ready.length) console.log(`  ${ready.join(' ')}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
