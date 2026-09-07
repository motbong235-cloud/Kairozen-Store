"""
Lightweight Nginx access-log tailer: aggregates request rate per minute,
flags spikes and high block-rates, and sends a Telegram alert.

Complements fail2ban (which reacts per offending IP) by giving you the
overview — is a broad attack happening right now — and pinging you about
it. Run as a systemd service (see ddos-monitor.service).

Env vars:
  NGINX_ACCESS_LOG     path to the ddos_log-formatted access log
  TELEGRAM_BOT_TOKEN   optional — alerts print to stdout if unset
  TELEGRAM_CHAT_ID     optional
  SPIKE_THRESHOLD      requests/min that counts as a spike (default 500)
  ERROR_RATE_THRESHOLD fraction of 429/403 responses that counts as an
                        attack signature (default 0.3 = 30%)
"""
import os
import re
import time
import collections
import requests

LOG_PATH = os.environ.get("NGINX_ACCESS_LOG", "/var/log/nginx/app_access.log")
TELEGRAM_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")
SPIKE_THRESHOLD = int(os.environ.get("SPIKE_THRESHOLD", "500"))
ERROR_RATE_THRESHOLD = float(os.environ.get("ERROR_RATE_THRESHOLD", "0.3"))

LOG_RE = re.compile(r'^(?P<ip>\S+) - \S+ \[(?P<time>[^\]]+)\] "(?P<method>\S+) (?P<path>\S+)[^"]*" (?P<status>\d{3})')


def send_alert(message: str):
    if not (TELEGRAM_TOKEN and TELEGRAM_CHAT_ID):
        print(f"[ALERT] {message}", flush=True)
        return
    try:
        requests.post(
            f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
            json={"chat_id": TELEGRAM_CHAT_ID, "text": f"🚨 DDoS Monitor: {message}"},
            timeout=5,
        )
    except requests.RequestException as e:
        print(f"[monitor] failed to send alert: {e}", flush=True)


def tail(path):
    with open(path, "r") as f:
        f.seek(0, os.SEEK_END)
        while True:
            line = f.readline()
            if not line:
                time.sleep(0.5)
                continue
            yield line


def main():
    window = collections.deque()
    last_hourly_report = time.time()
    already_alerted_spike = False

    for line in tail(LOG_PATH):
        m = LOG_RE.match(line)
        if not m:
            continue
        now = time.time()
        window.append((now, m.group("ip"), int(m.group("status"))))
        while window and now - window[0][0] > 60:
            window.popleft()

        total = len(window)
        blocked = sum(1 for _, _, s in window if s in (429, 403))

        if total >= SPIKE_THRESHOLD and not already_alerted_spike:
            send_alert(f"Traffic spike: {total} req/min (threshold {SPIKE_THRESHOLD})")
            already_alerted_spike = True
        elif total < SPIKE_THRESHOLD * 0.5:
            already_alerted_spike = False  # allow re-alerting after it cools down

        if total > 20 and blocked / total >= ERROR_RATE_THRESHOLD:
            top_ips = collections.Counter(ip for _, ip, s in window if s in (429, 403)).most_common(5)
            send_alert(f"High block rate: {blocked}/{total} req/min are 429/403. Top offenders: {top_ips}")

        if now - last_hourly_report > 3600:
            send_alert(f"Hourly summary: {total} req in last-minute sample, {blocked} blocked.")
            last_hourly_report = now


if __name__ == "__main__":
    main()
