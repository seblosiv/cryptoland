import { useState } from 'react'
import { useAuthStore } from '../store/authStore'

// ── Shared input style ────────────────────────────────────────────────────────
const inp = {
  width: '100%',
  background: '#0d0d0d',
  border: '1px solid #333',
  borderRadius: 4,
  padding: '10px 14px',
  color: '#e8e8e8',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
}
const btn = (primary) => ({
  width: '100%',
  padding: '11px 0',
  borderRadius: 4,
  border: primary ? 'none' : '1px solid #333',
  background: primary ? '#4ade80' : 'transparent',
  color: primary ? '#000' : '#aaa',
  fontWeight: primary ? 700 : 500,
  fontSize: 14,
  cursor: 'pointer',
})

// ── Login form ────────────────────────────────────────────────────────────────
function LoginForm({ onSwitch }) {
  const { login, loading, error, clearError } = useAuthStore()
  const [email, setEmail]     = useState('')
  const [password, setPass]   = useState('')

  async function submit(e) {
    e.preventDefault()
    clearError()
    try { await login(email, password) } catch {}
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <input
        style={inp} type="email" placeholder="Email" required
        value={email} onChange={e => setEmail(e.target.value)} autoComplete="email"
      />
      <input
        style={inp} type="password" placeholder="Password" required
        value={password} onChange={e => setPass(e.target.value)} autoComplete="current-password"
      />
      {error && <div style={{ color: '#f87171', fontSize: 13 }}>{error}</div>}
      <button style={btn(true)} type="submit" disabled={loading}>
        {loading ? 'Signing in…' : 'Sign In'}
      </button>
      <div style={{ textAlign: 'center', fontSize: 13, color: '#666' }}>
        No account?{' '}
        <span
          onClick={onSwitch}
          style={{ color: '#4ade80', cursor: 'pointer', textDecoration: 'underline' }}
        >Create one</span>
      </div>
    </form>
  )
}

// ── Register form ─────────────────────────────────────────────────────────────
function RegisterForm({ onSwitch }) {
  const { register, loading, error, clearError } = useAuthStore()
  const [email,    setEmail]    = useState('')
  const [password, setPass]     = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [username, setUsername] = useState('')
  const [localErr, setLocalErr] = useState('')

  async function submit(e) {
    e.preventDefault()
    clearError()
    setLocalErr('')
    if (password !== confirm) { setLocalErr('Passwords do not match'); return }
    if (password.length < 8)  { setLocalErr('Password must be at least 8 characters'); return }
    try { await register(email, password, username || undefined) } catch {}
  }

  const displayErr = localErr || error

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <input
        style={inp} type="text" placeholder="Username (optional)"
        value={username} onChange={e => setUsername(e.target.value)} autoComplete="username"
      />
      <input
        style={inp} type="email" placeholder="Email" required
        value={email} onChange={e => setEmail(e.target.value)} autoComplete="email"
      />
      <input
        style={inp} type="password" placeholder="Password (8+ characters)" required
        value={password} onChange={e => setPass(e.target.value)} autoComplete="new-password"
      />
      <input
        style={inp} type="password" placeholder="Confirm password" required
        value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password"
      />
      {displayErr && <div style={{ color: '#f87171', fontSize: 13 }}>{displayErr}</div>}
      <button style={btn(true)} type="submit" disabled={loading}>
        {loading ? 'Creating account…' : 'Create Account'}
      </button>
      <div style={{ textAlign: 'center', fontSize: 13, color: '#666' }}>
        Already have an account?{' '}
        <span
          onClick={onSwitch}
          style={{ color: '#4ade80', cursor: 'pointer', textDecoration: 'underline' }}
        >Sign in</span>
      </div>
    </form>
  )
}

