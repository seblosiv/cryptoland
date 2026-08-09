/**
 * gaszip-to.js — fund a chain that no bridge AGGREGATOR reaches.
 *
 *   GASZIP_TO=4337 GASZIP_AMOUNT=5500000000000000000 \
 *     npx hardhat run scripts/gaszip-to.js --network celo
 *
 * LI.FI covers 69 chains and Symbiosis 65; GasZip covers 194, which is the only
 * reason Beam is reachable at all. It is a gas-refuel service rather than a
 * general bridge: you send native value to its deposit contract with calldata
 * naming the destination, and it pays out native gas on the far side. That
 * narrowness is exactly what suits topping up a deployer.
 *
 * Note it can refuse a DESTINATION independently of amount — Taiko currently
 * answers "Chain Limit Exceeded" at every size, which is a capacity signal, not
 * a minimum. Always read the per-chain error inside `quotes[]`, not just the
 * top-level one, which unhelpfully says "Please Try Again" either way.
 */
const hre = require('hardhat')

async function main() {
  const to = process.env.GASZIP_TO
  const amount = process.env.GASZIP_AMOUNT
  if (!to || !amount) throw new Error('set GASZIP_TO and GASZIP_AMOUNT (wei)')

  const [signer] = await hre.ethers.getSigners()
  const from = await signer.getAddress()
  const fromChain = Number((await hre.ethers.provider.getNetwork()).chainId)
  const bal = await hre.ethers.provider.getBalance(from)
  console.log(`   from ${hre.network.name} (${fromChain})  balance ${hre.ethers.formatEther(bal)}`)
  if (bal <= BigInt(amount)) throw new Error('balance below send amount')

  const q = await fetch(
    `https://backend.gas.zip/v2/quotes/${fromChain}/${amount}/${to}?from=${from}&to=${from}`
  ).then((r) => r.json())

  const per = (q.quotes ?? [])[0]
  if (per?.error) throw new Error(`destination ${to}: ${per.error}`)
  const dep = q.contractDepositTxn
  if (!dep?.to) throw new Error('no deposit txn: ' + JSON.stringify(q).slice(0, 200))

  console.log(`   deposit -> ${dep.to}`)
  const tx = await signer.sendTransaction({ to: dep.to, data: dep.data, value: amount })
  console.log('   tx     ', tx.hash)
  const rc = await tx.wait()
  console.log('   status ', rc.status === 1 ? 'CONFIRMED on source' : 'FAILED')
}

main().catch((e) => { console.error('   ERROR:', e.message); process.exitCode = 1 })
