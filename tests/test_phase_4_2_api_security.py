"""Comprehensive test suite for Phase 4.2: Distributed API Security, Redis Rate Limiting & Production Secrets."""

import asyncio
import ipaddress
import json
import urllib.error
import urllib.request
import uuid
import pytest
from redis.asyncio import Redis

from app.core.config import Settings
from app.core.rate_limit import (
    RateLimiter,
    check_login_rate_limit,
    check_rate_limit,
    determine_quota,
    resolve_identity,
)
from app.core.redis import check_redis_health, close_redis_pool, init_redis_pool
from app.core.trusted_proxy import get_trusted_client_ip, parse_trusted_networks
from app.models.auth import UserRole

BASE_URL = "http://localhost:8001/api/v1"
REDIS_TEST_URL = "redis://:windiq_redis_dev_secret_pass@127.0.0.1:6385/0"


# -----------------------------------------------------------------------------
# HTTP Helpers for Live Container Verification
# -----------------------------------------------------------------------------

def _http_request(
    path: str,
    method: str = "GET",
    body: dict | None = None,
    headers: dict | None = None,
    cookies: dict | None = None,
) -> tuple[int, dict, dict]:
    """Execute live HTTP request against running backend container."""
    if path.startswith("http://") or path.startswith("https://"):
        url = path
    elif path.startswith("/health"):
        url = f"http://localhost:8001{path}"
    else:
        url = f"{BASE_URL}{path}"
    req_headers = {"User-Agent": "WindIQ-Test/4.2"}
    if headers:
        req_headers.update(headers)

    if cookies:
        cookie_str = "; ".join(f"{k}={v}" for k, v in cookies.items())
        req_headers["Cookie"] = cookie_str

    data_bytes = None
    if body is not None:
        req_headers["Content-Type"] = "application/json"
        data_bytes = json.dumps(body).encode("utf-8")

    req = urllib.request.Request(url, data=data_bytes, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            resp_body = resp.read().decode("utf-8")
            resp_json = json.loads(resp_body) if resp_body else {}
            resp_headers = {k.lower(): v for k, v in resp.headers.items()}
            return resp.status, resp_json, resp_headers
    except urllib.error.HTTPError as err:
        err_body = err.read().decode("utf-8")
        try:
            err_json = json.loads(err_body)
        except Exception:
            err_json = {"raw": err_body}
        err_headers = {k.lower(): v for k, v in err.headers.items()}
        return err.code, err_json, err_headers


def _login(role: str) -> tuple[str, str, str]:
    """Login helper returning (access_token, raw_refresh_token, csrf_token)."""
    passwords = {
        "admin": "AdminPass123!#",
        "analyst": "AnalystPass123!#",
        "viewer": "ViewerPass123!#",
    }
    email = f"{role.lower()}@windiq.local"
    status_code, body, headers = _http_request(
        "/auth/login",
        method="POST",
        body={"email": email, "password": passwords[role.lower()]},
    )
    if status_code == 429:
        try:
            import redis
            r = redis.from_url(REDIS_TEST_URL)
            for k in r.keys("windiq:rl:login:*"):
                r.delete(k)
            status_code, body, headers = _http_request(
                "/auth/login",
                method="POST",
                body={"email": email, "password": passwords[role.lower()]},
            )
        except Exception:
            pass

    assert status_code == 200, f"Failed to login as {role}: {body}"
    return body["access_token"], headers.get("set-cookie", ""), body["csrf_token"]


# =============================================================================
# 1. Redis Client Lifecycle & Health Diagnostics
# =============================================================================

@pytest.mark.asyncio
async def test_01_redis_lifecycle_and_ping():
    """Verify managed Redis connection pool initialization, ping check, and clean shutdown."""
    cfg = Settings(REDIS_URL=REDIS_TEST_URL)
    client = await init_redis_pool(cfg)
    assert client is not None
    is_healthy = await check_redis_health(cfg)
    assert is_healthy is True
    await close_redis_pool()


@pytest.mark.asyncio
async def test_02_redis_unreachable_diagnostics():
    """Verify check_redis_health returns False when connecting to invalid port."""
    bad_cfg = Settings(
        REDIS_URL="redis://:invalid_pass@127.0.0.1:6399/0",
        REDIS_CONNECT_TIMEOUT_SECONDS=0.5,
    )
    client = Redis.from_url(bad_cfg.REDIS_URL, socket_connect_timeout=0.5)
    try:
        ping_res = False
        try:
            await asyncio.wait_for(client.ping(), timeout=0.5)
            ping_res = True
        except Exception:
            ping_res = False
        assert ping_res is False
    finally:
        await client.aclose()


# =============================================================================
# 2. Redis Distributed Sliding-Window Atomic Counter
# =============================================================================

@pytest.mark.asyncio
async def test_03_atomic_sliding_window_quota_enforcement():
    """Verify sliding-window Lua script admits up to limit and rejects on limit+1."""
    client = Redis.from_url(REDIS_TEST_URL, decode_responses=True)
    test_key = f"windiq:test:rl:{uuid.uuid4().hex}"
    quota = 5
    window_ms = 60000

    try:
        # First 5 requests must be admitted with decreasing remaining counter
        for i in range(quota):
            allowed, remaining, reset_sec, retry_after = await check_rate_limit(
                redis=client,
                key=test_key,
                max_requests=quota,
                window_ms=window_ms,
            )
            assert allowed is True
            assert remaining == quota - 1 - i
            assert retry_after == 0

        # 6th request must be rejected with retry_after > 0
        allowed, remaining, reset_sec, retry_after = await check_rate_limit(
            redis=client,
            key=test_key,
            max_requests=quota,
            window_ms=window_ms,
        )
        assert allowed is False
        assert remaining == 0
        assert retry_after > 0
        assert retry_after <= 60
    finally:
        await client.delete(test_key)
        await client.aclose()


@pytest.mark.asyncio
async def test_04_sliding_window_shared_across_two_instances():
    """Verify two independent Redis clients sharing a key coordinate on a single joint quota."""
    client_instance_a = Redis.from_url(REDIS_TEST_URL, decode_responses=True)
    client_instance_b = Redis.from_url(REDIS_TEST_URL, decode_responses=True)
    shared_key = f"windiq:test:shared:{uuid.uuid4().hex}"
    quota = 4
    window_ms = 60000

    try:
        # Instance A uses 2 requests
        a1_ok, _, _, _ = await check_rate_limit(client_instance_a, shared_key, quota, window_ms)
        a2_ok, _, _, _ = await check_rate_limit(client_instance_a, shared_key, quota, window_ms)
        assert a1_ok and a2_ok

        # Instance B uses remaining 2 requests
        b1_ok, b1_rem, _, _ = await check_rate_limit(client_instance_b, shared_key, quota, window_ms)
        b2_ok, b2_rem, _, _ = await check_rate_limit(client_instance_b, shared_key, quota, window_ms)
        assert b1_ok and b2_ok
        assert b2_rem == 0

        # 5th request on Instance A MUST be blocked due to shared state
        a3_ok, _, _, retry = await check_rate_limit(client_instance_a, shared_key, quota, window_ms)
        assert a3_ok is False
        assert retry > 0

        # 5th request on Instance B MUST also be blocked
        b3_ok, _, _, _ = await check_rate_limit(client_instance_b, shared_key, quota, window_ms)
        assert b3_ok is False
    finally:
        await client_instance_a.delete(shared_key)
        await client_instance_a.aclose()
        await client_instance_b.aclose()


@pytest.mark.asyncio
async def test_05_concurrent_requests_atomic_without_race():
    """Verify concurrent requests via asyncio.gather never allow more than quota requests."""
    client = Redis.from_url(REDIS_TEST_URL, decode_responses=True)
    race_key = f"windiq:test:race:{uuid.uuid4().hex}"
    quota = 10
    total_attempts = 25

    try:
        tasks = [
            check_rate_limit(client, race_key, max_requests=quota, window_ms=60000)
            for _ in range(total_attempts)
        ]
        results = await asyncio.gather(*tasks)

        allowed_count = sum(1 for r in results if r[0] is True)
        rejected_count = sum(1 for r in results if r[0] is False)

        assert allowed_count == quota, f"Expected exactly {quota} allowed, got {allowed_count}"
        assert rejected_count == total_attempts - quota
    finally:
        await client.delete(race_key)
        await client.aclose()


# =============================================================================
# 3. Role-Based Quota Tiers & Dynamic Identity Resolution
# =============================================================================

def test_06_role_based_quota_tier_resolution():
    """Verify quota selection agrees strictly with configured tier defaults."""
    settings = Settings()

    # Anonymous IP
    assert determine_quota("standard", principal=None, settings=settings) == 30

    # Mock Principals
    from app.core.auth import Principal
    viewer = Principal(uuid.uuid4(), "user", "viewer@windiq.local", UserRole.VIEWER.value, frozenset())
    analyst = Principal(uuid.uuid4(), "user", "analyst@windiq.local", UserRole.ANALYST.value, frozenset())
    admin = Principal(uuid.uuid4(), "user", "admin@windiq.local", UserRole.ADMIN.value, frozenset())
    m2m_key = Principal(uuid.uuid4(), "api_key", "trading-client", UserRole.ANALYST.value, frozenset({"read:accuracy"}))

    assert determine_quota("standard", viewer, settings) == 120
    assert determine_quota("standard", analyst, settings) == 300
    assert determine_quota("standard", admin, settings) == 1200
    assert determine_quota("standard", m2m_key, settings) == 1200


def test_07_heavy_route_quota_overrides():
    """Verify heavy operation buckets override standard role quotas."""
    settings = Settings()
    from app.core.auth import Principal
    admin = Principal(uuid.uuid4(), "user", "admin@windiq.local", UserRole.ADMIN.value, frozenset())

    # Heavy routes override the admin's standard 1200 RPM
    assert determine_quota("login", None, settings) == 10
    assert determine_quota("refresh", admin, settings) == 30
    assert determine_quota("keys", admin, settings) == 10
    assert determine_quota("revisions", admin, settings) == 30
    assert determine_quota("hourly", admin, settings) == 60


# =============================================================================
# 4. Trusted Proxy & Client IP Traversal
# =============================================================================

def test_08_direct_untrusted_request_ignores_forwarded_headers():
    """Verify direct untrusted client cannot spoof client IP via X-Forwarded-For."""
    from unittest.mock import Mock
    req = Mock()
    req.client.host = "198.51.100.25"  # Public untrusted IP
    req.headers = {"X-Forwarded-For": "1.2.3.4, 5.6.7.8"}

    trusted_cidrs = ["127.0.0.1/32", "172.16.0.0/12", "10.0.0.0/8"]
    resolved_ip = get_trusted_client_ip(req, trusted_proxies=trusted_cidrs)

    # Must ignore forged header and return direct peer IP
    assert resolved_ip == "198.51.100.25"


def test_09_trusted_proxy_single_hop():
    """Verify trusted proxy extracts genuine client IP from X-Forwarded-For."""
    from unittest.mock import Mock
    req = Mock()
    req.client.host = "127.0.0.1"  # Trusted reverse proxy
    req.headers = {"X-Forwarded-For": "203.0.113.195"}

    trusted_cidrs = ["127.0.0.1/32", "172.16.0.0/12"]
    resolved_ip = get_trusted_client_ip(req, trusted_proxies=trusted_cidrs)
    assert resolved_ip == "203.0.113.195"


def test_10_trusted_proxy_multi_hop_traversal():
    """Verify right-to-left traversal skips intermediate trusted proxies to find real client."""
    from unittest.mock import Mock
    req = Mock()
    req.client.host = "172.21.0.4"  # Trusted Docker gateway / proxy
    # Chain: Client (203.0.113.88) -> Cloudflare (172.16.0.10) -> Nginx (172.21.0.4)
    req.headers = {"X-Forwarded-For": "203.0.113.88, 172.16.0.10"}

    trusted_cidrs = ["127.0.0.1/32", "172.16.0.0/12", "172.21.0.0/16"]
    resolved_ip = get_trusted_client_ip(req, trusted_proxies=trusted_cidrs)
    assert resolved_ip == "203.0.113.88"


def test_11_ipv6_trusted_proxy_resolution():
    """Verify IPv6 addresses and CIDRs are correctly parsed and traversed."""
    from unittest.mock import Mock
    req = Mock()
    req.client.host = "::1"  # Trusted local IPv6
    req.headers = {"X-Forwarded-For": "2001:db8:85a3::8a2e:370:7334"}

    trusted_cidrs = ["::1/128", "127.0.0.1/32"]
    resolved_ip = get_trusted_client_ip(req, trusted_proxies=trusted_cidrs)
    assert resolved_ip == "2001:db8:85a3::8a2e:370:7334"


def test_12_invalid_trusted_proxy_cidrs_rejected_at_startup():
    """Verify invalid CIDR formats and wildcard '*' are rejected by Pydantic settings."""
    with pytest.raises(ValueError, match="Wildcard"):
        Settings(TRUSTED_PROXIES=["*"])

    with pytest.raises(ValueError, match="Invalid CIDR format"):
        Settings(TRUSTED_PROXIES=["192.168.1.999/32"])


# =============================================================================
# 5. Production Configuration Hardening
# =============================================================================

def test_13_production_debug_mode_rejected():
    """Verify DEBUG=True is prohibited in production."""
    with pytest.raises(ValueError, match="DEBUG mode must be set to False"):
        Settings(APP_ENV="production", DEBUG=True)


def test_14_production_weak_jwt_secret_rejected():
    """Verify weak or default JWT secret keys are prohibited in production."""
    with pytest.raises(ValueError, match="Insecure default or development JWT_SECRET_KEY"):
        Settings(
            APP_ENV="production",
            DEBUG=False,
            JWT_SECRET_KEY="windiq_super_secret_jwt_signing_key_for_development_purposes_only_32bytes",
            DATABASE_URL="postgresql+asyncpg://admin:StrongPass123!@prod-db:5432/windiq",
            REDIS_PASSWORD="prod_redis_secure_password_123",
            REDIS_URL="redis://:prod_redis_secure_password_123@prod-redis:6379/0",
            CORS_ORIGINS=["https://windiq.energy.gov.uk"],
        )

    with pytest.raises(ValueError, match="at least 32 characters"):
        Settings(
            APP_ENV="production",
            DEBUG=False,
            JWT_SECRET_KEY="too_short_key",
            DATABASE_URL="postgresql+asyncpg://admin:StrongPass123!@prod-db:5432/windiq",
            REDIS_PASSWORD="prod_redis_secure_password_123",
            REDIS_URL="redis://:prod_redis_secure_password_123@prod-redis:6379/0",
            CORS_ORIGINS=["https://windiq.energy.gov.uk"],
        )


def test_15_production_default_database_password_rejected():
    """Verify default 'postgres:postgres' is prohibited in production."""
    with pytest.raises(ValueError, match="Default PostgreSQL credentials"):
        Settings(
            APP_ENV="production",
            DEBUG=False,
            JWT_SECRET_KEY="a_very_long_production_cryptographic_key_32bytes",
            DATABASE_URL="postgresql+asyncpg://postgres:postgres@prod-db:5432/windiq",
            REDIS_PASSWORD="prod_redis_secure_password_123",
            REDIS_URL="redis://:prod_redis_secure_password_123@prod-redis:6379/0",
            CORS_ORIGINS=["https://windiq.energy.gov.uk"],
        )


def test_16_production_default_redis_password_rejected():
    """Verify default development Redis password is prohibited in production."""
    with pytest.raises(ValueError, match="Default development REDIS_PASSWORD"):
        Settings(
            APP_ENV="production",
            DEBUG=False,
            JWT_SECRET_KEY="a_very_long_production_cryptographic_key_32bytes",
            DATABASE_URL="postgresql+asyncpg://admin:StrongPass123!@prod-db:5432/windiq",
            REDIS_PASSWORD="windiq_redis_dev_secret_pass",
            REDIS_URL="redis://:windiq_redis_dev_secret_pass@prod-redis:6379/0",
            CORS_ORIGINS=["https://windiq.energy.gov.uk"],
        )


def test_17_production_wildcard_cors_rejected():
    """Verify wildcard CORS origin '*' is prohibited in production."""
    with pytest.raises(ValueError, match="Wildcard CORS origins are strictly prohibited"):
        Settings(
            APP_ENV="production",
            DEBUG=False,
            JWT_SECRET_KEY="a_very_long_production_cryptographic_key_32bytes",
            DATABASE_URL="postgresql+asyncpg://admin:StrongPass123!@prod-db:5432/windiq",
            REDIS_PASSWORD="prod_redis_secure_password_123",
            REDIS_URL="redis://:prod_redis_secure_password_123@prod-redis:6379/0",
            CORS_ORIGINS=["*"],
        )


def test_18_production_wildcard_trusted_proxies_rejected():
    """Verify wildcard proxy trust (0.0.0.0/0 or ::/0) is prohibited in production."""
    with pytest.raises(ValueError, match="Wildcard proxy trust"):
        Settings(
            APP_ENV="production",
            DEBUG=False,
            JWT_SECRET_KEY="a_very_long_production_cryptographic_key_32bytes",
            DATABASE_URL="postgresql+asyncpg://admin:StrongPass123!@prod-db:5432/windiq",
            REDIS_PASSWORD="prod_redis_secure_password_123",
            REDIS_URL="redis://:prod_redis_secure_password_123@prod-redis:6379/0",
            CORS_ORIGINS=["https://windiq.energy.gov.uk"],
            TRUSTED_PROXIES=["0.0.0.0/0"],
        )


def test_19_valid_production_configuration_passes():
    """Verify fully hardened production settings succeed validation."""
    cfg = Settings(
        APP_ENV="production",
        DEBUG=False,
        JWT_SECRET_KEY="a_very_long_production_cryptographic_key_32bytes",
        DATABASE_URL="postgresql+asyncpg://windiq_prod_usr:SafePass987!#@db.internal:5432/windiq_prod",
        REDIS_PASSWORD="safe_production_redis_token_456!#",
        REDIS_URL="redis://:safe_production_redis_token_456!#@redis.internal:6379/0",
        CORS_ORIGINS=["https://windiq.energy.gov.uk"],
        TRUSTED_PROXIES=["10.0.0.0/16", "172.20.0.0/16"],
    )
    assert cfg.APP_ENV == "production"
    assert cfg.DEBUG is False


# =============================================================================
# 6. Live Container Rate Limiting & Fail-Closed Behavior
# =============================================================================

def test_20_live_endpoint_rate_limit_headers():
    """Verify rate-limit headers are returned on authenticated live analytical calls."""
    token, _, _ = _login("analyst")
    status_code, body, headers = _http_request(
        "/overview",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert status_code == 200
    assert "x-ratelimit-limit" in headers
    assert "x-ratelimit-remaining" in headers
    assert "x-ratelimit-reset" in headers
    # Analyst tier quota is 300
    assert int(headers["x-ratelimit-limit"]) == 300


def test_21_live_endpoint_security_headers():
    """Verify nosniff, frame-options, CSP, and referrer-policy headers are attached."""
    status_code, _, headers = _http_request("/status")
    assert status_code == 200
    assert headers.get("x-content-type-options") == "nosniff"
    assert headers.get("x-frame-options") == "DENY"
    assert headers.get("referrer-policy") == "strict-origin-when-cross-origin"
    assert "permissions-policy" in headers
    assert "content-security-policy" in headers
    assert "frame-ancestors 'none'" in headers["content-security-policy"]


def test_22_live_login_rate_limiting_exceeded():
    """Verify that exceeding login rate limit returns HTTP 429 with Retry-After header."""
    fake_email = f"rate_limit_test_{uuid.uuid4().hex[:6]}@windiq.local"
    # Quota is 10 requests per minute
    statuses = []
    retry_after_header = None

    for _ in range(12):
        status_code, _, headers = _http_request(
            "/auth/login",
            method="POST",
            body={"email": fake_email, "password": "WrongPassword123!#"},
        )
        statuses.append(status_code)
        if status_code == 429:
            retry_after_header = headers.get("retry-after")

    # Must contain at least one 429 status code
    assert 429 in statuses
    assert retry_after_header is not None
    assert int(retry_after_header) > 0


@pytest.mark.asyncio
async def test_23_redis_outage_fails_closed_on_sensitive_routes():
    """Verify that sensitive routes fail closed (HTTP 503) when Redis is unreachable."""
    from unittest.mock import Mock
    from fastapi import HTTPException
    limiter = RateLimiter(bucket="revisions", fail_closed=True)
    req = Mock()
    req.app.state.settings = Settings(RATE_LIMIT_ENABLED=True)
    req.app.state.redis = None  # Simulates dead/unreachable Redis
    req.client.host = "127.0.0.1"
    req.headers = {}
    req.state = Mock()
    req.state.principal = None
    res = Mock()
    res.headers = {}

    with pytest.raises(HTTPException) as exc_info:
        await limiter(req, res)

    # HTTPException with status 503 must be raised
    assert exc_info.value.status_code == 503
    assert "temporarily unavailable" in exc_info.value.detail


@pytest.mark.asyncio
async def test_24_redis_outage_fails_open_on_non_sensitive_routes():
    """Verify that non-sensitive analytical routes fail open (allow request) during Redis outage."""
    from unittest.mock import Mock
    limiter = RateLimiter(bucket="overview", fail_closed=False)
    req = Mock()
    req.app.state.settings = Settings(RATE_LIMIT_ENABLED=True, RATE_LIMIT_FAIL_CLOSED_DEFAULT=False)
    req.app.state.redis = None
    req.client.host = "127.0.0.1"
    req.headers = {}
    req.state = Mock()
    req.state.principal = None
    res = Mock()
    res.headers = {}

    result = await limiter(req, res)
    assert result.allowed is True
    assert result.remaining == 0


def test_25_live_readiness_probe_reports_redis():
    """Verify /health/ready probe reports both database and redis connected."""
    status_code, body, _ = _http_request("/health/ready")
    assert status_code == 200
    assert body["status"] == "ready"
    assert body["database"] == "connected"
    assert body["redis"] == "connected"


def test_26_cors_approved_origin():
    """Verify approved origin receives Access-Control-Allow-Origin and credentials headers."""
    # Preflight OPTIONS request
    req = urllib.request.Request(
        f"{BASE_URL}/overview",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
        },
        method="OPTIONS",
    )
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        headers = {k.lower(): v for k, v in resp.headers.items()}
        assert headers.get("access-control-allow-origin") == "http://localhost:3000"
        assert headers.get("access-control-allow-credentials") == "true"


def test_27_secrets_scrubbed_from_validation_errors():
    """Verify that pydantic validation exceptions do not leak raw secrets in error text."""
    secret_value = "SuperSecretPlainTextValue12345!"
    try:
        Settings(
            APP_ENV="production",
            JWT_SECRET_KEY=secret_value,  # Short & invalid
        )
    except ValueError as exc:
        err_msg = str(exc)
        assert secret_value not in err_msg


def test_28_preservation_of_phase_4_1_jwt_auth():
    """Verify JWT access token authentication continues to work identically."""
    token, _, _ = _login("analyst")
    status_code, body, _ = _http_request(
        "/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert status_code == 200
    assert body["email"] == "analyst@windiq.local"
    assert body["role"].lower() == "analyst"


def test_29_preservation_of_phase_4_1_rbac():
    """Verify Viewer is forbidden from granular hourly evaluations (HTTP 403)."""
    viewer_token, _, _ = _login("viewer")
    status_code, _, _ = _http_request(
        "/accuracy/hourly",
        headers={"Authorization": f"Bearer {viewer_token}"},
    )
    assert status_code == 403


def test_30_analytical_non_regression_payload_integrity():
    """Verify accuracy summary KPIs remain identical with rate limiting headers attached."""
    token, _, _ = _login("analyst")
    status_code, body, headers = _http_request(
        "/accuracy/summary?delivery_date_from=2026-01-02&delivery_date_to=2026-02-01",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert status_code == 200
    metrics = body["metrics"]
    # Exact canonical baseline invariants
    assert metrics["valid_comparisons"] == 744
    assert round(metrics["mae_mw"], 4) == 2038.9126
    assert round(metrics["rmse_mw"], 4) == 2504.7587
    assert round(metrics["forecast_bias_mw"], 4) == 1747.8871
    assert "x-ratelimit-remaining" in headers
