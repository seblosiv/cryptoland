/**
 * set-treasury.js — point withdrawals at a wallet the owner actually holds.
 *
 *   TREASURY=0xYourWallet npx hardhat run scripts/set-treasury.js --network base
 *
 * The constructor sets `treasuryReceiver = msg.sender`, so a fresh deployment
 * pays out to the DEPLOYER key. That key lives on a server so it can sign
 * deployments unattended, which makes it exactly the wrong place for revenue to
 * accumulate. `setTreasuryReceiver` is the separation the contract was built
 * for: admin rights stay with the hot deployer key, money goes to a cold wallet.
 *
 * Refuses to run against the zero address or a non-address, and re-reads the
 * value from the chain afterwards — the transaction receipt only proves it was
 * mined, not that the field holds what you intended.
 */
const hre = require('hardhat')

const ADDRESS = '0x89C6bcfb0aCC152F98599261dc2A72a996c3763F'

async function main() {
  const to = process.env.TREASURY
  if (!to) throw new Error('set TREASURY=0x...')
  if (!hre.ethers.isAddress(to)) throw new Error(`not an address: ${to}`)
  if (/^0x0{40}$/i.test(to)) throw new Error('refusing to set the zero address')

  const c = await hre.ethers.getContractAt('CryptoLandTile', ADDRESS)
  const before = await c.treasuryReceiver()
  if (before.toLowerCase() === to.toLowerCase()) {
    console.log(`   ${hre.network.name}: already ${to} — skipping`)
    return
  }

  const tx = await c.setTreasuryReceiver(to)
  await tx.wait()

  // Read it back. A mined transaction is not proof the field changed.
  const after = await c.treasuryReceiver()
  const ok = after.toLowerCase() === to.toLowerCase()
  console.log(`   ${hre.network.name}: ${before} -> ${after} ${ok ? 'OK' : 'MISMATCH'}`)
  if (!ok) throw new Error('treasuryReceiver did not take')
}

main().catch((e) => { console.error('   ERROR:', e.message); process.exitCode = 1 })
