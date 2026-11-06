"""Forecast ingestion service for WINDFOR dataset processing and validation."""

import logging
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ingestion import IngestionRun
from app.repositories.data_quality_repo import DataQualityRepository
from app.repositories.ingestion_run_repo import IngestionRunRepository
from app.repositories.raw_forecast_repo import RawForecastRepository
from app.services.bmrs_client import BmrsClient, BmrsClientError

logger = logging.getLogger(__name__)


class ForecastIngestionService:
    """Orchestrates WINDFOR forecast extraction, validation, and idempotent persistence."""

    def __init__(
        self,
        session: AsyncSession,
        bmrs_client: BmrsClient | None = None,
    ):
        self.session = session
        self.bmrs_client = bmrs_client or BmrsClient()
        self.ingestion_repo = IngestionRunRepository(session)
        self.forecast_repo = RawForecastRepository(session)
        self.dq_repo = DataQualityRepository(session)

    async def ingest_single_day(
        self,
        decision_date: date,
        use_cache: bool = True,
    ) -> IngestionRun:
        """Ingest WINDFOR forecast publication cycle for a single decision date."""
        window_start = datetime.combine(decision_date, datetime.min.time(), tzinfo=UTC)
        window_end = window_start + timedelta(days=1)
        run_id = uuid.uuid4()

        run = await self.ingestion_repo.create_run(
            dataset="WINDFOR",
            time_window_start_utc=window_start,
            time_window_end_utc=window_end,
            metadata_json={"decision_date": decision_date.isoformat(), "use_cache": use_cache},
            run_id=run_id,
        )

        try:
            raw_records = await self.bmrs_client.fetch_windfor_single_day(
                decision_date=decision_date,
                use_cache=use_cache,
                request_id=str(run_id),
            )
        except BmrsClientError as exc:
            logger.error("Extraction failure for WINDFOR on %s: %s", decision_date, exc)
            await self.dq_repo.record_event(
                dataset="WINDFOR",
                event_type="EXTRACTION_FAILURE",
                severity="CRITICAL",
                description=f"WINDFOR extraction failed for {decision_date}: {exc}",
                ingestion_run_id=run_id,
                details={"error": str(exc)},
            )
            await self.ingestion_repo.update_run(
                run_id=run_id,
                status="FAILED",
                error_message=str(exc),
            )
            await self.session.commit()
            return run

        records_fetched = len(raw_records)
        valid_records: list[dict[str, Any]] = []
        rejected_count = 0

        for r in raw_records:
            pub_str = r.get("publishTime")
            start_str = r.get("startTime")
            gen_val = r.get("generation")

            if not pub_str or not start_str or gen_val is None:
                rejected_count += 1
                await self.dq_repo.record_event(
                    dataset="WINDFOR",
                    event_type="MISSING_MANDATORY_FIELD",
                    severity="WARNING",
                    description="Forecast record missing publishTime, startTime, or generation",
                    ingestion_run_id=run_id,
                    details={"record": r},
                )
                continue

            try:
                pub_dt = datetime.fromisoformat(pub_str.replace("Z", "+00:00"))
                if pub_dt.tzinfo is None:
                    pub_dt = pub_dt.replace(tzinfo=UTC)
                else:
                    pub_dt = pub_dt.astimezone(UTC)

                start_dt = datetime.fromisoformat(start_str.replace("Z", "+00:00"))
                if start_dt.tzinfo is None:
                    start_dt = start_dt.replace(tzinfo=UTC)
                else:
                    start_dt = start_dt.astimezone(UTC)

                # Ensure delivery hour is normalized to the hour
                start_dt = start_dt.replace(minute=0, second=0, microsecond=0)

                gen_float = float(gen_val)
                if gen_float < 0.0:
                    rejected_count += 1
                    await self.dq_repo.record_event(
                        dataset="WINDFOR",
                        event_type="NEGATIVE_GENERATION",
                        severity="ERROR",
                        description=f"Forecast generation cannot be negative: {gen_float}",
                        affected_timestamp=start_dt,
                        ingestion_run_id=run_id,
                        details={"record": r},
                    )
                    continue

                valid_records.append(
                    {
                        "publish_time_utc": pub_dt,
                        "delivery_hour_utc": start_dt,
                        "generation_mw": gen_float,
                        "source_dataset": "WINDFOR",
                    }
                )

            except (ValueError, TypeError) as parse_err:
                rejected_count += 1
                await self.dq_repo.record_event(
                    dataset="WINDFOR",
                    event_type="PARSE_ERROR",
                    severity="ERROR",
                    description=f"Failed to parse forecast timestamps: {parse_err}",
                    ingestion_run_id=run_id,
                    details={"error": str(parse_err), "record": r},
                )

        inserted_count, present_count = await self.forecast_repo.upsert_batch(
            valid_records,
            ingestion_run_id=run_id,
        )

        status = "SUCCESS" if rejected_count == 0 else "PARTIAL_SUCCESS"
        updated_run = await self.ingestion_repo.update_run(
            run_id=run_id,
            status=status,
            records_fetched=records_fetched,
            records_inserted=inserted_count,
            records_already_present=present_count,
            records_rejected=rejected_count,
        )
        await self.session.commit()
        return updated_run or run

    async def ingest_date_range(
        self,
        start_date: date,
        end_date: date,
        use_cache: bool = True,
    ) -> list[IngestionRun]:
        """Ingest WINDFOR forecasts across a date range."""
        runs: list[IngestionRun] = []
        curr = start_date
        while curr <= end_date:
            run = await self.ingest_single_day(curr, use_cache=use_cache)
            runs.append(run)
            curr += timedelta(days=1)
        return runs
