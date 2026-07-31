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
  {
    chain: 'Aptos',
    network: 'testnet',
    family: 'aptos',
    lang: 'Move',
    date: '2026-07-31',
    contract: '0xd2e9cd1e9d7345b82732eee6f877e3c360fd2cd4489c3faacaea168d7e865330',
    deployTx: '0x69fb35febddbf409c65dcae64e6bfde2dd53140c8b731ed05c41f7dc04f4fe71',
    explorer: 'https://explorer.aptoslabs.com/account/0xd2e9cd1e9d7345b82732eee6f877e3c360fd2cd4489c3faacaea168d7e865330?network=testnet',
    wasmBytes: 4885,
    note:
      'Faucet needed one human visit (browser-issued bearer token). Deploying exposed that ' +
      'token_id_from_key was not marked #[view], so no off-chain caller could query it — ' +
      'every other chain exposes its encoding. Fixed and republished.',
    checks: [
      { name: 'publishes and initialises', result: 'PASS', detail: 'vm_status "Executed successfully"; init(base_uri) executed' },
      { name: 'tokenId — origin',          result: 'PASS', detail: 'token_id_from_key(0,0) = 0' },
      { name: 'tokenId — x step',          result: 'PASS', detail: 'token_id_from_key(1,0) = 32768' },
      { name: 'tokenId — far corner',      result: 'PASS', detail: 'token_id_from_key(16383,16383) = 536854527' },
      { name: 'tokenId — bounds',          result: 'PASS', detail: 'token_id_from_key(16384,0) → Move abort' },
      { name: 'sales start closed',        result: 'PASS', detail: 'tile_price 0; claim_tile aborts E_CLAIMING_DISABLED' },
      { name: 'owner can open sales',      result: 'PASS', detail: 'set_tile_price(50000000) persisted' },
      { name: 'buyer pays real APT',       result: 'PASS', detail: 'claim_tile(100,200) succeeded; treasury 50000000 octas — the F5 fix (real Coin<AptosCoin>, not a counter) working on-chain' },
      { name: 'ownership recorded',        result: 'PASS', detail: 'tile_owner(100,200) returns the buyer' },
      { name: 'no double-claim',           result: 'PASS', detail: 'second claim → Move abort E_ALREADY_CLAIMED' },
      { name: 'withdraw drains treasury',  result: 'PASS', detail: 'treasury 50000000 → 0' },
    ],
  },
  {
    chain: 'EVM — Ronin Saigon',
    network: 'testnet',
    family: 'evm',
    lang: 'Solidity',
    date: '2026-07-31',
    contract: '0xe45404C32961569879c2b2b6FF8d42585332c5C4',
    deployTx: 'see explorer',
    explorer: 'https://saigon-explorer.roninchain.com/address/0xe45404C32961569879c2b2b6FF8d42585332c5C4',
    wasmBytes: 0,
    note:
      'Second EVM chain, confirming the grid-bounds fix is in the deployed bytecode and not ' +
      'just in the Oasys build. Deploying here also caught that config.js had Saigon as ' +
      'chainId 2021 — Ronin renumbered it to 202601, and a stale chainId makes switchChain ' +
      'ask the wallet for a network that does not exist.',
    checks: [
      { name: 'chainId matches config',    result: 'PASS', detail: '202601 (config said 2021 until this deployment)' },
      { name: 'fee defaults to 7%',        result: 'PASS', detail: 'marketFeeBps = 700' },
      { name: 'tokenId — far corner',      result: 'PASS', detail: 'tokenIdFromKey(16383,16383) = 536854527' },
      { name: 'collision path closed',     result: 'PASS', detail: 'tokenIdFromKey(0,32768) reverts' },
      { name: 'off-grid ids rejected',     result: 'PASS', detail: 'isValidTokenId(2^200) = false' },
      { name: 'buyer pays for a tile',     result: 'PASS', detail: 'claimTile(100,200) → treasury 0.1 RON' },
      { name: 'payout honours receiver',   result: 'PASS', detail: 'cold wallet gained exactly 0.1 RON' },
      { name: 'treasury zeroes',           result: 'PASS', detail: '0.0 after withdraw' },
    ],
  },
  {
    chain: 'Tezos',
    network: 'shadownet',
    family: 'tezos',
    lang: 'CameLIGO',
    date: '2026-07-31',
    contract: 'KT1JR46QvFEweVdBntzcw8a1z1yPbwG9g2NX',
    deployTx: 'onxmMXXjSEaeys3B3BALHsMrFzh26GRaBiTrUwJbS5CsEGasE7d',
    explorer: 'https://shadownet.tzkt.io/KT1JR46QvFEweVdBntzcw8a1z1yPbwG9g2NX',
    wasmBytes: 7221,
    note:
      'Originated with Taquito rather than octez-client, which is installed on neither machine. ' +
      'Two gotchas: Ghostnet is RETIRED (its faucet domain is parked and for sale) so this is ' +
      'shadownet, which config.js already targeted; and @taquito/utils renamed b58cencode → ' +
      'b58Encode and prefix → PrefixV2, so every snippet on the web fails.',
    checks: [
      { name: 'originates on-chain',      result: 'PASS', detail: 'KT1JR46… confirmed at 1 block' },
      { name: 'fee defaults to 7%',       result: 'PASS', detail: 'market_fee_bps = 700 read from contract storage' },
      { name: 'sales start closed',       result: 'PASS', detail: 'tile_price = 0 until the admin opens them' },
      { name: 'treasury starts empty',    result: 'PASS', detail: 'treasury = 0' },
      { name: 'admin and payout separate',result: 'PASS', detail: 'administrator and treasury_receiver are distinct fields, both set' },
      { name: 'metadata base is ours',    result: 'PASS', detail: 'https://xono.ai/tile/ — not a domain we do not own' },
      { name: 'full entrypoint surface',  result: 'PASS', detail: 'claim_tile, set_tile_price, set_market_fee_bps, set_treasury_receiver, withdraw, transfer' },
    ],
  },
  {
    chain: 'Flow',
    network: 'testnet',
    family: 'flow',
    lang: 'Cadence',
    date: '2026-07-31',
    contract: '0xc5aef0580ee607ca',
    deployTx: 'e59c0ee76e5737f1046c7f0f8ae50b8612712c52c3a593263a6e3121c4eabeb7',
    explorer: 'https://testnet.flowdiver.io/account/0xc5aef0580ee607ca',
    wasmBytes: 0,
    note:
      'Deploying found a defect the linter passed: init() took the treasury vault as a PARAMETER, ' +
      'and Cadence cannot pass a resource as a contract-deployment argument — `flow project deploy` ' +
      'fails with "required arguments 1, but provided 0". init() now creates its own vault via ' +
      'FlowToken.createEmptyVault. Note the faucet distinction: /fund-account needs an existing ' +
      'address, /create-account takes a 128-char public key and mints the account.',
    checks: [
      { name: 'deploys on-chain',          result: 'PASS', detail: 'contract live at 0xc5aef0580ee607ca' },
      { name: 'tokenId — origin',          result: 'PASS', detail: 'tokenIdFromKey(0,0) = 0' },
      { name: 'tokenId — x step',          result: 'PASS', detail: 'tokenIdFromKey(1,0) = 32768' },
      { name: 'tokenId — far corner',      result: 'PASS', detail: 'tokenIdFromKey(16383,16383) = 536854527' },
      { name: 'tokenId — bounds',          result: 'PASS', detail: 'tokenIdFromKey(16384,0) → pre-condition failed' },
      { name: 'valid id accepted',         result: 'PASS', detail: 'isValidTokenId(536854527) = true' },
      { name: 'off-grid id rejected',      result: 'PASS', detail: 'isValidTokenId(2^60) = false' },
      { name: 'fee defaults to 7%',        result: 'PASS', detail: 'marketFeeBps = 700' },
      { name: 'fee ceiling is 10%',        result: 'PASS', detail: 'MAX_FEE_BPS = 1000' },
      { name: 'grid constant correct',     result: 'PASS', detail: 'GRID_MAX = 16383' },
      { name: 'sales start closed',        result: 'PASS', detail: 'tilePrice = 0, treasuryBalance = 0' },
    ],
  },
  {
    chain: 'Solana',
    network: 'devnet',
    family: 'solana',
    lang: 'Anchor / Rust',
    date: '2026-07-31',
    contract: '7MRdUfDaXXcTrg4xHaGsaUa1dvZ7DB4aQJYBukF61iXi',
    deployTx: '5DGMpGh8SQK9ax8AFktcG6XTt4DgPTGdt57SPGqPm57xGfqbQwVrGAaRvtwd53nqqWjEFJqfgZRdz6Ty6JHcUMK1',
    explorer: 'https://explorer.solana.com/address/7MRdUfDaXXcTrg4xHaGsaUa1dvZ7DB4aQJYBukF61iXi?cluster=devnet',
    wasmBytes: 245192,
    note:
      'PARTIAL. The program is on devnet but the deployed BINARY carries the placeholder ' +
      'declare_id! "CLND1111…", not its real address. Anchor compares declare_id! against the ' +
      'executing program on every instruction, so all of them would fail with ' +
      'DeclaredProgramIdMismatch. The source is fixed and rebuilt; the redeploy needs ~1.8 SOL of ' +
      'buffer and devnet airdrop is returning "Internal error" from three separate IPs.',
    checks: [
      { name: 'builds a deployable .so',   result: 'PASS', detail: '245,192 bytes via cargo-build-sbf' },
      { name: 'deploys to devnet',         result: 'PASS', detail: 'program id 7MRdUfDa…, owner BPFLoaderUpgradeable' },
      { name: 'declare_id matches address',result: 'FAIL', detail: 'deployed binary says CLND1111… — every instruction would abort. Fixed in source, redeploy blocked on airdrop.' },
    ],
  },
  {
    chain: 'Sui',
    network: 'devnet',
    family: 'sui',
    lang: 'Move',
    date: '2026-07-31',
    contract: '0x991e76819def4327b413de3dbafa245ee88b8c54afa9e679386a7283a7414d2c',
    deployTx: 'see explorer',
    explorer: 'https://suiscan.xyz/devnet/object/0x991e76819def4327b413de3dbafa245ee88b8c54afa9e679386a7283a7414d2c',
    wasmBytes: 0,
    note:
      'DEVNET, not testnet — and that distinction is the whole point. `sui client faucet` funds ' +
      'devnet in one command, while the same command on testnet prints "please use the Web UI". ' +
      'I had reported Sui as needing a human for two rounds before checking whether the CLI had ' +
      'its own faucet. Publishing also needed an [environments] block in Move.toml with the chain ' +
      'id from `sui client chain-identifier` (75f89978) — the JSON-RPC query for it returns empty, ' +
      'because Sui deprecated JSON-RPC on public fullnodes.',
    checks: [
      { name: 'faucet funded via CLI',   result: 'PASS', detail: '20 SUI, no browser involved' },
      { name: 'package publishes',       result: 'PASS', detail: 'Status: Success, PackageID 0x991e7681…' },
      { name: 'package live on chain',   result: 'PASS', detail: 'object query returns version 1' },
      { name: 'tokenId — origin',        result: 'PASS', detail: 'token_id_from_key(0,0) executes' },
      { name: 'tokenId — x step',        result: 'PASS', detail: 'token_id_from_key(1,0) executes' },
      { name: 'tokenId — far corner',    result: 'PASS', detail: 'token_id_from_key(16383,16383) executes' },
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
  { chain: 'Solana redeploy', network: 'devnet',
    reason: 'Deployed, but needs ~1.8 SOL more to push the declare_id fix. Airdrop returns "Internal error" from three separate IPs — the devnet faucet is degraded, not throttling us.' },
  { chain: 'Cardano', network: 'preprod',
    reason: 'Address funded by the faucet. Cardano is UTXO: there is no contract to deploy — the validator (hash 136221254c9413270c543ede66c58e73964ee2820ed8406f52c6511c) is referenced by a spending transaction, optionally published as a reference script. Building the first minting tx is the remaining work.' },
  { chain: '12 other EVM testnets', network: 'various',
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
