"""Redis-backed distributed atomic sliding-window rate limiting with fail-closed policies."""

import hashlib
import time
import uuid
from dataclasses import dataclass
from typing import Callable

from fastapi import Depends, HTTPException, Request, Response, status
from redis.asyncio import Redis
from redis.exceptions import ConnectionError, RedisError, TimeoutError

from app.core.auth import Principal, get_current_principal
from app.core.config import Settings, get_settings
from app.core.logging import get_logger
from app.core.redis import get_redis_client
from app.core.trusted_proxy import get_trusted_client_ip
from app.models.auth import UserRole

logger = get_logger("windiq.core.rate_limit")

# Atomic Sliding-Window Lua Script using Redis Server Time
# Prevents race conditions and eliminates clock drift across worker instances.
SLIDING_WINDOW_LUA = """
local key = KEYS[1]
local window_ms = tonumber(ARGV[1])
local max_requests = tonumber(ARGV[2])
local unique_member = ARGV[3]

-- 1. Fetch exact server time from Redis
local time_arr = redis.call('TIME')
local now_ms = (tonumber(time_arr[1]) * 1000) + math.floor(tonumber(time_arr[2]) / 1000)
local clear_before = now_ms - window_ms

-- 2. Evict timestamps falling outside sliding window
redis.call('ZREMRANGEBYSCORE', key, 0, clear_before)

-- 3. Query current count of requests in window
local current_count = redis.call('ZCARD', key)

if current_count < max_requests then
    -- Record current request timestamp
    redis.call('ZADD', key, now_ms, unique_member)
    -- Expire sorted set after 2x window duration to guarantee zero orphan memory leakage
    redis.call('PEXPIRE', key, window_ms * 2)
    local remaining = max_requests - current_count - 1
    local reset_sec = math.ceil(window_ms / 1000)
    return {1, remaining, reset_sec, 0}
else
    -- Quota exceeded: locate earliest entry to calculate accurate retry delay
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local retry_after_ms = window_ms
    if #oldest >= 2 then
        local oldest_ts = tonumber(oldest[2])
        retry_after_ms = (oldest_ts + window_ms) - now_ms
        if retry_after_ms < 0 then
            retry_after_ms = 0
        end
    end
    local retry_after_sec = math.ceil(retry_after_ms / 1000)
    if retry_after_sec <= 0 then
        retry_after_sec = 1
    end
    return {0, 0, retry_after_sec, retry_after_sec}
end
"""


@dataclass(frozen=True)
class RateLimitResult:
    """Outcome of rate limit evaluation."""

    allowed: bool
    limit: int
    remaining: int
    reset_seconds: int
    retry_after: int
    identity: str
    bucket: str


def resolve_identity(
    request: Request,
    principal: Principal | None = None,
    account_identifier: str | None = None,
) -> str:
    """Derive secure rate-limit identity following the specified security hierarchy.

    Hierarchy:
    1. Login attempt: trusted_ip + normalized account hash
    2. API Key: programmatic key UUID (never raw secret)
    3. Authenticated User: user UUID
    4. Anonymous: trusted client IP
    """
    client_ip = get_trusted_client_ip(request)

    if account_identifier:
        # Normalize and hash login identifier (never leak raw email/password in Redis keys)
        norm = account_identifier.strip().lower().encode("utf-8")
        h = hashlib.sha256(norm).hexdigest()[:16]
        return f"login:{client_ip}:{h}"

    if principal is not None:
        if principal.principal_type == "api_key":
            return f"key:{principal.id}"
        return f"user:{principal.id}"

    return f"ip:{client_ip}"


def determine_quota(
    bucket: str,
    principal: Principal | None,
    settings: Settings,
    quota_override: int | None = None,
) -> int:
    """Select appropriate rate-limit quota based on route class and live DB user role."""
    if quota_override is not None:
        return quota_override

    # 1. Heavy and sensitive route class overrides
    if bucket == "login":
        return settings.RATE_LIMIT_LOGIN_RPM
    if bucket in ("refresh", "logout"):
        return settings.RATE_LIMIT_REFRESH_RPM
    if bucket == "keys":
        return settings.RATE_LIMIT_KEYS_RPM
    if bucket == "revisions":
        return settings.RATE_LIMIT_REVISIONS_RPM
    if bucket in ("hourly", "horizons"):
        return settings.RATE_LIMIT_HEAVY_ANALYTICS_RPM

    # 2. Authenticated role-based tier quotas (uses live DB verified role)
    if principal is not None:
        if principal.principal_type == "api_key":
            return settings.RATE_LIMIT_ADMIN_RPM
        if principal.role == UserRole.ADMIN.value:
            return settings.RATE_LIMIT_ADMIN_RPM
        if principal.role == UserRole.ANALYST.value:
            return settings.RATE_LIMIT_ANALYST_RPM
        if principal.role == UserRole.VIEWER.value:
            return settings.RATE_LIMIT_VIEWER_RPM

    # 3. Anonymous IP tier quota
    return settings.RATE_LIMIT_ANONYMOUS_RPM


