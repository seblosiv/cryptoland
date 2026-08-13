# Social accounts — what to open, and exactly what to write

**Why this file exists.** Missing social accounts are the single most expensive
gap in the grant campaign. They are not a soft "nice to have": on the forms whose
fields we actually read (§20), **Telegram is a required field on 3 of 7 and
GitHub on 3 of 7**, and Starknet will not accept a submission without four of
them. Separately, §7 measured **"community engagement" as a named requirement on
55% of programmes** — the most common soft requirement in the whole corpus.

Everything below is drafted to be pasted. Character counts are checked against
each platform's limit.

---

## 0. The rule that governs every word here

We have **contracts live and verified**. We do **not** have players. Every world
is seeded with generated addresses, and `CLAUDE.md` is explicit: a reviewer who
discovers that on their own is a lost grant.

So: never post a user count, never imply traction, never screenshot a seeded map
as if it were organic. Post what is checkable — addresses, chains, checks, code.
That is a strong story on its own and it cannot be contradicted.

---

## 1. Priority order

Open them in this order. The first two unblock actual form fields; the third is
the evidence for the 55%.

| # | Platform | Why it is on the list | Urgency |
|---|---|---|---|
| 1 | **GitHub (public repo)** | Required field on 3 forms **and** satisfies "open source / public repo" (30% of programmes). One action, two requirements. | **Today** |
| 2 | **Telegram** | Required field on 3 forms. Starknet's form has `TG group <> SNF` — they expect a *shared group with the foundation*, so an account is mandatory, not a handle. | **Today** |
| 3 | **X / Twitter** | Required field on 2 forms; the default evidence for "community engagement". | This week |
| 4 | **LinkedIn** | Founder profile — Animoca asks for it. | This week |
| 5 | **Discord** | **Zero** forms require it. Cited only in prose. Do it last, and only if you will actually staff it — an empty Discord is worse than none. | Later |

> The counts come from **7 of 43** programmes — the only ones whose fields we
> could read. Treat them as a floor, not a ceiling.

---

## 2. Naming — decide once, use everywhere

The product is **CryptoLand**; the company and domain are **XONO** (`CLAUDE.md`).
So the handle should carry both, and it must be identical on every platform —
a reviewer cross-checking three links wants three matching names.

**First choice:** `cryptoland_xono` (or `cryptolandxono` where underscores are
disallowed).
**Fallbacks, in order:** `xono_ai` · `playcryptoland` · `cryptoland_game`

Avoid bare `cryptoland` — almost certainly taken, and it drops the company.

Same avatar and banner everywhere: the CryptoLand mark on `#0f0f0f`, the accent
green `#4ade80` for the active element. Assets already exist in
`src/components/logos/`.

---

## 3. GitHub — do this first

The repository is MIT-licensed and ready; it is simply **not published**. That
one flip satisfies a required form field *and* the 30% asking for open source.

**Org name:** `xono-ai` — **Repo:** `cryptoland`

**Org bio** (160 max — 138):
```
Chain-native builds of CryptoLand, a geospatial NFT game. 28 mainnet contracts across 14 VM families, each verified on-chain after deploy.
```

**Repo description** (350 max — 185):
```
A map of the real world divided into 268,435,456 tiles you claim, upgrade, trade, raid and govern as NFTs. One codebase, one chain-native build per ecosystem. 28 chains live on mainnet.
```

**Repo topics:** `blockchain-game` `nft` `web3` `maplibre` `solidity` `move`
`cairo` `soroban` `react` `fastapi`

**Pin in the README, above the fold** — this is the part reviewers check:

```markdown
### Live on mainnet
28 chains · 113/113 on-chain checks passing after deployment
EVM (18 chains): 0x89C6bcfb0aCC152F98599261dc2A72a996c3763F
Full matrix, addresses and explorer links: https://xono.ai/status

### Honest status
Contracts are live. Players are not. Every world ships pre-seeded so no build
opens on an empty map — those holders are generated addresses, not users, and
every figure we publish is labelled organic or seeded.
```

That last block is not a weakness. It is the single most credible thing on the
page, and it pre-empts the discovery that would otherwise sink an application.

