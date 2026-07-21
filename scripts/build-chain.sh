#!/usr/bin/env bash
# ============================================================================
# build-chain.sh — build a chain-native CryptoLand bundle
# ============================================================================
# One codebase → N chain-native deployments. This builds the frontend for a
# single target chain, emitting to dist-<chain>/ so builds don't overwrite each
# other.
#
#   ./scripts/build-chain.sh base
#   ./scripts/build-chain.sh solana
#   ./scripts/build-chain.sh all         # build every grant chain
#
# Per-chain contract addresses come from env/.env.<chain> (fill them in after
# deploying each chain's contract). Until then the build still works — ownership
# is DB-backed and the on-chain mint is skipped.
# ----------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/.."

CHAINS=(ton polygon avalanche ronin base arbitrum solana bnb aptos sui)

build_one() {
  local chain="$1"
  local envfile="env/.env.$chain"
  if [[ ! -f "$envfile" ]]; then
    echo "✗ no env template for '$chain' (expected $envfile)" >&2
    return 1
  fi
  echo "── building $chain ────────────────────────────────────────────"
  # Vite reads .env.production for a production build; stage the chain's file.
  cp "$envfile" .env.production
  VITE_OUT_DIR="dist-$chain" npx vite build --outDir "dist-$chain"
  echo "✓ $chain → dist-$chain/"
}

if [[ "${1:-}" == "all" ]]; then
  for c in "${CHAINS[@]}"; do build_one "$c"; done
  echo "✓ all ${#CHAINS[@]} chain builds complete"
elif [[ -n "${1:-}" ]]; then
  build_one "$1"
else
  echo "usage: $0 <chain|all>   (chains: ${CHAINS[*]})" >&2
  exit 1
fi
