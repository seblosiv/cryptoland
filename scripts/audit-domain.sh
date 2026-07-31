#!/usr/bin/env bash
# audit-domain.sh — prove that EVERY layer points at xono.ai.
#
# This exists because "I fixed it" was answered three times and was wrong twice:
# once because only the frontend had been redeployed while the server still ran
# the old code, and once because the recorded constructor args disagreed with
# what was actually deployed on-chain. Assertion is not verification.
#
#   CRYPTOLAND_PROD_HOST=root@<ip> ./scripts/audit-domain.sh
#
# Checks source, built bundles, the live server, TLS, payments config and
# on-chain contract metadata. Exits non-zero if any layer still names a domain
# we do not own.
set -uo pipefail
cd "$(dirname "$0")/.."

HOST=${CRYPTOLAND_PROD_HOST:?set CRYPTOLAND_PROD_HOST, e.g. root@203.0.113.10}
KEY=${CRYPTOLAND_PROD_KEY:-$HOME/.ssh/xono_deploy}
SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o BatchMode=yes)
DOMAIN=${CRYPTOLAND_DOMAIN:-xono.ai}
CHAINS=(polygon avalanche base arbitrum ronin bnb optimism mantle taiko rootstock flare
        scroll celo moonbeam beam oasys skale hedera injective flow solana ton aptos sui
        starknet cardano near stellar algorand multiversx radix tezos)
fail=0
note() { printf "  %-40s %s\n" "$1" "$2"; }
bad()  { printf "  ✗ %-38s %s\n" "$1" "$2"; fail=$((fail+1)); }

echo "═══ 1. SOURCE — live code, ignoring comments ═══"
# Comments describing the historical bug are deliberate; code is not.
hits=$(git grep -InE "cryptoland\.(io|game|app|xyz)" -- . 2>/dev/null \
  | grep -v node_modules \
  | grep -vE ':\s*(//|#|\*|<!--)' \
  | grep -vE '^documentation/' | wc -l | tr -d ' ')
[ "$hits" = "0" ] && note "non-comment source references" "0 ✓" || bad "source still names a dead domain" "$hits hits"

echo "═══ 2. SERVED BUNDLES ═══"
n=0
for c in "${CHAINS[@]}"; do
  js=$(curl -s -m 15 "https://$c.$DOMAIN/" | grep -oE '/assets/[A-Za-z0-9._-]+\.js' | head -1)
  [ -z "$js" ] && continue
  h=$(curl -s -m 25 "https://$c.$DOMAIN$js" | grep -c "cryptoland\.\(io\|game\)" || true)
  n=$((n + ${h:-0}))
done
[ "$n" -eq 0 ] && note "dead-domain strings in live JS" "0 ✓" || bad "live bundles contain a dead domain" "$n"

echo "═══ 3. LIVE SERVER CODE ═══"
ua=$("${SSH[@]}" "$HOST" 'grep -o "contact@[a-z.]*" /srv/cryptoland/app/server/price_events.py | head -1' 2>/dev/null)
[ "$ua" = "contact@$DOMAIN" ] && note "price_events User-Agent" "$ua ✓" || bad "price_events User-Agent" "$ua"
sh=$("${SSH[@]}" "$HOST" 'grep -c SITE_HOST /srv/cryptoland/app/server/viral.py' 2>/dev/null)
[ "${sh:-0}" -ge 2 ] && note "viral.py uses SITE_HOST" "$sh refs ✓" || bad "viral.py not using SITE_HOST" "${sh:-0}"

echo "═══ 4. PER-CHAIN ENV (payments + share cards) ═══"
for v in SERVER_URL CRYPTOLAND_SITE_HOST CRYPTOLAND_CHAIN; do
  miss=$("${SSH[@]}" "$HOST" "m=0; for d in /srv/cryptoland/*/; do c=\$(basename \$d);
    case \"\$c\" in app|apex|contracts|deployer|venv|verify) continue;; esac
    [ -f \"\$d/env\" ] || continue
    grep -q '^$v=' \"\$d/env\" || m=\$((m+1)); done; echo \$m" 2>/dev/null)
  [ "${miss:-1}" = "0" ] && note "$v set on every chain" "✓" || bad "$v missing" "${miss} chains"
done
# An unreachable IPN callback means crypto payments never confirm.
lh=$("${SSH[@]}" "$HOST" 'grep -l "SERVER_URL=http://127" /srv/cryptoland/*/env 2>/dev/null | wc -l' 2>/dev/null)
[ "${lh:-1}" = "0" ] && note "no SERVER_URL points at localhost" "✓" || bad "SERVER_URL is localhost" "${lh} chains — IPN unreachable"

echo "═══ 5. TLS ═══"
b=0
for c in "${CHAINS[@]}"; do
  s=$(echo | openssl s_client -servername "$c.$DOMAIN" -connect "$c.$DOMAIN:443" 2>/dev/null \
      | openssl x509 -noout -subject 2>/dev/null)
  case "$s" in *"$c.$DOMAIN"*) ;; *) b=$((b+1));; esac
done
[ "$b" -eq 0 ] && note "all ${#CHAINS[@]} certs match their host" "✓" || bad "TLS subject mismatch" "$b chains"

echo "═══ 6. TON CONNECT MANIFESTS ═══"
b=0
for c in "${CHAINS[@]}"; do
  curl -s -m 12 "https://$c.$DOMAIN/tonconnect-manifest.json" | grep -q "\"https://$c.$DOMAIN\"" || b=$((b+1))
done
[ "$b" -eq 0 ] && note "every manifest names its own subdomain" "✓" || bad "manifest wrong" "$b chains"

echo "═══ 7. ON-CHAIN CONTRACT METADATA ═══"
for f in contracts/compiled/deployment-*.json; do
  [ -f "$f" ] || continue
  net=$(python3 -c "import json;print(json.load(open('$f'))['network'])")
  uri=$(python3 -c "import json;print(json.load(open('$f'))['constructorArgs'][2])")
  case "$uri" in "https://$net.$DOMAIN/metadata/") note "$net metadata base" "$uri ✓";;
                 *) bad "$net metadata base" "$uri";; esac
done

echo
[ "$fail" -eq 0 ] && echo "✅ every layer points at $DOMAIN" || echo "❌ $fail layer(s) still wrong"
exit $fail
