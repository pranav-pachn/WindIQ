"""Regression tests for WindIQ audit pipeline against verified sample."""

import json
from pathlib import Path
import pandas as pd
import pytest

from src.data_pipeline.config import DEFAULT_CONFIG
from src.data_pipeline.validator import PipelineValidator


def test_known_sample_regression():
    """Verify that the January 2, 2026 14:00 UTC sample matches expected metrics exactly."""
    comparisons_path = DEFAULT_CONFIG.january_comparisons_csv
    assert comparisons_path.exists(), f"Comparisons file missing: {comparisons_path}"

    df = pd.read_csv(comparisons_path)
    validator = PipelineValidator(DEFAULT_CONFIG)
    passed, msg = validator.run_regression_benchmark(df)
    assert passed, f"Regression test failed: {msg}"


def test_forecast_publication_versions():
    """Verify that multiple forecast publications exist and latest before cutoff is chosen."""
    forecasts_path = DEFAULT_CONFIG.selected_forecasts_csv
    assert forecasts_path.exists(), f"Selected forecasts file missing: {forecasts_path}"

    df = pd.read_csv(forecasts_path)
    # Check sample day row
    sample = df[
        (df["delivery_date"] == "2026-01-02")
        & (df["delivery_hour_utc"] == "2026-01-02T14:00:00Z")
    ].iloc[0]

    assert sample["eligible_forecast_count"] == 3
    assert sample["forecast_generation_mw"] == 17712.0
    assert sample["selected_publish_time_utc"] == "2026-01-01T07:30:00Z"

