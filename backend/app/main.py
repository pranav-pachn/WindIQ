"""FastAPI application factory, middleware, and core endpoints."""

import time
import uuid
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from fastapi import FastAPI, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_v1_router
from app.core.config import Settings, get_settings
from app.core.database import check_db_health, close_db, get_engine
from app.core.logging import get_logger, request_id_ctx, setup_logging

logger = get_logger("windiq.app")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifecycle context manager."""
    settings = getattr(app.state, "settings", None) or get_settings()
    setup_logging(log_level=settings.LOG_LEVEL)
    logger.info(
        "Starting %s [env=%s, debug=%s, tz=%s, cutoff=%02d:%02d]",
        settings.APP_NAME,
        settings.APP_ENV,
        settings.DEBUG,
        settings.TIMEZONE,
        settings.DECISION_CUTOFF_HOUR,
        settings.DECISION_CUTOFF_MINUTE,
    )

    # Seed development role accounts if empty
    try:
        from app.core.database import get_session_factory
        from app.services.auth_service import AuthService

        session_factory = get_session_factory()
        async with session_factory() as session:
            auth_service = AuthService(session)
            await auth_service.seed_default_users_if_empty()
    except Exception as exc:
        logger.warning("Auth account seeding skipped or pending migration: %s", exc)

    # Initialize shared Redis coordination store
    try:
        from app.core.redis import init_redis_pool
        redis_client = await init_redis_pool(settings=settings)
        app.state.redis = redis_client
    except Exception as exc:
        logger.warning("Failed to initialize Redis pool on startup: %s", exc)

    scheduler = None
    should_start_scheduler = settings.SCHEDULER_ENABLED and (
        settings.APP_ENV not in ("test", "testing")
        or getattr(app.state, "start_scheduler_in_test", False)
    )

    if should_start_scheduler:
        try:
            from app.services.scheduler import WindIQScheduler

            scheduler = WindIQScheduler(settings=settings)
            await scheduler.start()
            app.state.scheduler = scheduler
            logger.info("WindIQScheduler started successfully")
        except Exception as exc:
            logger.exception("Failed to start WindIQScheduler: %s", exc)

    yield

    if scheduler is not None:
        try:
            await scheduler.stop()
            logger.info("WindIQScheduler stopped successfully")
        except Exception as exc:
            logger.exception("Error stopping WindIQScheduler: %s", exc)

    try:
        from app.core.redis import close_redis_pool
        await close_redis_pool()
    except Exception as exc:
        logger.warning("Error during Redis pool shutdown: %s", exc)

    await close_db()
    logger.info("Shutting down %s", settings.APP_NAME)


def create_app(settings: Settings | None = None) -> FastAPI:
    """FastAPI application factory."""
    cfg = settings or get_settings()

    app = FastAPI(
        title=cfg.APP_NAME,
        version="2.1.0",
        description="Enterprise UK Wind Generation Forecast Accuracy Analytics Platform",
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )
    app.state.settings = cfg

    # 1. CORS Middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cfg.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=[
            "X-Request-ID",
            "X-Process-Time-Ms",
            "X-RateLimit-Limit",
            "X-RateLimit-Remaining",
            "X-RateLimit-Reset",
            "Retry-After",
        ],
    )

    # 2. Security Headers, Correlation ID & Tracing Middleware
    @app.middleware("http")
    async def security_and_tracing_middleware(request: Request, call_next) -> Response:
        # Extract or generate correlation ID
        req_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        token = request_id_ctx.set(req_id)
        start_time = time.perf_counter()

        def _apply_security_headers(res: Response) -> Response:
            res.headers["X-Content-Type-Options"] = "nosniff"
            res.headers["X-Frame-Options"] = "DENY"
            res.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
            res.headers["Permissions-Policy"] = (
                "accelerometer=(), camera=(), geolocation=(), gyroscope=(), "
                "magnetometer=(), microphone=(), payment=(), usb=()"
            )
            res.headers["Content-Security-Policy"] = (
                "default-src 'self'; script-src 'self' 'unsafe-inline'; "
                "style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; "
                "font-src 'self' data:; connect-src 'self' http: https: ws: wss:; "
                "frame-ancestors 'none';"
            )
            if cfg.AUTH_COOKIE_SECURE or cfg.APP_ENV.lower() == "production":
                res.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
            origin = request.headers.get("origin")
            if origin and "Access-Control-Allow-Origin" not in res.headers:
                if origin in cfg.CORS_ORIGINS or "*" in cfg.CORS_ORIGINS:
                    res.headers["Access-Control-Allow-Origin"] = origin
                    res.headers["Access-Control-Allow-Credentials"] = "true"
            return res

        try:
            response = await call_next(request)
            duration_ms = round((time.perf_counter() - start_time) * 1000, 2)

            # Log request outcome (scrub any credentials or query params with tokens)
            logger.info(
                "%s %s -> HTTP %d (%.2fms)",
                request.method,
                request.url.path,
                response.status_code,
                duration_ms,
            )

            # Attach tracing headers and security headers to response
            response.headers["X-Request-ID"] = req_id
            response.headers["X-Process-Time-Ms"] = str(duration_ms)
            return _apply_security_headers(response)
        except Exception as exc:
            duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
            logger.exception(
                "Unhandled exception on %s %s after %.2fms: %s",
                request.method,
                request.url.path,
                duration_ms,
                exc,
            )
            err_res = JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content={
                    "error": {
                        "code": "INTERNAL_SERVER_ERROR",
                        "message": "An unexpected server error occurred.",
                        "request_id": req_id,
                        "timestamp": datetime.now(UTC).isoformat(),
                    }
                },
                headers={
                    "X-Request-ID": req_id,
                    "X-Process-Time-Ms": str(duration_ms),
                },
            )
            return _apply_security_headers(err_res)
        finally:
            request_id_ctx.reset(token)

    # 3. Core Root & Health Endpoints
    @app.get("/", summary="Application Root Metadata", tags=["System"])
    async def get_root() -> dict:
        """Returns application metadata, operational environment, and endpoint links."""
        return {
            "app_name": cfg.APP_NAME,
            "version": "2.1.0",
            "environment": cfg.APP_ENV,
            "status": "operational",
            "docs_url": "/docs",
            "health": {
                "liveness": "/health/live",
                "readiness": "/health/ready",
            },
            "api_v1_prefix": cfg.API_V1_PREFIX,
        }

    @app.get("/health/live", summary="Liveness Probe", tags=["Health"])
    async def get_liveness() -> dict:
        """K8s/Docker liveness check verifying the HTTP worker is responsive."""
        return {
            "status": "alive",
            "timestamp": datetime.now(UTC).isoformat(),
            "environment": cfg.APP_ENV,
        }

    @app.get("/health/ready", summary="Readiness Probe", tags=["Health"])
    async def get_readiness(request: Request) -> Response:
        """K8s/Docker readiness check verifying underlying database and Redis availability."""
        from app.core.redis import check_redis_health

        app_settings = getattr(request.app.state, "settings", None)
        is_db_ready = await check_db_health(engine=get_engine(app_settings))
        is_redis_ready = await check_redis_health(settings=app_settings)
        is_ready = is_db_ready and is_redis_ready

        payload = {
            "status": "ready" if is_ready else "unhealthy",
            "database": "connected" if is_db_ready else "disconnected",
            "redis": "connected" if is_redis_ready else "disconnected",
            "timestamp": datetime.now(UTC).isoformat(),
            "version": "2.2.0",
        }
        status_code = status.HTTP_200_OK if is_ready else status.HTTP_503_SERVICE_UNAVAILABLE
        return JSONResponse(status_code=status_code, content=payload)

    # 4. Register API v1 Routers
    app.include_router(api_v1_router, prefix=cfg.API_V1_PREFIX)

    return app


# Default application instance for Uvicorn ASGI runner
app = create_app()
