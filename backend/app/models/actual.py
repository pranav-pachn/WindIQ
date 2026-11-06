"""Raw half-hourly FUELHH actual readings and normalized hourly actuals."""

import uuid
from datetime import UTC, date, datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    SmallInteger,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class RawActualRecord(Base):
    """Stores original FUELHH half-hourly wind generation settlement readings."""

    __tablename__ = "raw_actual_records"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    source_start_time_utc: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    settlement_date: Mapped[date] = mapped_column(Date, nullable=False)
    settlement_period: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    generation_mw: Mapped[float] = mapped_column(Numeric(12, 4, asdecimal=False), nullable=False)
    source_dataset: Mapped[str] = mapped_column(String(32), default="FUELHH", nullable=False)
    ingestion_run_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ingestion_runs.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("source_start_time_utc", name="uq_raw_actual_start_time"),
        CheckConstraint(
            "generation_mw >= 0.0",
            name="chk_raw_actual_generation_non_negative",
        ),
        CheckConstraint(
            "settlement_period BETWEEN 1 AND 50",
            name="chk_raw_actual_settlement_period",
        ),
        Index("idx_raw_actual_settlement", "settlement_date", "settlement_period"),
    )


class HourlyActual(Base):
    """Normalized hourly actual wind generation derived from exactly two half-hourly readings."""

    __tablename__ = "hourly_actuals"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    delivery_hour_utc: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    generation_mw: Mapped[float] = mapped_column(Numeric(12, 4, asdecimal=False), nullable=False)
    first_half_hour_record_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("raw_actual_records.id", ondelete="RESTRICT"),
        nullable=False,
    )
    second_half_hour_record_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("raw_actual_records.id", ondelete="RESTRICT"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    first_half_hour_record: Mapped[RawActualRecord] = relationship(
        "RawActualRecord", foreign_keys=[first_half_hour_record_id]
    )
    second_half_hour_record: Mapped[RawActualRecord] = relationship(
        "RawActualRecord", foreign_keys=[second_half_hour_record_id]
    )

    __table_args__ = (
        UniqueConstraint("delivery_hour_utc", name="uq_hourly_actuals_delivery_hour"),
        UniqueConstraint(
            "first_half_hour_record_id",
            name="uq_hourly_actuals_first_reading",
        ),
        UniqueConstraint(
            "second_half_hour_record_id",
            name="uq_hourly_actuals_second_reading",
        ),
        CheckConstraint(
            "first_half_hour_record_id <> second_half_hour_record_id",
            name="chk_hourly_actuals_distinct_readings",
        ),
        CheckConstraint(
            "generation_mw >= 0.0",
            name="chk_hourly_actuals_generation_non_negative",
        ),
        CheckConstraint(
            "EXTRACT(MINUTE FROM delivery_hour_utc AT TIME ZONE 'UTC') = 0 AND "
            "EXTRACT(SECOND FROM delivery_hour_utc AT TIME ZONE 'UTC') = 0",
            name="chk_hourly_actuals_on_the_hour",
        ),
    )


class HourlyActualReadingUsage(Base):
    """Enforces concurrent single-use of raw actual readings across all hourly aggregates."""

    __tablename__ = "hourly_actual_reading_usages"

    raw_actual_record_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("raw_actual_records.id", ondelete="RESTRICT"),
        primary_key=True,
    )
    hourly_actual_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("hourly_actuals.id", ondelete="CASCADE"),
        nullable=False,
    )
    position: Mapped[int] = mapped_column(SmallInteger, nullable=False)

    __table_args__ = (CheckConstraint("position IN (1, 2)", name="chk_hourly_usage_position"),)
