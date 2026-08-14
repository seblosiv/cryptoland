/**
 * PublicEmpire — the /u/{handle} share landing page.
 *
 * Lands a viewer on a non-game route showing someone's tiles glowing on
 * a stylised globe with stats, country medals, trophies, streak. The
 * primary CTA is "Find your own home" → returns to the game with the
 * personal-place onboarding open.
 *
 * See documentation/viral-strategy.md § Trophy Cabinet
 */

import { useEffect, useMemo } from 'react'
import { useShareStore } from '../store/shareStore'

const W = 960
const H = 480
const SEA = '#070d12'
const LAND = '#0d1518'
const OUTLINE = '#1f2c2a'

// Same continents as EmpireCard — keeps both surfaces visually consistent.
const CONTINENT_PATHS = [
  'M 200,160 Q 220,130 260,135 L 320,145 Q 360,160 380,200 L 380,270 L 350,295 L 300,300 L 240,270 L 210,220 Z',
  'M 340,320 Q 360,310 380,320 L 400,380 L 380,460 L 350,500 L 330,490 L 320,410 Z',
  'M 525,160 L 580,155 L 615,170 L 605,195 L 560,200 L 520,185 Z',
  'M 540,220 L 600,220 L 625,270 L 615,340 L 580,400 L 555,405 L 535,360 L 525,290 Z',
  'M 615,155 L 720,155 L 800,175 L 845,200 L 840,240 L 800,260 L 740,275 L 670,260 L 625,230 Z',
  'M 800,285 L 850,285 L 870,300 L 855,330 L 815,320 Z',
  'M 820,410 L 880,405 L 905,425 L 895,465 L 850,475 L 820,455 Z',
]

function project(lng, lat) {
  return [
    ((lng + 180) / 360) * W,
    ((90 - lat) / 180) * H,
  ]
}

