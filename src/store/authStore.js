import { create } from 'zustand'
import { api } from '../lib/api'

const TOKEN_KEY = 'cl-auth-token'

function loadToken() {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}
function saveToken(t) {
  try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY) } catch {}
}

export const useAuthStore = create((set, get) => ({
  user:       null,   // { user_id, email, wallet, username, avatar_emoji, bio, is_guest, ... }
  token:      null,
  loading:    false,
  error:      null,
  authReady:  false,  // true once tryRestoreAuth has resolved (guards the boot race)
  authModalOpen: false,
  authModalTab:  'login',   // 'login' | 'register'

  // ── Modal control ─────────────────────────────────────────────────────────
  openAuthModal: (tab = 'login') => set({ authModalOpen: true, authModalTab: tab, error: null }),
  closeAuthModal: () => set({ authModalOpen: false, error: null }),

  // ── Boot: restore from localStorage token ─────────────────────────────────
  tryRestoreAuth: async () => {
    const token = loadToken()
    if (!token) { set({ authReady: true }); return }
    try {
      const user = await api.me()
      set({ user, token, authReady: true })
    } catch {
      saveToken(null)
      set({ token: null, user: null, authReady: true })
    }
  },

  // ── Register ──────────────────────────────────────────────────────────────
  register: async (email, password, username) => {
    set({ loading: true, error: null })
    try {
      const { token, user } = await api.register(email, password, username)
      saveToken(token)
      set({ token, user, loading: false, authModalOpen: false })
      return user
    } catch (e) {
      set({ loading: false, error: e.message })
      throw e
    }
  },

  // ── Login ─────────────────────────────────────────────────────────────────
  login: async (email, password) => {
    set({ loading: true, error: null })
    try {
      const { token, user } = await api.login(email, password)
      saveToken(token)
      set({ token, user, loading: false, authModalOpen: false })
      return user
    } catch (e) {
      set({ loading: false, error: e.message })
      throw e
    }
  },

  // ── Logout ────────────────────────────────────────────────────────────────
  logout: async () => {
    try { await api.logout() } catch {}
    saveToken(null)
    set({ token: null, user: null, error: null })
  },

  // ── Link wallet to logged-in account ─────────────────────────────────────
  linkWallet: async (wallet) => {
    try {
      const res = await api.linkWallet(wallet)
      // Backend returns { ok: true, user: {...} } — unwrap to the user row.
      const user = res?.user ?? res
      set({ user })
      return user
    } catch (e) {
      // Non-fatal — wallet may already be linked
      console.warn('[auth] linkWallet:', e.message)
    }
  },

  // ── Wallet-only sign in / up ──────────────────────────────────────────────
  // Called when wallet connects but no email session exists. Performs a
  // SIWE-style challenge: fetch a nonce, sign it with the wallet, then upsert.
  // The signature proves control of the address (the backend recovers it and
  // rejects any request whose signature doesn't match).
  loginWithWallet: async (wallet) => {
    // Never overwrite an already-authenticated session (e.g. a restored email
    // account). The boot race could otherwise resolve wallet-first and clobber
    // the real token with a wallet-only one.
    if (get().user) return get().user
    try {
      // 1. Ask the server for a nonce + the exact message to sign.
      const { nonce, message } = await api.walletNonce(wallet)
      // 2. Sign it with the active chain's wallet adapter.
      const { signMessage } = await import('../lib/blockchain')
      const { signature } = await signMessage(message, wallet)
      // 3. Exchange the signed nonce for a session token.
      const { token, user } = await api.linkWalletUpsert(wallet, signature, nonce)
      saveToken(token)
      set({ token, user })
      return user
    } catch (e) {
      // Fail closed: a wallet that can't prove ownership does not get a session.
      // (Local dev can set ALLOW_UNSIGNED_WALLET_AUTH=1 on the server to bypass.)
      console.warn('[auth] loginWithWallet:', e.message)
      set({ error: e.message })
    }
  },

  // ── Guest claim: set password on a guest account ─────────────────────────
  guestClaim: async (userId, password, username) => {
    set({ loading: true, error: null })
    try {
      const { token, user } = await api.guestClaim(userId, password, username)
      saveToken(token)
      set({ token, user, loading: false })
      return user
    } catch (e) {
      set({ loading: false, error: e.message })
      throw e
    }
  },

  // ── Update profile ────────────────────────────────────────────────────────
  updateProfile: async (data) => {
    try {
      const user = await api.updateProfile(data)
      set({ user })
      return user
    } catch (e) {
      set({ error: e.message })
      throw e
    }
  },

  // ── Set user directly (e.g. from guest account created during purchase) ───
  setGuestUser: (userData, token) => {
    if (token) saveToken(token)
    set({ user: userData, token: token ?? get().token })
  },

  clearError: () => set({ error: null }),
}))
