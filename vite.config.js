import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { writeChainIcons } from './scripts/chain-icons.mjs'

/**
 * Inject per-chain <title> and OG/Twitter meta into index.html at build time.
 *
 * Why this matters: grant reviewers share the subdomain link in Slack/Discord/X.
 * Without this every one of the 29 builds unfurls with the same generic preview,
 * which immediately reads as "one app with your logo on it". With it, the
 * Algorand link previews as an Algorand product.
 *
 * Reads the chain's display name + tagline straight out of the source files so
 * there is no second copy of the copy to keep in sync.
 */
/**
 * Resolve the target chain. VITE_CHAIN arrives two ways and BOTH must work:
 * exported in the environment, or written into .env.production by
 * scripts/build-chain.sh. Vite loads .env.production into `import.meta.env`,
 * never `process.env`.
 *
 * Shared by transformIndexHtml and writeBundle because Rollup does not carry
 * `this` between hooks — stashing the chain on it produced a manifest saying
 * polygon-amoy for every build, which is the same class of bug that once made
 * all 27 bundles claim "CryptoLand on Polygon Amoy" in their link previews.
 */
function resolveChain() {
  let chain = process.env.VITE_CHAIN
  if (!chain) {
    try {
      chain = /^VITE_CHAIN\s*=\s*(.+)$/m.exec(readFileSync('.env.production', 'utf8'))?.[1]?.trim()
    } catch { /* no .env.production */ }
  }
  return chain || 'polygon-amoy'
}

/**
 * The chain's display name and brand accent, read straight out of the source
 * the app itself uses. Accent resolution mirrors src/lib/chainProfile.js:
 * a PROFILES override wins, otherwise the CHAINS entry's colour.
 */
const NEXT_KEY = /\n  '?[A-Za-z0-9_-]+'?:\s*\{/

/** The chain's own entry, bounded at the next top-level key. */
function entryOf(src, chain) {
  const after = src.split(new RegExp(`\\n  '?${chain}'?:\\s*\\{`))[1]
  return after === undefined ? '' : after.split(NEXT_KEY)[0]
}

function resolveBrand(chain) {
  let name = 'CryptoLand', accent = '#4ade80'
  try {
    const block = entryOf(readFileSync('src/lib/blockchain/config.js', 'utf8'), chain)
    name = (/name:\s*'([^']+)'/.exec(block)?.[1]) || name
    accent = (/color:\s*'(#[0-9a-fA-F]{6})'/.exec(block)?.[1]) || accent
  } catch { /* defaults */ }
  try {
    const block = entryOf(readFileSync('src/config/profiles.js', 'utf8'), chain)
    accent = (/accent:\s*'(#[0-9a-fA-F]{6})'/.exec(block)?.[1]) || accent
  } catch { /* defaults */ }
  return { name, accent }
}

