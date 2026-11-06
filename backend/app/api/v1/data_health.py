"""Data health endpoint evaluating pipeline integrity, dataset freshness, and anomaly events."""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_permission
from app.core.database import get_db
from app.core.logging import get_logger
from app.core.rate_limit import RateLimiter
from app.schemas.data_health import DataHealthResponse
from app.services.analytics_service import AnalyticsService

logger = get_logger("windiq.api.data_health")
router = APIRouter(tags=["Data Health"])


@router.get(
    "/data-health",
    response_model=DataHealthResponse,
    dependencies=[
        Depends(require_permission("health:read")),
        Depends(RateLimiter(bucket="health")),
    ],
    summary="Platform Data Health and Ingestion Scorecard",
    description=(
        "Returns system integrity health scorecard, publication timing health, "
        "and logged data quality anomalies."
    ),
)
async def get_data_health(
    request: Request,
    delivery_date_from: date | None = Query(
        default=None,
        description="Start delivery date for health window (inclusive, YYYY-MM-DD)",
    ),
    delivery_date_to: date | None = Query(
        default=None,
        description="End delivery date for health window (inclusive, YYYY-MM-DD)",
    ),
    severity: str | None = Query(
        default=None,
        pattern="^(INFO|WARNING|ERROR|CRITICAL)$",
        description="Filter recent quality events by severity level",
    ),
    db: AsyncSession = Depends(get_db),
) -> DataHealthResponse:
    """Fetch system integrity scorecard and recent data quality events."""
    if delivery_date_from and delivery_date_to and delivery_date_from > delivery_date_to:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="delivery_date_to must be greater than or equal to delivery_date_from",
        )

    try:
        scheduler = getattr(request.app.state, "scheduler", None)
        service = AnalyticsService(db)
        return await service.get_data_health(
            delivery_date_from=delivery_date_from,
            delivery_date_to=delivery_date_to,
            severity=severity,
            scheduler=scheduler,
        )
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(val_err),
        ) from val_err
    except Exception as exc:
        logger.exception("Failed to query data health: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve data health scorecard.",
        ) from exc
