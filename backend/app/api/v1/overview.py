"""Overview endpoint returning platform status, evaluation window, and benchmark KPIs."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import Principal, require_permission
from app.core.database import get_db
from app.core.logging import get_logger
from app.core.rate_limit import RateLimiter
from app.schemas.overview import OverviewResponse
from app.services.analytics_service import AnalyticsService

logger = get_logger("windiq.api.overview")
router = APIRouter(tags=["Overview"])


@router.get(
    "/overview",
    response_model=OverviewResponse,
    dependencies=[
        Depends(require_permission("overview:read")),
        Depends(RateLimiter(bucket="overview")),
    ],
    summary="Platform Status and Evaluation Benchmark Overview",
    description=(
        "Returns high-level platform status, active evaluation period, "
        "overall benchmark KPIs, and data health."
    ),
)
async def get_platform_overview(
    db: AsyncSession = Depends(get_db),
) -> OverviewResponse:
    """Fetch high-level evaluation period, overall benchmark KPIs, and source dataset health."""
    try:
        service = AnalyticsService(db)
        return await service.get_overview()
    except Exception as exc:
        logger.exception("Failed to retrieve platform overview: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve platform overview.",
        ) from exc
