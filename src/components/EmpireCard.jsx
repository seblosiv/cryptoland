/**
 * EmpireCard — the viral share artifact.
 *
 * A square SVG (1080×1080) showing a user's tiles plotted on a stylised
 * world map with country medals, streak chip, and a one-line headline.
 * Designed to be screenshot-shared on iMessage/Telegram/X/Discord, and
 * also downloadable as a PNG.
 *
 * The whole card is one SVG so it renders identically everywhere, and
 * the "Download" button serializes it to a PNG via canvas.
 *
 * See documentation/viral-strategy.md § LandShare Daily Card
 */

import { forwardRef, useMemo, useRef, useState } from 'react'
import { useShareStore } from '../store/shareStore'

const W = 1080
const H = 1080
const MAP = { x: 60, y: 320, w: 960, h: 480 }
const SEA = '#070d12'
const LAND = '#0d1518'
const OUTLINE = '#1f2c2a'

const MEDAL_ICONS = ['🥇', '🥈', '🥉']

function project(lng, lat) {
  const x = MAP.x + ((lng + 180) / 360) * MAP.w
  const y = MAP.y + ((90 - lat) / 180) * MAP.h
  return [x, y]
}

// ── World outline (low-poly continents) ──────────────────────────────────────

const CONTINENT_PATHS = [
  // North America
  'M 200,360 Q 220,330 260,335 L 320,345 Q 360,360 380,400 L 380,470 L 350,495 L 300,500 L 240,470 L 210,420 Z',
  // South America
  'M 340,520 Q 360,510 380,520 L 400,580 L 380,660 L 350,700 L 330,690 L 320,610 Z',
  // Europe
  'M 525,360 L 580,355 L 615,370 L 605,395 L 560,400 L 520,385 Z',
  // Africa
  'M 540,420 L 600,420 L 625,470 L 615,540 L 580,600 L 555,605 L 535,560 L 525,490 Z',
  // Asia (simplified)
  'M 615,355 L 720,355 L 800,375 L 845,400 L 840,440 L 800,460 L 740,475 L 670,460 L 625,430 Z',
  // SE Asia
  'M 800,485 L 850,485 L 870,500 L 855,530 L 815,520 Z',
  // Australia
  'M 820,610 L 880,605 L 905,625 L 895,665 L 850,675 L 820,655 Z',
]

function WorldOutline() {
  return (
    <g pointerEvents="none">
      {CONTINENT_PATHS.map((d, i) => (
        <path key={i} d={d} fill={LAND} stroke={OUTLINE} strokeWidth={1.2} opacity={0.95} />
      ))}
    </g>
  )
}

// ── The card SVG ─────────────────────────────────────────────────────────────

const CardSVG = forwardRef(function CardSVG({ card }, ref) {
  // useMemo MUST run unconditionally to keep hook order stable across renders.
  const grouped = useMemo(() => {
    const m = new Map()
    for (const d of (card?.dots || [])) {
      const list = m.get(d.color) || []
      list.push(d)
      m.set(d.color, list)
    }
    return m
  }, [card])

  if (!card) return null

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${W} ${H}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: '100%', height: '100%', display: 'block', background: '#070d12' }}
    >
      <defs>
        <radialGradient id="bgGrad" cx="50%" cy="40%" r="80%">
          <stop offset="0%" stopColor="#0e1820" />
          <stop offset="100%" stopColor="#04080b" />
        </radialGradient>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      {/* Background */}
      <rect width={W} height={H} fill="url(#bgGrad)" />

      {/* Branding */}
      <text x={W/2} y={70} textAnchor="middle" fill="#94a3b8"
            fontFamily="ui-monospace, SFMono-Regular, monospace" fontSize="22"
            letterSpacing="6">
        CRYPTOLAND
      </text>
      <text x={W/2} y={120} textAnchor="middle" fill="#e2e8f0"
            fontFamily="system-ui, -apple-system, Segoe UI, sans-serif" fontWeight="800"
            fontSize="48">
        {card.username}
      </text>
      <text x={W/2} y={158} textAnchor="middle" fill="#64748b"
            fontFamily="ui-monospace, monospace" fontSize="18" letterSpacing="3">
        {card.day} · UTC
      </text>

      {/* Headline strip */}
      <rect x={60} y={195} width={960} height={80} rx={18} fill="#0a1014" stroke={OUTLINE} />
      <text x={W/2} y={244} textAnchor="middle" fill="#e2e8f0"
            fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="28">
        {card.headline}
      </text>

      {/* Map */}
      <rect x={MAP.x} y={MAP.y} width={MAP.w} height={MAP.h} rx={14} fill={SEA} stroke="#13202a" />
      <WorldOutline />

      {/* Owner dots */}
      {[...grouped.entries()].map(([color, list]) =>
        list.map((d, i) => {
          const [x, y] = project(d.lng, d.lat)
          return (
            <g key={`${color}-${i}`}>
              <circle cx={x} cy={y} r={9} fill={color} opacity={0.35} filter="url(#glow)" />
              <circle cx={x} cy={y} r={4} fill={color} />
            </g>
          )
        })
      )}

      {/* Country medals */}
      <g>
        {(card.country_medals || []).slice(0, 3).map((m, i) => {
          const cx = 180 + i * 360
          const cy = 880
          return (
            <g key={m.country}>
              <rect x={cx - 140} y={cy - 50} width={280} height={100} rx={16}
                    fill="#0a1014" stroke={OUTLINE} />
              <text x={cx} y={cy - 12} textAnchor="middle"
                    fontSize="32" fontFamily="system-ui">
                {MEDAL_ICONS[i]}
              </text>
              <text x={cx} y={cy + 16} textAnchor="middle" fill="#e2e8f0"
                    fontFamily="system-ui" fontWeight="700" fontSize="20">
                {(m.country || 'Unknown').length > 16
                  ? (m.country || 'Unknown').slice(0, 16) + '…'
                  : (m.country || 'Unknown')}
              </text>
              <text x={cx} y={cy + 38} textAnchor="middle" fill="#94a3b8"
                    fontFamily="ui-monospace, monospace" fontSize="14">
                {m.count} tile{m.count === 1 ? '' : 's'} · ${Math.round(m.value)}
              </text>
            </g>
          )
        })}
      </g>

      {/* Streak chip */}
      {card.current_streak > 0 && (
        <g>
          <rect x={W/2 - 130} y={1000} width={260} height={48} rx={24}
                fill="#1a0e0a" stroke="#fb923c" />
          <text x={W/2} y={1031} textAnchor="middle" fill="#fb923c"
                fontFamily="system-ui" fontWeight="700" fontSize="22">
            🔥 {card.current_streak}-day streak
          </text>
        </g>
      )}

      {/* Footer URL */}
      <text x={W/2} y={H - 18} textAnchor="middle" fill="#475569"
            fontFamily="ui-monospace, monospace" fontSize="14" letterSpacing="2">
        cryptoland.io/u/{card.username}
      </text>
    </svg>
  )
})

