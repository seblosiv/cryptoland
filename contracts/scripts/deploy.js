/**
 * Hardhat deploy script — CryptoLandTile
 * ========================================
 * npx hardhat run contracts/scripts/deploy.js --network polygon-amoy
 */

const hre = require('hardhat')

/**
 * Where this chain's tile metadata lives. Each chain has its own subdomain and
 * its own database, so its NFTs point at its own deployment rather than a shared
 * apex. Testnet keys keep their suffix (`ronin-saigon`) because that is the
 * subdomain the testnet build would be served from.
 */
const metadataBase = (network) =>
  `https://${network}.${process.env.CRYPTOLAND_DOMAIN || 'xono.ai'}/metadata/`
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
    // Metadata base URI is stored ON-CHAIN and is what every marketplace and
    // wallet fetches forever. It previously pointed at api.cryptoland.io — a
    // domain we do not own — which would have made every tile's metadata
    // permanently unresolvable across all 21 EVM deployments.
    //
    // It resolves to the chain's OWN subdomain, not the apex: a Ronin tile's
    // metadata lives where the Ronin build lives. `setBaseURI` is onlyOwner, so
    // this is recoverable — but only if somebody notices.
    metadataBase(network),
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
    // Must match what was actually passed above, or `hardhat verify` fails.
    constructorArgs: ['CryptoLand Tiles', 'CLND', metadataBase(network)],
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
  console.log(`\n   Verify: npx hardhat verify --network ${network} ${address} "CryptoLand Tiles" "CLND" "${metadataBase(network)}"`)
}

main().catch(err => { console.error(err); process.exitCode = 1 })
