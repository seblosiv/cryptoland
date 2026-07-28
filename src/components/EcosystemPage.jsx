/**
 * EcosystemPage — /ecosystem
 * ===========================
 * The page we link from a grant application. It answers, in the order a chain's
 * grant reviewer actually asks them:
 *
 *   1. WHO      — whose app is this, on which chain, and what is it
 *   2. TRACTION — live numbers from GET /metrics/grant, never estimates
 *   3. NATIVE   — a spec table proving the integration is real, not a logo swap
 *   4. WHY      — why this chain specifically, and what the grant funds
 *   5. CTA      — one way into the product
 *
 * Every chain-specific word comes from PROFILE (src/lib/chainProfile.js) and
 * every chain-specific fact from ACTIVE_CHAIN (src/lib/blockchain/config.js), so
 * this file is written once and reads as chain-native on all 29 builds.
 *
 * TRUTH RULES this file is bound by — a reviewer will check:
 *   - Every number rendered comes from a /metrics/grant response field. There
 *     are no fallbacks, no placeholders and no rounded-up figures. If the fetch
 *     fails the whole traction section renders NOTHING rather than zeros, since
 *     a zero here would read as "no traction" rather than "no data".
 *   - Contract status is read from ACTIVE_CHAIN.contractAddress. With no address
 *     configured we say so plainly. We never imply a deployed contract.
 *   - The seeded-data disclosure under the traction block is not optional. Every
 *     per-chain world ships seeded (server/seed_chain.py); a reviewer who finds
 *     that out on their own is a lost grant.
 *
 * Deliberately NOT instrumented: firing analytics here would put grant reviewers
 * into the DAU figure this very page reports. The page must not move its own
 * numbers.
 *
 * Design: same solid-dark language as the app — opaque surfaces, hairline
 * borders, one accent. No glass, no blur, no per-chain visual language.
 */

import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { PROFILE, ACTIVE_CHAIN_KEY } from '../lib/chainProfile.js'
import { ACTIVE_CHAIN, ACTIVE_CHAIN_CANONICAL } from '../lib/blockchain/config.js'
import { logoFor } from './logos'
import ChainHero from './ChainHero'

const ACCENT     = 'var(--chain-accent, var(--green))'
const ACCENT_DIM = 'var(--chain-accent-dim, var(--green-d))'

/** Resolved at module scope — ACTIVE_CHAIN_KEY is fixed for the whole build. */
const ChainLogo = logoFor(ACTIVE_CHAIN_KEY)

/** Grid facts, from src/lib/tiles.js Z14 constants. 16384² = 268,435,456. */
const GRID_SIDE  = 16384
const GRID_TOTAL = GRID_SIDE * GRID_SIDE

/** True when this build reads a backend shared with other chains' deployments. */
const SCOPED = Boolean(import.meta.env.VITE_SCOPE_TO_CHAIN)

const METRICS_DAYS = 30

const nf = new Intl.NumberFormat('en-US')
const int = (v) => nf.format(Math.round(Number(v) || 0))
const usd = (v) => {
  const n = Number(v) || 0
  return '$' + new Intl.NumberFormat('en-US', {
    maximumFractionDigits: n >= 1000 ? 0 : 2,
  }).format(n)
}

/* ── Small building blocks ─────────────────────────────────────────────────── */

function SectionHead({ eyebrow, title, note }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span className="label" style={{ color: ACCENT, letterSpacing: '0.16em' }}>{eyebrow}</span>
        <span style={{ flex: 1, height: 1, background: 'var(--b1)' }} />
      </div>
      <h2 style={{
        fontSize: 'clamp(19px,3.4vw,24px)', fontWeight: 800,
        letterSpacing: '-0.02em', color: 'var(--t1)',
      }}>{title}</h2>
      {note && (
        <p style={{ marginTop: 6, fontSize: 12.5, lineHeight: 1.6, color: 'var(--t3)' }}>{note}</p>
      )}
    </div>
  )
}

/** One metric. `value` is always pre-formatted from a real API field. */
function Stat({ value, label, accent = false }) {
  return (
    <div className="card" style={{ padding: '14px 14px 12px', border: '1px solid var(--b0)' }}>
      <div style={{
        fontFamily: 'var(--font)', fontWeight: 800,
        fontSize: 'clamp(20px,4.6vw,27px)', letterSpacing: '-0.02em',
        lineHeight: 1.1, color: accent ? ACCENT : 'var(--t1)',
      }}>{value}</div>
      <div className="label" style={{ marginTop: 5 }}>{label}</div>
    </div>
  )
}

