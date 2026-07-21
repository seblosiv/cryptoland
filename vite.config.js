import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      // Optional per-chain wallet SDKs — never bundled. Each is dynamically
      // imported at runtime only when its chain build actually connects, and
      // marked external so the bundler doesn't fail when the package isn't
      // installed (each per-chain deployment installs only the SDK it needs).
      external: [
        '@solana/web3.js',   // Solana
        '@tonconnect/sdk',   // TON
        '@tonconnect/ui',    // TON (UI variant)
        '@mysten/sui',       // Sui (if used by a future adapter revision)
        '@aptos-labs/ts-sdk',// Aptos (if used by a future adapter revision)
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
