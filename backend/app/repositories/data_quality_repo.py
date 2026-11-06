"""Repository for recording and querying DataQualityEvent anomalies."""

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_quality import DataQualityEvent


class DataQualityRepository:
    """Asynchronous repository for DataQualityEvent persistence."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def record_event(
        self,
        dataset: str,
        event_type: str,
        description: str,
        severity: str = "WARNING",
        affected_timestamp: datetime | None = None,
        details: dict[str, Any] | None = None,
        ingestion_run_id: uuid.UUID | None = None,
    ) -> DataQualityEvent:
        """Create and persist a single DataQualityEvent."""
        event = DataQualityEvent(
            ingestion_run_id=ingestion_run_id,
            dataset=dataset,
            event_type=event_type,
            severity=severity,
            description=description,
            affected_timestamp=affected_timestamp,
            details=details or {},
            created_at=datetime.now(UTC),
        )
        self.session.add(event)
        await self.session.flush()
        return event

    async def record_events_batch(
        self,
        events: list[DataQualityEvent],
    ) -> list[DataQualityEvent]:
        """Persist a collection of DataQualityEvents."""
        if not events:
            return []
        self.session.add_all(events)
        await self.session.flush()
        return events

    async def get_by_run_id(self, run_id: uuid.UUID) -> list[DataQualityEvent]:
        """Fetch all data quality events tied to a specific ingestion run."""
        stmt = (
            select(DataQualityEvent)
            .where(DataQualityEvent.ingestion_run_id == run_id)
            .order_by(DataQualityEvent.id.asc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_events_for_timestamp(
        self,
        affected_timestamp: datetime,
        dataset: str | None = None,
    ) -> list[DataQualityEvent]:
        """Fetch data quality events affecting a specific timestamp."""
        stmt = select(DataQualityEvent).where(
            DataQualityEvent.affected_timestamp == affected_timestamp
        )
        if dataset:
            stmt = stmt.where(DataQualityEvent.dataset == dataset)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_counts_by_severity(
        self,
        dataset: str | None = None,
    ) -> dict[str, int]:
        """Return counts of data quality events grouped by severity."""
        stmt = select(DataQualityEvent.severity, func.count(DataQualityEvent.id))
        if dataset:
            stmt = stmt.where(DataQualityEvent.dataset == dataset)
        stmt = stmt.group_by(DataQualityEvent.severity)

        res = await self.session.execute(stmt)
        counts = {"INFO": 0, "WARNING": 0, "ERROR": 0, "CRITICAL": 0}
        for sev, c in res.all():
            if sev in counts:
                counts[sev] = c
            else:
                counts[sev] = c
        return counts

    async def list_recent_events(
        self,
        limit: int = 50,
        severity: str | None = None,
    ) -> list[DataQualityEvent]:
        """List most recent data quality events ordered newest first."""
        stmt = select(DataQualityEvent).order_by(DataQualityEvent.created_at.desc()).limit(limit)
        if severity:
            stmt = stmt.where(DataQualityEvent.severity == severity.upper())
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
