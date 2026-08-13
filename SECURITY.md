# Security Policy

## Reporting a vulnerability

Email **hello@xono.ai** with `SECURITY` in the subject. Please do **not** open
a public issue for anything affecting funds or tile ownership.

Include what you can: affected contract or endpoint, chain, a reproduction, and the
impact you believe it has. A first response should come within 72 hours.

## Scope

**In scope**

- `contracts/` — the tile contracts on any chain we have deployed
- `server/` — the API, especially payment finalisation and authentication
- The per-chain deployments at `<chain>.xono.ai`

**Out of scope**

- Seeded demo data. Every deployment ships a generated world; that is disclosed on
  `/ecosystem` and is not a vulnerability.
- Public RPC endpoints we do not operate.
- Rate limits on third-party services.

## Invariants we consider security-critical

These are the things worth attacking, and the things we most want to hear about:

1. **A tile has exactly one owner, forever.** No admin path may transfer, burn or
   reclaim a sold tile. There is deliberately no such function.
2. **`token_id = (tx << 15) | ty`** must be identical on every chain. A chain that
   encodes differently silently breaks cross-chain identity.
3. **The treasury may only be withdrawn by the owner**, and only to
   `treasuryReceiver`.
4. **`MAX_FEE_BPS = 1000`** — the resale fee cannot exceed 10%, even by the owner.
   A compromised owner key must not be able to confiscate a sale.
5. **Payment binding.** `POST /np/finalize` binds a payment to one tile and one
   amount, and is single-use.
6. **Wallet auth nonces are single-use**, and deleted regardless of downstream
   success.

## What is deployed

Contract addresses per chain are published at https://xono.ai/status. Treat any
address not listed there as unaffiliated.

## Known limitations, stated up front

- **No third-party audit yet.** The contracts have tests (34 on the Solidity one,
  including a reentrancy attacker) but no professional audit. Funding one is the
  second milestone in `documentation/milestones-budget.md`.
- **Seeded worlds are demo data**, disclosed on every `/ecosystem` page.
