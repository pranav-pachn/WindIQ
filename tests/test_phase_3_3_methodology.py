"""Phase 3.3 methodology, boundary isolation, and population coverage tests."""

import pytest
import psycopg2
from src.data_pipeline.config import PipelineConfig

def classify_lead_time_bucket(lead_time_hours: float) -> str | None:
    """Classify lead time into strict operational horizon buckets."""
    if lead_time_hours > 0.0 and lead_time_hours < 6.0:
        return "Very Short (0-6h)"
    elif lead_time_hours >= 6.0 and lead_time_hours < 12.0:
        return "Short (6-12h)"
    elif lead_time_hours >= 12.0 and lead_time_hours < 24.0:
        return "Same-Day (12-24h)"
    elif lead_time_hours >= 24.0 and lead_time_hours < 36.0:
        return "Day-Ahead (24-36h)"
    elif lead_time_hours >= 36.0 and lead_time_hours < 48.0:
        return "D-2 Early (36-48h)"
    elif lead_time_hours >= 48.0 and lead_time_hours <= 72.0:
        return "Medium-Range (48-72h)"
    else:
        return None


def test_horizon_bucket_boundary_isolation():
    """Verify that exact boundary values belong to exactly one bucket, [48, 72] is closed, and <=0 and >72 are excluded."""
    # Excluded: zero and negative lead times
    assert classify_lead_time_bucket(0.0) is None
    assert classify_lead_time_bucket(-0.01) is None
    assert classify_lead_time_bucket(-5.0) is None

    # Very Short (0 < lt < 6)
    assert classify_lead_time_bucket(0.001) == "Very Short (0-6h)"
    assert classify_lead_time_bucket(3.0) == "Very Short (0-6h)"
    assert classify_lead_time_bucket(5.999) == "Very Short (0-6h)"

    # Boundary at 6.0: belongs strictly to Short, NOT Very Short
    assert classify_lead_time_bucket(6.0) == "Short (6-12h)"
    assert classify_lead_time_bucket(9.0) == "Short (6-12h)"
    assert classify_lead_time_bucket(11.999) == "Short (6-12h)"

    # Boundary at 12.0: belongs strictly to Same-Day, NOT Short
    assert classify_lead_time_bucket(12.0) == "Same-Day (12-24h)"
    assert classify_lead_time_bucket(18.0) == "Same-Day (12-24h)"
    assert classify_lead_time_bucket(23.999) == "Same-Day (12-24h)"

    # Boundary at 24.0: belongs strictly to Day-Ahead, NOT Same-Day
    assert classify_lead_time_bucket(24.0) == "Day-Ahead (24-36h)"
    assert classify_lead_time_bucket(30.0) == "Day-Ahead (24-36h)"
    assert classify_lead_time_bucket(35.999) == "Day-Ahead (24-36h)"

    # Boundary at 36.0: belongs strictly to D-2 Early, NOT Day-Ahead
    assert classify_lead_time_bucket(36.0) == "D-2 Early (36-48h)"
    assert classify_lead_time_bucket(42.0) == "D-2 Early (36-48h)"
    assert classify_lead_time_bucket(47.999) == "D-2 Early (36-48h)"

    # Boundary at 48.0: belongs strictly to Medium-Range, NOT D-2 Early
    assert classify_lead_time_bucket(48.0) == "Medium-Range (48-72h)"
    assert classify_lead_time_bucket(60.0) == "Medium-Range (48-72h)"
    assert classify_lead_time_bucket(71.999) == "Medium-Range (48-72h)"

    # Boundary at 72.0: explicitly closed upper boundary in Medium-Range
    assert classify_lead_time_bucket(72.0) == "Medium-Range (48-72h)"

    # Excluded: strictly greater than 72.0
    assert classify_lead_time_bucket(72.001) is None
    assert classify_lead_time_bucket(80.0) is None


import os

def get_db_connection():
    return psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", "5435")),
        dbname=os.getenv("DB_NAME", "windiq"),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD", "postgres"),
    )

