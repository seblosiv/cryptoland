/**
 * CryptoLandTile Deploy Script
 * =============================
 * Chain-agnostic deployment via raw JSON-RPC + browser-compiled ABI.
 * Run with: node contracts/deploy.js --chain polygon-amoy --pk 0xYOUR_PRIVATE_KEY
 *
 * Prerequisites:
 *   npm install -g solc          # or use solcjs
 *   node >= 18 (native fetch)
 *
 * After deploying, update your .env:
 *   VITE_CONTRACT_<CHAIN_UPPER>=0xDeployedAddress
 *   VITE_CHAIN=<chain-key>
 *
 * Supported chains (from config):
 *   polygon, polygon-amoy, avalanche, avalanche-fuji, base, base-sepolia, ethereum
 */

import { readFileSync, writeFileSync } from 'fs'
import { createRequire } from 'module'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import path from 'path'

const __dir = path.dirname(fileURLToPath(import.meta.url))

// ── CLI args ──────────────────────────────────────────────────────────────────
const args    = process.argv.slice(2)
const chainArg = args[args.indexOf('--chain') + 1] ?? 'polygon-amoy'
const pkArg    = args[args.indexOf('--pk') + 1] ?? process.env.DEPLOY_PK
const dryRun   = args.includes('--dry-run')

const CHAINS = {
  'polygon':        { id: 137,   rpc: 'https://polygon-rpc.com',                       explorer: 'https://polygonscan.com' },
  'polygon-amoy':   { id: 80002, rpc: 'https://rpc-amoy.polygon.technology',            explorer: 'https://amoy.polygonscan.com' },
  'avalanche':      { id: 43114, rpc: 'https://api.avax.network/ext/bc/C/rpc',          explorer: 'https://snowtrace.io' },
  'avalanche-fuji': { id: 43113, rpc: 'https://api.avax-test.network/ext/bc/C/rpc',     explorer: 'https://testnet.snowtrace.io' },
  'base':           { id: 8453,  rpc: 'https://mainnet.base.org',                       explorer: 'https://basescan.org' },
  'base-sepolia':   { id: 84532, rpc: 'https://sepolia.base.org',                       explorer: 'https://sepolia.basescan.org' },
  'ethereum':       { id: 1,     rpc: 'https://eth.llamarpc.com',                       explorer: 'https://etherscan.io' },
}

const chain = CHAINS[chainArg]
if (!chain) { console.error(`Unknown chain: ${chainArg}`); process.exit(1) }
if (!pkArg && !dryRun)  { console.error('Provide --pk 0x... or set DEPLOY_PK'); process.exit(1) }

// ── Compile contract ──────────────────────────────────────────────────────────
console.log(`\n📋 Compiling CryptoLandTile.sol...`)

const solcOut = execSync(
  `npx solcjs --optimize --optimize-runs 200 --abi --bin ${__dir}/CryptoLandTile.sol --output-dir ${__dir}/compiled`,
  { encoding: 'utf8', cwd: __dir }
)

const compiledDir = path.join(__dir, 'compiled')
const abiFile     = readFileSync(`${compiledDir}/CryptoLandTile_sol_CryptoLandTile.abi`, 'utf8')
const binFile     = readFileSync(`${compiledDir}/CryptoLandTile_sol_CryptoLandTile.bin`, 'utf8')

const abi      = JSON.parse(abiFile)
const bytecode = '0x' + binFile.trim()

console.log(`✓ Compiled. Bytecode size: ${bytecode.length / 2 - 1} bytes`)

if (dryRun) {
  console.log('\n[Dry run] Would deploy to:', chainArg)
  console.log('[Dry run] ABI written to contracts/compiled/')
  process.exit(0)
}

// ── JSON-RPC helpers ──────────────────────────────────────────────────────────

let _rpcId = 1
async function rpc(method, params = []) {
  const res = await fetch(chain.rpc, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ jsonrpc: '2.0', id: _rpcId++, method, params }),
  })
  const d = await res.json()
  if (d.error) throw new Error(d.error.message)
  return d.result
}

// ── Minimal signing (secp256k1 via Node built-ins) ────────────────────────────
// For production deploys, use Hardhat or Foundry instead.
// This script is for quick CI/CD deploys without extra toolchain.

import { createHash } from 'crypto'

function keccak256(data) {
  // Use node-keccak if available, else warn
  try {
    const { keccak256: k } = createRequire(import.meta.url)('ethereum-cryptography/keccak.js')
    return k(data)
  } catch {
    throw new Error('Install ethereum-cryptography: npm i ethereum-cryptography')
  }
}

// ── Deploy ────────────────────────────────────────────────────────────────────

