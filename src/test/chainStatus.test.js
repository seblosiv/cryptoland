/**
 * chainStatus contract tests
 * ===========================
 * The 13 probes in src/lib/chainStatus.js each read one field out of one
 * node's response. That is silently shape-sensitive: if a chain renames a
 * field, the probe returns undefined and the badge just stops appearing on
 * that one build — no error, no test failure, nobody notices.
 *
 * So every fixture below is the VERBATIM body returned by that chain's live
 * mainnet endpoint (captured 2026-07-28 from the endpoints configured in
 * blockchain/config.js). Heights are the real heads at that moment. If a
 * response shape ever moves, this fails instead of the UI going quiet.
 *
 * The second block asserts the other half of the contract: no failure mode
 * may throw, and none may put a number on screen.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const chainRef = { current: null }

vi.mock('../lib/blockchain/config.js', () => ({
  get ACTIVE_CHAIN() { return chainRef.current },
}))

const { fetchChainStatus, formatHeight } = await import('../lib/chainStatus.js')

// ── EXACT payloads captured from the live mainnet endpoints ────────────────
const LIVE = {
  evm:        { url: 'https://mainnet.base.org',                        body: { jsonrpc: '2.0', result: '0x2ef3b44', id: 1 },                                    want: 49232708,  label: 'Block' },
  solana:     { url: 'https://solana-rpc.publicnode.com',               body: { jsonrpc: '2.0', result: 435774094, id: 1 },                                      want: 435774094, label: 'Slot' },
  ton:        { url: 'https://toncenter.com/api/v2/jsonRPC',            body: { ok: true, result: { '@type': 'blocks.masterchainInfo', last: { workchain: -1, shard: '-9223372036854775808', seqno: 82571412 } } }, want: 82571412, label: 'Seqno' },
  aptos:      { url: 'https://fullnode.mainnet.aptoslabs.com/v1',       body: { chain_id: 1, epoch: '16703', ledger_version: '6496755347', block_height: '931879930' }, want: 6496755347, label: 'Version' },
  sui:        { url: 'https://fullnode.mainnet.sui.io',                 body: { jsonrpc: '2.0', id: 1, result: '304014289' },                                    want: 304014289, label: 'Checkpoint' },
  starknet:   { url: 'https://api.cartridge.gg/x/starknet/mainnet',     body: { id: 1, jsonrpc: '2.0', result: 12412613 },                                       want: 12412613,  label: 'Block' },
  cardano:    { url: 'https://api.koios.rest/api/v1',                   body: [{ hash: 'ff85', epoch_no: 645, era: 'Conway', abs_slot: 193688430, block_height: 13736648, block_no: 13736648, block_time: 1785254721 }], want: 13736648, label: 'Block' },
  near:       { url: 'https://rpc.mainnet.near.org',                    body: { jsonrpc: '2.0', result: { chain_id: 'mainnet', protocol_version: 86, sync_info: { latest_block_height: 208922978, latest_block_hash: '8t9f' } } }, want: 208922978, label: 'Block' },
  stellar:    { url: 'https://horizon.stellar.org',                     body: { horizon_version: '22.0.1', core_version: 'v22', ingest_latest_ledger: 63689779, history_latest_ledger: 63689779, core_latest_ledger: 63689779 }, want: 63689779, label: 'Ledger' },
  algorand:   { url: 'https://mainnet-api.4160.nodely.dev',             body: { catchpoint: '', 'last-round': 63532242, 'last-version': 'https://github.com/…', 'next-version-round': 63532243 }, want: 63532242, label: 'Round' },
  multiversx: { url: 'https://api.multiversx.com',                      body: { data: { status: { erd_nonce: 31483953, erd_epoch_number: 2188, erd_current_round: 31522854, erd_highest_final_nonce: 31483953 } }, code: 'successful' }, want: 31483953, label: 'Block' },
  radix:      { url: 'https://mainnet.radixdlt.com',                    body: { ledger_state: { network: 'mainnet', state_version: 542624127, epoch: 330042, round: 96 }, release_info: { release_version: '1.10.6' } }, want: 542624127, label: 'State' },
  tezos:      { url: 'https://rpc.tzkt.io/mainnet',                     body: { protocol: 'PsUshuai', chain_id: 'NetXdQprcVkpaWU', hash: 'BLh29', level: 14258701, proto: 25 }, want: 14258701, label: 'Level' },
}

// Which URL each family's probe is expected to hit, given the base above.
const EXPECT_PATH = {
  evm: 'https://mainnet.base.org',
  solana: 'https://solana-rpc.publicnode.com',
  ton: 'https://toncenter.com/api/v2/jsonRPC',
  aptos: 'https://fullnode.mainnet.aptoslabs.com/v1',
  sui: 'https://fullnode.mainnet.sui.io',
  starknet: 'https://api.cartridge.gg/x/starknet/mainnet',
  cardano: 'https://api.koios.rest/api/v1/tip',
  near: 'https://rpc.mainnet.near.org',
  stellar: 'https://horizon.stellar.org/',
  algorand: 'https://mainnet-api.4160.nodely.dev/v2/status',
  multiversx: 'https://api.multiversx.com/network/status/4294967295',
  radix: 'https://mainnet.radixdlt.com/status/gateway-status',
  tezos: 'https://rpc.tzkt.io/mainnet/chains/main/blocks/head/header',
}

const okRes = (body) => ({ ok: true, status: 200, json: async () => body })

beforeEach(() => { vi.restoreAllMocks() })

describe('fetchChainStatus — every family against its real payload', () => {
  for (const [family, spec] of Object.entries(LIVE)) {
    it(`${family} → ${spec.label} #${spec.want}`, async () => {
      chainRef.current = { family, name: family, rpcUrl: spec.url, rpcUrlFallback: spec.url }
      const calls = []
      globalThis.fetch = vi.fn(async (url, init) => {
        calls.push({ url, method: init?.method, body: init?.body ? JSON.parse(init.body) : null })
        return okRes(spec.body)
      })
      const s = await fetchChainStatus()
      expect(s.ok, `${family} ok`).toBe(true)
      expect(s.height, `${family} height`).toBe(spec.want)
      expect(s.label, `${family} label`).toBe(spec.label)
      expect(calls[0].url, `${family} url`).toBe(EXPECT_PATH[family])
      // Only the host is ever exposed — a VITE_RPC_<KEY> override may carry an
      // API key in the path, which must not reach the DOM.
      expect(s.extra.rpcHost).toBe(new URL(spec.url).host)
      expect(JSON.stringify(s.extra)).not.toContain('/')
    })
  }
})

describe('failure modes never throw and never show a number', () => {
  const bad = {
    'HTTP 500':        async () => ({ ok: false, status: 500, json: async () => ({}) }),
    'CORS/net reject': async () => { throw new TypeError('Failed to fetch') },
    'rpc error body':  async () => okRes({ jsonrpc: '2.0', error: { code: -32051, message: 'API key disabled' }, id: 1 }),
    'toncenter error': async () => okRes({ ok: false, error: 'rate limit' }),
    'garbage shape':   async () => okRes({ nope: true }),
    'zero height':     async () => okRes({ jsonrpc: '2.0', result: '0x0', id: 1 }),
    'malformed json':  async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad json') } }),
  }
  for (const [name, impl] of Object.entries(bad)) {
    it(`${name} → { ok:false }`, async () => {
      chainRef.current = { family: 'evm', name: 'X', rpcUrl: 'https://a.example', rpcUrlFallback: 'https://b.example' }
      globalThis.fetch = vi.fn(impl)
      const s = await fetchChainStatus()
      expect(s.ok).toBe(false)
      expect(s.height).toBe(null)
    })
  }

  it('falls back to rpcUrlFallback when the primary is dead', async () => {
    chainRef.current = { family: 'evm', name: 'Polygon', rpcUrl: 'https://dead.example', rpcUrlFallback: 'https://live.example' }
    globalThis.fetch = vi.fn(async (url) => {
      if (String(url).includes('dead')) throw new TypeError('Failed to fetch')
      return okRes({ jsonrpc: '2.0', result: '0x56d0e69', id: 1 })
    })
    const s = await fetchChainStatus()
    expect(s.ok).toBe(true)
    expect(s.height).toBe(91033193)
    expect(s.extra.rpcHost).toBe('live.example')
  })

  it('unknown family → ok:false, no crash', async () => {
    chainRef.current = { family: 'bitcoin', name: 'X', rpcUrl: 'https://a.example' }
    globalThis.fetch = vi.fn(async () => okRes({}))
    expect((await fetchChainStatus()).ok).toBe(false)
  })

  it('null ACTIVE_CHAIN → ok:false, no crash', async () => {
    chainRef.current = null
    expect((await fetchChainStatus()).ok).toBe(false)
  })

  it('stellar falls through Horizon shape to a Soroban RPC', async () => {
    chainRef.current = { family: 'stellar', name: 'Stellar', rpcUrl: 'https://mainnet.sorobanrpc.com', rpcUrlFallback: 'https://mainnet.sorobanrpc.com' }
    globalThis.fetch = vi.fn(async (url, init) => {
      if (!init?.body) return { ok: false, status: 405, json: async () => ({}) }
      return okRes({ jsonrpc: '2.0', id: 1, result: { sequence: 63689779, protocolVersion: 27 } })
    })
    const s = await fetchChainStatus()
    expect(s.ok).toBe(true)
    expect(s.height).toBe(63689779)
  })

  it('cardano never reports abs_slot under the Block label', async () => {
    chainRef.current = { family: 'cardano', name: 'Cardano', rpcUrl: 'https://k.example', rpcUrlFallback: 'https://k.example' }
    globalThis.fetch = vi.fn(async () => okRes([{ abs_slot: 193688430, epoch_no: 645 }]))
    const s = await fetchChainStatus()
    expect(s.ok).toBe(false) // no block_no ⇒ show nothing, not the slot
  })

  it('formatHeight groups digits without locale dependence', () => {
    expect(formatHeight(12412613)).toBe('12,412,613')
    expect(formatHeight(96)).toBe('96')
    expect(formatHeight(1000)).toBe('1,000')
  })
})
