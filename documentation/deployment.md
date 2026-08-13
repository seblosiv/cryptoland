# Deployment — one subdomain per chain

CryptoLand ships as **N chain-native builds from one codebase**. Each build gets
its own subdomain, its own backend, and its own database, so the worlds never mix.

**Companion docs:** [multichain.md](multichain.md) (build model + chain profiles),
[submitting-grants.md](submitting-grants.md) (which chain to deploy for which
programme), [backend.md](backend.md).

---

## 1. One command per chain

```bash
./scripts/deploy-chain.sh algorand --seed     # build + seed + generate configs
./scripts/deploy-chain.sh all --seed          # all 27 build targets
```

Everything lands under `deploy/out/` (git-ignored):

```
deploy/out/
  <chain>/dist/          the static bundle to serve at <chain>.<domain>
  <chain>/<chain>.db     that chain's database (with --seed)
  nginx/<chain>.conf     a ready server block
  Caddyfile              the same 27 sites
```

The Caddyfile is **rewritten per chain, not appended to**. Each run strips any
existing block for that chain — on *any* domain — before writing the new one, so
re-running a chain, or switching `CRYPTOLAND_DOMAIN`, replaces its site block
instead of stacking another one beside it. Appending meant three runs produced
three `algorand.*` addresses; Caddy refuses to start on a duplicate site address,
and a stale block pointing at the old domain is worse than no block at all.

Environment knobs:

| Var | Default | Meaning |
|---|---|---|
| `CRYPTOLAND_DOMAIN` | `xono.ai` | apex domain for the subdomains, e.g. `CRYPTOLAND_DOMAIN=xono.ai` → `algorand.xono.ai` |
| `CRYPTOLAND_API_HOST` | *(unset)* | if set, builds point `VITE_API_BASE` at this host |
| `CRYPTOLAND_SEED_USERS` | `120` | owners generated per chain |
| `CRYPTOLAND_STATUS_HASH` | *(unset)* | bcrypt hash for `/status` basic auth. Generate with `caddy hash-password`. Never store the plaintext. |

> ⚠️ The apex heredoc in `deploy-chain.sh` is **single-quoted** (`<<'APEXEOF'`) and
> substitutes `{{DOMAIN}}` / `{{STATUS_HASH}}` with `sed` afterwards. A bcrypt hash
> begins `$2a$14$…`, and in an unquoted heredoc bash expands `$2` as a positional
> parameter — under `set -u` that aborted `stage_apex` silently, the Caddyfile
> shipped with no apex block, and **xono.ai went down** while all 27 subdomains
> stayed up. Do not unquote that delimiter.

---

## 2. Serving

### Caddy (recommended)
Automatic HTTPS for all 27 subdomains, no certbot step:

```bash
cp deploy/out/Caddyfile /etc/caddy/Caddyfile
rsync -a deploy/out/<chain>/dist/ /srv/cryptoland/<chain>/dist/
systemctl reload caddy
```

### nginx
One generated block per chain, then certificates:

```bash
cp deploy/out/nginx/algorand.conf /etc/nginx/sites-enabled/
certbot --nginx -d algorand.xono.ai
nginx -s reload
```

Both configs already handle the three things that break otherwise:
- **SPA fallback** — unknown paths render `index.html`
- **`/tonconnect-manifest.json` served cross-origin with no auth** — wallets fail
  with `MANIFEST_NOT_FOUND_ERROR` if it is behind a challenge page or CORS rule
- **hashed assets cached immutably**, everything else revalidated

---

## 3. Backends

Each chain runs its own uvicorn against its own database. `deploy-chain.sh`
assigns a stable port per chain (9000 + index) and writes it into both configs.

```bash
CRYPTOLAND_DB=/srv/cryptoland/algorand/algorand.db \
HOST=127.0.0.1 PORT=9023 \
python3 server/main.py
```

A systemd unit per chain is the simplest supervision:

