/**
 * ChainHero — per-chain hero motif
 * =================================
 * Gives each per-chain build a visually distinct first impression while the
 * layout and every component around it stay identical. Driven entirely by
 * `PROFILE.hero` (see src/lib/chainProfile.js); a chain with no `hero` entry
 * gets the neutral `grid` motif in its own accent.
 *
 * Constraints this deliberately respects:
 *   - Solid dark only. No backdrop-filter, no blur, no translucent "glass".
 *     Motifs are plain CSS gradients painted ON an opaque surface.
 *   - No images or external assets — nothing to load, nothing to 404.
 *   - Decorative only: aria-hidden, pointer-events none, sits behind content.
 */

import { PROFILE } from '../lib/chainProfile.js'

/** Resolve the 1-2 gradient stops, falling back to the chain accent. */
function stops() {
  const c = PROFILE.hero?.colors
  const accent = PROFILE.accent || '#4ade80'
  if (Array.isArray(c) && c.length) return [c[0], c[1] ?? c[0]]
  return [accent, accent]
}

/**
 * Each motif is a background shorthand. They all read as "structure in the
 * dark" rather than decoration, which suits a map/territory game.
 */
function motifStyle(motif, a, b) {
  switch (motif) {
    // Concentric rings — orbital, good for high-throughput L1s.
    case 'orbit':
      return {
        backgroundImage: `
          radial-gradient(circle at 50% 120%, ${a}26 0%, transparent 42%),
          repeating-radial-gradient(circle at 50% 120%, transparent 0 38px, ${b}14 38px 39px)`,
      }
    // Soft overlapping light pools — organic, good for consumer/social chains.
    case 'mesh':
      return {
        backgroundImage: `
          radial-gradient(ellipse 60% 80% at 20% 0%,  ${a}2e 0%, transparent 60%),
          radial-gradient(ellipse 50% 70% at 85% 15%, ${b}24 0%, transparent 60%)`,
      }
    // Conic beams — energetic, suits zero-gas / high-speed narratives.
    case 'rays':
      return {
        backgroundImage: `
          conic-gradient(from 210deg at 50% 130%, transparent 0deg, ${a}22 25deg, transparent 50deg, ${b}1c 75deg, transparent 100deg),
          radial-gradient(ellipse at 50% 0%, ${a}1a 0%, transparent 55%)`,
      }
    // Stacked bands — fluid, suits Move/object chains.
    case 'waves':
      return {
        backgroundImage: `
          radial-gradient(ellipse 120% 40% at 50% -10%, ${a}2a 0%, transparent 60%),
          repeating-linear-gradient(-8deg, transparent 0 26px, ${b}12 26px 28px)`,
      }
    // Hex lattice — crystalline, suits native-asset chains.
    case 'hex':
      return {
        backgroundImage: `
          radial-gradient(ellipse at 50% 0%, ${a}26 0%, transparent 55%),
          repeating-linear-gradient(60deg,  transparent 0 22px, ${b}12 22px 23px),
          repeating-linear-gradient(-60deg, transparent 0 22px, ${b}12 22px 23px)`,
      }
    // Default: tile grid — echoes the game's own 16384x16384 territory grid.
    case 'grid':
    default:
      return {
        backgroundImage: `
          radial-gradient(ellipse 90% 60% at 50% 0%, ${a}28 0%, transparent 60%),
          repeating-linear-gradient(0deg,  transparent 0 30px, ${b}10 30px 31px),
          repeating-linear-gradient(90deg, transparent 0 30px, ${b}10 30px 31px)`,
      }
  }
}

export default function ChainHero({ height = 200, radius = 20 }) {
  const [a, b] = stops()
  const motif = PROFILE.hero?.motif ?? 'grid'

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height,
        pointerEvents: 'none',
        borderRadius: `${radius}px ${radius}px 0 0`,
        overflow: 'hidden',
        // Fade the motif out downward so it never competes with the copy.
        WebkitMaskImage: 'linear-gradient(to bottom, #000 0%, #000 45%, transparent 100%)',
        maskImage: 'linear-gradient(to bottom, #000 0%, #000 45%, transparent 100%)',
        ...motifStyle(motif, a, b),
      }}
    />
  )
}
