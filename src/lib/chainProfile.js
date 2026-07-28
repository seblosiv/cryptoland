/**
 * Chain Profile — CryptoLand
 * ===========================
 * THE problem this solves: we deploy ~28 chain-native builds from one codebase.
 * The plumbing (adapters, config) is already per-chain, but a Polygon build and
 * an Algorand build still *looked* identical apart from a logo swap. A grant
 * reviewer opening algorand.cryptoland.game should feel it was built for
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

/**
 * Push the profile's accent into CSS custom properties once at boot. Components
 * then use var(--chain-accent) and re-tint automatically per deployment, with no
 * per-chain CSS files and no change to the solid-dark visual language.
 */
export function applyProfileTheme() {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.style.setProperty('--chain-accent', PROFILE.accent)
  root.style.setProperty('--chain-accent-dim', PROFILE.accent + '22')
  root.dataset.chain  = ACTIVE_CHAIN_KEY
  root.dataset.family = ACTIVE_CHAIN.family
}

export { ACTIVE_CHAIN, ACTIVE_CHAIN_KEY }
