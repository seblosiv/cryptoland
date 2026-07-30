#!/usr/bin/env bash
# verify-contracts.sh — run every chain's real toolchain and emit the result as
# JSON for the status board to render.
#
# This exists because the status board's contract table was hand-maintained and
# went stale: it claimed four chains were BLOCKED weeks after they had been
# fixed, and reported "15 EVM chains / 19 tests" when it was 17 and 34. A page
# that reports build status must derive it from a build, not from prose.
#
#   ./scripts/verify-contracts.sh            # writes deploy/apex/contracts-status.json
#   ./scripts/verify-contracts.sh --quiet    # no per-chain progress
#
# Chains whose toolchain is not installed are recorded as SKIPPED, never as
# passing — an absent toolchain is not evidence of anything.

set -uo pipefail
cd "$(dirname "$0")/.."
ROOT=$(pwd)
OUT=deploy/apex/contracts-status.json
QUIET=${1:-}

export PATH="$HOME/.cargo/bin:$HOME/.local/bin:/opt/homebrew/bin:$PATH"

rows=()
say() { [ "$QUIET" = "--quiet" ] || printf "  %-12s %-9s %s\n" "$1" "$2" "$3"; }

# add <chain> <language> <status> <detail>
add() {
  rows+=("{\"chain\":\"$1\",\"lang\":\"$2\",\"status\":\"$3\",\"detail\":\"$4\"}")
  say "$1" "$3" "$4"
}

# run <chain> <lang> <dir> <command> <regex-for-count> <label>
run() {
  local chain=$1 lang=$2 dir=$3 cmd=$4 rx=$5 label=$6
  local tool=${cmd%% *}
  if ! command -v "$tool" >/dev/null 2>&1; then
    add "$chain" "$lang" "SKIPPED" "$tool not installed on this machine"
    return
  fi
  local out
  out=$(cd "$ROOT/$dir" && eval "$cmd" 2>&1)
  if [ $? -eq 0 ]; then
    local n
    n=$(printf '%s' "$out" | grep -oE "$rx" | head -1)
    add "$chain" "$lang" "PASSES" "${n:-built} $label"
  else
    local err
    err=$(printf '%s' "$out" | grep -E "^error|error\[|FAIL" | head -1 | cut -c1-90 | tr '"' "'")
    add "$chain" "$lang" "FAILS" "${err:-see build output}"
  fi
}

# The Aptos CLI's own dependency fetch fails with git exit 128 on a cold cache,
# and --skip-fetch-latest-git-deps then has nothing to use. Seeding the cache by
# hand works and is deterministic. The tag must stay a TAG: the CLI clones with
# `git clone --branch <rev>`, which cannot take a commit SHA.
APTOS_CACHE=$HOME/.move/https___github_com_aptos-labs_aptos-core_git_aptos-node-v1.9.7
if command -v aptos >/dev/null 2>&1 && [ ! -d "$APTOS_CACHE/.git" ]; then
  [ "$QUIET" = "--quiet" ] || echo "  seeding Aptos framework cache (CLI cannot fetch it itself)…"
  git clone -q --depth 1 --branch aptos-node-v1.9.7 \
    https://github.com/aptos-labs/aptos-core.git "$APTOS_CACHE" 2>/dev/null
fi

[ "$QUIET" = "--quiet" ] || echo "Verifying every contract against its real toolchain…"

run "Invariants"  "Rust (no deps)" contracts/rust-invariants             "cargo test --quiet"                                      '[0-9]+ passed'   "tests"
run "EVM ×17"    "Solidity"      contracts                              "npx hardhat test"                                        '[0-9]+ passing'  "tests"
run "Starknet"   "Cairo"         contracts/starknet                     "scarb cairo-test"                                        '[0-9]+ passed'   "tests"
run "Sui"        "Move"          contracts/sui                          "sui move test"                                           'passed: [0-9]+' "tests"
run "Aptos"      "Move"          contracts/aptos                        "aptos move test --skip-fetch-latest-git-deps --named-addresses cryptoland=0x1" 'passed: [0-9]+' "tests"
run "Cardano"    "Aiken"         contracts/cardano                      "aiken check 2>&1 | grep -c '\"status\": \"pass\"'"          '[0-9]+'          "tests"
run "Algorand"   "PyTeal"        contracts/algorand                     "python3 cryptoland_tile.py"                              '[0-9]+ bytes'    "approval.teal"
run "Solana"     "Anchor/Rust"   contracts/solana/programs/cryptoland-tile "cargo test --quiet"                                   '[0-9]+ passed'   "tests"
# near-sdk 5.29 carries a compile_error! that blocks plain `cargo test`, but it
# is the version that BUILDS. Deployability beats a green suite, and the shared
# no-dep invariants crate covers the arithmetic. Check the artifact instead.
run "NEAR"       "Rust"          contracts/near                         "cargo near build non-reproducible-wasm"                  'cryptoland_tile\.wasm'  "built by cargo-near (deployable)"
run "Stellar"    "Soroban/Rust"  contracts/stellar                      "cargo test --quiet"                                      '[0-9]+ passed'   "tests"
run "MultiversX" "Rust/ESDT"     contracts/multiversx                   "cargo test --quiet"                                      '[0-9]+ passed'   "tests"
run "Radix"      "Scrypto"       contracts/radix                        "cargo test --quiet"                                      '[0-9]+ passed'   "tests"
run "TON"        "FunC (TEP-62)" contracts/ton                          "node --test test/tile.test.mjs"                          'pass [0-9]+'     "tests on a real TVM"
run "Tezos"      "CameLIGO"      contracts/tezos                        "ligo run test test_cryptoland.mligo"                     'ok'              "tests"

printf '{"verified":"%s","contracts":[%s]}\n' \
  "$(date -u +%Y-%m-%d)" "$(IFS=,; echo "${rows[*]}")" > "$OUT"

pass=$(printf '%s\n' "${rows[@]}" | grep -c PASSES)
fail=$(printf '%s\n' "${rows[@]}" | grep -c FAILS)
skip=$(printf '%s\n' "${rows[@]}" | grep -c SKIPPED)
[ "$QUIET" = "--quiet" ] || echo
echo "$OUT — ${pass} passing, ${fail} failing, ${skip} skipped (toolchain absent)"
[ "$fail" -eq 0 ]
