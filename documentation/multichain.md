# Multichain — CryptoLand

## Overview

CryptoLand ships as **ONE codebase that produces N chain-native builds** — not one
app that spans every chain at runtime. Each deployment picks a single target chain
at build time (`VITE_CHAIN`) and becomes a chain-native bundle in `dist-<chain>/`.
This lets the same product be submitted to 10+ blockchain grant programs, each as a
first-class native app for that chain.

The ownership model is deliberately layered so a chain works the day it's submitted,
before any smart contract exists:

1. **Backend DB is canonical.** Within a given build, tile ownership lives in the
   SQLite `blocks` table (`chain` column records which chain that build targets).
   Purchases, marketplace, guardians, DAO — all work off the DB.
2. **On-chain contract is the anchor (deployed later).** When the grant owner
   deploys a contract for a chain and sets `VITE_CONTRACT_<CHAIN>`, that build's
   NFT layer lights up automatically — mints anchor the DB ownership on-chain and
   an optional NFT is minted to the buyer.
3. **Mint is stubbed until deploy.** With no contract address set, `mintTile()`
   returns `{ minted: false }` instead of throwing. Connect + sign + purchase all
   work today; only the on-chain mint is skipped.

> One codebase → one `VITE_CHAIN` per build → DB-canonical ownership now → on-chain
> anchor + NFT mint the moment `VITE_CONTRACT_<CHAIN>` is set. Nothing else changes.

---

## Chain targets

`src/lib/blockchain/config.js` defines **55 entries — 29 mainnet plus 26 testnet
counterparts — across 13 adapter families**. `scripts/build-chain.sh` and `env/`
agree on **27 build targets** (every mainnet chain except `ethereum`, a general
EVM target not tied to a named grant, and `skale-europa`, since the SKALE grant
build is the Nebula gaming hub).

| Family | Adapter | Mainnet chains |
|---|---|---|
| `evm` | `evm.js` | Polygon, Avalanche, Base, Ethereum, Arbitrum, Ronin, BNB, Optimism, Scroll, Celo, Moonbeam, Beam, Oasys, SKALE Nebula, SKALE Europa, Hedera, Injective |
| `solana` | `solana.js` | Solana |
| `ton` | `ton.js` | TON |
| `aptos` | `aptos.js` | Aptos |
| `sui` | `sui.js` | Sui |
| `starknet` | `starknet.js` | Starknet |
| `cardano` | `cardano.js` | Cardano |
| `near` | `near.js` | NEAR |
| `stellar` | `stellar.js` | Stellar (Soroban) |
| `algorand` | `algorand.js` | Algorand |
| `multiversx` | `multiversx.js` | MultiversX |
| `radix` | `radix.js` | Radix |
| `tezos` | `tezos.js` | Tezos |

Each chain's `grant` field in `config.js` names the program it targets. The full
52-program mapping, including which programs are paused or dead, lives in
[grants.md](grants.md); the step-by-step application process is in
[submitting-grants.md](submitting-grants.md).

**Deliberately not shipped:** Kadena (organisation ceased operations Oct 2025),
Aztec (unaudited, no NFT standard, and no arbitrary-message signing so login
cannot work), Celestia (a DA layer, not a wallet chain). Each has a `NOTE`
comment in `config.js` where its entry would otherwise sit.

### Funding programs (not chains)

These fund a build on a chain we already support — no new adapter or chain key:

- **Gitcoin QF** — quadratic-funding round; typically pointed at the Base or
  Arbitrum build.
- **Alchemy WAGBI** — infrastructure/credits program; applies to any EVM build.
- **Alliance DAO** — accelerator/funding; program-level, chain-agnostic.

---

## Chain families & adapters

All chain-specific logic lives in `src/lib/blockchain/`:

