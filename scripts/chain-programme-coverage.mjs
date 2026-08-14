/**
 * coverage.mjs — match each grant programme to the chain we actually deployed.
 *
 * Answers two questions the dossier could not:
 *   1. for each of our 34 mainnet chains, which programmes can it apply to?
 *   2. what fraction of live programmes do we have the chain ready for?
 *
 * The join is on the programme's `chain` field normalised against our chain
 * keys. "Any" / "multi" programmes are chain-agnostic and counted separately —
 * folding them into a per-chain number would inflate every chain equally and
 * mean nothing.
 */
import { PROGRAMS } from '../deploy/apex/programs.mjs'
import { CHAINS } from '../src/lib/blockchain/config.js'

const ACTIONABLE = new Set(['OPEN', 'ROLLING', 'PROPOSAL'])

// Programme chain label -> our chain key. Only where the string differs.
const ALIAS = {
  'flare (evm)': 'flare', 'mantle (evm)': 'mantle', 'rootstock (evm)': 'rootstock',
  'taiko (evm)': 'taiko', 'skale': 'skale', 'bnb': 'bnb', 'ton': 'ton',
  'near': 'near', 'iota': null, 'aleph zero': null, 'kadena': null,
  'celestia': null, 'aztec': null, 'arc / multi': null, 'moonbeam': 'moonbeam',
}
const AGNOSTIC = new Set(['any', 'any / evm', 'multi', 'arc / multi'])

const mainnet = Object.values(CHAINS).filter(c => !c.testnet)
const deployed = new Set(mainnet.map(c => c.key))

function chainKeyFor(label) {
  const l = (label || '').toLowerCase().trim()
  if (AGNOSTIC.has(l)) return '__any__'
  if (l in ALIAS) return ALIAS[l]
  const direct = mainnet.find(c => c.key === l || c.name.toLowerCase() === l)
  return direct ? direct.key : null
}

const rows = []
const unmatched = []
for (const p of PROGRAMS) {
  const key = chainKeyFor(p.chain)
  if (key === null) unmatched.push(p)
  rows.push({ ...p, key, actionable: ACTIONABLE.has(p.status) })
}

// ── per-chain ────────────────────────────────────────────────────────────────
const perChain = new Map()
for (const c of mainnet) perChain.set(c.key, { open: [], dead: [] })
for (const r of rows) {
  if (!r.key || r.key === '__any__') continue
  const slot = perChain.get(r.key)
  if (!slot) continue
  ;(r.actionable ? slot.open : slot.dead).push(r)
}

const agnosticOpen = rows.filter(r => r.key === '__any__' && r.actionable)

console.log('═'.repeat(72))
console.log('CHAIN → PROGRAMME COVERAGE')
console.log('═'.repeat(72))
console.log(`our mainnet chains: ${mainnet.length}`)
console.log(`programmes: ${PROGRAMS.length} (${rows.filter(r => r.actionable).length} actionable)`)
console.log(`chain-agnostic programmes any chain can use: ${agnosticOpen.length}`)
console.log()

const withOpen = [], withoutOpen = []
for (const c of mainnet) {
  const s = perChain.get(c.key)
  ;(s.open.length ? withOpen : withoutOpen).push([c, s])
}

console.log(`── ${withOpen.length} chains have at least one live chain-specific programme ──`)
for (const [c, s] of withOpen.sort((a, b) => b[1].open.length - a[1].open.length)) {
  const names = s.open.map(p => `#${p.n} ${p.name}`).join(', ')
  console.log(`  ${c.key.padEnd(13)} ${String(s.open.length).padStart(2)} → ${names.slice(0, 92)}`)
}

console.log()
console.log(`── ${withoutOpen.length} chains have NO live chain-specific programme ──`)
for (const [c, s] of withoutOpen) {
  const why = s.dead.length ? `(${s.dead.length} dead: ${s.dead.map(p => p.name).join(', ').slice(0, 52)})` : '(none ever listed)'
  console.log(`  ${c.key.padEnd(13)} ${why}`)
}

// ── the coefficient ─────────────────────────────────────────────────────────
const chainSpecificOpen = rows.filter(r => r.actionable && r.key && r.key !== '__any__')
const covered = chainSpecificOpen.filter(r => deployed.has(r.key))
const notCovered = chainSpecificOpen.filter(r => !deployed.has(r.key))

console.log()
console.log('═'.repeat(72))
console.log('THE COEFFICIENT')
console.log('═'.repeat(72))
console.log(`chain-specific live programmes:            ${chainSpecificOpen.length}`)
console.log(`  ...whose chain we HAVE deployed:        ${covered.length}  ← ready`)
console.log(`  ...whose chain we have NOT deployed:    ${notCovered.length}`)
if (notCovered.length) {
  for (const r of notCovered) console.log(`        #${r.n} ${r.name} (${r.chain})`)
}
const pct = ((covered.length / chainSpecificOpen.length) * 100).toFixed(1)
console.log()
console.log(`COVERAGE: ${covered.length}/${chainSpecificOpen.length} = ${pct}% of live chain-specific programmes`)
console.log(`          + ${agnosticOpen.length} chain-agnostic programmes any chain satisfies`)
console.log(`TOTAL REACHABLE: ${covered.length + agnosticOpen.length} of ${rows.filter(r => r.actionable).length} actionable`)

console.log()
console.log(`── chains deployed with NO programme to apply to (${withoutOpen.length}) ──`)
console.log('   ' + withoutOpen.map(([c]) => c.key).join(', '))

if (unmatched.length) {
  console.log()
  console.log('── programmes whose chain we do not have a config entry for ──')
  for (const p of unmatched) {
    console.log(`   #${p.n} ${p.name} (${p.chain}) [${p.status}]`)
  }
}
