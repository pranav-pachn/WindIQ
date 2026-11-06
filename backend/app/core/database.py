"""Database connection, async engine, session factory, and health checks."""

import asyncio
from collections.abc import AsyncGenerator

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
        if cfg.APP_ENV in ("test", "testing"):
            _engine = create_async_engine(
                cfg.DATABASE_URL,
                poolclass=NullPool,
                echo=cfg.DEBUG and cfg.APP_ENV != "production",
            )
        else:
            _engine = create_async_engine(
                cfg.DATABASE_URL,
                pool_size=10,
                max_overflow=20,
                pool_timeout=30.0,
                pool_recycle=1800,
                pool_pre_ping=True,
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
    timeout_seconds: float = 2.0,
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
                temp_engine = create_async_engine(settings.DATABASE_URL, pool_pre_ping=True)
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
