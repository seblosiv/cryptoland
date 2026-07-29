#!/usr/bin/env bash
# push.sh — sync the staged 27-chain deployment to the server and start it.
# Run from the repo root AFTER: CRYPTOLAND_DOMAIN=xono.ai ./scripts/deploy-chain.sh all --seed
#
#   HOST=root@91.99.194.54 ./deploy/server/push.sh
set -euo pipefail

HOST="${HOST:?set HOST=root@<ip>}"
KEY="${KEY:-$HOME/.ssh/xono_deploy}"
SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$HOST")
RSYNC_RSH="ssh -i $KEY -o StrictHostKeyChecking=accept-new"

CHAINS=(polygon avalanche base arbitrum ronin bnb optimism scroll celo moonbeam
        beam oasys skale hedera injective solana ton aptos sui starknet cardano
        near stellar algorand multiversx radix tezos)

[[ -d deploy/out ]] || { echo "✗ deploy/out missing — run deploy-chain.sh first" >&2; exit 1; }

echo "── app code + venv ──────────────────────────────────"
rsync -az --delete -e "$RSYNC_RSH" \
  --exclude '__pycache__' --exclude '*.db' --exclude '.env' \
  server/ "$HOST:/srv/cryptoland/app/server/"

"${SSH[@]}" bash -s <<'REMOTE'
set -euo pipefail
if [[ ! -x /srv/cryptoland/venv/bin/python ]]; then
  python3 -m venv /srv/cryptoland/venv
fi
/srv/cryptoland/venv/bin/pip install -q --upgrade pip
/srv/cryptoland/venv/bin/pip install -q -r /srv/cryptoland/app/server/requirements.txt
REMOTE

echo "── per-chain bundles, DBs and env ───────────────────"
i=0
for c in "${CHAINS[@]}"; do
  port=$((9000 + i)); i=$((i + 1))
  [[ -d "deploy/out/$c/dist" ]] || { echo "  ✗ $c not staged"; continue; }

  "${SSH[@]}" "mkdir -p /srv/cryptoland/$c"
  rsync -az --delete -e "$RSYNC_RSH" "deploy/out/$c/dist/" "$HOST:/srv/cryptoland/$c/dist/"

  # Seed DB only if this chain has no database yet — NEVER clobber live data.
  if ! "${SSH[@]}" "test -f /srv/cryptoland/$c/$c.db"; then
    [[ -f "deploy/out/$c/$c.db" ]] && \
      rsync -az -e "$RSYNC_RSH" "deploy/out/$c/$c.db" "$HOST:/srv/cryptoland/$c/$c.db"
  else
    echo "  · $c: db exists, left untouched"
  fi

  "${SSH[@]}" "printf 'PORT=%s\nALLOWED_ORIGINS=https://%s.\${CRYPTOLAND_DOMAIN:-xono.ai}\n' $port $c > /srv/cryptoland/$c/env"
  printf "  ✓ %-12s :%s\n" "$c" "$port"
done

echo "── caddy + systemd ──────────────────────────────────"
rsync -az -e "$RSYNC_RSH" deploy/out/Caddyfile "$HOST:/etc/caddy/Caddyfile"
rsync -az -e "$RSYNC_RSH" deploy/server/cryptoland@.service "$HOST:/etc/systemd/system/cryptoland@.service"

"${SSH[@]}" bash -s <<REMOTE
set -euo pipefail
chown -R cryptoland:cryptoland /srv/cryptoland
systemctl daemon-reload
for c in ${CHAINS[@]}; do systemctl enable --now "cryptoland@\$c" >/dev/null 2>&1 || true; done
caddy validate --config /etc/caddy/Caddyfile >/dev/null && systemctl reload caddy
echo
echo "running: \$(systemctl list-units 'cryptoland@*' --state=running --no-legend | wc -l)/27"
free -h | head -2
REMOTE