```
src/lib/blockchain/
  config.js              ← CHAINS registry (every chain + its params) + active-chain selection
  index.js               ← loads the active family's adapter, re-exports the interface
  adapters/
    _shared.js           ← shared tile↔tokenId packing + mint-stub helpers
    evm.js               ← all 17 EVM chains (MetaMask, Coinbase, Rabby, injected)
    solana.js            ← Solana (Phantom, Solflare, Backpack)
    ton.js               ← TON (TON Connect / Tonkeeper / Telegram Mini App)
    aptos.js             ← Aptos (Petra, Martian, Pontem, Nightly)
    sui.js               ← Sui (Wallet Standard: Sui Wallet, Suiet, Ethos)
    starknet.js          ← Starknet (get-starknet: Ready/Argent X, Braavos, Cartridge)
    cardano.js           ← Cardano (CIP-30: Lace, Eternl, Typhon, Vespr)
    near.js              ← NEAR (wallet-selector: Meteor, MyNearWallet, Nightly)
    stellar.js           ← Stellar / Soroban (Freighter)
    algorand.js          ← Algorand (Pera, Defly, Lute)
    multiversx.js        ← MultiversX (DeFi Wallet extension, xPortal)
    radix.js             ← Radix (Radix Wallet via Connector extension; ROLA auth)
    tezos.js             ← Tezos (Beacon / TZIP-10: Temple, Kukai, Umami)
  contracts/
    abi.json             ← EVM ABI (matches contracts/CryptoLandTile.sol)
```

**13 families.** One `evm.js` adapter covers all 17 EVM chains — adding an EVM
chain needs **no adapter changes**, only a `config.js` entry. Adding a non-EVM
family needs a new adapter implementing the full interface; `src/test/chains.test.js`
fails the build until it does.

Optional chain SDKs are listed as rollup `external` in `vite.config.js` and
lazy-imported *inside* adapter functions, so every build compiles with those
packages absent — only the chain you are shipping needs its SDK installed.

### Active-chain selection (`config.js`)

`VITE_CHAIN` selects one key from the `CHAINS` map at build time:

```js
export const ACTIVE_CHAIN_KEY = (import.meta.env.VITE_CHAIN in CHAINS)
  ? import.meta.env.VITE_CHAIN
  : 'polygon-amoy'          // safe fallback so a misconfigured build still boots
export const ACTIVE_CHAIN        = CHAINS[ACTIVE_CHAIN_KEY]
export const ACTIVE_CHAIN_FAMILY = ACTIVE_CHAIN.family
```

`config.js` also exports `MAINNET_CHAINS` (for any "supported chains" UI),
`CHAIN_CANONICAL_NAMES` (chain key → DB `chain` string, derived from the map keys),
`chainById()`, `explorerTxUrl()`, and `explorerNFTUrl()`.

### Adapter index (`index.js`)

`index.js` dynamically imports the adapter for `ACTIVE_CHAIN.family` and re-exports
its interface. **Consumers always import from `../lib/blockchain`, never from an
adapter directly.**

---

## The universal adapter interface

Every adapter (EVM, Solana, TON, Aptos, Sui) implements the identical surface that
`index.js` destructures:

| Symbol | Purpose |
|--------|---------|
| `connect()` | Connect wallet → `{ address, chainId, chainName }` |
| `disconnect()` | Disconnect / clear cached address |
| `getAddress()` | Current connected address or `null` |
| `getChainId()` | Active chain id |
| `switchChain()` | EVM: switch/add network. Non-EVM: no-op (a build targets one network) |
| `signMessage(msg)` | Sign an arbitrary message → `{ signature, address }` |
| `signPurchase({ tileKey, price })` | Sign the purchase intent (proof of wallet control) → `{ signature, message }` |
| `mintTile({ tx, ty, country, toAddress })` | Mint the tile NFT — **stubbed** (`{ minted:false }`) until a contract is set |
| `listForSale` / `unlistTile` / `buyTile` | On-chain marketplace ops (activate with the deployed contract) |
| `ownerOf` / `getTileData` / `getOwnedTokenIds` / `totalSupply` | On-chain reads |
| `waitForTx(hash)` | Poll for confirmation |
| `onAccountsChanged` / `onChainChanged` / `onDisconnect` / `removeListeners` | Wallet event listeners |
| `detectWallets()` | Enumerate installed/available wallets for this family |
| `tileTokenId(tx, ty)` / `tokenIdToTile(id)` | Deterministic tile ↔ tokenId mapping |
| `ADAPTER_TYPE` | Family string — one of the 13 families (`'evm'`, `'solana'`, `'ton'`, `'aptos'`, `'sui'`, `'starknet'`, `'cardano'`, `'near'`, `'stellar'`, `'algorand'`, `'multiversx'`, `'radix'`, `'tezos'`) |