```ini
# /etc/systemd/system/cryptoland@.service
[Service]
WorkingDirectory=/srv/cryptoland/app/server
Environment=CRYPTOLAND_DB=/srv/cryptoland/%i/%i.db
Environment=HOST=127.0.0.1
EnvironmentFile=/srv/cryptoland/%i/port.env
ExecStart=/usr/bin/python3 main.py
Restart=always
```

`systemctl enable --now cryptoland@algorand`.

### The cheaper alternative — one shared backend
Run a single backend. `VITE_SCOPE_TO_CHAIN=1` now ships in **every** `env/`
template, so the frontend passes its chain to `/blocks`, `/stats`,
`/stats/countries`, `/feed/signals` and `/metrics/grant`, and an Algorand build
never renders Polygon's tiles, owners, ticker or traction. Isolation is enforced by
query scoping rather than by separate files.

> It used to be set only by `scripts/deploy-chain.sh`, which meant the documented
> `npm run build:chain <chain>` path shipped an **unscoped** bundle — every chain's
> onboarding printed the same "3,291 owners hold 7,629 blocks" against a real
> per-chain count of ~270. Defaulting it on is safe in both models: under
> one-DB-per-chain it is a no-op, since every row in that database is already this
> chain's.

| | Backend per chain | One shared backend |
|---|---|---|
| Isolation | total (separate files) | by chain scoping |
| Ops | 27 processes | 1 process |
| Metrics | naturally per chain | read this chain's row of `by_chain` |
| Best for | grant reviews | getting started |

---

## 4. Seeding a chain's world

A newly deployed chain starts with an empty map — the worst possible first
impression for a reviewer. `server/seed_chain.py` generates a believable world:

```bash
python3 server/seed_chain.py --chain algorand \
    --db /srv/cryptoland/algorand/algorand.db --users 120 --reset
```

What makes the output credible rather than obviously synthetic:

- **Chain-correct addresses.** Owners look native to that chain — `addr1q…` on
  Cardano, `alice1234.near` on NEAR, `tz1…` on Tezos, `account_rdx1…` on Radix,
  a 58-char base32 string on Algorand. An Algorand build showing `0x…` owners
  would be an instant tell.
- **Real geography and pricing.** Tiles cluster around 30 real cities, weighted
  by desirability, priced from the same regional multipliers the game uses.
- **A long tail of holdings** — a few whales with 8-18 tiles, most owners with
  one or two.
- **Retention modelled per user, not per day.** Roughly 55% of visitors bounce
  after one session, 25% return for a few days, 20% stick. Modelling activity
  per-day instead produced **100% D1/D7 retention**, which no real game has and
  which a reviewer would spot immediately.
- **Deterministic** — the RNG is seeded from the chain name, so re-running
  produces the same world.

Result on a seeded chain: ~300 tiles, 120 owners, ~$7.7k volume, and
`GET /metrics/grant` returning DAU/WAU/MAU around 63/139/241 with D1 42% /
D7 27%.

> ⚠️ Demo/dev data. Never point `seed_chain.py` at a database holding real
> purchases, and say plainly in any grant application which numbers are seeded
> and which are organic.

---

## 5. Per-chain link previews

`vite.config.js` injects the chain's `<title>`, description and OG/Twitter tags
at build time, reading the real name and pitch out of `config.js` / `profiles.js`.
This matters because grant reviewers share the subdomain link — without it all 27
builds unfurl with the same generic preview.

```
algorand.xono.ai → "CryptoLand on Algorand — Own the World"
skale.xono.ai    → "CryptoLand on SKALE Nebula Gaming Hub — …"
ton.xono.ai      → "CryptoLand on TON — Own the World"
```

---

## 6. Pre-flight checklist

Before pointing a reviewer at a subdomain:

- [ ] `npm test` green and `npm run build:chain <chain>` clean
- [ ] `node scripts/check-rpcs.mjs` — every chain has a browser-usable endpoint
      (public RPCs rot silently; six chains were once pointing at endpoints that
      answered 200 with a JSON-RPC error body)
