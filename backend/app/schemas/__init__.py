"""Pydantic schemas for request validation and response serialization."""

from app.schemas.accuracy import (
    AccuracyDateRange,
    AccuracySummaryMetrics,
    AccuracySummaryResponse,
    DailyAccuracyItem,
    DailyAccuracyResponse,
    DailyAccuracySummary,
    DayExtremum,
    HalfHourReadingTrace,
    HourlyAccuracyItem,
    HourlyAccuracyResponse,
    HourOfDayAggregate,
    TraceabilityDetail,
)
from app.schemas.common import (
    DateRangeParams,
    ErrorDetail,
    ErrorEnvelope,
    PaginatedResponse,
    PaginationMeta,
)
from app.schemas.data_health import (
    DataHealthResponse,
    DataHealthSummary,
    DatasetHealthDetail,
    JobHealthDetail,
    PublicationCycleHealth,
    QualityEventItem,
    SchedulerHealthDetail,
)
from app.schemas.forecasts import (
    ForecastItem,
    ForecastListResponse,
    PublicationVersion,
)
from app.schemas.overview import (
    AccuracyKpis,
    DatasetHealthInfo,
    EvaluationPeriodInfo,
    OverviewResponse,
)

__all__ = [
    "AccuracyDateRange",
    "AccuracyKpis",
    "AccuracySummaryMetrics",
    "AccuracySummaryResponse",
    "DailyAccuracyItem",
    "DailyAccuracyResponse",
    "DailyAccuracySummary",
    "DataHealthResponse",
    "DataHealthSummary",
    "DateRangeParams",
    "DatasetHealthDetail",
    "DatasetHealthInfo",
    "DayExtremum",
    "ErrorDetail",
    "ErrorEnvelope",
    "EvaluationPeriodInfo",
    "ForecastItem",
    "ForecastListResponse",
    "HalfHourReadingTrace",
    "HourOfDayAggregate",
    "HourlyAccuracyItem",
    "HourlyAccuracyResponse",
    "JobHealthDetail",
    "OverviewResponse",
    "PaginatedResponse",
    "PaginationMeta",
    "PublicationCycleHealth",
    "PublicationVersion",
    "QualityEventItem",
    "SchedulerHealthDetail",
    "TraceabilityDetail",
]
