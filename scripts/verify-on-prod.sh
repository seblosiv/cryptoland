#!/usr/bin/env bash
# verify-on-prod.sh — run the contract verification where ALL toolchains exist.
#
# The laptop is macOS ARM; ligo ships a Linux-only binary, so Tezos could never
# be verified there and showed as SKIPPED. The prod box is aarch64 Linux and has
# every toolchain, so it is the canonical host: 14 passing, 0 skipped.
#
# Toolchains installed there: node/hardhat, cargo + cargo-near, scarb, sui,
# aptos, aiken (built from source — no aarch64-linux binary is published),
# ligo, pyteal, func-js.
#
# NOTE: /tmp on that box is a 1.9 GB tmpfs. Cargo builds MUST set
# CARGO_TARGET_DIR to a disk path or they fail with "No space left on device"
# after silently truncating downloads.
set -euo pipefail
cd "$(dirname "$0")/.."
# Not hardcoded: this file is public, and pointing strangers at the box that
# holds the payment credentials and every chain's database is free reconnaissance
# they should have to do themselves.
#   export CRYPTOLAND_PROD_HOST=root@<ip>
HOST=${CRYPTOLAND_PROD_HOST:?set CRYPTOLAND_PROD_HOST, e.g. root@203.0.113.10}
KEY=${CRYPTOLAND_PROD_KEY:-$HOME/.ssh/xono_deploy}
SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o BatchMode=yes)

echo "→ syncing sources"
rsync -az -e "${SSH[*]}" \
  --exclude node_modules --exclude target --exclude build --exclude .git \
  --exclude dist --exclude 'dist-*' --exclude '.aptos' --exclude '*.db' --exclude '.env*' \
  --relative ./contracts ./scripts ./deploy/apex ./package.json \
  "$HOST:/srv/cryptoland/verify/"

echo "→ verifying (detached; 2 cores, allow ~2 min)"
"${SSH[@]}" "$HOST" 'cd /srv/cryptoland/verify && setsid nohup env PATH=$HOME/.cargo/bin:$HOME/.local/bin:$PATH \
  ./scripts/verify-contracts.sh > /root/verify.log 2>&1 < /dev/null & sleep 2'

for _ in $(seq 1 40); do
  sleep 15
  if "${SSH[@]}" "$HOST" 'grep -q contracts-status.json /root/verify.log' 2>/dev/null; then break; fi
done

"${SSH[@]}" "$HOST" 'tail -20 /root/verify.log'
scp -q -i "$KEY" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  "$HOST:/srv/cryptoland/verify/deploy/apex/contracts-status.json" deploy/apex/contracts-status.json
echo "→ pulled deploy/apex/contracts-status.json"
