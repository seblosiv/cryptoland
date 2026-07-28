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
 *   • `hero` gives each build a distinct first impression without a distinct
 *     visual language: a motif name ('grid' | 'mesh' | 'rays' | 'orbit' |
 *     'waves' | 'hex') and 1-2 hex stops from the chain's real brand palette.
 *     Stops render on a near-black surface, so nothing near-black goes here.
 *   • `onboarding.why` is held to the same truth bar as `pitch`, and
 *     `onboarding.feeNote` must name the chain's REAL native currency and must
 *     never call a chain free unless `gasless` is set on it in config.js (only
 *     the two SKALE hubs). `walletHelp` is omitted rather than guessed — a
 *     wrong wallet link is worse than the neutral default.
 *   • `onboarding.nativeTerm` names what a tile IS in that ecosystem's own
 *     token vocabulary ('an Algorand Standard Asset (ASA)', 'a Move object',
 *     'an FA2 token'). Use the standard the chain's own docs use — that
 *     precision is what a reviewer from that chain notices first.
 *   • `onboarding.chainStat` is { value, label }: ONE true, checkable fact,
 *     grounded in the chain's entry in `blockchain/config.js` (blockTime,
 *     gasless, nativeCurrency) or a well-established property. Never a TPS
 *     figure, a user count or a funding number.
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
    hero:         { motif: 'grid', colors: ['#8247e5', '#a879ff'] },
    onboarding: {
      why:        'Polygon settles to Ethereum while keeping a claim cheap enough that buying and upgrading tiles stays a game move rather than a financial decision.',
      nativeTerm: 'an ERC-721 NFT',
      chainStat:  { value: '~2s', label: 'Block time' },
      feeNote:    'Gas costs a fraction of a cent, paid in MATIC (POL).',
      walletHelp: { name: 'MetaMask', url: 'https://metamask.io' },
      grantAngle: 'AI Guardian agents watch your territory around the clock and defend a claim even while you are offline.',
    },
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
    hero:         { motif: 'rays', colors: ['#e84142', '#ff9a6b'] },
    onboarding: {
      why:        'Avalanche finalises a transaction in about a second, so your tile is provably yours before the map finishes animating the claim.',
      nativeTerm: 'an ERC-721 NFT',
      chainStat:  { value: '<1s', label: 'Finality' },
      feeNote:    'Gas is a few cents at most, paid in AVAX.',
      walletHelp: { name: 'Core', url: 'https://core.app' },
      grantAngle: 'Every claim, upgrade and raid is a real transaction you can look up yourself on the block explorer.',
    },
  },

  base: {
    // Base writes it "onchain", one word — their house style, not ours. The
    // bare "OWN THE WORLD · ONCHAIN" was a hyphen away from the neutral default
    // and read as un-themed, so lead with what Base is actually known for.
    tagline:      'OWN THE WORLD · BUILT ONCHAIN ON BASE',
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
    hero:         { motif: 'grid', colors: ['#0052ff', '#5b8dff'] },
    onboarding: {
      why:        'Base is an Ethereum L2 with Coinbase account onboarding, so you can go from signing up to owning a tile without bridging or managing a seed phrase.',
      nativeTerm: 'an ERC-721 NFT',
      chainStat:  { value: '~2s', label: 'Block time' },
      feeNote:    'Gas is a fraction of a cent, paid in ETH on Base.',
      walletHelp: { name: 'Coinbase Wallet', url: 'https://www.coinbase.com/wallet' },
      grantAngle: 'The whole game is onchain on Base — tiles, trades and upgrades, all from the wallet you already use.',
    },
  },

  ethereum: {
    tagline:      'OWN THE WORLD · SETTLED ON ETHEREUM',
    pitch:        'Ethereum mainnet is the settlement layer with the longest track record, for players who want the deed to their territory to outlive any single rollup, studio or season.',
    connectLabel: 'Connect MetaMask',
    hero:         { motif: 'mesh', colors: ['#627eea', '#9db0f7'] },
    onboarding: {
      why:        'Ethereum mainnet has the longest settlement track record of any chain here, so the deed to your territory outlives any single rollup, studio or season.',
      nativeTerm: 'an ERC-721 NFT',
      chainStat:  { value: '~12s', label: 'Block time' },
      feeNote:    'Mainnet gas is the highest of any CryptoLand build — every claim costs real ETH, so time it for a quiet block.',
      walletHelp: { name: 'MetaMask', url: 'https://metamask.io' },
      grantAngle: 'Your deed is kept on the chain with the longest track record, so it outlasts any single season of the game.',
    },
  },

  arbitrum: {
    ecosystem:    'Arbitrum',   // config name is "Arbitrum One"
    tagline:      'OWN THE WORLD · AT ROLLUP SPEED',
    pitch:        'Arbitrum produces blocks about four times a second at rollup fees, so claiming, upgrading and raiding tiles confirms fast enough to read as a game loop instead of a transaction queue.',
    connectLabel: 'Connect to Arbitrum',
    hero:         { motif: 'grid', colors: ['#28a0f0', '#96bedc'] },
    onboarding: {
      why:        'Arbitrum gives you Ethereum-secured ownership at rollup fees, so claiming, upgrading and raiding confirm fast enough to feel like a game loop.',
      nativeTerm: 'an ERC-721 NFT',
      chainStat:  { value: '~0.25s', label: 'Block time' },
      feeNote:    'Gas is a fraction of a cent, paid in ETH on Arbitrum.',
      walletHelp: { name: 'MetaMask', url: 'https://metamask.io' },
      grantAngle: 'A full game loop — claim, upgrade, raid, trade — running at rollup speed on Arbitrum.',
    },
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
    hero:         { motif: 'hex', colors: ['#1273ea', '#6fb2ff'] },
    onboarding: {
      why:        'Ronin is built for games and nothing else, so your tiles share blockspace with other games instead of competing with DeFi for gas.',
      nativeTerm: 'an ERC-721 NFT',
      chainStat:  { value: '~3s', label: 'Block time' },
      feeNote:    'Gas is a fraction of a cent, paid in RON.',
      walletHelp: { name: 'Ronin Wallet', url: 'https://wallet.roninchain.com' },
      grantAngle: 'You are playing on a chain used only for games, next to the other titles already in your Ronin wallet.',
    },
  },

  bnb: {
    ecosystem:    'BNB Chain',  // config name is "BNB Smart Chain"
    tagline:      'OWN THE WORLD · IN ONE TAP',
    pitch:        'BNB Chain combines three-second blocks with wallet distribution straight out of Binance, so a player who already holds BNB can claim territory without a new account or an on-ramp.',
    connectLabel: 'Connect Binance Wallet',
    hero:         { motif: 'grid', colors: ['#f0b90b', '#ffdc6a'] },
    onboarding: {
      why:        'BNB Chain pairs three-second blocks with wallet distribution straight out of Binance, so if you already hold BNB you can claim a tile without opening a new account.',
      nativeTerm: 'a BEP-721 NFT',
      chainStat:  { value: '~3s', label: 'Block time' },
      feeNote:    'Gas is typically a few cents, paid in BNB.',
      walletHelp: { name: 'MetaMask', url: 'https://metamask.io' },
      grantAngle: 'A finished game you can play today — claim your first tile in a couple of taps with the BNB you hold.',
    },
  },

  // ── Grant-target EVM chains ─────────────────────────────────────────────────

  optimism: {
    // NOTE: Retro Funding is paused (grants.md §0) — this build exists for the
    // Superchain distribution story, not for an open application.
    ecosystem:    'Optimism',   // config name is "OP Mainnet"
    tagline:      'OWN THE WORLD · ON THE SUPERCHAIN',
    pitch:        'OP Mainnet puts the map on the Superchain, where one deployment standard is shared by every OP Stack chain, so territory claimed here is not stranded on a single rollup.',
    connectLabel: 'Connect to Optimism',
    hero:         { motif: 'rays', colors: ['#ff0420', '#ff7a86'] },
    onboarding: {
      why:        'OP Mainnet is part of the Superchain, where one deployment standard is shared by every OP Stack chain, so territory claimed here is not stranded on a single rollup.',
      nativeTerm: 'an ERC-721 NFT',
      chainStat:  { value: '~2s', label: 'Block time' },
      feeNote:    'Gas is a fraction of a cent, paid in ETH on OP Mainnet.',
      walletHelp: { name: 'MetaMask', url: 'https://metamask.io' },
      grantAngle: 'An open map where every claim is a public record anyone across the Superchain can check.',
    },
  },

  scroll: {
    tagline:      'OWN THE WORLD · ZK-PROVEN',
    pitch:        'Scroll is a zkEVM, so every claim on the map is backed by a validity proof settled to Ethereum: the state of the world map is proven, not merely trusted.',
    connectLabel: 'Connect MetaMask',
    hero:         { motif: 'waves', colors: ['#ffeeda', '#e0a878'] },
    onboarding: {
      why:        'Scroll is a zkEVM, so every claim on the map is backed by a validity proof settled to Ethereum instead of being taken on trust.',
      nativeTerm: 'an ERC-721 NFT',
      chainStat:  { value: 'zkEVM', label: 'Proof system' },
      feeNote:    'Gas is a fraction of a cent, paid in ETH on Scroll.',
      walletHelp: { name: 'MetaMask', url: 'https://metamask.io' },
      grantAngle: 'Ownership of your tile is backed by a zero-knowledge validity proof, not by taking our word for it.',
    },
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
    hero:         { motif: 'mesh', colors: ['#fcff52', '#35d07f'] },
    onboarding: {
      why:        'Celo is mobile-first and lets fees be paid in stablecoins, so you can claim the block you actually live on from your phone without first buying a gas token.',
      nativeTerm: 'an ERC-721 NFT',
      chainStat:  { value: '~1s', label: 'Block time' },
      feeNote:    'Fees are a fraction of a cent, payable in CELO or in a stablecoin like cUSD.',
      walletHelp: { name: 'Valora', url: 'https://valora.xyz' },
      grantAngle: 'Built for phones first — claim the block you actually live on from your pocket, no desktop needed.',
    },
  },

  moonbeam: {
    tagline:      'OWN THE WORLD · ACROSS POLKADOT',
    pitch:        'Moonbeam runs the identical EVM build inside Polkadot and can message other parachains over XCM, opening the map to an ecosystem a standalone EVM deployment never reaches.',
    connectLabel: 'Connect MetaMask',
    hero:         { motif: 'orbit', colors: ['#53cbc9', '#e6007a'] },
    onboarding: {
      why:        'Moonbeam runs the same EVM build inside Polkadot and can message other parachains over XCM, so your territory sits in an ecosystem a standalone EVM deployment never reaches.',
      nativeTerm: 'an ERC-721 NFT on Polkadot',
      chainStat:  { value: '~6s', label: 'Block time' },
      feeNote:    'Gas is a fraction of a cent, paid in GLMR.',
      walletHelp: { name: 'MetaMask', url: 'https://metamask.io' },
      grantAngle: 'One map reachable from across Polkadot, so your neighbours are not limited to a single chain.',
    },
  },

  beam: {
    tagline:      'OWN THE WORLD · ON A CHAIN FOR GAMES',
    pitch:        'Beam is an Avalanche L1 dedicated to gaming, so CryptoLand gets purpose-built blockspace and launches beside the games its players already hold assets in.',
    connectLabel: 'Connect MetaMask',
    hero:         { motif: 'rays', colors: ['#ffd200', '#ff7a00'] },
    onboarding: {
      why:        'Beam is an Avalanche L1 dedicated to gaming, so your tiles live on blockspace built for game traffic rather than shared with financial activity.',
      nativeTerm: 'an ERC-721 NFT',
      chainStat:  { value: 'BEAM', label: 'Native token' },
      feeNote:    'Gas is negligible, paid in BEAM.',
      walletHelp: { name: 'MetaMask', url: 'https://metamask.io' },
      grantAngle: 'Blockspace built for games, so claims and raids stay quick even when the map is busy.',
    },
  },

  oasys: {
    tagline:      'OWN THE WORLD · GAMES-FIRST L1',
    pitch:        'Oasys was designed with Japanese game studios for game workloads, so a territory game arrives in an ecosystem whose players and publishers are already game-native.',
    connectLabel: 'Connect MetaMask',
    hero:         { motif: 'grid', colors: ['#0f62fe', '#4fc3ff'] },
    onboarding: {
      why:        'Oasys was designed with Japanese game studios for game workloads, so you are claiming territory in an ecosystem whose players are already game-native.',
      nativeTerm: 'an ERC-721 NFT',
      chainStat:  { value: '~6s', label: 'Block time' },
      feeNote:    'Gas on the Oasys hub layer is minimal, paid in OAS.',
      walletHelp: { name: 'MetaMask', url: 'https://metamask.io' },
      grantAngle: 'A game-native home in Japan and Asia — claim territory alongside the players already on Oasys.',
    },
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
    // Monochrome stops for the same reason the accent is inverted.
    hero:         { motif: 'rays', colors: ['#ffffff', '#9aa4b2'] },
    onboarding: {
      why:        'SKALE charges no gas at all, so you can claim, upgrade and trade tiles all day without ever paying a fee or touching an on-ramp.',
      nativeTerm: 'an ERC-721 NFT',
      chainStat:  { value: '$0.00', label: 'Gas fees' },
      feeNote:    'No gas at all — sFUEL comes free from a faucet and has no value.',
      walletHelp: { name: 'MetaMask', url: 'https://metamask.io' },
      grantAngle: 'An indie-built game with zero gas: play a whole session of claiming and raiding without paying a fee.',
    },
  },

  'skale-europa': {
    ecosystem:    'SKALE Europa',   // config name is "SKALE Europa Hub"
    tagline:      'OWN THE WORLD · ZERO GAS',
    pitch:        'The Europa hub is zero-gas like Nebula but sits beside SKALE’s liquidity, so players never pay to claim a tile while the in-game economy keeps access to tokens.',
    connectLabel: 'Connect to SKALE',
    accent:       '#ffffff',   // #000000 on dark — see `skale` above
    hero:         { motif: 'rays', colors: ['#f2f4f7', '#8f9bb3'] },
    onboarding: {
      why:        'Europa is zero-gas like every SKALE hub but sits beside SKALE’s liquidity, so claiming costs you nothing while the in-game economy keeps access to tokens.',
      nativeTerm: 'an ERC-721 NFT',
      chainStat:  { value: '$0.00', label: 'Gas fees' },
      feeNote:    'No gas at all — sFUEL comes free from a faucet and has no value.',
      walletHelp: { name: 'MetaMask', url: 'https://metamask.io' },
      grantAngle: 'An indie-built game with zero gas: claim, upgrade and trade all day and never see a fee.',
    },
  },

  hedera: {
    tagline:      'OWN THE WORLD · AT A FIXED PRICE',
    pitch:        'Hedera prices transactions in fixed USD terms, so claiming a tile costs the same during a market spike as it did yesterday and the in-game economy can be planned rather than guessed.',
    connectLabel: 'Connect MetaMask',
    // #222222 is unreadable on a dark surface; Hedera's brand is black-on-white,
    // so invert it for a dark UI.
    accent:       '#ffffff',
    // Same reason as the accent: the brand's dark stops disappear on dark.
    hero:         { motif: 'mesh', colors: ['#ffffff', '#8f9bb3'] },
    onboarding: {
      why:        'Hedera runs enterprise-grade aBFT consensus and prices transactions in fixed USD terms, so a claim costs the same during a market spike as it did yesterday.',
      nativeTerm: 'an ERC-721 NFT on Hedera',
      chainStat:  { value: 'Fixed USD', label: 'Fee pricing' },
      feeNote:    'Fees are a fixed fraction of a cent in USD terms, paid in HBAR.',
      walletHelp: { name: 'MetaMask', url: 'https://metamask.io' },
      grantAngle: 'A claim costs a predictable fraction of a cent, so you always know the price before you tap.',
    },
  },

  injective: {
    tagline:      'OWN THE WORLD · AGENT-DRIVEN',
    pitch:        'Injective is built for on-chain finance and autonomous agents, which is exactly what CryptoLand’s Guardian agents are: programs that hold, price and defend real-world territory for their owner.',
    connectLabel: 'Connect MetaMask',
    hero:         { motif: 'rays', colors: ['#00f2fe', '#0082fa'] },
    onboarding: {
      why:        'Injective is built for on-chain finance and autonomous agents — exactly what a Guardian is: a program that holds, prices and defends your territory.',
      nativeTerm: 'an ERC-721 NFT',
      chainStat:  { value: '~0.6s', label: 'Block time' },
      feeNote:    'Gas is a fraction of a cent, paid in INJ.',
      walletHelp: { name: 'MetaMask', url: 'https://metamask.io' },
      grantAngle: 'Your Guardian is an autonomous agent that prices and defends your territory while you are away.',
    },
  },

  // ══ Non-EVM chains ══════════════════════════════════════════════════════════

  solana: {
    tagline:      'OWN THE WORLD · AT 400ms',
    pitch:        'Solana’s ~400 ms slots make claiming a tile feel like a game input rather than a transaction, and Solana Mobile gives a map of the real world a first-class home on the device you carry through it.',
    connectLabel: 'Connect Phantom',
    features:     { mobileFirst: true },
    hero:         { motif: 'orbit', colors: ['#9945ff', '#14f195'] },
    onboarding: {
      why:        'Solana confirms in well under a second, so claiming a tile registers like a game input instead of a transaction you wait on.',
      nativeTerm: 'an SPL NFT',
      chainStat:  { value: '~400ms', label: 'Slot time' },
      feeNote:    'Fees are a fraction of a cent, paid in SOL.',
      walletHelp: { name: 'Phantom', url: 'https://phantom.app' },
      grantAngle: 'Built for players on mobile — claim land from your phone in seconds, as fast as a game input.',
    },
  },

  ton: {
    tagline:      'OWN THE WORLD · INSIDE TELEGRAM',
    pitch:        'CryptoLand runs as a Telegram Mini App, so a player claims territory inside the chat app already open on their phone — no install, no bridge, and an invite is just a forwarded message.',
    connectLabel: 'Open in Telegram',
    // features.miniApp is already true — chainProfile derives it from family.
    features:     { mobileFirst: true },
    hero:         { motif: 'mesh', colors: ['#0098ea', '#6fd0f7'] },
    onboarding: {
      why:        'TON runs inside Telegram, so you claim territory without leaving the chat you already have open — and an invite is just a forwarded message.',
      nativeTerm: 'a TON NFT item',
      chainStat:  { value: 'In-chat', label: 'Distribution' },
      feeNote:    'Fees are a fraction of a cent, paid in TON.',
      walletHelp: { name: 'Tonkeeper', url: 'https://tonkeeper.com' },
      grantAngle: 'Plays entirely inside Telegram — nothing to install, and an invite is just a forwarded message.',
    },
  },

  aptos: {
    tagline:      'OWN THE WORLD · IN MOVE',
    pitch:        'Aptos makes each tile a first-class Move object with its own ownership rules, and executes transactions in parallel so thousands of players claiming at once do not queue behind one another.',
    connectLabel: 'Connect Petra',
    hero:         { motif: 'grid', colors: ['#06f7c9', '#4bb8ff'] },
    onboarding: {
      why:        'On Aptos your tile is a first-class Move object with its own ownership rules, and transactions execute in parallel so simultaneous claims do not queue behind each other.',
      nativeTerm: 'a Move object',
      chainStat:  { value: '~0.5s', label: 'Block time' },
      feeNote:    'Fees are a fraction of a cent, paid in APT.',
      walletHelp: { name: 'Petra', url: 'https://petra.app' },
      grantAngle: 'Each tile is a native Move object you hold directly, and simultaneous claims never queue up.',
    },
  },

  sui: {
    tagline:      'OWN THE WORLD · AS OWNED OBJECTS',
    pitch:        'On Sui a tile is an owned object, so a claim takes the single-owner fast path instead of full consensus ordering — the map can be carved up by many players at once without contention.',
    connectLabel: 'Connect Sui Wallet',
    hero:         { motif: 'waves', colors: ['#4da2ff', '#a5e8ff'] },
    onboarding: {
      // walletHelp omitted: Sui's first-party wallet was renamed and rehosted,
      // and a wrong link is worse than the neutral default.
      why:        'On Sui your tile is an owned object, so claiming it takes the single-owner fast path instead of full consensus ordering and many players can carve up the map at once.',
      nativeTerm: 'a Sui object',
      chainStat:  { value: 'Move', label: 'Contract language' },
      feeNote:    'Fees are a fraction of a cent, paid in SUI.',
      grantAngle: 'Your tile is a native Move object you own outright, so claiming stays instant even on a crowded map.',
    },
  },

  starknet: {
    tagline:      'OWN THE WORLD · PROVEN BY ZK',
    pitch:        'Starknet proves execution with STARKs, so the record of who claimed which tile is verified by a proof settled on Ethereum instead of being trusted to our server.',
    connectLabel: 'Connect Ready or Braavos',
    hero:         { motif: 'hex', colors: ['#ec796b', '#f7b2a6'] },
    onboarding: {
      why:        'Starknet proves execution with STARKs and settles those proofs on Ethereum, so who owns which tile is verified by a proof rather than trusted to our server.',
      nativeTerm: 'a Cairo ERC-721 token',
      chainStat:  { value: 'STARK', label: 'Proof system' },
      feeNote:    'Fees are a fraction of a cent, paid in STRK.',
      walletHelp: { name: 'Braavos', url: 'https://braavos.app' },
      grantAngle: 'Who owns which tile is settled by a proof on Ethereum, not by trusting our server.',
    },
  },

  cardano: {
    tagline:      'OWN THE WORLD · AS NATIVE ASSETS',
    pitch:        'On Cardano a tile is a native asset tracked by the ledger itself, so no NFT contract stands between a player and the deed to their territory.',
    connectLabel: 'Connect Lace or Eternl',
    hero:         { motif: 'hex', colors: ['#0033ad', '#7fb3ff'] },
    onboarding: {
      why:        'On Cardano your tile is a native asset tracked by the ledger itself, so no NFT contract stands between you and the deed.',
      nativeTerm: 'a native Cardano asset',
      chainStat:  { value: '~20s', label: 'Block time' },
      feeNote:    'Fees are a fraction of an ADA, paid in ADA.',
      walletHelp: { name: 'Lace', url: 'https://lace.io' },
      grantAngle: 'Your tile is a native Cardano asset sitting in your own wallet — no NFT contract in between.',
    },
  },

  near: {
    tagline:      'OWN THE WORLD · NAMED ACCOUNTS',
    pitch:        'NEAR gives every player a human-readable account and treats agents as first-class citizens, so a deed reads alice.near and the Guardian agents defending it run natively on the same chain.',
    connectLabel: 'Connect your NEAR account',
    hero:         { motif: 'mesh', colors: ['#00c08b', '#00ec97'] },
    onboarding: {
      why:        'NEAR gives you a human-readable named account, so the deed to your territory reads alice.near instead of a hex string nobody can check at a glance.',
      nativeTerm: 'a NEP-171 token',
      chainStat:  { value: 'alice.near', label: 'Readable accounts' },
      feeNote:    'Fees are a fraction of a cent, paid in NEAR.',
      walletHelp: { name: 'Meteor', url: 'https://meteorwallet.app' },
      grantAngle: 'AI Guardian agents defend your land natively on NEAR, and your deed reads as a name, not a hex string.',
    },
  },

  stellar: {
    tagline:      'OWN THE WORLD · ON SOROBAN',
    pitch:        'Stellar has moved value cheaply between real-world currencies for a decade and Soroban adds the contracts, so a game about real territory settles on rails already used for real payments.',
    connectLabel: 'Connect Freighter',
    hero:         { motif: 'waves', colors: ['#7d00ff', '#b47cff'] },
    onboarding: {
      why:        'Stellar has moved value between real-world currencies cheaply for a decade and Soroban adds the contracts, so a game about real territory settles on real payment rails.',
      nativeTerm: 'a Soroban asset',
      chainStat:  { value: '~5s', label: 'Ledger close' },
      feeNote:    'Fees are a tiny fraction of a cent, paid in XLM.',
      walletHelp: { name: 'Freighter', url: 'https://freighter.app' },
      grantAngle: 'Soroban contracts plus Stellar fees so small that claiming a tile costs far less than a cent.',
    },
  },

  algorand: {
    tagline:      'OWN THE WORLD · FINAL IN ONE BLOCK',
    pitch:        'Algorand Standard Assets make each tile a native ledger asset with single-block finality, so a claim is irreversible the moment it lands and no smart contract sits between the player and the deed.',
    connectLabel: 'Connect Pera Wallet',
    hero:         { motif: 'hex', colors: ['#00d1b2', '#7af5df'] },
    onboarding: {
      why:        'An Algorand Standard Asset makes your tile a native ledger asset with single-block finality, so the claim is irreversible the moment it lands and no smart contract sits between you and the deed.',
      nativeTerm: 'an Algorand Standard Asset (ASA)',
      chainStat:  { value: '1 block', label: 'Finality' },
      feeNote:    'Fees are a fraction of a cent, paid in ALGO.',
      walletHelp: { name: 'Pera', url: 'https://perawallet.app' },
      grantAngle: 'Each tile is a native Algorand asset held in your wallet, final one block after you claim it.',
    },
  },

  multiversx: {
    tagline:      'OWN THE WORLD · NATIVELY SHARDED',
    pitch:        'MultiversX issues NFTs as native ESDT assets on a sharded network, so tile ownership lives in the protocol itself and capacity grows with the shards as more of the map is claimed.',
    connectLabel: 'Connect xPortal',
    hero:         { motif: 'hex', colors: ['#23f7dd', '#1b46c2'] },
    onboarding: {
      why:        'MultiversX issues NFTs as native ESDT assets, so your tile is held by the protocol itself and capacity grows with the shards as more of the map is claimed.',
      nativeTerm: 'a native ESDT',
      chainStat:  { value: '~6s', label: 'Block time' },
      feeNote:    'Fees are a fraction of a cent, paid in EGLD.',
      walletHelp: { name: 'xPortal', url: 'https://xportal.com' },
      grantAngle: 'Tiles are native ESDT assets held by the protocol itself, so no NFT contract stands in between.',
    },
  },

  radix: {
    tagline:      'OWN THE WORLD · AS NATIVE RESOURCES',
    pitch:        'On Radix assets are native resources enforced by the ledger rather than by contract bookkeeping, and the transaction manifest shows a player exactly which tile they are signing away.',
    connectLabel: 'Connect Radix Wallet',
    hero:         { motif: 'orbit', colors: ['#052cc0', '#00c389'] },
    onboarding: {
      why:        'On Radix your tile is a native resource enforced by the ledger rather than by contract bookkeeping, and the transaction manifest shows you exactly what you are signing away.',
      nativeTerm: 'a native non-fungible resource',
      chainStat:  { value: 'Manifest', label: 'Readable transactions' },
      feeNote:    'Fees are a fraction of an XRD, paid in XRD.',
      walletHelp: { name: 'Radix Wallet', url: 'https://wallet.radixdlt.com' },
      grantAngle: 'Tiles are native resources, and your wallet spells out in plain words exactly what you are signing.',
    },
  },

  tezos: {
    tagline:      'OWN THE WORLD · GOVERNED ON-CHAIN',
    pitch:        'Tezos pairs the FA2 token standard with a chain that amends itself by on-chain vote, matching a game whose own territory rules are meant to be settled by its players rather than by a studio.',
    connectLabel: 'Connect Temple or Kukai',
    hero:         { motif: 'orbit', colors: ['#2c7df7', '#8ec5ff'] },
    onboarding: {
      why:        'Tezos amends itself by on-chain vote and standardises tokens as FA2, which matches a game whose territory rules are meant to be settled by its players.',
      nativeTerm: 'an FA2 token',
      chainStat:  { value: 'On-chain', label: 'Governance' },
      feeNote:    'Fees are a fraction of a cent, paid in XTZ.',
      walletHelp: { name: 'Temple', url: 'https://templewallet.com' },
      grantAngle: 'Tiles are FA2 tokens and the rules of the map are voted on-chain by players, not set by a studio.',
    },
  },
}
