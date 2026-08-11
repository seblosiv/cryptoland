/**
 * test.mjs — exercise the minimal program on a live cluster.
 *
 * The point of this contract is proving the tokenId invariant on a fifth VM, so
 * that is what gets checked hardest: the canonical far corner, the origin, the
 * x-step, and the out-of-range case that must be REJECTED. A program that
 * happily returns an id for (16384, 0) has the collision bug the EVM contract
 * shipped and 39 unit tests missed.
 *
 *   node test.mjs <programId> [rpc]
 */
import {
  Connection, Keypair, PublicKey, SystemProgram, Transaction,
  TransactionInstruction, sendAndConfirmTransaction,
} from '@solana/web3.js'
import { readFileSync } from 'node:fs'
import os from 'node:os'

const PROGRAM = new PublicKey(process.argv[2])
const RPC = process.argv[3] ?? 'https://api.devnet.solana.com'
const REG_LEN = 96

const conn = new Connection(RPC, 'confirmed')
const payer = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(`${os.homedir()}/.config/solana/id.json`, 'utf8'))))
console.log('  payer  ', payer.publicKey.toBase58())
console.log('  program', PROGRAM.toBase58())

// Fresh registry account owned by the program.
const reg = Keypair.generate()
const rent = await conn.getMinimumBalanceForRentExemption(REG_LEN)
const create = SystemProgram.createAccount({
  fromPubkey: payer.publicKey, newAccountPubkey: reg.publicKey,
  lamports: rent, space: REG_LEN, programId: PROGRAM,
})
await sendAndConfirmTransaction(conn, new Transaction().add(create), [payer, reg])
console.log('  registry', reg.publicKey.toBase58(), `(${REG_LEN} bytes)`)

const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b }
const call = async (tag, ...parts) => {
  const ix = new TransactionInstruction({
    programId: PROGRAM,
    keys: [
      { pubkey: reg.publicKey, isSigner: false, isWritable: true },
      { pubkey: payer.publicKey, isSigner: true, isWritable: false },
    ],
    data: Buffer.concat([Buffer.from([tag]), ...parts]),
  })
  try {
    await sendAndConfirmTransaction(conn, new Transaction().add(ix), [payer], { commitment: 'confirmed' })
    return true
  } catch { return false }
}
const read = async () => {
  const a = await conn.getAccountInfo(reg.publicKey, 'confirmed')
  const d = a.data
  return {
    owner: new PublicKey(d.subarray(0, 32)).toBase58(),
    recv: new PublicKey(d.subarray(32, 64)).toBase58(),
    total: d.readBigUInt64LE(64), price: d.readBigUInt64LE(72),
    fee: d.readBigUInt64LE(80), lastId: d.readBigUInt64LE(88),
  }
}

let pass = 0, fail = 0
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}${detail && ' — ' + detail}`) }
  else { fail++; console.log(`  FAIL  ${name}${detail && ' — ' + detail}`) }
}

check('initialize', await call(0))
let s = await read()
check('owner set to caller', s.owner === payer.publicKey.toBase58())
check('fee defaults to 700', s.fee === 700n, `got ${s.fee}`)
check('sales start closed', s.price === 0n, `price=${s.price}`)

check('re-initialize is rejected', !(await call(0)), 'a second init would let anyone take the contract')

check('tokenId origin', await call(5, u64(0), u64(0)) && (await read()).lastId === 0n)
check('tokenId x-step', await call(5, u64(1), u64(0)) && (await read()).lastId === 32768n)
s = await call(5, u64(16383), u64(16383)) ? await read() : null
check('tokenId far corner = 536854527', s && s.lastId === 536854527n, s ? `got ${s.lastId}` : 'call failed')
check('tokenId (16384,0) REJECTED', !(await call(5, u64(16384), u64(0))), 'the collision guard')
check('tokenId (0,16384) REJECTED', !(await call(5, u64(0), u64(16384))))

check('claim rejected while closed', !(await call(4, u64(5), u64(5))))
check('owner can open sales', await call(1, u64(1000000)) && (await read()).price === 1000000n)
check('claim works once open', await call(4, u64(5), u64(5)))
s = await read()
check('total incremented', s.total === 1n, `total=${s.total}`)
check('fee ceiling enforced (1001 rejected)', !(await call(2, u64(1001))))
check('fee 900 accepted', await call(2, u64(900)) && (await read()).fee === 900n)

console.log(`\n  ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
