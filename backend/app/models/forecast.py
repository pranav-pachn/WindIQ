"""Raw forecast records preserving all WINDFOR publication runs."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class RawForecastRecord(Base):
    """Stores all WINDFOR forecast records.

    Composite key (publish_time_utc, delivery_hour_utc) preserves all historical
    publication cycles without overwriting or deduplicating by delivery_hour alone.
    """

    __tablename__ = "raw_forecast_records"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    publish_time_utc: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    delivery_hour_utc: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    generation_mw: Mapped[float] = mapped_column(Numeric(12, 4, asdecimal=False), nullable=False)
    source_dataset: Mapped[str] = mapped_column(String(32), default="WINDFOR", nullable=False)
    ingestion_run_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ingestion_runs.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint(
            "publish_time_utc",
            "delivery_hour_utc",
            name="uq_raw_forecast_pub_del",
        ),
        CheckConstraint(
            "generation_mw >= 0.0",
            name="chk_raw_forecast_generation_non_negative",
        ),
        Index("idx_raw_forecast_delivery_publish", "delivery_hour_utc", "publish_time_utc"),
        Index("idx_raw_forecast_publish_time", "publish_time_utc"),
    )
