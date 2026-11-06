"""Repository for RawForecastRecord persistence, version retrieval, and cutoff queries."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.forecast import RawForecastRecord


class RawForecastRepository:
    """Asynchronous repository for WINDFOR forecast records."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def upsert_batch(
        self,
        records: list[dict],
        ingestion_run_id: uuid.UUID | None = None,
    ) -> tuple[int, int]:
        """Idempotently insert forecast records using ON CONFLICT DO NOTHING.

        Returns:
            Tuple of (inserted_count, already_present_count)
        """
        if not records:
            return 0, 0

        # Prepare values dicts with UTC timestamps
        values_list = []
        for r in records:
            values_list.append(
                {
                    "publish_time_utc": r["publish_time_utc"],
                    "delivery_hour_utc": r["delivery_hour_utc"],
                    "generation_mw": r["generation_mw"],
                    "source_dataset": r.get("source_dataset", "WINDFOR"),
                    "ingestion_run_id": ingestion_run_id,
                    "created_at": datetime.now(UTC),
                }
            )

        stmt = (
            insert(RawForecastRecord)
            .values(values_list)
            .on_conflict_do_nothing(
                index_elements=["publish_time_utc", "delivery_hour_utc"],
            )
            .returning(RawForecastRecord.id)
        )

        result = await self.session.execute(stmt)
        inserted_ids = result.scalars().all()
        inserted_count = len(inserted_ids)
        already_present_count = len(values_list) - inserted_count

        await self.session.flush()
        return inserted_count, already_present_count

    async def get_by_composite_key(
        self,
        publish_time_utc: datetime,
        delivery_hour_utc: datetime,
    ) -> RawForecastRecord | None:
        """Fetch exact forecast record by composite key."""
        stmt = select(RawForecastRecord).where(
            RawForecastRecord.publish_time_utc == publish_time_utc,
            RawForecastRecord.delivery_hour_utc == delivery_hour_utc,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_publication_versions_for_delivery_hour(
        self,
        delivery_hour_utc: datetime,
    ) -> list[RawForecastRecord]:
        """Fetch all historical publications for a delivery hour ordered by publication time."""
        stmt = (
            select(RawForecastRecord)
            .where(RawForecastRecord.delivery_hour_utc == delivery_hour_utc)
            .order_by(RawForecastRecord.publish_time_utc.asc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def count_eligible_for_delivery_hour(
        self,
        delivery_hour_utc: datetime,
        cutoff_utc: datetime,
    ) -> int:
        """Count publications released at or before decision cutoff for a delivery hour."""
        stmt = select(func.count(RawForecastRecord.id)).where(
            RawForecastRecord.delivery_hour_utc == delivery_hour_utc,
            RawForecastRecord.publish_time_utc <= cutoff_utc,
        )
        res = await self.session.execute(stmt)
        return res.scalar_one()

    async def get_latest_forecast_before_cutoff(
        self,
        delivery_hour_utc: datetime,
        cutoff_utc: datetime,
    ) -> RawForecastRecord | None:
        """Select the latest forecast published at or before the decision cutoff."""
        stmt = (
            select(RawForecastRecord)
            .where(
                RawForecastRecord.delivery_hour_utc == delivery_hour_utc,
                RawForecastRecord.publish_time_utc <= cutoff_utc,
            )
            .order_by(RawForecastRecord.publish_time_utc.desc())
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def count_total(self) -> int:
        """Return total number of raw forecast records stored."""
        stmt = select(func.count(RawForecastRecord.id))
        result = await self.session.execute(stmt)
        return result.scalar_one()

    async def count_for_window(
        self,
        start_utc: datetime,
        end_utc: datetime,
    ) -> int:
        """Count forecast records published within a time window."""
        stmt = select(func.count(RawForecastRecord.id)).where(
            RawForecastRecord.publish_time_utc >= start_utc,
            RawForecastRecord.publish_time_utc < end_utc,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one()

    async def get_publication_cycle_stats(
        self,
        start_utc: datetime | None = None,
        end_utc: datetime | None = None,
    ) -> dict[str, float | int]:
        """Calculate publication cadence stats (distinct cycle count and cycles/day)."""
        where_clauses = []
        if start_utc is not None:
            where_clauses.append(RawForecastRecord.publish_time_utc >= start_utc)
        if end_utc is not None:
            where_clauses.append(RawForecastRecord.publish_time_utc <= end_utc)

        # 1. Total distinct publication cycles
        stmt_distinct = select(func.count(func.distinct(RawForecastRecord.publish_time_utc))).where(
            *where_clauses
        )
        res_distinct = await self.session.execute(stmt_distinct)
        total_cycles = res_distinct.scalar_one()

        if total_cycles == 0:
            return {
                "total_cycles": 0,
                "avg_cycles_per_day": 0.0,
                "min_cycles_per_day": 0,
                "max_cycles_per_day": 0,
            }

        # 2. Daily cycle counts
        day_col = func.date_trunc("day", RawForecastRecord.publish_time_utc)
        stmt_daily = (
            select(
                day_col.label("day"),
                func.count(func.distinct(RawForecastRecord.publish_time_utc)).label("daily_count"),
            )
            .where(*where_clauses)
            .group_by(day_col)
        )
        res_daily = await self.session.execute(stmt_daily)
        daily_counts = [row.daily_count for row in res_daily.all()]

        if not daily_counts:
            return {
                "total_cycles": total_cycles,
                "avg_cycles_per_day": 0.0,
                "min_cycles_per_day": 0,
                "max_cycles_per_day": 0,
            }

        return {
            "total_cycles": total_cycles,
            "avg_cycles_per_day": round(sum(daily_counts) / len(daily_counts), 2),
            "min_cycles_per_day": min(daily_counts),
            "max_cycles_per_day": max(daily_counts),
        }

    async def get_publications_for_delivery_hours_batch(
        self,
        delivery_hours: list[datetime],
    ) -> dict[datetime, list[RawForecastRecord]]:
        """Batch-fetch all publication versions for a collection of delivery hours."""
        if not delivery_hours:
            return {}

        stmt = (
            select(RawForecastRecord)
            .where(RawForecastRecord.delivery_hour_utc.in_(delivery_hours))
            .order_by(
                RawForecastRecord.delivery_hour_utc.asc(),
                RawForecastRecord.publish_time_utc.asc(),
            )
        )
        result = await self.session.execute(stmt)
        records = result.scalars().all()

        mapping: dict[datetime, list[RawForecastRecord]] = {dh: [] for dh in delivery_hours}
        for rec in records:
            if rec.delivery_hour_utc in mapping:
                mapping[rec.delivery_hour_utc].append(rec)
        return mapping

    async def get_multi_horizon_aggregates(
        self,
        start_utc: datetime,
        end_utc: datetime,
        mode: str = "matched",
    ) -> tuple[list[dict], int, int | None]:
        """Aggregate forecast accuracy across 6 standardized non-overlapping horizons.

        Returns:
            Tuple of (bucket_stat_dicts, evaluated_hours_count, common_matched_hours_count)
        """
        # Determine total unique delivery hours in period that have actuals
        count_stmt = text("""
            SELECT COUNT(DISTINCT delivery_hour_utc)
            FROM hourly_actuals
            WHERE delivery_hour_utc >= :start_utc AND delivery_hour_utc < :end_utc
        """)
        c_res = await self.session.execute(count_stmt, {"start_utc": start_utc, "end_utc": end_utc})
        total_hours = c_res.scalar_one() or 0

        common_matched_hours: int | None = None

        if mode == "publication_weighted":
            sql = text("""
                WITH raw_with_lt AS (
                    SELECT 
                        r.id,
                        r.delivery_hour_utc,
                        r.publish_time_utc,
                        r.generation_mw as forecast_mw,
                        a.generation_mw as actual_mw,
                        (r.generation_mw - a.generation_mw) as error_mw,
                        ABS(r.generation_mw - a.generation_mw) as abs_error_mw,
                        (EXTRACT(EPOCH FROM (r.delivery_hour_utc - r.publish_time_utc))/3600.0) as lead_time_hours
                    FROM raw_forecast_records r
                    JOIN hourly_actuals a ON r.delivery_hour_utc = a.delivery_hour_utc
                    WHERE r.delivery_hour_utc >= :start_utc
                      AND r.delivery_hour_utc < :end_utc
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
                        END as bucket_name
                    FROM raw_with_lt
                    WHERE lead_time_hours > 0.0 AND lead_time_hours <= 72.0
                )
                SELECT 
                    bucket_name,
                    COUNT(*) as obs_count,
                    COUNT(DISTINCT delivery_hour_utc) as unique_hours,
                    ROUND(AVG(lead_time_hours)::numeric, 2) as avg_actual_lead_time,
                    ROUND(AVG(abs_error_mw)::numeric, 4) as mae_mw,
                    ROUND(SQRT(AVG(abs_error_mw * abs_error_mw))::numeric, 4) as rmse_mw,
                    ROUND(AVG(error_mw)::numeric, 4) as bias_mw,
                    ROUND(AVG(CASE WHEN actual_mw > 0 THEN (abs_error_mw / actual_mw * 100.0) ELSE NULL END)::numeric, 4) as mape_pct
                FROM calc
                WHERE bucket_name IS NOT NULL
                GROUP BY bucket_name
                ORDER BY 
                    CASE bucket_name
                        WHEN 'Very Short (0-6h)' THEN 1
                        WHEN 'Short (6-12h)' THEN 2
                        WHEN 'Same-Day (12-24h)' THEN 3
                        WHEN 'Day-Ahead (24-36h)' THEN 4
                        WHEN 'D-2 Early (36-48h)' THEN 5
                        WHEN 'Medium-Range (48-72h)' THEN 6
                    END;
            """)
            res = await self.session.execute(sql, {"start_utc": start_utc, "end_utc": end_utc})
            rows = [dict(r) for r in res.mappings().all()]
            evaluated_hours = total_hours
        elif mode == "matched":
            sql = text("""
                WITH raw_with_lt AS (
                    SELECT 
                        r.id,
                        r.delivery_hour_utc,
                        r.publish_time_utc,
                        r.generation_mw as forecast_mw,
                        a.generation_mw as actual_mw,
                        (r.generation_mw - a.generation_mw) as error_mw,
                        ABS(r.generation_mw - a.generation_mw) as abs_error_mw,
                        (EXTRACT(EPOCH FROM (r.delivery_hour_utc - r.publish_time_utc))/3600.0) as lead_time_hours
                    FROM raw_forecast_records r
                    JOIN hourly_actuals a ON r.delivery_hour_utc = a.delivery_hour_utc
                    WHERE r.delivery_hour_utc >= :start_utc
                      AND r.delivery_hour_utc < :end_utc
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
                    COUNT(DISTINCT s.delivery_hour_utc) as unique_hours,
                    ROUND(AVG(s.lead_time_hours)::numeric, 2) as avg_actual_lead_time,
                    ROUND(AVG(s.abs_error_mw)::numeric, 4) as mae_mw,
                    ROUND(SQRT(AVG(s.abs_error_mw * s.abs_error_mw))::numeric, 4) as rmse_mw,
                    ROUND(AVG(s.error_mw)::numeric, 4) as bias_mw,
                    ROUND(AVG(CASE WHEN s.actual_mw > 0 THEN (s.abs_error_mw / s.actual_mw * 100.0) ELSE NULL END)::numeric, 4) as mape_pct
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
            res = await self.session.execute(sql, {"start_utc": start_utc, "end_utc": end_utc})
            rows = [dict(r) for r in res.mappings().all()]
            common_matched_hours = rows[0]["unique_hours"] if rows else 0
            evaluated_hours = common_matched_hours
        else:  # unmatched_representative
            sql = text("""
                WITH raw_with_lt AS (
                    SELECT 
                        r.id,
                        r.delivery_hour_utc,
                        r.publish_time_utc,
                        r.generation_mw as forecast_mw,
                        a.generation_mw as actual_mw,
                        (r.generation_mw - a.generation_mw) as error_mw,
                        ABS(r.generation_mw - a.generation_mw) as abs_error_mw,
                        (EXTRACT(EPOCH FROM (r.delivery_hour_utc - r.publish_time_utc))/3600.0) as lead_time_hours
                    FROM raw_forecast_records r
                    JOIN hourly_actuals a ON r.delivery_hour_utc = a.delivery_hour_utc
                    WHERE r.delivery_hour_utc >= :start_utc
                      AND r.delivery_hour_utc < :end_utc
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
                )
                SELECT 
                    bucket_name,
                    COUNT(*) as obs_count,
                    COUNT(DISTINCT delivery_hour_utc) as unique_hours,
                    ROUND(AVG(lead_time_hours)::numeric, 2) as avg_actual_lead_time,
                    ROUND(AVG(abs_error_mw)::numeric, 4) as mae_mw,
                    ROUND(SQRT(AVG(abs_error_mw * abs_error_mw))::numeric, 4) as rmse_mw,
                    ROUND(AVG(error_mw)::numeric, 4) as bias_mw,
                    ROUND(AVG(CASE WHEN actual_mw > 0 THEN (abs_error_mw / actual_mw * 100.0) ELSE NULL END)::numeric, 4) as mape_pct
                FROM ranked
                WHERE rank_in_bucket = 1
                GROUP BY bucket_name
                ORDER BY 
                    CASE bucket_name
                        WHEN 'Very Short (0-6h)' THEN 1
                        WHEN 'Short (6-12h)' THEN 2
                        WHEN 'Same-Day (12-24h)' THEN 3
                        WHEN 'Day-Ahead (24-36h)' THEN 4
                        WHEN 'D-2 Early (36-48h)' THEN 5
                        WHEN 'Medium-Range (48-72h)' THEN 6
                    END;
            """)
            res = await self.session.execute(sql, {"start_utc": start_utc, "end_utc": end_utc})
            rows = [dict(r) for r in res.mappings().all()]
            evaluated_hours = max((r["unique_hours"] for r in rows), default=0)

        return rows, evaluated_hours, common_matched_hours

    async def get_revision_analytics(
        self,
        start_utc: datetime,
        end_utc: datetime,
    ) -> tuple[dict, list[dict], list[dict], list[float]]:
        """Compute forward-looking revision distribution, top events, and diurnal heatmap.

        Returns:
            (summary_dict, top_revisions_list, diurnal_heatmap_list, all_revision_values)
        """
        sql_summary = text("""
            WITH fwd_records AS (
                SELECT 
                    r.id,
                    r.delivery_hour_utc,
                    r.publish_time_utc,
                    r.generation_mw as forecast_mw,
                    (EXTRACT(EPOCH FROM (r.delivery_hour_utc - r.publish_time_utc))/3600.0) as lead_time_hours
                FROM raw_forecast_records r
                WHERE r.delivery_hour_utc >= :start_utc
                  AND r.delivery_hour_utc < :end_utc
                  AND r.delivery_hour_utc > r.publish_time_utc
            ),
            transitions AS (
                SELECT 
                    id,
                    delivery_hour_utc,
                    publish_time_utc,
                    lead_time_hours,
                    forecast_mw,
                    LAG(forecast_mw) OVER (PARTITION BY delivery_hour_utc ORDER BY publish_time_utc) as prev_forecast_mw,
                    LAG(publish_time_utc) OVER (PARTITION BY delivery_hour_utc ORDER BY publish_time_utc) as prev_publish_time_utc,
                    (forecast_mw - LAG(forecast_mw) OVER (PARTITION BY delivery_hour_utc ORDER BY publish_time_utc)) as revision_mw,
                    ABS(forecast_mw - LAG(forecast_mw) OVER (PARTITION BY delivery_hour_utc ORDER BY publish_time_utc)) as abs_revision_mw,
                    ROUND((EXTRACT(EPOCH FROM (publish_time_utc - LAG(publish_time_utc) OVER (PARTITION BY delivery_hour_utc ORDER BY publish_time_utc)))/3600.0)::numeric, 2) as cycle_gap_hours
                FROM fwd_records
            )
            SELECT 
                COUNT(*) as total_revisions,
                ROUND(AVG(revision_mw)::numeric, 4) as mean_signed_revision,
                ROUND(AVG(abs_revision_mw)::numeric, 4) as mean_abs_revision,
                COUNT(CASE WHEN revision_mw > 0 THEN 1 END) as upward_count,
                COUNT(CASE WHEN revision_mw < 0 THEN 1 END) as downward_count,
                COUNT(CASE WHEN revision_mw = 0 THEN 1 END) as unchanged_count,
                COALESCE(MAX(cycle_gap_hours), 0.0) as cycle_gap_max_hours,
                COUNT(CASE WHEN cycle_gap_hours > 6.0 THEN 1 END) as discontinuous_count
            FROM transitions
            WHERE prev_forecast_mw IS NOT NULL;
        """)
        sum_res = await self.session.execute(sql_summary, {"start_utc": start_utc, "end_utc": end_utc})
        summary = dict(sum_res.mappings().one())

        sql_top = text("""
            WITH fwd_records AS (
                SELECT 
                    r.id,
                    r.delivery_hour_utc,
                    r.publish_time_utc,
                    r.generation_mw as forecast_mw,
                    (EXTRACT(EPOCH FROM (r.delivery_hour_utc - r.publish_time_utc))/3600.0) as lead_time_hours
                FROM raw_forecast_records r
                WHERE r.delivery_hour_utc >= :start_utc
                  AND r.delivery_hour_utc < :end_utc
                  AND r.delivery_hour_utc > r.publish_time_utc
            ),
            transitions AS (
                SELECT 
                    id as raw_forecast_id,
                    delivery_hour_utc,
                    publish_time_utc,
                    lead_time_hours,
                    forecast_mw as revised_forecast_mw,
                    LAG(forecast_mw) OVER (PARTITION BY delivery_hour_utc ORDER BY publish_time_utc) as previous_forecast_mw,
                    LAG(publish_time_utc) OVER (PARTITION BY delivery_hour_utc ORDER BY publish_time_utc) as previous_publish_time_utc,
                    (forecast_mw - LAG(forecast_mw) OVER (PARTITION BY delivery_hour_utc ORDER BY publish_time_utc)) as revision_mw,
                    ABS(forecast_mw - LAG(forecast_mw) OVER (PARTITION BY delivery_hour_utc ORDER BY publish_time_utc)) as abs_revision_mw,
                    ROUND((EXTRACT(EPOCH FROM (publish_time_utc - LAG(publish_time_utc) OVER (PARTITION BY delivery_hour_utc ORDER BY publish_time_utc)))/3600.0)::numeric, 2) as cycle_gap_hours
                FROM fwd_records
            )
            SELECT 
                raw_forecast_id,
                delivery_hour_utc,
                publish_time_utc,
                previous_publish_time_utc,
                ROUND(lead_time_hours::numeric, 2) as lead_time_hours,
                ROUND(previous_forecast_mw::numeric, 2) as previous_forecast_mw,
                ROUND(revised_forecast_mw::numeric, 2) as revised_forecast_mw,
                ROUND(revision_mw::numeric, 2) as revision_mw,
                ROUND(abs_revision_mw::numeric, 2) as abs_revision_mw,
                cycle_gap_hours,
                (cycle_gap_hours > 6.0) as is_discontinuous
            FROM transitions
            WHERE previous_forecast_mw IS NOT NULL
            ORDER BY abs_revision_mw DESC
            LIMIT 10;
        """)
        top_res = await self.session.execute(sql_top, {"start_utc": start_utc, "end_utc": end_utc})
        top_revisions = [dict(r) for r in top_res.mappings().all()]

        sql_diurnal = text("""
            WITH fwd_records AS (
                SELECT 
                    r.id,
                    r.delivery_hour_utc,
                    r.publish_time_utc,
                    r.generation_mw as forecast_mw,
                    (EXTRACT(EPOCH FROM (r.delivery_hour_utc - r.publish_time_utc))/3600.0) as lead_time_hours
                FROM raw_forecast_records r
                WHERE r.delivery_hour_utc >= :start_utc
                  AND r.delivery_hour_utc < :end_utc
                  AND r.delivery_hour_utc > r.publish_time_utc
            ),
            transitions AS (
                SELECT 
                    delivery_hour_utc,
                    lead_time_hours,
                    ABS(forecast_mw - LAG(forecast_mw) OVER (PARTITION BY delivery_hour_utc ORDER BY publish_time_utc)) as abs_revision_mw,
                    CASE 
                        WHEN lead_time_hours > 0.0 AND lead_time_hours < 6.0 THEN 'Very Short (0-6h)'
                        WHEN lead_time_hours >= 6.0 AND lead_time_hours < 12.0 THEN 'Short (6-12h)'
                        WHEN lead_time_hours >= 12.0 AND lead_time_hours < 24.0 THEN 'Same-Day (12-24h)'
                        WHEN lead_time_hours >= 24.0 AND lead_time_hours < 36.0 THEN 'Day-Ahead (24-36h)'
                        WHEN lead_time_hours >= 36.0 AND lead_time_hours < 48.0 THEN 'D-2 Early (36-48h)'
                        WHEN lead_time_hours >= 48.0 AND lead_time_hours <= 72.0 THEN 'Medium-Range (48-72h)'
                        ELSE NULL
                    END as horizon_bucket,
                    EXTRACT(HOUR FROM (delivery_hour_utc AT TIME ZONE 'Europe/London'))::int as hour_of_day_london
                FROM fwd_records
            )
            SELECT 
                hour_of_day_london,
                horizon_bucket,
                ROUND(AVG(abs_revision_mw)::numeric, 2) as mean_abs_revision_mw,
                COUNT(*) as revision_count
            FROM transitions
            WHERE abs_revision_mw IS NOT NULL AND horizon_bucket IS NOT NULL
            GROUP BY hour_of_day_london, horizon_bucket
            ORDER BY hour_of_day_london, horizon_bucket;
        """)
        diurnal_res = await self.session.execute(sql_diurnal, {"start_utc": start_utc, "end_utc": end_utc})
        diurnal_cells = [dict(r) for r in diurnal_res.mappings().all()]

        # All revisions for histogram binning
        sql_revs = text("""
            WITH fwd_records AS (
                SELECT 
                    r.delivery_hour_utc,
                    r.publish_time_utc,
                    r.generation_mw as forecast_mw
                FROM raw_forecast_records r
                WHERE r.delivery_hour_utc >= :start_utc
                  AND r.delivery_hour_utc < :end_utc
                  AND r.delivery_hour_utc > r.publish_time_utc
            ),
            transitions AS (
                SELECT 
                    (forecast_mw - LAG(forecast_mw) OVER (PARTITION BY delivery_hour_utc ORDER BY publish_time_utc)) as revision_mw
                FROM fwd_records
            )
            SELECT revision_mw
            FROM transitions
            WHERE revision_mw IS NOT NULL;
        """)
        rev_res = await self.session.execute(sql_revs, {"start_utc": start_utc, "end_utc": end_utc})
        revisions = [float(r[0]) for r in rev_res.fetchall()]

        return summary, top_revisions, diurnal_cells, revisions