async def check_rate_limit(
    redis: Redis | None,
    key: str,
    max_requests: int,
    window_ms: int = 60000,
) -> tuple[bool, int, int, int]:
    """Execute atomic sliding-window counter in Redis via Lua script.

    Returns:
        (allowed, remaining, reset_seconds, retry_after)
    """
    if redis is None:
        raise ConnectionError("Redis client is not available")

    unique_member = f"{time.time_ns()}:{uuid.uuid4().hex[:8]}"
    result = await redis.eval(
        SLIDING_WINDOW_LUA,
        1,  # numkeys
        key,
        window_ms,
        max_requests,
        unique_member,
    )
    # Lua script returns array of numbers: {allowed, remaining, reset_sec, retry_after}
    allowed = bool(result[0] == 1)
    remaining = int(result[1])
    reset_sec = int(result[2])
    retry_after = int(result[3])
    return allowed, remaining, reset_sec, retry_after


class RateLimiter:
    """FastAPI route dependency enforcing distributed sliding-window quotas with fail-closed safety."""

    def __init__(
        self,
        bucket: str = "standard",
        quota_override: int | None = None,
        fail_closed: bool | None = None,
        is_sensitive: bool = False,
    ):
        self.bucket = bucket
        self.quota_override = quota_override
        # Sensitive routes (login, refresh, keys, revisions) ALWAYS fail closed
        self.is_sensitive = is_sensitive or bucket in (
            "login",
            "refresh",
            "logout",
            "keys",
            "revisions",
            "admin",
        )
        self.fail_closed = True if self.is_sensitive else fail_closed

    async def __call__(
        self,
        request: Request,
        response: Response,
    ) -> RateLimitResult:
        settings = getattr(request.app.state, "settings", None) or get_settings()

        if not settings.RATE_LIMIT_ENABLED:
            return RateLimitResult(
                allowed=True,
                limit=999999,
                remaining=999999,
                reset_seconds=0,
                retry_after=0,
                identity="disabled",
                bucket=self.bucket,
            )

        # Inspect if principal is already authenticated or attempt soft extraction
        resolved_principal = getattr(request.state, "principal", None)
        if resolved_principal is None:
            auth_header = request.headers.get("Authorization")
            api_key_header = request.headers.get("X-API-Key")
            if auth_header or api_key_header:
                try:
                    from app.core.database import get_session_factory
                    from fastapi.security import HTTPAuthorizationCredentials
                    session_factory = get_session_factory()
                    async with session_factory() as session:
                        bearer = None
                        if auth_header and auth_header.startswith("Bearer "):
                            bearer = HTTPAuthorizationCredentials(scheme="Bearer", credentials=auth_header[7:].strip())
                        resolved_principal = await get_current_principal(request, bearer=bearer, db=session)
                except Exception:
                    resolved_principal = None

        identity = resolve_identity(request, resolved_principal)
        quota = determine_quota(self.bucket, resolved_principal, settings, self.quota_override)
        window_ms = 60000  # Standard 1-minute window

        # In non-production environments, allow test namespace isolation or test bypass
        test_ns = request.headers.get("X-Test-Namespace")
        test_bypass = request.headers.get("X-Test-Rate-Limit-Bypass")
        if test_bypass == "true" and settings.APP_ENV != "production":
            return RateLimitResult(
                allowed=True,
                limit=quota,
                remaining=quota - 1,
                reset_seconds=60,
                retry_after=0,
                identity=identity,
                bucket=self.bucket,
            )

        if test_ns and settings.APP_ENV != "production":
            redis_key = f"windiq:test:{test_ns}:rl:{self.bucket}:{identity}"
        else:
            redis_key = f"windiq:rl:{self.bucket}:{identity}"

        redis = getattr(request.app.state, "redis", None) or get_redis_client()

        should_fail_closed = (
            self.fail_closed
            if self.fail_closed is not None
            else settings.RATE_LIMIT_FAIL_CLOSED_DEFAULT
        )

        try:
            allowed, remaining, reset_sec, retry_after = await check_rate_limit(
                redis=redis,
                key=redis_key,
                max_requests=quota,
                window_ms=window_ms,
            )
        except (ConnectionError, TimeoutError, RedisError, Exception) as exc:
            logger.warning(
                "Redis rate limiting failure on bucket '%s' [fail_closed=%s]: %s",
                self.bucket,
                should_fail_closed,
                exc,
            )
            # Never fall back to in-memory dictionaries!
            if should_fail_closed:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Rate limit coordination service temporarily unavailable.",
                    headers={"Retry-After": "5"},
                ) from exc

            # Configured fail-open for non-sensitive read endpoints
            response.headers["X-RateLimit-Limit"] = str(quota)
            response.headers["X-RateLimit-Remaining"] = "0"
            return RateLimitResult(
                allowed=True,
                limit=quota,
                remaining=0,
                reset_seconds=60,
                retry_after=0,
                identity=identity,
                bucket=self.bucket,
            )

        # Attach rate-limit headers to response
        response.headers["X-RateLimit-Limit"] = str(quota)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = str(reset_sec)

        if not allowed:
            response.headers["Retry-After"] = str(retry_after)
            logger.info(
                "Rate limit exceeded for identity '%s' on bucket '%s' (limit=%d, retry_after=%ds)",
                identity,
                self.bucket,
                quota,
                retry_after,
            )
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit quota exceeded. Please retry after {retry_after} seconds.",
                headers={"Retry-After": str(retry_after)},
            )

        return RateLimitResult(
            allowed=True,
            limit=quota,
            remaining=remaining,
            reset_seconds=reset_sec,
            retry_after=0,
            identity=identity,
            bucket=self.bucket,
        )


