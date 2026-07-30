# Contributing

## Before you start

Read [`CLAUDE.md`](CLAUDE.md). It is the operating manual — critical rules, the
security invariants in §4, and current state. A change that violates §4 will not be
merged regardless of how good it looks.

## The rules that matter most

1. **`npm test` must pass.** 250 frontend tests plus 34 on the Solidity contract.
   A new chain is not done until `chains.test.js` passes — it parses every adapter
   and fails on a missing export.
2. **The tokenId encoding is sacred.** `(tx << 15) | ty` on every chain, in every
   language. Chains whose language has no shift operator use `(tx * 32768) + ty`,
   which is identical only because `ty < 2^15`. If you touch this, prove it against
   `(16383, 16383) → 536854527`.
3. **No glassmorphism.** `grep -rnE "backdropFilter\s*:" src/` must stay empty. The
   UI is solid dark; see [`documentation/styling.md`](documentation/styling.md).
4. **Update `documentation/` in the same change.** A code change without the
   matching doc update is incomplete.
5. **Never commit secrets or databases.** Run `git diff --cached --name-only` before
   committing and confirm no `.env`, no `*.db`.

## Contracts

Do not add a contract you cannot compile. Install the toolchain first — that is why
some chains are done and others are marked written-but-unverified in
[`contracts/README.md`](contracts/README.md). An unverified contract that holds
asset ownership is worse than no contract.

## Research

All research goes through the self-hosted SearXNG instance, never a general web
search. See §0 of `CLAUDE.md`. This applies to any tooling you add too.

## Commit messages

Explain **why**, not what — the diff already says what. If you fixed a bug, say what
it broke and how it was found.
