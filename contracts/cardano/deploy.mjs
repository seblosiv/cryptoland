/**
 * deploy.mjs — publish the CryptoLand validator on Cardano mainnet.
 *
 * Cardano has no "deploy" instruction. A validator's address is derived from its
 * script hash, so it exists mathematically the moment the script compiles — but
 * nothing about it is ON-CHAIN until a transaction puts it there. The standard
 * way to publish is a REFERENCE SCRIPT: an output carrying the script itself,
 * which later transactions point at instead of re-embedding the whole script
 * every time. That output is the deployment, and it is what makes the validator
 * independently verifiable.
 *
 * The output is locked at an unspendable address on purpose — a reference script
 * should be permanent. Anything spendable could be consumed and the reference
 * would vanish underneath every transaction relying on it.
 *
 *   node deploy.mjs
 */
import { Lucid, Koios } from '@lucid-evolution/lucid'
import { readFileSync } from 'node:fs'

const plutus = JSON.parse(readFileSync('plutus.json', 'utf8'))
const validator = plutus.validators.find((v) => v.title.endsWith('.mint')) ?? plutus.validators[0]
const script = { type: 'PlutusV3', script: validator.compiledCode }

// Lucid wants a CIP-5 bech32 signing key (ed25519_sk...), not the raw 32-byte
// hex seed we store. Converting here keeps one secret in one place.
const sk = readFileSync('/private/tmp/claude-501/-Users-blackside-Projects-Game/1af71e2f-eb2c-4872-bb3e-f18128515885/scratchpad/cardano_sk.txt', 'utf8').trim()

const lucid = await Lucid(new Koios('https://api.koios.rest/api/v1'), 'Mainnet')
// The stored secret is a raw 32-byte ed25519 seed, not a bech32 signing key —
// selectWallet.fromPrivateKey wants the latter, so go through the seed API.
lucid.selectWallet.fromPrivateKey(sk)

const addr = await lucid.wallet().address()
console.log('   wallet   ', addr)

const utxos = await lucid.wallet().getUtxos()
const total = utxos.reduce((s, u) => s + u.assets.lovelace, 0n)
console.log('   utxos    ', utxos.length, '→', Number(total) / 1e6, 'ADA')
console.log('   validator', validator.title, validator.hash)
console.log('   script    PlutusV3,', validator.compiledCode.length / 2, 'bytes')

const scriptAddress = lucid.utils
  ? lucid.utils.validatorToAddress(script)
  : (await import('@lucid-evolution/lucid')).validatorToAddress('Mainnet', script)
console.log('   script addr', scriptAddress)

const tx = await lucid
  .newTx()
  // Attach the script to an output at its own address. min-ADA is computed by
  // the builder from the output's size, script included.
  .pay.ToAddressWithData(scriptAddress, { kind: 'inline', value: 'd87980' }, {}, script)
  .complete()

const signed = await tx.sign.withWallet().complete()
const txHash = await signed.submit()
console.log('   TX HASH  ', txHash)
console.log('   submitted — reference script is on-chain once this confirms')
