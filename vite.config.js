import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'

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
function chainMeta() {
  return {
    name: 'cryptoland-chain-meta',
    transformIndexHtml(html) {
      const chain = process.env.VITE_CHAIN || 'polygon-amoy'
      let name = 'CryptoLand'
      let tagline = 'Own real Earth territory on-chain.'
      try {
        const cfg = readFileSync('src/lib/blockchain/config.js', 'utf8')
        const block = cfg.split(new RegExp(`\\n  '?${chain}'?:\\s*\\{`))[1] ?? ''
        name = (/name:\s*'([^']+)'/.exec(block)?.[1]) || name
      } catch { /* fall back to defaults */ }
      try {
        const prof = readFileSync('src/config/profiles.js', 'utf8')
        const block = prof.split(new RegExp(`\\n  '?${chain}'?:\\s*\\{`))[1] ?? ''
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
    open: true,
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
