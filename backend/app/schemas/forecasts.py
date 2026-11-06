"""Schemas for the /api/v1/forecasts endpoint and Phase 3.3 Forecast Explorer."""

from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.accuracy import HalfHourReadingTrace
from app.schemas.common import PaginationMeta


class PublicationVersion(BaseModel):
    """Historical forecast publication cycle for a delivery hour."""

    model_config = ConfigDict(from_attributes=True)

    id: int | None = Field(default=None, description="Raw forecast record ID in raw_forecast_records")
    publish_time_utc: datetime = Field(description="Elexon publication timestamp (UTC)")
    lead_time_hours: float | None = Field(
        default=None, description="Lead time in hours before delivery start (positive for forward-looking)"
    )
    forecast_mw: float = Field(description="Published national forecast generation (MW)")
    revision_mw: float | None = Field(
        default=None, description="Step revision from immediately prior publication (MW)"
    )
    is_eligible: bool = Field(description="True if published at or before decision cutoff")
    is_selected: bool | None = Field(
        default=None, description="True if this publication was selected for D-1 benchmark evaluation"
    )


class ForecastItem(BaseModel):
    """Day-ahead forecast record with evaluation linkage and publication lineage."""

    model_config = ConfigDict(from_attributes=True)

    id: int = Field(description="Forecast evaluation record ID")
    delivery_date: date = Field(description="Local delivery date in Europe/London")
    delivery_hour_utc: datetime = Field(description="Delivery hour start timestamp (UTC)")
    decision_date: date = Field(description="Day-ahead decision date")
    decision_cutoff_utc: datetime = Field(description="Decision cutoff timestamp (UTC)")
    selected_publish_time_utc: datetime | None = Field(
        default=None, description="Publication timestamp of selected forecast (UTC)"
    )
    forecast_generation_mw: float | None = Field(
        default=None, description="Day-ahead forecast generation (MW)"
    )
    actual_generation_mw: float | None = Field(
        default=None, description="Normalized hourly actual generation (MW)"
    )
    signed_error_mw: float | None = Field(
        default=None, description="Forecast minus actual error (MW)"
    )
    absolute_error_mw: float | None = Field(default=None, description="Absolute error (MW)")
    absolute_percentage_error: float | None = Field(
        default=None, description="Absolute percentage error (%)"
    )
    is_overforecast: bool | None = Field(default=None, description="True if forecast > actual")
    is_underforecast: bool | None = Field(default=None, description="True if forecast < actual")
    eligible_forecast_count: int = Field(
        default=0, description="Count of publications released before cutoff"
    )
    selection_status: str = Field(description="Evaluation status: VALID, MISSING_ACTUAL, etc.")
    configuration_version: int | None = Field(
        default=None, description="Evaluation rule configuration version"
    )
    metric_version: str | None = Field(default=None, description="Metric calculation version")
    all_publications: list[PublicationVersion] | None = Field(
        default=None, description="Full publication history for this delivery hour"
    )


class ForecastListResponse(BaseModel):
    """Paginated list of forecast records."""

    model_config = ConfigDict(from_attributes=True)

    items: list[ForecastItem]
    pagination: PaginationMeta


# =========================================================================
# Phase 3.3 Schemas: Single Hour Publication Trace, Multi-Horizon & Revisions
# =========================================================================

class SingleDeliveryHourPublicationResponse(BaseModel):
    """Full publication lifecycle, cutoff analysis, and actuals trace for a single delivery hour."""

    model_config = ConfigDict(from_attributes=True)

    delivery_hour_utc: datetime = Field(description="Delivery hour start timestamp (UTC)")
    delivery_date_london: date = Field(description="Delivery date in Europe/London calendar")
    hour_of_day_london: int = Field(description="Delivery hour of day (0..23) in Europe/London")
    decision_cutoff_utc: datetime = Field(description="Day-ahead 09:00 UK decision cutoff timestamp (UTC)")
    selected_forecast_id: int | None = Field(default=None, description="Raw forecast record ID of selected forecast")
    selected_publish_time_utc: datetime | None = Field(default=None, description="Publication timestamp of selected forecast")
    actual_generation_mw: float | None = Field(default=None, description="Actual metered generation (MW)")
    actual_data_status: str = Field(description="Status of actual generation: VALID, MISSING_ACTUAL, etc.")
    settlement_readings: list[HalfHourReadingTrace] = Field(
        default_factory=list, description="Constituent settlement half-hours"
    )
    total_publications: int = Field(description="Total publication versions received for this hour")
    forward_publications: int = Field(description="Publications with lead_time_hours > 0")
    eligible_publications: int = Field(description="Publications released prior to decision cutoff")
    publications: list[PublicationVersion] = Field(
        description="Chronologically ordered publications with revision deltas"
    )


class HorizonMode(str, Enum):
    """Analysis mode for multi-horizon aggregation."""

    MATCHED = "matched"
    PUBLICATION_WEIGHTED = "publication_weighted"
    UNMATCHED_REPRESENTATIVE = "unmatched_representative"


