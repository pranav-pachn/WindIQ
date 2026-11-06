"""Independent integrity verification test suite for WindIQ production readiness."""

import json
from datetime import datetime, timezone, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo
import numpy as np
import pandas as pd
import pytest

from src.data_pipeline.config import DEFAULT_CONFIG


@pytest.fixture(scope="module")
def audit_data():
    """Load all relevant artifacts for verification."""
    comparisons_path = DEFAULT_CONFIG.january_comparisons_csv
    raw_windfor_path = DEFAULT_CONFIG.raw_windfor_json
    raw_fuelhh_path = DEFAULT_CONFIG.raw_fuelhh_json
    metrics_path = DEFAULT_CONFIG.accuracy_metrics_json

    comparisons = pd.read_csv(comparisons_path)
    with open(raw_windfor_path, "r", encoding="utf-8") as f:
        raw_windfor = json.load(f)
    with open(raw_fuelhh_path, "r", encoding="utf-8") as f:
        raw_fuelhh = json.load(f)
    with open(metrics_path, "r", encoding="utf-8") as f:
        metrics = json.load(f)

    return {
        "comparisons": comparisons,
        "raw_windfor": raw_windfor,
        "raw_fuelhh": raw_fuelhh,
        "metrics": metrics,
    }


def test_audit_check_1_cutoff_compliance(audit_data):
    """1. All 744 selected forecast records have publishTime <= decision_cutoff."""
    comparisons = audit_data["comparisons"]
    assert len(comparisons) == 744

    for _, row in comparisons.iterrows():
        pub = datetime.fromisoformat(row["selected_publish_time_utc"].replace("Z", "+00:00"))
        cut = datetime.fromisoformat(row["decision_cutoff_utc"].replace("Z", "+00:00"))
        assert pub <= cut, f"Forecast {pub} published after cutoff {cut}"


def test_audit_check_2_exact_delivery_hour(audit_data):
    """2. Every selected forecast matches the exact delivery hour."""
    comparisons = audit_data["comparisons"]
    for _, row in comparisons.iterrows():
        del_hr = row["delivery_hour_utc"]
        del_date = row["delivery_date"]
        assert del_hr.startswith(del_date), f"Hour {del_hr} does not match date {del_date}"


def test_audit_check_3_two_half_hourly_readings(audit_data):
    """3. Every actual hourly value is calculated from exactly two unique half-hourly FUELHH readings."""
    raw_fuelhh = audit_data["raw_fuelhh"]
    by_hr = {}
    for r in raw_fuelhh:
        dt = datetime.fromisoformat(r["startTime"].replace("Z", "+00:00"))
        hr_str = dt.strftime("%Y-%m-%dT%H:00:00Z")
        by_hr.setdefault(hr_str, []).append(r)

    assert len(by_hr) == 744
    for hr, readings in by_hr.items():
        assert len(readings) == 2, f"Hour {hr} has {len(readings)} readings"
        mins = sorted([datetime.fromisoformat(x["startTime"].replace("Z", "+00:00")).minute for x in readings])
        assert mins == [0, 30]


def test_audit_check_4_no_duplicates(audit_data):
    """4. No duplicate actual timestamps or forecast composite keys exist."""
    raw_fuelhh = audit_data["raw_fuelhh"]
    raw_windfor = audit_data["raw_windfor"]

    fuelhh_times = [r["startTime"] for r in raw_fuelhh]
    assert len(fuelhh_times) == len(set(fuelhh_times))

    windfor_keys = [(r["publishTime"], r["startTime"]) for r in raw_windfor]
    assert len(windfor_keys) == len(set(windfor_keys))


def test_audit_check_5_all_31_dates_24_hours(audit_data):
    """5. All 31 delivery dates contain exactly 24 valid hourly comparisons."""
    comparisons = audit_data["comparisons"]
    counts = comparisons.groupby("delivery_date").size()
    assert len(counts) == 31
    assert (counts == 24).all()
    assert (comparisons["comparison_status"] == "VALID").all()


def test_audit_check_6_recalculated_metrics(audit_data):
    """6. Recalculate MAE, RMSE, MAPE, and bias directly from comparisons CSV."""
    comparisons = audit_data["comparisons"]
    metrics = audit_data["metrics"]["summary_kpis"]

    f = comparisons["forecast_generation_mw"].to_numpy(dtype=float)
    a = comparisons["actual_generation_mw"].to_numpy(dtype=float)

    err = f - a
    abs_err = np.abs(err)
    ape = (abs_err / a) * 100.0

    calc_mae = float(np.mean(abs_err))
    calc_rmse = float(np.sqrt(np.mean(err ** 2)))
    calc_mape = float(np.mean(ape))
    calc_bias = float(np.mean(err))

    assert round(calc_mae, 2) == metrics["mae_mw"]
    assert round(calc_rmse, 2) == metrics["rmse_mw"]
    assert round(calc_mape, 2) == metrics["mape_pct"]
    assert round(calc_bias, 2) == metrics["forecast_bias_mw"]


def test_audit_check_7_zero_actuals_threshold(audit_data):
    """7. Report zero / near-zero actual values and verify MAPE handling."""
    comparisons = audit_data["comparisons"]
    actuals = comparisons["actual_generation_mw"].to_numpy(dtype=float)

    assert np.min(actuals) > 1000.0  # Min is 1,711.5 MW
    assert np.sum(actuals <= 0.0) == 0


def test_audit_check_8_error_counts_sum_to_744(audit_data):
    """8. Verify overforecast, underforecast, and zero-error counts sum to 744."""
    comparisons = audit_data["comparisons"]
    metrics = audit_data["metrics"]["summary_kpis"]

    f = comparisons["forecast_generation_mw"].to_numpy(dtype=float)
    a = comparisons["actual_generation_mw"].to_numpy(dtype=float)
    err = f - a

    over = int(np.sum(err > 0))
    under = int(np.sum(err < 0))
    zero = int(np.sum(err == 0))

    assert over == metrics["overforecast_count"] == 632
    assert under == metrics["underforecast_count"] == 112
    assert zero == metrics["zero_error_count"] == 0
    assert over + under + zero == 744


def test_audit_check_9_january_28_investigation(audit_data):
    """9. Verify January 28 values and high MAPE explanation."""
    comparisons = audit_data["comparisons"]
    jan28 = comparisons[comparisons["delivery_date"] == "2026-01-28"]
    assert len(jan28) == 24
    assert (jan28["forecast_error_mw"] > 0).all()  # 100% overforecast
    assert jan28["forecast_error_mw"].mean() > 5000.0


def test_audit_check_10_timezone_consistency(audit_data):
    """10. Check decision cutoff and delivery date mapping using Europe/London rules."""
    comparisons = audit_data["comparisons"]
    tz_london = ZoneInfo("Europe/London")

    for _, row in comparisons.iterrows():
        del_date = datetime.strptime(row["delivery_date"], "%Y-%m-%d").date()
        dec_date = datetime.strptime(row["decision_date"], "%Y-%m-%d").date()
        assert del_date - dec_date == timedelta(days=1)

        expected_local = datetime.combine(dec_date, datetime.min.time().replace(hour=9), tzinfo=tz_london)
        expected_utc = expected_local.astimezone(timezone.utc)
        assert row["decision_cutoff_utc"] == expected_utc.strftime("%Y-%m-%dT%H:%M:%SZ")

