"""WINDFOR forecast selection engine implementing day-ahead cutoff rules."""

import logging
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

from src.data_pipeline.config import PipelineConfig, DEFAULT_CONFIG

logger = logging.getLogger(__name__)


class WindforSelector:
    """Selects the latest eligible WINDFOR forecast strictly before the decision cutoff."""

    def __init__(self, config: Optional[PipelineConfig] = None):
        self.config = config or DEFAULT_CONFIG
        self.config.processed_data_dir.mkdir(parents=True, exist_ok=True)

    def select_forecasts(
        self, raw_forecasts: List[Dict[str, Any]], save_csv: bool = True
    ) -> Tuple[pd.DataFrame, List[Dict[str, Any]]]:
        """Select day-ahead forecasts for all 744 delivery hours.

        Returns:
            Tuple of:
            - selected_df: DataFrame of 744 delivery hours with selected forecast
            - selection_issues: List of dicts recording any missing or anomalous forecast hours
        """
        logger.info("Indexing %d raw WINDFOR records for selection", len(raw_forecasts))
        selection_issues: List[Dict[str, Any]] = []

        # Index forecasts by delivery hour (startTime normalized to ISO UTC string)
        # Value: list of dicts with parsed publish_dt, raw publishTime, startTime, generation
        forecasts_by_hour: Dict[str, List[Dict[str, Any]]] = {}

        for rec in raw_forecasts:
            st_str = rec.get("startTime")
            pub_str = rec.get("publishTime")
            gen = rec.get("generation")

            if not st_str or not pub_str:
                selection_issues.append({
                    "record": rec,
                    "issue_type": "INCOMPLETE_FORECAST_RECORD",
                    "description": "Missing startTime or publishTime in WINDFOR",
                })
                continue

            try:
                st_dt = datetime.fromisoformat(st_str.replace("Z", "+00:00"))
                if st_dt.tzinfo is None:
                    st_dt = st_dt.replace(tzinfo=timezone.utc)
                else:
                    st_dt = st_dt.astimezone(timezone.utc)
                st_norm = st_dt.strftime("%Y-%m-%dT%H:00:00Z")

                pub_dt = datetime.fromisoformat(pub_str.replace("Z", "+00:00"))
                if pub_dt.tzinfo is None:
                    pub_dt = pub_dt.replace(tzinfo=timezone.utc)
                else:
                    pub_dt = pub_dt.astimezone(timezone.utc)
            except Exception as parse_err:
                selection_issues.append({
                    "record": rec,
                    "issue_type": "INVALID_TIMESTAMP",
                    "description": f"Failed parsing timestamp: {parse_err}",
                })
                continue

            forecasts_by_hour.setdefault(st_norm, []).append({
                "publish_dt": pub_dt,
                "publish_time_str": pub_str,
                "start_time_str": st_norm,
                "generation": gen,
            })

        # Build complete 744-hour evaluation grid
        selected_rows: List[Dict[str, Any]] = []
        current_date = self.config.delivery_start_date

        while current_date <= self.config.delivery_end_date:
            decision_date = current_date - timedelta(days=1)
            cutoff_dt = self.config.get_decision_cutoff_utc(decision_date)
            cutoff_str = cutoff_dt.strftime("%Y-%m-%dT%H:%M:%SZ")

            for h in range(24):
                delivery_hour_dt = datetime.combine(
                    current_date, datetime.min.time(), tzinfo=timezone.utc
                ) + timedelta(hours=h)
                delivery_hour_str = delivery_hour_dt.strftime("%Y-%m-%dT%H:00:00Z")

                candidates = forecasts_by_hour.get(delivery_hour_str, [])

                # Filter candidates strictly published on or before the cutoff
                eligible = [
                    c for c in candidates
                    if c["publish_dt"] <= cutoff_dt and c["generation"] is not None
                ]

                if not eligible:
                    status = "NO_ELIGIBLE_FORECAST"
                    selected_rows.append({
                        "decision_date": decision_date.isoformat(),
                        "delivery_date": current_date.isoformat(),
                        "delivery_hour_utc": delivery_hour_str,
                        "decision_cutoff_utc": cutoff_str,
                        "selected_publish_time_utc": None,
                        "forecast_generation_mw": None,
                        "eligible_forecast_count": 0,
                        "forecast_status": status,
                    })
                    selection_issues.append({
                        "delivery_date": current_date.isoformat(),
                        "delivery_hour_utc": delivery_hour_str,
                        "decision_date": decision_date.isoformat(),
                        "cutoff_utc": cutoff_str,
                        "issue_type": "MISSING_FORECAST",
                        "total_candidates": len(candidates),
                        "description": "No forecast published before cutoff",
                    })
                else:
                    # Select the latest publication
                    best_match = max(eligible, key=lambda c: c["publish_dt"])
                    selected_rows.append({
                        "decision_date": decision_date.isoformat(),
                        "delivery_date": current_date.isoformat(),
                        "delivery_hour_utc": delivery_hour_str,
                        "decision_cutoff_utc": cutoff_str,
                        "selected_publish_time_utc": best_match["publish_dt"].strftime("%Y-%m-%dT%H:%M:%SZ"),
                        "forecast_generation_mw": float(best_match["generation"]),
                        "eligible_forecast_count": len(eligible),
                        "forecast_status": "VALID",
                    })

            current_date += timedelta(days=1)

        selected_df = pd.DataFrame(selected_rows)
        logger.info(
            "Forecast selection complete: %d total hours, %d valid (%.2f%%)",
            len(selected_df),
            (selected_df["forecast_status"] == "VALID").sum(),
            ((selected_df["forecast_status"] == "VALID").sum() / len(selected_df)) * 100.0,
        )

        if save_csv:
            selected_df.to_csv(self.config.selected_forecasts_csv, index=False)
        return selected_df, selection_issues

