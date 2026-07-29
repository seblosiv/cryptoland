#!/usr/bin/env bash
# ============================================================================
# deploy-chain.sh — build, seed and stage one chain-native deployment
# ============================================================================
# Produces everything a single chain's subdomain needs:
#
#   ./scripts/deploy-chain.sh algorand                 # build + stage
#   ./scripts/deploy-chain.sh algorand --seed          # + seed its world
#   ./scripts/deploy-chain.sh all --seed               # every chain
#
# Layout it creates (under deploy/out/):
#   deploy/out/<chain>/dist/        the static bundle to serve
#   deploy/out/<chain>/<chain>.db   that chain's database (if --seed)
#   deploy/out/nginx/<chain>.conf   a ready server block for that subdomain
#
# Each chain is its OWN world: its own bundle, its own database, its own
# subdomain. Nothing is shared, so one chain can never show another's tiles.
# ----------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/.."

DOMAIN="${CRYPTOLAND_DOMAIN:-cryptoland.game}"
API_HOST="${CRYPTOLAND_API_HOST:-}"          # e.g. api.cryptoland.game (optional)
OUT="deploy/out"
SEED=0
USERS="${CRYPTOLAND_SEED_USERS:-120}"

CHAINS=(
  polygon avalanche base arbitrum ronin bnb optimism scroll celo moonbeam
  beam oasys skale hedera injective
  solana ton aptos sui starknet cardano near stellar algorand multiversx
  radix tezos
)

for arg in "$@"; do [[ "$arg" == "--seed" ]] && SEED=1; done

stage_one() {
  local chain="$1"
  local envfile="env/.env.$chain"
  [[ -f "$envfile" ]] || { echo "✗ no env template for '$chain'" >&2; return 1; }

  echo "── $chain ─────────────────────────────────────────────"
  mkdir -p "$OUT/$chain" "$OUT/nginx"

  # 1. Build the chain-native bundle.
  #    VITE_SCOPE_TO_CHAIN is set because each deployment may point at a shared
  #    backend; with its own DB it is harmless.
  cp "$envfile" .env.production
  {
    echo "VITE_SCOPE_TO_CHAIN=1"
    [[ -n "$API_HOST" ]] && echo "VITE_API_BASE=https://$API_HOST"
  } >> .env.production
  npx vite build --outDir "$OUT/$chain/dist" >/dev/null
  echo "  ✓ bundle  -> $OUT/$chain/dist"

  # 2. Seed that chain's world so the map is never empty on launch.
  if [[ "$SEED" == "1" ]]; then
    local db="$OUT/$chain/$chain.db"
    if [[ ! -f "$db" ]]; then
      CRYPTOLAND_DB="$(pwd)/$db" python3 - <<'PY'
import os, sys
sys.path.insert(0, "server")
# Importing main creates the schema via its startup migrations.
os.environ.setdefault("ALLOW_UNSIGNED_WALLET_AUTH", "1")
import sqlite3
from pathlib import Path
db = Path(os.environ["CRYPTOLAND_DB"]); db.parent.mkdir(parents=True, exist_ok=True)
# Copy the schema (not the data) from the dev database.
src = Path("server/cryptoland.db")
con = sqlite3.connect(db)
if src.exists():
    s = sqlite3.connect(src)
    for (sql,) in s.execute("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL"):
        try: con.execute(sql)
        except sqlite3.Error: pass
    con.commit()
PY
    fi
    python3 server/seed_chain.py --chain "$chain" --db "$db" --users "$USERS" --reset | sed 's/^/  /'
  fi

  # 3. Emit an nginx server block for this subdomain, with a per-chain backend
  #    port so each chain's uvicorn (and therefore its DB) stays isolated.
  local port; port=$(chain_port "$chain")
  sed -e "s/{{CHAIN}}/$chain/g" -e "s/{{DOMAIN}}/$DOMAIN/g" -e "s/{{PORT}}/$port/g" \
      deploy/nginx.conf.template > "$OUT/nginx/$chain.conf"
  echo "  ✓ nginx   -> $OUT/nginx/$chain.conf  ($chain.$DOMAIN → :$port)"

  # 4. Write this chain's block into the Caddyfile (simpler alternative to
  #    nginx: automatic HTTPS for all 27 subdomains with no certbot step).
  #
  #    Rewritten per chain, not appended. Appending meant a second run — or a
  #    run under a different CRYPTOLAND_DOMAIN — left the previous site blocks
  #    in place, so the file ended up with several `algorand.*` addresses.
  #    Caddy refuses to start on a duplicate site address, and a stale block
  #    for the old domain is worse than none.
  local caddy="$OUT/Caddyfile"
  if [[ -f "$caddy" ]]; then
    # Drop any existing block for this chain, on ANY domain: from its site line
    # up to the closing brace in column 1.
    awk -v chain="$chain" '
      $0 ~ "^"chain"\\.[^ ]+ \\{$" { skip = 1 }
      skip && /^\}$/                  { skip = 0; next }
      !skip                            { print }
    ' "$caddy" > "$caddy.tmp" && mv "$caddy.tmp" "$caddy"
    # Removing a block leaves its separator behind; collapse runs of blank
    # lines and any leading ones so repeated runs don't grow whitespace.
    awk 'BEGIN{blank=1} /^$/{if(blank)next; blank=1; print; next} {blank=0; print}' \
      "$caddy" > "$caddy.tmp" && mv "$caddy.tmp" "$caddy"
  fi

  cat >> "$caddy" <<EOF
