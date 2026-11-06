"""Historical January 2026 backfill service and accuracy reconciliation engine."""

import logging
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.repositories.evaluation_repo import EvaluationRepository
from app.repositories.hourly_actual_repo import HourlyActualRepository
from app.repositories.raw_forecast_repo import RawForecastRepository
from app.services.actuals_service import ActualsIngestionService
from app.services.bmrs_client import BmrsClient
from app.services.forecast_service import ForecastIngestionService

logger = logging.getLogger(__name__)


class HistoricalBackfillService:
    """Executes January 2026 ingestion, day-ahead forecast selection, and evaluation backfill."""

    def __init__(
        self,
        session: AsyncSession,
        settings: Settings | None = None,
        bmrs_client: BmrsClient | None = None,
    ):
        self.session = session
        self.settings = settings or get_settings()
        self.bmrs_client = bmrs_client or BmrsClient(self.settings)

        self.forecast_service = ForecastIngestionService(session, self.bmrs_client)
        self.actuals_service = ActualsIngestionService(session, self.bmrs_client)
        self.forecast_repo = RawForecastRepository(session)
        self.actual_repo = HourlyActualRepository(session)
        self.eval_repo = EvaluationRepository(session)

    def get_decision_cutoff_utc(self, decision_date: date) -> datetime:
        """Calculate the UTC cutoff for a given decision date using configured timezone and time."""
        tz = ZoneInfo(self.settings.TIMEZONE)
        local_cutoff = datetime.combine(
            decision_date,
            time(self.settings.DECISION_CUTOFF_HOUR, self.settings.DECISION_CUTOFF_MINUTE),
            tzinfo=tz,
        )
        return local_cutoff.astimezone(UTC)

    async def run_january_2026_backfill(
        self,
        use_cache: bool = True,
    ) -> dict:
        """Execute full January 2026 backfill and return verified reconciliation metrics."""
        decision_start = date(2026, 1, 1)
        decision_end = date(2026, 1, 31)
        delivery_start = date(2026, 1, 2)
        delivery_end = date(2026, 2, 1)

        logger.info("Starting January 2026 backfill: Ingesting WINDFOR forecasts")
        windfor_runs = await self.forecast_service.ingest_date_range(
            start_date=decision_start,
            end_date=decision_end,
            use_cache=use_cache,
        )

        logger.info("Ingesting FUELHH actual generation and synthesizing hourly aggregates")
        fuelhh_runs = await self.actuals_service.ingest_date_range(
            start_date=delivery_start,
            end_date=delivery_end,
            use_cache=use_cache,
        )

        logger.info("Configuring evaluation rule: National_DayAhead_0900")
        config = await self.eval_repo.get_or_create_configuration(
            configuration_name="National_DayAhead_0900",
            timezone=self.settings.TIMEZONE,
            cutoff_hour=self.settings.DECISION_CUTOFF_HOUR,
            cutoff_minute=self.settings.DECISION_CUTOFF_MINUTE,
            metric_version="v1.0",
            configuration_version=1,
        )

        logger.info("Executing day-ahead forecast selection and evaluation matching for 744 hours")
        created_evaluations = 0
        existing_evaluations = 0

        curr_delivery = delivery_start
        while curr_delivery <= delivery_end:
            decision_date = curr_delivery - timedelta(days=1)
            cutoff_utc = self.get_decision_cutoff_utc(decision_date)

            for h in range(24):
                delivery_hour_utc = datetime.combine(
                    curr_delivery, datetime.min.time(), tzinfo=UTC
                ) + timedelta(hours=h)

                # 1. Fetch latest forecast published at or before cutoff
                latest_forecast = await self.forecast_repo.get_latest_forecast_before_cutoff(
                    delivery_hour_utc=delivery_hour_utc,
                    cutoff_utc=cutoff_utc,
                )

                # 2. Fetch corresponding hourly actual
                hourly_actual = await self.actual_repo.get_by_delivery_hour(
                    delivery_hour_utc=delivery_hour_utc
                )

                # 3. Create or get ForecastEvaluation
                _, created = await self.eval_repo.create_or_get_evaluation(
                    decision_date=decision_date,
                    decision_cutoff_utc=cutoff_utc,
                    delivery_hour_utc=delivery_hour_utc,
                    configuration=config,
                    forecast_record=latest_forecast,
                    hourly_actual=hourly_actual,
                )

                if created:
                    created_evaluations += 1
                else:
                    existing_evaluations += 1

            curr_delivery += timedelta(days=1)

        await self.session.commit()

        # 4. Calculate reconciled KPIs across all 744 hours
        start_eval_utc = datetime.combine(delivery_start, datetime.min.time(), tzinfo=UTC)
        end_eval_utc = datetime.combine(delivery_end, time(23, 0, 0), tzinfo=UTC)

        kpis = await self.eval_repo.calculate_kpis(
            start_utc=start_eval_utc,
            end_utc=end_eval_utc,
            configuration_id=config.id,
        )

        return {
            "status": "COMPLETED",
            "decision_dates": f"{decision_start} to {decision_end}",
            "delivery_dates": f"{delivery_start} to {delivery_end}",
            "windfor_runs_count": len(windfor_runs),
            "fuelhh_runs_count": len(fuelhh_runs),
            "evaluations_created": created_evaluations,
            "evaluations_already_present": existing_evaluations,
            "kpis": kpis,
        }
