/**
 * Chain Profiles — CryptoLand
 * ============================
 * The per-chain personality of each build: the words, the wallet naming, the
 * accent and the feature emphasis that make the Algorand deployment feel built
 * FOR Algorand rather than like a multichain app with an Algorand logo bolted
 * on. One declarative entry per chain — nothing is forked.
 *
 * This file is DATA ONLY. It is merged over the neutral, chain-config-derived
 * defaults in `src/lib/chainProfile.js`. Components import the merged `PROFILE`
 * from there — never `PROFILES` from here.
 *
 * Rules for editing:
 *   • Every field here is an OVERRIDE. Omit anything the default already gets
 *     right; a restated default is noise. In particular `ecosystem`, `accent`,
 *     `mark` and `connectLabel` are derived from the chain's entry in
 *     `blockchain/config.js`, and `features.gasless` / `features.miniApp` are
 *     derived from that entry's `gasless` flag and `family` — so SKALE and TON
 *     need no entry for them, and `features.aiAgents` is true everywhere
 *     because Guardian agents are core gameplay on every build.
 *   • `wallets` falls back per adapter family (WALLETS_BY_FAMILY), so it appears
 *     below only where the chain's primary wallet is missing from that fallback
 *     or would not be listed first.
 *   • `pitch` is one sentence a grant reviewer will read. It must be true and
 *     specific to a real property of the chain — no invented metrics, no
 *     claimed partnerships, no hype adjectives.
 *   • A chain with no entry here still boots and still looks correct: neutral
 *     CryptoLand branding tinted with that chain's own colour.
 *
 * Testnet keys are deliberately absent — a testnet build inherits the neutral
 * defaults, which is the honest presentation for a non-production deployment.
 *
 * Order follows `CHAIN_DEFS` in `blockchain/config.js` so the two files can be
 * read side by side.
 */

