"""Accuracy endpoints providing overall summary KPIs, daily breakdowns, and hourly evaluations."""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_permission
from app.core.database import get_db
from app.core.logging import get_logger
from app.core.rate_limit import RateLimiter
from app.schemas.accuracy import (
    AccuracySummaryResponse,
    DailyAccuracyResponse,
    HourlyAccuracyResponse,
)
from app.services.analytics_service import AnalyticsService

logger = get_logger("windiq.api.accuracy")
router = APIRouter(prefix="/accuracy", tags=["Accuracy Analytics"])


@router.get(
    "/summary",
    response_model=AccuracySummaryResponse,
    dependencies=[
        Depends(require_permission("accuracy:read")),
        Depends(RateLimiter(bucket="accuracy")),
    ],
    summary="Overall Forecast Accuracy KPI Summary",
    description="Calculates overall forecast accuracy KPIs over an arbitrary delivery date window.",
)
async def get_accuracy_summary(
    delivery_date_from: date | None = Query(
        default=None,
        description="Start delivery date for KPI window (inclusive, YYYY-MM-DD)",
    ),
    delivery_date_to: date | None = Query(
        default=None,
        description="End delivery date for KPI window (inclusive, YYYY-MM-DD)",
    ),
    db: AsyncSession = Depends(get_db),
) -> AccuracySummaryResponse:
    """Compute verified summary KPIs across the selected delivery date range."""
    if delivery_date_from and delivery_date_to and delivery_date_from > delivery_date_to:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="delivery_date_to must be greater than or equal to delivery_date_from",
        )

    try:
        service = AnalyticsService(db)
        return await service.get_accuracy_summary(
            delivery_date_from=delivery_date_from,
            delivery_date_to=delivery_date_to,
        )
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(val_err),
        ) from val_err
    except Exception as exc:
        logger.exception("Failed to compute accuracy summary: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to compute accuracy summary.",
        ) from exc


@router.get(
    "/daily",
    response_model=DailyAccuracyResponse,
    dependencies=[
        Depends(require_permission("accuracy:read")),
        Depends(RateLimiter(bucket="accuracy")),
    ],
    summary="Daily Forecast Accuracy Table",
    description=(
        "Returns day-by-day accuracy metrics, completeness, and bias "
        "across delivery dates in Europe/London."
    ),
)
async def get_daily_accuracy(
    delivery_date_from: date | None = Query(
        default=None,
        description="Start delivery date (inclusive, YYYY-MM-DD)",
    ),
    delivery_date_to: date | None = Query(
        default=None,
        description="End delivery date (inclusive, YYYY-MM-DD)",
    ),
    sort_by: str = Query(
        default="delivery_date",
        pattern="^(delivery_date|mae_mw|mape_pct|bias_mw)$",
        description="Metric field to sort by",
    ),
    order: str = Query(
        default="asc",
        pattern="^(asc|desc)$",
        description="Sort direction (asc or desc)",
    ),
    page: int = Query(
        default=1,
        ge=1,
        description="Page number",
    ),
    page_size: int = Query(
        default=50,
        ge=1,
        le=200,
        description="Records per page",
    ),
    db: AsyncSession = Depends(get_db),
) -> DailyAccuracyResponse:
    """Fetch day-by-day table of accuracy metrics in Europe/London."""
    if delivery_date_from and delivery_date_to and delivery_date_from > delivery_date_to:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="delivery_date_to must be greater than or equal to delivery_date_from",
        )

    try:
        service = AnalyticsService(db)
        return await service.get_daily_accuracy(
            delivery_date_from=delivery_date_from,
            delivery_date_to=delivery_date_to,
            sort_by=sort_by,
            order=order,
            page=page,
            page_size=page_size,
        )
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(val_err),
        ) from val_err
    except Exception as exc:
        logger.exception("Failed to compute daily accuracy: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve daily accuracy.",
        ) from exc


@router.get(
    "/hourly",
    response_model=HourlyAccuracyResponse,
    dependencies=[
        Depends(require_permission("accuracy:hourly")),
        Depends(RateLimiter(bucket="hourly")),
    ],
    summary="Hourly Accuracy Series and Traceability",
    description=(
        "Returns granular hourly forecast-versus-actual comparison rows "
        "with mathematical lineage and hour-of-day profile."
    ),
)
async def get_hourly_accuracy(
    delivery_date: date | None = Query(
        default=None,
        description="Filter to single calendar day (YYYY-MM-DD)",
    ),
    delivery_date_from: date | None = Query(
        default=None,
        description="Filter start delivery date (inclusive, YYYY-MM-DD)",
    ),
    delivery_date_to: date | None = Query(
        default=None,
        description="Filter end delivery date (inclusive, YYYY-MM-DD)",
    ),
    hour_of_day: int | None = Query(
        default=None,
        ge=0,
        le=23,
        description="Filter by specific hour of day (0..23)",
    ),
    status_filter: str = Query(
        default="ALL",
        alias="status",
        pattern="^(ALL|VALID|MISSING_FORECAST|MISSING_ACTUAL)$",
        description="Filter evaluations by validity status",
    ),
    view: str = Query(
        default="series",
        pattern="^(series|hour_of_day)$",
        description="View mode: series (hourly rows) or hour_of_day (diurnal profile)",
    ),
    sort_by: str = Query(
        default="delivery_hour_utc",
        pattern="^(delivery_hour_utc|absolute_error_mw|signed_error_mw|forecast_generation_mw|actual_generation_mw)$",
        description="Field to sort by",
    ),
    order: str = Query(
        default="asc",
        pattern="^(asc|desc)$",
        description="Sort direction (asc or desc)",
    ),
    page: int = Query(
        default=1,
        ge=1,
        description="1-based page number",
    ),
    page_size: int = Query(
        default=50,
        ge=1,
        le=200,
        description="Records per page",
    ),
    db: AsyncSession = Depends(get_db),
) -> HourlyAccuracyResponse:
    """Fetch granular hourly evaluations with mathematical traceability and diurnal profiles."""
    if delivery_date_from and delivery_date_to and delivery_date_from > delivery_date_to:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="delivery_date_to must be greater than or equal to delivery_date_from",
        )

    try:
        service = AnalyticsService(db)
        return await service.get_hourly_accuracy(
            delivery_date=delivery_date,
            delivery_date_from=delivery_date_from,
            delivery_date_to=delivery_date_to,
            hour_of_day=hour_of_day,
            status=status_filter,
            view=view,
            sort_by=sort_by,
            order=order,
            page=page,
            page_size=page_size,
        )
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(val_err),
        ) from val_err
    except Exception as exc:
        logger.exception("Failed to query hourly accuracy: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve hourly accuracy.",
        ) from exc
