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
import json
import time
import threading
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

# ══════════════════════════════════════════════════════════════════
#  SHARED STORE DATA — fixes "I add stock but customers can't see it"
# ──────────────────────────────────────────────────────────────────
# admin.html / index.html / login.html / checkout.html used to keep
# products/stock/settings/users/orders ONLY in that browser's own
# localStorage. Every visitor was really looking at their own private,
# empty copy of the "store" — nothing was ever sent to a server, so
# stock the admin added only ever showed up on the admin's own device.
#
# These two JSON files are now the single shared source of truth.
# DATA_DIR should point at a Render Persistent Disk mount in
# production (falls back to BASE_DIR for local/dev, where it's fine
# for the file to live next to the code and reset on redeploy).
# ══════════════════════════════════════════════════════════════════
DATA_DIR = os.environ.get("DATA_DIR", BASE_DIR)
CATALOG_FILE = os.path.join(DATA_DIR, "catalog.json")    # products, stock, settings
USERDATA_FILE = os.path.join(DATA_DIR, "userdata.json")  # users, orders
_data_lock = threading.Lock()

# Settings fields it's safe to hand to a non-admin visitor. Everything else
# (adminSecret, tgToken, tgChat — anything that could be abused) is stripped
# out of the response unless the caller's ?secret= matches the stored one.
SAFE_SETTINGS_KEYS = {
    "storeName", "khqrUrl", "bakongAccount", "merchantName", "merchantCity",
    "confirmWait", "tgSupport", "tgBotUsername", "tgAuthDomain",
}


def _read_json(path, default):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, ValueError):
        return default


def _write_json(path, data):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    os.replace(tmp, path)  # atomic on POSIX — no half-written file on crash


def _is_admin_request(secret):
    catalog = _read_json(CATALOG_FILE, {"settings": {}})
    stored_secret = (catalog.get("settings") or {}).get("adminSecret", "")
    return bool(stored_secret) and secret == stored_secret


@app.route("/api/state2", methods=["GET"])
def get_state2():
    with _data_lock:
        data = _read_json(CATALOG_FILE, {"products": [], "stock": {}, "settings": {}})
    settings = dict(data.get("settings") or {})
    secret = request.args.get("secret", "")
    is_admin = bool(settings.get("adminSecret")) and secret == settings.get("adminSecret")
    if not is_admin:
        settings = {k: v for k, v in settings.items() if k in SAFE_SETTINGS_KEYS}
    return jsonify(ok=True, products=data.get("products", []), stock=data.get("stock", {}), settings=settings)


@app.route("/api/state2", methods=["POST", "OPTIONS"])
def post_state2():
    if request.method == "OPTIONS":
        return jsonify(ok=True)
    body = request.get_json(silent=True) or {}
    with _data_lock:
        current = _read_json(CATALOG_FILE, {"products": [], "stock": {}, "settings": {}})
        cur_secret = (current.get("settings") or {}).get("adminSecret", "")
        sent_secret = body.get("secret", "")
        # First-ever save (no secret stored yet) bootstraps trust from
        # whatever the admin panel generated locally. After that, every
        # write must present the matching secret.
        if cur_secret and sent_secret != cur_secret:
            return jsonify(ok=False, error="Invalid admin secret"), 403
        new_data = {
            "products": body.get("products", current.get("products", [])),
            "stock": body.get("stock", current.get("stock", {})),
            "settings": body.get("settings", current.get("settings", {})),
        }
        _write_json(CATALOG_FILE, new_data)
    return jsonify(ok=True)


@app.route("/api/userdata", methods=["GET"])
def get_userdata():
    with _data_lock:
        data = _read_json(USERDATA_FILE, {"users": [], "orders": []})
    secret = request.args.get("secret", "")
    is_admin = _is_admin_request(secret)
    users = data.get("users", [])
    if not is_admin:
        users = [{k: v for k, v in u.items() if k != "passwordHash"} for u in users]
    return jsonify(ok=True, users=users, orders=data.get("orders", []))


@app.route("/api/userdata", methods=["POST", "OPTIONS"])
def post_userdata():
    if request.method == "OPTIONS":
        return jsonify(ok=True)
    body = request.get_json(silent=True) or {}
    with _data_lock:
        current = _read_json(USERDATA_FILE, {"users": [], "orders": []})
        new_data = {
            "users": body.get("users", current.get("users", [])),
            "orders": body.get("orders", current.get("orders", [])),
        }
        _write_json(USERDATA_FILE, new_data)
    return jsonify(ok=True)


@app.route("/api/deliver-stock", methods=["POST", "OPTIONS"])
def deliver_stock():
    """Atomically pop `qty` lines off a product's stock, server-side, under
    the same lock used for every other write. This is what actually
    prevents two customers who pay at nearly the same moment from both
    being handed the SAME account — something a browser-local splice can
    never guarantee once stock is shared across devices."""
    if request.method == "OPTIONS":
        return jsonify(ok=True)
    body = request.get_json(silent=True) or {}
    product_id = body.get("productId")
    if not product_id:
        return jsonify(ok=False, error="Missing productId"), 400
    try:
        qty = max(1, int(body.get("qty", 1)))
    except (TypeError, ValueError):
        qty = 1

    with _data_lock:
        current = _read_json(CATALOG_FILE, {"products": [], "stock": {}, "settings": {}})
        stock = current.get("stock", {})
        lines = [x for x in (stock.get(product_id) or []) if str(x).strip()]
        if not lines:
            return jsonify(ok=False, error="Out of stock"), 409
        delivered = lines[:qty]
        stock[product_id] = lines[qty:]
        current["stock"] = stock
        _write_json(CATALOG_FILE, current)

    return jsonify(ok=True, delivered=delivered, remaining=len(stock[product_id]))

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