// ── Guest-claim form (set password on a guest account) ────────────────────────
function GuestClaimForm({ guestUserId, onDone }) {
  const { guestClaim, loading, error, clearError } = useAuthStore()
  const [password, setPass]   = useState('')
  const [confirm,  setConfirm] = useState('')
  const [username, setUser]    = useState('')
  const [localErr, setLocalErr] = useState('')

  async function submit(e) {
    e.preventDefault()
    clearError()
    setLocalErr('')
    if (password !== confirm) { setLocalErr('Passwords do not match'); return }
    if (password.length < 8)  { setLocalErr('Password must be at least 8 characters'); return }
    try {
      await guestClaim(guestUserId, password, username || undefined)
      onDone?.()
    } catch {}
  }

  const displayErr = localErr || error

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ color: '#aaa', fontSize: 13, lineHeight: 1.5 }}>
        Your tile was saved. Set a password to secure your account and access it later.
      </div>
      <input
        style={inp} type="text" placeholder="Username (optional)"
        value={username} onChange={e => setUser(e.target.value)} autoComplete="username"
      />
      <input
        style={inp} type="password" placeholder="Password (8+ characters)" required
        value={password} onChange={e => setPass(e.target.value)} autoComplete="new-password"
      />
      <input
        style={inp} type="password" placeholder="Confirm password" required
        value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password"
      />
      {displayErr && <div style={{ color: '#f87171', fontSize: 13 }}>{displayErr}</div>}
      <button style={btn(true)} type="submit" disabled={loading}>
        {loading ? 'Saving…' : 'Secure My Account'}
      </button>
    </form>
  )
}

// ── Root modal ────────────────────────────────────────────────────────────────
export default function AuthModal() {
  const { authModalOpen, authModalTab, closeAuthModal } = useAuthStore()
  const [tab, setTab] = useState(authModalTab)

  if (!authModalOpen) return null

  const switchTab = (t) => { setTab(t); useAuthStore.getState().clearError() }

  return (
    <div
      onClick={closeAuthModal}
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 380,
          background: '#141414',
          border: '1px solid #222',
          borderRadius: 8,
          padding: '28px 28px 24px',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#e8e8e8' }}>
            {tab === 'login' ? 'Sign In' : 'Create Account'}
          </div>
          <button
            onClick={closeAuthModal}
            style={{ background: 'none', border: 'none', color: '#666', fontSize: 20, cursor: 'pointer', padding: 0, lineHeight: 1 }}
          >×</button>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#0d0d0d', borderRadius: 4, padding: 4 }}>
          {['login', 'register'].map(t => (
            <button
              key={t}
              onClick={() => switchTab(t)}
              style={{
                flex: 1, padding: '7px 0', borderRadius: 3, border: 'none',
                background: tab === t ? '#1e1e1e' : 'transparent',
                color: tab === t ? '#e8e8e8' : '#666',
                fontWeight: tab === t ? 600 : 400,
                fontSize: 13, cursor: 'pointer',
              }}
            >{t === 'login' ? 'Sign In' : 'Register'}</button>
          ))}
        </div>

        {tab === 'login'
          ? <LoginForm    onSwitch={() => switchTab('register')} />
          : <RegisterForm onSwitch={() => switchTab('login')} />
        }

        {/* Divider + wallet note */}
        <div style={{ marginTop: 20, borderTop: '1px solid #222', paddingTop: 16, color: '#555', fontSize: 12, textAlign: 'center', lineHeight: 1.6 }}>
          No crypto required. Connect a wallet later for NFTs, guardians &amp; affiliate rewards.
        </div>
      </div>
    </div>
  )
}

// ── Exported guest-claim modal ────────────────────────────────────────────────
export function GuestClaimModal({ userId, email, onDone, onSkip }) {
  return (
    <div
      onClick={onSkip}
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 380,
          background: '#141414',
          border: '1px solid #222',
          borderRadius: 8,
          padding: '28px 28px 24px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#e8e8e8' }}>Secure Your Account</div>
          <button onClick={onSkip} style={{ background: 'none', border: 'none', color: '#666', fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ fontSize: 13, color: '#4ade80', marginBottom: 20 }}>{email}</div>
        <GuestClaimForm guestUserId={userId} onDone={onDone} />
        <div style={{ marginTop: 14, textAlign: 'center', fontSize: 12, color: '#555' }}>
          <span onClick={onSkip} style={{ cursor: 'pointer', textDecoration: 'underline' }}>Skip for now</span>
        </div>
      </div>
    </div>
  )
}