/** One row of the integration spec table. */
function SpecRow({ k, children }) {
  return (
    <div className="eco-row">
      <div className="label" style={{ paddingTop: 1 }}>{k}</div>
      <div style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--t1)', minWidth: 0 }}>{children}</div>
    </div>
  )
}

/**
 * Daily-actives sparkline. Plain divs, no chart library.
 *
 * `/metrics/grant` returns only the days that had events, keyed by `days_ago`
 * (0 = the last 24h). Missing days are genuinely zero-activity days, so filling
 * the gaps with 0 is accurate rather than invented — but a chart of all zeros
 * would be noise, so the whole sparkline is suppressed when nothing happened.
 */
function Sparkline({ timeseries, days }) {
  const buckets = new Array(days).fill(0)
  for (const row of timeseries || []) {
    const i = days - 1 - Number(row.days_ago)      // oldest → newest, left → right
    if (i >= 0 && i < days) buckets[i] = Number(row.active_users) || 0
  }
  const max = Math.max(...buckets)
  if (!(max > 0)) return null

  return (
    <div className="card" style={{ padding: '14px 14px 11px', border: '1px solid var(--b0)' }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 10, marginBottom: 12,
      }}>
        <span className="label">Daily active users · last {days} days</span>
        <span className="mono" style={{ color: 'var(--t3)' }}>peak {int(max)}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 52 }}
           role="img"
           aria-label={`Daily active users over the last ${days} days, peaking at ${max}`}>
        {buckets.map((v, i) => (
          <div key={i} title={`${days - 1 - i === 0 ? 'today' : `${days - 1 - i}d ago`}: ${int(v)}`}
               style={{
                 flex: 1, minWidth: 2, borderRadius: 1.5,
                 height: `${Math.max(v > 0 ? 8 : 2, Math.round((v / max) * 100))}%`,
                 background: v > 0 ? ACCENT : 'var(--b1)',
                 opacity: v > 0 ? 0.55 + 0.45 * (v / max) : 1,
               }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 7 }}>
        <span className="label" style={{ color: 'var(--t4)' }}>{days}d ago</span>
        <span className="label" style={{ color: 'var(--t4)' }}>today</span>
      </div>
    </div>
  )
}

/* ── Page ──────────────────────────────────────────────────────────────────── */

