/**
 * PersonalPlaceOnboarding — the "Find your home" funnel.
 *
 * Shown to first-time visitors (or anyone landing with ?onboard=1) over the
 * map. The user types a place — their home, school, favorite spot — and
 * sees a tiny preview of the tile they'd own + a one-click "Claim it" CTA.
 *
 * The funnel: search → see the tile → see the price → claim. Designed to
 * convert TikTok-driven traffic in under 30 seconds.
 *
 * See documentation/viral-strategy.md § OwnYourSchool / Personal Place Onboarding
 */

import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api'
import { useGameStore } from '../store/gameStore'
import { tileCenter, tileBasePrice } from '../lib/tiles'

function debounce(fn, ms) {
  let t
  const wrapped = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms) }
  wrapped.cancel = () => clearTimeout(t)
  return wrapped
}

export default function PersonalPlaceOnboarding({ onClose, flyToRef }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [picked, setPicked] = useState(null)
  const inputRef = useRef(null)
  const blocks = useGameStore(s => s.blocks)
  const setSelectedKey = useGameStore(s => s.setSelectedKey)
  const stats = useGameStore(s => s.stats)
  const sold = stats?.sold ?? 0

  useEffect(() => { inputRef.current?.focus() }, [])

  const searchRef = useRef(null)
  if (searchRef.current == null) {
    searchRef.current = debounce(async (q) => {
      if (!q || q.length < 2) { setResults([]); setSearching(false); return }
      try {
        const r = await api.searchPlace(q, 6)
        setResults(r)
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 300)
  }

  // Cleanup the debounce timer on unmount
  useEffect(() => {
    const debounced = searchRef.current
    return () => debounced?.cancel?.()
  }, [])

  // Trigger search whenever the query changes — done in the input handler,
  // not via useEffect, to avoid setState-during-effect cascades.
  const updateQuery = (next) => {
    setQuery(next)
    setPicked(null)
    const trimmed = next.trim()
    if (!trimmed) {
      setResults([])
      setSearching(false)
      searchRef.current?.cancel?.()
      return
    }
    setSearching(true)
    searchRef.current(trimmed)
  }

  const selectPlace = (place) => {
    setPicked(place)
    setResults([])
  }

  const claim = () => {
    if (!picked) return
    const tileKey = picked.tile_key
    const owned = blocks.has(tileKey)
    setSelectedKey(tileKey)
    const [lng, lat] = tileCenter(picked.tx, picked.ty)
    flyToRef?.current?.(lng, lat, 14)
    // Strip ?onboard from URL so it doesn't keep reopening
    const url = new URL(window.location.href)
    url.searchParams.delete('onboard')
    window.history.replaceState({}, '', url.toString())
    onClose()
    if (owned) return
  }

  const previewPrice = picked
    ? Math.round(tileBasePrice(picked.tx, picked.ty) * (1 + (sold / 268435456) * 3) * 100) / 100
    : null
  const isOwned = picked && blocks.has(picked.tile_key)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 240,
      // Radial scrim rather than a flat one + blur: keeps the map readable
        // behind the modal without frosted glass, which is out of contract
        // here (see documentation/styling.md).
        background: 'radial-gradient(ellipse 78% 68% at 50% 50%,'
          + ' rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.82) 38%,'
          + ' rgba(0,0,0,0.58) 70%, rgba(0,0,0,0.28) 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 'max(20px, var(--sat)) 20px max(20px, var(--sab))',
      overflowY: 'auto',
    }}>
      <div style={{
        width: '100%', maxWidth: 520,
        background: 'var(--s1)',
        borderRadius: 10,
        padding: 'clamp(24px, 4vw, 36px)',
        boxShadow: 'var(--sh-lg)',
        animation: 'scale-in 0.4s cubic-bezier(0.34,1.05,0.64,1)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <span className="badge badge-dim">Welcome to CryptoLand</span>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', color: 'var(--t3)',
              fontSize: 22, cursor: 'pointer', padding: 4, lineHeight: 1,
            }}
          >×</button>
        </div>

        <div style={{
          fontSize: 'clamp(22px, 5vw, 30px)', fontWeight: 800, color: 'var(--t1)',
          lineHeight: 1.15, letterSpacing: '-0.02em', marginBottom: 8,
        }}>
          Find your home<br />on the world map.
        </div>
        <div style={{ fontSize: 14, color: 'var(--t2)', marginBottom: 24, lineHeight: 1.6 }}>
          Search for your house, your school, your favorite spot. See the tile you'd own — and the price.
        </div>

        <div style={{ position: 'relative', marginBottom: results.length || picked ? 16 : 28 }}>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => updateQuery(e.target.value)}
            placeholder="e.g. Eiffel Tower, 123 Main St, Brooklyn…"
            style={{
              width: '100%',
              padding: '14px 18px',
              fontSize: 15,
              background: 'var(--s2)',
              border: '1px solid var(--b1)',
              borderRadius: 7,
              color: 'var(--t1)',
              outline: 'none',
              boxSizing: 'border-box',
            }}
            onFocus={e => e.currentTarget.style.borderColor = 'var(--green)'}
            onBlur={e => e.currentTarget.style.borderColor = 'var(--b1)'}
          />
          {searching && (
            <div style={{
              position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)',
              fontSize: 11, color: 'var(--t3)',
            }}>
              searching…
            </div>
          )}
        </div>

        {results.length > 0 && !picked && (
          <div style={{
            display: 'flex', flexDirection: 'column',
            background: 'var(--s2)', borderRadius: 7, overflow: 'hidden',
            marginBottom: 16,
            maxHeight: 280, overflowY: 'auto',
          }}>
            {results.map(r => (
              <button
                key={r.tile_key}
                onClick={() => selectPlace(r)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '12px 16px',
                  background: 'transparent',
                  border: 'none', borderBottom: '1px solid var(--b0)',
                  cursor: 'pointer', textAlign: 'left',
                  color: 'var(--t1)',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--b0)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{ fontSize: 18 }}>📍</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)',
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.short_name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2,
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.country || 'Earth'} · {r.tile_key}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {picked && (
          <div style={{
            padding: 18,
            background: 'var(--s2)',
            borderRadius: 7,
            marginBottom: 16,
            border: isOwned ? '1px solid rgba(248,113,113,0.3)' : '1px solid rgba(74,222,128,0.3)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 22 }}>📍</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)',
                              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {picked.short_name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'var(--mono)', marginTop: 2 }}>
                  {picked.country || 'Earth'} · tile {picked.tile_key}
                </div>
              </div>
            </div>

            {isOwned ? (
              <div style={{
                padding: '10px 12px',
                background: 'rgba(248,113,113,0.08)',
                border: '1px solid rgba(248,113,113,0.2)',
                borderRadius: 5,
                fontSize: 12, color: 'var(--red)', textAlign: 'center',
                marginBottom: 12,
              }}>
                Already owned — view it on the map
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 11, color: 'var(--t3)' }}>Estimated price</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 800, color: 'var(--green)' }}>
                  ${previewPrice?.toFixed(2) ?? '—'}
                </span>
              </div>
            )}

            <button
              onClick={claim}
              className="btn-hero"
              style={{ width: '100%', height: 48, fontSize: 14 }}
            >
              {isOwned ? 'View on map →' : 'Show me this tile →'}
            </button>
          </div>
        )}

        {!query && !picked && (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8,
            marginBottom: 8,
          }}>
            {[
              ['Eiffel Tower', 'Paris'],
              ['Times Square', 'NYC'],
              ['Buckingham Palace', 'London'],
              ['Sydney Opera House', 'Sydney'],
            ].map(([name, hint]) => (
              <button
                key={name}
                onClick={() => updateQuery(name)}
                style={{
                  padding: '10px 12px',
                  background: 'var(--s2)',
                  border: '1px solid var(--b1)',
                  borderRadius: 5,
                  fontSize: 12, color: 'var(--t2)',
                  cursor: 'pointer', textAlign: 'left',
                  transition: 'all 0.1s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--green)'; e.currentTarget.style.color = 'var(--t1)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--b1)'; e.currentTarget.style.color = 'var(--t2)' }}
              >
                <div style={{ fontWeight: 600 }}>{name}</div>
                <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>{hint}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
