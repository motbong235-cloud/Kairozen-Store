#!/usr/bin/env bash
# One-time firewall setup: ipset-based dynamic blacklist + baseline
# connection/SYN rate limits. Run once as root: sudo bash setup-ipset-iptables.sh
#
# Why ipset: adding/removing individual iptables rules per banned IP is
# slow and doesn't expire on its own. ipset gives O(1) lookups and a
# built-in `timeout` per entry, so bans set by ban_ip.sh (or fail2ban)
# expire automatically — no cron cleanup job needed.
set -euo pipefail

apt-get update -qq
apt-get install -y -qq ipset iptables-persistent

# ---- Dynamic blacklist set with automatic per-entry expiry ----
ipset create ddos_blacklist hash:ip timeout 3600 -exist

# ---- Dedicated chain so this is easy to inspect/flush independently ----
iptables -N DDOS_PROTECT 2>/dev/null || iptables -F DDOS_PROTECT
iptables -C INPUT -j DDOS_PROTECT 2>/dev/null || iptables -I INPUT -j DDOS_PROTECT

# Drop anything already on the dynamic blacklist first — cheapest check
iptables -A DDOS_PROTECT -m set --match-set ddos_blacklist src -j DROP

# ---- SYN flood: rate-limit new SYNs per source IP ----
iptables -A DDOS_PROTECT -p tcp --syn -m hashlimit \
  --hashlimit-name syn_flood --hashlimit-above 15/sec --hashlimit-burst 30 \
  --hashlimit-mode srcip --hashlimit-htable-expire 60000 -j DROP

# ---- Limit new connections per source IP to the web ports ----
iptables -A DDOS_PROTECT -p tcp --dport 80  -m conntrack --ctstate NEW \
  -m hashlimit --hashlimit-name http_new --hashlimit-above 30/sec \
  --hashlimit-burst 60 --hashlimit-mode srcip --hashlimit-htable-expire 60000 -j DROP
iptables -A DDOS_PROTECT -p tcp --dport 443 -m conntrack --ctstate NEW \
  -m hashlimit --hashlimit-name https_new --hashlimit-above 30/sec \
  --hashlimit-burst 60 --hashlimit-mode srcip --hashlimit-htable-expire 60000 -j DROP

# ---- Drop invalid packets & common scan flag combinations ----
iptables -A DDOS_PROTECT -m conntrack --ctstate INVALID -j DROP
iptables -A DDOS_PROTECT -p tcp --tcp-flags ALL NONE -j DROP
iptables -A DDOS_PROTECT -p tcp --tcp-flags ALL ALL -j DROP
iptables -A DDOS_PROTECT -p tcp --tcp-flags SYN,FIN SYN,FIN -j DROP
iptables -A DDOS_PROTECT -p tcp --tcp-flags SYN,RST SYN,RST -j DROP

netfilter-persistent save
echo "[setup-ipset-iptables] ipset + iptables DDoS baseline installed."
