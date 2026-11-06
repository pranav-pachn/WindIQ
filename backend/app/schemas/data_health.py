"""Schemas for the /api/v1/data-health endpoint."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class DataHealthSummary(BaseModel):
    """System integrity summary scorecard."""

    model_config = ConfigDict(from_attributes=True)

    total_delivery_hours_evaluated: int = Field(description="Total delivery hours evaluated")
    missing_actual_hours: int = Field(description="Delivery hours missing actual generation")
    missing_forecast_hours: int = Field(description="Delivery hours missing day-ahead forecast")
    incomplete_hourly_actual_pairs: int = Field(
        description="Hours with only 1 half-hour reading rejected during synthesis"
    )
    half_hourly_spacing_violations: int = Field(
        description="Readings with non-30-minute spacing anomalies"
    )
    null_generation_readings: int = Field(description="Raw records rejected due to NULL generation")
    duplicate_keys_detected: int = Field(
        description="Duplicate raw records prevented by DB constraints"
    )
    expected_delivery_hours: int = Field(description="Expected delivery hours in selected period")
    available_delivery_hours: int = Field(description="Hours with valid evaluations in DB")
    evaluation_coverage_pct: float = Field(description="Evaluation coverage percentage")
    is_fully_evaluated: bool = Field(description="True if expected == available hours")


class DatasetHealthDetail(BaseModel):
    """Ingestion metrics and status by dataset (WINDFOR, FUELHH)."""

    model_config = ConfigDict(from_attributes=True)

    latest_successful_ingestion_utc: datetime | None = Field(
        default=None, description="Timestamp of latest successful ingestion run (UTC)"
    )
    latest_ingestion_status: str = Field(description="Status of the most recent ingestion run")
    total_records: int = Field(description="Total raw records currently stored in database")
    records_fetched: int = Field(description="Records fetched in latest run")
    records_inserted: int = Field(description="New records inserted in latest run")
    records_already_present: int = Field(description="Duplicate records skipped in latest run")
    records_rejected: int = Field(description="Invalid records rejected in latest run")


class PublicationCycleHealth(BaseModel):
    """Health metrics for Elexon WINDFOR publication cadence."""

    model_config = ConfigDict(from_attributes=True)

    total_publication_cycles_observed: int = Field(
        description="Distinct publication timestamps observed in period"
    )
    average_cycles_per_day: float = Field(
        description="Average number of publication cycles per calendar day"
    )
    min_cycles_per_day: int = Field(description="Minimum publication cycles on any calendar day")
    max_cycles_per_day: int = Field(description="Maximum publication cycles on any calendar day")


class QualityEventItem(BaseModel):
    """Data quality anomaly log item."""

    model_config = ConfigDict(from_attributes=True)

    id: int = Field(description="Event primary key")
    dataset: str = Field(description="Dataset name (WINDFOR, FUELHH)")
    event_type: str = Field(description="Classification type of anomaly")
    severity: str = Field(description="Severity (INFO, WARNING, ERROR, CRITICAL)")
    description: str = Field(description="Human-readable event description")
    affected_timestamp: datetime | None = Field(
        default=None, description="Specific timestamp affected by anomaly"
    )
    details: dict = Field(default_factory=dict, description="Metadata dictionary")
    created_at: datetime = Field(description="Event logging timestamp")


class JobHealthDetail(BaseModel):
    """Operational status and execution metrics for a scheduled pipeline job."""

    model_config = ConfigDict(from_attributes=True)

    job_id: str = Field(description="Job identifier (windfor_ingestion, etc.)")
    status: str = Field(description="Current job execution status (IDLE, RUNNING, SUCCESS, FAILED)")
    last_run_utc: datetime | None = Field(
        default=None, description="Timestamp when job was last started (UTC)"
    )
    last_successful_run_utc: datetime | None = Field(
        default=None, description="Timestamp of last successful completion (UTC)"
    )
    next_run_utc: datetime | None = Field(
        default=None, description="Next planned execution timestamp (UTC)"
    )
    last_duration_seconds: float | None = Field(
        default=None, description="Duration in seconds of the latest execution"
    )
    consecutive_failures: int = Field(
        default=0, description="Consecutive failed execution attempts"
    )
    records_fetched: int = Field(default=0, description="Records fetched in latest execution")
    records_inserted: int = Field(default=0, description="New records inserted in latest execution")
    records_already_present: int = Field(
        default=0, description="Existing records skipped in latest execution"
    )
    records_rejected: int = Field(
        default=0, description="Invalid records rejected in latest execution"
    )
    last_error: str | None = Field(default=None, description="Error message from latest failure")


class SchedulerHealthDetail(BaseModel):
    """Cluster-wide scheduler health, leader election status, and managed jobs."""

    model_config = ConfigDict(from_attributes=True)

    status: str = Field(
        description="Scheduler state: RUNNING (leader), STANDBY (follower), STOPPED, DISABLED"
    )
    is_leader: bool = Field(description="True if this instance holds the PostgreSQL advisory lock")
    enabled: bool = Field(description="Whether scheduling is enabled in configuration")
    jobs: dict[str, JobHealthDetail] = Field(
        default_factory=dict, description="Job health details keyed by job ID"
    )


class DataHealthResponse(BaseModel):
    """Response payload for /api/v1/data-health."""

    model_config = ConfigDict(from_attributes=True)

    health_status: str = Field(
        description="Overall platform data health: HEALTHY, DEGRADED, UNHEALTHY"
    )
    data_integrity_score: float = Field(
        description="Percentage of clean, valid delivery hours (0.0 to 100.0)"
    )
    summary: DataHealthSummary
    datasets: dict[str, DatasetHealthDetail] = Field(
        description="Health metrics keyed by dataset name"
    )
    publication_cycle_health: PublicationCycleHealth
    quality_events_by_severity: dict[str, int] = Field(
        description="Count of logged events by severity level"
    )
    recent_quality_events: list[QualityEventItem] = Field(
        default_factory=list, description="Recent data quality anomalies"
    )
    scheduler: SchedulerHealthDetail | None = Field(
        default=None, description="Automated pipeline scheduler and job execution health"
    )
