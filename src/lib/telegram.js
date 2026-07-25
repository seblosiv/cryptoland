/**
 * Telegram Mini App integration — CryptoLand
 * ===========================================
 * Thin, defensive wrapper around `window.Telegram.WebApp`, which is injected by
 * the Telegram client (see the script tag in index.html) and is `undefined`
 * everywhere else. Every call here is a no-op outside Telegram, so the same
 * build runs as a normal web app and as a Mini App.
 *
 * Why this exists: TON's grant programs (and Telegram's distribution generally)
 * treat a Mini App as the qualifying surface. See documentation/grants.md §5.
 *
 * Security: `initDataUnsafe` is NEVER trusted for identity. Only the raw
 * `initData` string is sent to the backend, which verifies its HMAC signature
 * against the bot token (`POST /auth/telegram`). Telegram's own docs are
 * explicit about this.
 */

/** The injected SDK object, or null when we're not inside Telegram. */
export function tg() {
  if (typeof window === 'undefined') return null
  return window.Telegram?.WebApp ?? null
}

/** True when running inside the Telegram client. */
export function isTelegram() {
  const w = tg()
  // `initData` is empty when the page is opened outside Telegram even if the
  // script somehow loaded, so check it rather than mere object presence.
  return Boolean(w && typeof w.initData === 'string' && w.initData.length > 0)
}

/** Feature-gate helper — most WebApp APIs are gated behind a Bot API version. */
export function supports(version) {
  const w = tg()
  try { return Boolean(w?.isVersionAtLeast?.(version)) } catch { return false }
}

/**
 * Boot the Mini App: tell Telegram we're ready, take the full viewport, and
 * mirror Telegram's theme + stable viewport height into CSS variables so the
 * existing dark UI adapts instead of fighting the client chrome.
 */
export function initTelegram() {
  const w = tg()
  if (!w) return false

  try { w.ready() } catch { /* older clients */ }
  try { w.expand() } catch { /* not always available */ }

  const applyViewport = () => {
    // Use viewportStableHeight — Telegram's docs warn that viewportHeight
    // updates too slowly to anchor bottom UI against.
    const h = w.viewportStableHeight ?? w.viewportHeight
    if (h) document.documentElement.style.setProperty('--tg-stable-height', `${h}px`)
  }
  const applyTheme = () => {
    const p = w.themeParams ?? {}
    for (const [k, v] of Object.entries(p)) {
      if (v) document.documentElement.style.setProperty(`--tg-theme-${k.replace(/_/g, '-')}`, v)
    }
    if (w.colorScheme) document.documentElement.dataset.tgColorScheme = w.colorScheme
  }

  applyViewport()
  applyTheme()
  try {
    w.onEvent('viewportChanged', applyViewport)
    w.onEvent('themeChanged', applyTheme)
  } catch { /* onEvent missing on very old clients */ }

  return true
}

/**
 * Raw initData for server-side verification. Returns null outside Telegram.
 * Send this to POST /auth/telegram — never trust initDataUnsafe locally.
 */
export function initData() {
  return isTelegram() ? tg().initData : null
}

/** Display-only user info. NOT an identity claim — the server decides that. */
export function unsafeUser() {
  return tg()?.initDataUnsafe?.user ?? null
}

/** Deep-link payload from `https://t.me/<bot>/<app>?startapp=<param>`. */
export function startParam() {
  return tg()?.initDataUnsafe?.start_param ?? null
}

// ── Native UI affordances ────────────────────────────────────────────────────

/** Show Telegram's native back button wired to `cb`; returns an unsubscribe fn. */
export function showBackButton(cb) {
  const b = tg()?.BackButton
  if (!b) return () => {}
  try {
    b.onClick(cb)
    b.show()
    return () => { try { b.offClick(cb); b.hide() } catch { /* ignore */ } }
  } catch { return () => {} }
}

/** Haptics — cheap polish that makes a Mini App feel native (Bot API 6.1+). */
export const haptics = {
  impact(style = 'light')      { try { tg()?.HapticFeedback?.impactOccurred(style) } catch { /* ignore */ } },
  notify(type = 'success')     { try { tg()?.HapticFeedback?.notificationOccurred(type) } catch { /* ignore */ } },
  select()                     { try { tg()?.HapticFeedback?.selectionChanged() } catch { /* ignore */ } },
}

/**
 * Native geolocation permission (Bot API 8.0). A map game benefits directly:
 * "claim the tile you're standing on". Resolves null if unavailable/denied.
 */
export async function requestLocation() {
  const lm = tg()?.LocationManager
  if (!lm || !supports('8.0')) return null
  return new Promise(resolve => {
    try {
      lm.init(() => {
        lm.getLocation(loc => resolve(loc ?? null))
      })
    } catch { resolve(null) }
  })
}

/** Share a tile out to a Telegram chat / story where supported. */
export function share(url, text = '') {
  const w = tg()
  if (!w) return false
  try {
    w.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`)
    return true
  } catch { return false }
}
