/**
 * theme.test.js — the per-chain accent must be readable on all 29 builds.
 * =======================================================================
 * A chain's brand colour is picked for that chain's own (usually white) website.
 * Ours is near-black. Four of them were unreadable as body text against `--s1`:
 * Cardano `#0033ad` at 1.82:1, Radix `#052cc0` at 1.87:1, Stellar `#7d00ff` at
 * 2.91:1 and Base `#0052ff` at 3.20:1, where WCAG AA wants 4.5:1.
 *
 * `applyProfileTheme()` derives `--chain-accent-ui` (accent lightened only as far
 * as it must be to clear the bar) and `--chain-accent-ink` (a foreground readable
 * ON the accent). This asserts that derivation holds for every mainnet chain, so
 * chain #30 cannot ship an invisible accent without failing the suite — the same
 * guarantee `chains.test.js` gives for adapter exports.
 */
import { describe, it, expect } from 'vitest'
import { __theme } from '../lib/chainProfile.js'
import { PROFILES } from '../config/profiles.js'
import { MAINNET_CHAINS } from '../lib/blockchain/config.js'

const { hexToRgb, rgbToHex, contrast, readableInk, TARGET } = __theme

const S1 = hexToRgb('#141414')   // the surface accent-as-ink sits on
const INK_MIN = 4.5              // AA for the CTA label on its own button

// MAINNET_CHAINS is an array of chain entries, each carrying its own `key`.
const mainnetKeys = MAINNET_CHAINS.map((c) => c.key)
const byKey = Object.fromEntries(MAINNET_CHAINS.map((c) => [c.key, c]))

// Exactly the resolution order chainProfile.js uses: a PROFILES override wins,
// otherwise the chain's own brand colour from config.js.
const accentOf = (key) => PROFILES[key]?.accent ?? byKey[key]?.color

describe('per-chain accent palette', () => {
  it('covers every mainnet chain', () => {
    expect(mainnetKeys.length).toBeGreaterThanOrEqual(29)
  })

  it.each(mainnetKeys)('%s has a 6-digit hex accent', (key) => {
    // applyProfileTheme() builds --chain-accent-dim by string concat (accent +
    // '22'), so a 3-digit or named colour would silently produce garbage.
    expect(accentOf(key)).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it.each(mainnetKeys)('%s resolves to ink readable on --s1', (key) => {
    const ui = readableInk(hexToRgb(accentOf(key)))
    expect(contrast(ui, S1)).toBeGreaterThanOrEqual(TARGET - 0.01)
  })

  it.each(mainnetKeys)('%s resolves to a label readable on the accent', (key) => {
    const rgb = hexToRgb(accentOf(key))
    const ink = contrast(rgb, hexToRgb('#0f0f0f')) >= contrast(rgb, [255, 255, 255])
      ? hexToRgb('#0f0f0f')
      : [255, 255, 255]
    expect(contrast(rgb, ink)).toBeGreaterThanOrEqual(INK_MIN)
  })

  it('leaves already-readable accents at their exact brand hex', () => {
    // The point of deriving rather than overriding: ~20 chains pass untouched and
    // must keep the colour their ecosystem actually uses.
    const untouched = mainnetKeys.filter((key) => {
      const a = accentOf(key)
      return rgbToHex(...readableInk(hexToRgb(a))).toLowerCase() === a.toLowerCase()
    })
    expect(untouched.length).toBeGreaterThan(mainnetKeys.length / 2)
  })

  it('lightens the four accents that were failing, and only as far as needed', () => {
    for (const key of ['cardano', 'radix', 'stellar', 'base']) {
      const raw = hexToRgb(accentOf(key))
      expect(contrast(raw, S1)).toBeLessThan(TARGET)          // was failing
      const ui = readableInk(raw)
      expect(contrast(ui, S1)).toBeGreaterThanOrEqual(TARGET - 0.01)  // now passes
      expect(contrast(ui, S1)).toBeLessThan(TARGET + 1.0)     // not bleached to white
    }
  })
})
