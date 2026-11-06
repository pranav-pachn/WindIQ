"""Repository for EvaluationConfiguration and ForecastEvaluation operations."""

import math
from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.actual import HourlyActual
from app.models.evaluation import EvaluationConfiguration, ForecastEvaluation
from app.models.forecast import RawForecastRecord


class EvaluationRepository:
    """Asynchronous repository for market decision evaluation configurations and results."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_or_create_configuration(
        self,
        configuration_name: str = "National_DayAhead_0900",
        timezone: str = "Europe/London",
        cutoff_hour: int = 9,
        cutoff_minute: int = 0,
        metric_version: str = "v1.0",
        configuration_version: int = 1,
    ) -> EvaluationConfiguration:
        """Fetch existing configuration or insert new version."""
        stmt = select(EvaluationConfiguration).where(
            EvaluationConfiguration.configuration_name == configuration_name,
            EvaluationConfiguration.configuration_version == configuration_version,
        )
        result = await self.session.execute(stmt)
        cfg = result.scalar_one_or_none()
        if cfg is not None:
            return cfg

        cfg = EvaluationConfiguration(
            configuration_name=configuration_name,
            timezone=timezone,
            cutoff_hour=cutoff_hour,
            cutoff_minute=cutoff_minute,
            metric_version=metric_version,
            configuration_version=configuration_version,
            created_at=datetime.now(UTC),
        )
        self.session.add(cfg)
        await self.session.flush()
        return cfg

    async def get_latest_configuration(self) -> EvaluationConfiguration | None:
        """Fetch the most recently created or active EvaluationConfiguration."""
        stmt = (
            select(EvaluationConfiguration)
            .order_by(
                EvaluationConfiguration.configuration_version.desc(),
                EvaluationConfiguration.id.desc(),
            )
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_evaluation(
        self,
        delivery_hour_utc: datetime,
        configuration_id: int,
    ) -> ForecastEvaluation | None:
        """Fetch evaluation by delivery hour and configuration."""
        stmt = select(ForecastEvaluation).where(
            ForecastEvaluation.delivery_hour_utc == delivery_hour_utc,
            ForecastEvaluation.evaluation_configuration_id == configuration_id,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_delivery_hour(
        self,
        delivery_hour_utc: datetime,
        include_relations: bool = True,
    ) -> ForecastEvaluation | None:
        """Fetch evaluation for a delivery hour with relations loaded."""
        stmt = (
            select(ForecastEvaluation)
            .where(ForecastEvaluation.delivery_hour_utc == delivery_hour_utc)
            .order_by(ForecastEvaluation.id.desc())
            .limit(1)
        )
        if include_relations:
            stmt = stmt.options(
                selectinload(ForecastEvaluation.forecast_record),
                selectinload(ForecastEvaluation.hourly_actual),
            )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def create_or_get_evaluation(
        self,
        decision_date: date,
        decision_cutoff_utc: datetime,
        delivery_hour_utc: datetime,
        configuration: EvaluationConfiguration,
        forecast_record: RawForecastRecord | None,
        hourly_actual: HourlyActual | None,
    ) -> tuple[ForecastEvaluation, bool]:
        """Create or return existing ForecastEvaluation enforcing exact error arithmetic.

        Returns:
            Tuple of (ForecastEvaluation, created_bool)
        """
        existing = await self.get_evaluation(delivery_hour_utc, configuration.id)
        if existing is not None:
            return existing, False

        fc_gen = (
            round(float(forecast_record.generation_mw), 4) if forecast_record is not None else None
        )
        act_gen = (
            round(float(hourly_actual.generation_mw), 4) if hourly_actual is not None else None
        )

        signed_err: float | None = None
        abs_err: float | None = None
        pct_err: float | None = None
        is_over: bool | None = None
        is_under: bool | None = None

        if fc_gen is not None and act_gen is not None:
            signed_err = round(fc_gen - act_gen, 4)
            abs_err = round(abs(signed_err), 4)

            # Strict zero-actual policy: division by zero undefined -> NULL
            if act_gen <= 0.0:
                pct_err = None
            else:
                pct_err = round((abs_err / act_gen) * 100.0, 4)

            if signed_err > 0:
                is_over = True
                is_under = False
            elif signed_err < 0:
                is_over = False
                is_under = True
            else:
                is_over = False
                is_under = False

        eval_rec = ForecastEvaluation(
            forecast_record_id=forecast_record.id if forecast_record else None,
            hourly_actual_id=hourly_actual.id if hourly_actual else None,
            evaluation_configuration_id=configuration.id,
            decision_date=decision_date,
            decision_cutoff_utc=decision_cutoff_utc,
            delivery_hour_utc=delivery_hour_utc,
            forecast_generation_mw=fc_gen,
            actual_generation_mw=act_gen,
            signed_error_mw=signed_err,
            absolute_error_mw=abs_err,
            absolute_percentage_error=pct_err,
            configuration_version=configuration.configuration_version,
            metric_version=configuration.metric_version,
            is_overforecast=is_over,
            is_underforecast=is_under,
            created_at=datetime.now(UTC),
        )
        self.session.add(eval_rec)
        await self.session.flush()
        return eval_rec, True

    async def get_evaluations_for_range(
        self,
        start_utc: datetime,
        end_utc: datetime,
        configuration_id: int | None = None,
        include_relations: bool = False,
    ) -> list[ForecastEvaluation]:
        """Fetch evaluations for a range ordered chronologically."""
        stmt = (
            select(ForecastEvaluation)
            .where(
                ForecastEvaluation.delivery_hour_utc >= start_utc,
                ForecastEvaluation.delivery_hour_utc <= end_utc,
            )
            .order_by(ForecastEvaluation.delivery_hour_utc.asc())
        )
        if configuration_id is not None:
            stmt = stmt.where(ForecastEvaluation.evaluation_configuration_id == configuration_id)

        if include_relations:
            stmt = stmt.options(
                selectinload(ForecastEvaluation.forecast_record),
                selectinload(ForecastEvaluation.hourly_actual).selectinload(
                    HourlyActual.first_half_hour_record
                ),
                selectinload(ForecastEvaluation.hourly_actual).selectinload(
                    HourlyActual.second_half_hour_record
                ),
            )

        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_evaluations_paginated(
        self,
        start_utc: datetime | None = None,
        end_utc: datetime | None = None,
        hour_of_day: int | None = None,
        status: str | None = None,
        configuration_id: int | None = None,
        sort_by: str = "delivery_hour_utc",
        order: str = "asc",
        page: int = 1,
        page_size: int = 50,
        include_relations: bool = False,
    ) -> tuple[list[ForecastEvaluation], int]:
        """Fetch filtered and paginated evaluations with total count."""
        base_where = []
        if start_utc is not None:
            base_where.append(ForecastEvaluation.delivery_hour_utc >= start_utc)
        if end_utc is not None:
            base_where.append(ForecastEvaluation.delivery_hour_utc <= end_utc)
        if configuration_id is not None:
            base_where.append(ForecastEvaluation.evaluation_configuration_id == configuration_id)

        if status == "VALID":
            base_where.append(ForecastEvaluation.forecast_generation_mw.isnot(None))
            base_where.append(ForecastEvaluation.actual_generation_mw.isnot(None))
        elif status == "MISSING_FORECAST":
            base_where.append(ForecastEvaluation.forecast_generation_mw.is_(None))
        elif status == "MISSING_ACTUAL":
            base_where.append(ForecastEvaluation.actual_generation_mw.is_(None))

        # Hour of day filter (Europe/London local hour)
        if hour_of_day is not None:
            base_where.append(
                func.extract("hour", func.timezone("Europe/London", ForecastEvaluation.delivery_hour_utc)) == hour_of_day
            )

        # Count total
        count_stmt = select(func.count(ForecastEvaluation.id)).where(*base_where)
        count_res = await self.session.execute(count_stmt)
        total_items = count_res.scalar_one()

        # Build order
        sort_col = getattr(ForecastEvaluation, sort_by, ForecastEvaluation.delivery_hour_utc)
        order_clause = sort_col.desc() if order.lower() == "desc" else sort_col.asc()

        offset = (page - 1) * page_size
        items_stmt = (
            select(ForecastEvaluation)
            .where(*base_where)
            .order_by(order_clause)
            .limit(page_size)
            .offset(offset)
        )

        if include_relations:
            items_stmt = items_stmt.options(
                selectinload(ForecastEvaluation.forecast_record),
                selectinload(ForecastEvaluation.hourly_actual).selectinload(
                    HourlyActual.first_half_hour_record
                ),
                selectinload(ForecastEvaluation.hourly_actual).selectinload(
                    HourlyActual.second_half_hour_record
                ),
            )

        items_res = await self.session.execute(items_stmt)
        return list(items_res.scalars().all()), total_items

    async def get_evaluation_window_bounds(
        self,
        configuration_id: int | None = None,
    ) -> dict[str, Any] | None:
        """Find minimum and maximum delivery and decision dates in the evaluations table."""
        stmt = select(
            func.min(ForecastEvaluation.delivery_hour_utc),
            func.max(ForecastEvaluation.delivery_hour_utc),
            func.min(ForecastEvaluation.decision_date),
            func.max(ForecastEvaluation.decision_date),
            func.count(ForecastEvaluation.id),
        )
        if configuration_id is not None:
            stmt = stmt.where(ForecastEvaluation.evaluation_configuration_id == configuration_id)

        res = await self.session.execute(stmt)
        row = res.one_or_none()
        if not row or row[0] is None:
            return None

        return {
            "min_delivery_utc": row[0],
            "max_delivery_utc": row[1],
            "min_decision_date": row[2],
            "max_decision_date": row[3],
            "total_evaluations": row[4],
        }

    async def calculate_kpis(
        self,
        start_utc: datetime,
        end_utc: datetime,
        configuration_id: int | None = None,
    ) -> dict:
        """Compute verified summary KPIs across evaluations in the given horizon."""
        evals = await self.get_evaluations_for_range(start_utc, end_utc, configuration_id)
        valid = [
            e
            for e in evals
            if e.forecast_generation_mw is not None and e.actual_generation_mw is not None
        ]

        count = len(valid)
        if count == 0:
            return {
                "count": 0,
                "mae_mw": 0.0,
                "rmse_mw": 0.0,
                "mape_pct": 0.0,
                "mape_denominator": 0,
                "bias_mw": 0.0,
                "overforecast_count": 0,
                "underforecast_count": 0,
                "zero_error_count": 0,
                "avg_forecast_mw": 0.0,
                "avg_actual_mw": 0.0,
            }

        abs_errors = [e.absolute_error_mw for e in valid if e.absolute_error_mw is not None]
        signed_errors = [e.signed_error_mw for e in valid if e.signed_error_mw is not None]
        pct_errors = [
            e.absolute_percentage_error for e in valid if e.absolute_percentage_error is not None
        ]

        mae = sum(abs_errors) / count
        rmse = math.sqrt(sum(err**2 for err in signed_errors) / count)
        mape = (sum(pct_errors) / len(pct_errors)) if pct_errors else 0.0
        bias = sum(signed_errors) / count

        over_count = sum(1 for e in valid if e.is_overforecast is True)
        under_count = sum(1 for e in valid if e.is_underforecast is True)
        zero_count = sum(1 for e in valid if e.signed_error_mw == 0.0)

        fc_vals = [e.forecast_generation_mw for e in valid if e.forecast_generation_mw is not None]
        act_vals = [e.actual_generation_mw for e in valid if e.actual_generation_mw is not None]
        avg_fc = (sum(fc_vals) / len(fc_vals)) if fc_vals else 0.0
        avg_act = (sum(act_vals) / len(act_vals)) if act_vals else 0.0

        return {
            "count": count,
            "mae_mw": round(mae, 4),
            "rmse_mw": round(rmse, 4),
            "mape_pct": round(mape, 4),
            "mape_denominator": len(pct_errors),
            "bias_mw": round(bias, 4),
            "overforecast_count": over_count,
            "underforecast_count": under_count,
            "zero_error_count": zero_count,
            "avg_forecast_mw": round(avg_fc, 4),
            "avg_actual_mw": round(avg_act, 4),
        }
