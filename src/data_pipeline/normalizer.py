"""FUELHH actual wind generation normalization module."""

import logging
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

from src.data_pipeline.config import PipelineConfig, DEFAULT_CONFIG

logger = logging.getLogger(__name__)


class FuelhhNormalizer:
    """Normalizes half-hourly FUELHH readings into strict hourly average generation."""

    def __init__(self, config: Optional[PipelineConfig] = None):
        self.config = config or DEFAULT_CONFIG
        self.config.processed_data_dir.mkdir(parents=True, exist_ok=True)

    def normalize(
        self, raw_records: List[Dict[str, Any]], save_csv: bool = True
    ) -> Tuple[pd.DataFrame, List[Dict[str, Any]]]:
        """Normalize half-hourly FUELHH records into hourly average MW.

        Returns:
            Tuple of:
            - hourly_actuals_df: DataFrame of 744 evaluated hourly periods
            - quality_issues: List of dicts recording any data quality anomalies
        """
        logger.info("Normalizing %d raw FUELHH records", len(raw_records))
        quality_issues: List[Dict[str, Any]] = []

        # Index raw records by delivery hour and half-hour slot
        # Key: (delivery_date, hour_int, minute_int)
        # Check for duplicates or null values
        indexed_readings: Dict[Tuple[str, int, int], List[Dict[str, Any]]] = {}

        for rec in raw_records:
            st_str = rec.get("startTime")
            if not st_str:
                quality_issues.append({
                    "record": rec,
                    "issue_type": "MISSING_START_TIME",
                    "description": "FUELHH record missing startTime",
                })
                continue

            try:
                # Parse ISO UTC string
                dt = datetime.fromisoformat(st_str.replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                else:
                    dt = dt.astimezone(timezone.utc)
            except Exception as parse_err:
                quality_issues.append({
                    "record": rec,
                    "issue_type": "INVALID_TIMESTAMP",
                    "description": f"Failed to parse startTime {st_str}: {parse_err}",
                })
                continue

            gen = rec.get("generation")
            if gen is None:
                quality_issues.append({
                    "delivery_hour_utc": dt.isoformat(),
                    "issue_type": "NULL_GENERATION",
                    "description": f"Null generation in FUELHH at {st_str}",
                })

            slot_key = (dt.strftime("%Y-%m-%d"), dt.hour, dt.minute)
            indexed_readings.setdefault(slot_key, []).append(rec)

        # Check for duplicate half-hourly readings
        for slot_key, items in indexed_readings.items():
            if len(items) > 1:
                quality_issues.append({
                    "date": slot_key[0],
                    "hour": slot_key[1],
                    "minute": slot_key[2],
                    "issue_type": "DUPLICATE_HALF_HOURLY_READINGS",
                    "description": f"Found {len(items)} readings for slot {slot_key}",
                })

        # Build complete 744-hour evaluation grid
        hourly_rows: List[Dict[str, Any]] = []
        current_date = self.config.delivery_start_date

        while current_date <= self.config.delivery_end_date:
            date_str = current_date.isoformat()
            for h in range(24):
                delivery_hour_dt = datetime.combine(
                    current_date, datetime.min.time(), tzinfo=timezone.utc
                ) + timedelta(hours=h)
                delivery_hour_str = delivery_hour_dt.strftime("%Y-%m-%dT%H:00:00Z")

                readings_00 = indexed_readings.get((date_str, h, 0), [])
                readings_30 = indexed_readings.get((date_str, h, 30), [])

                # Validation checks:
                # 1. Exactly one valid reading at :00
                # 2. Exactly one valid reading at :30
                # 3. Timestamps are exactly 30 minutes apart
                # 4. Neither reading has null generation

                status = "VALID"
                fail_reasons: List[str] = []

                if len(readings_00) == 0:
                    fail_reasons.append("MISSING_FIRST_HALF_HOUR")
                elif len(readings_00) > 1:
                    fail_reasons.append("DUPLICATE_FIRST_HALF_HOUR")

                if len(readings_30) == 0:
                    fail_reasons.append("MISSING_SECOND_HALF_HOUR")
                elif len(readings_30) > 1:
                    fail_reasons.append("DUPLICATE_SECOND_HALF_HOUR")

                gen_00 = None
                gen_30 = None
                hourly_actual = None

                if len(readings_00) == 1:
                    gen_00 = readings_00[0].get("generation")
                    if gen_00 is None:
                        fail_reasons.append("NULL_GEN_FIRST_HALF_HOUR")

                if len(readings_30) == 1:
                    gen_30 = readings_30[0].get("generation")
                    if gen_30 is None:
                        fail_reasons.append("NULL_GEN_SECOND_HALF_HOUR")

                if not fail_reasons:
                    # Check exact spacing
                    dt_00 = datetime.fromisoformat(readings_00[0]["startTime"].replace("Z", "+00:00"))
                    dt_30 = datetime.fromisoformat(readings_30[0]["startTime"].replace("Z", "+00:00"))
                    diff_seconds = (dt_30 - dt_00).total_seconds()
                    if diff_seconds != 1800.0:
                        fail_reasons.append(f"INVALID_SPACING_{int(diff_seconds)}S")

                if fail_reasons:
                    status = ";".join(fail_reasons)
                    quality_issues.append({
                        "delivery_date": date_str,
                        "delivery_hour_utc": delivery_hour_str,
                        "issue_type": "ACTUAL_HOURLY_INCOMPLETE",
                        "description": status,
                    })
                else:
                    hourly_actual = (float(gen_00) + float(gen_30)) / 2.0

                hourly_rows.append({
                    "delivery_date": date_str,
                    "delivery_hour_utc": delivery_hour_str,
                    "actual_generation_mw": hourly_actual,
                    "half_hour_1_gen_mw": float(gen_00) if gen_00 is not None else None,
                    "half_hour_2_gen_mw": float(gen_30) if gen_30 is not None else None,
                    "actual_status": status,
                })

            current_date += timedelta(days=1)

        hourly_df = pd.DataFrame(hourly_rows)
        logger.info(
            "Hourly actuals normalization complete: %d total hours, %d valid (%.2f%%)",
            len(hourly_df),
            (hourly_df["actual_status"] == "VALID").sum(),
            ((hourly_df["actual_status"] == "VALID").sum() / len(hourly_df)) * 100.0,
        )

        # Save to CSV if requested
        if save_csv:
            hourly_df.to_csv(self.config.hourly_actuals_csv, index=False)
        return hourly_df, quality_issues

