"""Evaluation configurations and traceable forecast evaluations."""

from datetime import UTC, date, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.actual import HourlyActual
from app.models.base import Base
from app.models.forecast import RawForecastRecord


class EvaluationConfiguration(Base):
    """Versioned market decision configuration (cutoff time, timezone, metric versions)."""

    __tablename__ = "evaluation_configurations"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    configuration_name: Mapped[str] = mapped_column(String(64), nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), default="Europe/London", nullable=False)
    cutoff_hour: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    cutoff_minute: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    metric_version: Mapped[str] = mapped_column(String(32), default="v1.0", nullable=False)
    configuration_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint(
            "configuration_name",
            "configuration_version",
            name="uq_eval_config_name_version",
        ),
        CheckConstraint("cutoff_hour BETWEEN 0 AND 23", name="chk_eval_config_cutoff_hour"),
        CheckConstraint("cutoff_minute BETWEEN 0 AND 59", name="chk_eval_config_cutoff_minute"),
    )


class ForecastEvaluation(Base):
    """Day-ahead forecast evaluations linked directly to source forecast and actual records."""

    __tablename__ = "forecast_evaluations"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    forecast_record_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("raw_forecast_records.id", ondelete="RESTRICT"),
        nullable=True,
    )
    hourly_actual_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("hourly_actuals.id", ondelete="RESTRICT"),
        nullable=True,
    )
    evaluation_configuration_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("evaluation_configurations.id", ondelete="RESTRICT"),
        nullable=False,
    )
    decision_date: Mapped[date] = mapped_column(Date, nullable=False)
    decision_cutoff_utc: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    delivery_hour_utc: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    forecast_generation_mw: Mapped[float | None] = mapped_column(
        Numeric(12, 4, asdecimal=False), nullable=True
    )
    actual_generation_mw: Mapped[float | None] = mapped_column(
        Numeric(12, 4, asdecimal=False), nullable=True
    )
    signed_error_mw: Mapped[float | None] = mapped_column(
        Numeric(12, 4, asdecimal=False), nullable=True
    )
    absolute_error_mw: Mapped[float | None] = mapped_column(
        Numeric(12, 4, asdecimal=False), nullable=True
    )
    absolute_percentage_error: Mapped[float | None] = mapped_column(
        Numeric(10, 4, asdecimal=False), nullable=True
    )
    configuration_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    metric_version: Mapped[str | None] = mapped_column(String(32), nullable=True)
    is_overforecast: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    is_underforecast: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    forecast_record: Mapped[RawForecastRecord | None] = relationship("RawForecastRecord")
    hourly_actual: Mapped[HourlyActual | None] = relationship("HourlyActual")
    configuration: Mapped[EvaluationConfiguration] = relationship("EvaluationConfiguration")

    __table_args__ = (
        UniqueConstraint(
            "delivery_hour_utc",
            "evaluation_configuration_id",
            name="uq_forecast_eval_delivery_config",
        ),
        CheckConstraint(
            "EXTRACT(MINUTE FROM delivery_hour_utc AT TIME ZONE 'UTC') = 0 AND "
            "EXTRACT(SECOND FROM delivery_hour_utc AT TIME ZONE 'UTC') = 0",
            name="chk_eval_on_the_hour",
        ),
        CheckConstraint(
            "signed_error_mw IS NULL OR (forecast_generation_mw IS NOT NULL AND "
            "actual_generation_mw IS NOT NULL AND "
            "ABS(signed_error_mw - (forecast_generation_mw - actual_generation_mw)) < 0.0001)",
            name="chk_eval_signed_error",
        ),
        CheckConstraint(
            "absolute_error_mw IS NULL OR (signed_error_mw IS NOT NULL AND "
            "ABS(absolute_error_mw - ABS(signed_error_mw)) < 0.0001)",
            name="chk_eval_absolute_error",
        ),
        CheckConstraint(
            "absolute_percentage_error IS NULL OR (actual_generation_mw IS NOT NULL AND "
            "actual_generation_mw > 0 AND absolute_error_mw IS NOT NULL AND "
            "ABS(absolute_percentage_error - "
            "((absolute_error_mw / actual_generation_mw) * 100.0)) <= 0.01)",
            name="chk_eval_percentage_error",
        ),
        CheckConstraint(
            "(is_overforecast IS NULL AND is_underforecast IS NULL) OR "
            "(signed_error_mw > 0 AND is_overforecast IS TRUE AND is_underforecast IS FALSE) OR "
            "(signed_error_mw < 0 AND is_overforecast IS FALSE AND is_underforecast IS TRUE) OR "
            "(signed_error_mw = 0 AND is_overforecast IS FALSE AND is_underforecast IS FALSE)",
            name="chk_eval_direction_flags",
        ),
        CheckConstraint(
            "actual_generation_mw > 0 OR absolute_percentage_error IS NULL",
            name="chk_eval_zero_actual_null_pct",
        ),
        CheckConstraint(
            "absolute_error_mw IS NULL OR absolute_error_mw >= 0.0",
            name="chk_eval_abs_error_non_negative",
        ),
        CheckConstraint(
            "absolute_percentage_error IS NULL OR absolute_percentage_error >= 0.0",
            name="chk_eval_pct_error_non_negative",
        ),
        Index("idx_forecast_eval_delivery_date", "delivery_hour_utc"),
        Index("idx_forecast_eval_decision_date", "decision_date"),
        Index("idx_forecast_eval_config", "evaluation_configuration_id"),
    )