function chainMeta() {
  return {
    name: 'cryptoland-chain-meta',

    /**
     * public/tonconnect-manifest.json is copied verbatim by Vite, and it was
     * hardcoded to https://cryptoland.game — a domain we DO NOT OWN — with
     * terms/privacy links at /terms and /privacy when the files are actually
     * terms.html and privacy.html. TON Connect refuses a manifest whose `url`
     * does not match the app's origin, so TON wallet connect was broken on
     * every build, and the legal links 404'd even on the right domain.
     *
     * Rewritten here per chain, so each subdomain ships a manifest naming
     * itself.
     */
    writeBundle(options) {
      const chain = resolveChain()
      const domain = process.env.CRYPTOLAND_DOMAIN || 'xono.ai'
      const origin = `https://${chain}.${domain}`
      const out = `${options.dir}/tonconnect-manifest.json`
      try {
        writeFileSync(out, JSON.stringify({
          url: origin,
          name: 'CryptoLand',
          // Was /icon-180.png, which no build has ever emitted.
          iconUrl: `${origin}/icons/icon-192.png`,
          termsOfUseUrl: `${origin}/terms.html`,
          privacyPolicyUrl: `${origin}/privacy.html`,
        }, null, 2) + '\n')
      } catch { /* no dist yet — nothing to rewrite */ }

      // Stamp the service worker with a hash of the built document. Its cache
      // version was the constant 'cl-v1', so `activate` never had an old key
      // to delete and a stale index.html could outlive any number of deploys.
      // Derived from content, not a timestamp, so an unchanged build produces
      // an unchanged worker and does not churn every visitor's cache.
      try {
        const doc = readFileSync(`${options.dir}/index.html`, 'utf8')
        const id = createHash('sha256').update(doc).digest('hex').slice(0, 12)
        const swPath = `${options.dir}/sw.js`
        writeFileSync(swPath, readFileSync(swPath, 'utf8').replace('__BUILD_ID__', id))
      } catch (e) { console.warn('  sw build id skipped:', e.message) }

      // The icon set, tinted with this chain's accent. Replaces a favicon from
      // an unrelated project and a manifest that pointed at PNGs which have
      // never existed — the SPA rewrite was answering each of them with
      // index.html, so every "icon" was HTML served as image/png.
      try {
        const { name, accent } = resolveBrand(chain)
        writeChainIcons(options.dir, { chain, name, accent })
      } catch (e) { console.warn('  icon set skipped:', e.message) }
    },

    transformIndexHtml(html) {
      // VITE_CHAIN can arrive two ways and BOTH must work:
      //   - exported in the environment (`VITE_CHAIN=ton npx vite build`)
      //   - written into .env.production, which is how scripts/build-chain.sh
      //     selects the chain (it copies env/.env.<chain> into place)
      // Vite loads .env.production into `import.meta.env`, never into
      // `process.env`, so reading process.env alone silently fell back to
      // 'polygon-amoy' for every scripted build — all 27 bundles shipped OG
      // tags and a <title> saying "CryptoLand on Polygon Amoy". The bundles
      // themselves were correct; only the link preview lied, which is exactly
      // the surface a grant reviewer sees first when the URL is shared.
      let chain = process.env.VITE_CHAIN
      if (!chain) {
        try {
          const envFile = readFileSync('.env.production', 'utf8')
          chain = /^VITE_CHAIN\s*=\s*(.+)$/m.exec(envFile)?.[1]?.trim()
        } catch { /* no .env.production — fall through to the default */ }
      }
      chain = chain || 'polygon-amoy'
      let name = 'CryptoLand'
      let tagline = 'Own real Earth territory on-chain.'
      try {
        const block = entryOf(readFileSync('src/lib/blockchain/config.js', 'utf8'), chain)
        name = (/name:\s*'([^']+)'/.exec(block)?.[1]) || name
      } catch { /* fall back to defaults */ }
      try {
        // Bounded for the same reason as the accent: a chain with no `pitch`
        // was inheriting the next chain's tagline into its link preview.
        const block = entryOf(readFileSync('src/config/profiles.js', 'utf8'), chain)
        const pitch = /pitch:\s*'([^']*)'/.exec(block)?.[1]
        if (pitch) tagline = pitch.replace(/\\'/g, "'")
      } catch { /* fall back to defaults */ }

      const title = `CryptoLand on ${name} — Own the World`
      const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

      const extra = [
        `<meta property="og:site_name" content="CryptoLand" />`,
        `<meta name="twitter:title" content="${esc(title)}" />`,
        `<meta name="twitter:description" content="${esc(tagline)}" />`,
        `<meta name="cryptoland:chain" content="${esc(chain)}" />`,
      ].join('\n    ')

      // Rewrite the existing tags in place — appending would leave the generic
      // originals earlier in <head>, and crawlers take the first occurrence.
      return html
        .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
        .replace(/<meta name="description"[^>]*>/,
                 `<meta name="description" content="${esc(tagline)}" />`)
        .replace(/<meta property="og:title"[^>]*>/,
                 `<meta property="og:title" content="${esc(title)}" />`)
        .replace(/<meta property="og:description"[^>]*>/,
                 `<meta property="og:description" content="${esc(tagline)}" />`)
        .replace('</head>', `  ${extra}\n  </head>`)
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), chainMeta()],
  build: {
    rollupOptions: {
      // Optional per-chain wallet SDKs — never bundled. Each is dynamically
      // imported at runtime only when its chain build actually connects, and
      // marked external so the bundler doesn't fail when the package isn't
      // installed (each per-chain deployment installs only the SDK it needs).
      external: [
      '@onflow/fcl',
        // Solana
        '@solana/web3.js', '@solana-mobile/wallet-standard-mobile',
        // TON
        '@tonconnect/sdk', '@tonconnect/ui',
        // Sui / Aptos
        '@mysten/sui', '@aptos-labs/ts-sdk',
        // Starknet
        'starknet', '@starknet-io/get-starknet', '@starknet-io/get-starknet-core',
        // Cardano
        '@meshsdk/core', '@lucid-evolution/lucid', '@emurgo/cardano-serialization-lib-browser',
        // NEAR
        '@near-wallet-selector/core', '@near-wallet-selector/modal-ui',
        '@near-wallet-selector/meteor-wallet', '@near-wallet-selector/my-near-wallet',
        '@near-wallet-selector/sender', '@near-wallet-selector/nightly',
        '@hot-labs/near-connect', 'near-api-js',
        // Stellar
        '@stellar/freighter-api', '@stellar/stellar-sdk', '@creit.tech/stellar-wallets-kit',
        // Algorand
        'algosdk', '@txnlab/use-wallet', '@perawallet/connect',
        '@blockshake/defly-connect', 'lute-connect',
        // MultiversX
        '@multiversx/sdk-dapp', '@multiversx/sdk-core',
        '@multiversx/sdk-extension-provider', '@multiversx/sdk-native-auth-client',
        // Radix
        '@radixdlt/radix-dapp-toolkit', '@radixdlt/babylon-gateway-api-sdk',
        // Tezos
        '@airgap/beacon-sdk', '@airgap/beacon-dapp',
        '@taquito/taquito', '@taquito/beacon-wallet', '@taquito/utils',
      ],
    },
  },
  server: {
    port: 5173,
    // Do NOT auto-launch a browser. Automated/verification runs start the dev
    // server dozens of times, and `open: true` popped a real Chrome window on
    // the user's desktop every single time. Opt in per-run instead:
    //   npm run dev -- --open
    open: false,
    proxy: {
      '/blocks':         'http://127.0.0.1:8000',
      '/stats':          'http://127.0.0.1:8000',
      '/np':             'http://127.0.0.1:8000',
      '/health':         'http://127.0.0.1:8000',
      '/guardian':        'http://127.0.0.1:8000',
      '/guardians':       'http://127.0.0.1:8000',
      '/guardian-report': 'http://127.0.0.1:8000',
      '/guardian-raids':  'http://127.0.0.1:8000',
      '/guardian-profile': 'http://127.0.0.1:8000',
      '/price-events':      'http://127.0.0.1:8000',
      '/news':              'http://127.0.0.1:8000',
      '/alerts':            'http://127.0.0.1:8000',
      '/tile-price-context':'http://127.0.0.1:8000',
      '/nft':               'http://127.0.0.1:8000',
      '/marketplace':       'http://127.0.0.1:8000',
      '/analytics':         'http://127.0.0.1:8000',
      '/metrics':           'http://127.0.0.1:8000',
      '/dao':               'http://127.0.0.1:8000',
      '/token':             'http://127.0.0.1:8000',
      '/auth':              'http://127.0.0.1:8000',
      '/account':           'http://127.0.0.1:8000',
      '/sessions':          'http://127.0.0.1:8000',
      '/affiliate':         'http://127.0.0.1:8000',
      '/users':             'http://127.0.0.1:8000',
      '/feed':              'http://127.0.0.1:8000',
      '/streak':            'http://127.0.0.1:8000',
      '/share':             'http://127.0.0.1:8000',
      '/empire':            'http://127.0.0.1:8000',
      '/search':            'http://127.0.0.1:8000',
      // 2026 viral routes
      '/agents':            'http://127.0.0.1:8000',
      '/squads':            'http://127.0.0.1:8000',
      '/drop':              'http://127.0.0.1:8000',
      '/t':                 'http://127.0.0.1:8000',
      '/og':                'http://127.0.0.1:8000',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    // Hardhat contract tests run under their own toolchain in contracts/,
    // not vitest — exclude them so `npm test` doesn't try to require('hardhat').
    exclude: ['node_modules/**', 'dist/**', 'contracts/**'],
    // MSW mocks register absolute-URL handlers; pin the API base so the app's
    // relative fetches resolve to them in jsdom (no dev proxy in tests).
    env: {
      VITE_API_BASE: 'http://127.0.0.1:8000',
    },
    coverage: {
      provider: 'v8',
      include: ['src/lib/nowpayments.js', 'src/store/gameStore.js'],
    },
  },
})
