# CryptoLand by XONO

A geospatial territory game over the real world — a 16,384 × 16,384 tile grid,
**268,435,456 claimable tiles** of roughly 2.4 km² each. Players buy, customise,
trade, raid and govern land, with AI Guardian agents defending it while they are
offline.

It ships as **chain-native deployments from one codebase** — currently live on
**30 mainnets**.

> **On the name.** The product is **CryptoLand**; **XONO** is the company and the
> domain it ships under. Both appear throughout on purpose: the on-chain NFT
> collection is `CryptoLand Tiles` / `CLND`, immutably set in each contract's
> constructor across all 30 deployments, while every site, callback and metadata
> URI lives on `xono.ai`.

**Live:** [xono.ai](https://xono.ai) · pick any chain, e.g.
[ton.xono.ai](https://ton.xono.ai) · [cardano.xono.ai](https://cardano.xono.ai) ·
[algorand.xono.ai](https://algorand.xono.ai)

---

## What is actually interesting here

Not the number of chains — that going native on a new one is an **adapter, not a
fork**.

- **13 adapter families** behind one **24-function interface**, enforced by a
  contract test that parses every adapter and fails on a missing export. 15 EVM
  chains share a single adapter; Move, Cairo, UTXO, Soroban, ESDT, FA2 and the
  rest each have their own.
- **A tile is that ecosystem's own primitive** — an ASA on Algorand, a Move object
  on Aptos, an FA2 token on Tezos, a native asset on Cardano. Not a lowest common
  denominator wrapped 27 times.
- **Isolated deployments.** Each build has its own bundle, database and backend.
  `blocks.tile_key` is a global primary key, so a shared database would let the
  first chain to claim a tile lock it for all 27 — separation is structural, not a
  filter someone has to remember to write.
- **Live chain proof.** Every build reads its own chain's head from that chain's
  own node and shows it, so the integration is checkable against a block explorer
  in ten seconds.
- **Derived accent palette.** A chain's brand hex is chosen for its own white
  website; four were unreadable on ours (Cardano 1.82:1). The build derives a
  readable pair rather than hand-overriding, so chain #30 is safe automatically.

## Honest status

- **No NFT contract is deployed on any chain.** On-chain minting is stubbed and
  every deployment reports zero on-chain mints. The tile ledger is the database;
  the chain is the payment rail and the intended anchor.
- **The worlds are seeded demo data** (`server/seed_chain.py`) with chain-correct
  addresses and modelled retention, so no build looks abandoned. They are not real
  players. Every `/ecosystem` page says so.

Both facts are published on the product itself, not just here.

## Stack

React 19 · Vite 8 · Zustand 5 · MapLibre GL 5 · Tailwind 4 · FastAPI · SQLite
(aiosqlite) · NOWPayments (proxied server-side so the API key never reaches the
browser)

## Quick start

```bash
npm install && npm run dev          # frontend on :5173
cd server && pip install -r requirements.txt && python main.py   # API on :8000

npm test                            # 250 tests
npm run build:chain algorand        # one chain-native bundle
npm run build:all-chains            # all 27
node scripts/check-rpcs.mjs         # are all RPCs browser-reachable?
```

## Documentation

[`documentation/`](documentation/) — architecture, backend, frontend, multichain,
styling, deployment, grants. [`CLAUDE.md`](CLAUDE.md) is the operating manual:
critical rules, security invariants, and current state.

Security invariants worth knowing before touching auth or payments are in
`CLAUDE.md` §4 — SIWE single-use nonces, payment binding on `/np/finalize`,
IPN failing closed, Telegram `initData` HMAC key/message ordering.

## Licence

MIT — see [LICENSE](LICENSE).

## Contact

Seb Bochenek — [LinkedIn](https://www.linkedin.com/in/sebbusiness/) ·
[xono.ai/about](https://xono.ai/about)