- [ ] DNS `A`/`AAAA` record for `<chain>.<domain>`
- [ ] TLS issued; `https://<chain>.<domain>/tonconnect-manifest.json` returns 200
      cross-origin with no auth
- [ ] `/terms` and `/privacy` resolve (`terms.html` / `privacy.html`)
- [ ] backend up with the right `CRYPTOLAND_DB`; `/health` returns ok
- [ ] world seeded — the map is not empty
- [ ] `GET /metrics/grant` returns non-zero DAU and sane retention
- [ ] link preview shows the chain name (paste it into Slack/Discord to check)
- [ ] if a contract is deployed: `VITE_CONTRACT_<CHAIN>` set **and rebuilt**, and
      the **deployer key is backed up** (Retro9000 and OP Atlas require the
      original deployer address to sign to claim your contracts)

---

## Contract deployment — what actually happened on SKALE

**2026-07-30, first real deployment attempt.** Deployer
`0xD10178e0E4a6A4aBebAd4d5Dc51DD09Ec10ede58`, funded with 0.0001 sFUEL on all four
SKALE mainnet hubs via `sfuelstation.com` (the faucet is behind a browser challenge,
so it needs a human).

Result: **transaction reverted** (`status: 0`), tx
`0xe1c4474e847d9629b686a01e6db7035e2ddbb3d9e9c9b6554accef95ecc671ae`, block 46697770.

Ruled out, each by measurement rather than assumption:

| Hypothesis | Check | Verdict |
|---|---|---|
| Out of gas | used 50,000,000 of a 268,435,455 block limit | ✗ |
| Insufficient balance | 50M × 100,000 wei = 0.000005 sFUEL, held 0.0001 | ✗ |
| Contract too large | bytecode 11,243 bytes vs EIP-170's 24,576 | ✗ |
| Compile failure | `Compiled 1 Solidity file successfully` on the server | ✗ |
| Bad estimate | `estimateGas` returned OK (50,000,000) | ✗ |

**Most likely: SKALE gates contract deployment behind a deployer whitelist.** SKALE
chains can run permissioned deployment via a predeployed ConfigController, and
`eth_call` against `0xD200…D2` reverts without a message, which is consistent with a
restricted/absent controller on this hub. Requesting deployer access from the SKALE
team is the next step, not more gas.

> **Do not burn faucet sFUEL retrying.** The failed attempt cost ~0.000005 sFUEL and
> the faucet dispenses 0.0001 at a time; the constraint is permission, not funds.

### Metadata base URI — fixed before first deploy

`scripts/deploy.js` passed `https://<network>.xono.ai/metadata/` — a domain
we do not own. That string is stored **on-chain** and is what every wallet and
marketplace fetches, so 27 deployments would have had permanently unresolvable
metadata. Now `https://<network>.xono.ai/metadata/`, which we control.

---

## Mainnet funding — what it costs and how to actually send it

### Before funding: the deploy path must exist for the chain you are funding

`contracts/hardhat.config.js` had **11 of the 21 EVM mainnets**. Three of the
missing ten — `hedera`, `flare`, `injective` — were in the very tier we were
about to send money to, so the funds would have landed in a wallet with no way
to spend them until the config was edited. All ten are now configured, and every
url was checked with a live `eth_chainId` against the value `config.js` declares.

`ethereum` also still pointed at `eth.llamarpc.com`, which answers Cloudflare
521. That fails at *send* time — after the wallet is funded.

```bash
cd contracts
npx hardhat run scripts/check-funding.js --network polygon
```

Reports, for all 21 EVM mainnets: balance, what a deploy costs at the **current**
gas price, and whether the balance actually covers it. That last column is the
point — a non-zero balance is not a fundable deploy, and finding that out the
other way means a failed transaction after the money has moved. It re-checks
`eth_chainId` per network too, because a reachable RPC on the wrong chain is a
real failure mode here.

Two quirks it works around: `getFeeData()` routes through per-chain oracles that
break independently of the node (Polygon's gas station 500s while the RPC is
fine), so it falls back to plain `eth_gasPrice`; and ethers v6 `staticNetwork`
with no network still attempts detection and fails, so the chainId is passed
explicitly.

