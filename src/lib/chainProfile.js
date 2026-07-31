/**
 * Chain Profile — CryptoLand
 * ===========================
 * THE problem this solves: we deploy ~28 chain-native builds from one codebase.
 * The plumbing (adapters, config) is already per-chain, but a Polygon build and
 * an Algorand build still *looked* identical apart from a logo swap. A grant
 * reviewer opening algorand.xono.ai should feel it was built for
 * Algorand — not see a generic multichain app with their logo bolted on.
 *
 * The fix is a single declarative profile per chain. Everything ecosystem-specific
 * (copy, accent colour, wallet naming, first-run flow, feature emphasis) lives in
 * `src/config/profiles.js`; every component reads from the merged PROFILE here.
 * Nothing is forked, and a chain with no profile entry falls back to neutral
 * CryptoLand branding — so universality is preserved by construction.
 *
 * Design constraint: the UI stays solid dark (no glass/blur). Theming means
 * swapping the ACCENT colour and the words — never a different visual language.
 */

import { ACTIVE_CHAIN, ACTIVE_CHAIN_KEY } from './blockchain/config.js'
import { PROFILES } from '../config/profiles.js'

/**
 * Neutral defaults. Every field is derived from the chain config where possible,
 * so a brand-new chain looks correct before anyone writes a profile for it.
 */
const DEFAULTS = {
  /** Ecosystem display name, e.g. "Algorand". */
  ecosystem: ACTIVE_CHAIN.name,
  /** Short hero line under the wordmark. */
  tagline: 'OWN THE WORLD · ON-CHAIN',
  /** One sentence on why this chain, shown in the intro + used in grant copy. */
  pitch: null,
  /** Call-to-action on the wallet button. */
  connectLabel: `Connect to ${ACTIVE_CHAIN.name}`,
  /** Accent colour — defaults to the chain's brand colour from config. */
  accent: ACTIVE_CHAIN.color,
  /** Mark shown next to the wordmark. */
  mark: ACTIVE_CHAIN.logo,
  /** Preferred wallets, most-likely-installed first. Falls back per family. */
  wallets: null,
  /** Capability emphasis — drives which features the intro highlights. */
  features: {
    gasless:     Boolean(ACTIVE_CHAIN.gasless),
    miniApp:     ACTIVE_CHAIN.family === 'ton',
    mobileFirst: false,
    aiAgents:    true,   // Guardian agents are core gameplay on every build
  },
  /** The grant program this deployment targets (informational, shown in docs). */
  grantProgram: ACTIVE_CHAIN.grant ?? null,

  /**
   * Hero motif for the intro. Gives each chain a visually distinct first
   * impression while the layout and components stay identical across builds.
   * Rendered by <ChainHero> as pure CSS gradients — no images, and no blur or
   * translucency (the solid-dark rule still applies).
   *
   *   motif  — 'grid' | 'mesh' | 'rays' | 'orbit' | 'waves' | 'hex'
   *   colors — 1-2 hex stops; defaults to the chain accent when omitted
   */
  hero: { motif: 'grid', colors: null },

  /**
   * Chain-native onboarding copy, rendered by <ChainOnboarding> as a 3-step
   * flow. Every field is optional — anything omitted falls back to neutral
   * wording derived from the chain config, so a chain with no entry still
   * onboards correctly.
   *
   *   why        — one sentence: why own land on THIS chain (must be true)
   *   feeNote    — what the user pays in gas, in plain words
   *   walletHelp — { name, url } for the primary wallet, so a first-timer
   *                who has no wallet is not dead-ended
   */
  onboarding: {
    why: null,
    feeNote: null,
    walletHelp: null,
    /**
     * What a tile IS in this ecosystem's own vocabulary — "an Algorand Standard
     * Asset (ASA)", "a Move object", "an FA2 token". This is the strongest
     * native-platform signal we have: it is the language that chain's own
     * builders use. Must be accurate to what we actually deploy.
     */
    nativeTerm: null,
    /**
     * One true, checkable fact rendered as a stat tile — { value, label }.
     * Grounded in config.js (blockTime / gasless / nativeCurrency) or a
     * well-established property. Never TPS, user counts or funding figures.
     */
    chainStat: null,
    /** The capability this chain's grant programme rewards, as a player benefit. */
    grantAngle: null,
  },
}

