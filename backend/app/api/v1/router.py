"""API Version 1 Router definitions."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends

from app.api.v1.accuracy import router as accuracy_router
from app.api.v1.auth import router as auth_router
from app.api.v1.data_health import router as data_health_router
from app.api.v1.forecasts import router as forecasts_router
from app.api.v1.overview import router as overview_router
from app.core.rate_limit import RateLimiter

api_v1_router = APIRouter()


@api_v1_router.get(
    "/status",
    summary="V1 API Status Ping",
    tags=["System"],
    dependencies=[Depends(RateLimiter(bucket="status"))],
)
async def get_v1_status() -> dict:
    """Returns Version 1 API status and active capability flags."""
    return {
        "api_version": "v1",
        "status": "active",
        "timestamp": datetime.now(UTC).isoformat(),
        "available_endpoints": [
            "/api/v1/status",
            "/api/v1/overview",
            "/api/v1/forecasts",
            "/api/v1/accuracy/summary",
            "/api/v1/accuracy/daily",
            "/api/v1/accuracy/hourly",
            "/api/v1/data-health",
        ],
    }


# Include Phase 2.4 & Phase 4.1 endpoint routers
api_v1_router.include_router(auth_router)
api_v1_router.include_router(overview_router)
api_v1_router.include_router(forecasts_router)
api_v1_router.include_router(accuracy_router)
api_v1_router.include_router(data_health_router)
