import { useState, useRef, useCallback } from 'react'
import { useIsMobile } from '../lib/hooks'

export default function SearchBar({ onFlyTo }) {
  const isMobile = useIsMobile()
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen]       = useState(false)
  const debounceRef = useRef(null)
  const inputRef    = useRef(null)

  const search = useCallback((q) => {
    if (!q.trim()) { setResults([]); return }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res  = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=6&q=${encodeURIComponent(q)}`, { headers: { 'Accept-Language': 'en' } })
        const data = await res.json()
        setResults(data.map(r => ({
          name: r.display_name.split(',').slice(0,2).join(', '),
          lng: parseFloat(r.lon), lat: parseFloat(r.lat),
        })))
      } catch { setResults([]) }
      finally { setLoading(false) }
    }, 320)
  }, [])

  const pick = (r) => {
    onFlyTo(r.lng, r.lat)
    setQuery(r.name); setResults([]); setOpen(false)
    inputRef.current?.blur()
  }

  const clear = () => { setQuery(''); setResults([]); inputRef.current?.focus() }
  const hasDropdown = open && results.length > 0

  return (
    <div style={{
      position: 'fixed',
      top: isMobile ? 'calc(max(14px, var(--sat)) + 58px)' : 'max(14px, var(--sat))',
      left: '50%', transform: 'translateX(-50%)',
      zIndex: 20,
      width: isMobile ? 'min(360px, calc(100vw - 28px))' : 'min(360px, calc(100vw - 380px))',
    }}>
      {/* Input */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: 'var(--s2)',
        // Hairline matched to the rest of the top chrome. Dropped along the
        // bottom edge when the results panel is open so the two read as one
        // surface rather than two stacked boxes.
        border: '1px solid var(--b0)',
        borderBottom: hasDropdown ? 'none' : '1px solid var(--b0)',
        borderRadius: hasDropdown ? '7px 7px 0 0' : 7,
        padding: '0 14px', height: 42,
        boxShadow: 'var(--sh-sm)',
      }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, color: 'var(--t3)' }}>
          <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.5"/>
          <line x1="9.5" y1="9.5" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>

        <input
          ref={inputRef}
          value={query}
          placeholder="Search cities, countries…"
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={e => { setQuery(e.target.value); search(e.target.value) }}
          onKeyDown={e => {
            if (e.key === 'Escape') { clear(); setOpen(false) }
            if (e.key === 'Enter' && results[0]) pick(results[0])
          }}
          style={{
            flex: 1, background: 'none', border: 'none', outline: 'none',
            color: 'var(--t1)', fontFamily: 'var(--font)',
            fontSize: 13, fontWeight: 500,
          }}
        />

        {loading && (
          <div style={{
            width: 14, height: 14, flexShrink: 0, borderRadius: '50%',
            border: '1.5px solid var(--s4)',
            borderTopColor: 'var(--green)',
            animation: 'spin 0.8s linear infinite',
          }} />
        )}
        {query && !loading && (
          <button
            onMouseDown={e => { e.preventDefault(); clear() }}
            style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 2, flexShrink: 0 }}
          >×</button>
        )}
      </div>

      {/* Dropdown */}
      {hasDropdown && (
        <div style={{
          background: 'var(--s2)',
          border: '1px solid var(--b0)',
          borderTop: 'none',
          borderRadius: '0 0 7px 7px',
          overflow: 'hidden',
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
        }}>
          {results.map((r, i) => (
            <div
              key={i}
              onMouseDown={() => pick(r)}
              style={{
                padding: '11px 14px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 10,
                borderTop: i > 0 ? '1px solid var(--b0)' : 'none',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--s3)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--t3)', flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 400 }}>
                {r.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
