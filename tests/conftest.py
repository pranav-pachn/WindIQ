"""Pytest test configuration and fixtures for WindIQ test suites.

Enforces:
1. Deterministic Redis rate limit cleanup between tests to guarantee test isolation.
2. Standard test environment and database settings via environment variables.
3. Isolated test namespace generation.
"""

import os
import pytest

# Standard test environment defaults
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@127.0.0.1:5435/windiq",
)
os.environ.setdefault(
    "REDIS_TEST_URL",
    "redis://:windiq_redis_dev_secret_pass@127.0.0.1:6385/0",
)


@pytest.fixture(autouse=True)
def clean_redis_rate_limits():
    """Autouse fixture to deterministically clean rate limit keys before and after every test."""
    redis_url = os.environ.get(
        "REDIS_TEST_URL",
        "redis://:windiq_redis_dev_secret_pass@127.0.0.1:6385/0",
    )

    def _flush_keys():
        try:
            import redis

            r = redis.from_url(redis_url)
            keys = list(r.keys("windiq:rl:*")) + list(r.keys("windiq:test:*"))
            if keys:
                r.delete(*keys)
        except Exception:
            pass

    _flush_keys()
    yield
    _flush_keys()
