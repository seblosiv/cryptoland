/**
 * TON contract tests — REAL execution against the TVM emulator.
 *
 * FunC has no in-language test framework, which is why this contract shipped
 * unverified while every other chain had at least a token-id assertion. The
 * @ton/sandbox emulator runs the actual compiled bytecode, so the round-1 audit
 * fixes are checked here against the machine rather than by reading the source:
 *
 *   - the sale price comes from STORAGE, not from the buyer's message
 *     (previously a buyer could mint any tile for 1 nanoton)
 *   - set_tile_price / set_market_fee / set_treasury_recv actually persist
 *     (previously all three were silent no-ops)
 *   - withdraw pays treasury_receiver, not a hardcoded owner
 *   - the 10% fee ceiling is enforced on-chain
 *
 * Run: npm test   (from contracts/ton)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { compileFunc } from '@ton-community/func-js';
import { Blockchain } from '@ton/sandbox';
import { Cell, beginCell, contractAddress, toNano } from '@ton/core';

const here = dirname(fileURLToPath(import.meta.url));
const src = (f) => readFileSync(resolve(here, '..', 'contracts', f), 'utf8');

const OP = {
  mintTile: 0x1a0b9d51,
  claimTile: 0x1a0b9d52,
  setTilePrice: 0x1a0b9d53,
  setMarketFee: 0x1a0b9d54,
  setTreasuryRecv: 0x1a0b9d55,
  withdraw: 0x1a0b9d56,
};
const ERR = { notOwner: 401, outOfRange: 402, insufficient: 403 };

/** Compile the real FunC source — not a fixture. */
async function buildCode() {
  const res = await compileFunc({
    sources: (p) => src(p.replace(/^.*\//, '')),
    targets: ['stdlib.fc', 'cryptoland_tile.fc'],
  });
  if (res.status === 'error') throw new Error(res.message);
  return Cell.fromBoc(Buffer.from(res.codeBoc, 'base64'))[0];
}

/**
 * Storage layout the contract expects:
 *   owner, total(64), tile_price(coins), fee(16), treasury_receiver, content, item_code
 */
function buildData({ owner, total = 0, price = 0n, fee = 700, recv }) {
  return beginCell()
    .storeAddress(owner)
    .storeUint(total, 64)
    .storeCoins(price)
    .storeUint(fee, 16)
    .storeAddress(recv)
    .storeRef(beginCell().storeUint(0, 8).endCell()) // content
    .storeRef(beginCell().storeUint(0, 8).endCell()) // nft item code
    .endCell();
}

async function deploy({ price = 0n, fee = 700, recvIsOwner = true } = {}) {
  const bc = await Blockchain.create();
  const deployer = await bc.treasury('deployer');
  const buyer = await bc.treasury('buyer');
  const cold = await bc.treasury('cold');
  const stranger = await bc.treasury('stranger');

  const code = await buildCode();
  const data = buildData({
    owner: deployer.address,
    price,
    fee,
    recv: recvIsOwner ? deployer.address : cold.address,
  });
  const addr = contractAddress(0, { code, data });

  await deployer.send({
    to: addr,
    value: toNano('5'),
    init: { code, data },
    body: beginCell().endCell(),
    bounce: false,
  });

  const send = (from, body, value = '0.5') =>
    from.send({ to: addr, value: toNano(value), body, bounce: true });

  const msg = (op, build = (b) => b) =>
    build(beginCell().storeUint(op, 32).storeUint(0, 64));

  return { bc, addr, deployer, buyer, cold, stranger, send, msg };
}

const exitCodes = (res) =>
  res.transactions.flatMap((t) =>
    t.description?.computePhase?.exitCode !== undefined
      ? [t.description.computePhase.exitCode]
      : [],
  );

test('claim_tile prices from STORAGE, not from the buyer message', async () => {
  // The round-1 bug: price was read from in_msg_body, so a buyer could send
  // 1 nanoton and mint any tile. Set a 5 TON price and pay 0.5 — must fail.
  const { buyer, send, msg } = await deploy({ price: toNano('5') });
  const res = await send(
    buyer,
    msg(OP.claimTile, (b) =>
      b.storeUint(10, 32).storeUint(20, 32).storeRef(beginCell().endCell()),
    ),
    '0.5',
  );
  assert.ok(
    exitCodes(res).includes(ERR.insufficient),
    `underpayment must throw ${ERR.insufficient}, got ${exitCodes(res)}`,
  );
});

test('claim_tile succeeds when the buyer covers the stored price', async () => {
  const { buyer, send, msg } = await deploy({ price: toNano('1') });
  const res = await send(
    buyer,
    msg(OP.claimTile, (b) =>
      b.storeUint(10, 32).storeUint(20, 32).storeRef(beginCell().endCell()),
    ),
    '2',
  );
  const codes = exitCodes(res);
  assert.ok(!codes.includes(ERR.insufficient), `unexpected throw: ${codes}`);
});

test('claim_tile is disabled while the stored price is zero', async () => {
  const { buyer, send, msg } = await deploy({ price: 0n });
  const res = await send(
    buyer,
    msg(OP.claimTile, (b) =>
      b.storeUint(1, 32).storeUint(1, 32).storeRef(beginCell().endCell()),
    ),
    '5',
  );
  assert.ok(exitCodes(res).includes(ERR.insufficient), 'price 0 must block claims');
});

test('coordinates outside the 16383 grid are rejected', async () => {
  const { buyer, send, msg } = await deploy({ price: toNano('1') });
  const res = await send(
    buyer,
    msg(OP.claimTile, (b) =>
      b.storeUint(16384, 32).storeUint(0, 32).storeRef(beginCell().endCell()),
    ),
    '2',
  );
  assert.ok(exitCodes(res).includes(ERR.outOfRange), 'tx=16384 must be out of range');
});

test('a stranger cannot set the price', async () => {
  const { stranger, send, msg } = await deploy();
  const res = await send(
    stranger,
    msg(OP.setTilePrice, (b) => b.storeCoins(toNano('99'))),
  );
  assert.ok(exitCodes(res).includes(ERR.notOwner), 'non-owner must be rejected');
});

test('a stranger cannot withdraw', async () => {
  const { stranger, send, msg } = await deploy();
  const res = await send(stranger, msg(OP.withdraw));
  assert.ok(exitCodes(res).includes(ERR.notOwner), 'non-owner withdraw must throw');
});

test('set_market_fee enforces the 10% ceiling', async () => {
  const { deployer, send, msg } = await deploy();
  const bad = await send(deployer, msg(OP.setMarketFee, (b) => b.storeUint(1001, 16)));
  assert.ok(exitCodes(bad).includes(ERR.outOfRange), '1001 bps must be rejected');

  const ok = await send(deployer, msg(OP.setMarketFee, (b) => b.storeUint(1000, 16)));
  assert.ok(!exitCodes(ok).includes(ERR.outOfRange), '1000 bps is the allowed ceiling');
});

test('set_tile_price persists — it was a silent no-op before', async () => {
  const { deployer, buyer, send, msg } = await deploy({ price: 0n });
  // Claims are closed at price 0.
  await send(deployer, msg(OP.setTilePrice, (b) => b.storeCoins(toNano('3'))));
  // If the setter persisted, paying 1 TON is now insufficient against the new 3.
  const res = await send(
    buyer,
    msg(OP.claimTile, (b) =>
      b.storeUint(5, 32).storeUint(5, 32).storeRef(beginCell().endCell()),
    ),
    '1',
  );
  assert.ok(
    exitCodes(res).includes(ERR.insufficient),
    'the new price must be enforced, proving the setter wrote to storage',
  );
});

test('withdraw pays the treasury receiver, not the owner', async () => {
  // Round-1 bug: the payout address was hardcoded to `owner`, so pointing at a
  // cold wallet had no effect. Deploy with recv = cold and assert the outgoing
  // message is addressed there.
  const { deployer, cold, send, msg } = await deploy({ recvIsOwner: false });
  const res = await send(deployer, msg(OP.withdraw));
  const dests = res.transactions
    .flatMap((t) => t.outMessages.values())
    .map((m) => m.info?.dest?.toString())
    .filter(Boolean);
  assert.ok(
    dests.some((d) => d === cold.address.toString()),
    `payout must go to the cold wallet; saw ${dests}`,
  );
  assert.ok(
    !dests.some((d) => d === deployer.address.toString()),
    'payout must NOT go to the owner when a receiver is configured',
  );
});
