"""Schemas for /api/v1/accuracy/summary, /daily, and /hourly endpoints."""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import PaginationMeta


class AccuracyDateRange(BaseModel):
    """Evaluated date window metadata."""

    model_config = ConfigDict(from_attributes=True)

    delivery_date_from: date = Field(description="First delivery date in range")
    delivery_date_to: date = Field(description="Last delivery date in range")
    total_calendar_days: int = Field(description="Total local calendar days in window")
    total_hours: int = Field(description="Total scheduled delivery hours in window")


class AccuracySummaryMetrics(BaseModel):
    """Detailed accuracy KPI summary."""

    model_config = ConfigDict(from_attributes=True)

    valid_comparisons: int = Field(description="Valid forecast-actual evaluation pairs")
    missing_forecast_hours: int = Field(description="Hours missing day-ahead forecast")
    missing_actual_hours: int = Field(description="Hours missing actual generation aggregate")
    forecast_coverage_pct: float = Field(description="Percentage of delivery hours with forecast")
    actual_completeness_pct: float = Field(description="Percentage of delivery hours with actuals")
    mae_mw: float = Field(description="Mean Absolute Error (MW)")
    rmse_mw: float = Field(description="Root Mean Square Error (MW)")
    mape_pct: float = Field(description="Mean Absolute Percentage Error (%)")
    forecast_bias_mw: float = Field(description="Mean signed error / Bias (MW)")
    overforecast_count: int = Field(description="Count of hours where forecast > actual")
    underforecast_count: int = Field(description="Count of hours where forecast < actual")
    zero_error_count: int = Field(description="Count of hours where forecast == actual")
    mape_denominator: int = Field(description="Hours included in MAPE (actual > 0)")
    mape_excluded_count: int = Field(description="Hours excluded from MAPE (actual <= 0)")
    mape_exclusion_reasons: list[str] = Field(
        default_factory=list, description="Reason for any MAPE exclusions"
    )
    avg_forecast_mw: float | None = Field(default=None, description="Average forecast power (MW)")
    avg_actual_mw: float | None = Field(default=None, description="Average actual generation (MW)")


class AccuracySummaryResponse(BaseModel):
    """Response payload for /api/v1/accuracy/summary."""

    model_config = ConfigDict(from_attributes=True)

    date_range: AccuracyDateRange
    metrics: AccuracySummaryMetrics


class DailyAccuracyItem(BaseModel):
    """Daily evaluation KPIs aggregated by local Europe/London calendar date."""

    model_config = ConfigDict(from_attributes=True)

    delivery_date: date = Field(description="Local calendar delivery date (Europe/London)")
    decision_date: date = Field(description="Day-ahead decision date")
    total_hours: int = Field(description="Total delivery hours for this day (23/24/25)")
    valid_hours: int = Field(description="Valid evaluated hours for this day")
    forecast_coverage_pct: float = Field(description="Forecast coverage for the day (%)")
    actual_completeness_pct: float = Field(description="Actual completeness for the day (%)")
    mae_mw: float = Field(description="Mean Absolute Error (MW)")
    rmse_mw: float = Field(description="Root Mean Square Error (MW)")
    mape_pct: float = Field(description="Mean Absolute Percentage Error (%)")
    mape_denominator: int = Field(description="Evaluations included in MAPE denominator")
    bias_mw: float = Field(description="Mean signed error (MW)")
    overforecast_hours: int = Field(description="Count of overforecast hours")
    underforecast_hours: int = Field(description="Count of underforecast hours")
    zero_error_hours: int = Field(description="Count of zero-error hours")
    avg_forecast_mw: float | None = Field(default=None, description="Average forecast MW")
    avg_actual_mw: float | None = Field(default=None, description="Average actual MW")


class DayExtremum(BaseModel):
    """Reference to a day achieving best or worst metric."""

    model_config = ConfigDict(from_attributes=True)

    delivery_date: date
    value: float


class DailyAccuracySummary(BaseModel):
    """High-level summary of daily performance across the queried period."""

    model_config = ConfigDict(from_attributes=True)

    total_days: int = Field(description="Total calendar days evaluated")
    best_day_mae: DayExtremum | None = Field(default=None, description="Day with lowest MAE")
    worst_day_mae: DayExtremum | None = Field(default=None, description="Day with highest MAE")
    best_day_mape: DayExtremum | None = Field(default=None, description="Day with lowest MAPE")
    worst_day_mape: DayExtremum | None = Field(default=None, description="Day with highest MAPE")


