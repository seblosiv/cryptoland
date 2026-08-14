/**
 * TileCertificate — shareable ownership card with QR code
 *
 * Renders a 800×440 canvas card showing:
 *   - CryptoLand branding + tile color accent
 *   - Owner name, country, coordinates, price
 *   - QR code pointing to the tile's URL (?block=tx:ty)
 *   - "Download" and "Copy link" actions
 *
 * Used in PaymentModal (post-purchase) and PurchasePanel (owned tile).
 */
import { SITE_HOST } from '../lib/chainProfile.js'
import { useRef, useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { shortAddr } from '../lib/addr'

const W = 800
const H = 440

// Hex color → [r, g, b]
function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

function useCanvas(block, shareUrl) {
  const canvasRef = useRef(null)
  const qrRef     = useRef(null)

  useEffect(() => {
    if (!canvasRef.current || !block) return
    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d')
    const accent = block.color || '#00ff88'
    const [r, g, b] = hexToRgb(accent.startsWith('#') ? accent : '#00ff88')

    // ── Background ────────────────────────────────────────────────────────────
    ctx.fillStyle = '#0b0d10'
    ctx.fillRect(0, 0, W, H)

    // Subtle grid pattern
    ctx.strokeStyle = 'rgba(255,255,255,0.03)'
    ctx.lineWidth = 1
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
    }
    for (let y = 0; y < H; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
    }

    // Left accent bar
    const grad = ctx.createLinearGradient(0, 0, 0, H)
    grad.addColorStop(0, `rgba(${r},${g},${b},0.9)`)
    grad.addColorStop(1, `rgba(${r},${g},${b},0.1)`)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 5, H)

    // Top glow from accent
    const glow = ctx.createRadialGradient(60, 0, 0, 60, 0, 260)
    glow.addColorStop(0, `rgba(${r},${g},${b},0.12)`)
    glow.addColorStop(1, 'transparent')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, W, H)

    // ── Header ─────────────────────────────────────────────────────────────
    // Brand
    ctx.font = '700 11px monospace'
    ctx.fillStyle = `rgba(${r},${g},${b},0.85)`
    ctx.letterSpacing = '3px'
    ctx.fillText('CRYPTOLAND', 36, 46)

    // DEED OF OWNERSHIP label
    ctx.font = '500 9px monospace'
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    ctx.letterSpacing = '2px'
    ctx.fillText('DEED OF OWNERSHIP', 36, 66)

    // Divider
    ctx.strokeStyle = `rgba(${r},${g},${b},0.3)`
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(36, 78)
    ctx.lineTo(W - 220, 78)
    ctx.stroke()

    // ── Country / main title ───────────────────────────────────────────────
    const country = block.country || 'Unknown Territory'
    ctx.font = '800 52px sans-serif'
    ctx.fillStyle = '#ffffff'
    ctx.letterSpacing = '-2px'
    // Truncate long country names
    let displayCountry = country
    while (ctx.measureText(displayCountry).width > W - 260 && displayCountry.length > 5) {
      displayCountry = displayCountry.slice(0, -1)
    }
    if (displayCountry !== country) displayCountry += '…'
    ctx.fillText(displayCountry, 36, 150)

    // Label
    ctx.font = '500 10px monospace'
    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.letterSpacing = '1.5px'
    ctx.fillText(block.label || '', 36, 170)

    // ── Stats row ──────────────────────────────────────────────────────────
    const stats = [
      { label: 'TILE',      value: block.key },
      { label: 'PRICE',     value: `$${parseFloat(block.price).toFixed(2)}` },
      { label: 'CHAIN',     value: (block.chain || 'polygon').toUpperCase() },
    ]

    let sx = 36
    for (const s of stats) {
      ctx.font = '700 18px monospace'
      ctx.fillStyle = '#ffffff'
      ctx.letterSpacing = '-0.5px'
      ctx.fillText(s.value, sx, 230)

      ctx.font = '500 8px monospace'
      ctx.fillStyle = 'rgba(255,255,255,0.3)'
      ctx.letterSpacing = '1.5px'
      ctx.fillText(s.label, sx, 248)

      sx += Math.max(120, ctx.measureText(s.value).width + 40)
    }

    // ── Owner ──────────────────────────────────────────────────────────────
    // The old `startsWith('0x')` test shortened EVM only, so a 58-char Cardano
    // or 65-char Radix address was drawn raw — unbounded on a canvas that
    // cannot clip or ellipsise, and visually nothing like the EVM card.
    // shortAddr bounds every chain to the same shape.
    // Head is left auto so each chain keeps its own prefix (addr1…, erd1…,
    // account_rdx12…); only the tail is widened for this larger surface.
    const displayOwner = shortAddr(block.owner, { tail: 6, maxName: 28 })

    ctx.font = '600 13px monospace'
    ctx.fillStyle = `rgba(${r},${g},${b},0.9)`
    ctx.letterSpacing = '0px'
    ctx.fillText(displayOwner, 36, 305)

    ctx.font = '500 9px monospace'
    ctx.fillStyle = 'rgba(255,255,255,0.2)'
    ctx.letterSpacing = '1.5px'
    ctx.fillText('OWNER', 36, 322)

    // ── Footer ─────────────────────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(36, 370)
    ctx.lineTo(W - 220, 370)
    ctx.stroke()

    ctx.font = '500 9px monospace'
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    ctx.letterSpacing = '1px'
    ctx.fillText(SITE_HOST, 36, 392)

    ctx.font = '500 9px monospace'
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.letterSpacing = '0.5px'
    ctx.fillText(shareUrl, 36, 412)

    // ── QR code ────────────────────────────────────────────────────────────
    // QR is rendered into a hidden SVG, then drawn onto canvas via Image
    if (qrRef.current) {
      const svgEl  = qrRef.current.querySelector('svg')
      if (svgEl) {
        const svgData = new XMLSerializer().serializeToString(svgEl)
        const img     = new window.Image()
        img.onload = () => {
          // White backing
          const qrX = W - 186, qrY = 60, qrS = 148
          ctx.fillStyle = '#ffffff'
          ctx.beginPath()
          if (ctx.roundRect) ctx.roundRect(qrX - 8, qrY - 8, qrS + 16, qrS + 16, 10)
          else ctx.rect(qrX - 8, qrY - 8, qrS + 16, qrS + 16)
          ctx.fill()
          ctx.drawImage(img, qrX, qrY, qrS, qrS)

          // Accent border
          ctx.strokeStyle = `rgba(${r},${g},${b},0.5)`
          ctx.lineWidth = 2
          ctx.beginPath()
          if (ctx.roundRect) ctx.roundRect(qrX - 9, qrY - 9, qrS + 18, qrS + 18, 11)
          else ctx.rect(qrX - 9, qrY - 9, qrS + 18, qrS + 18)
          ctx.stroke()

          // "Scan to visit" label
          ctx.font = '500 8px monospace'
          ctx.fillStyle = 'rgba(255,255,255,0.3)'
          ctx.letterSpacing = '1px'
          ctx.textAlign = 'center'
          ctx.fillText('SCAN TO VISIT', W - 186 + qrS / 2, qrY + qrS + 22)
          ctx.textAlign = 'left'
        }
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgData)}`
      }
    }
  }, [block, shareUrl])

  return { canvasRef, qrRef }
}

export default function TileCertificate({ block, shareUrl, onClose }) {
  const [copied, setCopied] = useState(false)
  const { canvasRef, qrRef } = useCanvas(block, shareUrl)

  function download() {
    const canvas = canvasRef.current
    if (!canvas) return
    const link   = document.createElement('a')
    link.download = `cryptoland-${block.key.replace(':', '-')}.png`
    link.href     = canvas.toDataURL('image/png')
    link.click()
  }

  function copyLink() {
    navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const accent = block?.color || '#00ff88'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 60,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 16, padding: 20,
    }} onClick={onClose}>

      {/* Hidden QR SVG used by canvas renderer */}
      <div ref={qrRef} style={{ position: 'absolute', visibility: 'hidden', pointerEvents: 'none' }}>
        <QRCodeSVG value={shareUrl} size={148} level="M" bgColor="#ffffff" fgColor="#000000" />
      </div>

      {/* Certificate canvas */}
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 800 }}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          style={{
            width: '100%', height: 'auto',
            borderRadius: 7,
            display: 'block',
            boxShadow: `0 0 60px ${accent}30, 0 24px 80px rgba(0,0,0,0.8)`,
          }}
        />
      </div>

      {/* Actions */}
      <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={download}
          style={{
            padding: '10px 22px', borderRadius: 5, border: 'none',
            background: accent, color: '#000',
            fontWeight: 800, fontSize: 12, cursor: 'pointer',
            fontFamily: 'var(--mono)', letterSpacing: '0.05em',
          }}
        >
          ↓ Download Image
        </button>
        <button
          onClick={copyLink}
          style={{
            padding: '10px 22px', borderRadius: 5,
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
            color: copied ? accent : 'rgba(255,255,255,0.8)',
            fontWeight: 700, fontSize: 12, cursor: 'pointer',
            fontFamily: 'var(--mono)', letterSpacing: '0.05em',
            transition: 'color 0.2s',
          }}
        >
          {copied ? '✓ Copied' : '⎘ Copy Link'}
        </button>
        <button
          onClick={onClose}
          style={{
            padding: '10px 16px', borderRadius: 5,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.4)',
            fontWeight: 700, fontSize: 12, cursor: 'pointer',
          }}
        >
          ✕
        </button>
      </div>
    </div>
  )
}

// ── MiniCertificate ───────────────────────────────────────────────────────────
// Inline ownership card shown inside the PurchasePanel owned-tile section.
// Renders a scaled-down version of the certificate canvas + QR, clickable to
// open the full TileCertificate overlay.
export function MiniCertificate({ block, shareUrl }) {
  const [showFull, setShowFull] = useState(false)
  const [copied, setCopied]     = useState(false)
  const canvasRef = useRef(null)
  const qrRef     = useRef(null)

  const MW = 560
  const MH = 308

  useEffect(() => {
    if (!canvasRef.current || !block) return
    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d')
    const accent = block.color || '#00ff88'
    const [r, g, b] = hexToRgb(accent.startsWith('#') ? accent : '#00ff88')

    ctx.fillStyle = '#0d0f12'
    ctx.fillRect(0, 0, MW, MH)

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.025)'
    ctx.lineWidth = 1
    for (let x = 0; x < MW; x += 28) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,MH); ctx.stroke() }
    for (let y = 0; y < MH; y += 28) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(MW,y); ctx.stroke() }

    // Left accent bar
    const barGrad = ctx.createLinearGradient(0, 0, 0, MH)
    barGrad.addColorStop(0, `rgba(${r},${g},${b},0.95)`)
    barGrad.addColorStop(1, `rgba(${r},${g},${b},0.1)`)
    ctx.fillStyle = barGrad
    ctx.fillRect(0, 0, 4, MH)

    // Top glow
    const glow = ctx.createRadialGradient(40, 0, 0, 40, 0, 180)
    glow.addColorStop(0, `rgba(${r},${g},${b},0.1)`)
    glow.addColorStop(1, 'transparent')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, MW, MH)

    // Brand
    ctx.font = '700 9px monospace'
    ctx.fillStyle = `rgba(${r},${g},${b},0.8)`
    ctx.letterSpacing = '2px'
    ctx.fillText('CRYPTOLAND', 22, 30)

    ctx.font = '500 7px monospace'
    ctx.fillStyle = 'rgba(255,255,255,0.2)'
    ctx.letterSpacing = '1.5px'
    ctx.fillText('DEED OF OWNERSHIP', 22, 44)

    // Divider
    ctx.strokeStyle = `rgba(${r},${g},${b},0.25)`
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(22, 52); ctx.lineTo(MW - 148, 52); ctx.stroke()

    // Country name
    const country = block.country || 'Unknown Territory'
    ctx.font = '800 36px sans-serif'
    ctx.fillStyle = '#ffffff'
    ctx.letterSpacing = '-1.5px'
    let displayCountry = country
    while (ctx.measureText(displayCountry).width > MW - 180 && displayCountry.length > 4) {
      displayCountry = displayCountry.slice(0, -1)
    }
    if (displayCountry !== country) displayCountry += '…'
    ctx.fillText(displayCountry, 22, 104)

    // Stats
    const stats = [
      { l: 'TILE',  v: block.key },
      { l: 'PRICE', v: `$${parseFloat(block.price).toFixed(2)}` },
      { l: 'CHAIN', v: (block.chain || 'polygon').toUpperCase() },
    ]
    let sx = 22
    for (const s of stats) {
      ctx.font = '700 13px monospace'
      ctx.fillStyle = '#fff'
      ctx.letterSpacing = '-0.3px'
      ctx.fillText(s.v, sx, 143)
      ctx.font = '500 6px monospace'
      ctx.fillStyle = 'rgba(255,255,255,0.28)'
      ctx.letterSpacing = '1px'
      ctx.fillText(s.l, sx, 156)
      sx += Math.max(84, ctx.measureText(s.v).width + 28)
    }

    // Owner — same bound as the full card, tighter because this canvas is 560px
    // wide. A raw 65-char address ran to x≈466 here, crowding the QR column.
    const displayOwner = shortAddr(block.owner, { tail: 5, maxName: 22 })
    ctx.font = '600 10px monospace'
    ctx.fillStyle = `rgba(${r},${g},${b},0.9)`
    ctx.letterSpacing = '0px'
    ctx.fillText(displayOwner, 22, 190)
    ctx.font = '500 6.5px monospace'
    ctx.fillStyle = 'rgba(255,255,255,0.2)'
    ctx.letterSpacing = '1px'
    ctx.fillText('OWNER', 22, 204)

    // Footer line
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(22, 242); ctx.lineTo(MW - 148, 242); ctx.stroke()
    ctx.font = '500 7px monospace'
    ctx.fillStyle = 'rgba(255,255,255,0.15)'
    ctx.letterSpacing = '0.8px'
    ctx.fillText(SITE_HOST, 22, 260)
    ctx.fillStyle = 'rgba(255,255,255,0.08)'
    ctx.fillText(shareUrl.slice(0, 52) + (shareUrl.length > 52 ? '…' : ''), 22, 274)

    // QR code
    if (qrRef.current) {
      const svgEl = qrRef.current.querySelector('svg')
      if (svgEl) {
        const svgData = new XMLSerializer().serializeToString(svgEl)
        const img = new window.Image()
        img.onload = () => {
          const qrX = MW - 132, qrY = 38, qrS = 104
          ctx.fillStyle = '#ffffff'
          ctx.beginPath()
          if (ctx.roundRect) ctx.roundRect(qrX - 6, qrY - 6, qrS + 12, qrS + 12, 7)
          else ctx.rect(qrX - 6, qrY - 6, qrS + 12, qrS + 12)
          ctx.fill()
          ctx.drawImage(img, qrX, qrY, qrS, qrS)
          ctx.strokeStyle = `rgba(${r},${g},${b},0.45)`
          ctx.lineWidth = 1.5
          ctx.beginPath()
          if (ctx.roundRect) ctx.roundRect(qrX - 7, qrY - 7, qrS + 14, qrS + 14, 8)
          else ctx.rect(qrX - 7, qrY - 7, qrS + 14, qrS + 14)
          ctx.stroke()
          ctx.font = '500 6px monospace'
          ctx.fillStyle = 'rgba(255,255,255,0.25)'
          ctx.letterSpacing = '0.8px'
          ctx.textAlign = 'center'
          ctx.fillText('SCAN TO VISIT', qrX + qrS / 2, qrY + qrS + 16)
          ctx.textAlign = 'left'
        }
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgData)}`
      }
    }
  }, [block, shareUrl])

  const accent = block?.color || '#00ff88'

  return (
    <>
      {showFull && (
        <TileCertificate block={block} shareUrl={shareUrl} onClose={() => setShowFull(false)} />
      )}

      {/* Hidden QR for canvas */}
      <div ref={qrRef} style={{ position: 'absolute', visibility: 'hidden', pointerEvents: 'none' }}>
        <QRCodeSVG value={shareUrl} size={104} level="M" bgColor="#ffffff" fgColor="#000000" />
      </div>

      <div style={{ position: 'relative' }}>
        {/* Canvas card */}
        <canvas
          ref={canvasRef}
          width={MW}
          height={MH}
          onClick={() => setShowFull(true)}
          style={{
            width: '100%', height: 'auto',
            borderRadius: 6, display: 'block',
            cursor: 'pointer',
            border: `1px solid ${accent}28`,
            transition: 'border-color 0.2s, box-shadow 0.2s',
            boxShadow: `0 4px 24px ${accent}14`,
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = accent + '55'; e.currentTarget.style.boxShadow = `0 8px 32px ${accent}28` }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = accent + '28'; e.currentTarget.style.boxShadow = `0 4px 24px ${accent}14` }}
          title="Click to view full certificate"
        />

        {/* Action row below the canvas */}
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button
            onClick={() => setShowFull(true)}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 4, border: 'none',
              background: accent, color: '#000',
              fontWeight: 800, fontSize: 10, cursor: 'pointer',
              fontFamily: 'var(--mono)', letterSpacing: '0.05em',
            }}
          >
            ↗ View & Download
          </button>
          <button
            onClick={() => { navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 1800) }}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 4,
              background: 'var(--s3)', border: '1px solid var(--b0)',
              color: copied ? accent : 'var(--t2)',
              fontWeight: 700, fontSize: 10, cursor: 'pointer',
              fontFamily: 'var(--mono)', letterSpacing: '0.04em',
              transition: 'color 0.2s',
            }}
          >
            {copied ? '✓ Copied' : '⎘ Copy Link'}
          </button>
        </div>
      </div>
    </>
  )
}

// Re-export default so existing imports still work
TileCertificate.Mini = MiniCertificate
