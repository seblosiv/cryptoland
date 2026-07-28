/**
 * chainStatus.js — live proof-of-connection to the active chain
 * ==============================================================
 * Every CryptoLand bundle is branded for exactly one chain. Branding alone
 * proves nothing: a reviewer looking at the Algorand build has no way to tell
 * whether it actually talks to Algorand or just painted itself teal.
 *
 * This module answers that by reading the CURRENT HEAD of the chain this build
 * targets, straight from that chain's OWN public RPC (ACTIVE_CHAIN.rpcUrl —
 * overridable per deployment with VITE_RPC_<KEY>). A number that advances every
 * few seconds, in that chain's own unit, is something you cannot fake with CSS.
 *
 *   fetchChainStatus() → { ok, height, label, extra }
 *
 *   ok      false whenever anything at all goes wrong. NEVER throws, never
 *           rejects — callers render nothing rather than a broken/zero state.
 *   height  the chain head as a finite positive Number.
 *   label   what THAT chain calls the unit: Block / Slot / Round / Ledger /
 *           Checkpoint / Level / Seqno / Version / State. Using the ecosystem's
 *           own vocabulary is the point — "Slot" on Solana, "Round" on Algorand.
 *   extra   small object of genuine side-facts from the same response
 *           (epoch, chain name, RPC host). Never invented, never estimated.
 *
 * Per family, the REAL node method — all verified against the live mainnet
 * endpoints configured in blockchain/config.js:
 *
 *   evm         POST eth_blockNumber                        → hex   → Block
 *   solana      POST getSlot                                 → num   → Slot
 *   ton         POST getMasterchainInfo → last.seqno         → num   → Seqno
 *   aptos       GET  <rpc>            → ledger_version       → str   → Version
 *   sui         POST sui_getLatestCheckpointSequenceNumber   → str   → Checkpoint
 *   starknet    POST starknet_blockNumber                    → num   → Block
 *   cardano     GET  <rpc>/tip        → [0].block_no         → num   → Block
 *   near        POST status → sync_info.latest_block_height  → num   → Block
 *   stellar     GET  <rpc>/           → core_latest_ledger   → num   → Ledger
 *   algorand    GET  <rpc>/v2/status  → last-round           → num   → Round
 *   multiversx  GET  <rpc>/network/status/4294967295 → erd_nonce     → Block
 *   radix       POST <rpc>/status/gateway-status → state_version     → State
 *   tezos       GET  <rpc>/chains/main/blocks/head/header → level     → Level
 *
 * Notes on two deliberate choices:
 *
 *  - MultiversX uses /network/status/4294967295 (the metachain), NOT /stats.
 *    `/stats.blocks` is a CUMULATIVE count of blocks ever produced across all
 *    shards, not a chain head — rendering it as "Block #…" would put a number
 *    on screen that means something other than what the label claims.
 *  - Cardano uses block_no (a block height, matching the "Block" label) and
 *    keeps abs_slot in `extra`. A slot number is not a block number and must
 *    not be shown under a Block label.
 *
 * Only the RPC HOST is ever exposed in `extra` — never the full URL, because a
 * deployment may inject a paid endpoint whose API key sits in the path
 * (VITE_RPC_<KEY>), and that must not reach the DOM.
 */

import { ACTIVE_CHAIN } from './blockchain/config.js'

/** A single endpoint attempt gets this long before we move on. */
const TIMEOUT_MS = 6000

/** The unit each ecosystem uses for its own chain head. */
const LABELS = {
  evm:        'Block',
  solana:     'Slot',
  ton:        'Seqno',
  aptos:      'Version',
  sui:        'Checkpoint',
  starknet:   'Block',
  cardano:    'Block',
  near:       'Block',
  stellar:    'Ledger',
  algorand:   'Round',
  multiversx: 'Block',
  radix:      'State',
  tezos:      'Level',
}

const OFFLINE = Object.freeze({ ok: false, height: null, label: null, extra: null })

/** Strip trailing slashes so `${base}/path` never produces a double slash. */
const base = (u) => String(u).replace(/\/+$/, '')

/**
 * Coerce an RPC value to a finite Number. Chains return their head as a JS
 * number (Starknet), a decimal string (Aptos, Sui) or 0x-hex (all EVM), and
 * every real height is well inside Number.MAX_SAFE_INTEGER.
 */
function toNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN
  if (typeof v === 'string' && v.trim() !== '') {
    const s = v.trim()
    const n = /^0x/i.test(s) ? parseInt(s, 16) : Number(s)
    return Number.isFinite(n) ? n : NaN
  }
  return NaN
}

/** Host only — see the API-key note in the module header. */
function hostOf(url) {
  try { return new URL(url).host } catch { return null }
}

