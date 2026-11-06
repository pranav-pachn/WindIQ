"""Central configuration for WindIQ data extraction and accuracy audit."""

from dataclasses import dataclass
from datetime import date, datetime, time, timezone
from pathlib import Path
from zoneinfo import ZoneInfo


@dataclass(frozen=True)
class PipelineConfig:
    """Immutable configuration for WindIQ data pipeline."""

    # Base URLs and endpoints
    bmrs_base_url: str = "https://data.elexon.co.uk/bmrs/api/v1"
    windfor_url: str = "https://data.elexon.co.uk/bmrs/api/v1/datasets/WINDFOR/stream"
    fuelhh_url: str = "https://data.elexon.co.uk/bmrs/api/v1/datasets/FUELHH/stream"

    # Evaluation date horizons (January 2026 audit)
    decision_start_date: date = date(2026, 1, 1)
    decision_end_date: date = date(2026, 1, 31)
    delivery_start_date: date = date(2026, 1, 2)
    delivery_end_date: date = date(2026, 2, 1)

    # Decision cutoff configuration (provisional assumption)
    cutoff_timezone_name: str = "Europe/London"
    cutoff_time: time = time(9, 0, 0)

    # Network / API reliability
    timeout_seconds: int = 30
    max_retries: int = 5
    backoff_factor: float = 1.5
    request_delay_seconds: float = 0.2

    # Directory paths
    project_root: Path = Path(__file__).resolve().parent.parent.parent
    raw_data_dir: Path = project_root / "data" / "raw"
    raw_cache_dir: Path = project_root / "data" / "raw" / "cache"
    processed_data_dir: Path = project_root / "data" / "processed"
    reports_dir: Path = project_root / "reports"

    # Output file paths
    raw_windfor_json: Path = raw_data_dir / "windfor_jan2026.json"
    raw_fuelhh_json: Path = raw_data_dir / "fuelhh_jan2026.json"
    hourly_actuals_csv: Path = processed_data_dir / "hourly_actuals_jan2026.csv"
    selected_forecasts_csv: Path = processed_data_dir / "selected_forecasts_jan2026.csv"
    january_comparisons_csv: Path = processed_data_dir / "january_comparisons.csv"
    coverage_audit_csv: Path = reports_dir / "january_coverage_audit.csv"
    accuracy_metrics_json: Path = reports_dir / "january_accuracy_metrics.json"
    data_quality_report_md: Path = reports_dir / "january_data_quality_report.md"
    audit_summary_md: Path = reports_dir / "january_audit_summary.md"

    def get_decision_cutoff_utc(self, decision_date: date) -> datetime:
        """Calculate the UTC decision cutoff for a given decision date.

        Converts the local cutoff (e.g., 09:00 Europe/London) to UTC timezone-aware datetime.
        """
        tz = ZoneInfo(self.cutoff_timezone_name)
        local_cutoff = datetime.combine(decision_date, self.cutoff_time, tzinfo=tz)
        return local_cutoff.astimezone(timezone.utc)


# Singleton default configuration
DEFAULT_CONFIG = PipelineConfig()

