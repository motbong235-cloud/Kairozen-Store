#!/usr/bin/env bash
# Manually remove an IP from the dynamic blacklist before its TTL expires.
# Usage: unban_ip.sh <ip>
set -euo pipefail
IP="${1:?Usage: unban_ip.sh <ip>}"
ipset del ddos_blacklist "$IP" 2>/dev/null || true
logger -t ddos-protect "Unbanned $IP"