### tile ↔ tokenId mapping

**One encoding, everywhere.** Every family — EVM and non-EVM alike — packs the
coordinates identically, so a tile maps to the same NFT id on every chain:

```js
tokenId = (BigInt(tx) << 15n) | BigInt(ty)     // ty in the low 15 bits (0x7FFF)
```

`evm.js` defines it directly; every other adapter re-exports it from `_shared.js`
(`COORD_SHIFT = 15n`, `COORD_MASK = 0x7FFF`). It matches `tokenIdFromKey` in
`contracts/CryptoLandTile.sol`, which packs into 29 bits, and it round-trips via
`tokenIdToTile()`.

> ⚠️ **Historical note.** `_shared.js` briefly used a *multiplied* scheme
> (`tx * 16384 + ty`), which produced **different ids from the EVM/Solidity
> packing** for the same tile. It was unified to the bit-packed form on
> 2026-07-25, and `src/test/chains.test.js` now asserts EVM and `_shared` agree.
> Any contract or index built against the old multiplied ids must be regenerated.

The tile *key* string (`"tx:ty"`) remains the canonical cross-chain identity; the
numeric tokenId is derived from it.

### Shared mint-stub behaviour (`_shared.js`)

```js
hasContract()   // Boolean(ACTIVE_CHAIN.contractAddress)
mintStub(reason)// { txHash:null, tokenId:null, minted:false, reason }
```

Each non-EVM adapter's `mintTile()` returns `mintStub(...)` when `!hasContract()`,
so the purchase flow completes cleanly and the NFT layer switches on automatically
the moment `VITE_CONTRACT_<CHAIN>` is set. The EVM adapter follows the same
"purchase works without a contract, mint activates when the address is set" pattern.

---

## Per-chain presentation (chain profiles)

### The problem it solves

The plumbing was already per-chain — adapters, RPCs, contract addresses — but a
Polygon build and an Algorand build still *looked* identical apart from a logo
swap. A grant reviewer opening `algorand.cryptoland.game` should feel the app was
built for Algorand, not see a generic multichain app with their logo bolted on.

Forking the UI per chain would fix the perception and destroy the codebase. The fix
is a **single declarative profile per chain**: everything ecosystem-specific (copy,
accent colour, wallet naming, feature emphasis) becomes data, and every component
reads the same merged object.

That leaves a deployment with three separable layers:

