/**
 * Live contract deployments — the only place any claim about ON-CHAIN behaviour
 * is allowed to come from.
 *
 * Everything else in this repo is compile-level or emulator-level. Emulators
 * model the VM, not the network: gas schedules, contract-size limits, host
 * function availability and wallet behaviour are all unverified until a real
 * deployment. Until 2026-07-31 nothing had ever executed on a real chain.
 *
 * `checks` records what was actually exercised against the deployed contract,
 * with the on-chain result. A test that was not run does not appear.
 */

export const DEPLOYMENTS = [
  {
    chain: 'Stellar',
    network: 'testnet',
    family: 'stellar',
    lang: 'Soroban / Rust',
    date: '2026-07-31',
    contract: 'CBVB7GK65CN2KB4NMQ3CGC6LIHFQU7IZ46KWZTUHKAFLO4BT6EBB4FFW',
    deployTx: 'b4bdc14f18283c02374333012cafa73d4ccb118e2e640219704ae231214e9ace',
    explorer:
      'https://stellar.expert/explorer/testnet/contract/CBVB7GK65CN2KB4NMQ3CGC6LIHFQU7IZ46KWZTUHKAFLO4BT6EBB4FFW',
    wasmBytes: 11200,
    note:
      'Built for wasm32v1-none. The wasm32-unknown-unknown artifact is rejected by the ' +
      'Soroban host with "reference-types not enabled" — a build-target difference that no ' +
      'amount of unit testing would have surfaced.',
    checks: [
      { name: 'deploys and initialises',     result: 'PASS', detail: 'init(owner, base_uri, pay_token) succeeded' },
      { name: 'fee defaults to 7%',          result: 'PASS', detail: 'market_fee_bps read back as 700 from chain state' },
      { name: 'sales start closed',          result: 'PASS', detail: 'tile_price is 0 until the owner opens them' },
      { name: 'tokenId — origin',            result: 'PASS', detail: 'token_id(0,0) = 0' },
      { name: 'tokenId — x step',            result: 'PASS', detail: 'token_id(1,0) = 32768' },
      { name: 'tokenId — far corner',        result: 'PASS', detail: 'token_id(16383,16383) = 536854527 — the cross-chain canonical value, on-chain' },
      { name: 'tokenId — out of range',      result: 'PASS', detail: 'token_id(16384,0) reverts' },
      { name: 'owner can open sales',        result: 'PASS', detail: 'set_tile_price(100000000) persisted' },
      { name: 'buyer pays for a tile',       result: 'PASS', detail: 'claim_tile(100,200) emitted a 10 XLM transfer buyer → contract, returned tokenId 3277000' },
      { name: 'treasury reflects the sale',  result: 'PASS', detail: 'treasury = 100000000 stroops' },
      { name: 'payout honours the receiver', result: 'PASS', detail: 'withdraw paid the COLD wallet: 10000 → 10010 XLM' },
      { name: 'owner does NOT get the money',result: 'PASS', detail: 'owner balance moved only by gas, not by +10 XLM' },
      { name: 'treasury zeroes after payout',result: 'PASS', detail: 'treasury = 0' },
      { name: 'stranger cannot withdraw',    result: 'PASS', detail: 'Error(Contract, #5) — NotOwner' },
      { name: 'stranger cannot set price',   result: 'PASS', detail: 'rejected: missing owner signature' },
      { name: 'fee ceiling enforced',        result: 'PASS', detail: 'set_market_fee_bps(1001) → Error(Contract, #4) FeeTooHigh' },
      { name: 'fee ceiling is inclusive',    result: 'PASS', detail: 'set_market_fee_bps(1000) accepted — exactly 10%' },
      { name: 'no double-claim',             result: 'PASS', detail: 're-claiming (100,200) → Error(Contract, #2) AlreadyClaimed' },
    ],
  },
];

/** Chains where a deployment was attempted but blocked, and precisely why. */
export const BLOCKED_DEPLOYMENTS = [
  {
    chain: 'Sui',
    network: 'testnet',
    reason:
      'Faucet returns "Too Many Requests" from three separate IPs (laptop, two servers) — ' +
      'the throttle is service-side, not per-IP. Retry later; nothing about the contract is at fault.',
  },
  {
    chain: 'Aptos',
    network: 'testnet',
    reason:
      'Faucet now requires a bearer token issued through a web flow ' +
      '("Either the Authorization header is missing or it is not in the form of \'Bearer <token>\'"). ' +
      'Needs a human to visit aptos.dev/network/faucet once.',
  },
];

export const deploymentTally = () => ({
  deployed: DEPLOYMENTS.length,
  checksRun: DEPLOYMENTS.reduce((n, d) => n + d.checks.length, 0),
  checksPassed: DEPLOYMENTS.reduce(
    (n, d) => n + d.checks.filter((c) => c.result === 'PASS').length,
    0,
  ),
  blocked: BLOCKED_DEPLOYMENTS.length,
});
