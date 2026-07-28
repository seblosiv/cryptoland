/**
 * ChainOnboarding — chain-native first-run flow
 * ==============================================
 * Replaces the single-screen splash with a 3-step onboarding that reads as if
 * it were built for whichever chain this bundle targets:
 *
 *   1. What this is        — wordmark, tagline, scale, and "why this chain"
 *   2. How you pay         — native currency, fees, and the wallet to install
 *   3. How owning works    — the loop, then into the map
 *
 * ALL chain-specific content comes from `PROFILE` (src/lib/chainProfile.js).
 * Every field is optional: a chain with no profile entry still gets a correct,
 * neutral flow derived from its config. Adding chain #30 is a data entry in
 * src/config/profiles.js — never a new screen.
 *
 * Design rules (deliberate): one layout for all builds, solid-dark surfaces,
 * no blur/translucency. The only per-chain visuals are the <ChainHero> motif
 * and the accent colour.
 */

import { useState } from 'react'
import { PROFILE, ACTIVE_CHAIN_KEY } from '../lib/chainProfile.js'
import { ACTIVE_CHAIN } from '../lib/blockchain/config.js'
import { logoFor } from './logos'
import ChainHero from './ChainHero'

const ACCENT = 'var(--chain-accent, var(--green))'
const ACCENT_DIM = 'var(--chain-accent-dim, var(--green-d))'

/**
 * The chain's own logomark, ringed so it reads as a badge. Falls back to the
 * emoji in ACTIVE_CHAIN.logo when we have no SVG for that chain.
 */
function ChainMark({ size = 60 }) {
  const Logo = logoFor(ACTIVE_CHAIN_KEY)
  return (
    <div style={{
      width: size, height: size, margin: '0 auto 16px',
      borderRadius: '50%', background: 'var(--s2)',
      border: '1px solid var(--b1)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: `0 0 0 6px ${ACCENT_DIM}`,
      animation: 'scale-in .45s cubic-bezier(.34,1.2,.64,1)',
      // The logomarks are monochrome and paint with `currentColor`, so setting
      // colour here is what tints each chain's mark to its own accent.
      color: ACCENT,
    }}>
      {Logo
        ? <Logo size={Math.round(size * 0.52)} />
        : <span style={{ fontSize: Math.round(size * 0.44) }}>{ACTIVE_CHAIN.logo}</span>}
    </div>
  )
}

function StepDots({ step, total, onGo }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 18 }}>
      {Array.from({ length: total }, (_, i) => (
        <button
          key={i}
          onClick={() => onGo(i)}
          aria-label={`Step ${i + 1}`}
          style={{
            width: i === step ? 20 : 6, height: 6, borderRadius: 3, border: 'none',
            padding: 0, cursor: 'pointer', transition: 'width .2s, background .2s',
            background: i === step ? ACCENT : 'var(--b2)',
          }}
        />
      ))}
    </div>
  )
}

function Row({ k, v }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '11px 14px', borderRadius: 10, background: 'var(--s2)',
    }}>
      <span style={{ fontSize: 12, color: 'var(--t3)' }}>{k}</span>
      <span style={{
        fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--t1)',
      }}>{v}</span>
    </div>
  )
}