class DailyAccuracyResponse(BaseModel):
    """Response payload for /api/v1/accuracy/daily."""

    model_config = ConfigDict(from_attributes=True)

    items: list[DailyAccuracyItem]
    summary: DailyAccuracySummary
    pagination: PaginationMeta | None = Field(
        default=None, description="Optional pagination metadata when paged"
    )


class HalfHourReadingTrace(BaseModel):
    """Settlement half-hour reading lineage for hourly actual."""

    model_config = ConfigDict(from_attributes=True)

    settlement_period: int = Field(description="Settlement period number (1..50)")
    start_time_utc: datetime = Field(description="Half-hour start timestamp (UTC)")
    generation_mw: float = Field(description="Settlement generation reading (MW)")


class TraceabilityDetail(BaseModel):
    """Lineage linking evaluation to selected raw forecast and constituent actuals."""

    model_config = ConfigDict(from_attributes=True)

    selected_forecast_id: int | None = Field(default=None, description="Raw forecast record ID")
    hourly_actual_id: int | None = Field(default=None, description="Hourly actual record ID")
    half_hour_readings: list[HalfHourReadingTrace] = Field(
        default_factory=list, description="Constituent half-hour readings"
    )


class HourlyAccuracyItem(BaseModel):
    """Hourly forecast-actual comparison row with full mathematical lineage."""

    model_config = ConfigDict(from_attributes=True)

    delivery_date: date = Field(description="Local calendar delivery date (Europe/London)")
    delivery_hour_utc: datetime = Field(description="Delivery hour start timestamp (UTC)")
    hour_of_day: int = Field(description="Hour of day (0..23 in Europe/London)")
    decision_date: date = Field(description="Day-ahead decision date")
    decision_cutoff_utc: datetime = Field(description="Market decision cutoff timestamp (UTC)")
    selected_publish_time_utc: datetime | None = Field(
        default=None, description="Publication timestamp of selected forecast (UTC)"
    )
    forecast_generation_mw: float | None = Field(
        default=None, description="Selected forecast generation (MW)"
    )
    actual_generation_mw: float | None = Field(
        default=None, description="Normalized hourly actual generation (MW)"
    )
    forecast_error_mw: float | None = Field(
        default=None, description="Signed forecast error: forecast - actual (MW)"
    )
    absolute_error_mw: float | None = Field(
        default=None, description="Absolute forecast error (MW)"
    )
    absolute_percentage_error: float | None = Field(
        default=None, description="Absolute percentage error (%)"
    )
    comparison_status: str = Field(description="Comparison validity status (VALID, etc.)")
    traceability: TraceabilityDetail | None = Field(
        default=None, description="Full audit lineage to source records"
    )


class HourOfDayAggregate(BaseModel):
    """Accuracy profile for a specific hour of day across the evaluation period."""

    model_config = ConfigDict(from_attributes=True)

    hour_of_day: int = Field(description="Hour of day (0..23 in Europe/London)")
    comparison_count: int = Field(description="Number of valid evaluations in this hour")
    mae_mw: float = Field(description="Mean Absolute Error for this hour (MW)")
    rmse_mw: float = Field(description="Root Mean Square Error for this hour (MW)")
    mape_pct: float = Field(description="Mean Absolute Percentage Error for this hour (%)")
    mape_denominator: int = Field(description="Count of hours included in MAPE denominator")
    bias_mw: float = Field(description="Mean signed error / Bias for this hour (MW)")
    avg_forecast_mw: float = Field(description="Average forecast generation for this hour (MW)")
    avg_actual_mw: float = Field(description="Average actual generation for this hour (MW)")
    overforecast_count: int = Field(description="Count of overforecasts in this hour")
    underforecast_count: int = Field(description="Count of underforecasts in this hour")


class HourlyAccuracyResponse(BaseModel):
    """Response payload for /api/v1/accuracy/hourly."""

    model_config = ConfigDict(from_attributes=True)

    items: list[HourlyAccuracyItem]
    pagination: PaginationMeta
    hour_of_day_summary: list[HourOfDayAggregate] | None = Field(
        default=None, description="Optional hour-of-day accuracy profile across the date range"
    )
