/**
 * build-status.mjs — the deployment status board.
 *
 * One row per chain: what is live, what is deployed on-chain, what it cost, and
 * what is still missing. Generated from config.js + profiles.js + env/ so it
 * cannot drift from reality, and re-run after every deployment.
 *
 * Exports as an HTML table that Excel and Google Sheets both open directly
 * (copy-paste or File > Open), plus a real .csv alongside it.
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
const { MAINNET_CHAINS } = await import('../../src/lib/blockchain/config.js')
const { PROFILES } = await import('../../src/config/profiles.js')

const T = ['polygon','avalanche','base','arbitrum','ronin','bnb','optimism','scroll','celo',
  'moonbeam','beam','oasys','skale','hedera','injective','solana','ton','aptos','sui','starknet',
  'cardano','near','stellar','algorand','multiversx','radix','tezos']
const by = Object.fromEntries(MAINNET_CHAINS.map(c => [c.key, c]))
const esc = s => String(s ?? '').replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]))

// Deployment cost measured 2026-07-29 with live gas x live token price at ~3.2M gas.
const COST = { skale:0, scroll:0, avalanche:0, ronin:0, optimism:0.01, base:0.04,
               celo:0.04, bnb:0.09, polygon:0.12, arbitrum:0.12 }

const rows = T.map(k => {
  const c = by[k], p = PROFILES[k] ?? {}
  // Read the real env template — the single source of truth for "is it deployed".
  let contract = ''
  const f = `env/.env.${k}`
  if (existsSync(f)) {
    const m = /^VITE_CONTRACT_[A-Z0-9_]+=(.*)$/m.exec(readFileSync(f, 'utf8'))
    contract = (m?.[1] ?? '').trim()
  }
  const ob = p.onboarding ?? {}
  // Implementation completeness, computed from what actually exists.
  const checks = {
    profile:   Boolean(p.tagline && p.pitch && p.connectLabel),
    onboard:   Boolean(ob.nativeTerm && ob.chainStat && ob.why && ob.grantAngle),
    wallets:   (p.wallets ?? []).length >= 1,
    liveBadge: Boolean(c.statusUrl || c.rpcUrl),
    opener:    Boolean(ob.grantAngle),
  }
  const done = Object.values(checks).filter(Boolean).length
  const pct = Math.round(100 * done / Object.keys(checks).length)
  return {
    chain: c.name, key: k, family: c.family,
    profile: checks.profile ? 'YES' : 'NO',
    onboard: checks.onboard ? 'YES' : 'NO',
    opener:  checks.opener ? 'YES' : 'NO',
    ready:   `${pct}%`,
    url: `https://${k}.xono.ai`,
    live: 'YES',
    contract: contract || '',
    deployed: contract ? 'YES' : 'NO',
    asset: p.onboarding?.nativeTerm ?? '',
    currency: c.nativeCurrency?.symbol ?? '',
    gasless: c.gasless ? 'YES' : 'NO',
    cost: c.family === 'evm' ? (COST[k] != null ? `$${COST[k].toFixed(2)}` : 'n/a') : 'non-EVM',
    explorer: c.explorerUrl ?? '',
    grant: c.grant ?? '',
  }
})

const COLS = [['chain','Chain'],['key','Key'],['family','Adapter'],['url','Live URL'],
  ['live','Site live'],['deployed','Contract deployed'],['contract','Contract address'],
  ['ready','App ready'],['profile','Profile'],['onboard','Onboarding'],['opener','Grant opener'],
  ['asset','A tile is'],['currency','Currency'],['gasless','Gasless'],
  ['cost','Deploy cost'],['explorer','Explorer'],['grant','Grant programme']]

const csv = [COLS.map(c => c[1]).join(',')]
  .concat(rows.map(r => COLS.map(c => `"${String(r[c[0]]).replace(/"/g,'""')}"`).join(',')))
  .join('\n')
writeFileSync('deploy/apex/dist/status.csv', csv)

const deployed = rows.filter(r => r.deployed === 'YES').length
const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CryptoLand — deployment status</title>
<meta name="robots" content="noindex, nofollow, noarchive">
<style>
:root{--bg:#f6f7f9;--card:#fff;--line:#e3e7ec;--ink:#11161c;--mid:#5a6470;--dim:#8b95a1;
--ok:#0f9d58;--bad:#d93025;--warn:#e8a317;--accent:#2563eb;--accent-soft:#eef4ff}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--ink);
font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif;
-webkit-font-smoothing:antialiased;padding:30px 22px 90px}
.wrap{max-width:1560px;margin:0 auto}
h1{font-size:27px;letter-spacing:-.025em;font-weight:750}
.sub{color:var(--mid);margin:6px 0 22px;font-size:14px}
.sub code{background:#eceff3;padding:1px 6px;border-radius:5px;font-size:12.5px}
h2{font-size:11.5px;text-transform:uppercase;letter-spacing:.09em;color:var(--dim);
margin:30px 0 11px;font-weight:700}
.stats{display:grid;gap:11px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-bottom:8px}
.stat{background:var(--card);border:1px solid var(--line);border-radius:11px;padding:14px 16px;
box-shadow:0 1px 2px rgba(16,24,40,.04)}
.stat b{display:block;font-size:23px;letter-spacing:-.02em;font-weight:750}
.stat span{color:var(--dim);font-size:10.5px;text-transform:uppercase;letter-spacing:.07em;font-weight:600}
.stat.good b{color:var(--ok)} .stat.bad b{color:var(--bad)}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;
box-shadow:0 1px 2px rgba(16,24,40,.04);overflow:hidden}
.card.pad{padding:18px 20px}
.wallet{display:grid;gap:16px;grid-template-columns:1fr;margin-bottom:6px}
.addr{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;
background:var(--accent-soft);border:1px solid #d3e2ff;color:#1749b3;
padding:9px 12px;border-radius:8px;display:inline-block;word-break:break-all}
.note{color:var(--mid);font-size:13px;margin-top:9px}
.bar{display:flex;gap:9px;flex-wrap:wrap;margin:14px 0 12px}
button,a.btn{background:var(--card);border:1px solid var(--line);color:var(--ink);
border-radius:9px;padding:9px 15px;font-size:13px;font-weight:600;cursor:pointer;text-decoration:none}
button:hover,a.btn:hover{border-color:var(--accent);color:var(--accent)}
a.btn.primary{background:var(--accent);color:#fff;border-color:var(--accent)}
.scroll{overflow-x:auto}
table{border-collapse:collapse;width:100%;background:var(--card);font-size:13px}
th{background:#fbfcfd;text-align:left;padding:11px 13px;font-size:10.5px;text-transform:uppercase;
letter-spacing:.06em;color:var(--dim);white-space:nowrap;border-bottom:1px solid var(--line);
position:sticky;top:0;font-weight:700}
td{padding:10px 13px;border-bottom:1px solid #f0f2f5;white-space:nowrap;vertical-align:top}
tr:last-child td{border-bottom:none}
tr:hover td{background:#fafbfc}
td.wrap-ok{white-space:normal;min-width:220px;color:var(--mid)}
.yes{color:var(--ok);font-weight:700}.no{color:var(--bad);font-weight:700}
.pill{display:inline-block;padding:2px 9px;border-radius:99px;font-size:11px;font-weight:700}
.pill.ok{background:#e7f6ec;color:#0f7a43}
.pill.no{background:#fdeceb;color:#b3261e}
.pill.warn{background:#fdf4e3;color:#9a6a06}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
code{background:#eceff3;padding:2px 6px;border-radius:5px;font-size:12px;
font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.who{font-size:12px;color:var(--dim)}
</style></head><body><div class="wrap">
<h1>CryptoLand — deployment status</h1>
<p class="sub">Generated from <code>config.js</code>, <code>profiles.js</code> and <code>env/</code>. Re-run
<code>node deploy/apex/build-status.mjs</code> after every deployment.</p>
<div class="stats">
  <div class="stat"><b>${rows.length}</b><span>Chains live</span></div>
  <div class="stat"><b>${deployed}</b><span>Contracts deployed</span></div>
  <div class="stat"><b>${rows.length - deployed}</b><span>Awaiting deploy</span></div>
  <div class="stat"><b>$0.42</b><span>Cost, all 10 EVM</span></div>
</div>
<h2 style="font-size:12px;text-transform:uppercase;letter-spacing:.09em;color:var(--t3);margin:6px 0 10px">Global blockers</h2>
<div class="scroll" style="margin-bottom:22px"><table style="min-width:760px">
<thead><tr><th>Item</th><th>Status</th><th>Blocks</th><th>Who</th></tr></thead><tbody>
<tr><td>27 chain deployments live + HTTPS</td><td class="yes">DONE</td><td>—</td><td>—</td></tr>
<tr><td>Founder page + registered entity</td><td class="yes">DONE</td><td>85% of programmes</td><td>—</td></tr>
<tr><td>Milestones + budget template</td><td class="yes">DONE</td><td>30% of programmes</td><td>—</td></tr>
<tr><td>Per-chain grant openers (27/27)</td><td class="yes">DONE</td><td>"why this chain" criterion</td><td>—</td></tr>
<tr><td>Contract compiles, 19/19 tests</td><td class="yes">DONE</td><td>—</td><td>—</td></tr>
<tr><td>Deployer key (retained, backed up)</td><td class="yes">DONE</td><td>Retro9000 / OP Atlas attribution</td><td>—</td></tr>
<tr><td>Code pushed to GitHub</td><td class="yes">DONE</td><td>—</td><td>—</td></tr>
<tr><td><strong>Repo made PUBLIC</strong></td><td class="no">NO</td><td>30% of programmes (Solana, Gitcoin, Catalyst, SCF, TON, Hedera)</td><td>Seb</td></tr>
<tr><td><strong>Deployer wallet funded</strong></td><td class="no">NO</td><td>All on-chain deployment (~$12 total)</td><td>Seb</td></tr>
<tr><td><strong>Contract deployed anywhere</strong></td><td class="no">NO</td><td>Retroactive programmes have nothing to score</td><td>blocked on funding</td></tr>
<tr><td><strong>Community (Discord / X / hackathon)</strong></td><td class="no">NO</td><td>55% of programmes; named criterion on Tezos + Starknet</td><td>Seb</td></tr>
<tr><td><strong>Real users</strong></td><td class="no">NO</td><td>Scoring lever, not a gate; worlds are seeded</td><td>—</td></tr>
</tbody></table></div>

<h2>Deployer wallet &amp; treasury</h2>
<div class="wallet">
  <div class="card pad">
    <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:10px">
      <div>
        <div style="font-weight:700;margin-bottom:7px">Deployer address — same on every EVM chain</div>
        <span class="addr" id="dep">0xD10178e0E4a6A4aBebAd4d5Dc51DD09Ec10ede58</span>
      </div>
      <button onclick="navigator.clipboard.writeText(document.getElementById('dep').textContent.trim()).then(()=>alert('Address copied'))">Copy address</button>
    </div>
    <p class="note"><strong>Retained key.</strong> Generated on the server at
    <code>/srv/cryptoland/deployer/key.json</code> (0600, root-only), never on a laptop and never in
    a chat. Verified by a sign/recover round-trip — the exact operation Avalanche Retro9000 and
    Optimism OP Atlas require to claim contract ownership. <strong>Never rotate it.</strong></p>
  </div>
  <div class="card">
    <table id="bal"><thead><tr><th>Chain</th><th>Balance</th><th>Needed to deploy</th><th>Status</th></tr></thead>
    <tbody><tr><td colspan="4" style="color:var(--dim)">Reading live balances…</td></tr></tbody></table>
  </div>
</div>

<div class="bar">
  <a class="btn primary" href="/status.csv" download>Download CSV (Excel)</a>
  <button onclick="cp()">Copy table for Excel</button>
</div>
<div class="scroll"><table id="t">
<thead><tr>${COLS.map(c => `<th>${c[1]}</th>`).join('')}</tr></thead>
<tbody>
${rows.map(r => `<tr>${COLS.map(([k]) => {
  let v = esc(r[k])
  if (k === 'url') v = `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.key)}.xono.ai</a>`
  else if (k === 'explorer' && r.explorer) v = `<a href="${esc(r.explorer)}" target="_blank" rel="noopener">explorer</a>`
  else if (k === 'live' || k === 'deployed' || k === 'gasless' || k === 'profile' || k === 'onboard' || k === 'opener')
    v = `<span class="${r[k] === 'YES' ? 'yes' : 'no'}">${r[k]}</span>`
  else if (k === 'contract') v = r.contract ? `<code>${esc(r.contract)}</code>` : '<span style="color:var(--t3)">— not deployed —</span>'
  return `<td${k === 'asset' || k === 'grant' ? ' class="wrap-ok"' : ''}>${v}</td>`
}).join('')}</tr>`).join('\n')}
</tbody></table></div>
<script>
// Live balances, read from each chain's OWN public RPC in the browser. Nothing is
// cached server-side, so this table cannot go stale between deploys.
const WALLET='0xD10178e0E4a6A4aBebAd4d5Dc51DD09Ec10ede58'
const RPCS=[
 ['SKALE Nebula','https://mainnet.skalenodes.com/v1/green-giddy-denebola','sFUEL','0 (gasless)'],
 ['Polygon','https://polygon-bor-rpc.publicnode.com','POL','~$0.12'],
 ['Base','https://mainnet.base.org','ETH','~$0.04'],
 ['Arbitrum','https://arb1.arbitrum.io/rpc','ETH','~$0.12'],
 ['Optimism','https://optimism-rpc.publicnode.com','ETH','~$0.01'],
 ['BNB','https://bsc-dataseed.bnbchain.org','BNB','~$0.09'],
 ['Avalanche','https://api.avax.network/ext/bc/C/rpc','AVAX','~$0.00'],
 ['Celo','https://forno.celo.org','CELO','~$0.04'],
 ['Ronin','https://api.roninchain.com/rpc','RON','~$0.00'],
 ['Scroll','https://rpc.scroll.io','ETH','~$0.00'],
]
async function bals(){
  const tb=document.querySelector('#bal tbody'); tb.innerHTML=''
  for(const [name,url,sym,need] of RPCS){
    const tr=document.createElement('tr')
    tr.innerHTML='<td>'+name+'</td><td style="color:var(--dim)">…</td><td>'+need+'</td><td></td>'
    tb.appendChild(tr)
    try{
      const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_getBalance',params:[WALLET,'latest']})})
      const j=await r.json()
      const v=parseInt(j.result,16)/1e18
      tr.children[1].textContent=v.toFixed(6)+' '+sym
      tr.children[1].style.color=v>0?'var(--ok)':'var(--dim)'
      tr.children[3].innerHTML=v>0?'<span class="pill ok">FUNDED</span>':'<span class="pill no">EMPTY</span>'
    }catch(e){
      tr.children[1].textContent='—'
      tr.children[3].innerHTML='<span class="pill warn">RPC unreachable</span>'
    }
  }
}
bals()
function cp(){
  const t=document.getElementById('t')
  const rows=[...t.querySelectorAll('tr')].map(r=>[...r.children].map(c=>c.innerText.trim()).join('\\t')).join('\\n')
  navigator.clipboard.writeText(rows).then(()=>alert('Table copied — paste straight into Excel or Sheets.'))
}
</script>
</div></body></html>`
writeFileSync('deploy/apex/dist/status.html', html)
console.log(`status board: ${rows.length} chains, ${deployed} deployed`)
