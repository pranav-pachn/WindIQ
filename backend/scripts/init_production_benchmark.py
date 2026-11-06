"""Production database migration, benchmark data initialization, and verification script.

Executes:
1. Alembic schema migration up to head (005_auth_and_rbac_schema).
2. Default user account seeding (Admin, Analyst, Viewer) if empty.
3. January 2026 canonical dataset ingestion & day-ahead forecast evaluation backfill.
4. Mathematical verification of all 11 canonical benchmark metrics to 4 decimal places.
"""

import asyncio
import json
import logging
import sys
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# Ensure app is importable
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.core.config import get_settings
from app.core.database import get_session_factory
from app.services.auth_service import AuthService
from app.services.backfill_service import HistoricalBackfillService

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)-5.5s] [%(name)s] %(message)s",
)
logger = logging.getLogger("windiq.init_benchmark")

# Canonical Benchmark Targets (January 2026: 744 delivery hours)
EXPECTED_METRICS = {
    "count": 744,
    "mae": 2038.9126,
    "rmse": 2504.7587,
    "mape": 22.0446,
    "bias": 1747.8871,
    "overforecast": 632,
    "underforecast": 112,
    "matched_population": 553,
    "matched_mae_reduction": 34.16,
    "forward_revisions": 13367,
    "mean_abs_revision": 343.9565,
}


def run_alembic_migrations() -> None:
    """Run Alembic migrations up to head."""
    logger.info("Applying database migrations to head...")
    ini_path = backend_dir / "alembic.ini"
    alembic_cfg = Config(str(ini_path))
    command.upgrade(alembic_cfg, "head")
    logger.info("Database migrations successfully applied to head.")


def ensure_cache_files() -> None:
    """Ensure daily cache files exist in data/raw/cache from canonical raw JSONs if needed."""
    settings = get_settings()
    cache_dir = Path(settings.RAW_CACHE_DIR)
    cache_dir.mkdir(parents=True, exist_ok=True)

    # Check if WINDFOR canonical raw file exists
    windfor_single = Path("data/raw/windfor_jan2026.json")
    if not windfor_single.exists():
        windfor_single = backend_dir / "data/raw/windfor_jan2026.json"

    if windfor_single.exists() and not (cache_dir / "windfor_2026-01-01.json").exists():
        logger.info("Unpacking daily WINDFOR cache files from %s...", windfor_single)
        with open(windfor_single, encoding="utf-8") as f:
            records = json.load(f)
        by_day: dict[str, list] = {}
        for r in records:
            pt = r.get("publishTime", "")
            if pt:
                day_str = pt[:10]
                by_day.setdefault(day_str, []).append(r)
        for day_str, day_recs in by_day.items():
            out_file = cache_dir / f"windfor_{day_str}.json"
            if not out_file.exists():
                with open(out_file, "w", encoding="utf-8") as out:
                    json.dump(day_recs, out, indent=2)
        logger.info("Unpacked %d daily WINDFOR cache files.", len(by_day))

    # Check if FUELHH canonical raw file exists
    fuelhh_single = Path("data/raw/fuelhh_jan2026.json")
    if not fuelhh_single.exists():
        fuelhh_single = backend_dir / "data/raw/fuelhh_jan2026.json"

    if fuelhh_single.exists() and not (cache_dir / "fuelhh_2026-01-02.json").exists():
        logger.info("Unpacking daily FUELHH cache files from %s...", fuelhh_single)
        with open(fuelhh_single, encoding="utf-8") as f:
            records = json.load(f)
        by_day = {}
        for r in records:
            st = r.get("startTime", "")
            if st:
                day_str = st[:10]
                by_day.setdefault(day_str, []).append(r)
        for day_str, day_recs in by_day.items():
            out_file = cache_dir / f"fuelhh_{day_str}.json"
            if not out_file.exists():
                with open(out_file, "w", encoding="utf-8") as out:
                    json.dump(day_recs, out, indent=2)
        logger.info("Unpacked %d daily FUELHH cache files.", len(by_day))


