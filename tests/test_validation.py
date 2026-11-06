"""Unit and validation test suite for WindIQ data pipeline."""

import json
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo
import pandas as pd
import pytest

from src.data_pipeline.config import DEFAULT_CONFIG, PipelineConfig
from src.data_pipeline.normalizer import FuelhhNormalizer
from src.data_pipeline.selector import WindforSelector


def test_timezone_cutoff_handling():
    """Verify that cutoff time converts Europe/London to UTC correctly."""
    config = PipelineConfig()
    # In January, London is GMT (UTC+0)
    jan_date = date(2026, 1, 15)
    cutoff_jan = config.get_decision_cutoff_utc(jan_date)
    assert cutoff_jan.tzinfo == timezone.utc
    assert cutoff_jan.hour == 9
    assert cutoff_jan.minute == 0

    # In July (BST), London is UTC+1 -> 09:00 BST should be 08:00 UTC
    jul_date = date(2026, 7, 15)
    cutoff_jul = config.get_decision_cutoff_utc(jul_date)
    assert cutoff_jul.tzinfo == timezone.utc
    assert cutoff_jul.hour == 8
    assert cutoff_jul.minute == 0


def test_fuelhh_normalization_rules():
    """Verify that FUELHH requires exactly two readings 30 mins apart."""
    normalizer = FuelhhNormalizer(DEFAULT_CONFIG)

    # Valid hour readings
    sample_valid = [
        {"startTime": "2026-01-02T14:00:00Z", "generation": 1000},
        {"startTime": "2026-01-02T14:30:00Z", "generation": 2000},
    ]
    df, issues = normalizer.normalize(sample_valid, save_csv=False)
    h_row = df[df["delivery_hour_utc"] == "2026-01-02T14:00:00Z"].iloc[0]
    assert h_row["actual_status"] == "VALID"
    assert h_row["actual_generation_mw"] == 1500.0


def test_missing_reading_rejected():
    """Verify that an hour missing one half-hour reading is marked invalid and not interpolated."""
    normalizer = FuelhhNormalizer(DEFAULT_CONFIG)
    sample_incomplete = [
        {"startTime": "2026-01-02T14:00:00Z", "generation": 1000},
        # Missing 14:30
    ]
    df, issues = normalizer.normalize(sample_incomplete, save_csv=False)
    h_row = df[df["delivery_hour_utc"] == "2026-01-02T14:00:00Z"].iloc[0]
    assert h_row["actual_status"] != "VALID"
    assert pd.isna(h_row["actual_generation_mw"])


def test_forecast_cutoff_exclusion():
    """Verify that forecasts published strictly after cutoff are excluded."""
    selector = WindforSelector(DEFAULT_CONFIG)
    # Decision date for 2026-01-02 is 2026-01-01, cutoff is 09:00 UTC
    candidates = [
        # Pre-cutoff (eligible)
        {"publishTime": "2026-01-01T04:30:00Z", "startTime": "2026-01-02T12:00:00Z", "generation": 5000},
        {"publishTime": "2026-01-01T07:30:00Z", "startTime": "2026-01-02T12:00:00Z", "generation": 6000},
        # Post-cutoff (ineligible)
        {"publishTime": "2026-01-01T09:30:00Z", "startTime": "2026-01-02T12:00:00Z", "generation": 9999},
    ]
    df, issues = selector.select_forecasts(candidates, save_csv=False)
    h_row = df[df["delivery_hour_utc"] == "2026-01-02T12:00:00Z"].iloc[0]
    assert h_row["forecast_status"] == "VALID"
    assert h_row["forecast_generation_mw"] == 6000.0  # Selected latest eligible, not 9999
    assert h_row["selected_publish_time_utc"] == "2026-01-01T07:30:00Z"
    assert h_row["eligible_forecast_count"] == 2

