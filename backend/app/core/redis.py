"""Redis client connection pool lifecycle, health checking, and accessor."""

import asyncio
from typing import Any

from redis.asyncio import ConnectionPool, Redis
from redis.exceptions import ConnectionError, RedisError, TimeoutError

from app.core.config import Settings, get_settings
from app.core.logging import get_logger

logger = get_logger("windiq.core.redis")

# Global singleton client and pool per worker process
_redis_pool: ConnectionPool | None = None
_redis_client: Redis | None = None
_pool_lock = asyncio.Lock()


async def init_redis_pool(settings: Settings | None = None) -> Redis:
    """Initialize managed asynchronous Redis connection pool and verify connectivity."""
    global _redis_pool, _redis_client
    cfg = settings or get_settings()

    async with _pool_lock:
        if _redis_client is not None:
            return _redis_client

        logger.info(
            "Initializing Redis client pool [url=%s, connect_timeout=%.1fs, socket_timeout=%.1fs]",
            cfg.REDIS_URL.split("@")[-1] if "@" in cfg.REDIS_URL else cfg.REDIS_URL,
            cfg.REDIS_CONNECT_TIMEOUT_SECONDS,
            cfg.REDIS_SOCKET_TIMEOUT_SECONDS,
        )

        _redis_pool = ConnectionPool.from_url(
            cfg.REDIS_URL,
            max_connections=50,
            socket_connect_timeout=cfg.REDIS_CONNECT_TIMEOUT_SECONDS,
            socket_timeout=cfg.REDIS_SOCKET_TIMEOUT_SECONDS,
            retry_on_timeout=True,
            decode_responses=True,
        )
        client = Redis(connection_pool=_redis_pool)

        # Non-blocking connectivity ping verification on startup
        try:
            await asyncio.wait_for(client.ping(), timeout=cfg.REDIS_CONNECT_TIMEOUT_SECONDS)
            logger.info("Connected successfully to shared Redis 7 coordination store")
        except Exception as exc:
            logger.warning(
                "Redis store not immediately reachable during startup: %s. Distributed rate limiter will apply outage policy.",
                exc,
            )

        _redis_client = client
        return _redis_client


async def close_redis_pool() -> None:
    """Gracefully disconnect all Redis connections during process shutdown."""
    global _redis_pool, _redis_client
    async with _pool_lock:
        if _redis_client is not None:
            try:
                await _redis_client.aclose()
            except Exception as exc:
                logger.warning("Error closing Redis client: %s", exc)
            _redis_client = None

        if _redis_pool is not None:
            try:
                await _redis_pool.disconnect()
            except Exception as exc:
                logger.warning("Error disconnecting Redis pool: %s", exc)
            _redis_pool = None

    logger.info("Shared Redis client pool terminated cleanly")


def get_redis_client() -> Redis | None:
    """Retrieve active singleton Redis client (returns None if uninitialized)."""
    return _redis_client


async def check_redis_health(settings: Settings | None = None) -> bool:
    """Perform diagnostic health check ping against Redis without blocking event loop."""
    client = get_redis_client()
    if client is None:
        return False
    try:
        cfg = settings or get_settings()
        timeout = min(cfg.REDIS_CONNECT_TIMEOUT_SECONDS, 2.0)
        res = await asyncio.wait_for(client.ping(), timeout=timeout)
        return bool(res)
    except (ConnectionError, TimeoutError, asyncio.TimeoutError, RedisError, Exception) as exc:
        logger.debug("Redis health check failed: %s", exc)
        return False