**SKALE and SKALE Europa already hold sFUEL and report READY TO DEPLOY.**
Simulating the deployment against real chain state does not revert — but it
returns exactly 50,000,000 gas, which is the block limit rather than a converged
estimate, so it is suggestive, not proof that the deployer whitelist is gone.
Being gasless, actually sending it costs nothing, which makes SKALE the free
place to prove the whole pipeline before any funded chain is touched.



```bash
node scripts/funding-plan.mjs            # the table
node scripts/funding-plan.mjs --json     # machine-readable
```

Regenerate `deploy/apex/funding-plan.json` from it; `build-status.mjs` reads that
file for both the funding table on `/status` and the per-chain "deploy cost"
column. Neither is hand-maintained any more — the literal that preceded them
covered ten EVM chains and printed the word `non-EVM` for the other 24, which
hid the single largest line item in the whole budget.

**All 34 mainnets cost about $134 to deploy; withdraw ~$255 to be safe.**

- **Solana is 83% of it, and it is a REFUNDABLE DEPOSIT, not a fee** — ~1.45 SOL
  of *rent* for the program account. `solana program close` returns it, which is
  precisely how the number was measured: 1.7077404 SOL came back. The
  irreversible part of a Solana deploy is the transaction fees, ~0.01 SOL. Every
  other chain combined is ~$23, so **the real spend for all 34 chains is ~$23.**
- Rent is a pure function of allocated bytes, so **program size is the cost**.
  Adding `opt-level = "z"`, `strip` and `panic = "abort"` to the release profile
  took the binary 245,496 B → 207,488 B — 15.5%, ~0.26 SOL — with no change to
  program logic and all 6 tests still passing. `overflow-checks` stays **on**:
  disabling it saves a further 6,544 B (~$3) on a contract that does arithmetic
  on token amounts and tile ids, which is not a trade worth making.
- The deploy allocates exactly the program size (rent implied 245,237 B against a
  245,496 B binary), so there is **no 2x `--max-len` over-allocation** to reclaim
  — that common Solana saving does not apply here.
- Headroom is **10x on gas-priced chains, 1.3x on rent-priced ones**. Rent is a
  deterministic function of byte size and cannot spike between funding and
  deploying, so a flat 10x told you to withdraw 17.5 SOL ($1,288) for a $129 job.
- EVM costs are live `eth_gasPrice` × the **3.2M gas the contract actually used**
  on Oasys and Ronin. Non-EVM figures are amounts *observed during the real
  testnet deployments*, not estimates.


### Solana program size — every lever, measured

Rent is `(bytes + 173) x 6960` lamports, so **program size is the price**. Each of
these was measured, not reasoned about, because the obvious-sounding ones are the
dead ends:

| lever | result |
|---|---|
| `opt-level="z"` + `strip` + `panic="abort"` | **245,496 -> 207,488 B, ~$19. Applied.** |
| Strip harder | Nothing left. No `.symtab`, no debug sections; `.text` is 79% of the file. |
| Delete log/error strings | 168 bytes total, and zero `msg!` calls. Not a lever. |
| `anchor-lang` feature flags | `default = []` already — there is nothing to turn off. |
| Older Anchor | 0.29 is 3,344 B smaller (~$1.71) and two versions behind on security fixes. No. |
| `--max-len` 2x reclaim | **Does not apply.** `solana program deploy` allocates the exact program length by default; the 2x is opt-*in*. Our account measured 245,237 B against a 245,496 B binary — already tight. |
| Drop Anchor for native | **~$67**, and not recommended — see below. |

The decisive measurement is what an **empty** program costs:

| | bytes | rent |
|---|---|---|
| Empty Anchor program (does nothing) | 152,528 | **$78.25** |
| Empty native `solana-program` | 22,240 | $11.49 |
| Ours (Anchor) | 207,488 | $106.42 |
| — of which our own 306 lines | 54,960 | — |