export default function EcosystemPage() {
  const [metrics, setMetrics] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    api.fetchGrantMetrics(METRICS_DAYS, SCOPED ? ACTIVE_CHAIN_CANONICAL : null)
      .then(m => { if (alive) setMetrics(m) })
      // Swallow deliberately: a failed fetch means the traction section renders
      // nothing at all. Showing zeros would misrepresent the deployment.
      .catch(() => { if (alive) setMetrics(null) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const ob       = PROFILE.onboarding ?? {}
  const cur      = ACTIVE_CHAIN.nativeCurrency ?? {}
  const contract = ACTIVE_CHAIN.contractAddress
  const contractUrl = contract
    ? `${ACTIVE_CHAIN.explorerUrl}${ACTIVE_CHAIN.explorerNFTPath}${contract}`
    : null

  const goToGame = () => {
    window.history.pushState({}, '', '/')
    window.dispatchEvent(new Event('popstate'))
  }

  // Economy figures: on a shared backend this build must report only its own
  // chain's rows, or an Algorand page would quote Polygon's volume.
  const chainRow = SCOPED
    ? (metrics?.by_chain ?? []).find(r => r.chain === ACTIVE_CHAIN_CANONICAL)
      ?? { tiles: 0, owners: 0, volume_usd: 0 }
    : null

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--bg)',
      overflowY: 'auto', overflowX: 'hidden',
      WebkitOverflowScrolling: 'touch',
    }}>
      {/* Layout-only rules. Inline styles cannot express media queries, and the
          page must hold together at 380px. No colours, no surfaces here — those
          stay on the shared classes. */}
      <style>{`
        .eco-wrap { max-width: 1000px; margin: 0 auto;
                    padding: max(16px, var(--sat)) 16px 88px; }
        .eco-grid { display: grid; gap: 8px; grid-template-columns: repeat(2, minmax(0,1fr)); }
        .eco-two  { display: grid; gap: 12px; grid-template-columns: minmax(0,1fr); }
        .eco-row  { display: grid; gap: 3px; grid-template-columns: minmax(0,1fr);
                    padding: 12px 14px; border-bottom: 1px solid var(--b0); }
        .eco-row:last-child { border-bottom: none; }
        @media (min-width: 560px) {
          .eco-grid { grid-template-columns: repeat(4, minmax(0,1fr)); }
          .eco-row  { grid-template-columns: 178px minmax(0,1fr);
                      gap: 18px; align-items: baseline; padding: 13px 18px; }
        }
        @media (min-width: 760px) {
          .eco-wrap { padding: max(22px, var(--sat)) 28px 110px; }
          .eco-two  { grid-template-columns: repeat(2, minmax(0,1fr)); }
        }
      `}</style>

      <div className="eco-wrap allow-select">

        {/* ── Top bar ─────────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, padding: '6px 0 22px',
        }}>
          <a href="/" onClick={(e) => { e.preventDefault(); goToGame() }}
             style={{
               fontFamily: 'var(--font)', fontWeight: 900,
               fontSize: 20, letterSpacing: '-0.02em',
               color: 'var(--t1)', textDecoration: 'none', whiteSpace: 'nowrap',
             }}>
            CRYPTO<span style={{ color: ACCENT }}>LAND</span>
          </a>
          <button onClick={goToGame} className="btn-ghost"
                  style={{ height: 36, fontSize: 13, padding: '0 16px' }}>
            Open the map →
          </button>
        </div>

        {/* ── 1. WHO ──────────────────────────────────────────────────────── */}
        <section className="panel" style={{
          position: 'relative', overflow: 'hidden',
          border: '1px solid var(--b1)', marginBottom: 34,
        }}>
          <ChainHero height={210} radius={20} />
          <div style={{ position: 'relative', padding: 'clamp(20px,4.6vw,34px)' }}>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
              <div style={{
                width: 54, height: 54, flexShrink: 0, borderRadius: '50%',
                background: 'var(--s2)', border: '1px solid var(--b1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 0 0 5px ${ACCENT_DIM}`,
                // The logomarks are monochrome and paint with `currentColor`,
                // so setting colour here tints this chain's mark to its accent.
                color: ACCENT,
              }}>
                {ChainLogo
                  ? <ChainLogo size={27} />
                  : <span style={{ fontSize: 24 }}>{ACTIVE_CHAIN.logo}</span>}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span className="badge badge-dim">{ACTIVE_CHAIN.name}</span>
                <span className="badge badge-dim">{ACTIVE_CHAIN.family} adapter</span>
                <span className="badge badge-dim">{ACTIVE_CHAIN.testnet ? 'Testnet build' : 'Mainnet build'}</span>
                {ACTIVE_CHAIN.gasless && <span className="badge badge-dim">Gasless</span>}
              </div>
            </div>

            <h1 style={{
              fontSize: 'clamp(28px,6.2vw,46px)', fontWeight: 900,
              letterSpacing: '-0.035em', lineHeight: 1.04,
              color: 'var(--t1)', marginBottom: 12,
            }}>
              CryptoLand on <span style={{ color: ACCENT }}>{PROFILE.ecosystem}</span>
            </h1>

            <p className="label" style={{ letterSpacing: '0.18em', marginBottom: 18 }}>
              {PROFILE.tagline}
            </p>

            {(PROFILE.pitch || ob.why) && (
              <p style={{
                fontSize: 'clamp(14.5px,2.6vw,17px)', lineHeight: 1.65,
                color: 'var(--t2)', maxWidth: 640,
              }}>
                {PROFILE.pitch || ob.why}
              </p>
            )}

            <p style={{ marginTop: 18, fontSize: 13, lineHeight: 1.65, color: 'var(--t3)', maxWidth: 640 }}>
              A geospatial territory game on a {int(GRID_SIDE)} × {int(GRID_SIDE)} tile grid over
              the real world — {int(GRID_TOTAL)} claimable tiles, each roughly 2.4 km².
              Players buy, customise, trade, raid and govern land, with AI Guardian agents
              defending it while they are offline.
            </p>
          </div>
        </section>

        {/* ── 2. TRACTION ─────────────────────────────────────────────────── */}
        {loading && (
          <div style={{ padding: '30px 0 40px', color: 'var(--t3)', fontSize: 13 }}>
            Loading live metrics…
          </div>
        )}

        {/* Nothing is rendered when the fetch failed — see the truth rules above. */}
        {!loading && metrics && (
          <section style={{ marginBottom: 34 }}>
            <SectionHead
              eyebrow="Traction"
              title="Live from this deployment"
              note={`Read at page load from GET /metrics/grant?days=${metrics.window_days}${
                SCOPED ? `, economy figures scoped to the "${ACTIVE_CHAIN_CANONICAL}" rows` : ''
              }.`}
            />

            <div className="eco-grid" style={{ marginBottom: 8 }}>
              <Stat accent value={int(metrics.users.dau)} label="DAU · 24h" />
              <Stat value={int(metrics.users.wau)} label="WAU · 7d" />
              <Stat value={int(metrics.users.mau)} label="MAU · 30d" />
              <Stat value={int(metrics.users.registered_accounts)} label="Registered accounts" />
            </div>

            <div className="eco-grid" style={{ marginBottom: 8 }}>
              <Stat value={`${metrics.users.retention_d1_pct}%`} label="D1 retention" />
              <Stat value={`${metrics.users.retention_d7_pct}%`} label="D7 retention" />
              <Stat value={int(metrics.engagement.guardians_deployed)} label="Guardians deployed" />
              <Stat value={int(metrics.economy.nft_mints_onchain)} label="On-chain mints" />
            </div>

            <div className="eco-grid" style={{ marginBottom: 8 }}>
              <Stat value={int(chainRow ? chainRow.tiles : metrics.economy.tiles_sold_total)}
                    label="Tiles sold" />
              <Stat value={int(chainRow ? chainRow.owners : metrics.economy.unique_owners)}
                    label="Unique owners" />
              <Stat value={usd(chainRow ? chainRow.volume_usd : metrics.economy.volume_usd_total)}
                    label="Volume · all time" />
              <Stat value={int(metrics.economy.tiles_sold_window)}
                    label={`Tiles · last ${metrics.window_days}d`} />
            </div>

            <Sparkline timeseries={metrics.timeseries} days={metrics.window_days} />

            <p style={{ marginTop: 12, fontSize: 12, lineHeight: 1.65, color: 'var(--t3)' }}>
              Every figure above is read live from this deployment's database at page load —
              none are cached, estimated or edited. This world was seeded with demo accounts
              at deploy time, and these totals do not separate seeded activity from organic
              activity. The same endpoint is available to reviewers at
              {' '}<span className="mono" style={{ color: 'var(--t2)' }}>/metrics/grant</span>.
            </p>
          </section>
        )}

        {/* ── 3. NATIVE INTEGRATION ───────────────────────────────────────── */}
        <section style={{ marginBottom: 34 }}>
          <SectionHead
            eyebrow="Native integration"
            title={`How CryptoLand uses ${PROFILE.ecosystem}`}
            note={`This build targets ${ACTIVE_CHAIN.name} only. The chain is selected at build time, not switched at runtime, so the wallet flow, the token model and the copy are ${PROFILE.ecosystem}'s throughout.`}
          />

          <div className="panel" style={{ border: '1px solid var(--b1)', overflow: 'hidden' }}>
            <SpecRow k="Network">
              {ACTIVE_CHAIN.name}
              <span className="mono" style={{ color: 'var(--t3)', marginLeft: 8 }}>
                id {String(ACTIVE_CHAIN.id)}
              </span>
            </SpecRow>

            <SpecRow k="Native currency">
              {cur.name} ({cur.symbol}) · {cur.decimals} decimals
            </SpecRow>

            <SpecRow k="Adapter family">
              <span className="mono" style={{ color: 'var(--t1)' }}>{ACTIVE_CHAIN.family}</span>
              <span style={{ color: 'var(--t3)' }}>
                {' '}— src/lib/blockchain/adapters/{ACTIVE_CHAIN.family}.js
              </span>
            </SpecRow>

            <SpecRow k="A tile is">
              {ob.nativeTerm ?? 'a non-fungible token'} owned by the player's wallet.
            </SpecRow>

            <SpecRow k="Token ID">
              <span className="mono" style={{ color: 'var(--t1)' }}>(tileX &lt;&lt; 15) | tileY</span>
              <span style={{ color: 'var(--t3)' }}>
                {' '}— bit-packed, so a token ID maps back to exactly one place on Earth.
              </span>
            </SpecRow>

            <SpecRow k="Wallets">
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(PROFILE.wallets ?? []).map(w => (
                  <span key={w.id} className="pill" style={{
                    padding: '4px 11px', fontSize: 12, color: 'var(--t2)',
                    border: '1px solid var(--b1)', whiteSpace: 'nowrap',
                  }}>
                    <span aria-hidden="true">{w.icon}</span> {w.name}
                  </span>
                ))}
              </span>
            </SpecRow>

            <SpecRow k="Fees">
              {ACTIVE_CHAIN.gasless
                ? `Gas is sponsored on ${ACTIVE_CHAIN.name} — players pay no transaction fee.`
                : (ob.feeNote ?? `Transaction fees are paid in ${cur.symbol}.`)}
            </SpecRow>

            <SpecRow k="Block time">
              {ACTIVE_CHAIN.blockTime}s
              <span style={{ color: 'var(--t3)' }}>
                {' '}· {ACTIVE_CHAIN.confirmations} confirmation
                {ACTIVE_CHAIN.confirmations === 1 ? '' : 's'} before a claim is treated as final
              </span>
            </SpecRow>

            <SpecRow k="Explorer">
              <a href={ACTIVE_CHAIN.explorerUrl} target="_blank" rel="noreferrer"
                 className="mono" style={{ color: ACCENT, wordBreak: 'break-all' }}>
                {ACTIVE_CHAIN.explorerUrl}
              </a>
            </SpecRow>

            <SpecRow k="Contract">
              {contract ? (
                <a href={contractUrl} target="_blank" rel="noreferrer"
                   className="mono" style={{ color: ACCENT, wordBreak: 'break-all' }}>
                  {contract}
                </a>
              ) : (
                <>
                  <span style={{ color: 'var(--amber)', fontWeight: 600 }}>
                    Not yet deployed — mint stubbed.
                  </span>
                  <span style={{ color: 'var(--t2)' }}>
                    {' '}Purchases, ownership and transfers are live and recorded server-side;
                    the on-chain mint returns <span className="mono">{'{ minted: false }'}</span>
                    {' '}until this build's contract address is configured. We would rather say
                    that here than let you find it out yourself.
                  </span>
                </>
              )}
            </SpecRow>
          </div>
        </section>

        {/* ── 4. WHY THIS CHAIN ───────────────────────────────────────────── */}
        {(ob.why || ob.grantAngle) && (
          <section style={{ marginBottom: 34 }}>
            <SectionHead eyebrow="Why this chain" title={`Why ${PROFILE.ecosystem}, specifically`} />
            <div className="eco-two">
              {ob.why && (
                <div className="card" style={{ padding: 20, border: '1px solid var(--b0)' }}>
                  <div className="label" style={{ color: ACCENT, marginBottom: 9 }}>
                    The technical fit
                  </div>
                  <p style={{ fontSize: 14.5, lineHeight: 1.68, color: 'var(--t2)' }}>{ob.why}</p>
                </div>
              )}
              {ob.grantAngle && (
                <div className="card" style={{ padding: 20, border: '1px solid var(--b0)' }}>
                  <div className="label" style={{ color: ACCENT, marginBottom: 9 }}>
                    What it gives players
                  </div>
                  <p style={{ fontSize: 14.5, lineHeight: 1.68, color: 'var(--t2)' }}>{ob.grantAngle}</p>
                </div>
              )}
            </div>
            {PROFILE.grantProgram && (
              <p style={{ marginTop: 12, fontSize: 12.5, color: 'var(--t3)' }}>
                Programme this deployment is submitted to:{' '}
                <span style={{ color: 'var(--t2)' }}>{PROFILE.grantProgram}</span>
              </p>
            )}
          </section>
        )}

        {/* ── 5. CTA ──────────────────────────────────────────────────────── */}
        <section className="panel" style={{
          border: '1px solid var(--b1)', padding: 'clamp(24px,5vw,40px)', textAlign: 'center',
        }}>
          <h2 style={{
            fontSize: 'clamp(20px,4vw,28px)', fontWeight: 800,
            letterSpacing: '-0.025em', color: 'var(--t1)', marginBottom: 10,
          }}>
            See it running
          </h2>
          <p style={{
            fontSize: 14, lineHeight: 1.65, color: 'var(--t2)',
            maxWidth: 420, margin: '0 auto 22px',
          }}>
            No sign-up needed to look around. Open the map, pick anywhere on Earth,
            and the claim flow is the same one every number on this page came from.
          </p>
          <button onClick={goToGame} className="btn-hero"
                  style={{ background: ACCENT, color: '#0f0f0f' }}>
            Open CryptoLand →
          </button>
        </section>

        <p style={{ marginTop: 22, fontSize: 11.5, lineHeight: 1.7, color: 'var(--t4)', textAlign: 'center' }}>
          One codebase, built per chain · {PROFILE.ecosystem} build ·{' '}
          <span className="mono">VITE_CHAIN={ACTIVE_CHAIN_KEY}</span>
        </p>
      </div>
    </div>
  )
}
