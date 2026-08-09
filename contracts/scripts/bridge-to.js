/**
 * bridge-to.js — fund a chain no exchange can reach, from one we already hold.
 *
 *   BRIDGE_TO=747 BRIDGE_AMOUNT=200000000000000 \
 *     npx hardhat run scripts/bridge-to.js --network base
 *
 * Two chains on our list cannot be funded from an exchange at all:
 *   Flare  — Binance lists FLR with trading:false, so there is no pair to buy.
 *   Flow   — Binance only addresses Cadence accounts (16-hex, assigned by the
 *            chain), which cannot be derived from a key.
 *
 * Both, however, are ordinary EVM chains (14 and 747) where our existing
 * deployer address already exists by construction. So instead of chasing a
 * wallet that can mint an account, we bridge a couple of dollars of leftover
 * gas to the SAME address that owns every other deployment.
 *
 * LI.FI is quoted live and returns a ready-to-sign transactionRequest; we send
 * it through the configured hardhat signer so the funds land on the deployer.
 */
const hre = require('hardhat')

const NATIVE = '0x0000000000000000000000000000000000000000'

async function main() {
  const toChain = process.env.BRIDGE_TO
  const amount = process.env.BRIDGE_AMOUNT
  if (!toChain || !amount) throw new Error('set BRIDGE_TO and BRIDGE_AMOUNT (wei)')

  const [signer] = await hre.ethers.getSigners()
  const from = await signer.getAddress()
  const fromChain = Number((await hre.ethers.provider.getNetwork()).chainId)

  const bal = await hre.ethers.provider.getBalance(from)
  console.log(`   from ${hre.network.name} (${fromChain})  balance ${hre.ethers.formatEther(bal)}`)
  if (bal <= BigInt(amount)) throw new Error('balance below bridge amount')

  const url = `https://li.quest/v1/quote?fromChain=${fromChain}&toChain=${toChain}` +
    `&fromToken=${NATIVE}&toToken=${NATIVE}&fromAmount=${amount}` +
    `&fromAddress=${from}&toAddress=${from}`
  const q = await fetch(url).then((r) => r.json())
  if (!q.transactionRequest) throw new Error('no route: ' + String(q.message ?? '').slice(0, 160))

  console.log(`   via ${q.toolDetails?.name} -> ${hre.ethers.formatEther(q.estimate.toAmount)} native ` +
              `($${q.estimate.toAmountUSD}) in ~${q.estimate.executionDuration}s`)

  const tx = await signer.sendTransaction({
    to: q.transactionRequest.to,
    data: q.transactionRequest.data,
    value: q.transactionRequest.value,
    gasLimit: q.transactionRequest.gasLimit,
  })
  console.log('   tx     ', tx.hash)
  const rc = await tx.wait()
  console.log('   status ', rc.status === 1 ? 'CONFIRMED on source chain' : 'FAILED')
  console.log('   note   ', 'destination credit is asynchronous; poll the target chain balance')
}

main().catch((e) => { console.error('   ERROR:', e.message); process.exitCode = 1 })
