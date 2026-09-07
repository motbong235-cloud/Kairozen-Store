#!/usr/bin/env bash
# Add an IP to the dynamic blacklist (auto-expires after TTL seconds).
# Called by fail2ban's action and/or your app's AutoBlocker when it
# decides to hard-block someone.
# Usage: ban_ip.sh <ip> [ttl_seconds=3600]
set -euo pipefail
IP="${1:?Usage: ban_ip.sh <ip> [ttl_seconds]}"
TTL="${2:-3600}"
ipset add ddos_blacklist "$IP" timeout "$TTL" -exist
logger -t ddos-protect "Banned $IP for ${TTL}s"
