"""
Two-stage bot challenge for IPs that are suspicious but not yet hard-blocked:

  1. Signed cookie — a real browser stores and resends cookies; a lot of
     naive HTTP-flood scripts don't bother, so this alone filters a
     meaningful share of junk cheaply.
  2. Proof-of-Work — before issuing that cookie, the client's JS must find
     a nonce whose sha256 has N leading zero hex digits. Trivial CPU cost
     for one real visitor, but expensive to redo at the request volume an
     attacker needs — the same idea used by tools like Anubis/go-away.

This raises the cost of automated traffic; it is not a CAPTCHA and won't
stop a well-resourced/targeted attacker on its own — combine with the
rate-limit and firewall layers.
"""
import hashlib
import os
import time
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

SECRET_KEY = os.environ.get("CHALLENGE_SECRET_KEY", "change-me-in-production")
_serializer = URLSafeTimedSerializer(SECRET_KEY, salt="ddos-challenge")

COOKIE_NAME = "ddos_clearance"
COOKIE_MAX_AGE = 30 * 60  # 30 minutes
POW_DIFFICULTY = 4        # leading hex zeros required; raise under heavier attack


def issue_clearance_token(ip: str) -> str:
    return _serializer.dumps({"ip": ip, "ts": time.time()})


def verify_clearance_token(token: str, ip: str) -> bool:
    try:
        data = _serializer.loads(token, max_age=COOKIE_MAX_AGE)
    except (BadSignature, SignatureExpired):
        return False
    return data.get("ip") == ip


def make_pow_challenge(ip: str) -> str:
    """Changes every 60s so a solved challenge can't be replayed indefinitely."""
    return hashlib.sha256(f"{ip}:{SECRET_KEY}:{int(time.time() // 60)}".encode()).hexdigest()


def verify_pow_solution(challenge: str, nonce: str, difficulty: int = POW_DIFFICULTY) -> bool:
    digest = hashlib.sha256(f"{challenge}:{nonce}".encode()).hexdigest()
    return digest.startswith("0" * difficulty)


CHALLENGE_HTML = """<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Checking your browser…</title></head>
<body style="font-family:sans-serif;text-align:center;padding-top:80px">
<h2>ត្រួតពិនិត្យសុវត្ថិភាព…</h2>
<p id="msg">សូមរង់ចាំមួយភ្លែត — ទំព័រនឹងផ្ទុកដោយស្វ័យប្រវត្តិ។</p>
<script>
async function sha256Hex(msg) {{
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}}
async function solve() {{
  const challenge = "{challenge}";
  const difficulty = {difficulty};
  const prefix = "0".repeat(difficulty);
  let nonce = 0, digest = "";
  while (true) {{
    digest = await sha256Hex(challenge + ":" + nonce);
    if (digest.startsWith(prefix)) break;
    nonce++;
    if (nonce % 5000 === 0) await new Promise(r => setTimeout(r, 0));
  }}
  document.getElementById('msg').textContent = 'ត្រៀមរួចរាល់ — កំពុងបញ្ជូន…';
  const resp = await fetch('/__ddos_verify', {{
    method: 'POST', headers: {{'Content-Type':'application/json'}},
    body: JSON.stringify({{challenge, nonce: String(nonce)}})
  }});
  if (resp.ok) location.reload();
  else document.getElementById('msg').textContent = 'បរាជ័យ — សូម Refresh ម្ដងទៀត។';
}}
solve();
</script>
</body></html>"""
