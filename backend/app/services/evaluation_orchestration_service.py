"""Day-ahead evaluation orchestration service.

Enforces:
1. Decision cutoff evaluation timing (09:00 Europe/London).
2. Selection of latest forecast published <= cutoff.
3. Strict evaluation immutability (existing evaluations are never silently overwritten).
4. Full audit logging via IngestionRun and DataQualityEvents.
"""

import logging
import uuid
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.models.ingestion import IngestionRun
from app.repositories.data_quality_repo import DataQualityRepository
from app.repositories.evaluation_repo import EvaluationRepository
from app.repositories.hourly_actual_repo import HourlyActualRepository
from app.repositories.ingestion_run_repo import IngestionRunRepository
from app.repositories.raw_forecast_repo import RawForecastRepository

logger = logging.getLogger(__name__)


class EvaluationOrchestrationService:
    """Orchestrates scheduled and catch-up day-ahead forecast evaluations."""

    def __init__(self, session: AsyncSession, settings: Settings | None = None):
        self.session = session
        self.settings = settings or get_settings()
        self.tz = ZoneInfo(self.settings.TIMEZONE)

        self.eval_repo = EvaluationRepository(session)
        self.forecast_repo = RawForecastRepository(session)
        self.actual_repo = HourlyActualRepository(session)
        self.ingestion_repo = IngestionRunRepository(session)
        self.dq_repo = DataQualityRepository(session)

    def get_decision_cutoff_utc(self, decision_date: date) -> datetime:
        """Calculate the UTC cutoff for a given decision date using configured timezone and time."""
        local_cutoff = datetime.combine(
            decision_date,
            time(self.settings.DECISION_CUTOFF_HOUR, self.settings.DECISION_CUTOFF_MINUTE),
            tzinfo=self.tz,
        )
        return local_cutoff.astimezone(UTC)

    def get_delivery_hours_for_delivery_date(self, delivery_date: date) -> list[datetime]:
        """Generate all delivery hour UTC timestamps for a local Europe/London calendar date."""
        start_local = datetime.combine(delivery_date, time(0, 0), tzinfo=self.tz)
        end_local = datetime.combine(delivery_date + timedelta(days=1), time(0, 0), tzinfo=self.tz)

        hours: list[datetime] = []
        curr = start_local
        while curr < end_local:
            hours.append(curr.astimezone(UTC))
            curr += timedelta(hours=1)
        return hours

    async def run_evaluation_for_date(
        self,
        delivery_date: date,
        force_reevaluate: bool = False,
        run_id: uuid.UUID | None = None,
    ) -> IngestionRun:
        """Execute day-ahead evaluation for all hours of a single delivery date."""
        decision_date = delivery_date - timedelta(days=1)
        cutoff_utc = self.get_decision_cutoff_utc(decision_date)
        now_utc = datetime.now(UTC)

        actual_run_id = run_id or uuid.uuid4()
        run = await self.ingestion_repo.create_run(
            dataset="EVALUATION",
            time_window_start_utc=datetime.combine(delivery_date, datetime.min.time(), tzinfo=UTC),
            time_window_end_utc=datetime.combine(
                delivery_date + timedelta(days=1), datetime.min.time(), tzinfo=UTC
            ),
            metadata_json={
                "delivery_date": delivery_date.isoformat(),
                "decision_date": decision_date.isoformat(),
                "decision_cutoff_utc": cutoff_utc.isoformat(),
            },
            run_id=actual_run_id,
        )

        # 1. Enforce that decision cutoff has occurred
        if now_utc < cutoff_utc and not force_reevaluate:
            msg = (
                f"Cannot evaluate {delivery_date}: decision cutoff "
                f"({cutoff_utc.isoformat()}) has not yet passed."
            )
            logger.info("[%s] %s", actual_run_id, msg)
            await self.ingestion_repo.update_run(
                run_id=actual_run_id,
                status="SUCCESS",
                records_fetched=0,
                records_inserted=0,
                records_already_present=0,
                records_rejected=0,
                error_message=msg,
            )
            await self.session.commit()
            return run

        # 2. Fetch or create configuration
        config = await self.eval_repo.get_or_create_configuration(
            configuration_name="National_DayAhead_0900",
            timezone=self.settings.TIMEZONE,
            cutoff_hour=self.settings.DECISION_CUTOFF_HOUR,
            cutoff_minute=self.settings.DECISION_CUTOFF_MINUTE,
            metric_version="v1.0",
            configuration_version=1,
        )

        delivery_hours_utc = self.get_delivery_hours_for_delivery_date(delivery_date)
        created_count = 0
        already_present_count = 0
        missing_forecast_count = 0
        missing_actual_count = 0

        for del_hour_utc in delivery_hours_utc:
            # 3. Check existing evaluation: CRITICAL IMMUTABILITY ENFORCEMENT
            existing = await self.eval_repo.get_evaluation(del_hour_utc, config.id)
            if existing is not None:
                already_present_count += 1
                continue

            # 4. Fetch latest eligible forecast published at or before cutoff
            latest_fc = await self.forecast_repo.get_latest_forecast_before_cutoff(
                delivery_hour_utc=del_hour_utc,
                cutoff_utc=cutoff_utc,
            )

            # 5. Fetch hourly actual aggregate
            hourly_act = await self.actual_repo.get_by_delivery_hour(del_hour_utc)

            if latest_fc is None:
                missing_forecast_count += 1
                await self.dq_repo.record_event(
                    dataset="WINDFOR",
                    event_type="MISSING_DAY_AHEAD_FORECAST",
                    severity="WARNING",
                    description=(
                        f"No eligible forecast published before cutoff {cutoff_utc.isoformat()} "
                        f"for delivery hour {del_hour_utc.isoformat()}"
                    ),
                    affected_timestamp=del_hour_utc,
                    ingestion_run_id=actual_run_id,
                    details={
                        "delivery_hour_utc": del_hour_utc.isoformat(),
                        "decision_cutoff_utc": cutoff_utc.isoformat(),
                    },
                )

            if hourly_act is None:
                missing_actual_count += 1
                # If delivery hour has already passed, log missing actual
                if now_utc > del_hour_utc + timedelta(hours=1):
                    await self.dq_repo.record_event(
                        dataset="FUELHH",
                        event_type="MISSING_HOURLY_ACTUAL",
                        severity="WARNING",
                        description=(
                            f"Missing hourly actual aggregate for elapsed delivery hour "
                            f"{del_hour_utc.isoformat()}"
                        ),
                        affected_timestamp=del_hour_utc,
                        ingestion_run_id=actual_run_id,
                    )

            # 6. Create evaluation if both are present
            if latest_fc is not None and hourly_act is not None:
                _, created = await self.eval_repo.create_or_get_evaluation(
                    decision_date=decision_date,
                    decision_cutoff_utc=cutoff_utc,
                    delivery_hour_utc=del_hour_utc,
                    configuration=config,
                    forecast_record=latest_fc,
                    hourly_actual=hourly_act,
                )
                if created:
                    created_count += 1
                else:
                    already_present_count += 1

        total_hours = len(delivery_hours_utc)
        final_status = "SUCCESS"
        if missing_forecast_count > 0 or missing_actual_count > 0:
            if created_count > 0 or already_present_count > 0:
                final_status = "PARTIAL_SUCCESS"
            else:
                final_status = "PARTIAL_SUCCESS" if already_present_count > 0 else "PENDING"

        await self.ingestion_repo.update_run(
            run_id=actual_run_id,
            status=final_status if final_status != "PENDING" else "PARTIAL_SUCCESS",
            records_fetched=total_hours,
            records_inserted=created_count,
            records_already_present=already_present_count,
            records_rejected=missing_forecast_count + missing_actual_count,
            metadata_json={
                "delivery_date": delivery_date.isoformat(),
                "created_count": created_count,
                "already_present_count": already_present_count,
                "missing_forecast_count": missing_forecast_count,
                "missing_actual_count": missing_actual_count,
            },
        )
        await self.session.commit()
        return run

    async def run_rolling_evaluation_window(
        self,
        lookback_days: int = 2,
    ) -> list[IngestionRun]:
        """Execute evaluation checks for a rolling calendar window up to today/tomorrow."""
        today_local = datetime.now(self.tz).date()
        runs: list[IngestionRun] = []

        # Check yesterday, today, and tomorrow
        for offset in range(-lookback_days, 2):
            target_date = today_local + timedelta(days=offset)
            run = await self.run_evaluation_for_date(target_date)
            runs.append(run)

        return runs
