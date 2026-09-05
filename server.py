"""
Kairozen Store — Render deploy server
--------------------------------------
Serves index.html + checkout.html (unchanged) and implements /generate and
/check_payment using a REAL ABA/Bakong integration via the bakong-khqr
library (https://github.com/bsthen/bakong-khqr) — replacing the earlier
khmer-system.com reseller proxy. That proxy's pay_url lived on
khmer-system.com, a domain never registered with the ABA Mobile app, so it
could never trigger a real app-open; this uses ABA's own Bakong account
directly, the same fix applied to baby_server.py.

Why a backend at all, if the store is "one HTML file"?
Because your Bakong token is a secret. If it were pasted into the HTML/JS,
anyone opening dev tools or "view source" could steal it and create
fraudulent payment sessions on your account. This server is the only place
that ever sees it — the browser never does.

════════════════════════════════════════════════════════════════════════════
IMPORTANT — read before deploying
════════════════════════════════════════════════════════════════════════════
1. Bakong blocks API calls from outside Cambodia (HTTP 403). Render is NOT
   in Cambodia, so BAKONG_TOKEN below should be an RBK relay token from
   https://bakongrelay.com (built specifically for servers outside
   Cambodia), not a plain Bakong Developer Token — unless you host this
   file on a Cambodia-based VPS instead of Render.
2. You need a real Bakong Developer Token (or RBK token) — register at
   https://api-bakong.nbc.gov.kh/register/ or https://bakongrelay.com.
3. Your ABA account must be linked to Bakong and KYC-verified. The
   account_id format is typically "your_username@abaa" — check ABA Mobile
   → Bakong/KHQR profile section for your exact ID.

Run locally:
    pip install -r requirements.txt
    BAKONG_TOKEN=xxx ABA_ACCOUNT_ID=you@abaa python server.py

Deploy on Render:
    Build Command : pip install -r requirements.txt
    Start Command : gunicorn server:app
    Env vars      : BAKONG_TOKEN, ABA_ACCOUNT_ID
                    (ABA_MERCHANT_NAME, ABA_MERCHANT_CITY optional)
"""

import os
from flask import Flask, request, jsonify, send_from_directory

try:
    from dotenv import load_dotenv
    load_dotenv()  # reads .env in this folder for local dev; Render uses real env vars
except ImportError:
    pass

try:
    from bakong_khqr import KHQR
except ImportError:
    KHQR = None  # /generate and /check_payment return a clear error until installed

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

BAKONG_TOKEN = os.environ.get("BAKONG_TOKEN", "")
ABA_ACCOUNT_ID = os.environ.get("ABA_ACCOUNT_ID", "")  # e.g. "phanna_van@abaa"
ABA_MERCHANT_NAME = os.environ.get("ABA_MERCHANT_NAME", "Kairozen Store")
ABA_MERCHANT_CITY = os.environ.get("ABA_MERCHANT_CITY", "Phnom Penh")

app = Flask(__name__, static_folder=BASE_DIR, static_url_path="")

khqr = KHQR(BAKONG_TOKEN) if (KHQR and BAKONG_TOKEN) else None


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


@app.route("/checkout.html")
@app.route("/checkout")
def checkout():
    return send_from_directory(BASE_DIR, "checkout.html")


@app.route("/health")
def health():
    return jsonify(ok=True, bakong_configured=khqr is not None)


@app.route("/generate", methods=["POST", "OPTIONS"])
def generate():
    if request.method == "OPTIONS":
        return jsonify(ok=True)
    if not khqr:
        return jsonify(ok=False, error=(
            "Bakong not configured on server — set BAKONG_TOKEN env var "
            "(see file header comment for how to get one)"
        )), 500

    body = request.get_json(silent=True) or {}
    account = (body.get("account") or ABA_ACCOUNT_ID or "").strip()
    name = (body.get("name") or ABA_MERCHANT_NAME).strip()
    city = (body.get("city") or ABA_MERCHANT_CITY).strip()
    currency = (body.get("currency") or "USD").strip().upper()
    memo = (body.get("memo") or "")[:25]  # Bakong bill_number has a length limit
    try:
        amount = round(float(body.get("amount")), 2)
    except (TypeError, ValueError):
        return jsonify(ok=False, error="Missing/invalid amount"), 400
    if not account:
        return jsonify(ok=False, error="Missing ABA/Bakong account_id (set it in Admin → Settings, or ABA_ACCOUNT_ID env var)"), 400
    if amount <= 0:
        return jsonify(ok=False, error="Amount must be greater than 0"), 400

    try:
        qr_string = khqr.create_qr(
            account_id=account, merchant_name=name, merchant_city=city,
            amount=amount, currency=currency, bill_number=memo,
            static=False, expiration=1,
        )
        md5 = khqr.generate_md5(qr_string)
        img = khqr.qr_image(qr_string, format="base64_uri")
    except Exception as e:  # noqa: BLE001
        return jsonify(ok=False, error=f"KHQR generation failed: {e}"), 502

    resp = {"ok": True, "md5": md5, "img": img}

    # Deeplink is optional — only included if you've configured app branding for it.
    app_icon = os.environ.get("APP_ICON_URL", "")
    app_name = os.environ.get("APP_NAME", "")
    callback_url = os.environ.get("APP_DEEPLINK_CALLBACK", "")
    if app_icon and app_name and callback_url:
        try:
            resp["deeplink"] = khqr.generate_deeplink(
                qr=qr_string, appDeepLinkCallback=callback_url,
                appIconUrl=app_icon, appName=app_name,
            )
        except Exception:  # noqa: BLE001
            pass  # never fail the whole request over a missing nice-to-have

    return jsonify(resp)


@app.route("/check_payment", methods=["POST", "OPTIONS"])
def check_payment():
    if request.method == "OPTIONS":
        return jsonify(ok=True)
    if not khqr:
        return jsonify(paid=False, error="Bakong not configured on server"), 500
    body = request.get_json(silent=True) or {}
    md5 = (body.get("md5") or "").strip()
    if not md5:
        return jsonify(paid=False)
    try:
        status = khqr.check_payment(md5)
    except Exception as e:  # noqa: BLE001
        print(f"[check_payment] error: {e}", flush=True)
        return jsonify(paid=False)
    return jsonify(paid=(status == "PAID"))


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"Kairozen Store running on http://0.0.0.0:{port}")
    app.run(host="0.0.0.0", port=port, debug=False)