async def initialize_and_verify() -> bool:
    """Seed accounts, run January backfill, and verify benchmark metrics."""
    factory = get_session_factory()

    async with factory() as session:
        # 1. Seed accounts
        logger.info("Seeding default authentication accounts if empty...")
        auth_service = AuthService(session)
        seeded = await auth_service.seed_default_users_if_empty()
        logger.info("Authentication accounts ready (seeded=%s).", seeded)

        # 2. Run January 2026 backfill
        logger.info("Executing January 2026 historical backfill...")
        ensure_cache_files()
        backfill_service = HistoricalBackfillService(session)
        result = await backfill_service.run_january_2026_backfill(use_cache=True)
        logger.info("Backfill completed: %s", result["status"])

        # 3. Direct SQL verification of accuracy metrics
        logger.info("Verifying canonical January 2026 benchmark metrics in PostgreSQL...")
        acc_stmt = text("""
            SELECT 
                COUNT(*) as count,
                ROUND(AVG(ABS(signed_error_mw))::numeric, 4) as mae,
                ROUND(SQRT(AVG(signed_error_mw * signed_error_mw))::numeric, 4) as rmse,
                ROUND(AVG(absolute_percentage_error)::numeric, 4) as mape,
                ROUND(AVG(signed_error_mw)::numeric, 4) as bias,
                SUM(CASE WHEN is_overforecast THEN 1 ELSE 0 END) as overforecast,
                SUM(CASE WHEN is_underforecast THEN 1 ELSE 0 END) as underforecast
            FROM forecast_evaluations
            WHERE delivery_hour_utc >= '2026-01-02 00:00:00+00'
              AND delivery_hour_utc < '2026-02-02 00:00:00+00'
              AND forecast_generation_mw IS NOT NULL
              AND actual_generation_mw IS NOT NULL;
        """)
        acc_res = await session.execute(acc_stmt)
        acc_row = dict(acc_res.mappings().one())

        # 4. Multi-horizon matched population
        hor_stmt = text("""
            WITH raw_with_lt AS (
                SELECT 
                    r.id,
                    r.delivery_hour_utc,
                    r.publish_time_utc,
                    r.generation_mw as forecast_mw,
                    a.generation_mw as actual_mw,
                    ABS(r.generation_mw - a.generation_mw) as abs_error_mw,
                    (EXTRACT(EPOCH FROM (r.delivery_hour_utc - r.publish_time_utc))/3600.0) as lead_time_hours
                FROM raw_forecast_records r
                JOIN hourly_actuals a ON r.delivery_hour_utc = a.delivery_hour_utc
                WHERE r.delivery_hour_utc >= '2026-01-02 00:00:00+00'
                  AND r.delivery_hour_utc < '2026-02-02 00:00:00+00'
            ),
            calc AS (
                SELECT 
                    *,
                    CASE 
                        WHEN lead_time_hours > 0.0 AND lead_time_hours < 6.0 THEN 'Very Short (0-6h)'
                        WHEN lead_time_hours >= 6.0 AND lead_time_hours < 12.0 THEN 'Short (6-12h)'
                        WHEN lead_time_hours >= 12.0 AND lead_time_hours < 24.0 THEN 'Same-Day (12-24h)'
                        WHEN lead_time_hours >= 24.0 AND lead_time_hours < 36.0 THEN 'Day-Ahead (24-36h)'
                        WHEN lead_time_hours >= 36.0 AND lead_time_hours < 48.0 THEN 'D-2 Early (36-48h)'
                        WHEN lead_time_hours >= 48.0 AND lead_time_hours <= 72.0 THEN 'Medium-Range (48-72h)'
                        ELSE NULL
                    END as bucket_name,
                    CASE 
                        WHEN lead_time_hours > 0.0 AND lead_time_hours < 6.0 THEN 3.0
                        WHEN lead_time_hours >= 6.0 AND lead_time_hours < 12.0 THEN 9.0
                        WHEN lead_time_hours >= 12.0 AND lead_time_hours < 24.0 THEN 18.0
                        WHEN lead_time_hours >= 24.0 AND lead_time_hours < 36.0 THEN 30.0
                        WHEN lead_time_hours >= 36.0 AND lead_time_hours < 48.0 THEN 42.0
                        WHEN lead_time_hours >= 48.0 AND lead_time_hours <= 72.0 THEN 60.0
                        ELSE NULL
                    END as target_lead_time
                FROM raw_with_lt
                WHERE lead_time_hours > 0.0 AND lead_time_hours <= 72.0
            ),
            ranked AS (
                SELECT 
                    *,
                    ROW_NUMBER() OVER (
                        PARTITION BY delivery_hour_utc, bucket_name
                        ORDER BY ABS(lead_time_hours - target_lead_time) ASC,
                                 publish_time_utc DESC
                    ) as rank_in_bucket
                FROM calc
                WHERE bucket_name IS NOT NULL
            ),
            single_rep_per_hour AS (
                SELECT * FROM ranked WHERE rank_in_bucket = 1
            ),
            common_hours AS (
                SELECT delivery_hour_utc
                FROM single_rep_per_hour
                GROUP BY delivery_hour_utc
                HAVING COUNT(DISTINCT bucket_name) = 6
            ),
            bucket_maes AS (
                SELECT 
                    s.bucket_name,
                    AVG(s.abs_error_mw) as bucket_mae
                FROM single_rep_per_hour s
                JOIN common_hours ch ON s.delivery_hour_utc = ch.delivery_hour_utc
                GROUP BY s.bucket_name
            )
            SELECT 
                (SELECT COUNT(*) FROM common_hours) as matched_hours,
                ROUND(
                    (
                        (SELECT bucket_mae FROM bucket_maes WHERE bucket_name = 'Medium-Range (48-72h)') -
                        (SELECT bucket_mae FROM bucket_maes WHERE bucket_name = 'Very Short (0-6h)')
                    ) / 
                    (SELECT bucket_mae FROM bucket_maes WHERE bucket_name = 'Medium-Range (48-72h)') * 100.0,
                    2
                ) as reduction_pct;
        """)
        hor_res = await session.execute(hor_stmt)
        hor_row = dict(hor_res.mappings().one())

        # 5. Forward forecast revisions
        rev_stmt = text("""
            WITH ordered_pubs AS (
                SELECT 
                    delivery_hour_utc,
                    publish_time_utc,
                    generation_mw,
                    LAG(generation_mw) OVER (
                        PARTITION BY delivery_hour_utc 
                        ORDER BY publish_time_utc ASC
                    ) as prev_mw
                FROM raw_forecast_records
                WHERE delivery_hour_utc >= '2026-01-02 00:00:00+00'
                  AND delivery_hour_utc < '2026-02-02 00:00:00+00'
                  AND delivery_hour_utc > publish_time_utc
            )
            SELECT 
                COUNT(*) as forward_revisions,
                ROUND(AVG(ABS(generation_mw - prev_mw))::numeric, 4) as mean_abs_revision
            FROM ordered_pubs
            WHERE prev_mw IS NOT NULL;
        """)
        rev_res = await session.execute(rev_stmt)
        rev_row = dict(rev_res.mappings().one())

    # Build comparison summary
    actual_metrics = {
        "count": int(acc_row["count"]),
        "mae": float(acc_row["mae"]),
        "rmse": float(acc_row["rmse"]),
        "mape": float(acc_row["mape"]),
        "bias": float(acc_row["bias"]),
        "overforecast": int(acc_row["overforecast"]),
        "underforecast": int(acc_row["underforecast"]),
        "matched_population": int(hor_row["matched_hours"]),
        "matched_mae_reduction": float(hor_row["reduction_pct"]),
        "forward_revisions": int(rev_row["forward_revisions"]),
        "mean_abs_revision": float(rev_row["mean_abs_revision"]),
    }

    all_matched = True
    print("\n" + "=" * 80)
    print("WINDIQ CANONICAL JANUARY 2026 BENCHMARK RECONCILIATION")
    print("=" * 80)
    print(f"{'Metric':<30} | {'Expected':<15} | {'Actual':<15} | {'Delta':<10} | {'Status'}")
    print("-" * 80)

    for key, expected in EXPECTED_METRICS.items():
        actual = actual_metrics[key]
        delta = abs(actual - expected)
        is_pass = delta < 0.0001 if isinstance(expected, float) else delta == 0
        status_str = "PASS" if is_pass else "FAIL"
        if not is_pass:
            all_matched = False
        print(f"{key:<30} | {expected:<15} | {actual:<15} | {delta:<10.4f} | {status_str}")

    print("=" * 80)

    if all_matched:
        logger.info("ALL 11 BENCHMARK METRICS VERIFIED AND RECONCILED (100% MATCH).")
        return True
    else:
        logger.error("BENCHMARK RECONCILIATION FAILED.")
        return False


def main() -> None:
    """Main CLI entrypoint."""
    try:
        run_alembic_migrations()
        success = asyncio.run(initialize_and_verify())
        if not success:
            sys.exit(1)
        sys.exit(0)
    except Exception as exc:
        logger.exception("Initialization aborted with unhandled error: %s", exc)
        sys.exit(1)


if __name__ == "__main__":
    main()
