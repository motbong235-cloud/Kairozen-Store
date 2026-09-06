"""
Kairozen Store — Render deploy server
--------------------------------------
Serves index.html + checkout.html and adds two tiny backend routes that the
store's JS already calls: /generate and /check_payment. They proxy to ABA
PayWay via khmer-system.com — same integration as baby_server.py's original
aba_generate_qr()/aba_check_payment(), trimmed down to just what this
storefront needs.

Note: khmer-system.com's own hosted pay_url is NOT a domain registered with
the ABA Mobile app, so it can't trigger a real "open the app" handoff on its
own — only real QR scanning / the app's own deeplink handling works. That's
a known limitation of this reseller, accepted here in exchange for not
needing a Bakong Developer Token / RBK relay token / Cambodia-based hosting.

Why a backend at all, if the store is "one HTML file"?
Because ABA_API_KEY/ABA_MERCHANT_ID are secrets. If they were pasted into
the HTML/JS, anyone opening dev tools or "view source" could steal them
and create fraudulent payment sessions on your ABA account. This server
is the only place that ever sees the key — the browser never does.

Run locally:
    pip install flask requests gunicorn --break-system-packages
    ABA_API_KEY=xxx ABA_MERCHANT_ID=xxx python server.py

Deploy on Render:
    Build Command : pip install -r requirements.txt
    Start Command : gunicorn server:app
    Env vars      : ABA_API_KEY, ABA_MERCHANT_ID
                    (ABA_BASE_URL optional, defaults to khmer-system.com)
"""

import os
import time
import requests
from flask import Flask, request, jsonify, send_from_directory

try:
    from dotenv import load_dotenv
    load_dotenv()  # reads .env in this folder for local dev; Render uses real env vars
except ImportError:
    pass

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

ABA_API_KEY = os.environ.get("ABA_API_KEY", "")
ABA_MERCHANT_ID = os.environ.get("ABA_MERCHANT_ID", "")
ABA_BASE_URL = os.environ.get("ABA_BASE_URL", "https://khmer-system.com")
ABA_CREATE_URL = os.environ.get("ABA_CREATE_URL", f"{ABA_BASE_URL}/aba-api/generate-qr")
ABA_CHECK_URL = os.environ.get("ABA_CHECK_URL", f"{ABA_BASE_URL}/aba-api/check-payment")

app = Flask(__name__, static_folder=BASE_DIR, static_url_path="")

_http = requests.Session()
_http.headers.update({
    # khmer-system.com blocks the default python-requests User-Agent (WAF).
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
})


def _cors(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return resp


@app.after_request
def add_cors(resp):
    return _cors(resp)


@app.route("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/login.html")
@app.route("/login")
def login():
    return send_from_directory(BASE_DIR, "login.html")


@app.route("/admin.html")
@app.route("/admin")
def admin():
    return send_from_directory(BASE_DIR, "admin.html")


@app.route("/checkout.html")
@app.route("/checkout")
def checkout():
    return send_from_directory(BASE_DIR, "checkout.html")


@app.route("/health")
def health():
    return jsonify(ok=True, aba_configured=bool(ABA_API_KEY and ABA_MERCHANT_ID))


@app.route("/generate", methods=["POST", "OPTIONS"])
def generate():
    if request.method == "OPTIONS":
        return jsonify(ok=True)

    if not ABA_API_KEY or not ABA_MERCHANT_ID:
        return jsonify(ok=False, error="ABA_API_KEY / ABA_MERCHANT_ID not set on the server"), 500

    body = request.get_json(silent=True) or {}
    try:
        amount = round(float(body.get("amount")), 2)
    except (TypeError, ValueError):
        return jsonify(ok=False, error="Missing/invalid amount"), 400
    memo = str(body.get("memo") or "order")

    payload = {
        "api_key": ABA_API_KEY,
        "merchant_id": ABA_MERCHANT_ID,
        "username": memo,
        "amount": amount,
    }

    data, err = _aba_post(ABA_CREATE_URL, payload, attempts=2)
    if err:
        return jsonify(ok=False, error=err), 502
    if not data.get("ok"):
        return jsonify(ok=False, error=data.get("message") or "ABA error"), 502

    # DEBUG: log every field ABA actually sent back so we can confirm the
    # real image field name/format. Check Render → Logs for a line starting
    # "[generate] ABA fields:" after a test purchase, and share it.
    preview = {
        k: (str(v)[:70] + "…" if isinstance(v, str) and len(str(v)) > 70 else v)
        for k, v in data.items()
    }
    print(f"[generate] ABA fields: {preview}", flush=True)

    img_raw = data.get("qr_image") or data.get("card_image")
    img = _to_img_src(img_raw)
    pay_url = data.get("pay_url")
    if not img and pay_url:
        # ABA didn't give us a ready-made image (or the field name differs from
        # what we expect) — render pay_url ourselves as a scannable QR so the
        # customer always sees something, regardless of ABA's exact response shape.
        import urllib.parse
        img = f"https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=10&data={urllib.parse.quote(pay_url)}"

    return jsonify(
        ok=True,
        md5=str(data.get("payment_id")),
        deeplink=pay_url,
        img=img,
    )


@app.route("/check_payment", methods=["POST", "OPTIONS"])
def check_payment():
    if request.method == "OPTIONS":
        return jsonify(ok=True)

    body = request.get_json(silent=True) or {}
    payment_id = body.get("md5")
    if not payment_id:
        return jsonify(paid=False)

    data, err = _aba_post(ABA_CHECK_URL, {
        "api_key": ABA_API_KEY,
        "merchant_id": ABA_MERCHANT_ID,
        "payment_id": payment_id,
    }, attempts=1)
    if err or not data:
        return jsonify(paid=False)

    paid = bool(data.get("ok")) and str(data.get("status", "")).upper() == "PAID"
    return jsonify(paid=paid)


def _aba_post(url, payload, attempts=1):
    """POST to khmer-system.com. Returns (json_dict, None) on success or
    (None, error_message) on failure. Retries once on 5xx/timeout, matching
    baby_server.py's behavior."""
    last_err = None
    for i in range(attempts):
        try:
            r = _http.post(
                url,
                json=payload,
                headers={"Content-Type": "application/json", "Accept": "application/json"},
                timeout=20,
            )
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as e:
            last_err = f"{type(e).__name__}: {e}"
            time.sleep(1.5)
            continue
        try:
            data = r.json()
        except ValueError:
            body_text = r.text.strip()
            if body_text.lower().startswith(("<!doctype", "<html")):
                last_err = f"HTTP {r.status_code} — got an HTML page back (WAF block or wrong URL)"
            else:
                last_err = f"HTTP {r.status_code} (non-JSON): {body_text[:200]}"
            if r.status_code >= 500 and i < attempts - 1:
                time.sleep(1.5)
                continue
            return None, last_err
        return data, None
    return None, last_err or "Unknown error"


def _to_img_src(img_val):
    if not img_val:
        return None
    s = str(img_val).strip()
    if s.lower().startswith(("http://", "https://", "data:")):
        return s
    return f"data:image/png;base64,{s}"


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"Kairozen Store running on http://0.0.0.0:{port}")
    app.run(host="0.0.0.0", port=port, debug=False)
