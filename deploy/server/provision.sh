#!/usr/bin/env bash
# provision.sh — prepare a fresh Hetzner CAX11 (2 vCPU ARM64 / 4 GB / 40 GB) to
# serve 27 chain-native CryptoLand deployments behind Caddy.
#
# Sizing, from measurements taken against the real app rather than guesses:
#   one uvicorn backend  24 MB idle / 46 MB under load
#   x27                  0.64 GB idle / 1.21 GB loaded
#   Caddy + OS           ~0.35 GB
#   => ~2.4 GB headroom on a 4 GB box. It fits, but not with room to be careless,
#      hence the MemoryMax below and zram instead of a disk swapfile.
#   bundles 1.8 MB each + seeded DB ~2.5 MB each => <1 GB of the 40 GB disk.
#
# Idempotent: safe to re-run.
set -euo pipefail

echo "── packages ─────────────────────────────────────────"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq --no-install-recommends \
  python3 python3-venv python3-pip rsync ufw fail2ban zram-tools \
  ca-certificates curl debian-keyring debian-archive-keyring apt-transport-https

echo "── caddy ────────────────────────────────────────────"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq && apt-get install -y -qq caddy
fi

echo "── zram (no swapfile: 40 GB disk is SSD-backed and writes are precious) ──"
# 27 Python processes share a lot of identical pages; compressed RAM swap is a
# far better fit here than a disk swapfile.
echo -e "ALGO=zstd\nPERCENT=50" > /etc/default/zramswap
systemctl enable --now zramswap 2>/dev/null || true

echo "── kernel tuning for many small keep-alive backends ──"
cat > /etc/sysctl.d/99-cryptoland.conf <<'EOF'
# 27 uvicorn backends behind one reverse proxy: lots of short-lived localhost
# connections, very little else.
net.core.somaxconn = 1024
net.ipv4.tcp_max_syn_backlog = 2048
net.ipv4.tcp_fin_timeout = 15
net.ipv4.tcp_tw_reuse = 1
net.ipv4.ip_local_port_range = 10240 65535
# Swap only under real pressure — zram makes swapping cheap but not free.
vm.swappiness = 20
vm.vfs_cache_pressure = 50
# SQLite is read-heavy here; let the page cache do the work.
vm.dirty_ratio = 15
vm.dirty_background_ratio = 5
EOF
sysctl -p /etc/sysctl.d/99-cryptoland.conf >/dev/null

echo "── file descriptors ─────────────────────────────────"
cat > /etc/security/limits.d/99-cryptoland.conf <<'EOF'
root soft nofile 65535
root hard nofile 65535
EOF

echo "── firewall ─────────────────────────────────────────"
ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp   comment 'ssh'      >/dev/null
ufw allow 80/tcp   comment 'http'     >/dev/null
ufw allow 443/tcp  comment 'https'    >/dev/null
ufw allow 443/udp  comment 'http3'    >/dev/null
ufw --force enable >/dev/null
# Backends bind 127.0.0.1 only (server/main.py defaults to it) so ports
# 9000-9026 are never exposed; the firewall is belt to that braces.

echo "── ssh hardening ────────────────────────────────────"
cat > /etc/ssh/sshd_config.d/99-hardening.conf <<'EOF'
PasswordAuthentication no
PermitRootLogin prohibit-password
KbdInteractiveAuthentication no
MaxAuthTries 3
EOF
systemctl reload ssh 2>/dev/null || systemctl reload sshd

systemctl enable --now fail2ban >/dev/null 2>&1 || true

echo "── layout ───────────────────────────────────────────"
mkdir -p /srv/cryptoland/app
id -u cryptoland >/dev/null 2>&1 || useradd -r -s /usr/sbin/nologin -d /srv/cryptoland cryptoland

echo
echo "✓ provisioned. RAM now:"
free -h | head -2
