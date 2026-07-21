import { useGameStore } from '../store/gameStore'
import { tileBasePrice } from '../lib/tiles'

function isTouchDevice() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches
}

export function MapTooltip({ mousePos }) {
  const hoveredKey  = useGameStore(s => s.hoveredKey)
  const selectedKey = useGameStore(s => s.selectedKey)
  const blocks      = useGameStore(s => s.blocks)

  if (isTouchDevice()) return null
  if (!hoveredKey || !mousePos) return null
  if (selectedKey) return null

  const [tx, ty] = hoveredKey.split(':').map(Number)
  const block    = blocks.get(hoveredKey) ?? null
  const price    = block?.price ?? tileBasePrice(tx, ty)
  const owned    = Boolean(block)
  const color    = block?.color ?? 'var(--green)'

  const { x, y }  = mousePos
  const flipX = x > window.innerWidth  - 240
  const flipY = y > window.innerHeight - 200

  return (
    <div
      className="desktop-only"
      style={{
        position: 'fixed',
        left:  flipX ? x - 16 : x + 18,
        top:   flipY ? y - 180 : y + 14,
        transform: flipX ? 'translateX(-100%)' : 'none',
        zIndex: 80, width: 210,
        animation: 'fade-up 0.1s ease',
        pointerEvents: 'none',
      }}
    >
      <div style={{
        background: 'var(--s1)',
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: 'var(--sh-lg)',
      }}>
        {/* Top color stripe */}
        <div style={{ height: 2, background: color }} />

        {/* Image */}
        {block?.imageUrl && (
          <div style={{ height: 70, position: 'relative', overflow: 'hidden' }}>
            <img
              src={block.imageUrl} alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.6) saturate(0.7)' }}
              onError={e => { e.target.parentElement.style.display = 'none' }}
            />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(transparent 30%, var(--s1))' }} />
            {block.label && (
              <div style={{ position: 'absolute', bottom: 7, left: 11, fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 700, color: '#fff' }}>
                {block.label}
              </div>
            )}
          </div>
        )}

        <div style={{ padding: '11px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Title row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{
              width: 7, height: 7, borderRadius: '50%',
              background: color, flexShrink: 0,
            }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>
              {block?.country ?? 'Uncharted Territory'}
            </span>
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
              padding: '2px 7px', borderRadius: 99,
              background: owned ? `${color}1a` : 'var(--green-d)',
              color: owned ? color : 'var(--green)',
            }}>
              {owned ? 'OWNED' : 'FREE'}
            </span>
          </div>

          {/* Info */}
          <div style={{
            background: 'var(--s2)',
            borderRadius: 8, padding: '8px 10px',
            display: 'flex', flexDirection: 'column', gap: 5,
          }}>
            {block && <TRow l="Owner" v={block.owner} />}
            <TRow l="Price" v={`$${price}`} hi={!block} />
            <TRow l="Tile"  v={`${tx}, ${ty}`} />
          </div>

          {!block && (
            <div style={{ fontSize: 10, color: 'var(--green)', fontWeight: 600 }}>
              Click to purchase →
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function TRow({ l, v, hi }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
      <span className="label">{l}</span>
      <span style={{ fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 700, color: hi ? 'var(--green)' : 'var(--t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {v}
      </span>
    </div>
  )
}
