#!/usr/bin/env bash
# SYN-flood + general kernel hardening for Ubuntu 22.04.
# Run once as root: sudo bash setup-sysctl.sh
set -euo pipefail

CONF=/etc/sysctl.d/99-ddos-hardening.conf

cat > "$CONF" <<'EOF'
# ---- SYN flood protection ----
net.ipv4.tcp_syncookies = 1
net.ipv4.tcp_max_syn_backlog = 4096
net.ipv4.tcp_synack_retries = 2
net.ipv4.tcp_syn_retries = 3

# ---- Reduce impact of connection floods ----
net.ipv4.tcp_fin_timeout = 15
net.ipv4.tcp_tw_reuse = 1
net.core.somaxconn = 4096
net.ipv4.tcp_max_tw_buckets = 1440000

# ---- Ignore spoofed / obviously bad packets ----
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.all.log_martians = 1
EOF

sysctl --system
echo "[setup-sysctl] SYN-flood hardening applied — see $CONF"
