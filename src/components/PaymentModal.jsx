import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useGameStore } from '../store/gameStore'
import TileCertificate from './TileCertificate'
import { useWalletStore } from '../store/walletStore'
import { useUserStore } from '../store/userStore'
import { useAffiliateStore } from '../store/affiliateStore'
import { useAuthStore } from '../store/authStore'
import { tileBasePrice } from '../lib/tiles'
import { statusLabel } from '../lib/nowpayments'
import { useIsMobile } from '../lib/hooks'
import { GuestClaimModal } from './AuthModal'

const CURRENCIES = [
  { id: 'usdttrc20',    name: 'USDT',     icon: '₮', color: '#26a17b', minUsd: 12.00, primary: true },
  { id: 'btc',          name: 'Bitcoin',  icon: '₿', color: '#f7931a', minUsd: 1.50 },
  { id: 'eth',          name: 'Ethereum', icon: 'Ξ', color: '#627eea', minUsd: 0.50 },
  { id: 'sol',          name: 'Solana',   icon: '◎', color: '#9945ff', minUsd: 0.50 },
  { id: 'bnbbsc',       name: 'BNB',      icon: 'B', color: '#f3ba2f', minUsd: 0.10 },
  { id: 'maticmainnet', name: 'Polygon',  icon: 'M', color: '#8247e5', minUsd: 0.10 },
  { id: 'xrp',          name: 'XRP',      icon: '✕', color: '#346aa9', minUsd: 0.10 },
  { id: 'ltc',          name: 'Litecoin', icon: 'Ł', color: '#bfbbbb', minUsd: 0.10 },
  { id: 'trx',          name: 'TRON',     icon: '◈', color: '#ef0027', minUsd: 0.15 },
]

const STEPS = ['select', 'payment', 'confirming', 'confirmed']
const STEP_LABELS = { select: 'Currency', payment: 'Pay', confirming: 'Confirm', confirmed: 'Done' }

