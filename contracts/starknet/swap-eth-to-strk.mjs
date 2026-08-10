/**
 * swap-eth-to-strk.mjs — convert the ETH sitting on our Starknet account into
 * STRK, so the class declare can be paid for.
 *
 * Starknet v3 transactions price resource bounds in STRK. ETH is the legacy fee
 * token and is useless for a modern declare — which is why the account had
 * 0.00199 ETH and still failed with "exceed balance (0)".
 *
 * No new funding is needed: that ETH is worth ~155 STRK, and the declare costs
 * ~34. The small STRK balance already present covers the swap's own gas, so this
 * bootstraps entirely from what is on-chain.
 *
 * Uses AVNU's aggregator: quote -> build calldata -> execute as a multicall.
 */
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const sn = require('starknet')
import fs from 'node:fs'

const { RpcProvider, Account, ec, hash } = sn
const ETH = '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7'
const STRK = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d'
const AVNU = 'https://starknet.api.avnu.fi'

const pkRaw = JSON.parse(fs.readFileSync('../.testnet/accounts.json', 'utf8')).starknet.private_key
const PK = pkRaw.startsWith('0x') ? pkRaw : '0x' + pkRaw
const PUB = ec.starkCurve.getStarkKey(PK)
const ADDRESS = hash.calculateContractAddressFromHash(
  PUB, '0x061dac032f228abef9c6626f995015233097ae253a7f72d68552db02f2971b8f', [PUB], 0)

const provider = new RpcProvider({ nodeUrl: 'https://rpc.starknet.lava.build' })
const account = new Account({ provider, address: ADDRESS, signer: PK })

// Leave a little ETH behind rather than sweeping to zero — a dust remainder
// costs nothing and avoids edge cases in the aggregator's balance checks.
const sellAmount = process.env.SELL_WEI ?? '0x6a94d74f430000'   // 0.0019 ETH

const quotes = await fetch(
  `${AVNU}/swap/v2/quotes?sellTokenAddress=${ETH}&buyTokenAddress=${STRK}` +
  `&sellAmount=${sellAmount}&takerAddress=${ADDRESS}`
).then((r) => r.json())
const q = quotes[0]
if (!q) throw new Error('no quote: ' + JSON.stringify(quotes).slice(0, 200))
console.log('   sell   ', Number(BigInt(sellAmount)) / 1e18, 'ETH')
console.log('   receive', Number(BigInt(q.buyAmount)) / 1e18, 'STRK')

const built = await fetch(`${AVNU}/swap/v2/build`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ quoteId: q.quoteId, takerAddress: ADDRESS, slippage: 0.02 }),
}).then((r) => r.json())
if (!built.calls) throw new Error('build failed: ' + JSON.stringify(built).slice(0, 250))

const res = await account.execute(built.calls)
console.log('   tx     ', res.transaction_hash)
await provider.waitForTransaction(res.transaction_hash)
console.log('   SWAPPED')
