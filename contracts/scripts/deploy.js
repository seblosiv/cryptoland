/**
 * Hardhat deploy script — CryptoLandTile
 * ========================================
 * npx hardhat run contracts/scripts/deploy.js --network polygon-amoy
 */

const hre = require('hardhat')
const fs  = require('fs')
const path = require('path')

async function main() {
  const network = hre.network.name
  console.log(`\n🚀 Deploying CryptoLandTile to ${network}...`)

  const [deployer] = await hre.ethers.getSigners()
  const balance    = await hre.ethers.provider.getBalance(deployer.address)
  console.log(`   Deployer: ${deployer.address}`)
  console.log(`   Balance:  ${hre.ethers.formatEther(balance)} native`)

  const Factory  = await hre.ethers.getContractFactory('CryptoLandTile')
  const contract = await Factory.deploy(
    'CryptoLand Tiles',
    'CLND',
    `https://api.cryptoland.io/metadata/${network}/`,
  )

  await contract.waitForDeployment()
  const address = await contract.getAddress()

  console.log(`\n✅ CryptoLandTile deployed to: ${address}`)

  // Save to deployments
  const record = {
    network,
    chainId:     hre.network.config.chainId,
    address,
    deployer:    deployer.address,
    deployedAt:  new Date().toISOString(),
    constructorArgs: ['CryptoLand Tiles', 'CLND', `https://api.cryptoland.io/metadata/${network}/`],
  }

  const dir = path.join(__dirname, '..', 'compiled')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `deployment-${network}.json`), JSON.stringify(record, null, 2))

  // Update .env
  const envKey  = `VITE_CONTRACT_${network.replace(/-/g, '_').toUpperCase()}`
  const envPath = path.join(__dirname, '..', '..', '.env')
  let   env     = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : ''
  const lines   = env.split('\n')
  const idx     = lines.findIndex(l => l.startsWith(envKey + '='))
  if (idx >= 0) lines[idx] = `${envKey}=${address}`
  else          lines.push(`${envKey}=${address}`)
  fs.writeFileSync(envPath, lines.join('\n'))

  console.log(`   Saved: contracts/compiled/deployment-${network}.json`)
  console.log(`   .env:  ${envKey}=${address}`)
  console.log(`\n   Verify: npx hardhat verify --network ${network} ${address} "CryptoLand Tiles" "CLND" "https://api.cryptoland.io/metadata/${network}/"`)
}

main().catch(err => { console.error(err); process.exitCode = 1 })