function fmt(s) {
  return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`
}

export default function PaymentModal() {
  const purchaseModal      = useGameStore(s => s.purchaseModal)
  const purchaseStep       = useGameStore(s => s.purchaseStep)
  const paymentData        = useGameStore(s => s.paymentData)
  const paymentTimeLeft    = useGameStore(s => s.paymentTimeLeft)
  const closePurchaseModal = useGameStore(s => s.closePurchaseModal)
  const tickPaymentTimer   = useGameStore(s => s.tickPaymentTimer)
  const [copied, setCopied] = useState(false)
  const isMobile = useIsMobile()

  useEffect(() => {
    if (purchaseStep !== 'payment') return
    const id = setInterval(tickPaymentTimer, 1000)
    return () => clearInterval(id)
  }, [purchaseStep])

  const copy = (txt) => {
    navigator.clipboard.writeText(txt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!purchaseModal) return null

  const vStep = purchaseStep === 'loading' ? 'payment' : purchaseStep
  const stepIdx = STEPS.indexOf(vStep)

  const sheetStyle = isMobile ? {
    width: '100%', borderRadius: '10px 10px 0 0',
    maxHeight: '93dvh', overflowY: 'auto',
    paddingBottom: 'max(0px, var(--sab))',
    animation: 'sheet-up 0.3s cubic-bezier(0.34,1.2,0.64,1)',
  } : {
    width: '100%', maxWidth: 440, borderRadius: 10,
    animation: 'scale-in 0.24s cubic-bezier(0.34,1.3,0.64,1)',
    maxHeight: '92vh', overflowY: 'auto',
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && closePurchaseModal()}>
      <div className="panel" style={sheetStyle}>
        {isMobile && <div className="drag-handle" />}

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 20px 14px',
          borderBottom: '1px solid var(--b0)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="live-dot" />
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)', letterSpacing: '-0.02em' }}>
              Purchase Block
            </span>
          </div>
          <button onClick={closePurchaseModal} style={closeBtnStyle}>×</button>
        </div>

        {/* Steps */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--b0)' }}>
          {STEPS.map((step, i) => {
            const done   = stepIdx > i
            const active = vStep === step
            return (
              <div key={step} style={{
                flex: 1, padding: '11px 0',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                borderRight: i < 3 ? '1px solid var(--b0)' : 'none',
                background: active ? 'var(--green-d)' : 'transparent',
                transition: 'background 0.2s',
              }}>
                <div style={{
                  width: 18, height: 18, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, fontWeight: 700, fontFamily: 'var(--mono)',
                  background: active ? 'var(--green)' : done ? 'rgba(74,222,128,0.15)' : 'var(--s3)',
                  color: active ? '#0f0f0f' : done ? 'var(--green)' : 'var(--t3)',
                  transition: 'all 0.2s',
                }}>
                  {done ? '✓' : i + 1}
                </div>
                <span style={{
                  fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600,
                  color: active ? 'var(--green)' : done ? 'var(--green)' : 'var(--t3)',
                }}>
                  {STEP_LABELS[step]}
                </span>
              </div>
            )
          })}
        </div>

        {/* Content */}
        <div style={{ padding: '22px 20px' }} className="allow-select">
          {purchaseStep === 'select'     && <CurrencySelect />}
          {purchaseStep === 'loading'    && <Loading />}
          {purchaseStep === 'payment'    && paymentData && <Pay data={paymentData} timeLeft={paymentTimeLeft} copied={copied} onCopy={copy} />}
          {purchaseStep === 'confirming' && <Confirming status={paymentData?.status} />}
          {purchaseStep === 'confirmed'  && <Confirmed onClose={closePurchaseModal} />}
          {purchaseStep === 'error'      && <Err onClose={closePurchaseModal} />}
        </div>
      </div>
    </div>
  )
}

function CurrencySelect() {
  const selectedCurrency    = useGameStore(s => s.selectedCurrency)
  const setSelectedCurrency = useGameStore(s => s.setSelectedCurrency)
  const startPayment        = useGameStore(s => s.startPayment)
  const selectedKey         = useGameStore(s => s.selectedKey)
  const blocks              = useGameStore(s => s.blocks)
  const setPurchaseEmail    = useGameStore(s => s.setPurchaseEmail)

  const authUser = useAuthStore(s => s.user)
  const [email, setEmail] = useState('')

  const price = selectedKey ? (() => {
    const [tx, ty] = selectedKey.split(':').map(Number)
    const b = blocks.get(selectedKey)
    return parseFloat(b?.price ?? tileBasePrice(tx, ty))
  })() : 2.00

  const currentCurrency = CURRENCIES.find(c => c.id === selectedCurrency)
  if (!currentCurrency || price < currentCurrency.minUsd) {
    const first = CURRENCIES.find(c => price >= c.minUsd)
    if (first) setSelectedCurrency(first.id)
  }

  function handleStart() {
    if (!authUser && email) setPurchaseEmail?.(email)
    startPayment()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 7 }}>
        {CURRENCIES.map(c => {
          const tooLow  = price < c.minUsd
          const active  = selectedCurrency === c.id
          return (
            <button
              key={c.id}
              onClick={() => !tooLow && setSelectedCurrency(c.id)}
              disabled={tooLow}
              title={tooLow ? `Min $${c.minUsd.toFixed(2)}` : c.name}
              style={{
                padding: '12px 8px', borderRadius: 6, textAlign: 'center',
                cursor: tooLow ? 'not-allowed' : 'pointer',
                opacity: tooLow ? 0.22 : 1,
                background: active ? `${c.color}14` : 'var(--s2)',
                border: active ? `1.5px solid ${c.color}44` : 'none',
                transition: 'all 0.15s',
                transform: active ? 'scale(1.03)' : 'scale(1)',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <div style={{ fontSize: 22, marginBottom: 5, color: tooLow ? 'var(--t4)' : c.color, lineHeight: 1 }}>{c.icon}</div>
              <div style={{ fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700, color: tooLow ? 'var(--t4)' : 'var(--t1)' }}>{c.name}</div>
              {c.primary && !tooLow && <div style={{ fontSize: 8, color: 'var(--green)', marginTop: 2, fontWeight: 700 }}>★ primary</div>}
              {tooLow && <div style={{ fontSize: 8, color: 'var(--red)', marginTop: 2 }}>min ${c.minUsd.toFixed(0)}+</div>}
            </button>
          )
        })}
      </div>

      {/* Price display */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '13px 16px', borderRadius: 6,
        background: 'var(--s2)',
      }}>
        <span className="label">Block price</span>
        <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 20, color: 'var(--t1)', letterSpacing: '-0.03em' }}>
          ${price.toFixed(2)} <span style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 500 }}>USD</span>
        </span>
      </div>

      {/* Email field — only shown when not logged in */}
      {!authUser && (
        <div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 7 }}>
            Email <span style={{ color: 'var(--t4)' }}>(optional — get receipt &amp; account)</span>
          </div>
          <input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: '#0d0d0d', border: '1px solid #333',
              borderRadius: 4, padding: '10px 14px',
              color: '#e8e8e8', fontSize: 13, outline: 'none',
            }}
          />
        </div>
      )}

      <button className="btn" style={{ width: '100%' }} onClick={handleStart}>
        Generate Payment →
      </button>
    </div>
  )
}

function Loading() {
  return (
    <div style={{ padding: '52px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
      <div style={{
        width: 40, height: 40, borderRadius: '50%',
        border: '2px solid var(--s4)',
        borderTopColor: 'var(--green)',
        animation: 'spin 0.9s linear infinite',
      }} />
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)', marginBottom: 5 }}>Generating Payment</div>
        <div style={{ fontSize: 12, color: 'var(--t3)' }}>Fetching live rate & deposit address…</div>
      </div>
    </div>
  )
}

const CURRENCY_META = {
  usdttrc20:    { label: 'USDT (TRC20)', scheme: 'tron' },
  btc:          { label: 'BTC',          scheme: 'bitcoin' },
  eth:          { label: 'ETH',          scheme: 'ethereum' },
  sol:          { label: 'SOL',          scheme: 'solana' },
  bnbbsc:       { label: 'BNB',          scheme: 'bnb' },
  maticmainnet: { label: 'MATIC',        scheme: 'polygon' },
  xrp:          { label: 'XRP',          scheme: 'ripple' },
  ltc:          { label: 'LTC',          scheme: 'litecoin' },
  trx:          { label: 'TRX',          scheme: 'tron' },
}

function Pay({ data, timeLeft, copied, onCopy }) {
  const urgent = timeLeft < 300
  const ticker = data.currency.toLowerCase()
  const meta   = CURRENCY_META[ticker] ?? { label: ticker.toUpperCase(), scheme: ticker }
  const qrVal  = `${meta.scheme}:${data.address}?amount=${data.amount}`

  const statusColor = { waiting: 'var(--t2)', confirming: 'var(--amber)', confirmed: 'var(--green)' }[data.status] ?? 'var(--t3)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Status + timer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: statusColor }} />
          <span style={{ fontSize: 11, color: statusColor, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {statusLabel(data.status)}
          </span>
        </div>
        {timeLeft > 0 ? (
          <span style={{
            fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 14,
            color: urgent ? 'var(--red)' : 'var(--t1)',
            background: urgent ? 'rgba(248,113,113,0.08)' : 'var(--s3)',
            padding: '4px 10px', borderRadius: 4,
          }}>
            {fmt(timeLeft)}
          </span>
        ) : (
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--red)', fontWeight: 700 }}>EXPIRED</span>
        )}
      </div>

      {/* Amount */}
      <div style={{
        textAlign: 'center', padding: '18px 14px', borderRadius: 7,
        background: 'var(--s2)',
      }}>
        <div className="label" style={{ marginBottom: 7 }}>Send exactly</div>
        <div style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 26, color: 'var(--t1)', letterSpacing: '-0.03em', lineHeight: 1 }}>
          {data.amount}
        </div>
        <div style={{ fontSize: 13, color: 'var(--t3)', marginTop: 4, fontWeight: 600 }}>{meta.label}</div>
        <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>≈ ${data.usdAmount} USD</div>
      </div>

      {/* QR */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={{ padding: 12, background: '#ffffff', borderRadius: 7, boxShadow: 'var(--sh-md)' }}>
          <QRCodeSVG value={qrVal} size={136} level="M" />
        </div>
      </div>

      {/* Address */}
      <div>
        <div className="label" style={{ marginBottom: 7 }}>Payment address</div>
        <div
          onClick={() => onCopy(data.address)}
          style={{
            padding: '11px 13px', borderRadius: 5, cursor: 'pointer',
            background: 'var(--s2)',
            display: 'flex', gap: 10, alignItems: 'flex-start',
            transition: 'background 0.1s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--s3)'}
          onMouseLeave={e => e.currentTarget.style.background = 'var(--s2)'}
        >
          <span style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t2)', wordBreak: 'break-all', lineHeight: 1.6 }}>
            {data.address}
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, color: copied ? 'var(--green)' : 'var(--t2)', flexShrink: 0, letterSpacing: '0.06em' }}>
            {copied ? '✓ COPIED' : 'COPY'}
          </span>
        </div>
      </div>

      {/* Payment ID */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 12px', borderRadius: 4,
        background: 'var(--s2)',
      }}>
        <span className="label">Payment ID</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t3)' }}>{data.paymentId}</span>
      </div>

      <p style={{ fontSize: 11, color: 'var(--t3)', textAlign: 'center' }}>
        Polling blockchain every 10s — updates automatically
      </p>
    </div>
  )
}

function Confirming({ status }) {
  return (
    <div style={{ padding: '48px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
      <div style={{
        width: 56, height: 56, borderRadius: '50%',
        border: '2px solid var(--s4)',
        borderTopColor: 'var(--green)',
        animation: 'spin 1.1s linear infinite',
      }} />
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)', marginBottom: 7 }}>
          Awaiting Confirmation
        </div>
        <div style={{ fontSize: 13, color: 'var(--t3)', lineHeight: 1.6 }}>
          {status ? statusLabel(status) : 'Scanning blockchain for your transaction…'}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {[0,1,2].map(i => (
          <div key={i} style={{
            width: 18, height: 3, borderRadius: 2,
            background: 'var(--green)', opacity: 0.5,
            animation: `blink 1.4s ${i*0.45}s ease-in-out infinite`,
          }} />
        ))}
      </div>
      <style>{`@keyframes blink { 0%,100%{opacity:0.5} 50%{opacity:1} }`}</style>
    </div>
  )
}

function Err({ onClose }) {
  const purchaseError = useGameStore(s => s.purchaseError)
  return (
    <div style={{ padding: '36px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, textAlign: 'center' }}>
      <div style={{
        width: 56, height: 56, borderRadius: '50%',
        background: 'rgba(248,113,113,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, color: 'var(--red)',
      }}>✕</div>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--red)', marginBottom: 7 }}>Purchase Failed</div>
        <div style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.6 }}>{purchaseError ?? 'Unknown error'}</div>
      </div>
      <button className="btn" style={{ width: '100%' }} onClick={onClose}>Close</button>
    </div>
  )
}

function Confirmed({ onClose }) {
  const purchasingKey  = useGameStore(s => s.purchasingKey)
  const paymentData    = useGameStore(s => s.paymentData)
  const openCustomize  = useGameStore(s => s.openCustomizeModal)
  const blocks         = useGameStore(s => s.blocks)
  const block          = purchasingKey ? blocks.get(purchasingKey) : null
  const walletAddress  = useWalletStore(s => s.address)
  const openWallet     = useWalletStore(s => s.openWalletModal)
  const openAccount    = useUserStore(s => s.openAccountModal)
  const myCode         = useAffiliateStore(s => s.myCode)
  const getReferralUrl = useAffiliateStore(s => s.getReferralUrl)
  const authUser       = useAuthStore(s => s.user)
  const openAuthModal  = useAuthStore(s => s.openAuthModal)
  const setGuestUser   = useAuthStore(s => s.setGuestUser)
  const [copiedR, setCopiedR] = useState(false)
  const [copiedS, setCopiedS] = useState(false)
  const [copiedRef, setCopiedRef] = useState(false)
  const [showGuestClaim, setShowGuestClaim] = useState(false)
  const [showCert, setShowCert] = useState(false)
  const referralUrl    = getReferralUrl()

  // If server returned a guest account on finalize, store it and offer to secure it
  const guestAccount = paymentData?.guestAccount  // { user_id, email, is_guest }
  useEffect(() => {
    if (guestAccount && !authUser) {
      setGuestUser(guestAccount, null)
    }
  }, [guestAccount])

  if (showGuestClaim && guestAccount) {
    return <GuestClaimModal
      userId={guestAccount.user_id}
      email={guestAccount.email}
      onDone={() => { setShowGuestClaim(false) }}
      onSkip={() => setShowGuestClaim(false)}
    />
  }

  const shareUrl  = purchasingKey ? `${window.location.origin}${window.location.pathname}?block=${purchasingKey}` : ''
  const paymentId = paymentData?.paymentId ?? ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
      {/* Success icon */}
      <div style={{ padding: '24px 0 8px' }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%', margin: '0 auto 14px',
          background: 'rgba(74,222,128,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24, color: 'var(--green)',
          animation: 'scale-in 0.4s cubic-bezier(0.34,1.4,0.64,1)',
        }}>✓</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t1)', marginBottom: 7, letterSpacing: '-0.03em' }}>
          Block Acquired
        </div>
        <div style={{ fontSize: 13, color: 'var(--t2)' }}>
          {block?.country ?? 'Your territory'} is now yours on-chain.
        </div>
      </div>

      {/* Block info */}
      <div style={{
        width: '100%', background: 'var(--s2)',
        borderRadius: 6, padding: '12px 14px',
        display: 'flex', flexDirection: 'column', gap: 7, textAlign: 'left',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="label">Block</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--green)', fontWeight: 700 }}>{purchasingKey}</span>
        </div>
        <div style={{ height: 1, background: 'var(--b0)' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="label">Status</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--green)', fontWeight: 700 }}>Live on map ✓</span>
        </div>
      </div>

      {paymentId && (
        <div style={{ width: '100%', textAlign: 'left' }}>
          <div className="label" style={{ marginBottom: 7 }}>Payment Receipt</div>
          <div
            onClick={() => { navigator.clipboard.writeText(paymentId); setCopiedR(true); setTimeout(()=>setCopiedR(false),1800) }}
            style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '10px 13px', borderRadius: 5, cursor: 'pointer', background: 'var(--s2)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--s3)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--s2)'}
          >
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{paymentId}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: copiedR ? 'var(--green)' : 'var(--t2)', flexShrink: 0 }}>{copiedR ? '✓' : 'COPY'}</span>
          </div>
        </div>
      )}

      {shareUrl && block && (
        <>
          {showCert && (
            <TileCertificate block={block} shareUrl={shareUrl} onClose={() => setShowCert(false)} />
          )}
          <div style={{ width: '100%' }}>
            <div className="label" style={{ marginBottom: 8 }}>Your Deed of Ownership</div>
            {/* Certificate preview card — click to expand */}
            <div
              onClick={() => setShowCert(true)}
              style={{
                background: 'var(--s2)', borderRadius: 6, padding: '13px 14px',
                cursor: 'pointer', border: `1px solid ${block.color || 'var(--b0)'}40`,
                transition: 'border-color 0.2s',
                display: 'flex', alignItems: 'center', gap: 14,
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = (block.color || '#00ff88') + '80'}
              onMouseLeave={e => e.currentTarget.style.borderColor = (block.color || '#00ff88') + '40'}
            >
              {/* Mini QR */}
              <div style={{ background: '#fff', padding: 5, borderRadius: 4, flexShrink: 0 }}>
                <QRCodeSVG value={shareUrl} size={54} level="M" bgColor="#ffffff" fgColor="#000000" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t1)', marginBottom: 3 }}>
                  {block.country || 'Your Tile'}
                </div>
                <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--t4)', marginBottom: 6 }}>
                  {block.key} · ${parseFloat(block.price).toFixed(2)}
                </div>
                <div style={{ fontSize: 9, fontWeight: 700, color: block.color || 'var(--green)', letterSpacing: '0.05em' }}>
                  Tap to view & download certificate →
                </div>
              </div>
            </div>
            {/* Copy link row */}
            <div
              onClick={() => { navigator.clipboard.writeText(shareUrl); setCopiedS(true); setTimeout(() => setCopiedS(false), 1800) }}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '9px 13px', borderRadius: 5, cursor: 'pointer', background: 'var(--s2)', marginTop: 6 }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--s3)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--s2)'}
            >
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shareUrl}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: copiedS ? 'var(--green)' : 'var(--t2)', flexShrink: 0 }}>{copiedS ? '✓ Copied' : '⎘ Copy'}</span>
            </div>
          </div>
        </>
      )}

      {/* Account prompt — shown when no account after purchase */}
      {!authUser && (
        <div style={{
          width: '100%', padding: '14px', borderRadius: 6,
          background: 'rgba(74,222,128,0.07)', border: '1px solid rgba(74,222,128,0.2)',
          textAlign: 'left',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)', marginBottom: 4 }}>
            {guestAccount ? 'Secure Your Account' : 'Create your account'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--t3)', lineHeight: 1.6, marginBottom: 10 }}>
            {guestAccount
              ? `Your tile is saved to ${guestAccount.email}. Set a password to access your dashboard, manage tiles, and earn referral rewards.`
              : 'Sign in or create an account to manage tiles, deploy guardians, and earn 30% affiliate commission.'}
          </div>
          {guestAccount ? (
            <button className="btn" style={{ width: '100%', fontSize: 12 }} onClick={() => setShowGuestClaim(true)}>
              Set Password →
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 7 }}>
              <button className="btn" style={{ flex: 1, fontSize: 12 }} onClick={() => { onClose(); openAuthModal('register') }}>
                Register
              </button>
              <button className="btn-ghost" style={{ flex: 1, fontSize: 12 }} onClick={() => { onClose(); openWallet() }}>
                Connect Wallet
              </button>
            </div>
          )}
        </div>
      )}

      {/* Share referral link — shown when wallet connected and code exists */}
      {walletAddress && myCode && referralUrl && (
        <div style={{ width: '100%', textAlign: 'left' }}>
          <div className="label" style={{ marginBottom: 7 }}>Earn 30% — Share Your Referral Link</div>
          <div
            onClick={() => { navigator.clipboard.writeText(referralUrl); setCopiedRef(true); setTimeout(() => setCopiedRef(false), 2000) }}
            style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '10px 13px', borderRadius: 5, cursor: 'pointer', background: 'var(--s2)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--s3)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--s2)'}
          >
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--green)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{referralUrl}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: copiedRef ? 'var(--green)' : 'var(--t2)', flexShrink: 0 }}>{copiedRef ? '✓ Copied' : 'Copy'}</span>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, width: '100%' }}>
        <button className="btn-ghost" style={{ flex: 1 }} onClick={() => { onClose(); if (purchasingKey) openCustomize(purchasingKey) }}>
          ✎ Customize
        </button>
        {walletAddress ? (
          <button className="btn" style={{ flex: 1 }} onClick={() => { onClose(); openAccount() }}>
            My Account →
          </button>
        ) : (
          <button className="btn" style={{ flex: 1 }} onClick={onClose}>Done</button>
        )}
      </div>
    </div>
  )
}

const closeBtnStyle = {
  width: 30, height: 30, borderRadius: 4,
  background: 'var(--s3)', border: 'none',
  color: 'var(--t2)', cursor: 'pointer', fontSize: 18,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  WebkitTapHighlightColor: 'transparent',
}
