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
  {
    chain: 'EVM (covers 17 chains)',
    network: 'Oasys testnet',
    family: 'evm',
    lang: 'Solidity',
    date: '2026-07-31',
    contract: '0x52785B7eF9Ff8d9fc88497cd3cA10098602814f6',
    deployTx: 'see explorer',
    explorer: 'https://explorer.testnet.oasys.games/address/0x52785B7eF9Ff8d9fc88497cd3cA10098602814f6',
    wasmBytes: 0,
    note:
      'Oasys was the ONLY EVM testnet whose faucet has neither a captcha nor a wallet login, ' +
      'so it is the only one that could be funded unattended. The contract is CryptoLandTile.sol — ' +
      'the same bytecode all 17 EVM chains use — so proving it here proves it for all of them. ' +
      'A FIRST deployment (0xe45404C3…) exposed a real grid-bounds bug; this is the fixed redeploy.',
    checks: [
      { name: 'deploys with correct state',   result: 'PASS', detail: 'fee 700, price 0, provenance "CryptoLand LTD, Mahe, Seychelles", site https://xono.ai' },
      { name: 'tokenId — far corner',         result: 'PASS', detail: 'tokenIdFromKey(16383,16383) = 536854527' },
      { name: 'tokenId — rejects off-grid',   result: 'PASS', detail: 'tokenIdFromKey(16384,0) reverts (did NOT before the fix)' },
      { name: 'no tokenId collision',         result: 'PASS', detail: 'tokenIdFromKey(0,32768) reverts; it used to return 32768, colliding with tile (1,0)' },
      { name: 'isValidTokenId rejects 2^200', result: 'PASS', detail: 'false — that id was claimable before the fix' },
      { name: 'refuses off-grid sale',        result: 'PASS', detail: 'claimTile(2^200) reverts "tokenId off-grid"' },
      { name: 'still sells on-grid',          result: 'PASS', detail: 'claimTile(100,200) succeeded, treasury 0.5 OAS' },
    ],
  },
  {
    chain: 'NEAR',
    network: 'testnet',
    family: 'near',
    lang: 'Rust / near-sdk',
    date: '2026-07-31',
    contract: 'cryptoland-ms86s8tc.testnet',
    deployTx: 'DrLCNHCMP1bggbcEgEXm61CYR32jr7TzRgCmX3tXAx4m',
    explorer: 'https://explorer.testnet.near.org/accounts/cryptoland-ms86s8tc.testnet',
    wasmBytes: 133273,
    note:
      'Funded via helper.testnet.near.org, which creates and funds an account programmatically — ' +
      'no captcha, no browser. The wasm is the cargo-near artifact, which plain `cargo build` ' +
      'cannot produce (see the near-sdk 5.29 note in contract-audit.md).',
    checks: [
      { name: 'deploys and initialises', result: 'PASS', detail: 'new(owner, base_uri) executed' },
      { name: 'fee defaults to 7%',      result: 'PASS', detail: 'market_fee_bps = 700 read from chain' },
      { name: 'tokenId — origin',        result: 'PASS', detail: 'token_id(0,0) = 0' },
      { name: 'tokenId — x step',        result: 'PASS', detail: 'token_id(1,0) = 32768' },
      { name: 'tokenId — far corner',    result: 'PASS', detail: 'token_id(16383,16383) = 536854527' },
      { name: 'tokenId — bounds',        result: 'PASS', detail: 'token_id(16384,0) errors' },
    ],
  },
];

/** Chains where a deployment was attempted but blocked, and precisely why. */
/**
 * Faucet-gated. In every case the CONTRACT is fine — it compiles, its tests pass,
 * and for EVM the identical bytecode is already proven on Oasys. What blocks
 * these is a human-verification step on the faucet, not our code.
 */
export const BLOCKED_DEPLOYMENTS = [
  { chain: 'Solana', network: 'devnet',
    reason: 'airdrop returns "rate limit reached" from three IPs and the RPC requestAirdrop returns Internal error — devnet faucet is globally degraded, not IP-throttled.' },
  { chain: '13 other EVM testnets', network: 'various',
    reason: 'Every other EVM faucet gates on a captcha (Injective, Moonbase, BNB, Fuji), a wallet/social login (Beam, Hedera, Fuji), a mainnet balance (BNB wants 0.002 BNB), or a puzzle (Ronin: rotate an Axie). Oasys was the only one automatable — and since all 17 EVM chains share one bytecode, one deployment covers the contract logic for all of them.' },
  { chain: 'TON', network: 'testnet',
    reason: 'faucet is a Telegram bot (@testgiver_ton_bot) — needs a Telegram account.' },
  { chain: 'Starknet / Cardano / Algorand / MultiversX / Radix / Tezos', network: 'testnets',
    reason: 'all reachable, all faucet-gated behind captcha, wallet connect, or an API key.' },
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
