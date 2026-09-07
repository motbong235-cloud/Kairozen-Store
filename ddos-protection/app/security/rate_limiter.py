"""
Sliding-window rate limiter + auto-block, backed by Redis so it works
correctly across multiple Uvicorn/Gunicorn worker processes — an
in-memory dict per worker would let an attacker just get lucky and land
on the one worker that hasn't seen them yet.
"""
import time
import uuid
import redis.asyncio as redis


class SlidingWindowLimiter:
    """Sliding-window-log limiter: `limit` requests allowed per
    `window_seconds`, tracked per key (usually client IP) in a Redis
    sorted set. More accurate than a fixed window (no burst-at-the-edge
    problem) while still O(log N) per request."""

    def __init__(self, redis_client: "redis.Redis", limit: int, window_seconds: int, prefix: str):
        self.redis = redis_client
        self.limit = limit
        self.window = window_seconds
        self.prefix = prefix

    async def is_allowed(self, key: str) -> tuple[bool, int]:
        now = time.time()
        window_start = now - self.window
        redis_key = f"{self.prefix}:{key}"
        member = f"{now}:{uuid.uuid4().hex[:8]}"  # unique even for same-millisecond requests

        pipe = self.redis.pipeline()
        pipe.zremrangebyscore(redis_key, 0, window_start)
        pipe.zadd(redis_key, {member: now})
        pipe.zcard(redis_key)
        pipe.expire(redis_key, self.window + 1)
        _, _, count, _ = await pipe.execute()
        return count <= self.limit, count


class AutoBlocker:
    """Tracks rate-limit violations per IP and escalates a repeat offender
    to a full block, stored in Redis. Nginx/iptables (via firewall/ban_ip.sh)
    is the final enforcement point for anything that shouldn't even reach
    this process again — call `sync_to_firewall` (or wire your own hook)
    when `record_violation` returns True if you want that extra layer."""

    def __init__(self, redis_client: "redis.Redis", violation_threshold: int = 5,
                 violation_window: int = 300, block_seconds: int = 3600):
        self.redis = redis_client
        self.violation_threshold = violation_threshold
        self.violation_window = violation_window
        self.block_seconds = block_seconds

    async def is_blocked(self, ip: str) -> bool:
        return await self.redis.exists(f"blocked:{ip}") == 1

    async def record_violation(self, ip: str) -> bool:
        """Returns True if this violation just triggered a new block."""
        key = f"violations:{ip}"
        count = await self.redis.incr(key)
        if count == 1:
            await self.redis.expire(key, self.violation_window)
        if count >= self.violation_threshold:
            await self.redis.set(f"blocked:{ip}", "1", ex=self.block_seconds)
            await self.redis.delete(key)
            return True
        return False

    async def unblock(self, ip: str):
        await self.redis.delete(f"blocked:{ip}")
