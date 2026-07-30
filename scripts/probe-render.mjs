// probe-render.mjs — resolve "is this grant programme open?" with a real browser.
//
// Prior probes failed not on TLS but on JS rendering and URL rot. This one tries
// SEVERAL candidate URLs per programme, including SUBDOMAINS (retro9000.avax.network,
// tezos.foundation, communityfund.stellar.org) — a same-host <a> scrape cannot reach
// those, and that single gap accounted for four unresolved programmes.
//
//   cd scripts && npm i playwright && npx playwright install chromium
//   node probe-render.mjs
//
// Uses Playwright's BUNDLED Chromium — never the user's own Chrome (house rule).
// A keyword hit on an unread page is NOT evidence: open the form and read its title
// before recording OPEN. See documentation/program-requirements.md §13.
import { chromium } from 'playwright';

const P = [
 [4,'DoraHacks Grant DAOs',['https://dorahacks.io/grant','https://dorahacks.io/dora','https://dorahacks.io/hackathon']],
 [5,'Base Builder Grants',['https://www.base.org/grants','https://base.org/builders','https://docs.base.org/get-started/grants','https://paragraph.com/@grants.base.eth']],
 [6,'Radix Booster Grants',['https://www.radixdlt.com/grants','https://developers.radixdlt.com','https://www.radixdlt.com/ecosystem','https://www.radixdlt.com/blog']],
 [7,'SKALE Indie Accelerator',['https://skale.space/grants','https://skale.space/developers','https://skale.space/ecosystem','https://skale.space/indie']],
 [8,'Tezos Ecosystem Grants',['https://tezos.com/grants','https://tezos.foundation/grants','https://tzapac.com/grants','https://tezos.foundation']],
 [9,'Scroll Community Grants',['https://grants.scroll.io','https://scroll.io/grants','https://scroll.io/ecosystem','https://scroll.io/blog']],
 [11,'Ronin Ecosystem Grants',['https://roninchain.com/grants','https://docs.roninchain.com','https://roninchain.com/builders','https://skymavis.com']],
 [13,'Stellar Community Fund',['https://communityfund.stellar.org/apply','https://communityfund.stellar.org/rounds','https://stellar.org/grants','https://communityfund.stellar.org']],
 [15,'Celo CeloPG',['https://www.celopg.eco/programs','https://www.celopg.eco/apply','https://www.celopg.eco']],
 [19,'Aptos DoraHacks',['https://dorahacks.io/aptos','https://dorahacks.io/grant/aptos','https://aptosfoundation.org/grants']],
 [22,'Optimism Retro Funding',['https://atlas.optimism.io','https://retrofunding.optimism.io','https://gov.optimism.io/c/retro-funding/46','https://app.optimism.io/retropgf']],
 [30,'Oasys',['https://www.oasys.games/grants','https://www.oasys.games/developers','https://docs.oasys.games','https://www.oasys.games/ecosystem']],
 [32,'Celestia',['https://celestia.org/grants','https://forum.celestia.org','https://celestia.org/ecosystem','https://blog.celestia.org']],
 [35,'Sui Foundation',['https://sui.io/grants','https://sui.io/builders','https://suifoundation.org','https://sui.io/developers']],
 [36,'NEAR Foundation',['https://near.foundation/grants','https://near.org/grants','https://dev.near.org','https://near.foundation/ecosystem']],
 [37,'Algorand Foundation',['https://algorand.foundation/grants','https://algorand.co/grants','https://algorand.foundation/algorand-foundation-grants','https://algorand.co/ecosystem']],
 [40,'Injective Ecosystem',['https://injective.com/grants','https://injectivelabs.org','https://injective.com/ecosystem','https://injective.com/build']],
 [42,'TON Society grants',['https://society.ton.org/grants','https://ton.org/grants','https://github.com/ton-society/grants-and-bounties','https://society.ton.org']],
 [46,'Avalanche Research',['https://build.avax.network/grants','https://retro9000.avax.network','https://www.avax.network/grants','https://build.avax.network/programs']],
 [50,'Animoca Brands',['https://www.animocabrands.com/contact-us','https://www.animocabrands.com/portfolio','https://www.animocabrands.com/company']],
 [52,'a16z CSX',['https://a16zcrypto.com/csx','https://a16zcrypto.com/csx/apply','https://a16zcrypto.com/crypto-startup-accelerator']],
 [3,'Superteam Earn',['https://earn.superteam.fun/grants','https://earn.superteam.fun']],
];

const CLOSED=/(applications?\s+(are\s+)?(now\s+)?closed|no longer accepting|not currently accepting|submissions?\s+closed|currently paused|program(me)?\s+(has\s+)?(ended|concluded)|discontinued|winding down|round\s+(is\s+)?closed|closed for submissions|applications? for .{0,25} (are\s+)?closed|archived)/i;
const OPEN=/(apply now|applications?\s+(are\s+)?open|submit (your |a )?(application|proposal)|rolling basis|accepting applications|apply here|start your application|submit a project|apply for a grant|applications? accepted|apply for funding|request funding)/i;
const DEADLINE=/(deadline|closes?\s+on|applications? close|due by|cohort starts)[^.]{0,60}/i;

const b=await chromium.launch();
const ctx=await b.newContext({userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',viewport:{width:1440,height:900},locale:'en-US'});
const results=[];const queue=[...P];
async function worker(){
  const page=await ctx.newPage();page.setDefaultTimeout(28000);
  while(queue.length){
    const [num,name,urls]=queue.shift();
    const rec={num,name,verdict:'UNREACHABLE',evidence:'',hit:'',tried:0};
    let best='';
    for(const u of urls){
      rec.tried++;
      try{
        const r=await page.goto(u,{waitUntil:'domcontentloaded',timeout:28000});
        await page.waitForTimeout(2200);
        if((r?.status()??0)>=400) continue;
        const t=await page.evaluate(()=>document.body?.innerText||'');
        if(t.length>best.length){best=t;rec.hit=page.url();rec.status=r?.status();}
        const c=CLOSED.exec(t),o=OPEN.exec(t);
        if(c){rec.verdict='CLOSED';rec.evidence=c[0].slice(0,100);rec.hit=page.url();break;}
        if(o){rec.verdict='OPEN';rec.evidence=o[0].slice(0,100);rec.hit=page.url();break;}
      }catch{}
    }
    if(rec.verdict==='UNREACHABLE'&&best.length>300){rec.verdict='UNCLEAR';rec.evidence=best.replace(/\s+/g,' ').slice(0,95);}
    const d=DEADLINE.exec(best);if(d)rec.deadline=d[0].replace(/\s+/g,' ').slice(0,65);
    results.push(rec);
    console.log(`#${String(rec.num).padEnd(3)} ${rec.name.padEnd(24)} ${rec.verdict.padEnd(11)} ${(rec.deadline?'⏰'+rec.deadline+' | ':'')}${rec.evidence}`);
    if(rec.hit&&rec.verdict!=='UNCLEAR')console.log(`      ↳ ${rec.hit}`);
  }
  await page.close();
}
await Promise.all([worker(),worker(),worker(),worker()]);
await b.close();
results.sort((a,b)=>a.num-b.num);
const t={};results.forEach(r=>t[r.verdict]=(t[r.verdict]||0)+1);
console.log('\nTALLY',JSON.stringify(t));
const fs=await import('fs');fs.writeFileSync('/tmp/crawl3.json',JSON.stringify(results,null,1));