export const PROFILES = {
  // ══ EVM chains ══════════════════════════════════════════════════════════════

  polygon: {
    tagline:      'OWN THE WORLD · AT SCALE',
    pitch:        'Polygon keeps a claim cheap enough that buying, upgrading and trading territory stays gameplay rather than a financial decision, while still settling to Ethereum.',
    connectLabel: 'Connect MetaMask',
  },

  avalanche: {
    tagline:      'OWN THE WORLD · SUB-SECOND FINALITY',
    pitch:        'Avalanche finalises a transaction in under a second, so a tile is provably yours before the map has finished animating the claim.',
    connectLabel: 'Connect Core',
    // Core is Avalanche's own wallet and is absent from the generic EVM fallback.
    wallets: [
      { id: 'core',     name: 'Core',            icon: '🔺' },
      { id: 'metamask', name: 'MetaMask',        icon: '🦊' },
      { id: 'coinbase', name: 'Coinbase Wallet', icon: '🔵' },
      { id: 'injected', name: 'Browser Wallet',  icon: '🌐' },
    ],
  },

  base: {
    // Base writes it "onchain", one word. Their house style, not ours.
    tagline:      'OWN THE WORLD · ONCHAIN',
    pitch:        'Base pairs cheap L2 blockspace with Coinbase account onboarding, so a new player goes from signing up to owning a tile without bridging, seed phrases or an on-ramp detour.',
    connectLabel: 'Connect Coinbase Wallet',
    // Same set as the EVM fallback, reordered: on Base, Coinbase Wallet is the
    // one a player most likely already has.
    wallets: [
      { id: 'coinbase', name: 'Coinbase Wallet', icon: '🔵' },
      { id: 'metamask', name: 'MetaMask',        icon: '🦊' },
      { id: 'rabby',    name: 'Rabby',           icon: '🐰' },
      { id: 'injected', name: 'Browser Wallet',  icon: '🌐' },
    ],
  },

  ethereum: {
    tagline: 'OWN THE WORLD · SETTLED ON ETHEREUM',
    pitch:   'Ethereum mainnet is the settlement layer with the longest track record, for players who want the deed to their territory to outlive any single rollup, studio or season.',
  },

  arbitrum: {
    ecosystem:    'Arbitrum',   // config name is "Arbitrum One"
    tagline:      'OWN THE WORLD · AT ROLLUP SPEED',
    pitch:        'Arbitrum produces blocks about four times a second at rollup fees, so claiming, upgrading and raiding tiles confirms fast enough to read as a game loop instead of a transaction queue.',
    connectLabel: 'Connect to Arbitrum',
  },

  ronin: {
    tagline:      'OWN THE WORLD · ON THE GAMES CHAIN',
    pitch:        'Ronin is a chain built for games and nothing else, so CryptoLand shares its blockspace and its audience with other games instead of competing with DeFi for gas.',
    connectLabel: 'Connect Ronin Wallet',
    // Ronin Wallet is the ecosystem default and is not in the EVM fallback.
    wallets: [
      { id: 'ronin',    name: 'Ronin Wallet',   icon: '⚔️' },
      { id: 'metamask', name: 'MetaMask',       icon: '🦊' },
      { id: 'injected', name: 'Browser Wallet', icon: '🌐' },
    ],
  },

  bnb: {
    ecosystem:    'BNB Chain',  // config name is "BNB Smart Chain"
    tagline:      'OWN THE WORLD · IN ONE TAP',
    pitch:        'BNB Chain combines three-second blocks with wallet distribution straight out of Binance, so a player who already holds BNB can claim territory without a new account or an on-ramp.',
    connectLabel: 'Connect Binance Wallet',
  },

  // ── Grant-target EVM chains ─────────────────────────────────────────────────

  optimism: {
    // NOTE: Retro Funding is paused (grants.md §0) — this build exists for the
    // Superchain distribution story, not for an open application.
    ecosystem:    'Optimism',   // config name is "OP Mainnet"
    tagline:      'OWN THE WORLD · ON THE SUPERCHAIN',
    pitch:        'OP Mainnet puts the map on the Superchain, where one deployment standard is shared by every OP Stack chain, so territory claimed here is not stranded on a single rollup.',
    connectLabel: 'Connect to Optimism',
  },

  scroll: {
    tagline: 'OWN THE WORLD · ZK-PROVEN',
    pitch:   'Scroll is a zkEVM, so every claim on the map is backed by a validity proof settled to Ethereum: the state of the world map is proven, not merely trusted.',
  },

  celo: {
    tagline:      'OWN THE WORLD · FROM YOUR PHONE',
    pitch:        'Celo is mobile-first and lets fees be paid in stablecoins, so a player can claim the block they actually live on straight from their phone without first buying a gas token.',
    connectLabel: 'Connect Valora',
    // Celo's consumer wallets are phone apps, not browser extensions.
    wallets: [
      { id: 'valora',   name: 'Valora',         icon: '🌱' },
      { id: 'minipay',  name: 'MiniPay',        icon: '📱' },
      { id: 'metamask', name: 'MetaMask',       icon: '🦊' },
      { id: 'injected', name: 'Browser Wallet', icon: '🌐' },
    ],
    features: { mobileFirst: true },
  },

  moonbeam: {
    tagline: 'OWN THE WORLD · ACROSS POLKADOT',
    pitch:   'Moonbeam runs the identical EVM build inside Polkadot and can message other parachains over XCM, opening the map to an ecosystem a standalone EVM deployment never reaches.',
  },

  beam: {
    tagline: 'OWN THE WORLD · ON A CHAIN FOR GAMES',
    pitch:   'Beam is an Avalanche L1 dedicated to gaming, so CryptoLand gets purpose-built blockspace and launches beside the games its players already hold assets in.',
  },

  oasys: {
    tagline: 'OWN THE WORLD · GAMES-FIRST L1',
    pitch:   'Oasys was designed with Japanese game studios for game workloads, so a territory game arrives in an ecosystem whose players and publishers are already game-native.',
  },

  skale: {
    ecosystem:    'SKALE Nebula',   // config name is "SKALE Nebula Gaming Hub"
    tagline:      'OWN THE WORLD · ZERO GAS',
    pitch:        'SKALE charges no gas at all — sFUEL exists only to satisfy EVM accounting — so a player can claim, upgrade and trade tiles all day without ever paying a fee or touching an on-ramp.',
    connectLabel: 'Connect to SKALE',
    // The config colour is #000000, which vanishes against the solid dark UI.
    // SKALE's identity is monochrome, so invert it rather than invent a hue.
    accent:       '#ffffff',
    // features.gasless is already true — config.js sets `gasless` on this chain.
  },

  'skale-europa': {
    ecosystem:    'SKALE Europa',   // config name is "SKALE Europa Hub"
    tagline:      'OWN THE WORLD · ZERO GAS',
    pitch:        'The Europa hub is zero-gas like Nebula but sits beside SKALE’s liquidity, so players never pay to claim a tile while the in-game economy keeps access to tokens.',
    connectLabel: 'Connect to SKALE',
    accent:       '#ffffff',   // #000000 on dark — see `skale` above
  },

  hedera: {
    tagline: 'OWN THE WORLD · AT A FIXED PRICE',
    pitch:   'Hedera prices transactions in fixed USD terms, so claiming a tile costs the same during a market spike as it did yesterday and the in-game economy can be planned rather than guessed.',
    // #222222 is unreadable on a dark surface; Hedera's brand is black-on-white,
    // so invert it for a dark UI.
    accent:  '#ffffff',
  },

  injective: {
    tagline: 'OWN THE WORLD · AGENT-DRIVEN',
    pitch:   'Injective is built for on-chain finance and autonomous agents, which is exactly what CryptoLand’s Guardian agents are: programs that hold, price and defend real-world territory for their owner.',
  },

  // ══ Non-EVM chains ══════════════════════════════════════════════════════════

  solana: {
    tagline:      'OWN THE WORLD · AT 400ms',
    pitch:        'Solana’s ~400 ms slots make claiming a tile feel like a game input rather than a transaction, and Solana Mobile gives a map of the real world a first-class home on the device you carry through it.',
    connectLabel: 'Connect Phantom',
    features:     { mobileFirst: true },
  },

  ton: {
    tagline:      'OWN THE WORLD · INSIDE TELEGRAM',
    pitch:        'CryptoLand runs as a Telegram Mini App, so a player claims territory inside the chat app already open on their phone — no install, no bridge, and an invite is just a forwarded message.',
    connectLabel: 'Open in Telegram',
    // features.miniApp is already true — chainProfile derives it from family.
    features:     { mobileFirst: true },
  },

  aptos: {
    tagline:      'OWN THE WORLD · IN MOVE',
    pitch:        'Aptos makes each tile a first-class Move object with its own ownership rules, and executes transactions in parallel so thousands of players claiming at once do not queue behind one another.',
    connectLabel: 'Connect Petra',
  },

  sui: {
    tagline: 'OWN THE WORLD · AS OWNED OBJECTS',
    pitch:   'On Sui a tile is an owned object, so a claim takes the single-owner fast path instead of full consensus ordering — the map can be carved up by many players at once without contention.',
  },

  starknet: {
    tagline:      'OWN THE WORLD · PROVEN BY ZK',
    pitch:        'Starknet proves execution with STARKs, so the record of who claimed which tile is verified by a proof settled on Ethereum instead of being trusted to our server.',
    connectLabel: 'Connect Ready or Braavos',
  },

  cardano: {
    tagline:      'OWN THE WORLD · AS NATIVE ASSETS',
    pitch:        'On Cardano a tile is a native asset tracked by the ledger itself, so no NFT contract stands between a player and the deed to their territory.',
    connectLabel: 'Connect Lace or Eternl',
  },

  near: {
    tagline:      'OWN THE WORLD · NAMED ACCOUNTS',
    pitch:        'NEAR gives every player a human-readable account and treats agents as first-class citizens, so a deed reads alice.near and the Guardian agents defending it run natively on the same chain.',
    connectLabel: 'Connect your NEAR account',
  },

  stellar: {
    tagline:      'OWN THE WORLD · ON SOROBAN',
    pitch:        'Stellar has moved value cheaply between real-world currencies for a decade and Soroban adds the contracts, so a game about real territory settles on rails already used for real payments.',
    connectLabel: 'Connect Freighter',
  },

  algorand: {
    tagline:      'OWN THE WORLD · FINAL IN ONE BLOCK',
    pitch:        'Algorand Standard Assets make each tile a native ledger asset with single-block finality, so a claim is irreversible the moment it lands and no smart contract sits between the player and the deed.',
    connectLabel: 'Connect Pera Wallet',
  },

  multiversx: {
    tagline:      'OWN THE WORLD · NATIVELY SHARDED',
    pitch:        'MultiversX issues NFTs as native ESDT assets on a sharded network, so tile ownership lives in the protocol itself and capacity grows with the shards as more of the map is claimed.',
    connectLabel: 'Connect xPortal',
  },

  radix: {
    tagline:      'OWN THE WORLD · AS NATIVE RESOURCES',
    pitch:        'On Radix assets are native resources enforced by the ledger rather than by contract bookkeeping, and the transaction manifest shows a player exactly which tile they are signing away.',
    connectLabel: 'Connect Radix Wallet',
  },

  tezos: {
    tagline:      'OWN THE WORLD · GOVERNED ON-CHAIN',
    pitch:        'Tezos pairs the FA2 token standard with a chain that amends itself by on-chain vote, matching a game whose own territory rules are meant to be settled by its players rather than by a studio.',
    connectLabel: 'Connect Temple or Kukai',
  },
}
