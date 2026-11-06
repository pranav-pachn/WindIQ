"""Actuals ingestion service for FUELHH dataset processing, validation, and hourly synthesis."""

import logging
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ingestion import IngestionRun
from app.repositories.data_quality_repo import DataQualityRepository
from app.repositories.hourly_actual_repo import HourlyActualRepository
from app.repositories.ingestion_run_repo import IngestionRunRepository
from app.repositories.raw_actual_repo import RawActualRepository
from app.services.bmrs_client import BmrsClient, BmrsClientError

logger = logging.getLogger(__name__)


class ActualsIngestionService:
    """Orchestrates FUELHH wind generation ingestion, raw persistence, and hourly synthesis."""

    def __init__(
        self,
        session: AsyncSession,
        bmrs_client: BmrsClient | None = None,
    ):
        self.session = session
        self.bmrs_client = bmrs_client or BmrsClient()
        self.ingestion_repo = IngestionRunRepository(session)
        self.raw_actual_repo = RawActualRepository(session)
        self.hourly_actual_repo = HourlyActualRepository(session)
        self.dq_repo = DataQualityRepository(session)

    async def ingest_single_day(
        self,
        delivery_date: date,
        use_cache: bool = True,
    ) -> IngestionRun:
        """Ingest FUELHH actual settlement readings and synthesize hourly actuals."""
        window_start = datetime.combine(delivery_date, datetime.min.time(), tzinfo=UTC)
        window_end = window_start + timedelta(days=1)
        run_id = uuid.uuid4()

        run = await self.ingestion_repo.create_run(
            dataset="FUELHH",
            time_window_start_utc=window_start,
            time_window_end_utc=window_end,
            metadata_json={"delivery_date": delivery_date.isoformat(), "use_cache": use_cache},
            run_id=run_id,
        )

        try:
            raw_records = await self.bmrs_client.fetch_fuelhh_single_day(
                delivery_date=delivery_date,
                use_cache=use_cache,
                request_id=str(run_id),
            )
        except BmrsClientError as exc:
            logger.error("Extraction failure for FUELHH on %s: %s", delivery_date, exc)
            await self.dq_repo.record_event(
                dataset="FUELHH",
                event_type="EXTRACTION_FAILURE",
                severity="CRITICAL",
                description=f"FUELHH extraction failed for {delivery_date}: {exc}",
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
            fuel_type = r.get("fuelType")
            if fuel_type != "WIND":
                continue  # Filter strictly to WIND as per requirements

            start_str = r.get("startTime")
            gen_val = r.get("generation")
            settlement_period = r.get("settlementPeriod")
            settlement_date_str = r.get("settlementDate")

            if (
                not start_str
                or gen_val is None
                or settlement_period is None
                or not settlement_date_str
            ):
                rejected_count += 1
                await self.dq_repo.record_event(
                    dataset="FUELHH",
                    event_type="MISSING_MANDATORY_FIELD",
                    severity="WARNING",
                    description="FUELHH record missing startTime, generation, or settlement fields",
                    ingestion_run_id=run_id,
                    details={"record": r},
                )
                continue

            try:
                start_dt = datetime.fromisoformat(start_str.replace("Z", "+00:00"))
                if start_dt.tzinfo is None:
                    start_dt = start_dt.replace(tzinfo=UTC)
                else:
                    start_dt = start_dt.astimezone(UTC)

                settlement_dt = date.fromisoformat(settlement_date_str)
                gen_float = float(gen_val)
                if gen_float < 0.0:
                    rejected_count += 1
                    await self.dq_repo.record_event(
                        dataset="FUELHH",
                        event_type="NEGATIVE_GENERATION",
                        severity="ERROR",
                        description=f"Actual generation cannot be negative: {gen_float}",
                        affected_timestamp=start_dt,
                        ingestion_run_id=run_id,
                        details={"record": r},
                    )
                    continue

                valid_records.append(
                    {
                        "source_start_time_utc": start_dt,
                        "settlement_date": settlement_dt,
                        "settlement_period": int(settlement_period),
                        "generation_mw": gen_float,
                        "source_dataset": "FUELHH",
                    }
                )

            except (ValueError, TypeError) as parse_err:
                rejected_count += 1
                await self.dq_repo.record_event(
                    dataset="FUELHH",
                    event_type="PARSE_ERROR",
                    severity="ERROR",
                    description=f"Failed to parse FUELHH record: {parse_err}",
                    ingestion_run_id=run_id,
                    details={"error": str(parse_err), "record": r},
                )

        # 1. Upsert raw records
        inserted_count, present_count = await self.raw_actual_repo.upsert_batch(
            valid_records,
            ingestion_run_id=run_id,
        )

        # 2. Synthesize hourly actuals for each hour of the delivery date
        synthesized_count = 0
        incomplete_count = 0

        for h in range(24):
            hour_dt = datetime.combine(delivery_date, datetime.min.time(), tzinfo=UTC) + timedelta(
                hours=h
            )
            r_00, r_30 = await self.raw_actual_repo.get_half_hourly_pair(hour_dt)

            if r_00 is not None and r_30 is not None:
                _, created = await self.hourly_actual_repo.create_or_get_hourly_actual(
                    delivery_hour_utc=hour_dt,
                    first_record=r_00,
                    second_record=r_30,
                )
                if created:
                    synthesized_count += 1
            else:
                incomplete_count += 1
                desc = (
                    f"Incomplete half-hourly readings for hour {hour_dt.isoformat()}; "
                    f"r_00={r_00 is not None}, r_30={r_30 is not None}"
                )
                await self.dq_repo.record_event(
                    dataset="FUELHH",
                    event_type="INCOMPLETE_HOURLY_PAIR",
                    severity="WARNING",
                    description=desc,
                    affected_timestamp=hour_dt,
                    ingestion_run_id=run_id,
                    details={
                        "hour": hour_dt.isoformat(),
                        "has_00": r_00 is not None,
                        "has_30": r_30 is not None,
                    },
                )

        status = "SUCCESS" if (rejected_count == 0 and incomplete_count == 0) else "PARTIAL_SUCCESS"
        updated_run = await self.ingestion_repo.update_run(
            run_id=run_id,
            status=status,
            records_fetched=records_fetched,
            records_inserted=inserted_count,
            records_already_present=present_count,
            records_rejected=rejected_count,
            metadata_json={
                "synthesized_hourly_actuals": synthesized_count,
                "incomplete_hours": incomplete_count,
            },
        )
        await self.session.commit()
        return updated_run or run

    async def ingest_date_range(
        self,
        start_date: date,
        end_date: date,
        use_cache: bool = True,
    ) -> list[IngestionRun]:
        """Ingest FUELHH actuals across a delivery date range."""
        runs: list[IngestionRun] = []
        curr = start_date
        while curr <= end_date:
            run = await self.ingest_single_day(curr, use_cache=use_cache)
            runs.append(run)
            curr += timedelta(days=1)
        return runs
