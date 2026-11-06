"""Forecasts endpoint querying day-ahead WINDFOR forecasts, publication lineage, multi-horizon analytics, and revisions."""

from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_permission
from app.core.database import get_db
from app.core.logging import get_logger
from app.core.rate_limit import RateLimiter
from app.schemas.forecasts import (
    ForecastListResponse,
    HorizonMode,
    MultiHorizonResponse,
    RevisionAnalyticsResponse,
    SingleDeliveryHourPublicationResponse,
)
from app.services.analytics_service import AnalyticsService

logger = get_logger("windiq.api.forecasts")
router = APIRouter(tags=["Forecasts"])


@router.get(
    "/forecasts",
    response_model=ForecastListResponse,
    dependencies=[
        Depends(require_permission("forecasts:read")),
        Depends(RateLimiter(bucket="forecasts")),
    ],
    summary="Query WINDFOR Forecast Records",
    description=(
        "Queries WINDFOR forecasts with filtering by delivery date, "
        "delivery hour, and selection status."
    ),
)
async def get_forecasts(
    delivery_date_from: date | None = Query(
        default=None,
        description="Filter range start delivery date (inclusive, YYYY-MM-DD)",
    ),
    delivery_date_to: date | None = Query(
        default=None,
        description="Filter range end delivery date (inclusive, YYYY-MM-DD)",
    ),
    delivery_hour: int | None = Query(
        default=None,
        ge=0,
        le=23,
        description="Delivery hour of day (0..23)",
    ),
    selected_only: bool = Query(
        default=True,
        description=(
            "If true, returns only the selected forecast; "
            "if false, includes full publication history"
        ),
    ),
    sort_by: str = Query(
        default="delivery_hour_utc",
        pattern="^(delivery_hour_utc|forecast_generation_mw|signed_error_mw|absolute_error_mw)$",
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
        description="Number of records per page (max 200)",
    ),
    db: AsyncSession = Depends(get_db),
) -> ForecastListResponse:
    """Fetch paginated day-ahead forecasts matching query filters."""
    if delivery_date_from and delivery_date_to and delivery_date_from > delivery_date_to:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="delivery_date_to must be greater than or equal to delivery_date_from",
        )

    try:
        service = AnalyticsService(db)
        return await service.get_forecasts(
            delivery_date_from=delivery_date_from,
            delivery_date_to=delivery_date_to,
            delivery_hour=delivery_hour,
            selected_only=selected_only,
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
        logger.exception("Failed to query forecasts: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve forecasts.",
        ) from exc


@router.get(
    "/forecasts/publications/{delivery_hour_utc}",
    response_model=SingleDeliveryHourPublicationResponse,
    dependencies=[
        Depends(require_permission("forecasts:publications")),
        Depends(RateLimiter(bucket="forecasts")),
    ],
    summary="Get All Publications for a Single Delivery Hour",
    description=(
        "Returns the complete forecast publication progression across lead times, "
        "decision cutoff status, winning selection, and actual settlement readings."
    ),
)
async def get_single_delivery_hour_publications(
    delivery_hour_utc: datetime = Path(
        description="Delivery hour start timestamp (UTC ISO-8601, e.g. 2026-01-28T12:00:00Z)"
    ),
    db: AsyncSession = Depends(get_db),
) -> SingleDeliveryHourPublicationResponse:
    """Fetch full publication trajectory and actuals trace for a single delivery hour."""
    try:
        service = AnalyticsService(db)
        return await service.get_single_delivery_hour_publications(delivery_hour_utc)
    except Exception as exc:
        logger.exception("Failed to retrieve publications for %s: %s", delivery_hour_utc, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve publications for delivery hour: {exc}",
        ) from exc


@router.get(
    "/forecasts/horizons",
    response_model=MultiHorizonResponse,
    dependencies=[
        Depends(require_permission("forecasts:read")),
        Depends(RateLimiter(bucket="horizons")),
    ],
    summary="Multi-Horizon Forecast Accuracy Analysis",
    description=(
        "Evaluates forecast error across 6 standardized operational horizon buckets "
        "(0-6h, 6-12h, 12-24h, 24-36h, 36-48h, 48-72h) supporting matched population, "
        "publication-weighted, and unmatched representative modes."
    ),
)
async def get_multi_horizon_analysis(
    delivery_date_from: date | None = Query(
        default=None,
        description="Filter range start delivery date (inclusive, YYYY-MM-DD)",
    ),
    delivery_date_to: date | None = Query(
        default=None,
        description="Filter range end delivery date (inclusive, YYYY-MM-DD)",
    ),
    mode: HorizonMode = Query(
        default=HorizonMode.MATCHED,
        description="Analysis mode: 'matched' (default), 'publication_weighted', or 'unmatched_representative'",
    ),
    db: AsyncSession = Depends(get_db),
) -> MultiHorizonResponse:
    """Compute multi-horizon forecast accuracy convergence metrics."""
    if delivery_date_from and delivery_date_to and delivery_date_from > delivery_date_to:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="delivery_date_to must be greater than or equal to delivery_date_from",
        )

    try:
        service = AnalyticsService(db)
        return await service.get_multi_horizon_analysis(
            delivery_date_from=delivery_date_from,
            delivery_date_to=delivery_date_to,
            mode=mode,
        )
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(val_err),
        ) from val_err
    except Exception as exc:
        logger.exception("Failed to compute multi-horizon analysis: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to compute multi-horizon analysis.",
        ) from exc


@router.get(
    "/forecasts/revisions",
    response_model=RevisionAnalyticsResponse,
    dependencies=[
        Depends(require_permission("forecasts:revisions")),
        Depends(RateLimiter(bucket="revisions", fail_closed=True)),
    ],
    summary="Forecast Revision Analysis & Stability Metrics",
    description=(
        "Computes forward-looking consecutive revision distributions, upward/downward counts, "
        "24-hour diurnal revision heatmap, and extreme weather model revision events."
    ),
)
async def get_revision_analytics(
    delivery_date_from: date | None = Query(
        default=None,
        description="Filter range start delivery date (inclusive, YYYY-MM-DD)",
    ),
    delivery_date_to: date | None = Query(
        default=None,
        description="Filter range end delivery date (inclusive, YYYY-MM-DD)",
    ),
    min_abs_revision_mw: float = Query(
        default=500.0,
        ge=0.0,
        description="Minimum absolute revision magnitude for top swing events (MW)",
    ),
    db: AsyncSession = Depends(get_db),
) -> RevisionAnalyticsResponse:
    """Compute forward forecast revision distribution and extreme volatility swings."""
    if delivery_date_from and delivery_date_to and delivery_date_from > delivery_date_to:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="delivery_date_to must be greater than or equal to delivery_date_from",
        )

    try:
        service = AnalyticsService(db)
        return await service.get_revision_analytics(
            delivery_date_from=delivery_date_from,
            delivery_date_to=delivery_date_to,
            min_abs_revision_mw=min_abs_revision_mw,
        )
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(val_err),
        ) from val_err
    except Exception as exc:
        logger.exception("Failed to compute revision analytics: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to compute revision analytics.",
        ) from exc