export default function PublicEmpire({ handle }) {
  const empire = useShareStore(s => s.publicEmpire)
  const loading = useShareStore(s => s.publicLoading)
  const error = useShareStore(s => s.publicError)
  const load = useShareStore(s => s.loadPublicEmpire)

  useEffect(() => {
    if (handle) load(handle)
    // load is a stable Zustand selector — safe to omit from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle])

  const dotsByColor = useMemo(() => {
    const m = new Map()
    for (const t of empire?.tiles || []) {
      const list = m.get(t.color || '#4ade80') || []
      list.push(t)
      m.set(t.color || '#4ade80', list)
    }
    return m
  }, [empire?.tiles])

  const goToGame = () => {
    window.history.pushState({}, '', '/?onboard=1')
    window.dispatchEvent(new Event('popstate'))
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'radial-gradient(ellipse at top, #0e1820, #04080b)',
      overflow: 'auto',
      paddingBottom: 60,
    }}>
      <div style={{
        maxWidth: 980, margin: '0 auto',
        padding: 'max(20px, var(--sat)) 24px 80px',
      }}>
        {/* Top bar with brand + back to game */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 0', marginBottom: 24,
        }}>
          <a href="/" onClick={(e) => { e.preventDefault(); goToGame() }}
             style={{
               fontFamily: 'var(--font)', fontWeight: 900,
               fontSize: 24, letterSpacing: '-0.02em',
               color: 'var(--t1)', textDecoration: 'none',
             }}>
            CRYPTO<span style={{ color: 'var(--green)' }}>LAND</span>
          </a>
          <button onClick={goToGame} className="btn-hero"
                  style={{ height: 38, fontSize: 13, padding: '0 18px' }}>
            Claim your land →
          </button>
        </div>

        {loading && (
          <div style={{ padding: 80, textAlign: 'center', color: 'var(--t3)' }}>
            Loading empire…
          </div>
        )}

        {error && (
          <div style={{
            padding: 80, textAlign: 'center',
            color: 'var(--red)', fontSize: 16,
          }}>
            {error}
            <div style={{ marginTop: 16, fontSize: 13, color: 'var(--t3)' }}>
              This empire doesn't exist yet — but yours can.
            </div>
            <button onClick={goToGame} className="btn-hero"
                    style={{ marginTop: 24, height: 44, fontSize: 14, padding: '0 24px' }}>
              Start your empire
            </button>
          </div>
        )}

        {empire && !loading && (
          <>
            {/* Hero */}
            <div style={{
              padding: 'clamp(28px, 5vw, 48px)',
              background: 'var(--s1)',
              borderRadius: 10,
              boxShadow: 'var(--sh-md)',
              marginBottom: 24,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24, flexWrap: 'wrap' }}>
                <div style={{
                  width: 64, height: 64, borderRadius: 8,
                  background: 'var(--s2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 32, flexShrink: 0,
                }}>
                  {empire.user.avatar_emoji || '🌍'}
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{
                    fontSize: 11, color: 'var(--t3)',
                    letterSpacing: '0.18em', textTransform: 'uppercase',
                  }}>
                    CryptoLand Empire
                  </div>
                  <div style={{
                    fontSize: 'clamp(28px, 5vw, 38px)', fontWeight: 800,
                    color: 'var(--t1)', lineHeight: 1.1, marginTop: 4,
                  }}>
                    {empire.user.username}
                  </div>
                  {empire.user.bio && (
                    <div style={{ fontSize: 14, color: 'var(--t2)', marginTop: 8, lineHeight: 1.5 }}>
                      {empire.user.bio}
                    </div>
                  )}
                </div>
                {empire.streak.current > 0 && (
                  <div style={{
                    padding: '8px 14px',
                    background: 'rgba(251, 146, 60, 0.12)',
                    border: '1px solid #fb923c',
                    borderRadius: 10,
                    fontSize: 13, fontWeight: 700, color: '#fb923c',
                    flexShrink: 0,
                  }}>
                    🔥 {empire.streak.current}-day
                  </div>
                )}
              </div>

              {/* Stats grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: 12,
                marginBottom: 28,
              }}>
                <Stat label="Tiles" value={empire.tile_count} />
                <Stat label="Countries" value={empire.country_count} />
                <Stat label="Net worth" value={`$${empire.total_value.toFixed(0)}`} />
                <Stat label="Longest streak" value={`${empire.streak.longest}d`} />
              </div>

              {/* Mini map */}
              <div style={{
                background: SEA,
                borderRadius: 8,
                overflow: 'hidden',
                aspectRatio: `${W} / ${H}`,
                marginBottom: 24,
              }}>
                <svg viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg"
                     style={{ width: '100%', height: '100%', display: 'block' }}>
                  <defs>
                    <filter id="glow2" x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur stdDeviation="3" />
                    </filter>
                  </defs>
                  {CONTINENT_PATHS.map((d, i) => (
                    <path key={i} d={d} fill={LAND} stroke={OUTLINE} strokeWidth={1.2} opacity={0.95} />
                  ))}
                  {[...dotsByColor.entries()].map(([color, tiles]) =>
                    tiles.map((t) => {
                      const [x, y] = project(t.lng, t.lat)
                      return (
                        <g key={t.tile_key}>
                          <circle cx={x} cy={y} r={9} fill={color} opacity={0.4} filter="url(#glow2)" />
                          <circle cx={x} cy={y} r={3.5} fill={color} />
                        </g>
                      )
                    })
                  )}
                </svg>
              </div>

              {/* Trophies */}
              {empire.trophies?.length > 0 && (
                <div>
                  <div style={{
                    fontSize: 11, color: 'var(--t3)', letterSpacing: '0.18em',
                    textTransform: 'uppercase', marginBottom: 12,
                  }}>
                    Trophy cabinet
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {empire.trophies.map((t, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '8px 12px',
                        background: 'var(--s2)',
                        borderRadius: 6,
                        fontSize: 13, color: 'var(--t1)',
                      }}>
                        <span style={{ fontSize: 18 }}>{t.icon}</span>
                        <span style={{ fontWeight: 600 }}>{t.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Country breakdown */}
            {empire.country_breakdown?.length > 0 && (
              <div style={{
                padding: 'clamp(20px, 4vw, 32px)',
                background: 'var(--s1)',
                borderRadius: 10,
                marginBottom: 24,
              }}>
                <div style={{
                  fontSize: 11, color: 'var(--t3)', letterSpacing: '0.18em',
                  textTransform: 'uppercase', marginBottom: 16,
                }}>
                  Country breakdown
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {empire.country_breakdown.map((c, i) => (
                    <div key={c.country} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 14px',
                      background: 'var(--s2)',
                      borderRadius: 5,
                    }}>
                      <span style={{ fontSize: 18 }}>
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🌍'}
                      </span>
                      <span style={{ flex: 1, fontWeight: 600, color: 'var(--t1)', fontSize: 14 }}>
                        {c.country}
                      </span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--t2)' }}>
                        {c.count} tile{c.count === 1 ? '' : 's'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Closing CTA */}
            <div style={{
              padding: 'clamp(28px, 5vw, 40px)',
              background: 'var(--s1)',
              borderRadius: 10,
              textAlign: 'center',
              border: '1px solid rgba(74, 222, 128, 0.18)',
            }}>
              <div style={{
                fontSize: 'clamp(18px, 4vw, 24px)', fontWeight: 700,
                color: 'var(--t1)', marginBottom: 8,
              }}>
                What does YOUR empire look like?
              </div>
              <div style={{ fontSize: 14, color: 'var(--t2)', marginBottom: 20, lineHeight: 1.6 }}>
                Buy your home, your school, your favorite spot — own a piece of Earth.
              </div>
              <button onClick={goToGame} className="btn-hero"
                      style={{ height: 50, fontSize: 15, padding: '0 32px' }}>
                Find your land →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div style={{
      padding: '14px 12px',
      background: 'var(--s2)',
      borderRadius: 6,
      textAlign: 'center',
    }}>
      <div style={{
        fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 800,
        color: 'var(--t1)', letterSpacing: '-0.02em', lineHeight: 1,
      }}>
        {value}
      </div>
      <div style={{
        fontSize: 10, color: 'var(--t3)', marginTop: 6,
        letterSpacing: '0.14em', textTransform: 'uppercase',
      }}>
        {label}
      </div>
    </div>
  )
}