/** Run `fn(signal)` with an abort deadline so a hung node can't wedge the badge. */
async function withTimeout(fn, ms = TIMEOUT_MS) {
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null
  const timer = setTimeout(() => ctrl?.abort(), ms)
  try {
    return await fn(ctrl?.signal)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * One request. `body` present ⇒ POST JSON, otherwise a plain GET.
 * GET sends only `Accept`, which is CORS-safelisted, so it never triggers a
 * preflight the way a Content-Type header would.
 */
async function req(url, { signal, body } = {}) {
  const init = body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal }
    : { method: 'GET', headers: { Accept: 'application/json' }, signal }
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/** JSON-RPC 2.0 call. Also covers toncenter, which wraps results the same way. */
async function rpc(url, method, params, signal) {
  const j = await req(url, { signal, body: { jsonrpc: '2.0', id: 1, method, params } })
  // toncenter answers { ok:false, error:"…" }; every other node uses { error:{…} }.
  if (j?.error) throw new Error(typeof j.error === 'string' ? j.error : (j.error?.message ?? 'rpc error'))
  return j?.result
}

/**
 * family → (url, signal) => { height, extra }
 * Each probe throws on anything unexpected; fetchChainStatus() catches.
 */
const PROBES = {
  async evm(url, signal) {
    const r = await rpc(url, 'eth_blockNumber', [], signal)
    return { height: toNum(r) }
  },

  async solana(url, signal) {
    const r = await rpc(url, 'getSlot', [], signal)
    return { height: toNum(r) }
  },

  async ton(url, signal) {
    // toncenter v2 takes an OBJECT for params, not an array.
    const r = await rpc(url, 'getMasterchainInfo', {}, signal)
    return { height: toNum(r?.last?.seqno), extra: { workchain: r?.last?.workchain } }
  },

  async aptos(url, signal) {
    // rpcUrl already ends in /v1 — the node's ledger info is that root itself.
    const j = await req(base(url), { signal })
    return {
      height: toNum(j?.ledger_version),
      extra: { epoch: toNum(j?.epoch), blockHeight: toNum(j?.block_height) },
    }
  },

  async sui(url, signal) {
    const r = await rpc(url, 'sui_getLatestCheckpointSequenceNumber', [], signal)
    return { height: toNum(r) }
  },

  async starknet(url, signal) {
    const r = await rpc(url, 'starknet_blockNumber', [], signal)
    return { height: toNum(r) }
  },

  async cardano(url, signal) {
    const j = await req(`${base(url)}/tip`, { signal })
    const tip = Array.isArray(j) ? j[0] : j
    return {
      // block_no is the block height. abs_slot is a SLOT and is reported
      // separately — never as the "Block" figure.
      height: toNum(tip?.block_no ?? tip?.block_height),
      extra: { epoch: toNum(tip?.epoch_no), absSlot: toNum(tip?.abs_slot) },
    }
  },

  async near(url, signal) {
    const r = await rpc(url, 'status', [], signal)
    return {
      height: toNum(r?.sync_info?.latest_block_height),
      extra: { protocolVersion: toNum(r?.protocol_version) },
    }
  },

  async stellar(url, signal) {
    const root = base(url)
    try {
      // Horizon root document.
      const j = await req(`${root}/`, { signal })
      const h = toNum(j?.core_latest_ledger ?? j?.history_latest_ledger ?? j?.ingest_latest_ledger)
      if (Number.isFinite(h)) return { height: h, extra: { horizon: j?.horizon_version ?? null } }
    } catch {
      // Not a Horizon host — fall through to the Soroban RPC shape below.
    }
    const r = await rpc(root, 'getLatestLedger', undefined, signal)
    return { height: toNum(r?.sequence), extra: { protocolVersion: toNum(r?.protocolVersion) } }
  },

  async algorand(url, signal) {
    const j = await req(`${base(url)}/v2/status`, { signal })
    return { height: toNum(j?.['last-round']) }
  },

  async multiversx(url, signal) {
    // 4294967295 is the metachain shard id; erd_nonce is its block height.
    const j = await req(`${base(url)}/network/status/4294967295`, { signal })
    const s = j?.data?.status ?? j?.status
    return {
      height: toNum(s?.erd_nonce),
      extra: { epoch: toNum(s?.erd_epoch_number), round: toNum(s?.erd_current_round) },
    }
  },

  async radix(url, signal) {
    // The Babylon Gateway is REST, not JSON-RPC — an empty JSON body is required.
    const j = await req(`${base(url)}/status/gateway-status`, { signal, body: {} })
    const ls = j?.ledger_state
    return {
      height: toNum(ls?.state_version),
      extra: { epoch: toNum(ls?.epoch), round: toNum(ls?.round) },
    }
  },

  async tezos(url, signal) {
    const j = await req(`${base(url)}/chains/main/blocks/head/header`, { signal })
    return { height: toNum(j?.level), extra: { chainId: j?.chain_id ?? null } }
  },
}

/** Group digits without depending on locale (toLocaleString varies per host). */
export function formatHeight(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/**
 * Read the live head of the chain this build targets.
 *
 * Tries ACTIVE_CHAIN.rpcUrl, then rpcUrlFallback. Resolves to `{ ok:false }`
 * for any failure — dead node, CORS refusal, timeout, unexpected shape, a
 * height that isn't a positive finite number. It never throws and never
 * rejects, so no caller needs a try/catch and no render path can break.
 *
 * @returns {Promise<{ok:boolean,height:number|null,label:string|null,extra:object|null}>}
 */
export async function fetchChainStatus() {
  try {
    if (typeof fetch !== 'function') return OFFLINE

    const chain = ACTIVE_CHAIN
    const probe = PROBES[chain?.family]
    const label = LABELS[chain?.family]
    if (!probe || !label) return OFFLINE

    // rpcUrlFallback defaults to rpcUrl in config.js, hence the dedupe.
    const urls = [...new Set([chain.rpcUrl, chain.rpcUrlFallback].filter(Boolean))]

    for (const url of urls) {
      try {
        const { height, extra } = await withTimeout((signal) => probe(url, signal))
        if (!Number.isFinite(height) || height <= 0) continue
        // Drop NaN/null side-facts so `extra` only ever carries real values.
        const facts = Object.fromEntries(
          Object.entries(extra ?? {}).filter(([, v]) => v !== null && v !== undefined && !Number.isNaN(v))
        )
        return {
          ok: true,
          height,
          label,
          extra: { chain: chain.name, rpcHost: hostOf(url), ...facts },
        }
      } catch {
        // This endpoint is unreachable/refused — try the next one.
      }
    }
    return OFFLINE
  } catch {
    // Belt and braces: nothing in here may ever surface as a rejected promise.
    return OFFLINE
  }
}

export default fetchChainStatus
