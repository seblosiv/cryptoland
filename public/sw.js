/**
 * CryptoLand Service Worker
 * ==========================
 * Offline-capable PWA with stale-while-revalidate caching.
 * Map tiles: network-first (live data critical)
 * App shell: cache-first (fast startup)
 * API calls: network-only (real-time data)
 */

const CACHE_VERSION = 'cl-v1'
const STATIC_CACHE  = `${CACHE_VERSION}-static`
const MAP_CACHE     = `${CACHE_VERSION}-map`

const APP_SHELL = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/icons.svg',
]

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(APP_SHELL))
  )
  self.skipWaiting()
})

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('cl-') && k !== STATIC_CACHE && k !== MAP_CACHE)
          .map(k => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // API calls — always network (never cache)
  if (url.pathname.startsWith('/blocks') ||
      url.pathname.startsWith('/stats') ||
      url.pathname.startsWith('/np/') ||
      url.pathname.startsWith('/guardian') ||
      url.pathname.startsWith('/marketplace') ||
      url.pathname.startsWith('/dao') ||
      url.pathname.startsWith('/analytics') ||
      url.pathname.startsWith('/nft') ||
      url.pathname.startsWith('/token') ||
      url.pathname.startsWith('/price-events')) {
    return  // Fall through to network
  }

  // Map tiles (OpenStreetMap / MapLibre) — cache with 7-day TTL
  if (url.hostname.includes('tile.openstreetmap') ||
      url.hostname.includes('a.tiles') ||
      url.hostname.includes('b.tiles') ||
      url.hostname.includes('c.tiles')) {
    event.respondWith(cacheFirst(request, MAP_CACHE, 7 * 24 * 60 * 60))
    return
  }

  // App shell — stale-while-revalidate
  if (request.mode === 'navigate' || url.pathname.startsWith('/assets/')) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE))
    return
  }
})

async function cacheFirst(request, cacheName, maxAgeSec = 3600) {
  const cache    = await caches.open(cacheName)
  const cached   = await cache.match(request)
  if (cached) {
    const date = cached.headers.get('date')
    const age  = date ? (Date.now() - new Date(date).getTime()) / 1000 : 0
    if (age < maxAgeSec) return cached
  }
  try {
    const response = await fetch(request)
    if (response.ok) cache.put(request, response.clone())
    return response
  } catch {
    return cached ?? new Response('Offline', { status: 503 })
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName)
  const cached = await cache.match(request)
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone())
    return response
  }).catch(() => null)
  return cached ?? fetchPromise
}

// ── Push notifications ────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return
  const data = event.data.json()
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'CryptoLand', {
      body:    data.body ?? '',
      icon:    '/icons/icon-192.png',
      badge:   '/icons/icon-72.png',
      data:    data.url ? { url: data.url } : undefined,
      vibrate: [200, 100, 200],
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'
  event.waitUntil(clients.openWindow(url))
})
