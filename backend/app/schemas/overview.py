"""Schemas for the /api/v1/overview endpoint."""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class EvaluationPeriodInfo(BaseModel):
    """Active market evaluation period window and configuration."""

    model_config = ConfigDict(from_attributes=True)

    decision_start_date: date = Field(description="First decision date evaluated")
    decision_end_date: date = Field(description="Last decision date evaluated")
    delivery_start_date: date = Field(description="First delivery date evaluated")
    delivery_end_date: date = Field(description="Last delivery date evaluated")
    decision_cutoff: str = Field(description="Market cutoff rule (e.g. 09:00 Europe/London)")
    total_evaluation_hours: int = Field(description="Total delivery hours evaluated in period")


class AccuracyKpis(BaseModel):
    """Overall benchmark forecast accuracy KPIs and direction counts."""

    model_config = ConfigDict(from_attributes=True)

    valid_comparisons: int = Field(description="Number of valid hourly evaluations")
    forecast_coverage_pct: float = Field(description="Percentage of delivery hours with forecasts")
    actual_completeness_pct: float = Field(description="Percentage of delivery hours with actuals")
    mae_mw: float = Field(description="Mean Absolute Error in MW")
    rmse_mw: float = Field(description="Root Mean Square Error in MW")
    mape_pct: float = Field(description="Mean Absolute Percentage Error (%)")
    mape_denominator: int = Field(description="Evaluations included in MAPE calculation")
    forecast_bias_mw: float = Field(description="Mean signed forecast error (Bias) in MW")
    overforecast_hours: int = Field(description="Hours where forecast > actual")
    underforecast_hours: int = Field(description="Hours where forecast < actual")
    zero_error_hours: int = Field(description="Hours where forecast == actual")
    avg_forecast_mw: float | None = Field(default=None, description="Average forecast power (MW)")
    avg_actual_mw: float | None = Field(default=None, description="Average actual generation (MW)")


class DatasetHealthInfo(BaseModel):
    """Raw record counters and latest ingestion audit timestamps."""

    model_config = ConfigDict(from_attributes=True)

    raw_windfor_records: int = Field(description="Total WINDFOR forecast publications stored")
    raw_fuelhh_readings: int = Field(description="Total FUELHH half-hourly readings stored")
    last_successful_ingestion_utc: datetime | None = Field(
        default=None, description="Latest successful ingestion timestamp (UTC)"
    )


class OverviewResponse(BaseModel):
    """Platform overview response containing evaluation window, KPIs, and data health."""

    model_config = ConfigDict(from_attributes=True)

    platform: str = Field(
        default="WindIQ UK Forecast Accuracy Platform",
        description="Application identifier",
    )
    version: str = Field(default="2.0.0", description="API/Platform version")
    evaluation_period: EvaluationPeriodInfo
    accuracy_kpis: AccuracyKpis
    dataset_health: DatasetHealthInfo
    configuration_version: int = Field(description="Active evaluation configuration version")
    metric_version: str = Field(description="Active metric calculation version")
