#!/usr/bin/env bash
# push.sh — sync the staged 27-chain deployment to the server and start it.
# Run from the repo root AFTER: CRYPTOLAND_DOMAIN=xono.ai ./scripts/deploy-chain.sh all --seed
#
#   HOST=root@<your-server-ip> ./deploy/server/push.sh
set -euo pipefail

HOST="${HOST:?set HOST=root@<ip>}"
KEY="${KEY:-$HOME/.ssh/xono_deploy}"
SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$HOST")
RSYNC_RSH="ssh -i $KEY -o StrictHostKeyChecking=accept-new"

# Keep in step with scripts/deploy-chain.sh — this list was 27 while the server
# ran 32 instances, so five chains silently kept stale bundles on every push.
CHAINS=(polygon avalanche base arbitrum ronin bnb optimism scroll celo moonbeam
        beam oasys skale hedera injective solana ton aptos sui starknet cardano
        near stellar algorand multiversx radix tezos
        mantle taiko rootstock flare flow)

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

  # Update ONLY the two variables this script owns, and leave every other line
  # alone. This used to be `printf … > env`, which truncated the file — silently
  # dropping SERVER_URL (so NOWPayments IPN callbacks went to 127.0.0.1 and no
  # payment ever confirmed), CRYPTOLAND_CHAIN, CRYPTOLAND_SITE_HOST, and now the
  # CRYPTOLAND_TREASURY_* that native wallet payment needs. A deploy must not
  # turn features off.
  "${SSH[@]}" "
    set -eu
    env_file=/srv/cryptoland/$c/env
    touch \"\$env_file\"
    tmp=\$(mktemp)
    grep -vE '^(PORT|ALLOWED_ORIGINS)=' \"\$env_file\" > \"\$tmp\" || true
    {
      printf 'PORT=%s\n' '$port'
      printf 'ALLOWED_ORIGINS=https://%s.\${CRYPTOLAND_DOMAIN:-xono.ai}\n' '$c'
      cat \"\$tmp\"
    } > \"\$env_file\"
    rm -f \"\$tmp\"
  "
  printf "  ✓ %-12s :%s\n" "$c" "$port"
done

echo "── apex landing page ────────────────────────────────"
if [[ -f deploy/apex/dist/index.html ]]; then
  "${SSH[@]}" "mkdir -p /srv/cryptoland/apex/dist"
  rsync -az -e "$RSYNC_RSH" deploy/apex/dist/ "$HOST:/srv/cryptoland/apex/dist/"
  echo "  ✓ apex"
else
  echo "  · no apex build (run: node deploy/apex/build-apex.mjs)"
fi

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