---

## 4. Telegram — two things, not one

Starknet's `TG group <> SNF` field means a shared group with the Starknet
Foundation. You need a **personal account** to be added to such groups, and a
**public channel** to put in the "Telegram" form field.

**Personal account** — set a username: `@cryptoland_xono`. That string is what
goes in every form's "Contact Telegram handle" field.

**Public channel** — `t.me/cryptoland_xono`

Channel bio (255 max — 180):
```
CryptoLand by XONO — a map of the real world in 268,435,456 tiles, claimed as NFTs. 28 chains live on mainnet, every deployment verified on-chain. Build log, not marketing. xono.ai
```

**First three posts** (post them before you link the channel anywhere — an empty
channel in a grant form reads worse than no channel):

1. *What this is* — one paragraph, the one-liner plus the grid size, and the
   `xono.ai` link.
2. *Live on 28 chains* — the EVM address, the count, the link to `/status`.
   Say plainly that contracts are live and players are not yet.
3. *How a tile ID works* — `(x << 15) | y`, and that five independent VMs agree
   `(16383, 16383) → 536854527`. This is the most interesting true thing we have
   and it costs nothing to tell.

---

## 5. X / Twitter

**Handle:** `@cryptoland_xono` — **Name:** `CryptoLand by XONO`

Bio (160 max — 149):
```
A map of the real world in 268,435,456 tiles you claim, upgrade, trade and govern as NFTs. 28 chains live on mainnet, every deploy verified on-chain.
```

**Location:** Remote · **Link:** `https://xono.ai`

**Pinned post** (keep under 280):
```
CryptoLand is a map of Earth split into 268,435,456 tiles. You claim one, and it
mints to your wallet as a real NFT on the chain you're on.

Live on 28 chains today. 113/113 on-chain checks passing.

Contracts are live; players aren't yet. Building in public: xono.ai
```

The last line is deliberate. It is disarming, it is true, and it means nobody can
later "catch" us.

**What to post, roughly weekly** — engineering, not hype:
- a chain going live, with the address and explorer link
- a defect deployment found that tests missed (the `tokenIdFromKey` collision is
  a genuinely good post)
- cost engineering — the Solana program going 207,488 B → 2,816 B, $109 → $1.58

**Do not post:** player counts, "join the community", price talk, roadmaps with
dates we cannot hold.

---

## 6. LinkedIn

A **company page** (`XONO`) plus your personal profile updated. Animoca's form
asks for the founder's LinkedIn specifically.

Company tagline (120 max — 103):
```
CryptoLand — a geospatial NFT game live on 28 blockchains. Own, upgrade and trade real-world territory.
```

Company about (2000 max; this is 449):
```
XONO builds CryptoLand, a geospatial NFT game: a map of the real world divided
into 268,435,456 tiles that players claim, customise, trade, raid and govern as
NFTs held in their own wallets.

Rather than one multi-chain app, CryptoLand ships a separate chain-native build
per ecosystem — its wallets, its token standard, its vocabulary, its own domain.
28 chains carry a live mainnet contract today, each verified on-chain after
deployment.

xono.ai
```

Your headline (220 max — 83):
```
Founder at XONO · Building CryptoLand, a geospatial NFT game live on 28 blockchains
```

---

## 7. Discord — last, and only if staffed

No form we read requires it. It appears only in prose about community
engagement. A Discord with 3 members and no activity is evidence *against* the
claim it is meant to support. Open it when there is something to gather people
around, not before.

---

## 8. After the accounts exist

1. Put the handles into `deploy/apex/build-about.mjs` so `xono.ai/about` lists
   them — 85% of programmes ask for team/founder identity and that is the page
   they read.
2. Re-run `node scripts/build-apply-pack.mjs`. The generator currently writes
   `⚠️ NOT AVAILABLE — no account exists yet` into every social field; once the
   handles are real, replace that string in the generator and the 43 answer
   sheets fill themselves in.
3. Re-check readiness at `xono.ai/dossier` — Polygon should move from 94 to 100,
   and Starknet's blocker list should shrink to captcha only.