/** Wallet fallbacks by adapter family, used when a profile doesn't name any. */
export const WALLETS_BY_FAMILY = {
  evm: [
    { id: 'metamask', name: 'MetaMask',        icon: '🦊' },
    { id: 'coinbase', name: 'Coinbase Wallet', icon: '🔵' },
    { id: 'rabby',    name: 'Rabby',           icon: '🐰' },
    { id: 'injected', name: 'Browser Wallet',  icon: '🌐' },
  ],
  solana: [
    { id: 'phantom',  name: 'Phantom',  icon: '👻' },
    { id: 'solflare', name: 'Solflare', icon: '🌟' },
    { id: 'backpack', name: 'Backpack', icon: '🎒' },
  ],
  ton: [
    { id: 'tonkeeper',  name: 'Tonkeeper',       icon: '🔑' },
    { id: 'tonconnect', name: 'TON Connect',     icon: '💎' },
    { id: 'telegram',   name: 'Telegram Wallet', icon: '✈️' },
  ],
  aptos: [
    { id: 'petra',   name: 'Petra',   icon: '🪨' },
    { id: 'martian', name: 'Martian', icon: '👽' },
    { id: 'pontem',  name: 'Pontem',  icon: '🌉' },
  ],
  sui: [
    { id: 'sui-wallet', name: 'Sui Wallet', icon: '🌊' },
    { id: 'suiet',      name: 'Suiet',      icon: '🩵' },
    { id: 'ethos',      name: 'Ethos',      icon: '⚡' },
  ],
  starknet: [
    { id: 'argentx',   name: 'Ready (Argent X)', icon: '🛡️' },
    { id: 'braavos',   name: 'Braavos',          icon: '🦁' },
    { id: 'cartridge', name: 'Cartridge',        icon: '🎮' },
  ],
  cardano: [
    // Nami is intentionally absent — it was absorbed into Lace and can no
    // longer connect to dApps.
    { id: 'lace',        name: 'Lace',   icon: '🎀' },
    { id: 'eternl',      name: 'Eternl', icon: '♾️' },
    { id: 'typhoncip30', name: 'Typhon', icon: '🌪️' },
    { id: 'vespr',       name: 'Vespr',  icon: '🐝' },
  ],
  near: [
    { id: 'meteor-wallet',  name: 'Meteor',        icon: '☄️' },
    { id: 'my-near-wallet', name: 'MyNearWallet',  icon: '🌐' },
    { id: 'nightly',        name: 'Nightly',       icon: '🌙' },
  ],
  stellar: [
    { id: 'freighter', name: 'Freighter', icon: '🚀' },
    { id: 'xbull',     name: 'xBull',     icon: '🐂' },
    { id: 'albedo',    name: 'Albedo',    icon: '✨' },
  ],
  algorand: [
    { id: 'pera',  name: 'Pera',  icon: '🔷' },
    { id: 'defly', name: 'Defly', icon: '🦅' },
    { id: 'lute',  name: 'Lute',  icon: '🎵' },
  ],
  multiversx: [
    { id: 'defi-wallet', name: 'MultiversX DeFi Wallet', icon: '✖️' },
    { id: 'xportal',     name: 'xPortal',                icon: '📱' },
  ],
  radix: [
    { id: 'radix-wallet', name: 'Radix Wallet', icon: '⚛️' },
  ],
  tezos: [
    { id: 'temple', name: 'Temple', icon: '🏛️' },
    { id: 'kukai',  name: 'Kukai',  icon: '🌺' },
    { id: 'umami',  name: 'Umami',  icon: '🍜' },
  ],
}

const override = PROFILES[ACTIVE_CHAIN_KEY] ?? {}

/** The merged, active profile. Import this — never PROFILES directly. */
export const PROFILE = {
  ...DEFAULTS,
  ...override,
  features:   { ...DEFAULTS.features,   ...(override.features ?? {}) },
  hero:       { ...DEFAULTS.hero,       ...(override.hero ?? {}) },
  onboarding: { ...DEFAULTS.onboarding, ...(override.onboarding ?? {}) },
  wallets:    override.wallets ?? WALLETS_BY_FAMILY[ACTIVE_CHAIN.family] ?? WALLETS_BY_FAMILY.evm,
}

// ── Deriving a usable palette from one brand hex ──────────────────────────────
//
// A chain's brand colour is chosen for a white website, not for our near-black
// one, and it has to do two different jobs here that pull in opposite directions:
//
//   as a FILL  (the primary CTA) the label sits ON it, so we need to know
//              whether that label should be near-black or white;
//   as INK     (the "why" sentence, the step numbers, the ON <CHAIN> label) it
//              sits on `--s1 #141414`, so it needs ≥4.5:1 against that.
//
// Cardano `#0033ad` is 1.82:1 on `--s1` and Radix `#052cc0` is 1.87:1 — as body
// text both are close to unreadable. Hand-picking a lighter hex per chain (the
// existing `#ffffff` overrides for skale and hedera) does not survive chain #30,
// so both values are derived here instead: the brand colour is preserved for
// fills, and a lightened sibling is computed for ink, only as far as it has to
// go to clear the contrast bar.

