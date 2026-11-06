"""Repository for normalized HourlyActual aggregate persistence and lookup."""

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.actual import HourlyActual, RawActualRecord


class HourlyActualRepository:
    """Asynchronous repository for normalized hourly actual wind generation."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_delivery_hour(
        self,
        delivery_hour_utc: datetime,
    ) -> HourlyActual | None:
        """Fetch hourly actual aggregate by delivery hour."""
        stmt = select(HourlyActual).where(HourlyActual.delivery_hour_utc == delivery_hour_utc)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def create_or_get_hourly_actual(
        self,
        delivery_hour_utc: datetime,
        first_record: RawActualRecord,
        second_record: RawActualRecord,
    ) -> tuple[HourlyActual, bool]:
        """Create a new HourlyActual aggregate from two distinct half-hourly readings.

        Enforces mathematical average: (first + second) / 2.0.
        If already present for delivery_hour_utc, returns existing record.

        Returns:
            Tuple of (HourlyActual, created_bool)
        """
        existing = await self.get_by_delivery_hour(delivery_hour_utc)
        if existing is not None:
            return existing, False

        avg_gen = round(float((first_record.generation_mw + second_record.generation_mw) / 2.0), 4)

        hourly = HourlyActual(
            delivery_hour_utc=delivery_hour_utc,
            generation_mw=avg_gen,
            first_half_hour_record_id=first_record.id,
            second_half_hour_record_id=second_record.id,
            created_at=datetime.now(UTC),
        )
        self.session.add(hourly)
        await self.session.flush()
        return hourly, True

    async def get_range(
        self,
        start_utc: datetime,
        end_utc: datetime,
    ) -> list[HourlyActual]:
        """Fetch all hourly actuals within a delivery window ordered chronologically."""
        stmt = (
            select(HourlyActual)
            .where(
                HourlyActual.delivery_hour_utc >= start_utc,
                HourlyActual.delivery_hour_utc < end_utc,
            )
            .order_by(HourlyActual.delivery_hour_utc.asc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
