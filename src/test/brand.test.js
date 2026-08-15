/**
 * The XONO mark exists twice — once as a React component for the app
 * (src/components/logos/_xono.jsx) and once as SVG strings for the generated
 * static pages (deploy/apex/brand.mjs), which are built by plain node scripts
 * that cannot import JSX.
 *
 * Two copies of a logo drift. This fails the build when they do.
 *
 * It is not theoretical: the first hand-transcription of brand.mjs got the O
 * counters wrong — inner radius 16 became 16.5 and an arc sweep flag flipped —
 * and both O's rendered as near-solid blobs. It looked fine in the code and
 * only showed up when someone rendered it.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const componentSrc = readFileSync(
  join(ROOT, 'src/components/logos/_xono.jsx'), 'utf8')
const brandSrc = readFileSync(
  join(ROOT, 'deploy/apex/brand.mjs'), 'utf8')

/**
 * Every path body in a source file, normalised.
 *
 * The two files store them differently: the component as `d="…"` attributes,
 * brand.mjs as bare double-quoted strings in arrays. Match both, or the test
 * reports drift that does not exist — which is exactly what it did first.
 */
function pathsOf(src) {
  const out = []
  for (const m of src.matchAll(/d="([^"]+)"/g)) out.push(m[1])
  for (const m of src.matchAll(/d=\{`([^`]+)`\}/g)) out.push(m[1])
  for (const m of src.matchAll(/"(M[^"]+)"/g)) out.push(m[1])
  return [...new Set(out.map((s) => s.replace(/\s+/g, ' ').trim()))]
}

describe('XONO mark — the two copies must agree', () => {
  const compPaths = pathsOf(componentSrc)
  const brandPaths = pathsOf(brandSrc)

  it('the component defines the wordmark', () => {
    // 15 wordmark paths + 3 glyph paths (glyph uses template literals)
    expect(compPaths.length).toBeGreaterThanOrEqual(15)
  })

  it('every wordmark path in the component exists in brand.mjs', () => {
    // Static wordmark paths only — the glyph is built from template literals
    // with interpolated numbers, so it cannot be compared as a literal string.
    const literal = compPaths.filter((p) => !p.includes('${'))
    expect(literal.length).toBe(15)
    const missing = literal.filter((p) => !brandPaths.includes(p))
    expect(missing, 'brand.mjs has drifted from _xono.jsx — regenerate it')
      .toEqual([])
  })

  it('both O counters are real rings, not filled blobs', () => {
    // A Didone O is one path with TWO subpaths: outer bowl, then the counter
    // drawn in the opposite sweep so evenodd cuts it out. A single subpath is
    // the blob bug. Every O must contain two `A` arc pairs and two `Z`s.
    const os = brandPaths.filter((p) => p.includes('A29 35.2'))
    expect(os.length, 'expected two O paths').toBe(2)
    for (const o of os) {
      expect((o.match(/Z/g) || []).length, 'O must have two subpaths').toBe(2)
      // The counter must be meaningfully smaller than the bowl but not tiny:
      // 16 against 29 is the drawn contrast. A near-equal or near-zero inner
      // radius is the failure mode.
      const inner = o.match(/A(\d+(?:\.\d+)?) 33/)
      expect(inner, 'O counter arc missing').toBeTruthy()
      const r = parseFloat(inner[1])
      expect(r).toBeGreaterThan(10)
      expect(r).toBeLessThan(29)
    }
  })

  it('the accent applies to exactly one letter', () => {
    // The whole point of the current mark: one accented letter reads as a full
    // stop, two split the eye. Guard against someone re-colouring both O's.
    const accentGroups = componentSrc.match(/accent \? accentColor/g) || []
    // one in the wordmark, one in the glyph
    expect(accentGroups.length).toBe(2)
  })
})
