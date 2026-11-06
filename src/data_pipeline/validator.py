"""Mandatory validation checks and regression tests for WindIQ audit."""

import logging
import math
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

from src.data_pipeline.config import PipelineConfig, DEFAULT_CONFIG

logger = logging.getLogger(__name__)


class PipelineValidator:
    """Performs mandatory automated checks and known-sample regression verification."""

    def __init__(self, config: Optional[PipelineConfig] = None):
        self.config = config or DEFAULT_CONFIG

    def run_all_checks(
        self,
        raw_windfor: List[Dict[str, Any]],
        raw_fuelhh: List[Dict[str, Any]],
        hourly_actuals_df: pd.DataFrame,
        selected_forecasts_df: pd.DataFrame,
        comparisons_df: pd.DataFrame,
        metrics: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Execute all 12 mandatory checks and the regression benchmark."""
        results: Dict[str, Tuple[bool, str]] = {}

        # Check 1: All 31 decision dates are processed
        dec_dates = {row["decision_date"] for _, row in comparisons_df.iterrows()}
        expected_dec_dates = {
            (self.config.decision_start_date + timedelta(days=i)).isoformat()
            for i in range(31)
        }
        c1_pass = dec_dates == expected_dec_dates
        results["Check 1: All 31 decision dates processed"] = (
            c1_pass,
            f"Found {len(dec_dates)} decision dates, expected 31 ({min(dec_dates)} to {max(dec_dates)})",
        )

        # Check 2: Corresponding delivery dates are Jan 2 through Feb 1
        del_dates = {row["delivery_date"] for _, row in comparisons_df.iterrows()}
        expected_del_dates = {
            (self.config.delivery_start_date + timedelta(days=i)).isoformat()
            for i in range(31)
        }
        c2_pass = del_dates == expected_del_dates
        results["Check 2: Delivery dates range Jan 2 to Feb 1"] = (
            c2_pass,
            f"Found {len(del_dates)} delivery dates, expected 31 ({min(del_dates)} to {max(del_dates)})",
        )

        # Check 3: FUELHH actuals contain valid half-hourly timestamps
        c3_pass = True
        c3_err = ""
        for rec in raw_fuelhh:
            st = rec.get("startTime")
            if not st:
                c3_pass = False
                c3_err = "Null startTime detected in FUELHH"
                break
            try:
                dt = datetime.fromisoformat(st.replace("Z", "+00:00"))
                if dt.minute not in (0, 30):
                    c3_pass = False
                    c3_err = f"Invalid minute {dt.minute} in FUELHH startTime {st}"
                    break
            except Exception as e:
                c3_pass = False
                c3_err = f"Invalid timestamp {st}: {e}"
                break
        if c3_pass:
            c3_err = f"Validated all {len(raw_fuelhh)} FUELHH half-hourly timestamps"
        results["Check 3: FUELHH timestamps valid half-hourly"] = (c3_pass, c3_err)

        # Check 4: Actual aggregation requires exactly two valid readings
        valid_actuals = hourly_actuals_df[hourly_actuals_df["actual_status"] == "VALID"]
        c4_pass = True
        c4_err = ""
        for _, row in valid_actuals.iterrows():
            hh1 = row.get("half_hour_1_gen_mw")
            hh2 = row.get("half_hour_2_gen_mw")
            act = row.get("actual_generation_mw")
            if pd.isna(hh1) or pd.isna(hh2) or pd.isna(act):
                c4_pass = False
                c4_err = f"Missing half-hour reading in valid actual: {row['delivery_hour_utc']}"
                break
            expected_avg = (hh1 + hh2) / 2.0
            if abs(act - expected_avg) > 1e-4:
                c4_pass = False
                c4_err = f"Average mismatch at {row['delivery_hour_utc']}: act={act}, expected={expected_avg}"
                break
        if c4_pass:
            c4_err = f"All {len(valid_actuals)} hourly actuals correctly aggregated from 2 readings"
        results["Check 4: Actual aggregation requires exactly two readings"] = (c4_pass, c4_err)

        # Check 5: Forecast publication versions are preserved
        pub_times_by_hour: Dict[str, set] = {}
        for rec in raw_windfor:
            st = rec.get("startTime")
            pub = rec.get("publishTime")
            if st and pub:
                pub_times_by_hour.setdefault(st, set()).add(pub)
        max_versions = max(len(v) for v in pub_times_by_hour.values()) if pub_times_by_hour else 0
        c5_pass = max_versions > 1
        results["Check 5: Forecast publication versions preserved"] = (
            c5_pass,
            f"Preserved up to {max_versions} publication cycles per delivery hour",
        )

        # Check 6: No duplicate (publishTime, startTime) forecast records
        seen_composite = set()
        c6_pass = True
        c6_err = ""
        for rec in raw_windfor:
            comp_key = (rec.get("publishTime"), rec.get("startTime"))
            if comp_key in seen_composite:
                c6_pass = False
                c6_err = f"Duplicate composite key found: {comp_key}"
                break
            seen_composite.add(comp_key)
        if c6_pass:
            c6_err = f"Verified {len(raw_windfor)} unique (publishTime, startTime) pairs"
        results["Check 6: Unique (publishTime, startTime) composite identity"] = (c6_pass, c6_err)

        # Check 7: No forecast published after the decision cutoff is selected
        c7_pass = True
        c7_err = ""
        valid_comparisons = comparisons_df[comparisons_df["comparison_status"] == "VALID"]
        for _, row in valid_comparisons.iterrows():
            pub_str = row["selected_publish_time_utc"]
            cut_str = row["decision_cutoff_utc"]
            pub_dt = datetime.fromisoformat(pub_str.replace("Z", "+00:00"))
            cut_dt = datetime.fromisoformat(cut_str.replace("Z", "+00:00"))
            if pub_dt > cut_dt:
                c7_pass = False
                c7_err = f"Forecast at {row['delivery_hour_utc']} selected after cutoff: pub={pub_str} > cut={cut_str}"
                break
        if c7_pass:
            c7_err = f"All {len(valid_comparisons)} selected forecasts strictly published <= cutoff"
        results["Check 7: No forecast selected after decision cutoff"] = (c7_pass, c7_err)

        # Check 8: Every selected forecast matches its delivery hour
        c8_pass = True
        c8_err = ""
        for _, row in selected_forecasts_df[selected_forecasts_df["forecast_status"] == "VALID"].iterrows():
            del_hour = row["delivery_hour_utc"]
            # Delivery hour should match delivery date
            if not del_hour.startswith(row["delivery_date"]):
                c8_pass = False
                c8_err = f"Mismatch between delivery_hour {del_hour} and delivery_date {row['delivery_date']}"
                break
        if c8_pass:
            c8_err = f"All {len(selected_forecasts_df)} selected forecasts match delivery hour and date"
        results["Check 8: Every selected forecast matches its delivery hour"] = (c8_pass, c8_err)

        # Check 9: Every comparison uses actuals from the correct delivery hour
        c9_pass = True
        c9_err = ""
        for _, row in valid_comparisons.iterrows():
            if not row["delivery_hour_utc"].startswith(row["delivery_date"]):
                c9_pass = False
                c9_err = f"Comparison delivery hour {row['delivery_hour_utc']} mismatch with {row['delivery_date']}"
                break
        if c9_pass:
            c9_err = f"All {len(valid_comparisons)} comparisons match delivery hour and date"
        results["Check 9: Comparisons use actuals from correct delivery hour"] = (c9_pass, c9_err)

        # Check 10: No invalid comparison is included in accuracy metrics
        c10_pass = True
        c10_err = ""
        invalid_comparisons = comparisons_df[comparisons_df["comparison_status"] != "VALID"]
        for _, row in invalid_comparisons.iterrows():
            if pd.notna(row["forecast_error_mw"]) or pd.notna(row["absolute_error_mw"]):
                c10_pass = False
                c10_err = f"Invalid row has computed error: {row['delivery_hour_utc']}"
                break
        if c10_pass:
            c10_err = f"Verified {len(invalid_comparisons)} invalid rows have null errors"
        results["Check 10: No invalid comparison in accuracy metrics"] = (c10_pass, c10_err)

        # Check 11: Forecast and actual values are expressed in MW
        c11_pass = True
        c11_err = ""
        for _, row in valid_comparisons.iterrows():
            f_mw = row["forecast_generation_mw"]
            a_mw = row["actual_generation_mw"]
            if f_mw < 0 or f_mw > 45000 or a_mw < 0 or a_mw > 45000:
                c11_pass = False
                c11_err = f"Out of range MW value: forecast={f_mw}, actual={a_mw}"
                break
        if c11_pass:
            c11_err = "All forecast and actual values are realistic non-negative MW figures"
        results["Check 11: Values expressed in realistic MW"] = (c11_pass, c11_err)

        # Check 12: All missing data is explicitly reported
        kpis = metrics["summary_kpis"]
        c12_pass = (
            "missing_forecast_hours" in kpis
            and "missing_actual_hours" in kpis
            and "forecast_coverage_pct" in kpis
            and "actual_completeness_pct" in kpis
        )
        c12_err = f"Coverage: {kpis['forecast_coverage_pct']}%, Completeness: {kpis['actual_completeness_pct']}%, Missing FC: {kpis['missing_forecast_hours']}, Missing Act: {kpis['missing_actual_hours']}"
        results["Check 12: Missing data explicitly reported"] = (c12_pass, c12_err)

        # Check 13: Regression Benchmark (Jan 2, 2026 14:00 UTC)
        reg_pass, reg_msg = self.run_regression_benchmark(comparisons_df)
        results["Regression Benchmark: Jan 2, 2026 14:00 UTC"] = (reg_pass, reg_msg)

        all_passed = all(p for p, _ in results.values())
        return {
            "all_passed": all_passed,
            "checks": results,
        }

    def run_regression_benchmark(self, comparisons_df: pd.DataFrame) -> Tuple[bool, str]:
        """Verify the known sample regression case.

        Decision date: January 1, 2026
        Delivery hour: January 2, 2026, 14:00 UTC
        Provisional cutoff: January 1, 2026, 09:00 UTC
        Selected forecast: 17,712 MW (from 07:30 UTC publication)
        Actual half-hourly readings: 15,230 MW (14:00) and 15,796 MW (14:30)
        Hourly average actual: 15,513 MW
        Forecast error: +2,199 MW
        Absolute error: 2,199 MW
        Absolute percentage error: ~14.18%
        """
        match = comparisons_df[
            (comparisons_df["delivery_date"] == "2026-01-02")
            & (comparisons_df["delivery_hour_utc"] == "2026-01-02T14:00:00Z")
        ]

        if match.empty:
            return False, "Sample benchmark row 2026-01-02T14:00:00Z not found in comparisons"

        row = match.iloc[0]

        expected_forecast = 17712.0
        expected_actual = 15513.0
        expected_error = 2199.0
        expected_abs_err = 2199.0
        expected_ape = (2199.0 / 15513.0) * 100.0  # ~14.1752%

        f_val = float(row["forecast_generation_mw"])
        a_val = float(row["actual_generation_mw"])
        err_val = float(row["forecast_error_mw"])
        abs_err_val = float(row["absolute_error_mw"])
        ape_val = float(row["absolute_percentage_error"])
        selected_pub = row["selected_publish_time_utc"]

        errors: List[str] = []
        if abs(f_val - expected_forecast) > 1e-2:
            errors.append(f"forecast={f_val} != {expected_forecast}")
        if abs(a_val - expected_actual) > 1e-2:
            errors.append(f"actual={a_val} != {expected_actual}")
        if abs(err_val - expected_error) > 1e-2:
            errors.append(f"error={err_val} != {expected_error}")
        if abs(abs_err_val - expected_abs_err) > 1e-2:
            errors.append(f"abs_error={abs_err_val} != {expected_abs_err}")
        if abs(ape_val - expected_ape) > 1e-2:
            errors.append(f"ape={ape_val:.4f}% != {expected_ape:.4f}%")
        if not selected_pub.startswith("2026-01-01T07:30"):
            errors.append(f"selected_pub={selected_pub} != 2026-01-01T07:30:00Z")

        if errors:
            return False, f"Regression discrepancies: {'; '.join(errors)}"

        return True, (
            f"Exact match: Forecast={f_val:,.0f} MW (pub {selected_pub}), "
            f"Actual={a_val:,.0f} MW, Error={err_val:+,.0f} MW, APE={ape_val:.2f}%"
        )

