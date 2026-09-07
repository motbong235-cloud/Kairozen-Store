# Layer-7 DDoS Protection — Nginx + FastAPI + Redis + iptables

Stack assumed: **Nginx** (reverse proxy) → **FastAPI** (Python, Uvicorn/Gunicorn)
→ your database, on **Ubuntu Server 22.04**, with **Redis** added purely as
shared state for the rate limiter (not your app's primary DB).

## 1. Architecture

```
                         ┌─────────────────────┐
      Internet  ───────► │   iptables/ipset      │  SYN-flood limits, dynamic
                         │   (kernel, cheapest)   │  blacklist (Layer 3/4)
                         └─────────┬─────────────┘
                                   │
                         ┌─────────▼─────────────┐
                         │        Nginx           │  rate limit, conn limit,
                         │   (reverse proxy)       │  bad-UA block, Slowloris
                         └─────────┬─────────────┘  timeouts, body-size limit
                                   │  X-Real-IP           (Layer 7, edge)
                         ┌─────────▼─────────────┐
                         │  FastAPI middleware     │  sliding-window limiter,
                         │  (127.0.0.1 only)       │  auto-block, pattern
                         └─────────┬─────────────┘  scoring, PoW/cookie gate
                                   │
                         ┌─────────▼─────────────┐
                         │   Redis (shared state)  │  rate/violation/block
                         └─────────────────────────┘  state across workers

  fail2ban   ── watches Nginx access log ──► adds to the SAME `ddos_blacklist`
                                              ipset that ban_ip.sh writes to
  monitor.py ── tails Nginx access log ──► Telegram alert on spikes / high
                                            block-rate
```

Each layer is cheaper to check than the one behind it, so expensive work
(your actual application code, DB queries) is the *last* thing a flood of
junk requests reaches — most of it gets dropped at the kernel or Nginx
before your FastAPI process even wakes up.

**Files in this bundle:**
```
nginx/ddos-limits.conf          http-level rate/conn zones + bad-bot map
nginx/site-app.conf             example server{} block using them
nginx/proxy_params_ddos.conf    shared short upstream timeouts
app/main.py                     FastAPI app wiring all 3 middleware layers
app/security/rate_limiter.py    sliding-window limiter + auto-block (Redis)
app/security/challenge.py       cookie + Proof-of-Work bot challenge
app/security/pattern_detect.py  behavioral anomaly scoring
app/ddos-app.service            systemd unit (Gunicorn, 127.0.0.1-only)
firewall/setup-sysctl.sh        SYN-flood kernel hardening
firewall/setup-ipset-iptables.sh baseline ipset + iptables rules
firewall/ban_ip.sh / unban_ip.sh manual/scripted ban helpers
fail2ban/filter.d/nginx-ddos.conf  matches 429/403 in the access log
fail2ban/jail.d/nginx-ddos.conf    bans into the shared ipset
monitoring/monitor.py           log tailer + Telegram alerting
monitoring/ddos-monitor.service systemd unit for the monitor
```

## 2. Deploy

Run as root on the Ubuntu 22.04 box, in this order:

```bash
# 0) System packages
apt-get update && apt-get install -y nginx redis-server python3-venv fail2ban

# 1) Kernel + firewall baseline
bash firewall/setup-sysctl.sh
bash firewall/setup-ipset-iptables.sh
chmod +x firewall/ban_ip.sh firewall/unban_ip.sh
cp firewall/ban_ip.sh firewall/unban_ip.sh /usr/local/bin/

# 2) App
mkdir -p /opt/ddos-protection
cp -r app monitoring /opt/ddos-protection/
python3 -m venv /opt/ddos-protection/venv
/opt/ddos-protection/venv/bin/pip install -r /opt/ddos-protection/app/requirements.txt
# Generate a real secret and edit it into ddos-app.service:
python3 -c "import secrets; print(secrets.token_hex(32))"
cp app/ddos-app.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now ddos-app redis-server

# 3) Nginx
cp nginx/ddos-limits.conf /etc/nginx/conf.d/
cp nginx/proxy_params_ddos.conf /etc/nginx/
cp nginx/site-app.conf /etc/nginx/sites-available/app
ln -s /etc/nginx/sites-available/app /etc/nginx/sites-enabled/app
# edit server_name in site-app.conf, then add TLS (certbot) as usual
nginx -t && systemctl reload nginx

# 4) fail2ban (shares the ipset from step 1)
cp fail2ban/filter.d/nginx-ddos.conf /etc/fail2ban/filter.d/
cp fail2ban/jail.d/nginx-ddos.conf /etc/fail2ban/jail.d/
systemctl restart fail2ban

# 5) Monitoring
cp monitoring/ddos-monitor.env.example /etc/ddos-monitor.env
nano /etc/ddos-monitor.env   # fill in Telegram bot token/chat id (optional)
chmod 600 /etc/ddos-monitor.env
cp monitoring/ddos-monitor.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now ddos-monitor
```

Adjust `nginx/site-app.conf`'s `server_name`, the auth/checkout path
pattern, and `app/main.py`'s rate-limit numbers to your real traffic —
the defaults are reasonable starting points, not universal.

## 3. Testing

Only run these against **infrastructure you own** — load-testing someone
else's server without permission is the same DDoS you're defending against.

```bash
# Basic load, confirm normal traffic still works and limits kick in past it
sudo apt-get install -y apache2-utils
ab -n 2000 -c 50 https://example.com/

# Or, more modern:
go install github.com/rakyll/hey@latest
hey -z 30s -c 100 https://example.com/

# Confirm per-IP rate limiting: single IP, high rate, from ONE client
hey -z 10s -c 1 -q 50 https://example.com/api/  # expect 429s after burst

# Slowloris-style slow-header attack — confirms client_header_timeout works
sudo apt-get install -y slowhttptest
slowhttptest -c 1000 -H -i 10 -r 200 -t GET -u https://example.com/ -x 24 -p 3

# Confirm the challenge page appears once pattern_score crosses the threshold
# (repeat identical requests with curl, no cookie jar, no UA):
for i in $(seq 1 60); do curl -s -o /dev/null -w "%{http_code}\n" https://example.com/; done
```

Watch `journalctl -u ddos-app -f` and `tail -f /var/log/nginx/app_access.log`
while testing so you can see which layer catches what.

## 4. Maintenance & monitoring

- **Logs**: `/var/log/nginx/app_access.log` (ddos_log format) is the source
  of truth for both fail2ban and monitor.py. Rotate it with the standard
  `/etc/logrotate.d/nginx` config (already present on Ubuntu).
- **Check current bans**: `ipset list ddos_blacklist`
- **Check fail2ban status**: `fail2ban-client status nginx-ddos`
- **Unban a false positive**: `unban_ip.sh <ip>` and
  `fail2ban-client set nginx-ddos unbanip <ip>`
- **Tune thresholds** in `nginx/ddos-limits.conf` (rate=), `app/main.py`
  (`limit=`, `SUSPICIOUS_SCORE_THRESHOLD`), and
  `fail2ban/jail.d/nginx-ddos.conf` (`maxretry`) based on real traffic —
  start generous, tighten once you've watched a week of normal load.
- **Redis persistence** isn't required (all keys are short-TTL rate-limit
  state) — an empty Redis on restart just means limits reset, which is safe.
- **Weekly**: skim `monitor.py`'s alerts / `journalctl -u ddos-monitor` for
  patterns (same ASN repeatedly, same paths targeted) and adjust the Nginx
  `location` blocks or `bad_bot` map accordingly.
- **This is defense-in-depth, not a silver bullet.** A large volumetric
  attack (saturating your uplink bandwidth) needs protection upstream of
  this box entirely — a CDN/scrubbing service (Cloudflare, AWS Shield,
  etc.) in front of Nginx. Everything here handles Layer-7 (request-level)
  abuse that gets through to your server.
