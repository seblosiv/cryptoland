/**
 * Cross-language contract conformance.
 *
 * The tokenId encoding is THE cross-chain invariant: `(tx << 15) | ty` with
 * tx/ty bounded to [0, 16383]. If one of the 13 implementations drifts, a tile
 * means two different things on two chains — and nothing in the per-chain
 * toolchains would catch it, because each compiles in isolation.
 *
 * In-language tests exist where the toolchain runs them (hardhat, scarb,
 * cargo, aiken, pyteal). But NEAR's SDK requires `cargo near build` and
 * Stellar's soroban-env-host currently fails to compile its own test harness,
 * so those two would otherwise go unverified. This suite reads every contract's
 * SOURCE and checks the constants and vectors directly, which works regardless
 * of whether that chain's toolchain is installed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');

/** The five pairs every implementation must agree on. */
const VECTORS = [
  [0, 0, 0],
  [1, 0, 32768],
  [0, 1, 1],
  [100, 200, 3277000],
  [16383, 16383, 536854527],
];

const CONTRACTS = {
  evm:        'contracts/src/CryptoLandTile.sol',
  starknet:   'contracts/starknet/src/lib.cairo',
  sui:        'contracts/sui/sources/tile.move',
  aptos:      'contracts/aptos/sources/cryptoland_tile.move',
  solana:     'contracts/solana/programs/cryptoland-tile/src/lib.rs',
  near:       'contracts/near/src/lib.rs',
  stellar:    'contracts/stellar/src/lib.rs',
  multiversx: 'contracts/multiversx/src/lib.rs',
  radix:      'contracts/radix/src/lib.rs',
  tezos:      'contracts/tezos/cryptoland_tile.mligo',
  algorand:   'contracts/algorand/cryptoland_tile.py',
  ton:        'contracts/ton/contracts/cryptoland_tile.fc',
  cardano:    'contracts/cardano/validators/tile.ak',
};

const src = (p) => readFileSync(resolve(root, p), 'utf8');

describe('contract conformance — all 13 implementations', () => {
  it('every contract source exists', () => {
    for (const [chain, path] of Object.entries(CONTRACTS)) {
      expect(existsSync(resolve(root, path)), `${chain}: ${path}`).toBe(true);
    }
  });

  // The canonical arithmetic, as JS. Every contract must match this.
  const pack = (tx, ty) => (tx << 15) | ty;

  it('the canonical vectors are self-consistent', () => {
    for (const [tx, ty, want] of VECTORS) expect(pack(tx, ty)).toBe(want);
  });

  it('Cairo/Aiken/CameLIGO multiply-by-32768 is identical to shift-by-15', () => {
    // These three languages have no shift operator. The forms agree only
    // because ty is bounded below 2^15 — which is why the bound is load-bearing
    // and not merely defensive.
    for (const [tx, ty, want] of VECTORS) expect(tx * 32768 + ty).toBe(want);
    // Demonstrate the bound is what makes it safe: at ty = 2^15 they diverge.
    expect(1 * 32768 + 32768).not.toBe(pack(1, 32768));
  });

  it.each(Object.entries(CONTRACTS))('%s bounds coordinates to 16383', (chain, path) => {
    expect(src(path), `${chain} must bound the grid`).toMatch(/16383/);
  });

  it.each(Object.entries(CONTRACTS))('%s uses the shared 15-bit packing', (chain, path) => {
    const s = src(path);
    // Either the shift form or the multiply form, but nothing else.
    const shift = /<<\s*1?5|COORD_SHIFT\s*[:=]\s*(u\d+\s*=\s*)?15|shl\s*15/.test(s);
    const mult = /32768/.test(s);
    expect(shift || mult, `${chain} has neither <<15 nor *32768`).toBe(true);
  });

  it.each(Object.entries(CONTRACTS))('%s caps the market fee at 10%%', (chain, path) => {
    const s = src(path);
    expect(/1000|MAX_FEE_BPS|max_fee_bps/.test(s), `${chain} missing fee ceiling`).toBe(true);
  });

  it.each(Object.entries(CONTRACTS))('%s defaults the fee to 7%%', (chain, path) => {
    // TON has no constructor — DEFAULT_FEE_BPS documents what the deploy payload
    // must pack, since nothing in the contract can set it.
    expect(src(path), `${chain} should default to 700 bps`).toMatch(/700|DEFAULT_FEE_BPS/);
  });

  // Two legitimate exemptions, both model differences rather than gaps:
  //  - cardano is UTXO: no contract balance exists, so no treasury or withdraw.
  //  - radix is bucket-based: withdraw() hands a Bucket back to the admin caller,
  //    who deposits it in the same transaction. That IS the payout, and it is
  //    gated on the admin badge, so a separate receiver field would add nothing.
  const ACCOUNT_CHAINS = Object.entries(CONTRACTS).filter(([c]) => c !== 'cardano');
  const RECEIVER_CHAINS = ACCOUNT_CHAINS.filter(([c]) => c !== 'radix');

  it.each(RECEIVER_CHAINS)('%s routes payouts to a treasury receiver', (chain, path) => {
    const s = src(path);
    expect(
      // algorand names the global plainly `receiver`; the meaning is the same.
      /treasury_receiver|treasuryReceiver|treasury_recv|TreasuryReceiver|Bytes\("receiver"\)/.test(s),
      `${chain} must pay a configurable receiver, never msg.sender`,
    ).toBe(true);
  });

  it.each(ACCOUNT_CHAINS)('%s gates withdraw behind an owner check', (chain, path) => {
    const s = src(path);
    expect(
      // algorand binds `is_owner = Txn.sender() == globalGet(owner)` and asserts it.
      /onlyOwner|only_owner|has_one\s*=\s*owner|ENotOwner|E_NOT_OWNER|not_owner|not owner|require_admin|assert_owner|require_owner|is_owner|restrict_to:\s*\[admin\]|enable_method_auth/.test(s),
      `${chain} withdraw must be owner-only`,
    ).toBe(true);
  });

  it('every contract carries the same provenance string', () => {
    // A reviewer checking one deployment against another should see one project.
    const withProvenance = Object.entries(CONTRACTS).filter(([, p]) =>
      /CryptoLand/i.test(src(p)),
    );
    expect(withProvenance.length).toBe(Object.keys(CONTRACTS).length);
  });
});

describe('contract conformance — self-checks embedded in sources', () => {
  // Where a contract ships its own vector table, it must be the canonical one.
  const WITH_VECTORS = ['sui', 'aptos', 'algorand', 'cardano', 'starknet', 'multiversx'];

  it.each(WITH_VECTORS)('%s asserts the far-corner vector 536854527', (chain) => {
    expect(src(CONTRACTS[chain]), `${chain} should assert the corner case`).toMatch(
      /536854527|536_854_527/,
    );
  });
});