async def check_login_rate_limit(
    request: Request,
    response: Response,
    account_email: str,
) -> RateLimitResult:
    """Specialized rate check for login attempts using IP + normalized account fingerprint."""
    settings = getattr(request.app.state, "settings", None) or get_settings()
    if not settings.RATE_LIMIT_ENABLED:
        return RateLimitResult(True, 9999, 9999, 0, 0, "disabled", "login")

    identity = resolve_identity(request, principal=None, account_identifier=account_email)
    quota = settings.RATE_LIMIT_LOGIN_RPM
    window_ms = 60000

    # In non-production environments, allow test namespace isolation or test bypass
    test_ns = request.headers.get("X-Test-Namespace")
    test_bypass = request.headers.get("X-Test-Rate-Limit-Bypass")
    if test_bypass == "true" and settings.APP_ENV != "production":
        response.headers["X-RateLimit-Limit"] = str(quota)
        response.headers["X-RateLimit-Remaining"] = str(quota - 1)
        response.headers["X-RateLimit-Reset"] = "60"
        return RateLimitResult(
            allowed=True,
            limit=quota,
            remaining=quota - 1,
            reset_seconds=60,
            retry_after=0,
            identity=identity,
            bucket="login",
        )

    if test_ns and settings.APP_ENV != "production":
        redis_key = f"windiq:test:{test_ns}:rl:login:{identity}"
    else:
        redis_key = f"windiq:rl:login:{identity}"

    redis = getattr(request.app.state, "redis", None) or get_redis_client()

    try:
        allowed, remaining, reset_sec, retry_after = await check_rate_limit(
            redis=redis,
            key=redis_key,
            max_requests=quota,
            window_ms=window_ms,
        )
    except (ConnectionError, TimeoutError, RedisError, Exception) as exc:
        logger.warning("Redis failure during login rate check (fail-closed): %s", exc)
        # Login is sensitive and MUST fail closed on Redis outage
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Rate limit coordination service temporarily unavailable.",
            headers={"Retry-After": "5"},
        ) from exc

    response.headers["X-RateLimit-Limit"] = str(quota)
    response.headers["X-RateLimit-Remaining"] = str(remaining)
    response.headers["X-RateLimit-Reset"] = str(reset_sec)

    if not allowed:
        response.headers["Retry-After"] = str(retry_after)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many login attempts. Please retry after {retry_after} seconds.",
            headers={"Retry-After": str(retry_after)},
        )

    return RateLimitResult(
        allowed=True,
        limit=quota,
        remaining=remaining,
        reset_seconds=reset_sec,
        retry_after=0,
        identity=identity,
        bucket="login",
    )
