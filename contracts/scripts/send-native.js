/**
 * send-native.js — plain native-token transfer from the deployer.
 *
 *   SEND_TO=0x… SEND_AMOUNT=700000000000000 \
 *     npx hardhat run scripts/send-native.js --network scroll
 *
 * Needed because some bridges are deposit-address based rather than
 * contract-call based: Layerswap issues a one-time address and watches it, so
 * funding through it is an ordinary transfer, not a router invocation like
 * LI.FI or GasZip. Layerswap is currently the only route that reaches Taiko —
 * LI.FI does not list chain 167000 at all, and GasZip answers
 * "Chain Limit Exceeded" for it at every size.
 */
const hre = require('hardhat')

async function main() {
  const to = process.env.SEND_TO
  const amount = process.env.SEND_AMOUNT
  if (!to || !amount) throw new Error('set SEND_TO and SEND_AMOUNT (wei)')
  if (!hre.ethers.isAddress(to)) throw new Error('SEND_TO is not an address')

  const [signer] = await hre.ethers.getSigners()
  const from = await signer.getAddress()
  const bal = await hre.ethers.provider.getBalance(from)
  console.log(`   from ${hre.network.name}  balance ${hre.ethers.formatEther(bal)}`)
  if (bal <= BigInt(amount)) throw new Error('balance below send amount')

  const tx = await signer.sendTransaction({ to, value: amount })
  console.log('   tx    ', tx.hash)
  const rc = await tx.wait()
  console.log('   status', rc.status === 1 ? 'CONFIRMED' : 'FAILED')
}

main().catch((e) => { console.error('   ERROR:', e.message); process.exitCode = 1 })
