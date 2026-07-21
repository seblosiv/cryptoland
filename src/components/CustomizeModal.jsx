import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { useIsMobile } from '../lib/hooks'

export default function CustomizeModal() {
  const customizeKey        = useGameStore(s => s.customizeKey)
  const blocks              = useGameStore(s => s.blocks)
  const closeCustomizeModal = useGameStore(s => s.closeCustomizeModal)
  const customizeBlock      = useGameStore(s => s.customizeBlock)

  const block    = customizeKey ? blocks.get(customizeKey) : null
  const color    = block?.color ?? 'var(--green)'
  const isMobile = useIsMobile()

  const [imageUrl, setImageUrl] = useState(block?.imageUrl ?? '')
  const [label, setLabel]       = useState(block?.label ?? '')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState(null)
  const [saved, setSaved]       = useState(false)

  const save = async () => {
    if (!customizeKey) return
    setSaving(true); setError(null)
    try {
      await customizeBlock(customizeKey, imageUrl.trim(), label.trim())
      setSaved(true)
      setTimeout(closeCustomizeModal, 900)
    } catch (err) {
      setError(err.message)
    } finally { setSaving(false) }
  }

  const sheetStyle = isMobile ? {
    width: '100%', borderRadius: '20px 20px 0 0',
    maxHeight: '88dvh', overflowY: 'auto',
    paddingBottom: 'max(0px, var(--sab))',
    animation: 'sheet-up 0.28s cubic-bezier(0.34,1.2,0.64,1)',
  } : {
    width: '100%', maxWidth: 420, borderRadius: 20,
    animation: 'scale-in 0.24s cubic-bezier(0.34,1.3,0.64,1)',
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && closeCustomizeModal()}>
      <div className="panel" style={sheetStyle}>
        {isMobile && <div className="drag-handle" />}

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 20px 14px',
          borderBottom: '1px solid var(--b0)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: color, flexShrink: 0,
            }} />
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)', letterSpacing: '-0.02em' }}>
              Customize Block
            </span>
          </div>
          <button onClick={closeCustomizeModal} style={{
            width: 30, height: 30, borderRadius: 8,
            background: 'var(--s3)', border: 'none',
            color: 'var(--t2)', cursor: 'pointer', fontSize: 18,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            WebkitTapHighlightColor: 'transparent',
          }}>×</button>
        </div>

        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 16 }} className="allow-select">

          {/* Block info card */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 14px', borderRadius: 12,
            background: 'var(--s2)',
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: color,
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="label" style={{ marginBottom: 3 }}>Block</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', letterSpacing: '-0.01em' }}>
                {block?.country ?? customizeKey}
              </div>
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t3)' }}>{customizeKey}</div>
          </div>

          {/* Image preview */}
          {imageUrl && (
            <div style={{ height: 110, borderRadius: 12, overflow: 'hidden', position: 'relative' }}>
              <img
                src={imageUrl} alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.75)' }}
                onError={e => { e.target.parentElement.style.display = 'none' }}
              />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(transparent 50%, rgba(0,0,0,0.6))' }} />
            </div>
          )}

          {/* Image URL */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label className="label">
              Image URL <span style={{ textTransform: 'none', fontWeight: 400, letterSpacing: 0, color: 'var(--t4)' }}>(optional)</span>
            </label>
            <input
              className="input"
              type="url"
              placeholder="https://example.com/photo.jpg"
              value={imageUrl}
              onChange={e => setImageUrl(e.target.value)}
            />
          </div>

          {/* Label */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label className="label">
              Display Label <span style={{ textTransform: 'none', fontWeight: 400, letterSpacing: 0, color: 'var(--t4)' }}>(optional)</span>
            </label>
            <input
              className="input"
              type="text"
              maxLength={40}
              placeholder="e.g. My HQ, The Fortress…"
              value={label}
              onChange={e => setLabel(e.target.value)}
            />
            <span style={{ fontSize: 10, color: 'var(--t4)', textAlign: 'right' }}>{label.length}/40</span>
          </div>

          {error && (
            <div style={{
              padding: '10px 13px', borderRadius: 10,
              background: 'rgba(248,113,113,0.07)',
              fontSize: 12, color: 'var(--red)', lineHeight: 1.5,
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-ghost" style={{ flex: 1 }} onClick={closeCustomizeModal}>Cancel</button>
            <button
              className="btn"
              style={{ flex: 1, ...(saved ? { background: 'var(--green)', color: '#0f0f0f' } : {}) }}
              onClick={save}
              disabled={saving || saved}
            >
              {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
