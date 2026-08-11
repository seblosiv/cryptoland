/**
 * deploy.mjs — Starknet mainnet, in the three steps the chain actually requires.
 *
 *   node deploy.mjs account   # 1. deploy the ACCOUNT contract at our address
 *   node deploy.mjs declare   # 2. declare the tile class (Sierra + CASM)
 *   node deploy.mjs deploy    # 3. deploy an instance of that class
 *
 * Starknet is the only chain here where the deployer itself is a contract. The
 * address is counterfactual — derived from (class hash, salt, pubkey) — so it can
 * receive funds BEFORE it exists, which is what lets an exchange pay into it.
 * But nothing can be signed from it until step 1 has run, and step 1 is paid for
 * out of the funds already sitting at that address.
 *
 * Declaring needs BOTH the Sierra program and its CASM compilation; the sequencer
 * checks one against the other. Scarb only emits CASM with `casm = true`, which
 * is why a contract that builds and unit-tests fine can still be undeployable.
 */
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const sn = require('starknet')
const { RpcProvider, Account, ec, hash, CallData, json } = sn
import fs from 'node:fs'

const RPC = 'https://rpc.starknet.lava.build'
const OZ_ACCOUNT_CLASS = '0x061dac032f228abef9c6626f995015233097ae253a7f72d68552db02f2971b8f'
const ACCOUNTS = '../.testnet/accounts.json'

const pkRaw = JSON.parse(fs.readFileSync(ACCOUNTS, 'utf8')).starknet.private_key
const PK = pkRaw.startsWith('0x') ? pkRaw : '0x' + pkRaw
const PUB = ec.starkCurve.getStarkKey(PK)
// Salt = public key, matching how the address was derived when we handed it out.
const ADDRESS = hash.calculateContractAddressFromHash(PUB, OZ_ACCOUNT_CLASS, [PUB], 0)

const provider = new RpcProvider({ nodeUrl: RPC })
// starknet.js v10 takes a single options object; v6-era positional args
// (provider, address, key) silently pass `undefined` as the address.
const account = new Account({ provider, address: ADDRESS, signer: PK })
const step = process.argv[2]

if (step === 'account') {
  console.log('   address', ADDRESS)
  const { transaction_hash, contract_address } = await account.deployAccount({
    classHash: OZ_ACCOUNT_CLASS,
    constructorCalldata: CallData.compile({ publicKey: PUB }),
    addressSalt: PUB,
  })
  console.log('   tx     ', transaction_hash)
  await provider.waitForTransaction(transaction_hash)
  console.log('   ACCOUNT DEPLOYED', contract_address)
} else if (step === 'declare') {
  const sierra = json.parse(fs.readFileSync('target/dev/cryptoland_CryptoLandTile.contract_class.json', 'utf8'))
  const casm = json.parse(fs.readFileSync('target/dev/cryptoland_CryptoLandTile.compiled_contract_class.json', 'utf8'))
  // starknet.js pads the estimate 1.5x, which pushed the requirement past what
  // is in the account. Estimate, then set resourceBounds at a 1.15x margin so the
  // declare fits the balance we actually have.
  const est = await account.estimateDeclareFee({ contract: sierra, casm })
  // The SDK returns these as BigInts and expects BigInts back — handing it hex
  // strings throws "Cannot mix BigInt and other types" from inside its own math.
  const pad = (v, n = 115n) => (BigInt(v) * n) / 100n
  const rb = est.resourceBounds
  const bounds = {
    l1_gas:      { max_amount: pad(rb.l1_gas.max_amount),      max_price_per_unit: rb.l1_gas.max_price_per_unit },
    l2_gas:      { max_amount: pad(rb.l2_gas.max_amount),      max_price_per_unit: rb.l2_gas.max_price_per_unit },
    l1_data_gas: { max_amount: pad(rb.l1_data_gas.max_amount), max_price_per_unit: rb.l1_data_gas.max_price_per_unit },
  }
  console.log('   est fee   ', Number(est.overall_fee) / 1e18, 'STRK')
  const res = await account.declareIfNot({ contract: sierra, casm }, { resourceBounds: bounds })
  console.log('   class hash', res.class_hash)
  if (res.transaction_hash) {
    console.log('   tx        ', res.transaction_hash)
    await provider.waitForTransaction(res.transaction_hash)
  }
  console.log('   DECLARED')
} else if (step === 'deploy') {
  const classHash = process.env.CLASS_HASH
  if (!classHash) throw new Error('set CLASS_HASH')
  // constructor(owner, base_uri: felt252, pay_token). base_uri is a felt252, so
  // it must fit in 31 characters — "https://starknet.xono.ai/" is 25.
  const STRK_TOKEN = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d'
  const BASE_URI = sn.shortString.encodeShortString('https://starknet.xono.ai/')
  const res = await account.deployContract({
    classHash,
    constructorCalldata: CallData.compile([ADDRESS, BASE_URI, STRK_TOKEN]),
  })
  console.log('   tx      ', res.transaction_hash)
  await provider.waitForTransaction(res.transaction_hash)
  console.log('   CONTRACT', res.contract_address)
} else {
  console.log('usage: node deploy.mjs account|declare|deploy')
}
