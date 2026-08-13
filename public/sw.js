/**
 * CryptoLand Service Worker
 * ==========================
 *
 * WHY THIS WAS REWRITTEN. The previous version served navigations
 * stale-while-revalidate out of a cache whose version was the constant
 * 'cl-v1'. Two consequences, both reproduced:
 *
 *   1. Every returning visitor got the PREVIOUS build's index.html on their
 *      first load after a deploy — measurably: build B on the server, and the
 *      first page still asked for build A's /assets/index-CGB7STv5.js.
 *   2. Because the version never changed, `activate` never deleted anything,
 *      so that stale document could persist across any number of deploys.
 *
 *   index.html is the one file that must never be stale: it is the only thing
 *   that knows which hashed assets exist. Serve yesterday's copy and it asks
 *   for files that rsync --delete removed — no CSS, no JS, a white page. That
 *   is the "won't open on the first try, fine on reload" report.
 *
 * SO: documents are network-first and the cache is only an offline fallback.
 * Hashed assets are cache-first, which is safe precisely because their names
 * change when their contents do.
 *
 * A third bug, independent of staleness: staleWhileRevalidate ended with
 * `return cached ?? fetchPromise`, and fetchPromise was `fetch().catch(() =>
 * null)`. With nothing cached and one flaky request, that resolved to null —
 * and respondWith(null) is a TypeError, so the browser hard-fails the request
 * with no retry. A single blip on the entry chunk was a blank page. Every path
 * below now resolves to a Response.
 */

/* Replaced at build time with a hash of the built index.html (see the
   chainMeta plugin in vite.config.js). Same build → same id, so this stays
   deterministic; a new build → new caches, and activate drops the old ones. */
const BUILD = '__BUILD_ID__'
const STATIC_CACHE = `cl-${BUILD}-static`
const MAP_CACHE    = `cl-${BUILD}-map`
const KEEP = new Set([STATIC_CACHE, MAP_CACHE])

// Deliberately NOT '/' or '/index.html'. Precaching the document is what
// pinned the stale shell; the offline fallback below caches it as a side
// effect of real navigations instead.
const APP_SHELL = ['/favicon.svg', '/icons.svg']

const API_PREFIXES = [
  '/blocks', '/stats', '/np/', '/guardian', '/marketplace', '/dao',
  '/analytics', '/nft', '/token', '/price-events', '/signals', '/feed',
  '/alerts', '/auth', '/purchase', '/metrics', '/affiliate', '/search',
]

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE)
    // cache.addAll is atomic — one 404 and the whole install rejects, leaving
    // the old worker in place. Add individually so a missing optional file
    // cannot block the update that fixes things.
    await Promise.all(APP_SHELL.map(u => cache.add(u).catch(() => {})))
  })())
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    const stale = keys.filter(k => k.startsWith('cl-') && !KEEP.has(k))
    await Promise.all(stale.map(k => caches.delete(k)))
    await self.clients.claim()

    // One-time rescue for a visitor arriving on the pre-fix worker: the page
    // they are looking at was served stale from ITS cache, so it may be
    // pointing at assets this deploy deleted. It cannot heal itself — that
    // build shipped no listener for us taking over — so we navigate it.
    //
    // Gated specifically on the LEGACY cache name, not on "any old cache".
    // Once everyone is on a versioned worker this never fires again: an
    // ordinary deploy leaves open tabs alone, because network-first already
    // guarantees their next navigation is fresh and force-reloading someone
    // mid-purchase to tell them about a deploy is its own bug.
    if (stale.some(k => k.startsWith('cl-v1'))) {
      const windows = await self.clients.matchAll({ type: 'window' })
      for (const c of windows) {
        try { await c.navigate(c.url) } catch { /* not permitted here — the page reloads normally */ }
      }
    }
  })())
})

self.addEventListener('message', (e) => {
  if (e.data === 'skip-waiting') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  let url
  try { url = new URL(request.url) } catch { return }

  // Live data is never cached.
  if (url.origin === self.location.origin &&
      API_PREFIXES.some(p => url.pathname.startsWith(p))) return

  // Documents: network wins, always. The cache exists so the app still opens
  // on a train, not so it can outlive a deploy.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, STATIC_CACHE))
    return
  }

  if (url.hostname.includes('tile.openstreetmap') ||
      url.hostname.includes('a.tiles') ||
      url.hostname.includes('b.tiles') ||
      url.hostname.includes('c.tiles')) {
    event.respondWith(cacheFirst(request, MAP_CACHE, 7 * 24 * 60 * 60))
    return
  }

  // Hashed build output: cache-first is correct here and only here, because
  // the filename changes whenever the bytes do.
  if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE, Infinity))
  }
})

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request)
    if (response && response.ok) {
      const cache = await caches.open(cacheName)
      cache.put(request, response.clone()).catch(() => {})
    }
    return response
  } catch {
    const cached = await caches.match(request)
    // Any navigation falls back to the last document we saw, so a deep link
    // still opens offline rather than erroring.
    return cached ?? await caches.match('/') ??
      new Response('<!doctype html><meta charset="utf-8"><title>Offline</title>',
        { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }
}

async function cacheFirst(request, cacheName, maxAgeSec = 3600) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) {
    if (maxAgeSec === Infinity) return cached
    const date = cached.headers.get('date')
    const age = date ? (Date.now() - new Date(date).getTime()) / 1000 : 0
    if (age < maxAgeSec) return cached
  }
  try {
    const response = await fetch(request)
    if (response && response.ok) cache.put(request, response.clone()).catch(() => {})
    return response
  } catch {
    // Never null: respondWith(null) is a TypeError and fails the request
    // outright, which is how one flaky asset became a blank page.
    return cached ?? Response.error()
  }
}

self.addEventListener('push', (event) => {
  if (!event.data) return
  let data = {}
  try { data = event.data.json() } catch { return }
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'CryptoLand', {
      body: data.body ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-72.png',
      data: data.url ? { url: data.url } : undefined,
      vibrate: [200, 100, 200],
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'
  event.waitUntil(self.clients.openWindow(url))
})
