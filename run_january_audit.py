"""Entry point for WindIQ January 2026 Data Extraction & Forecast Accuracy Audit."""

import argparse
import logging
import sys
from datetime import datetime, timezone

from src.data_pipeline.config import PipelineConfig, DEFAULT_CONFIG
from src.data_pipeline.extractor import ElexonExtractor
from src.data_pipeline.normalizer import FuelhhNormalizer
from src.data_pipeline.selector import WindforSelector
from src.data_pipeline.evaluator import AccuracyEvaluator
from src.data_pipeline.validator import PipelineValidator


def configure_logging(verbose: bool = False) -> None:
    """Configure structured console logging."""
    log_level = logging.DEBUG if verbose else logging.INFO
    log_format = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    logging.basicConfig(
        level=log_level,
        format=log_format,
        datefmt="%Y-%m-%d %H:%M:%S",
        stream=sys.stdout,
        force=True,
    )


def run_pipeline(use_cache: bool = True, verbose: bool = False) -> int:
    """Execute the complete January 2026 audit pipeline."""
    configure_logging(verbose=verbose)
    logger = logging.getLogger("WindIQ.Pipeline")
    logger.info("=" * 70)
    logger.info("Starting WindIQ January 2026 Forecast Accuracy Audit")
    logger.info("=" * 70)

    config = DEFAULT_CONFIG

    # 1. Extraction
    logger.info("[Step 1/5] Extracting Elexon datasets (WINDFOR & FUELHH)...")
    extractor = ElexonExtractor(config)
    windfor_records = extractor.extract_all_windfor(use_cache=use_cache)
    fuelhh_records = extractor.extract_all_fuelhh(use_cache=use_cache)
    logger.info(
        "Extraction finished: %d WINDFOR records, %d FUELHH records",
        len(windfor_records),
        len(fuelhh_records),
    )

    # 2. Normalization
    logger.info("[Step 2/5] Normalizing FUELHH actuals to hourly averages...")
    normalizer = FuelhhNormalizer(config)
    hourly_actuals_df, actual_issues = normalizer.normalize(fuelhh_records)
    logger.info(
        "Actuals normalized: %d hours (%d valid)",
        len(hourly_actuals_df),
        (hourly_actuals_df["actual_status"] == "VALID").sum(),
    )

    # 3. Forecast Selection
    logger.info("[Step 3/5] Selecting day-ahead WINDFOR forecasts before 09:00 cutoff...")
    selector = WindforSelector(config)
    selected_forecasts_df, forecast_issues = selector.select_forecasts(windfor_records)
    logger.info(
        "Forecast selection complete: %d hours (%d valid)",
        len(selected_forecasts_df),
        (selected_forecasts_df["forecast_status"] == "VALID").sum(),
    )

    # 4. Evaluation and Reporting
    logger.info("[Step 4/5] Evaluating forecast accuracy and generating reports...")
    evaluator = AccuracyEvaluator(config)
    comparisons_df, daily_df, metrics = evaluator.evaluate(
        selected_forecasts_df=selected_forecasts_df,
        hourly_actuals_df=hourly_actuals_df,
        actual_issues=actual_issues,
        forecast_issues=forecast_issues,
        raw_windfor_records=windfor_records,
        raw_fuelhh_records=fuelhh_records,
    )

    kpi = metrics["summary_kpis"]
    logger.info("Accuracy KPIs calculated:")
    logger.info("  Valid comparisons: %d / %d", kpi["valid_comparisons"], len(comparisons_df))
    logger.info("  MAE:               %s MW", f"{kpi['mae_mw']:,.2f}")
    logger.info("  RMSE:              %s MW", f"{kpi['rmse_mw']:,.2f}")
    logger.info("  MAPE:              %s%%", f"{kpi['mape_pct']:.2f}")
    logger.info("  Bias:              %s MW", f"{kpi['forecast_bias_mw']:+,.2f}")

    # 5. Validation and Regression Test
    logger.info("[Step 5/5] Running automated checks and regression test...")
    validator = PipelineValidator(config)
    val_report = validator.run_all_checks(
        raw_windfor=windfor_records,
        raw_fuelhh=fuelhh_records,
        hourly_actuals_df=hourly_actuals_df,
        selected_forecasts_df=selected_forecasts_df,
        comparisons_df=comparisons_df,
        metrics=metrics,
    )

    print("\n" + "=" * 75)
    print("WINDIQ JANUARY 2026 AUDIT — VALIDATION SUMMARY")
    print("=" * 75)
    for check_name, (passed, msg) in val_report["checks"].items():
        status_tag = "[PASS]" if passed else "[FAIL]"
        print(f"{status_tag} {check_name}")
        print(f"       Details: {msg}")

    print("=" * 75)
    if val_report["all_passed"]:
        print("RESULT: ALL AUDIT VALIDATIONS & REGRESSION BENCHMARKS PASSED.")
        print("=" * 75 + "\n")
        return 0
    else:
        print("RESULT: ONE OR MORE AUDIT VALIDATIONS FAILED.")
        print("=" * 75 + "\n")
        return 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run WindIQ January 2026 Audit Pipeline")
    parser.add_argument(
        "--no-cache", action="store_true", help="Force re-fetch from Elexon API without disk cache"
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true", help="Enable verbose debug logging"
    )
    args = parser.parse_args()

    exit_code = run_pipeline(use_cache=not args.no_cache, verbose=args.verbose)
    sys.exit(exit_code)

