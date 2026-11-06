"""Analytics service for forecast evaluations, daily/hourly aggregations, and platform KPIs."""

import math
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.models.evaluation import ForecastEvaluation
from app.repositories.data_quality_repo import DataQualityRepository
from app.repositories.evaluation_repo import EvaluationRepository
from app.repositories.hourly_actual_repo import HourlyActualRepository
from app.repositories.ingestion_run_repo import IngestionRunRepository
from app.repositories.raw_actual_repo import RawActualRepository
from app.repositories.raw_forecast_repo import RawForecastRepository
from app.schemas.accuracy import (
    AccuracyDateRange,
    AccuracySummaryMetrics,
    AccuracySummaryResponse,
    DailyAccuracyItem,
    DailyAccuracyResponse,
    DailyAccuracySummary,
    DayExtremum,
    HalfHourReadingTrace,
    HourlyAccuracyItem,
    HourlyAccuracyResponse,
    HourOfDayAggregate,
    TraceabilityDetail,
)
from app.schemas.common import PaginationMeta
from app.schemas.data_health import (
    DataHealthResponse,
    DataHealthSummary,
    DatasetHealthDetail,
    PublicationCycleHealth,
    QualityEventItem,
    SchedulerHealthDetail,
)
from app.schemas.forecasts import (
    DiurnalRevisionCell,
    ExtremeRevisionItem,
    ForecastItem,
    ForecastListResponse,
    HorizonBucketStats,
    HorizonMode,
    MultiHorizonResponse,
    PublicationVersion,
    RevisionAnalyticsResponse,
    RevisionDistributionBin,
    SingleDeliveryHourPublicationResponse,
)
from app.schemas.overview import (
    AccuracyKpis,
    DatasetHealthInfo,
    EvaluationPeriodInfo,
    OverviewResponse,
)