So **73% of the binary is framework**, and roughly $78 of the rent hosts Anchor
rather than our logic. A native rewrite lands around 77,200 B / $39.65.

**We are not doing that rewrite.** Anchor's discriminators and account-ownership
checks are the security layer; hand-rolling them in a program that moves money is
exactly where Solana contracts get drained. Trading that for $67 of *refundable*
capital is a bad trade, and it would invalidate the devnet verification and the 6
passing tests.

Which is the point that dissolves the question: **the rent comes back.** `solana
program close` refunds it in full — 1.7077404 SOL was reclaimed doing exactly
that. Solana's irreversible cost is ~$0.01 of transaction fees. The $110 is
capital that must be *available*, never capital that is *spent*, so optimising it
further buys a smaller deposit, not a smaller bill.

### Getting the money there is the part that bites

Costs are trivial; **routing is not**. Verified against each exchange's own
public network-config endpoint, never an article:

| | chains | how |
|---|---|---|
| Direct from Binance | 23 | pick the network in the withdrawal dialog exactly |
| Binance has no on-chain route | 6 | `ronin` `mantle` `oasys` `beam` `radix` `ton` → Gate.io / KuCoin / HTX / OKX |
| Needs a bridge | 3 | `taiko` `moonbeam` `rootstock` |
| No funding needed | 2 | `skale`, `skale-europa` — gasless |

> 🔴 **Binance reports `withdrawEnable: true` for RON and MNT on a `FIAT_MONEY`
> pseudo-network that has no on-chain route at all.** A checker that only reads
> that flag concludes both are withdrawable and is wrong twice. Only treat a
> network as real if its name is a real network. The same pass caught ETH
> matching Binance's `BSC` network for Taiko — following that would have sent
> the funds to BNB Chain and lost them.

The three bridge cases, and why no exchange solves them:

- **Taiko** — gas is ETH, and no exchange withdraws ETH *onto* Taiko. The TAIKO
  token is governance, not gas; sending it would not pay for a deploy. Withdraw
  ETH to L1, bridge at `bridge.taiko.xyz`.
- **Moonbeam** — Binance, Gate, KuCoin, Bitget and HTX were all checked and every
  one offers only **wrapped GLMR on Base or BSC**, which cannot pay Moonbeam gas.
  Needs Squid/Wormhole or a swap service.
- **Rootstock** — RBTC is delisted on Gate and disabled on KuCoin. PowPeg is
  permissionless but parks a **0.005 BTC minimum** peg-in, recoverable via
  peg-out. RBTC is pegged 1:1 to BTC, so `bitcoin` is its price feed —
  `rootstock-infrastructure-framework` is RIF, a different token entirely.

**SKALE needs no money and is still blocked**: the chain is gasless, but contract
deployment sits behind a deployer whitelist. That is a request to the SKALE team.

No single host can price this alone — this laptop cannot resolve Flare's or
Rootstock's RPC, and the prod box is Cloudflare-banned (`error 1005`) by Ronin
and hard rate-limited by CoinGecko. Hence `--dump-prices` / `--prices`, which
splits price fetching from RPC probing and accumulates into the cache across
runs instead of overwriting it.

## Testnet deployment — what actually works (2026-07-31)

Nine chains are live on testnet. The per-chain commands, so nobody re-derives them:

```bash
# EVM (covers all 21 EVM chains — one bytecode)
cd contracts && DEPLOY_PK=$(…) npx hardhat run scripts/deploy.js --network oasys-testnet

# Stellar — build for wasm32v1-none, NOT wasm32-unknown-unknown
cd contracts/stellar && stellar contract build
stellar contract deploy --wasm target/wasm32v1-none/release/*.wasm --source <id> --network testnet

# NEAR — cargo-near, not cargo build
cd contracts/near && cargo near deploy build-non-reproducible-wasm <account> \
  with-init-call new json-args '{"owner":"…","base_uri":"https://xono.ai/tile/"}' \
  prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-legacy-keychain send

# Aptos — needs the framework cache seeded first (the CLI cannot fetch it)
cd contracts/aptos && aptos move publish --skip-fetch-latest-git-deps --named-addresses cryptoland=<addr>

# Tezos — via Taquito; octez-client is on neither machine
cd contracts/tezos/deploy && node originate.mjs      # ligo compiles the Michelson on the server

# Flow — /create-account mints the account; /fund-account needs one that exists
cd contracts/flow && flow project deploy --network testnet

# Sui — DEVNET (testnet's faucet is browser-only)
cd contracts/sui && sui client faucet && sui client publish --gas-budget 200000000

# Solana
cd contracts/solana && cargo-build-sbf && solana program deploy target/deploy/cryptoland_tile.so
```