| Layer | Where it lives | Selected by |
|---|---|---|
| **Chain plumbing** | `src/lib/blockchain/` — adapters + `config.js` | `VITE_CHAIN`, at build time |
| **Presentation** | `src/config/profiles.js` + `src/lib/chainProfile.js` | `PROFILES[ACTIVE_CHAIN_KEY]` — the same build-time key |
| **Data** | its own backend + SQLite DB per deployment | `VITE_API_BASE` — see [Deployment topology](#deployment-topology) |

### Where it lives

```
src/config/profiles.js    ← PROFILES: per-chain overrides, keyed by the VITE_CHAIN key
src/lib/chainProfile.js   ← DEFAULTS + WALLETS_BY_FAMILY → merged PROFILE, applyProfileTheme()
```

`chainProfile.js` takes `PROFILES[ACTIVE_CHAIN_KEY] ?? {}` and merges it over
neutral defaults. **Import `PROFILE` from `src/lib/chainProfile.js` — never
`PROFILES` directly**, the same discipline as importing from `../lib/blockchain`
rather than an adapter. `chainProfile.js` also re-exports `ACTIVE_CHAIN` and
`ACTIVE_CHAIN_KEY`, so a component needs one import for both profile and chain
config.

### The PROFILE contract

Every field has a neutral default derived from the chain's `CHAINS` entry, so a
brand-new chain looks correct before anyone writes a profile for it.

| Field | Type | Default | Purpose |
|---|---|---|---|
| `ecosystem` | string | `ACTIVE_CHAIN.name` | Ecosystem display name, e.g. `"Algorand"`. Overridden only where the config name is longer than the ecosystem's own short name (`"Arbitrum One"` → `Arbitrum`, `"BNB Smart Chain"` → `BNB Chain`, `"OP Mainnet"` → `Optimism`, the two SKALE hubs) |
| `tagline` | string | `'OWN THE WORLD · ON-CHAIN'` | Short hero line under the wordmark |
| `pitch` | string \| null | `null` | One sentence on *why this chain* — intro copy, reused in grant applications |
| `connectLabel` | string | `Connect to <chain name>` | Call-to-action on the wallet button (read by `WalletModal.jsx`). **Set explicitly on all 29 mainnet profiles**, because the right words are ecosystem-specific: *Connect Pera Wallet*, *Open in Telegram*, *Connect Ready or Braavos* |
| `accent` | `#rrggbb` | `ACTIVE_CHAIN.color` | Accent colour — see the theming rule below |
| `mark` | string | `ACTIVE_CHAIN.logo` | Emoji fallback mark. No profile overrides it: the onboarding resolves an SVG through `logoFor()` and falls back to `ACTIVE_CHAIN.logo` directly — see [The logomark system](#the-logomark-system) |
| `wallets` | array \| null | `WALLETS_BY_FAMILY[family]` | Preferred wallets, most-likely-installed first |
| `features.gasless` | bool | `Boolean(ACTIVE_CHAIN.gasless)` | True only for the SKALE hubs today |
| `features.miniApp` | bool | `ACTIVE_CHAIN.family === 'ton'` | Telegram Mini App surface |
| `features.mobileFirst` | bool | `false` | Mobile-first framing (Solana Mobile, Celo) |
| `features.aiAgents` | bool | `true` | Guardian agents are core gameplay on every build |
| `grantProgram` | string \| null | `ACTIVE_CHAIN.grant ?? null` | Informational — which program this deployment targets |
| `hero.motif` | `'grid'` \| `'mesh'` \| `'rays'` \| `'orbit'` \| `'waves'` \| `'hex'` | `'grid'` | Which of the six CSS gradient motifs `<ChainHero>` paints |
| `hero.colors` | `[hex]` \| `[hex, hex]` \| null | `null` → the accent, twice | 1–2 gradient stops from the chain's real brand palette. Stops render on a near-black surface, so nothing near-black goes here |
| `onboarding.why` | string \| null | `null` → falls back to `pitch` | One sentence: *why own land on THIS chain*. Held to the same truth bar as `pitch` |
| `onboarding.nativeTerm` | string \| null | `null` | What a tile **is** in this ecosystem's own token vocabulary — see below |
| `onboarding.chainStat` | `{ value, label }` \| null | `null` → the generic `$12+ / Starting` tile | One true, checkable fact, rendered as the third stat tile — see below |
| `onboarding.feeNote` | string \| null | `null` → *"This chain sponsors gas…"* when `features.gasless`, else *"Network fees are paid in `<symbol>`."* | What the player pays in gas, in plain words. Must name the chain's **real** native currency, and must never call a chain free unless `gasless` is set on it in `config.js` |
| `onboarding.walletHelp` | `{ name, url }` \| null | `null` | Install link for the primary wallet, so a first-timer with no wallet is not dead-ended. Omitted rather than guessed — a wrong wallet link is worse than the neutral default |
| `onboarding.grantAngle` | string \| null | `null` | The capability this chain's grant programme rewards, written as a player benefit — see below |

Merge semantics: the override is spread over `DEFAULTS`; `features`, `hero` and
`onboarding` are each merged one level deep (so a profile can set `mobileFirst`
without redeclaring `aiAgents`, or `hero.colors` without redeclaring `motif`); and
`wallets` resolves `override.wallets → WALLETS_BY_FAMILY[family] → WALLETS_BY_FAMILY.evm`.

Coverage today: all **29** mainnet entries in `PROFILES` set `tagline`, `pitch`,
`connectLabel`, `hero` and a full `onboarding` block (`why`, `nativeTerm`,
`chainStat`, `feeNote`, `grantAngle`); 28 of 29 also set `walletHelp` — Sui omits it
on purpose, because its first-party wallet was renamed and rehosted and a wrong link
is worse than no link. Only 4 profiles override `wallets`, 3 override `accent`, 5
override `ecosystem` and 3 override `features` — everything else comes from
`config.js`. Testnet keys are deliberately absent: a testnet build inherits the
neutral defaults, which is the honest presentation for a non-production deployment.

### Wallet naming (`WALLETS_BY_FAMILY`)

`chainProfile.js` ships fallback wallet lists for all 13 adapter families, each
entry `{ id, name, icon }`, ordered most-likely-installed first. Correct wallet
naming is a large part of feeling native: a Starknet user expects *Ready (Argent X)*,
*Braavos*, *Cartridge* — not a generic "Connect Wallet". Nami is deliberately absent
from the Cardano list (it was absorbed into Lace and can no longer connect to dApps).

### The theming rule — accent and copy ONLY

`applyProfileTheme()` writes the accent into CSS custom properties on
`document.documentElement`, once at boot:

```js
--chain-accent      = PROFILE.accent          // e.g. #00d1b2 on Algorand
--chain-accent-dim  = PROFILE.accent + '22'   // the same colour at ~13% alpha
data-chain          = ACTIVE_CHAIN_KEY        // CSS hook: [data-chain="ton"]
data-family         = ACTIVE_CHAIN.family     // CSS hook: [data-family="evm"]
```

Components then use `var(--chain-accent)` and re-tint automatically per deployment —
no per-chain CSS files, no per-chain components, no conditional rendering on chain.

> **The rule: theming means swapping the ACCENT colour and the WORDS — never a
> different visual language.** The UI stays **solid dark** on every chain: solid
> surfaces, hairline borders, no glass, no `backdrop-filter`, no blur. A profile that
> reaches for a new surface treatment is out of contract.

Because `--chain-accent-dim` is produced by string concatenation, `accent` must be a
6-digit `#rrggbb` hex. Every `color` in `config.js` already is — a 3-digit or `rgba()`
value would silently produce an invalid custom property.

### Adding a profile for a new chain

1. The chain needs a `CHAINS` entry first — see
   [How to add a new chain](#how-to-add-a-new-chain).
2. Add an entry to `PROFILES` in `src/config/profiles.js`, keyed by the **same
   `VITE_CHAIN` key** (`'algorand'`, `'ton'`, `'skale'` …).
3. Override only what differs. In practice that is `tagline`, `pitch`,
   `connectLabel`, a `hero` motif and the `onboarding` block — `accent`, `mark`,
   `ecosystem` and `grantProgram` already come from `config.js`, and `wallets` and
   `features` only appear where the family fallback is wrong.
4. That's all. No component, CSS file, route or build change.

### Fallbacks preserve universality

A chain with **no** `PROFILES` entry is neither broken nor half-branded: it renders
neutral CryptoLand branding using the chain's own name, colour, mark and grant
string from `config.js`, plus its family's wallet list. Universality is preserved
*by construction* — the profile layer can only add specificity, never remove the
working default. Adding chain #30 is still one `CHAINS` entry; writing its profile
is an optional polish pass afterwards.

### Chain-native onboarding

The profile drives a real first-run flow, not just a tinted splash.

| Piece | File | What it does |
|---|---|---|
| Logomarks | `src/components/logos/` | 28 inline SVG marks + `logoFor(chainKey)` — see [The logomark system](#the-logomark-system). |
| Hero motif | `src/components/ChainHero.jsx` | Six pure-CSS gradient motifs — `grid`, `mesh`, `rays`, `orbit`, `waves`, `hex` — selected per chain via `PROFILE.hero.motif`, painted in `PROFILE.hero.colors` (falling back to the accent). No images, **no blur** (the solid-dark rule still applies). Decorative only: `aria-hidden`, `pointer-events: none`, masked to fade out behind the copy. |
| Flow | `src/components/ChainOnboarding.jsx` | Three steps: *what this is* → *paying & your wallet* → *how owning works*, with the same layout on every build. |

Which profile field lands where in the flow:

| Step | Reads |
|---|---|
| 1 · What this is | `ChainMark`, `tagline`, the stat row (`268M` / `~2.4 km²` / **`onboarding.chainStat`**), **`onboarding.nativeTerm`** in the "held as …" clause, then `onboarding.why` (falling back to `pitch`) in the accent colour |
| 2 · Paying & your wallet | `ecosystem`, `ACTIVE_CHAIN.name`, `nativeCurrency.symbol`, a `Gas: FREE` row when `features.gasless`, `onboarding.feeNote`, the first three `wallets`, and the `onboarding.walletHelp` install link |
| 3 · How owning works | the three-step loop, with **`onboarding.nativeTerm`** in "Your tile is held as … on `<ecosystem>`", then `onboarding.grantAngle` in an accent-tinted panel headed *On `<ecosystem>`* |

The badge row above all three steps shows `<ecosystem> · Land Registry`, plus
*Zero gas* when `features.gasless` and *Runs in Telegram* when `features.miniApp`.

**`onboarding.nativeTerm`** — what a tile IS in that ecosystem's own vocabulary:
`'an Algorand Standard Asset (ASA)'`, `'a Move object'`, `'an FA2 token'`,
`'a NEP-171 token'`, `'a native non-fungible resource'`. This is the strongest
native-platform signal in the whole flow, because it is the language that chain's
own builders use — a reviewer from that ecosystem notices the precision (or its
absence) before they notice anything else on the screen.

> **Accuracy rule: `nativeTerm` must match what we actually deploy, not what would
> sound most native.** The Hedera profile says *"an ERC-721 NFT on Hedera"* and
> deliberately **not** *"a Hedera Token Service NFT"*, because the contract we deploy
> is a plain ERC-721 reached over the JSON-RPC relay. Overclaiming here is the exact
> kind of detail a chain's own grant reviewer catches, and it costs more credibility
> than the generic term ever would.

**`onboarding.chainStat`** — `{ value, label }`, rendered as the third tile in the
stat row so that row itself differs per deployment instead of repeating the same
three numbers on 29 builds. It must be **one true, checkable fact**, grounded in that
chain's entry in `blockchain/config.js` (`blockTime`, `gasless`, `nativeCurrency`) or
in a well-established property of the chain: `{ '~2s', 'Block time' }` on Polygon,
`{ '$0.00', 'Gas fees' }` on the SKALE hubs, `{ '1 block', 'Finality' }` on Algorand,
`{ 'STARK', 'Proof system' }` on Starknet. Omit it and the tile falls back to the
generic `$12+ / Starting`.

> **Hard rule: never a TPS figure, a user count or a funding number.** Those are
> marketing numbers — unverifiable, contested between ecosystems, and stale the day
> after they are written. A stat a reviewer can check against their own chain's docs
> in ten seconds is worth more than a big one they have to take on faith.

**`onboarding.grantAngle`** encodes what the chain's grant programme actually
rewards, **written as a player-facing benefit**. SKALE's build says players never pay
gas; the TON build says you claim without leaving Telegram. It never mentions grants
or funding — fundraising copy inside a player flow would undercut the very reviewer
it is meant to impress.

Every field is optional. A chain with none still onboards correctly using values
derived from `config.js`.

### The logomark system

`src/components/logos/` holds **one component per chain** — 28 files today — plus an
`index.js` that exports the `CHAIN_LOGOS` registry and the `logoFor(chainKey)`
resolver.

```js
import { logoFor } from './logos'

const Logo = logoFor(ACTIVE_CHAIN_KEY)   // → component, or null
```

`logoFor()` returns the exact match first, then strips a testnet suffix and retries
(`'polygon-amoy'` → `polygon`, `'near-testnet'` → `near`), so every testnet build
inherits its mainnet mark for free. `'skale-europa'` is an explicit alias to the
SKALE mark. When there is no mark at all it returns **`null`**, and the caller falls
back to the emoji in `ACTIVE_CHAIN.logo` — the same fallback discipline as the rest
of the profile layer, so a brand-new chain is never blank.

Conventions every logo file follows: default export is a React component taking
`{ size = 28, className, style }`, so the caller controls the rendered size and each
file keeps whatever viewBox its geometry was drawn in; a `role="img"` +
`aria-label`; and pure paths and shapes — no `<image>`, no external `<use>`, no
fonts, no network request and nothing to 404.

> **The marks are monochrome and painted with `currentColor`** — all 28 files, with
> no hard-coded hex fill anywhere. `ChainMark` in `ChainOnboarding.jsx` sets
> `color: var(--chain-accent, var(--green))` on the ringed badge that wraps them —
> that, and nothing else, is what tints each chain's mark to its own accent.

Keeping them monochrome is a deliberate design decision, not a shortcut. It is what
makes 29 separate builds read as one design system rather than 29 skins, and it
sidesteps the brand-colour clashes that official multi-colour assets cause on a
solid-dark UI (several official marks are black-on-white, or use a hue that
disappears against `--bg`). The accent already carries the chain's identity; the
silhouette only has to carry its shape. Swapping in an official asset is always one
file's edit if a specific ecosystem requires it.

> **A mark has to survive being one colour.** Because the fill collapses to a single
> accent, any mark whose meaning lives in its *colour separation* rather than its
> outline turns into a featureless blob. Two things to check when swapping in an
> official asset: a knockout mark must keep its `fillRule="evenodd"` /
> `clipRule="evenodd"` (drop them and the negative space fills in solid), and a mark
> that is only a container — a plain disc, or a rounded square with the glyph knocked
> out in white — must not be reduced to the container alone. Base is the worked
> example: the brand kit's "Square" symbol is a solid rounded square filling the whole
> viewBox, so `base.jsx` uses the flat-edged disc with the horizontal slot instead,
> which still reads at 28px in one colour.

---

## Environment templates

Per-chain env templates live in `env/.env.<chain>` (committed as blanks; real values
are git-ignored). Example `env/.env.base`:

```bash
# CryptoLand build config — Base — Builder
VITE_API_BASE=
VITE_CHAIN=base
VITE_CONTRACT_BASE=
VITE_MARKETPLACE_BASE=
VITE_TOKEN_BASE=
```

`env/` has one template per grant chain: `.env.ton`, `.env.polygon`, `.env.avalanche`,
`.env.ronin`, `.env.base`, `.env.arbitrum`, `.env.solana`, `.env.bnb`, `.env.aptos`,
`.env.sui`. The master reference with every variable documented is
[`.env.example`](../.env.example) at the repo root.

Per chain the relevant vars are:

- `VITE_CHAIN` — which `CHAINS` key this build targets (required)
- `VITE_CONTRACT_<CHAIN>` — NFT contract address (blank until deployed; mint stays stubbed)
- `VITE_MARKETPLACE_<CHAIN>` — optional marketplace contract address
- `VITE_TOKEN_<CHAIN>` — optional `$CLND` token address
- `VITE_API_BASE` — API origin (empty = same-origin / dev proxy)

---

## Building per-chain bundles

`scripts/build-chain.sh` builds one target chain into `dist-<chain>/` so builds don't
overwrite each other. It stages `env/.env.<chain>` → `.env.production`, then runs
`vite build --outDir dist-<chain>`.

```bash
npm run build:chain base        # → dist-base/
npm run build:chain solana      # → dist-solana/
npm run build:all-chains        # build every chain in the script's list
```

The script's `CHAINS` list is **27 chains**, and `env/` holds exactly one template
per entry:

```
EVM      polygon avalanche base arbitrum ronin bnb optimism scroll celo moonbeam
         beam oasys skale hedera injective
non-EVM  solana ton aptos sui starknet cardano near stellar algorand multiversx
         radix tezos
```

Until a chain's `VITE_CONTRACT_<CHAIN>` is filled in, the build still works —
ownership is DB-backed and the on-chain mint is skipped.

---

## Deployment topology

### One subdomain per chain

Each build gets its own subdomain, named after its `VITE_CHAIN` key:

| Subdomain | Build command | Served directory |
|---|---|---|
| `algorand.cryptoland.game` | `npm run build:chain algorand` | `dist-algorand/` |
| `ton.cryptoland.game` | `npm run build:chain ton` | `dist-ton/` |
| `base.cryptoland.game` | `npm run build:chain base` | `dist-base/` |
| … one per chain in `scripts/build-chain.sh` | `npm run build:all-chains` | `dist-<chain>/` |

`dist-<chain>/` is a plain static bundle — any static host works, with the usual
SPA rewrite (unknown paths → `index.html`). Point `VITE_API_BASE` in
`env/.env.<chain>` at that deployment's API origin *before* building. The TON build
additionally needs `public/tonconnect-manifest.json` reachable over HTTPS at its own
origin, with `url` matching the subdomain exactly — see [grants.md](grants.md) §5.

### Each deployment is its own world

A deployment is a *complete* CryptoLand: its own frontend bundle, its own backend,
its own SQLite DB. Because tile ownership is DB-canonical, separate DBs mean the
same tile can be owned by different players on Algorand and on TON with no
cross-chain reconciliation to do — and `GET /metrics/grant` on a deployment reports
only that chain's DAU/retention/volume, which is exactly the number a grant report
asks for. (The `blocks.chain` column still records which chain wrote the row, so a
deployment stays self-describing if DBs are ever merged for analysis.)

### Why build-time-per-subdomain beats runtime hostname detection

The alternative — ship one bundle, read `window.location.hostname`, switch chains at
runtime — is cheaper to operate and worse on the three axes that matter:

| | Build-time per subdomain | Runtime hostname detection |
|---|---|---|
| **What a reviewer sees** | A chain-native app: one chain, one wallet flow, that ecosystem's language and accent | A multichain app with a dropdown, where their chain is one option among ~30 |
| **Bundle** | Only the active family's adapter is ever loaded, and only that chain's wallet SDK is installed (`vite.config.js` marks every optional chain SDK `external`) | Every adapter and every wallet SDK must ship; for any one visitor, nearly all of it is dead code |
| **Data & metrics** | Own backend + DB per deployment; ownership cannot collide across chains and per-chain metrics are clean by construction | One shared DB; ownership collides on the same tile key and every metric must be filtered by `chain` |
| **Operational cost** | N builds, N deploys, N DBs, N DNS records | One of each |

The cost column is the honest trade-off — and it is paid by a script
(`npm run build:all-chains`) and by DNS records, not by engineering time. The other
three columns are what a grant is actually judged on.

---

## How to add a new chain

1. **Add an entry to `CHAINS`** in `src/lib/blockchain/config.js` (id, name, family,
   RPC URLs, explorer, native currency, `contractAddress: import.meta.env.VITE_CONTRACT_<KEY> ?? null`, etc.).
2. **EVM chain?** Nothing else in code — `evm.js` already covers it.
3. **New family?** Create `src/lib/blockchain/adapters/<family>.js` implementing the
   full interface above (reuse `_shared.js` for the tile↔tokenId map and mint stub),
   and register it in the `ADAPTERS` map in `index.js`.
4. **Add an env template** `env/.env.<chain>` and the `VITE_CONTRACT_<CHAIN>` var to
   `.env.example`.
5. **Add the chain to** the `CHAINS=(...)` array in `scripts/build-chain.sh`.
6. Build with `npm run build:chain <chain>`.

---

## Deploy steps for a grant owner

To take a chain from "works off the DB" to "on-chain NFTs live", the grant owner
does exactly this:

1. **Deploy the contract** for the chain (EVM: `contracts/CryptoLandTile.sol` via
   Hardhat — see [blockchain.md](blockchain.md); non-EVM: the chain's Move/program/
   collection equivalent).
2. **Set `VITE_CONTRACT_<CHAIN>`** in `env/.env.<chain>` (and optionally
   `VITE_MARKETPLACE_<CHAIN>` / `VITE_TOKEN_<CHAIN>`).
3. **Rebuild:** `npm run build:chain <chain>`.
4. **Done.** `hasContract()` is now true, `mintTile()` stops stubbing, and every new
   purchase mints/anchors on-chain automatically. No other code changes.

Nothing about the DB ownership record changes — the on-chain layer simply becomes
active on top of it.

---

## Related docs

- [blockchain.md](blockchain.md) — adapter details, the EVM `CryptoLandTile.sol`
  contract, and the SIWE wallet-auth flow.
- [architecture.md](architecture.md) — overall system architecture.
- [backend.md](backend.md) — the `blocks.chain` column and server endpoints.
