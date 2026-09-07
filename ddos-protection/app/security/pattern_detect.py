"""
Lightweight heuristic pattern detection on top of raw rate limiting.
Flags IPs whose *behavior* looks automated even while technically under
the rate limit — e.g. hammering only a couple of paths, or sending
requests with none of the headers a real browser always sends.

This is a starting point, not a finished ML system: tune the weights and
thresholds against your own traffic (log `total_score` for a while before
turning on the challenge gate) so real users don't get false-positived.
"""
import redis.asyncio as redis

SUSPICIOUS_SCORE_THRESHOLD = 10


class PatternDetector:
    def __init__(self, redis_client: "redis.Redis"):
        self.redis = redis_client

    async def score_request(self, ip: str, path: str, headers) -> int:
        score = 0
        if not headers.get("accept-language"):
            score += 1
        if not headers.get("accept"):
            score += 1
        if not headers.get("user-agent"):
            score += 3

        path_key = f"paths:{ip}"
        await self.redis.sadd(path_key, path)
        await self.redis.expire(path_key, 60)
        distinct_paths = await self.redis.scard(path_key)

        req_key = f"reqcount:{ip}"
        req_count = await self.redis.incr(req_key)
        await self.redis.expire(req_key, 60)

        # Lots of requests hitting very few distinct paths in a short
        # window looks like a scripted flood, not a browsing human.
        if req_count > 50 and distinct_paths <= 2:
            score += 4

        return score

    async def note_404(self, ip: str) -> int:
        """Call this from your 404 handler / error middleware. Repeated
        404s from the same IP in a short window usually means a scanner
        probing paths, not a real user who mistyped a URL once."""
        key = f"notfound:{ip}"
        n = await self.redis.incr(key)
        await self.redis.expire(key, 60)
        return n

    async def add_total_score(self, ip: str, score: int) -> int:
        key = f"pattern_score:{ip}"
        total = await self.redis.incrby(key, score)
        await self.redis.expire(key, 300)
        return total