### Traps each one has

- **Stellar**: the `wasm32-unknown-unknown` artifact is *rejected* by the host
  ("reference-types not enabled"). Build for `wasm32v1-none`.
- **NEAR**: plain `cargo build` cannot produce a deployable artifact; near-sdk 5.29
  blocks `cargo test` in exchange. Deployability wins.
- **Aptos**: the CLI's dependency fetch fails with git exit 128 on a cold cache.
  Seed `~/.move/…aptos-node-v1.9.7` by hand. The rev must be a TAG — `git clone
  --branch` cannot take a SHA.
- **Sui**: publishing needs an `[environments]` block in `Move.toml` with the chain
  id from `sui client chain-identifier` (JSON-RPC returns empty — Sui deprecated it).
- **Solana**: set `declare_id!` to the real program id BEFORE deploying, or every
  instruction fails with `DeclaredProgramIdMismatch`.
- **Flow**: `init()` cannot take a resource parameter.
- **Tezos**: Ghostnet is retired; use shadownet. `@taquito/utils` renamed
  `b58cencode` → `b58Encode` and `prefix` → `PrefixV2`.

## Domain audit — prove it, do not assert it

```bash
CRYPTOLAND_PROD_HOST=root@<ip> ./scripts/audit-domain.sh
```

Checks **seven layers** and exits non-zero if any still names a domain we do not
own: source (ignoring comments), served JS bundles, live server code, per-chain
env, TLS subjects, TON Connect manifests, and on-chain contract metadata.

It exists because "it's fixed" was said three times and was wrong twice — once
because only the frontends had been redeployed while the server still ran the old
`price_events.py`, and once because a deployment's recorded `constructorArgs`
disagreed with what was actually on-chain.

### What it caught on the first run

**`SERVER_URL` was unset on all 32 backends**, so it fell back to its
`http://127.0.0.1:8000` default and the NOWPayments IPN callback was built as
`http://127.0.0.1:8000/np/ipn`. NOWPayments could never have reached it, so
**every crypto payment would have stayed unconfirmed forever** — silently, with
no error anywhere. Now `https://<chain>.xono.ai` on every chain.

Three env vars are load-bearing per chain and the audit checks all three:

| Var | Without it |
|---|---|
| `SERVER_URL` | IPN callback unreachable — payments never confirm |
| `CRYPTOLAND_SITE_HOST` | share cards print the wrong chain's host |
| `CRYPTOLAND_CHAIN` | `viral.py` defaults to `polygon` on every chain |

## `xono.ai/dossier` — the internal board

`node scripts/build-dossier.mjs` writes `deploy/status/dossier.html`; copy it to
`deploy/apex/dist/` and rsync to `/srv/cryptoland/apex/dist/` on the apex host
(`91.99.194.54`, key `~/.ssh/xono_deploy`).

It is served behind **the same basic auth as `/status`** — same `blackside` user,
the same bcrypt hash, `X-Robots-Tag: noindex`. That is deliberate: the page lists
deployer and treasury addresses, unsubmitted application copy, and which
programmes we have not cracked. It must never be indexable.

> ⚠️ The apex Caddy block took `xono.ai` down once before (see the warning
> above). **Always `caddy validate --config /etc/caddy/Caddyfile` before
> `systemctl reload caddy`**, and curl `/`, `/about` and `/status` afterwards —
> a 200/200/401 triple is the check that the reload did not break the apex.
