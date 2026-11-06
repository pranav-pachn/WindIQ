"""Database repository abstractions."""

from app.repositories.data_quality_repo import DataQualityRepository
from app.repositories.evaluation_repo import EvaluationRepository
from app.repositories.hourly_actual_repo import HourlyActualRepository
from app.repositories.ingestion_run_repo import IngestionRunRepository
from app.repositories.raw_actual_repo import RawActualRepository
from app.repositories.raw_forecast_repo import RawForecastRepository

__all__ = [
    "IngestionRunRepository",
    "DataQualityRepository",
    "RawForecastRepository",
    "RawActualRepository",
    "HourlyActualRepository",
    "EvaluationRepository",
]
