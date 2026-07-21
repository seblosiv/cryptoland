import { useEffect, useState, useRef } from 'react'
import { useGameStore } from '../store/gameStore'

const MOCK_COUNTRIES = ['Tokyo','London','New York','Seoul','Dubai','Singapore','Paris','Sydney','Berlin','Warsaw','São Paulo','Mumbai','Lagos','Toronto','Amsterdam','Zürich','Hong Kong','Cairo','Mexico City','Bangkok']
const MOCK_OWNERS    = ['CryptoWhale.eth','nft_baron','moon_boi','DeFiKing','LandBaron.eth','0x3a4F…8c21','Satoshi.eth','defi_degen','alpha_trader','hodler_99','web3_maxi','eth_lord.eth']
const MOCK_COLORS    = ['#A78BFA','#60A5FA','#F472B6','#34D399','#FB923C','#FBBF24','#38BDF8','#E879F9']

let counter = 0

export default function PurchaseToast() {
  const blocks = useGameStore(s => s.blocks)
  const [toasts, setToasts] = useState([])
  const prevRef    = useRef(blocks)
  const timerRef   = useRef(null)

  const add = (owner, country, price, color) => {
    const id = ++counter
    setToasts(prev => [...prev.slice(-4), { id, owner, country, price, color }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5200)
  }

  useEffect(() => {
    return useGameStore.subscribe(state => {
      if (state.blocks !== prevRef.current) {
        const newKeys = [...state.blocks.keys()].filter(k => !prevRef.current.has(k))
        for (const key of newKeys) {
          const b = state.blocks.get(key)
          if (b) add(b.owner, b.country, b.price, b.color)
        }
        prevRef.current = state.blocks
      }
    })
  }, [])

  useEffect(() => {
    let n = 0
    const schedule = () => {
      timerRef.current = setTimeout(() => {
        n++
        add(
          MOCK_OWNERS[Math.floor(Math.random() * MOCK_OWNERS.length)],
          MOCK_COUNTRIES[n % MOCK_COUNTRIES.length],
          (12 + Math.random() * 28).toFixed(2),
          MOCK_COLORS[Math.floor(Math.random() * MOCK_COLORS.length)],
        )
        schedule()
      }, 8000 + Math.random() * 18000)
    }
    timerRef.current = setTimeout(schedule, 6000)
    return () => clearTimeout(timerRef.current)
  }, [])

  if (!toasts.length) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 'calc(var(--feed-h) + 12px)',
      left: 'max(12px, var(--sal))',
      zIndex: 40,
      display: 'flex', flexDirection: 'column-reverse', gap: 6,
      pointerEvents: 'none',
    }}>
      {toasts.map(t => <Toast key={t.id} {...t} />)}
    </div>
  )
}

function Toast({ owner, country, price, color }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 13px',
      background: 'var(--s2)',
      borderLeft: `3px solid ${color}`,
      borderRadius: 12,
      boxShadow: 'var(--sh-md)',
      minWidth: 220, maxWidth: 280,
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateX(0)' : 'translateX(-12px)',
      transition: 'opacity 0.25s ease, transform 0.25s cubic-bezier(0.34,1.2,0.64,1)',
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
        background: 'var(--s3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
          <span style={{ color, fontFamily: 'var(--mono)' }}>{owner}</span>
          <span style={{ color: 'var(--t3)', fontWeight: 400 }}> claimed </span>
          <span>{country}</span>
        </div>
        <div style={{ fontSize: 10, color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontFamily: 'var(--mono)', color: 'var(--green)', fontWeight: 700 }}>${price}</span>
          <span>· just now</span>
        </div>
      </div>
    </div>
  )
}