class AnalyticsService:
    """Service providing traceable accuracy metrics and dashboard analytics."""

    def __init__(self, session: AsyncSession, settings: Settings | None = None):
        self.session = session
        self.settings = settings or get_settings()
        self.tz = ZoneInfo(self.settings.TIMEZONE)

        self.eval_repo = EvaluationRepository(session)
        self.raw_fc_repo = RawForecastRepository(session)
        self.raw_act_repo = RawActualRepository(session)
        self.hourly_act_repo = HourlyActualRepository(session)
        self.ingestion_repo = IngestionRunRepository(session)
        self.dq_repo = DataQualityRepository(session)

    def _to_local(self, dt_utc: datetime) -> datetime:
        """Convert a UTC datetime to Europe/London local datetime."""
        if dt_utc.tzinfo is None:
            dt_utc = dt_utc.replace(tzinfo=UTC)
        return dt_utc.astimezone(self.tz)

    def _expected_hours_for_date(self, local_date: date) -> int:
        """Calculate expected delivery hours for a local date handling DST transitions."""
        start_local = datetime.combine(local_date, time(0, 0), tzinfo=self.tz)
        end_local = datetime.combine(local_date + timedelta(days=1), time(0, 0), tzinfo=self.tz)
        duration_seconds = (end_local.astimezone(UTC) - start_local.astimezone(UTC)).total_seconds()
        return int(round(duration_seconds / 3600.0))

    def _local_date_window_to_utc(
        self, start_date: date, end_date: date
    ) -> tuple[datetime, datetime]:
        """Convert local start and end dates (inclusive) to UTC start and end bounds."""
        start_local = datetime.combine(start_date, time(0, 0, 0), tzinfo=self.tz)
        end_local = datetime.combine(end_date, time(23, 59, 59), tzinfo=self.tz)
        return start_local.astimezone(UTC), end_local.astimezone(UTC)

    async def get_overview(self) -> OverviewResponse:
        """Fetch high-level platform status, evaluation window, and benchmark KPIs."""
        bounds = await self.eval_repo.get_evaluation_window_bounds()
        cfg = await self.eval_repo.get_latest_configuration()
        if cfg is None:
            cfg = await self.eval_repo.get_or_create_configuration()

        if bounds is None or bounds["total_evaluations"] == 0:
            # Default empty period
            today = date.today()
            return OverviewResponse(
                platform=f"{self.settings.APP_NAME} UK Forecast Accuracy Platform",
                version="2.0.0",
                evaluation_period=EvaluationPeriodInfo(
                    decision_start_date=today,
                    decision_end_date=today,
                    delivery_start_date=today,
                    delivery_end_date=today,
                    decision_cutoff=(
                        f"{self.settings.DECISION_CUTOFF_HOUR:02d}:"
                        f"{self.settings.DECISION_CUTOFF_MINUTE:02d} "
                        f"{self.settings.TIMEZONE}"
                    ),
                    total_evaluation_hours=0,
                ),
                accuracy_kpis=AccuracyKpis(
                    valid_comparisons=0,
                    forecast_coverage_pct=0.0,
                    actual_completeness_pct=0.0,
                    mae_mw=0.0,
                    rmse_mw=0.0,
                    mape_pct=0.0,
                    mape_denominator=0,
                    forecast_bias_mw=0.0,
                    overforecast_hours=0,
                    underforecast_hours=0,
                    zero_error_hours=0,
                ),
                dataset_health=DatasetHealthInfo(
                    raw_windfor_records=await self.raw_fc_repo.count_total(),
                    raw_fuelhh_readings=await self.raw_act_repo.count_total(),
                    last_successful_ingestion_utc=None,
                ),
                configuration_version=cfg.configuration_version,
                metric_version=cfg.metric_version,
            )

        start_eval_utc = bounds["min_delivery_utc"]
        end_eval_utc = bounds["max_delivery_utc"]
        kpis = await self.eval_repo.calculate_kpis(
            start_utc=start_eval_utc,
            end_utc=end_eval_utc,
            configuration_id=cfg.id,
        )

        min_delivery_local = self._to_local(start_eval_utc).date()
        max_delivery_local = self._to_local(end_eval_utc).date()

        # Ingestion freshness
        latest_fc_run = await self.ingestion_repo.get_latest_successful_run("WINDFOR")
        latest_act_run = await self.ingestion_repo.get_latest_successful_run("FUELHH")
        last_ingestion_utc = None
        if latest_fc_run and latest_act_run:
            last_ingestion_utc = max(latest_fc_run.started_at, latest_act_run.started_at)
        elif latest_fc_run:
            last_ingestion_utc = latest_fc_run.started_at
        elif latest_act_run:
            last_ingestion_utc = latest_act_run.started_at

        total_hours = bounds["total_evaluations"]
        valid_count = kpis["count"]
        coverage_pct = round((valid_count / total_hours) * 100.0, 2) if total_hours > 0 else 0.0

        return OverviewResponse(
            platform=f"{self.settings.APP_NAME} UK Forecast Accuracy Platform",
            version="2.0.0",
            evaluation_period=EvaluationPeriodInfo(
                decision_start_date=bounds["min_decision_date"],
                decision_end_date=bounds["max_decision_date"],
                delivery_start_date=min_delivery_local,
                delivery_end_date=max_delivery_local,
                decision_cutoff=f"{cfg.cutoff_hour:02d}:{cfg.cutoff_minute:02d} {cfg.timezone}",
                total_evaluation_hours=total_hours,
            ),
            accuracy_kpis=AccuracyKpis(
                valid_comparisons=valid_count,
                forecast_coverage_pct=coverage_pct,
                actual_completeness_pct=coverage_pct,
                mae_mw=kpis["mae_mw"],
                rmse_mw=kpis["rmse_mw"],
                mape_pct=kpis["mape_pct"],
                mape_denominator=kpis["mape_denominator"],
                forecast_bias_mw=kpis["bias_mw"],
                overforecast_hours=kpis["overforecast_count"],
                underforecast_hours=kpis["underforecast_count"],
                zero_error_hours=kpis["zero_error_count"],
                avg_forecast_mw=kpis.get("avg_forecast_mw"),
                avg_actual_mw=kpis.get("avg_actual_mw"),
            ),
            dataset_health=DatasetHealthInfo(
                raw_windfor_records=await self.raw_fc_repo.count_total(),
                raw_fuelhh_readings=await self.raw_act_repo.count_total(),
                last_successful_ingestion_utc=last_ingestion_utc,
            ),
            configuration_version=cfg.configuration_version,
            metric_version=cfg.metric_version,
        )

    async def get_accuracy_summary(
        self,
        delivery_date_from: date | None = None,
        delivery_date_to: date | None = None,
    ) -> AccuracySummaryResponse:
        """Calculate verified accuracy summary KPIs over an arbitrary delivery date window."""
        bounds = await self.eval_repo.get_evaluation_window_bounds()
        if bounds is None or bounds["total_evaluations"] == 0:
            from_d = delivery_date_from or date.today()
            to_d = delivery_date_to or date.today()
            return AccuracySummaryResponse(
                date_range=AccuracyDateRange(
                    delivery_date_from=from_d,
                    delivery_date_to=to_d,
                    total_calendar_days=1,
                    total_hours=0,
                ),
                metrics=AccuracySummaryMetrics(
                    valid_comparisons=0,
                    missing_forecast_hours=0,
                    missing_actual_hours=0,
                    forecast_coverage_pct=0.0,
                    actual_completeness_pct=0.0,
                    mae_mw=0.0,
                    rmse_mw=0.0,
                    mape_pct=0.0,
                    forecast_bias_mw=0.0,
                    overforecast_count=0,
                    underforecast_count=0,
                    zero_error_count=0,
                    mape_denominator=0,
                    mape_excluded_count=0,
                    mape_exclusion_reasons=[],
                ),
            )

        min_avail_date = self._to_local(bounds["min_delivery_utc"]).date()
        max_avail_date = self._to_local(bounds["max_delivery_utc"]).date()

        start_date = delivery_date_from or min_avail_date
        end_date = delivery_date_to or max_avail_date

        if start_date > end_date:
            raise ValueError("delivery_date_from must be less than or equal to delivery_date_to")

        start_utc, end_utc = self._local_date_window_to_utc(start_date, end_date)
        evals = await self.eval_repo.get_evaluations_for_range(start_utc, end_utc)

        # Expected hours across local days (accounts for DST 23/24/25 hour days)
        curr = start_date
        total_expected_hours = 0
        total_days = 0
        while curr <= end_date:
            total_expected_hours += self._expected_hours_for_date(curr)
            total_days += 1
            curr += timedelta(days=1)

        valid = [
            e
            for e in evals
            if e.forecast_generation_mw is not None and e.actual_generation_mw is not None
        ]
        valid_count = len(valid)

        missing_forecast = sum(1 for e in evals if e.forecast_generation_mw is None)
        missing_actual = sum(1 for e in evals if e.actual_generation_mw is None)
        unaccounted = max(0, total_expected_hours - len(evals))
        missing_forecast += unaccounted
        missing_actual += unaccounted

        fc_coverage = (
            round(((total_expected_hours - missing_forecast) / total_expected_hours) * 100.0, 2)
            if total_expected_hours > 0
            else 0.0
        )
        act_completeness = (
            round(((total_expected_hours - missing_actual) / total_expected_hours) * 100.0, 2)
            if total_expected_hours > 0
            else 0.0
        )

        if valid_count == 0:
            return AccuracySummaryResponse(
                date_range=AccuracyDateRange(
                    delivery_date_from=start_date,
                    delivery_date_to=end_date,
                    total_calendar_days=total_days,
                    total_hours=total_expected_hours,
                ),
                metrics=AccuracySummaryMetrics(
                    valid_comparisons=0,
                    missing_forecast_hours=missing_forecast,
                    missing_actual_hours=missing_actual,
                    forecast_coverage_pct=fc_coverage,
                    actual_completeness_pct=act_completeness,
                    mae_mw=0.0,
                    rmse_mw=0.0,
                    mape_pct=0.0,
                    forecast_bias_mw=0.0,
                    overforecast_count=0,
                    underforecast_count=0,
                    zero_error_count=0,
                    mape_denominator=0,
                    mape_excluded_count=0,
                    mape_exclusion_reasons=[],
                ),
            )

        abs_errors = [e.absolute_error_mw for e in valid if e.absolute_error_mw is not None]
        signed_errors = [e.signed_error_mw for e in valid if e.signed_error_mw is not None]
        pct_errors = [
            e.absolute_percentage_error for e in valid if e.absolute_percentage_error is not None
        ]
        excluded_from_mape = [
            e for e in valid if e.actual_generation_mw is not None and e.actual_generation_mw <= 0.0
        ]

        exclusion_reasons = []
        if excluded_from_mape:
            count_ex = len(excluded_from_mape)
            exclusion_reasons.append(
                f"{count_ex} hour(s) with actual generation <= 0 MW excluded from MAPE denominator"
            )

        mae = sum(abs_errors) / valid_count
        rmse = math.sqrt(sum(err**2 for err in signed_errors) / valid_count)
        mape = (sum(pct_errors) / len(pct_errors)) if pct_errors else 0.0
        bias = sum(signed_errors) / valid_count

        fc_vals = [e.forecast_generation_mw for e in valid if e.forecast_generation_mw is not None]
        act_vals = [e.actual_generation_mw for e in valid if e.actual_generation_mw is not None]
        avg_fc = (sum(fc_vals) / len(fc_vals)) if fc_vals else None
        avg_act = (sum(act_vals) / len(act_vals)) if act_vals else None

        over_count = sum(1 for e in valid if e.is_overforecast is True)
        under_count = sum(1 for e in valid if e.is_underforecast is True)
        zero_count = sum(1 for e in valid if e.signed_error_mw == 0.0)

        return AccuracySummaryResponse(
            date_range=AccuracyDateRange(
                delivery_date_from=start_date,
                delivery_date_to=end_date,
                total_calendar_days=total_days,
                total_hours=total_expected_hours,
            ),
            metrics=AccuracySummaryMetrics(
                valid_comparisons=valid_count,
                missing_forecast_hours=missing_forecast,
                missing_actual_hours=missing_actual,
                forecast_coverage_pct=fc_coverage,
                actual_completeness_pct=act_completeness,
                mae_mw=round(mae, 4),
                rmse_mw=round(rmse, 4),
                mape_pct=round(mape, 4),
                forecast_bias_mw=round(bias, 4),
                overforecast_count=over_count,
                underforecast_count=under_count,
                zero_error_count=zero_count,
                mape_denominator=len(pct_errors),
                mape_excluded_count=len(excluded_from_mape),
                mape_exclusion_reasons=exclusion_reasons,
                avg_forecast_mw=round(avg_fc, 4) if avg_fc is not None else None,
                avg_actual_mw=round(avg_act, 4) if avg_act is not None else None,
            ),
        )

    async def get_daily_accuracy(
        self,
        delivery_date_from: date | None = None,
        delivery_date_to: date | None = None,
        sort_by: str = "delivery_date",
        order: str = "asc",
        page: int = 1,
        page_size: int = 50,
    ) -> DailyAccuracyResponse:
        """Calculate daily accuracy aggregates and identify best/worst performance days."""
        bounds = await self.eval_repo.get_evaluation_window_bounds()
        if bounds is None or bounds["total_evaluations"] == 0:
            return DailyAccuracyResponse(
                items=[],
                summary=DailyAccuracySummary(total_days=0),
            )

        min_avail_date = self._to_local(bounds["min_delivery_utc"]).date()
        max_avail_date = self._to_local(bounds["max_delivery_utc"]).date()

        start_date = delivery_date_from or min_avail_date
        end_date = delivery_date_to or max_avail_date

        if start_date > end_date:
            raise ValueError("delivery_date_from must be less than or equal to delivery_date_to")

        start_utc, end_utc = self._local_date_window_to_utc(start_date, end_date)
        evals = await self.eval_repo.get_evaluations_for_range(start_utc, end_utc)

        # Bucket evaluations by local calendar day (Europe/London)
        evals_by_day: dict[date, list[ForecastEvaluation]] = {}
        for e in evals:
            local_day = self._to_local(e.delivery_hour_utc).date()
            if start_date <= local_day <= end_date:
                evals_by_day.setdefault(local_day, []).append(e)

        daily_items: list[DailyAccuracyItem] = []
        curr = start_date
        while curr <= end_date:
            day_evals = evals_by_day.get(curr, [])
            expected_hours = self._expected_hours_for_date(curr)

            valid = [
                e
                for e in day_evals
                if e.forecast_generation_mw is not None and e.actual_generation_mw is not None
            ]
            valid_hours = len(valid)

            missing_fc = sum(1 for e in day_evals if e.forecast_generation_mw is None) + max(
                0, expected_hours - len(day_evals)
            )
            missing_act = sum(1 for e in day_evals if e.actual_generation_mw is None) + max(
                0, expected_hours - len(day_evals)
            )

            fc_cov = (
                round(((expected_hours - missing_fc) / expected_hours) * 100.0, 2)
                if expected_hours > 0
                else 0.0
            )
            act_comp = (
                round(((expected_hours - missing_act) / expected_hours) * 100.0, 2)
                if expected_hours > 0
                else 0.0
            )

            if valid_hours == 0:
                daily_items.append(
                    DailyAccuracyItem(
                        delivery_date=curr,
                        decision_date=curr - timedelta(days=1),
                        total_hours=expected_hours,
                        valid_hours=0,
                        forecast_coverage_pct=fc_cov,
                        actual_completeness_pct=act_comp,
                        mae_mw=0.0,
                        rmse_mw=0.0,
                        mape_pct=0.0,
                        mape_denominator=0,
                        bias_mw=0.0,
                        overforecast_hours=0,
                        underforecast_hours=0,
                        zero_error_hours=0,
                        avg_forecast_mw=None,
                        avg_actual_mw=None,
                    )
                )
            else:
                abs_errs = [e.absolute_error_mw for e in valid if e.absolute_error_mw is not None]
                signed_errs = [e.signed_error_mw for e in valid if e.signed_error_mw is not None]
                pct_errs = [
                    e.absolute_percentage_error
                    for e in valid
                    if e.absolute_percentage_error is not None
                ]

                d_mae = sum(abs_errs) / valid_hours
                d_rmse = math.sqrt(sum(err**2 for err in signed_errs) / valid_hours)
                d_mape = (sum(pct_errs) / len(pct_errs)) if pct_errs else 0.0
                d_bias = sum(signed_errs) / valid_hours

                fc_vals = [
                    e.forecast_generation_mw for e in valid if e.forecast_generation_mw is not None
                ]
                act_vals = [
                    e.actual_generation_mw for e in valid if e.actual_generation_mw is not None
                ]
                avg_fc = (sum(fc_vals) / len(fc_vals)) if fc_vals else None
                avg_act = (sum(act_vals) / len(act_vals)) if act_vals else None

                over_hrs = sum(1 for e in valid if e.is_overforecast is True)
                under_hrs = sum(1 for e in valid if e.is_underforecast is True)
                zero_hrs = sum(1 for e in valid if e.signed_error_mw == 0.0)

                decision_d = day_evals[0].decision_date if day_evals else (curr - timedelta(days=1))

                daily_items.append(
                    DailyAccuracyItem(
                        delivery_date=curr,
                        decision_date=decision_d,
                        total_hours=expected_hours,
                        valid_hours=valid_hours,
                        forecast_coverage_pct=fc_cov,
                        actual_completeness_pct=act_comp,
                        mae_mw=round(d_mae, 4),
                        rmse_mw=round(d_rmse, 4),
                        mape_pct=round(d_mape, 4),
                        mape_denominator=len(pct_errs),
                        bias_mw=round(d_bias, 4),
                        overforecast_hours=over_hrs,
                        underforecast_hours=under_hrs,
                        zero_error_hours=zero_hrs,
                        avg_forecast_mw=round(avg_fc, 4) if avg_fc is not None else None,
                        avg_actual_mw=round(avg_act, 4) if avg_act is not None else None,
                    )
                )

            curr += timedelta(days=1)

        # Summary extremums
        valid_days = [d for d in daily_items if d.valid_hours > 0]
        best_mae: DayExtremum | None = None
        worst_mae: DayExtremum | None = None
        best_mape: DayExtremum | None = None
        worst_mape: DayExtremum | None = None

        if valid_days:
            best_d_mae = min(valid_days, key=lambda d: d.mae_mw)
            worst_d_mae = max(valid_days, key=lambda d: d.mae_mw)
            best_mae = DayExtremum(delivery_date=best_d_mae.delivery_date, value=best_d_mae.mae_mw)
            worst_mae = DayExtremum(
                delivery_date=worst_d_mae.delivery_date, value=worst_d_mae.mae_mw
            )

            mape_days = [d for d in valid_days if d.mape_denominator > 0]
            if mape_days:
                best_d_mape = min(mape_days, key=lambda d: d.mape_pct)
                worst_d_mape = max(mape_days, key=lambda d: d.mape_pct)
                best_mape = DayExtremum(
                    delivery_date=best_d_mape.delivery_date, value=best_d_mape.mape_pct
                )
                worst_mape = DayExtremum(
                    delivery_date=worst_d_mape.delivery_date, value=worst_d_mape.mape_pct
                )

        summary = DailyAccuracySummary(
            total_days=len(daily_items),
            best_day_mae=best_mae,
            worst_day_mae=worst_mae,
            best_day_mape=best_mape,
            worst_day_mape=worst_mape,
        )

        # Sorting
        reverse = order.lower() == "desc"
        if sort_by == "mae_mw":
            daily_items.sort(key=lambda d: d.mae_mw, reverse=reverse)
        elif sort_by == "mape_pct":
            daily_items.sort(key=lambda d: d.mape_pct, reverse=reverse)
        elif sort_by == "bias_mw":
            daily_items.sort(key=lambda d: d.bias_mw, reverse=reverse)
        else:
            daily_items.sort(key=lambda d: d.delivery_date, reverse=reverse)

        # Pagination
        total_items = len(daily_items)
        total_pages = math.ceil(total_items / page_size) if total_items > 0 else 1
        offset = (page - 1) * page_size
        paged_items = daily_items[offset : offset + page_size]

        pagination = PaginationMeta(
            page=page,
            page_size=page_size,
            total_items=total_items,
            total_pages=total_pages,
            has_next=page < total_pages,
            has_previous=page > 1,
        )

        return DailyAccuracyResponse(
            items=paged_items,
            summary=summary,
            pagination=pagination,
        )

    async def get_hourly_accuracy(
        self,
        delivery_date: date | None = None,
        delivery_date_from: date | None = None,
        delivery_date_to: date | None = None,
        hour_of_day: int | None = None,
        status: str = "ALL",
        view: str = "series",
        sort_by: str = "delivery_hour_utc",
        order: str = "asc",
        page: int = 1,
        page_size: int = 50,
    ) -> HourlyAccuracyResponse:
        """Fetch granular hourly evaluations with traceability and optional hour-of-day summary."""
        bounds = await self.eval_repo.get_evaluation_window_bounds()
        if bounds is None or bounds["total_evaluations"] == 0:
            return HourlyAccuracyResponse(
                items=[],
                pagination=PaginationMeta(
                    page=page,
                    page_size=page_size,
                    total_items=0,
                    total_pages=0,
                    has_next=False,
                    has_previous=False,
                ),
                hour_of_day_summary=[],
            )

        min_avail_date = self._to_local(bounds["min_delivery_utc"]).date()
        max_avail_date = self._to_local(bounds["max_delivery_utc"]).date()

        if delivery_date is not None:
            start_date = delivery_date
            end_date = delivery_date
        else:
            start_date = delivery_date_from or min_avail_date
            end_date = delivery_date_to or max_avail_date

        if start_date > end_date:
            raise ValueError("delivery_date_from must be less than or equal to delivery_date_to")

        start_utc, end_utc = self._local_date_window_to_utc(start_date, end_date)

        # 1. Fetch paginated evaluations with joined relationships
        evals, total_items = await self.eval_repo.get_evaluations_paginated(
            start_utc=start_utc,
            end_utc=end_utc,
            hour_of_day=hour_of_day,
            status=status if status != "ALL" else None,
            sort_by=sort_by,
            order=order,
            page=page,
            page_size=page_size,
            include_relations=True,
        )

        items: list[HourlyAccuracyItem] = []
        for e in evals:
            local_dt = self._to_local(e.delivery_hour_utc)
            local_day = local_dt.date()
            local_hr = local_dt.hour

            trace: TraceabilityDetail | None = None
            if e.hourly_actual:
                readings = []
                if e.hourly_actual.first_half_hour_record:
                    r1 = e.hourly_actual.first_half_hour_record
                    readings.append(
                        HalfHourReadingTrace(
                            settlement_period=r1.settlement_period,
                            start_time_utc=r1.source_start_time_utc,
                            generation_mw=float(r1.generation_mw),
                        )
                    )
                if e.hourly_actual.second_half_hour_record:
                    r2 = e.hourly_actual.second_half_hour_record
                    readings.append(
                        HalfHourReadingTrace(
                            settlement_period=r2.settlement_period,
                            start_time_utc=r2.source_start_time_utc,
                            generation_mw=float(r2.generation_mw),
                        )
                    )
                trace = TraceabilityDetail(
                    selected_forecast_id=e.forecast_record_id,
                    hourly_actual_id=e.hourly_actual_id,
                    half_hour_readings=readings,
                )

            pub_time_utc = (
                e.forecast_record.publish_time_utc if e.forecast_record is not None else None
            )

            comp_status = "VALID"
            if e.forecast_generation_mw is None:
                comp_status = "MISSING_FORECAST"
            elif e.actual_generation_mw is None:
                comp_status = "MISSING_ACTUAL"

            items.append(
                HourlyAccuracyItem(
                    id=e.id,
                    delivery_date=local_day,
                    delivery_hour_utc=e.delivery_hour_utc,
                    hour_of_day=local_hr,
                    decision_date=e.decision_date,
                    decision_cutoff_utc=e.decision_cutoff_utc,
                    selected_publish_time_utc=pub_time_utc,
                    forecast_generation_mw=e.forecast_generation_mw,
                    actual_generation_mw=e.actual_generation_mw,
                    forecast_error_mw=e.signed_error_mw,
                    absolute_error_mw=e.absolute_error_mw,
                    absolute_percentage_error=e.absolute_percentage_error,
                    comparison_status=comp_status,
                    traceability=trace,
                )
            )

        total_pages = math.ceil(total_items / page_size) if total_items > 0 else 1
        pagination = PaginationMeta(
            page=page,
            page_size=page_size,
            total_items=total_items,
            total_pages=total_pages,
            has_next=page < total_pages,
            has_previous=page > 1,
        )

        # 2. Compute Hour-of-Day Aggregates if requested or on overview
        hour_of_day_summary: list[HourOfDayAggregate] = []
        all_window_evals = await self.eval_repo.get_evaluations_for_range(start_utc, end_utc)
        evals_by_hour: dict[int, list[ForecastEvaluation]] = {h: [] for h in range(24)}
        for e in all_window_evals:
            hr = self._to_local(e.delivery_hour_utc).hour
            evals_by_hour[hr].append(e)

        for hr in range(24):
            hr_evals = evals_by_hour[hr]
            valid_hr = [
                e
                for e in hr_evals
                if e.forecast_generation_mw is not None and e.actual_generation_mw is not None
            ]
            cnt = len(valid_hr)
            if cnt == 0:
                hour_of_day_summary.append(
                    HourOfDayAggregate(
                        hour_of_day=hr,
                        comparison_count=0,
                        mae_mw=0.0,
                        rmse_mw=0.0,
                        mape_pct=0.0,
                        mape_denominator=0,
                        bias_mw=0.0,
                        avg_forecast_mw=0.0,
                        avg_actual_mw=0.0,
                        overforecast_count=0,
                        underforecast_count=0,
                    )
                )
            else:
                abs_errs = [
                    e.absolute_error_mw for e in valid_hr if e.absolute_error_mw is not None
                ]
                signed_errs = [e.signed_error_mw for e in valid_hr if e.signed_error_mw is not None]
                pct_errs = [
                    e.absolute_percentage_error
                    for e in valid_hr
                    if e.absolute_percentage_error is not None
                ]

                h_mae = sum(abs_errs) / cnt
                h_rmse = math.sqrt(sum(err**2 for err in signed_errs) / cnt)
                h_mape = (sum(pct_errs) / len(pct_errs)) if pct_errs else 0.0
                h_bias = sum(signed_errs) / cnt

                fc_vals = [
                    e.forecast_generation_mw
                    for e in valid_hr
                    if e.forecast_generation_mw is not None
                ]
                act_vals = [
                    e.actual_generation_mw for e in valid_hr if e.actual_generation_mw is not None
                ]
                avg_fc = (sum(fc_vals) / len(fc_vals)) if fc_vals else 0.0
                avg_act = (sum(act_vals) / len(act_vals)) if act_vals else 0.0

                over_c = sum(1 for e in valid_hr if e.is_overforecast is True)
                under_c = sum(1 for e in valid_hr if e.is_underforecast is True)

                hour_of_day_summary.append(
                    HourOfDayAggregate(
                        hour_of_day=hr,
                        comparison_count=cnt,
                        mae_mw=round(h_mae, 4),
                        rmse_mw=round(h_rmse, 4),
                        mape_pct=round(h_mape, 4),
                        mape_denominator=len(pct_errs),
                        bias_mw=round(h_bias, 4),
                        avg_forecast_mw=round(avg_fc, 4),
                        avg_actual_mw=round(avg_act, 4),
                        overforecast_count=over_c,
                        underforecast_count=under_c,
                    )
                )

        return HourlyAccuracyResponse(
            items=items,
            pagination=pagination,
            hour_of_day_summary=hour_of_day_summary,
        )

    async def get_forecasts(
        self,
        delivery_date_from: date | None = None,
        delivery_date_to: date | None = None,
        delivery_hour: int | None = None,
        selected_only: bool = True,
        sort_by: str = "delivery_hour_utc",
        order: str = "asc",
        page: int = 1,
        page_size: int = 50,
    ) -> ForecastListResponse:
        """Query WINDFOR forecast records with publication lineage and eligibility."""
        bounds = await self.eval_repo.get_evaluation_window_bounds()
        if bounds is None or bounds["total_evaluations"] == 0:
            return ForecastListResponse(
                items=[],
                pagination=PaginationMeta(
                    page=page,
                    page_size=page_size,
                    total_items=0,
                    total_pages=0,
                    has_next=False,
                    has_previous=False,
                ),
            )

        min_avail_date = self._to_local(bounds["min_delivery_utc"]).date()
        max_avail_date = self._to_local(bounds["max_delivery_utc"]).date()

        start_date = delivery_date_from or min_avail_date
        end_date = delivery_date_to or max_avail_date

        if start_date > end_date:
            raise ValueError("delivery_date_from must be less than or equal to delivery_date_to")

        start_utc, end_utc = self._local_date_window_to_utc(start_date, end_date)

        evals, total_items = await self.eval_repo.get_evaluations_paginated(
            start_utc=start_utc,
            end_utc=end_utc,
            hour_of_day=delivery_hour,
            sort_by=sort_by,
            order=order,
            page=page,
            page_size=page_size,
            include_relations=True,
        )

        delivery_hours = [e.delivery_hour_utc for e in evals]
        batch_pubs: dict[datetime, list] = {}
        if not selected_only and delivery_hours:
            batch_pubs = await self.raw_fc_repo.get_publications_for_delivery_hours_batch(delivery_hours)

        items: list[ForecastItem] = []
        for e in evals:
            local_day = self._to_local(e.delivery_hour_utc).date()
            sel_pub_time = (
                e.forecast_record.publish_time_utc if e.forecast_record is not None else None
            )

            pubs_list: list[PublicationVersion] | None = None
            if not selected_only:
                all_pubs = batch_pubs.get(e.delivery_hour_utc, [])
                pubs_list = []
                prev_mw: float | None = None
                for p in all_pubs:
                    lt_h = round((e.delivery_hour_utc - p.publish_time_utc).total_seconds() / 3600.0, 2)
                    is_elig = p.publish_time_utc <= e.decision_cutoff_utc
                    is_sel = (p.publish_time_utc == sel_pub_time)
                    rev_mw = round(float(p.generation_mw) - prev_mw, 2) if prev_mw is not None else None
                    prev_mw = float(p.generation_mw)
                    pubs_list.append(
                        PublicationVersion(
                            id=p.id,
                            publish_time_utc=p.publish_time_utc,
                            lead_time_hours=lt_h,
                            forecast_mw=float(p.generation_mw),
                            revision_mw=rev_mw,
                            is_eligible=is_elig,
                            is_selected=is_sel,
                        )
                    )
                eligible_count = sum(1 for p in pubs_list if p.is_eligible)
            else:
                eligible_count = await self.raw_fc_repo.count_eligible_for_delivery_hour(
                    e.delivery_hour_utc, e.decision_cutoff_utc
                )

            status_str = "VALID"
            if e.forecast_generation_mw is None:
                status_str = "MISSING_FORECAST"
            elif e.actual_generation_mw is None:
                status_str = "MISSING_ACTUAL"

            items.append(
                ForecastItem(
                    id=e.id,
                    delivery_date=local_day,
                    delivery_hour_utc=e.delivery_hour_utc,
                    decision_date=e.decision_date,
                    decision_cutoff_utc=e.decision_cutoff_utc,
                    selected_publish_time_utc=sel_pub_time,
                    forecast_generation_mw=e.forecast_generation_mw,
                    actual_generation_mw=e.actual_generation_mw,
                    signed_error_mw=e.signed_error_mw,
                    absolute_error_mw=e.absolute_error_mw,
                    absolute_percentage_error=e.absolute_percentage_error,
                    is_overforecast=e.is_overforecast,
                    is_underforecast=e.is_underforecast,
                    eligible_forecast_count=eligible_count,
                    selection_status=status_str,
                    configuration_version=e.configuration_version,
                    metric_version=e.metric_version,
                    all_publications=pubs_list,
                )
            )

        total_pages = math.ceil(total_items / page_size) if total_items > 0 else 1
        pagination = PaginationMeta(
            page=page,
            page_size=page_size,
            total_items=total_items,
            total_pages=total_pages,
            has_next=page < total_pages,
            has_previous=page > 1,
        )

        return ForecastListResponse(items=items, pagination=pagination)

    async def get_data_health(
        self,
        delivery_date_from: date | None = None,
        delivery_date_to: date | None = None,
        severity: str | None = None,
        scheduler: object | None = None,
    ) -> DataHealthResponse:
        """Inspect data health, publication cycle cadence, and recorded anomalies."""
        bounds = await self.eval_repo.get_evaluation_window_bounds()
        min_avail_date = (
            self._to_local(bounds["min_delivery_utc"]).date() if bounds else date.today()
        )
        max_avail_date = (
            self._to_local(bounds["max_delivery_utc"]).date() if bounds else date.today()
        )

        start_date = delivery_date_from or min_avail_date
        end_date = delivery_date_to or max_avail_date

        start_utc, end_utc = self._local_date_window_to_utc(start_date, end_date)

        # Expected hours across local days
        curr = start_date
        expected_hours = 0
        while curr <= end_date:
            expected_hours += self._expected_hours_for_date(curr)
            curr += timedelta(days=1)

        evals = await self.eval_repo.get_evaluations_for_range(start_utc, end_utc)
        available_hours = len(evals)

        missing_fc = sum(1 for e in evals if e.forecast_generation_mw is None)
        missing_act = sum(1 for e in evals if e.actual_generation_mw is None)
        unaccounted = max(0, expected_hours - available_hours)
        missing_fc += unaccounted
        missing_act += unaccounted

        coverage_pct = (
            round((available_hours / expected_hours) * 100.0, 2) if expected_hours > 0 else 0.0
        )
        is_fully_evaluated = (
            (available_hours == expected_hours) and (missing_fc == 0) and (missing_act == 0)
        )

        # Ingestion run status by dataset
        fc_latest = await self.ingestion_repo.get_latest_run("WINDFOR")
        act_latest = await self.ingestion_repo.get_latest_run("FUELHH")
        fc_total = await self.raw_fc_repo.count_total()
        act_total = await self.raw_act_repo.count_total()

        datasets_health = {
            "WINDFOR": DatasetHealthDetail(
                latest_successful_ingestion_utc=fc_latest.completed_at if fc_latest else None,
                latest_ingestion_status=fc_latest.status if fc_latest else "UNKNOWN",
                total_records=fc_total,
                records_fetched=fc_latest.records_fetched if fc_latest else 0,
                records_inserted=fc_latest.records_inserted if fc_latest else 0,
                records_already_present=fc_latest.records_already_present if fc_latest else 0,
                records_rejected=fc_latest.records_rejected if fc_latest else 0,
            ),
            "FUELHH": DatasetHealthDetail(
                latest_successful_ingestion_utc=act_latest.completed_at if act_latest else None,
                latest_ingestion_status=act_latest.status if act_latest else "UNKNOWN",
                total_records=act_total,
                records_fetched=act_latest.records_fetched if act_latest else 0,
                records_inserted=act_latest.records_inserted if act_latest else 0,
                records_already_present=act_latest.records_already_present if act_latest else 0,
                records_rejected=act_latest.records_rejected if act_latest else 0,
            ),
        }

        # Publication cycle stats (based on day-ahead decision period: start - 1 day to end - 1 day)
        pub_start_utc = (
            datetime.combine(start_date - timedelta(days=1), time(0, 0, 0), tzinfo=self.tz)
        ).astimezone(UTC)
        pub_end_utc = (
            datetime.combine(end_date - timedelta(days=1), time(23, 59, 59), tzinfo=self.tz)
        ).astimezone(UTC)
        cycle_stats = await self.raw_fc_repo.get_publication_cycle_stats(pub_start_utc, pub_end_utc)
        pub_health = PublicationCycleHealth(
            total_publication_cycles_observed=int(cycle_stats["total_cycles"]),
            average_cycles_per_day=float(cycle_stats["avg_cycles_per_day"]),
            min_cycles_per_day=int(cycle_stats["min_cycles_per_day"]),
            max_cycles_per_day=int(cycle_stats["max_cycles_per_day"]),
        )

        # Data quality events
        sev_counts = await self.dq_repo.get_counts_by_severity()
        recent_events_models = await self.dq_repo.list_recent_events(limit=50, severity=severity)
        recent_events = [
            QualityEventItem(
                id=ev.id,
                dataset=ev.dataset,
                event_type=ev.event_type,
                severity=ev.severity,
                description=ev.description,
                affected_timestamp=ev.affected_timestamp,
                details=ev.details,
                created_at=ev.created_at,
            )
            for ev in recent_events_models
        ]

        # Overall integrity score and health status
        data_integrity_score = 100.0
        if expected_hours > 0:
            bad_hours = missing_fc + missing_act
            data_integrity_score = max(
                0.0, round(((expected_hours - bad_hours) / expected_hours) * 100.0, 2)
            )

        health_status = "HEALTHY"
        if data_integrity_score < 95.0 or sev_counts.get("CRITICAL", 0) > 0:
            health_status = "UNHEALTHY"
        elif data_integrity_score < 99.0 or sev_counts.get("ERROR", 0) > 0:
            health_status = "DEGRADED"

        summary = DataHealthSummary(
            total_delivery_hours_evaluated=available_hours,
            missing_actual_hours=missing_act,
            missing_forecast_hours=missing_fc,
            incomplete_hourly_actual_pairs=0,
            half_hourly_spacing_violations=0,
            null_generation_readings=0,
            duplicate_keys_detected=0,
            expected_delivery_hours=expected_hours,
            available_delivery_hours=available_hours,
            evaluation_coverage_pct=coverage_pct,
            is_fully_evaluated=is_fully_evaluated,
        )

        if scheduler is not None and hasattr(scheduler, "get_health_detail"):
            scheduler_health = scheduler.get_health_detail()
        else:
            scheduler_health = SchedulerHealthDetail(
                status="STOPPED" if self.settings.SCHEDULER_ENABLED else "DISABLED",
                is_leader=False,
                enabled=self.settings.SCHEDULER_ENABLED,
                jobs={},
            )

        return DataHealthResponse(
            health_status=health_status,
            data_integrity_score=data_integrity_score,
            summary=summary,
            datasets=datasets_health,
            publication_cycle_health=pub_health,
            quality_events_by_severity=sev_counts,
            recent_quality_events=recent_events,
            scheduler=scheduler_health,
        )

    # =========================================================================
    # Phase 3.3 Forecast Explorer Analytics Methods
    # =========================================================================

    async def get_single_delivery_hour_publications(
        self,
        delivery_hour_utc: datetime,
    ) -> SingleDeliveryHourPublicationResponse:
        """Fetch all publications, decision cutoff, and actual generation for a single delivery hour."""
        if delivery_hour_utc.tzinfo is None:
            delivery_hour_utc = delivery_hour_utc.replace(tzinfo=UTC)

        # 1. Look up evaluation record (for cutoff and selected forecast)
        eval_record = await self.eval_repo.get_by_delivery_hour(delivery_hour_utc, include_relations=True)
        if eval_record is None:
            london_dt = self._to_local(delivery_hour_utc)
            d_minus_1 = (london_dt - timedelta(days=1)).date()
            cutoff_local = datetime.combine(d_minus_1, time(9, 0), tzinfo=self.tz)
            decision_cutoff_utc = cutoff_local.astimezone(UTC)
            selected_id = None
            selected_publish_time = None
        else:
            decision_cutoff_utc = eval_record.decision_cutoff_utc
            selected_id = eval_record.forecast_record_id
            selected_publish_time = (
                eval_record.forecast_record.publish_time_utc
                if eval_record.forecast_record is not None
                else None
            )

        # 2. Look up actual generation and half-hour settlement readings
        actual_obj = await self.hourly_act_repo.get_by_delivery_hour(delivery_hour_utc)
        actual_mw = float(actual_obj.generation_mw) if actual_obj is not None else None
        actual_status = "VALID" if actual_mw is not None else "MISSING_ACTUAL"

        r_00, r_30 = await self.raw_act_repo.get_half_hourly_pair(delivery_hour_utc)
        settlement_readings: list[HalfHourReadingTrace] = []
        if r_00 is not None:
            settlement_readings.append(
                HalfHourReadingTrace(
                    settlement_period=r_00.settlement_period,
                    start_time_utc=r_00.source_start_time_utc,
                    generation_mw=float(r_00.generation_mw),
                )
            )
        if r_30 is not None:
            settlement_readings.append(
                HalfHourReadingTrace(
                    settlement_period=r_30.settlement_period,
                    start_time_utc=r_30.source_start_time_utc,
                    generation_mw=float(r_30.generation_mw),
                )
            )

        # 3. Fetch all raw forecast records for this delivery hour
        raw_pubs = await self.raw_fc_repo.get_publication_versions_for_delivery_hour(delivery_hour_utc)

        # 4. Process publications in chronological order
        pub_versions: list[PublicationVersion] = []
        prev_mw: float | None = None
        eligible_count = 0
        forward_count = 0

        for p in raw_pubs:
            p_time = p.publish_time_utc if p.publish_time_utc.tzinfo is not None else p.publish_time_utc.replace(tzinfo=UTC)
            lt_hours = round((delivery_hour_utc - p_time).total_seconds() / 3600.0, 2)
            is_elig = p_time <= decision_cutoff_utc
            if is_elig:
                eligible_count += 1
            if lt_hours > 0:
                forward_count += 1

            rev_mw = round(float(p.generation_mw) - prev_mw, 2) if prev_mw is not None else None
            prev_mw = float(p.generation_mw)

            is_sel = (p.id == selected_id) if selected_id else (p_time == selected_publish_time)

            pub_versions.append(
                PublicationVersion(
                    id=p.id,
                    publish_time_utc=p_time,
                    lead_time_hours=lt_hours,
                    forecast_mw=round(float(p.generation_mw), 2),
                    revision_mw=rev_mw,
                    is_eligible=is_elig,
                    is_selected=is_sel,
                )
            )

        london_dt = self._to_local(delivery_hour_utc)

        return SingleDeliveryHourPublicationResponse(
            delivery_hour_utc=delivery_hour_utc,
            delivery_date_london=london_dt.date(),
            hour_of_day_london=london_dt.hour,
            decision_cutoff_utc=decision_cutoff_utc,
            selected_forecast_id=selected_id,
            selected_publish_time_utc=selected_publish_time,
            actual_generation_mw=actual_mw,
            actual_data_status=actual_status,
            settlement_readings=settlement_readings,
            total_publications=len(pub_versions),
            forward_publications=forward_count,
            eligible_publications=eligible_count,
            publications=pub_versions,
        )

    async def get_multi_horizon_analysis(
        self,
        delivery_date_from: date | None = None,
        delivery_date_to: date | None = None,
        mode: HorizonMode = HorizonMode.MATCHED,
    ) -> MultiHorizonResponse:
        """Evaluate forecast accuracy across 6 standardized horizons."""
        bounds = await self.eval_repo.get_evaluation_window_bounds()
        min_avail_date = self._to_local(bounds["min_delivery_utc"]).date() if bounds and bounds.get("min_delivery_utc") else date(2026, 1, 2)
        max_avail_date = self._to_local(bounds["max_delivery_utc"]).date() if bounds and bounds.get("max_delivery_utc") else date(2026, 2, 1)

        start_date = delivery_date_from or min_avail_date
        end_date = delivery_date_to or max_avail_date
        if start_date > end_date:
            raise ValueError("delivery_date_from must be less than or equal to delivery_date_to")

        start_utc, end_utc = self._local_date_window_to_utc(start_date, end_date)

        rows, evaluated_hours, common_matched_hours = await self.raw_fc_repo.get_multi_horizon_aggregates(
            start_utc=start_utc,
            end_utc=end_utc,
            mode=mode.value,
        )

        bucket_defs = {
            "Very Short (0-6h)": {
                "min": 0.0, "max": 6.0, "target": 3.0, "semantics": "Open on both ends: (0.0, 6.0)"
            },
            "Short (6-12h)": {
                "min": 6.0, "max": 12.0, "target": 9.0, "semantics": "Half-open: [6.0, 12.0)"
            },
            "Same-Day (12-24h)": {
                "min": 12.0, "max": 24.0, "target": 18.0, "semantics": "Half-open: [12.0, 24.0)"
            },
            "Day-Ahead (24-36h)": {
                "min": 24.0, "max": 36.0, "target": 30.0, "semantics": "Half-open: [24.0, 36.0)"
            },
            "D-2 Early (36-48h)": {
                "min": 36.0, "max": 48.0, "target": 42.0, "semantics": "Half-open: [36.0, 48.0)"
            },
            "Medium-Range (48-72h)": {
                "min": 48.0, "max": 72.0, "target": 60.0, "semantics": "Closed on both ends: [48.0, 72.0]"
            },
        }

        cal_days = (end_date - start_date).days + 1
        total_possible_hours = cal_days * 24

        buckets: list[HorizonBucketStats] = []
        rows_by_name = {r["bucket_name"]: r for r in rows}

        for b_name, b_meta in bucket_defs.items():
            r = rows_by_name.get(b_name)
            if r:
                obs_cnt = r["obs_count"]
                u_hours = r["unique_hours"]
                cov_pct = round((u_hours / total_possible_hours * 100.0), 2) if total_possible_hours > 0 else 0.0
                buckets.append(
                    HorizonBucketStats(
                        horizon_bucket=b_name,
                        lead_time_min_hours=b_meta["min"],
                        lead_time_max_hours=b_meta["max"],
                        boundary_semantics=b_meta["semantics"],
                        target_lead_time_hours=b_meta["target"],
                        avg_actual_lead_time_hours=float(r["avg_actual_lead_time"]),
                        observation_count=obs_cnt,
                        unique_delivery_hours=u_hours,
                        hour_coverage_pct=cov_pct,
                        mae_mw=float(r["mae_mw"]),
                        rmse_mw=float(r["rmse_mw"]),
                        bias_mw=float(r["bias_mw"]),
                        mape_pct=float(r["mape_pct"]) if r["mape_pct"] is not None else None,
                    )
                )
            else:
                buckets.append(
                    HorizonBucketStats(
                        horizon_bucket=b_name,
                        lead_time_min_hours=b_meta["min"],
                        lead_time_max_hours=b_meta["max"],
                        boundary_semantics=b_meta["semantics"],
                        target_lead_time_hours=b_meta["target"],
                        avg_actual_lead_time_hours=b_meta["target"],
                        observation_count=0,
                        unique_delivery_hours=0,
                        hour_coverage_pct=0.0,
                        mae_mw=0.0,
                        rmse_mw=0.0,
                        bias_mw=0.0,
                        mape_pct=None,
                    )
                )

        overall_cov = round((evaluated_hours / total_possible_hours * 100.0), 2) if total_possible_hours > 0 else 0.0

        med_range = next((b for b in buckets if "48-72h" in b.horizon_bucket and b.observation_count > 0), None)
        very_short = next((b for b in buckets if "0-6h" in b.horizon_bucket and b.observation_count > 0), None)
        convergence_pct: float | None = None
        if med_range and very_short and med_range.mae_mw > 0:
            convergence_pct = round(((med_range.mae_mw - very_short.mae_mw) / med_range.mae_mw * 100.0), 2)

        return MultiHorizonResponse(
            delivery_date_from=start_date,
            delivery_date_to=end_date,
            analysis_mode=mode.value,
            total_delivery_hours_in_period=total_possible_hours,
            evaluated_delivery_hours=evaluated_hours,
            common_matched_hours=common_matched_hours,
            overall_coverage_pct=overall_cov,
            proven_convergence_improvement_pct=convergence_pct,
            buckets=buckets,
        )

    async def get_revision_analytics(
        self,
        delivery_date_from: date | None = None,
        delivery_date_to: date | None = None,
        min_abs_revision_mw: float = 500.0,
    ) -> RevisionAnalyticsResponse:
        """Compute revision stability, upward/downward counts, diurnal heatmap, and extreme swings."""
        bounds = await self.eval_repo.get_evaluation_window_bounds()
        min_avail_date = self._to_local(bounds["min_delivery_utc"]).date() if bounds and bounds.get("min_delivery_utc") else date(2026, 1, 2)
        max_avail_date = self._to_local(bounds["max_delivery_utc"]).date() if bounds and bounds.get("max_delivery_utc") else date(2026, 2, 1)

        start_date = delivery_date_from or min_avail_date
        end_date = delivery_date_to or max_avail_date
        if start_date > end_date:
            raise ValueError("delivery_date_from must be less than or equal to delivery_date_to")

        start_utc, end_utc = self._local_date_window_to_utc(start_date, end_date)

        summary, top_revs, diurnal_rows, rev_values = await self.raw_fc_repo.get_revision_analytics(
            start_utc=start_utc,
            end_utc=end_utc,
        )

        total_revs = summary.get("total_revisions", 0)
        up_cnt = summary.get("upward_count", 0)
        down_cnt = summary.get("downward_count", 0)
        unchanged_cnt = summary.get("unchanged_count", 0)

        up_pct = round((up_cnt / total_revs * 100.0), 2) if total_revs > 0 else 0.0
        down_pct = round((down_cnt / total_revs * 100.0), 2) if total_revs > 0 else 0.0
        unchanged_pct = round((unchanged_cnt / total_revs * 100.0), 2) if total_revs > 0 else 0.0

        bin_width = 250.0
        min_bin = -2500.0
        max_bin = 2500.0
        num_bins = int((max_bin - min_bin) / bin_width)
        bin_counts = [0] * num_bins

        for val in rev_values:
            if val < min_bin:
                bin_counts[0] += 1
            elif val >= max_bin:
                bin_counts[-1] += 1
            else:
                idx = int((val - min_bin) / bin_width)
                if 0 <= idx < num_bins:
                    bin_counts[idx] += 1

        histogram_bins: list[RevisionDistributionBin] = []
        for i in range(num_bins):
            b_start = min_bin + i * bin_width
            b_end = b_start + bin_width
            b_center = b_start + bin_width / 2.0
            histogram_bins.append(
                RevisionDistributionBin(
                    bin_center_mw=round(b_center, 1),
                    bin_start_mw=round(b_start, 1),
                    bin_end_mw=round(b_end, 1),
                    count=bin_counts[i],
                )
            )

        top_items: list[ExtremeRevisionItem] = []
        for r in top_revs:
            dh_local = self._to_local(r["delivery_hour_utc"])
            top_items.append(
                ExtremeRevisionItem(
                    raw_forecast_id=r["raw_forecast_id"],
                    delivery_hour_utc=r["delivery_hour_utc"],
                    delivery_date_london=dh_local.date(),
                    hour_of_day_london=dh_local.hour,
                    publish_time_utc=r["publish_time_utc"],
                    previous_publish_time_utc=r["previous_publish_time_utc"],
                    lead_time_hours=float(r["lead_time_hours"]),
                    previous_forecast_mw=float(r["previous_forecast_mw"]),
                    revised_forecast_mw=float(r["revised_forecast_mw"]),
                    revision_mw=float(r["revision_mw"]),
                    abs_revision_mw=float(r["abs_revision_mw"]),
                    cycle_gap_hours=float(r["cycle_gap_hours"]),
                    is_discontinuous=bool(r["is_discontinuous"]),
                )
            )

        diurnal_cells = [
            DiurnalRevisionCell(
                hour_of_day_london=d["hour_of_day_london"],
                horizon_bucket=d["horizon_bucket"],
                mean_abs_revision_mw=float(d["mean_abs_revision_mw"]),
                revision_count=d["revision_count"],
            )
            for d in diurnal_rows
        ]

        return RevisionAnalyticsResponse(
            delivery_date_from=start_date,
            delivery_date_to=end_date,
            forward_only_revisions=total_revs,
            mean_signed_revision_mw=float(summary.get("mean_signed_revision", 0.0) or 0.0),
            mean_absolute_revision_mw=float(summary.get("mean_abs_revision", 0.0) or 0.0),
            upward_count=up_cnt,
            upward_pct=up_pct,
            downward_count=down_cnt,
            downward_pct=down_pct,
            unchanged_count=unchanged_cnt,
            unchanged_pct=unchanged_pct,
            cycle_gap_max_hours=float(summary.get("cycle_gap_max_hours", 0.0) or 0.0),
            discontinuous_gap_count=int(summary.get("discontinuous_count", 0) or 0),
            histogram=histogram_bins,
            top_revisions=top_items,
            diurnal_revision_heatmap=diurnal_cells,
        )
