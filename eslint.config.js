import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // Build output and vendored contract deps are not our source to lint.
  globalIgnores(['dist', 'dist-*', 'contracts/node_modules', 'node_modules']),

  // Browser app source (React).
  {
    files: ['src/**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },

  // Node-side scripts: hardhat contracts, build scripts, config, tooling.
  // These legitimately use process / require / module / Buffer / __dirname.
  {
    files: [
      'contracts/**/*.{js,cjs}',
      'scripts/**/*.{js,mjs,cjs}',
      '*.config.{js,mjs,cjs}',
      'vite.config.js',
      'eslint.config.js',
    ],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: { ...globals.node, ...globals.mocha },
      sourceType: 'commonjs',
    },
  },
])