const hexToRgb = (h) => {
  const s = String(h).replace('#', '')
  const n = s.length === 3 ? s.split('').map(c => c + c).join('') : s
  return [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16) || 0)
}
const rgbToHex = (r, g, b) =>
  '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')

/** WCAG relative luminance. */
const luminance = (rgb) => {
  const [r, g, b] = rgb.map(v => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a, b) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

const SURFACE = hexToRgb('#141414')   // --s1, what accent-as-ink sits on
const TARGET  = 4.5                   // WCAG AA for body text

/**
 * Lighten `rgb` toward white until it clears `TARGET` against `--s1`.
 * Returns the brand colour untouched when it already passes, so the 20-odd
 * chains whose accents are fine keep their exact brand hex.
 */
function readableInk(rgb) {
  if (contrast(rgb, SURFACE) >= TARGET) return rgb
  let lo = 0, hi = 1, best = [255, 255, 255]
  for (let i = 0; i < 12; i++) {            // binary search on the mix ratio
    const t = (lo + hi) / 2
    const mixed = rgb.map(v => v + (255 - v) * t)
    if (contrast(mixed, SURFACE) >= TARGET) { best = mixed; hi = t } else { lo = t }
  }
  return best
}

/**
 * Push the profile's accent into CSS custom properties once at boot. Components
 * then use var(--chain-accent) and re-tint automatically per deployment, with no
 * per-chain CSS files and no change to the solid-dark visual language.
 *
 * Three properties, because one hex cannot serve all three roles:
 *   --chain-accent      the brand colour, for fills and large solid shapes
 *   --chain-accent-ink  a foreground that is readable ON the accent
 *   --chain-accent-ui   the accent lightened to ≥4.5:1 on --s1, for text/icons
 */
export function applyProfileTheme() {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const rgb  = hexToRgb(PROFILE.accent)

  root.style.setProperty('--chain-accent', PROFILE.accent)
  root.style.setProperty('--chain-accent-dim', PROFILE.accent + '22')
  // Near-black on light accents (Algorand mint, BNB yellow), white on dark ones
  // (Cardano navy, Radix blue) — otherwise the CTA label vanishes into its own
  // button on roughly a third of the builds.
  root.style.setProperty('--chain-accent-ink',
    contrast(rgb, hexToRgb('#0f0f0f')) >= contrast(rgb, [255, 255, 255]) ? '#0f0f0f' : '#ffffff')
  root.style.setProperty('--chain-accent-ui', rgbToHex(...readableInk(rgb)))

  root.dataset.chain  = ACTIVE_CHAIN_KEY
  root.dataset.family = ACTIVE_CHAIN.family
}

// ── Resolved values for non-CSS consumers ─────────────────────────────────────
// MapLibre paint properties are evaluated by WebGL, not by CSS, so they cannot
// read var(--chain-accent). These are the same colours the custom properties
// carry, as plain hex.

const ACCENT_RGB = hexToRgb(PROFILE.accent)

/** The brand accent, for fills. */
/**
 * The host this build is served from, for anything RENDERED to a user — share
 * cards, tile certificates, empire pages.
 *
 * It must be the chain's OWN subdomain: a Ronin tile certificate saying
 * "polygon.xono.ai" sends the holder to a different world with a different
 * database. Derived from the active chain, with a runtime override from
 * location.host so a preview or a custom domain shows itself rather than a
 * guess.
 *
 * These surfaces previously printed a bare "cryptoland.io" — a domain nobody
 * owns — onto every certificate a user could download or share.
 */
export const SITE_HOST =
  (typeof location !== 'undefined' && location.host && !/^localhost|^127\./.test(location.host))
    ? location.host
    : `${ACTIVE_CHAIN_KEY}.xono.ai`

export const ACCENT_HEX = PROFILE.accent

/** The accent lightened to ≥4.5:1 on --s1 — for anything read against the map. */
export const ACCENT_UI_HEX = rgbToHex(...readableInk(ACCENT_RGB))

/**
 * The accent mixed `t` of the way toward white (0 = accent, 1 = white).
 *
 * The map's city lights are built from this rather than from the accent
 * directly. A light is defined by being BRIGHT — painting Cardano's `#0033ad`
 * onto a near-black map produces invisible dots, not a city seen from orbit. So
 * the accent supplies the hue and the mix supplies the luminance, which keeps
 * the glow chain-native without giving 29 builds 29 different visual languages.
 */
export const mixWhite = (t) => rgbToHex(...ACCENT_RGB.map(v => v + (255 - v) * t))

// Exported for the contract test, which asserts all 29 accents resolve to a
// readable pair rather than trusting that they happen to.
export const __theme = { hexToRgb, rgbToHex, luminance, contrast, readableInk, TARGET }

export { ACTIVE_CHAIN, ACTIVE_CHAIN_KEY }
