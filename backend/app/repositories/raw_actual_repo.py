"""Repository for RawActualRecord persistence and half-hourly retrieval."""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.actual import RawActualRecord


class RawActualRepository:
    """Asynchronous repository for FUELHH raw settlement actual records."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def upsert_batch(
        self,
        records: list[dict],
        ingestion_run_id: uuid.UUID | None = None,
    ) -> tuple[int, int]:
        """Idempotently insert raw actual records using ON CONFLICT DO NOTHING.

        Returns:
            Tuple of (inserted_count, already_present_count)
        """
        if not records:
            return 0, 0

        values_list = []
        for r in records:
            values_list.append(
                {
                    "source_start_time_utc": r["source_start_time_utc"],
                    "settlement_date": r["settlement_date"],
                    "settlement_period": r["settlement_period"],
                    "generation_mw": r["generation_mw"],
                    "source_dataset": r.get("source_dataset", "FUELHH"),
                    "ingestion_run_id": ingestion_run_id,
                    "created_at": datetime.now(UTC),
                }
            )

        stmt = (
            insert(RawActualRecord)
            .values(values_list)
            .on_conflict_do_nothing(
                constraint="uq_raw_actual_start_time",
            )
            .returning(RawActualRecord.id)
        )

        result = await self.session.execute(stmt)
        inserted_ids = result.scalars().all()
        inserted_count = len(inserted_ids)
        already_present_count = len(values_list) - inserted_count

        await self.session.flush()
        return inserted_count, already_present_count

    async def get_by_timestamp(
        self,
        source_start_time_utc: datetime,
    ) -> RawActualRecord | None:
        """Fetch raw reading by exact start time."""
        stmt = select(RawActualRecord).where(
            RawActualRecord.source_start_time_utc == source_start_time_utc
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_half_hourly_pair(
        self,
        delivery_hour_utc: datetime,
    ) -> tuple[RawActualRecord | None, RawActualRecord | None]:
        """Fetch the exact HH:00 and HH:30 raw readings required for an hourly aggregate."""
        time_00 = delivery_hour_utc
        time_30 = delivery_hour_utc + timedelta(minutes=30)

        stmt = (
            select(RawActualRecord)
            .where(RawActualRecord.source_start_time_utc.in_([time_00, time_30]))
            .order_by(RawActualRecord.source_start_time_utc.asc())
        )
        result = await self.session.execute(stmt)
        readings = list(result.scalars().all())

        r_00: RawActualRecord | None = None
        r_30: RawActualRecord | None = None
        for r in readings:
            if r.source_start_time_utc == time_00:
                r_00 = r
            elif r.source_start_time_utc == time_30:
                r_30 = r

        return r_00, r_30

    async def count_total(self) -> int:
        """Return total number of raw half-hourly actual records stored."""
        stmt = select(func.count(RawActualRecord.id))
        result = await self.session.execute(stmt)
        return result.scalar_one()
