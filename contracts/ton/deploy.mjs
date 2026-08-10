/**
 * deploy.mjs — TON mainnet.
 *
 * On TON a contract's address IS hash(code, initial data), so deploying means
 * sending a message to that address carrying stateInit. There is no "deploy
 * transaction" separate from a transfer — the first message with stateInit
 * brings the contract into existence, which is why the address can be computed
 * (and funded) before anything is deployed.
 *
 * Storage layout mirrors what test/tile.test.mjs builds, so the emulator tests
 * cover the exact same initial state that ships:
 *   owner, total(64), tile_price(coins), fee(16), treasury_receiver, content, item_code
 */
import { compileFunc } from '@ton-community/func-js'
import { Cell, beginCell, contractAddress, toNano, internal, SendMode } from '@ton/core'
import { TonClient, WalletContractV4 } from '@ton/ton'
import { keyPairFromSeed } from '@ton/crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const src = (f) => readFileSync(resolve(here, 'contracts', f), 'utf8')

const seedHex = JSON.parse(readFileSync(resolve(here, '../.testnet/accounts.json'), 'utf8')).ton.seed
const kp = keyPairFromSeed(Buffer.from(seedHex, 'hex'))

const res = await compileFunc({
  sources: (p) => src(p.replace(/^.*\//, '')),
  targets: ['stdlib.fc', 'cryptoland_tile.fc'],
})
if (res.status === 'error') throw new Error(res.message)
const code = Cell.fromBoc(Buffer.from(res.codeBoc, 'base64'))[0]

// toncenter's keyless tier rate-limits aggressively and answers 429, which the
// SDK surfaces as an opaque wasm abort from the FunC compiler bundle rather than
// an HTTP error. Every call therefore goes through a backoff wrapper.
const client = new TonClient({ endpoint: 'https://toncenter.com/api/v2/jsonRPC' })
async function retry(fn, label) {
  for (let i = 0; i < 6; i++) {
    try { return await fn() } catch (e) {
      const msg = String(e?.message ?? e)
      if (!/429|rate|limit/i.test(msg) && i > 2) throw e
      await new Promise((r) => setTimeout(r, 4000 * (i + 1)))
    }
  }
  throw new Error('gave up after retries: ' + label)
}
const wallet = WalletContractV4.create({ workchain: 0, publicKey: kp.publicKey })
const w = client.open(wallet)
const owner = wallet.address
console.log('   deployer', owner.toString({ bounceable: false, urlSafe: true }))
console.log('   balance ', Number(await retry(() => w.getBalance(), 'getBalance')) / 1e9, 'TON')

const data = beginCell()
  .storeAddress(owner)
  .storeUint(0, 64)                                   // total minted
  .storeCoins(0n)                                     // tile price: 0 = sales closed
  .storeUint(700, 16)                                 // 7% fee
  .storeAddress(owner)                                // treasury receiver
  .storeRef(beginCell().storeUint(0, 8).endCell())    // content
  .storeRef(beginCell().storeUint(0, 8).endCell())    // nft item code
  .endCell()

const target = contractAddress(0, { code, data })
console.log('   contract', target.toString({ bounceable: true, urlSafe: true }))

const state = await retry(() => client.getContractState(target), 'getContractState')
if (state.state === 'active') { console.log('   ALREADY DEPLOYED'); process.exit(0) }

const seqno = await retry(() => w.getSeqno(), 'getSeqno')
await retry(() => w.sendTransfer({
  seqno,
  secretKey: kp.secretKey,
  sendMode: SendMode.PAY_GAS_SEPARATELY,
  messages: [internal({
    to: target,
    value: toNano('0.15'),      // funds the contract's own storage
    init: { code, data },
    body: beginCell().endCell(),
    bounce: false,
  })],
}), 'sendTransfer')
console.log('   sent, waiting for it to become active…')
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 5000))
  const s = await retry(() => client.getContractState(target), 'poll')
  if (s.state === 'active') { console.log('   DEPLOYED, state =', s.state); process.exit(0) }
}
console.log('   still not active after 150s — check the address on tonviewer')