class HorizonBucketStats(BaseModel):
    """Aggregated forecast accuracy metrics for a standardized lead-time bucket."""

    model_config = ConfigDict(from_attributes=True)

    horizon_bucket: str = Field(description="Standardized horizon bucket name")
    lead_time_min_hours: float = Field(description="Minimum lead time boundary (hours)")
    lead_time_max_hours: float = Field(description="Maximum lead time boundary (hours)")
    boundary_semantics: str = Field(description="Interval boundary definition (e.g. '[6.0, 12.0)' or '[48.0, 72.0]')")
    target_lead_time_hours: float | None = Field(default=None, description="Target lead time for representative selection")
    avg_actual_lead_time_hours: float = Field(description="Mean observed lead time in bucket (hours)")
    observation_count: int = Field(description="Number of forecast observations evaluated in bucket")
    unique_delivery_hours: int = Field(description="Count of distinct delivery hours represented in bucket")
    hour_coverage_pct: float = Field(description="Percentage of evaluation period delivery hours represented")
    mae_mw: float = Field(description="Mean Absolute Error (MW)")
    rmse_mw: float = Field(description="Root Mean Squared Error (MW)")
    bias_mw: float = Field(description="Forecast Bias / Mean Signed Error (MW)")
    mape_pct: float | None = Field(default=None, description="Mean Absolute Percentage Error (%)")


class MultiHorizonResponse(BaseModel):
    """Multi-horizon forecast convergence response."""

    model_config = ConfigDict(from_attributes=True)

    delivery_date_from: date = Field(description="Evaluation period start date (Europe/London)")
    delivery_date_to: date = Field(description="Evaluation period end date (Europe/London)")
    analysis_mode: str = Field(description="Analysis mode: matched, publication_weighted, or unmatched_representative")
    total_delivery_hours_in_period: int = Field(description="Total calendar delivery hours in period")
    evaluated_delivery_hours: int = Field(description="Delivery hours evaluated in this mode")
    common_matched_hours: int | None = Field(
        default=None, description="Number of hours present across all 6 horizons (when matched)"
    )
    overall_coverage_pct: float = Field(description="Hour coverage percentage of evaluation window")
    proven_convergence_improvement_pct: float | None = Field(
        default=None, description="Percentage MAE reduction from Medium-Range to Very Short"
    )
    buckets: list[HorizonBucketStats] = Field(description="The 6 standardized operational horizon buckets")


class ExtremeRevisionItem(BaseModel):
    """Top forecast swing event between successive publication cycles."""

    model_config = ConfigDict(from_attributes=True)

    raw_forecast_id: int = Field(description="Raw forecast record ID of the revised forecast")
    delivery_hour_utc: datetime = Field(description="Delivery hour start timestamp (UTC)")
    delivery_date_london: date = Field(description="Delivery date (Europe/London)")
    hour_of_day_london: int = Field(description="Delivery hour of day (0..23)")
    publish_time_utc: datetime = Field(description="Publication timestamp of revised forecast (UTC)")
    previous_publish_time_utc: datetime = Field(description="Publication timestamp of previous forecast (UTC)")
    lead_time_hours: float = Field(description="Lead time of revised forecast (hours)")
    previous_forecast_mw: float = Field(description="Previous forecast generation (MW)")
    revised_forecast_mw: float = Field(description="Revised forecast generation (MW)")
    revision_mw: float = Field(description="Signed forecast revision delta (MW)")
    abs_revision_mw: float = Field(description="Absolute revision magnitude (MW)")
    cycle_gap_hours: float = Field(description="Time elapsed between publications (hours)")
    is_discontinuous: bool = Field(description="True if cycle gap exceeds 6.0 hours")


class RevisionDistributionBin(BaseModel):
    """Histogram bin for signed forecast revisions."""

    bin_center_mw: float
    bin_start_mw: float
    bin_end_mw: float
    count: int


class DiurnalRevisionCell(BaseModel):
    """Cell in the 24-hour diurnal revision heatmap."""

    hour_of_day_london: int = Field(description="Delivery hour of day (0..23)")
    horizon_bucket: str = Field(description="Horizon bucket name")
    mean_abs_revision_mw: float = Field(description="Average absolute revision magnitude (MW)")
    revision_count: int = Field(description="Number of revisions evaluated")


class RevisionAnalyticsResponse(BaseModel):
    """Forward-looking forecast revision distribution, stability, and extreme volatility events."""

    model_config = ConfigDict(from_attributes=True)

    delivery_date_from: date = Field(description="Start date (Europe/London)")
    delivery_date_to: date = Field(description="End date (Europe/London)")
    forward_only_revisions: int = Field(description="Total consecutive forward revisions (t_lead > 0)")
    mean_signed_revision_mw: float = Field(description="Mean signed revision delta (MW)")
    mean_absolute_revision_mw: float = Field(description="Mean absolute revision magnitude (MW)")
    upward_count: int = Field(description="Count of upward revisions (delta > 0)")
    upward_pct: float = Field(description="Percentage of revisions that are upward")
    downward_count: int = Field(description="Count of downward revisions (delta < 0)")
    downward_pct: float = Field(description="Percentage of revisions that are downward")
    unchanged_count: int = Field(description="Count of unchanged revisions (delta == 0)")
    unchanged_pct: float = Field(description="Percentage of revisions that are unchanged")
    cycle_gap_max_hours: float = Field(description="Maximum observed forward publication interval (hours)")
    discontinuous_gap_count: int = Field(description="Count of revisions spanning gaps > 6.0h")
    histogram: list[RevisionDistributionBin] = Field(description="Distribution of signed revisions")
    top_revisions: list[ExtremeRevisionItem] = Field(description="Top largest absolute revision events")
    diurnal_revision_heatmap: list[DiurnalRevisionCell] = Field(description="24h x Lead-Time revision volatility grid")