// ── Modal wrapper ────────────────────────────────────────────────────────────

export default function EmpireCard() {
  const open = useShareStore(s => s.open)
  const close = useShareStore(s => s.close)
  const card = useShareStore(s => s.card)
  const loading = useShareStore(s => s.loading)
  const error = useShareStore(s => s.error)
  const recordShare = useShareStore(s => s.recordShare)

  const svgRef = useRef(null)
  const [copied, setCopied] = useState(false)

  if (!open) return null

  const handle = card?.username
  const shareUrl = handle
    ? `${window.location.origin}/u/${encodeURIComponent(handle)}`
    : window.location.origin

  const downloadPNG = () => {
    if (!svgRef.current) return
    const svg = svgRef.current
    const xml = new XMLSerializer().serializeToString(svg)
    const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)

    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = W
      canvas.height = H
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, W, H)
      ctx.drawImage(img, 0, 0, W, H)
      URL.revokeObjectURL(url)

      canvas.toBlob((blob) => {
        if (!blob) return
        const u = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = u
        a.download = `cryptoland-${handle || 'empire'}-${card?.day || 'card'}.png`
        a.click()
        setTimeout(() => URL.revokeObjectURL(u), 1000)
        if (handle) recordShare(handle)
      }, 'image/png')
    }
    img.src = url
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
      if (handle) recordShare(handle)
    } catch { /* silent */ }
  }

  const shareNative = async () => {
    if (!navigator.share) { copyLink(); return }
    try {
      await navigator.share({
        title: 'My CryptoLand Empire',
        text: card?.headline || 'Check out my CryptoLand empire',
        url: shareUrl,
      })
      if (handle) recordShare(handle)
    } catch { /* silent */ }
  }

  return (
    <div
      onClick={close}
      style={{
        position: 'fixed', inset: 0, zIndex: 220,
        // Radial scrim rather than a flat one + blur: keeps the map readable
        // behind the modal without frosted glass, which is out of contract
        // here (see documentation/styling.md).
        background: 'radial-gradient(ellipse 78% 68% at 50% 50%,'
          + ' rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.82) 38%,'
          + ' rgba(0,0,0,0.58) 70%, rgba(0,0,0,0.28) 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'max(20px, var(--sat)) 20px max(20px, var(--sab))',
        overflowY: 'auto',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 540,
          background: 'var(--s1)',
          borderRadius: 24,
          padding: 'clamp(20px, 4vw, 32px)',
          boxShadow: 'var(--sh-lg)',
          animation: 'scale-in 0.3s cubic-bezier(0.34,1.05,0.64,1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--t3)', letterSpacing: '0.18em', textTransform: 'uppercase' }}>
              Empire Card · {card?.day || 'today'}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--t1)', marginTop: 4 }}>
              {handle ? `${card.avatar_emoji || '🌍'} ${handle}` : 'Loading…'}
            </div>
          </div>
          <button
            onClick={close}
            style={{
              background: 'transparent', border: 'none', color: 'var(--t3)',
              fontSize: 22, cursor: 'pointer', padding: 4, lineHeight: 1,
            }}
          >×</button>
        </div>

        {loading && <div style={{ padding: 60, textAlign: 'center', color: 'var(--t3)' }}>Generating your card…</div>}
        {error && (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--red)' }}>
            {error}
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--t3)' }}>
              Sign in to claim your daily share card.
            </div>
          </div>
        )}

        {card && !loading && (
          <>
            <div style={{
              borderRadius: 16, overflow: 'hidden',
              boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
              marginBottom: 16,
              background: '#000',
              aspectRatio: '1 / 1',
            }}>
              <CardSVG ref={svgRef} card={card} />
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button onClick={shareNative} className="btn-hero" style={{ flex: 1, fontSize: 13, height: 44 }}>
                Share
              </button>
              <button onClick={downloadPNG} className="btn-ghost" style={{ flex: 1, fontSize: 13, height: 44, borderRadius: 10 }}>
                Download PNG
              </button>
              <button onClick={copyLink} className="btn-ghost" style={{ flex: 1, fontSize: 13, height: 44, borderRadius: 10 }}>
                {copied ? '✓ Copied' : 'Copy Link'}
              </button>
            </div>

            <div style={{
              fontSize: 11, color: 'var(--t3)', textAlign: 'center',
              padding: '10px 12px', background: 'var(--s2)', borderRadius: 10,
              fontFamily: 'var(--mono)', wordBreak: 'break-all',
            }}>
              {shareUrl}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
