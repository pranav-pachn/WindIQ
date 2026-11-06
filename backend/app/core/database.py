"""Database connection, async engine, session factory, and health checks."""

import asyncio
from collections.abc import AsyncGenerator
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from app.core.config import Settings, get_settings
from app.core.logging import get_logger

logger = get_logger("windiq.database")

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def get_engine(settings: Settings | None = None) -> AsyncEngine:
    """Obtain or initialize the global async engine."""
    global _engine
    if _engine is None:
        cfg = settings or get_settings()
        connect_args: dict[str, Any] = {}
        if ":6543" in cfg.DATABASE_URL or cfg.DB_DISABLE_STATEMENT_CACHE:
            connect_args["statement_cache_size"] = 0
            connect_args["prepared_statement_cache_size"] = 0

        if cfg.APP_ENV in ("test", "testing"):
            _engine = create_async_engine(
                cfg.DATABASE_URL,
                poolclass=NullPool,
                connect_args=connect_args,
                echo=cfg.DEBUG and cfg.APP_ENV != "production",
            )
        else:
            _engine = create_async_engine(
                cfg.DATABASE_URL,
                pool_size=cfg.DB_POOL_SIZE,
                max_overflow=cfg.DB_MAX_OVERFLOW,
                pool_timeout=cfg.DB_POOL_TIMEOUT,
                pool_recycle=cfg.DB_POOL_RECYCLE,
                pool_pre_ping=True,
                connect_args=connect_args,
                echo=cfg.DEBUG and cfg.APP_ENV != "production",
            )
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    """Obtain or initialize the async sessionmaker."""
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(
            bind=get_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
            autoflush=False,
        )
    return _session_factory


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency yielding a transactional async database session."""
    session_factory = get_session_factory()
    async with session_factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def check_db_health(
    engine: AsyncEngine | None = None,
    settings: Settings | None = None,
    timeout_seconds: float = 10.0,
) -> bool:
    """Execute a lightweight async connectivity check against PostgreSQL.

    Returns True if database is reachable, False otherwise.
    Never exposes database credentials in logs.
    """
    target_engine = engine
    temp_engine = None
    try:
        if target_engine is None:
            if settings is not None:
                connect_args: dict[str, Any] = {}
                if ":6543" in settings.DATABASE_URL or settings.DB_DISABLE_STATEMENT_CACHE:
                    connect_args["statement_cache_size"] = 0
                    connect_args["prepared_statement_cache_size"] = 0
                temp_engine = create_async_engine(
                    settings.DATABASE_URL,
                    pool_pre_ping=True,
                    connect_args=connect_args,
                )
                target_engine = temp_engine
            else:
                target_engine = get_engine()

        async with asyncio.timeout(timeout_seconds):
            async with target_engine.connect() as conn:
                result = await conn.execute(text("SELECT 1"))
                return result.scalar() == 1
    except Exception as exc:
        logger.warning("Database readiness probe failed: %s", type(exc).__name__)
        return False
    finally:
        if temp_engine is not None:
            await temp_engine.dispose()


async def close_db() -> None:
    """Dispose of database engine connections during application shutdown."""
    global _engine, _session_factory
    if _engine is not None:
        await _engine.dispose()
        _engine = None
        _session_factory = None
        logger.info("Database engine connection pool disposed")