$chain.$DOMAIN {
    root * /srv/cryptoland/$chain/dist
    handle /tonconnect-manifest.json {
        header Access-Control-Allow-Origin "*"
        file_server
    }
    @api path /blocks* /stats* /health* /metrics* /np* /auth* /account* /sessions* /affiliate* /users* /guardian* /guardians* /price-events* /tile-price-context* /nft* /marketplace* /analytics* /dao* /token* /feed* /streak* /share* /empire* /search* /agents* /squads* /drop* /news* /alerts* /t/* /og*
    handle @api {
        reverse_proxy 127.0.0.1:$port
    }
    handle {
        try_files {path} /index.html
        file_server
    }
    encode gzip zstd
}

EOF
}

# Stable, collision-free backend port per chain (9000 + index).
chain_port() {
  local i=0
  for c in "${CHAINS[@]}"; do
    [[ "$c" == "$1" ]] && { echo $((9000 + i)); return; }
    i=$((i + 1))
  done
  echo 9000
}

# The apex (xono.ai / www) is not a chain, but it must live in the same
# Caddyfile — push.sh copies that file wholesale, so an apex block added by hand
# on the server is silently destroyed by the next deploy. Emit it here instead.
stage_apex() {
  local caddy="$OUT/Caddyfile"
  grep -q "^$DOMAIN, www.$DOMAIN {" "$caddy" 2>/dev/null && return 0
  mkdir -p "$OUT"
  cat > "$caddy.apex" <<EOF
$DOMAIN, www.$DOMAIN {
    root * /srv/cryptoland/apex/dist
    file_server
    handle_errors {
        rewrite * /index.html
        file_server
    }
}

EOF
  cat "$caddy.apex" "$caddy" > "$caddy.new" 2>/dev/null || cp "$caddy.apex" "$caddy.new"
  mv "$caddy.new" "$caddy"; rm -f "$caddy.apex"
  echo "  ✓ caddy   -> apex block for $DOMAIN"
}

if [[ "${1:-}" == "all" ]]; then
  for c in "${CHAINS[@]}"; do stage_one "$c"; done
  stage_apex
  echo
  echo "✓ staged ${#CHAINS[@]} chains under $OUT/"
  echo "  serve  <chain>.$DOMAIN  from  $OUT/<chain>/dist"
elif [[ -n "${1:-}" && "${1:-}" != --* ]]; then
  stage_one "$1"
else
  echo "usage: $0 <chain|all> [--seed]" >&2
  echo "chains: ${CHAINS[*]}" >&2
  exit 1
fi