def test_forward_population_coverage_proof():
    """Verify directly against PostgreSQL that all 744 January delivery hours have >= 8 forward publications and sum(N - 1) = 13,367."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                WITH fwd_pubs AS (
                    SELECT 
                        delivery_hour_utc,
                        COUNT(*) as pub_count
                    FROM raw_forecast_records
                    WHERE delivery_hour_utc >= '2026-01-02 00:00:00+00'
                      AND delivery_hour_utc < '2026-02-02 00:00:00+00'
                      AND delivery_hour_utc > publish_time_utc
                    GROUP BY delivery_hour_utc
                ),
                all_hours AS (
                    SELECT delivery_hour_utc
                    FROM hourly_actuals
                    WHERE delivery_hour_utc >= '2026-01-02 00:00:00+00'
                      AND delivery_hour_utc < '2026-02-02 00:00:00+00'
                )
                SELECT 
                    COUNT(a.delivery_hour_utc) as total_hours_in_scope,
                    COUNT(CASE WHEN f.pub_count IS NULL OR f.pub_count = 0 THEN 1 END) as hours_zero_fwd,
                    COUNT(CASE WHEN f.pub_count = 1 THEN 1 END) as hours_one_fwd,
                    COUNT(CASE WHEN f.pub_count > 1 THEN 1 END) as hours_multi_fwd,
                    MIN(f.pub_count) as min_fwd_pubs,
                    MAX(f.pub_count) as max_fwd_pubs,
                    SUM(f.pub_count) as total_fwd_pubs,
                    SUM(f.pub_count - 1) as total_consecutive_transitions
                FROM all_hours a
                LEFT JOIN fwd_pubs f ON a.delivery_hour_utc = f.delivery_hour_utc;
            """)
            row = cur.fetchone()
            assert row[0] == 744, "Total hours in scope must be exactly 744"
            assert row[1] == 0, "Hours with zero forward publications must be exactly 0"
            assert row[2] == 0, "Hours with exactly one forward publication must be exactly 0"
            assert row[3] == 744, "All 744 delivery hours must have multiple forward publications"
            assert row[4] >= 8, "Minimum forward publications per hour must be >= 8"
            assert row[5] == 23, "Maximum forward publications per hour is 23"
            assert row[6] == 14111, "Total forward publications must be 14,111"
            assert row[7] == 13367, "Total consecutive forward transitions must be exactly 13,367"
    finally:
        conn.close()


def test_matched_population_convergence_ground_truth():
    """Verify that on the strictly matched 553-hour population, MAE decreases monotonically from 48-72h to 0-6h."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
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
                )
                SELECT 
                    s.bucket_name,
                    COUNT(*) as obs_count,
                    ROUND(AVG(s.abs_error_mw)::numeric, 4) as mae_mw
                FROM single_rep_per_hour s
                JOIN common_hours ch ON s.delivery_hour_utc = ch.delivery_hour_utc
                GROUP BY s.bucket_name
                ORDER BY 
                    CASE s.bucket_name
                        WHEN 'Very Short (0-6h)' THEN 1
                        WHEN 'Short (6-12h)' THEN 2
                        WHEN 'Same-Day (12-24h)' THEN 3
                        WHEN 'Day-Ahead (24-36h)' THEN 4
                        WHEN 'D-2 Early (36-48h)' THEN 5
                        WHEN 'Medium-Range (48-72h)' THEN 6
                    END;
            """)
            rows = cur.fetchall()
            assert len(rows) == 6, "Must have exactly 6 horizon buckets"
            # Each bucket must have exactly 553 common hours
            for r in rows:
                assert r[1] == 553, f"Bucket {r[0]} must have 553 observations"

            maes = [float(r[2]) for r in rows]
            # Order is 0-6h (index 0) to 48-72h (index 5)
            # MAE must be strictly monotonically increasing with lead time:
            # Very Short < Short < Same-Day < Day-Ahead < D-2 Early < Medium-Range
            assert maes[0] < maes[1] < maes[2] < maes[3] < maes[4] < maes[5], (
                f"MAE must be strictly monotonic across horizons: {maes}"
            )
            assert maes[0] == pytest.approx(1610.9042, abs=0.1)
            assert maes[5] == pytest.approx(2446.6076, abs=0.1)
    finally:
        conn.close()
