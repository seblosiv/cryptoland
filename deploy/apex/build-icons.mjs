#!/usr/bin/env node
/**
 * build-icons.mjs — the favicon set, generated rather than hand-exported.
 *
 *   node deploy/apex/build-icons.mjs
 *
 * THE MARK. One filled tile on a grid: the product reduced to its smallest true
 * statement. It has to survive 16px in a browser tab, so it is three elements —
 * ground, two hairlines, one solid square — and nothing else. No wordmark, no
 * gradient, no rounded corners fighting the OS mask.
 *
 * WHAT GOOGLE ACTUALLY INDEXES. Google's crawler wants a square icon that is a
 * multiple of 48px and reachable from a <link rel="icon"> on a crawlable page —
 * it does not read favicon.ico by preference any more, and it re-crawls icons
 * rarely, so getting the sizes right the first time matters. We ship 48 / 96 /
 * 144 / 192 / 512 PNG, an SVG for modern browsers, an ICO for old ones, and a
 * 180px apple-touch-icon, which is the one Safari pins.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const OUT = 'deploy/apex/dist'
mkdirSync(OUT, { recursive: true })

/* ── the mark ─────────────────────────────────────────────────────────────
   Drawn on a 64-unit grid so every edge lands on a whole pixel at 16, 32, 48,
   96, 192 and 512 — a mark that blurs at 16px is a mark nobody recognises. */
const svg = ({ bg = '#000000', grid = '#3a3a3c', tile = '#ffffff', pad = 0 } = {}) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" fill="${bg}"/>
  <g stroke="${grid}" stroke-width="2" shape-rendering="crispEdges">
    <path d="M24 ${pad} V${64 - pad} M44 ${pad} V${64 - pad} M${pad} 24 H${64 - pad} M${pad} 44 H${64 - pad}"/>
  </g>
  <rect x="24" y="24" width="20" height="20" fill="${tile}"/>
</svg>`

// The tab icon. A transparent ground lets the browser's own tab colour show, so
// it sits correctly in both light and dark chrome.
writeFileSync(join(OUT, 'favicon.svg'), svg({ bg: 'none', grid: '#8a8a8e' }))
// The maskable/PWA version keeps its own ground because the OS crops it.
writeFileSync(join(OUT, 'icon.svg'), svg())

writeFileSync(join(OUT, 'site.webmanifest'), JSON.stringify({
  name: 'CryptoLand by XONO',
  short_name: 'CryptoLand',
  description: 'The map you can own — 268,435,456 tiles of the real world.',
  start_url: '/',
  display: 'standalone',
  background_color: '#000000',
  theme_color: '#000000',
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 2))

console.log('  favicon.svg + icon.svg + site.webmanifest written')
console.log('  run scripts/rasterise-icons.mjs on the box to emit the PNG/ICO set')
