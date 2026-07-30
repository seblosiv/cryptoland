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
| `CRYPTOLAND_DOMAIN` | `cryptoland.game` | apex domain for the subdomains, e.g. `CRYPTOLAND_DOMAIN=xono.ai` → `algorand.xono.ai` |
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
certbot --nginx -d algorand.cryptoland.game
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
algorand.cryptoland.game → "CryptoLand on Algorand — Own the World"
skale.cryptoland.game    → "CryptoLand on SKALE Nebula Gaming Hub — …"
ton.cryptoland.game      → "CryptoLand on TON — Own the World"
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

`scripts/deploy.js` passed `https://api.cryptoland.io/metadata/<network>/` — a domain
we do not own. That string is stored **on-chain** and is what every wallet and
marketplace fetches, so 27 deployments would have had permanently unresolvable
metadata. Now `https://<network>.xono.ai/metadata/`, which we control.