export default function ChainOnboarding({ onEnter }) {
  const [step, setStep] = useState(0)

  const eco      = PROFILE.ecosystem || ACTIVE_CHAIN.name
  const cur      = ACTIVE_CHAIN.nativeCurrency?.symbol ?? ''
  const ob       = PROFILE.onboarding ?? {}
  const why      = ob.why ?? PROFILE.pitch
  const wallets  = (PROFILE.wallets ?? []).slice(0, 3)
  const help     = ob.walletHelp
  const feeNote  = ob.feeNote
    ?? (PROFILE.features?.gasless
      ? 'This chain sponsors gas — you never pay a fee to claim.'
      : cur ? `Network fees are paid in ${cur}.` : null)

  const steps = [
    // ── 1. What this is ─────────────────────────────────────────────────────
    {
      title: null,
      body: (
        <>
          <ChainMark size={62} />

          <div style={{
            fontFamily: 'var(--font)', fontWeight: 900,
            fontSize: 'clamp(34px,7.5vw,52px)', letterSpacing: '-0.03em',
            lineHeight: 1, textAlign: 'center', marginBottom: 10,
            color: 'var(--t1)', whiteSpace: 'nowrap',
          }}>
            CRYPTO<span style={{ color: ACCENT }}>LAND</span>
          </div>

          <p style={{
            textAlign: 'center', fontSize: 11, color: 'var(--t3)',
            letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 26,
          }}>
            {PROFILE.tagline || 'Own the World · On-Chain'}
          </p>

          {/* Third tile is chain-specific where the profile supplies one, so the
              stat row itself differs per deployment rather than repeating. */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 24 }}>
            {[
              ['268M', 'Total Blocks'],
              ['~2.4 km²', 'Per Block'],
              ob.chainStat?.value
                ? [ob.chainStat.value, ob.chainStat.label]
                : ['$12+', 'Starting'],
            ].map(([v, l]) => (
              <div key={l} style={{ padding: '14px 8px', borderRadius: 12, textAlign: 'center', background: 'var(--s2)' }}>
                <div style={{
                  fontFamily: 'var(--mono)', fontSize: 'clamp(14px,3.2vw,19px)', fontWeight: 700,
                  color: 'var(--t1)', letterSpacing: '-0.03em', lineHeight: 1, marginBottom: 5,
                }}>{v}</div>
                <div className="label">{l}</div>
              </div>
            ))}
          </div>

          <p style={{
            fontSize: 'clamp(13px,2.8vw,14px)', color: 'var(--t2)',
            lineHeight: 1.75, textAlign: 'center', marginBottom: why ? 14 : 0,
          }}>
            The planet is divided into{' '}
            <strong style={{ color: 'var(--t1)', fontWeight: 600 }}>268,435,456 blocks</strong>.
            Each one is real Earth territory — permanently ownable, one owner each
            {ob.nativeTerm ? <>, held as{' '}
              <strong style={{ color: 'var(--t1)', fontWeight: 600 }}>{ob.nativeTerm}</strong></> : null}.
          </p>

          {why && (
            <p style={{
              fontSize: 12.5, fontWeight: 600, lineHeight: 1.65, textAlign: 'center',
              color: ACCENT, margin: 0,
            }}>
              {why}
            </p>
          )}
        </>
      ),
      cta: `Own land on ${eco} →`,
    },

    // ── 2. How you pay ──────────────────────────────────────────────────────
    {
      title: 'Paying & your wallet',
      body: (
        <>
          <ChainMark size={48} />

          <p style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.7, marginBottom: 18, textAlign: 'center' }}>
            Buy a tile with crypto — BTC, ETH, SOL, USDT and more. A wallet is
            optional to start, and lets you hold the tile on {eco}.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
            <Row k="Network" v={ACTIVE_CHAIN.name} />
            {cur && <Row k="Native token" v={cur} />}
            {PROFILE.features?.gasless && <Row k="Gas" v="FREE" />}
          </div>

          {feeNote && (
            <p style={{ fontSize: 12, color: 'var(--t3)', lineHeight: 1.6, textAlign: 'center', marginBottom: 16 }}>
              {feeNote}
            </p>
          )}

          {wallets.length > 0 && (
            <>
              <div className="label" style={{ textAlign: 'center', marginBottom: 8 }}>
                Wallets on {eco}
              </div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
                {wallets.map(w => (
                  <span key={w.id} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '7px 11px', borderRadius: 999,
                    background: 'var(--s2)', border: '1px solid var(--b0)',
                    fontSize: 12, color: 'var(--t2)',
                  }}>
                    <span style={{ fontSize: 14 }}>{w.icon}</span>{w.name}
                  </span>
                ))}
              </div>
            </>
          )}

          {help?.url && (
            <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--t3)', margin: 0 }}>
              No wallet yet?{' '}
              <a href={help.url} target="_blank" rel="noopener noreferrer"
                 style={{ color: ACCENT, fontWeight: 600, textDecoration: 'none' }}>
                Get {help.name} ↗
              </a>
            </p>
          )}
        </>
      ),
      cta: 'Next →',
    },

    // ── 3. How owning works ─────────────────────────────────────────────────
    {
      title: 'How owning works',
      body: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            ['1', 'Pick a tile', 'Zoom the map and click any unclaimed block on Earth.'],
            ['2', 'Pay in crypto', 'Prices start at $12 and rise as a region fills up.'],
            ['3', 'It’s yours',
              ob.nativeTerm
                ? `Your tile is held as ${ob.nativeTerm} on ${eco}. Customise it, deploy an AI Guardian, trade it, or hold it.`
                : 'Customise it, deploy an AI Guardian, trade it, or hold it.'],
          ].map(([n, t, d]) => (
            <div key={n} style={{
              display: 'flex', gap: 12, alignItems: 'flex-start',
              padding: '12px 14px', borderRadius: 12, background: 'var(--s2)',
            }}>
              <span style={{
                flexShrink: 0, width: 22, height: 22, borderRadius: '50%',
                background: ACCENT_DIM, color: ACCENT,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 800, fontFamily: 'var(--mono)',
              }}>{n}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginBottom: 2 }}>{t}</div>
                <div style={{ fontSize: 12, color: 'var(--t3)', lineHeight: 1.55 }}>{d}</div>
              </div>
            </div>
          ))}

          {/* What this chain's ecosystem is built for — a player-facing benefit,
              derived from the grant programme this build targets. */}
          {ob.grantAngle && (
            <div style={{
              marginTop: 4, padding: '12px 14px', borderRadius: 12,
              background: ACCENT_DIM, border: '1px solid var(--b0)',
            }}>
              <div className="label" style={{ color: ACCENT, marginBottom: 4 }}>
                On {eco}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--t2)', lineHeight: 1.6 }}>
                {ob.grantAngle}
              </div>
            </div>
          )}
        </div>
      ),
      cta: 'Enter CryptoLand →',
    },
  ]

  const isLast = step === steps.length - 1
  const cur_ = steps[step]

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.92)',
      padding: 'max(20px, var(--sat)) 20px max(20px, var(--sab))',
      overflowY: 'auto',
    }}>
      <div style={{
        position: 'relative',
        width: '100%', maxWidth: 440,
        background: 'var(--s1)',
        borderRadius: 24,
        padding: 'clamp(28px,5vw,40px) clamp(24px,4vw,36px)',
        animation: 'scale-in 0.4s cubic-bezier(0.34,1.05,0.64,1)',
        boxShadow: 'var(--sh-lg)',
        overflow: 'hidden',
      }}>
        {/* Per-chain motif — decorative, sits behind the content */}
        <ChainHero height={210} radius={24} />

        <div style={{ position: 'relative' }}>
          {/* Chips */}
          <div style={{ marginBottom: 22, display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 6 }}>
            <span className="badge" style={{ background: ACCENT_DIM, color: ACCENT }}>
              {eco} · Land Registry
            </span>
            {PROFILE.features?.gasless && <span className="badge badge-dim">Zero gas</span>}
            {PROFILE.features?.miniApp && <span className="badge badge-dim">Runs in Telegram</span>}
          </div>

          {cur_.title && (
            <h2 style={{
              fontSize: 19, fontWeight: 800, color: 'var(--t1)',
              textAlign: 'center', marginBottom: 18, letterSpacing: '-0.02em',
            }}>{cur_.title}</h2>
          )}

          <div style={{ marginBottom: 26 }}>{cur_.body}</div>

          <button
            className="btn-hero"
            onClick={() => (isLast ? onEnter() : setStep(s => s + 1))}
          >
            {cur_.cta}
          </button>

          {!isLast && (
            <button
              onClick={onEnter}
              style={{
                display: 'block', margin: '10px auto 0', background: 'none', border: 'none',
                color: 'var(--t3)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font)',
              }}
            >
              Skip
            </button>
          )}

          <StepDots step={step} total={steps.length} onGo={setStep} />
        </div>
      </div>
    </div>
  )
}