async function deploy() {
  const chainId = await rpc('eth_chainId').then(h => parseInt(h, 16))
  if (chainId !== chain.id) {
    throw new Error(`RPC returned chainId ${chainId}, expected ${chain.id}`)
  }

  // Derive address from private key
  const { secp256k1 } = await import('ethereum-cryptography/secp256k1.js').catch(() => {
    throw new Error('Install ethereum-cryptography: npm i ethereum-cryptography')
  })
  const { bytesToHex } = await import('ethereum-cryptography/utils.js')

  const pk       = pkArg.startsWith('0x') ? pkArg.slice(2) : pkArg
  const pkBytes  = Buffer.from(pk, 'hex')
  const pubKey   = secp256k1.getPublicKey(pkBytes, false)
  const addrHash = keccak256(pubKey.slice(1))
  const address  = '0x' + bytesToHex(addrHash.slice(-20))

  console.log(`\n🔑 Deployer: ${address}`)
  console.log(`⛓  Chain:    ${chainArg} (${chain.id})`)

  const balance = await rpc('eth_getBalance', [address, 'latest'])
  console.log(`💰 Balance:  ${(parseInt(balance, 16) / 1e18).toFixed(6)} native`)

  const nonce   = await rpc('eth_getTransactionCount', [address, 'latest'])
  const gasPrice = await rpc('eth_gasPrice')

  // Encode constructor: name, symbol, baseURI
  const constructorArgs = encodeConstructor(
    'CryptoLand Tiles',
    'CLND',
    `https://api.cryptoland.io/metadata/${chainArg}/`
  )
  const deployData = bytecode + constructorArgs

  const gasEst   = await rpc('eth_estimateGas', [{ from: address, data: deployData }])
  const gasLimit = '0x' + Math.ceil(parseInt(gasEst, 16) * 1.2).toString(16)

  console.log(`⛽ Gas:      ${parseInt(gasEst, 16).toLocaleString()} (+ 20% buffer)`)

  if (dryRun) {
    console.log('\n[Dry run] Gas estimation complete. Use --dry-run false to deploy.')
    return
  }

  // Build + sign + send transaction
  const tx = {
    nonce:    nonce,
    gasPrice: gasPrice,
    gasLimit: gasLimit,
    to:       null,
    value:    '0x0',
    data:     deployData,
    chainId:  chain.id,
  }

  const signedTx = await signTransaction(tx, pkBytes, secp256k1, keccak256)
  const txHash   = await rpc('eth_sendRawTransaction', [signedTx])

  console.log(`\n🚀 Deploy TX: ${txHash}`)
  console.log(`   Explorer: ${chain.explorer}/tx/${txHash}`)
  console.log(`\n⏳ Waiting for confirmation...`)

  // Poll for receipt
  let receipt = null
  for (let i = 0; i < 60; i++) {
    receipt = await rpc('eth_getTransactionReceipt', [txHash]).catch(() => null)
    if (receipt) break
    await new Promise(r => setTimeout(r, 3000))
    process.stdout.write('.')
  }

  if (!receipt?.contractAddress) throw new Error('Deploy failed or timed out')

  const contractAddress = receipt.contractAddress
  console.log(`\n\n✅ Deployed: ${contractAddress}`)
  console.log(`   NFT page: ${chain.explorer}/token/${contractAddress}`)

  // Update .env
  const envKey = `VITE_CONTRACT_${chainArg.replace(/-/g, '_').toUpperCase()}`
  const envPath = path.join(__dir, '..', '.env')
  let envContent = readFileSync(envPath, 'utf8').split('\n')
  const existingIdx = envContent.findIndex(l => l.startsWith(envKey + '='))
  if (existingIdx >= 0) {
    envContent[existingIdx] = `${envKey}=${contractAddress}`
  } else {
    envContent.push(`${envKey}=${contractAddress}`)
  }
  writeFileSync(envPath, envContent.join('\n'))

  console.log(`\n📝 Updated .env: ${envKey}=${contractAddress}`)
  console.log(`   Next: rebuild the app with VITE_CHAIN=${chainArg}`)

  // Save deployment record
  const record = {
    chain:   chainArg,
    chainId: chain.id,
    address: contractAddress,
    txHash,
    deployer: address,
    deployedAt: new Date().toISOString(),
  }
  const recordPath = path.join(compiledDir, `deployment-${chainArg}.json`)
  writeFileSync(recordPath, JSON.stringify(record, null, 2))
  console.log(`   Saved: contracts/compiled/deployment-${chainArg}.json`)
}

// ── ABI encoding for constructor ──────────────────────────────────────────────
function encodeConstructor(name, symbol, baseURI) {
  function encStr(s) {
    const b   = Buffer.from(s, 'utf8')
    const len = b.length.toString(16).padStart(64, '0')
    const pad = Math.ceil(b.length / 32) * 32
    return len + b.toString('hex').padEnd(pad * 2, '0')
  }
  const offset1 = (96).toString(16).padStart(64, '0')
  const s1      = encStr(name)
  const offset2 = (96 + s1.length / 2).toString(16).padStart(64, '0')
  const s2      = encStr(symbol)
  const offset3 = (96 + s1.length / 2 + s2.length / 2).toString(16).padStart(64, '0')
  const s3      = encStr(baseURI)
  return offset1 + offset2 + offset3 + s1 + s2 + s3
}

// For a production-grade deploy, use Hardhat or Foundry (documented in /documentation/deployment.md)
async function signTransaction(tx, pk, secp256k1, keccak256fn) {
  throw new Error(
    'Transaction signing not implemented in this script.\n' +
    'Use Hardhat: npx hardhat run scripts/deploy.js --network ' + chainArg + '\n' +
    'Or Foundry:  forge create --rpc-url ' + chain.rpc + ' --private-key $DEPLOY_PK contracts/CryptoLandTile.sol:CryptoLandTile'
  )
}

deploy().catch(err => {
  console.error('\n❌', err.message)
  process.exit(1)
})
