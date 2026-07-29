/**
 * build-openers.mjs — the first paragraph of every grant application, per chain.
 *
 * Solana scores "Only Possible on Solana"; Starknet scores "embeddedness with the
 * Starknet ecosystem". Leading with "one codebase, 27 chain-native builds" answers
 * "why ANY chain", which scores zero on both. The per-chain answer already exists
 * in PROFILE.onboarding.grantAngle — this renders it into a paste-ready opener so
 * the right sentence leads every application.
 *
 * Portability appears LAST and only as evidence of engineering capability, never
 * as the headline.
 */
import { writeFileSync } from 'node:fs'
const { MAINNET_CHAINS } = await import('../../src/lib/blockchain/config.js')
const { PROFILES } = await import('../../src/config/profiles.js')

const T = ['polygon','avalanche','base','arbitrum','ronin','bnb','optimism','scroll','celo',
  'moonbeam','beam','oasys','skale','hedera','injective','solana','ton','aptos','sui','starknet',
  'cardano','near','stellar','algorand','multiversx','radix','tezos']
const by = Object.fromEntries(MAINNET_CHAINS.map(c => [c.key, c]))

let md = `# Application openers — one per chain

Paste the block for the chain you are applying to as the **first paragraph**. It
answers the "why this chain" criterion that Solana ("Only Possible on Solana") and
Starknet ("embeddedness with the ecosystem") score directly.

**Rule: never open with the 27-chain story.** It answers "why any chain" and reads
as uncommitted. Portability goes last, as evidence of capability.

Generated from \`src/config/profiles.js\` — edit there, not here.

---

`
for (const k of T) {
  const c = by[k], p = PROFILES[k] ?? {}, ob = p.onboarding ?? {}
  md += `## ${c.name}  \`${k}.xono.ai\`

**Opener**

> CryptoLand is a geospatial territory game over the real world — a 16,384 × 16,384
> tile grid, 268,435,456 claimable tiles of roughly 2.4 km². It is **live on
> ${c.name}** at \`${k}.xono.ai\`, where a tile is **${ob.nativeTerm ?? 'a native asset'}**.
> ${ob.grantAngle ?? ''}

**Why ${c.name} specifically** — ${ob.why ?? p.pitch ?? '(add to profiles.js)'}

**Verifiable without contacting us:** \`https://${k}.xono.ai/ecosystem\` reports this
deployment's own traction, scoped to ${c.name}, plus the live ${c.name} chain head read
from ${c.name}'s own node.

| | |
|---|---|
| Native asset | ${ob.nativeTerm ?? '—'} |
| Currency | ${c.nativeCurrency?.symbol ?? '—'}${c.gasless ? ' (gasless — no fee to claim)' : ''} |
| Wallets | ${(p.wallets ?? []).slice(0,3).map(w => typeof w === 'string' ? w : (w.name ?? '')).join(', ') || '—'} |
| Adapter family | \`${c.family}\` |

---

`
}
md += `## Closing paragraph (use on every application, last)

> The same game runs natively on 27 chains from one codebase — 13 adapter families
> behind a single 24-function interface, contract-tested. That is offered here as
> evidence that the team ships and maintains real cross-ecosystem infrastructure,
> not as a suggestion that this chain is interchangeable. Each deployment has its own
> bundle, database and backend; nothing is shared.

## Honesty block (required — matches what the product already says)

> No NFT contract is deployed yet, so on-chain minting is stubbed and every
> deployment reports zero on-chain mints. The worlds are seeded demo data with
> chain-correct addresses and modelled retention, not real players. Both facts are
> published on the product itself. This grant funds exactly that gap.
`
writeFileSync('documentation/application-openers.md', md)
console.log(`openers: ${T.length} chains, ${(md.length/1024).toFixed(1)} KB`)
