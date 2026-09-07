"""
FastAPI entrypoint wiring all three layers of Layer-7 defense:
  1. AutoBlocker          — hard block list (Redis), checked first, cheapest.
  2. SlidingWindowLimiter — per-IP request-rate limit.
  3. PatternDetector + Challenge — behavioral scoring, gated by a
     PoW/cookie challenge for IPs that are suspicious but not blocked.

Run this behind Nginx (see ../nginx/) — Nginx handles Slowloris /
connection-level protection and forwards the real client IP via
X-Real-IP. Bind Uvicorn/Gunicorn to 127.0.0.1 only (see systemd unit)
so requests can't reach this process except through Nginx — otherwise
get_client_ip() below can be spoofed by anyone hitting the app directly.
"""
import redis.asyncio as redis
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, HTMLResponse

from security.rate_limiter import SlidingWindowLimiter, AutoBlocker
from security.pattern_detect import PatternDetector, SUSPICIOUS_SCORE_THRESHOLD
from security.challenge import (
    COOKIE_NAME, issue_clearance_token, verify_clearance_token,
    make_pow_challenge, verify_pow_solution, CHALLENGE_HTML,
)

app = FastAPI()

redis_client = redis.from_url("redis://localhost:6379/0", decode_responses=True)

general_limiter = SlidingWindowLimiter(redis_client, limit=20, window_seconds=10, prefix="rl:general")
auto_blocker = AutoBlocker(redis_client, violation_threshold=5, violation_window=300, block_seconds=3600)
pattern_detector = PatternDetector(redis_client)


def get_client_ip(request: Request) -> str:
    return request.headers.get("x-real-ip") or (request.client.host if request.client else "unknown")


@app.post("/__ddos_verify")
async def ddos_verify(request: Request):
    body = await request.json()
    ip = get_client_ip(request)
    challenge = make_pow_challenge(ip)
    if body.get("challenge") == challenge and verify_pow_solution(challenge, body.get("nonce", "")):
        token = issue_clearance_token(ip)
        resp = JSONResponse({"ok": True})
        resp.set_cookie(COOKIE_NAME, token, max_age=1800, httponly=True, samesite="lax")
        return resp
    return JSONResponse({"ok": False}, status_code=403)


@app.middleware("http")
async def ddos_protection_middleware(request: Request, call_next):
    ip = get_client_ip(request)

    # ---- Layer 1: hard block list (cheapest check, do it first) ----
    if await auto_blocker.is_blocked(ip):
        return JSONResponse({"detail": "Blocked"}, status_code=403)

    # ---- Layer 2: sliding-window rate limit ----
    allowed, _count = await general_limiter.is_allowed(ip)
    if not allowed:
        await auto_blocker.record_violation(ip)
        # Also drop a line your monitor.py / fail2ban filter can pick up:
        print(f'{ip} - - [] "RATE_LIMITED {request.url.path}" 429 -', flush=True)
        return JSONResponse({"detail": "Too Many Requests"}, status_code=429)

    # ---- Layer 3: behavioral pattern scoring -> challenge gate ----
    if request.url.path != "/__ddos_verify":
        score = await pattern_detector.score_request(ip, request.url.path, request.headers)
        total_score = await pattern_detector.add_total_score(ip, score)

        if total_score >= SUSPICIOUS_SCORE_THRESHOLD:
            token = request.cookies.get(COOKIE_NAME)
            if not (token and verify_clearance_token(token, ip)):
                challenge = make_pow_challenge(ip)
                html = CHALLENGE_HTML.format(challenge=challenge, difficulty=4)
                return HTMLResponse(html, status_code=429)

    response = await call_next(request)

    if response.status_code == 404:
        await pattern_detector.note_404(ip)

    return response


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/")
async def root():
    return {"status": "ok", "message": "Protected API is up"}
