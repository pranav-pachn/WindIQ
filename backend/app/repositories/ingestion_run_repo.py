"""Repository for persisting and updating IngestionRun audit entities."""

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ingestion import IngestionRun


class IngestionRunRepository:
    """Asynchronous repository for IngestionRun tracking."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_run(
        self,
        dataset: str,
        time_window_start_utc: datetime | None = None,
        time_window_end_utc: datetime | None = None,
        metadata_json: dict[str, Any] | None = None,
        run_id: uuid.UUID | None = None,
    ) -> IngestionRun:
        """Create and persist a new IngestionRun entity in RUNNING status."""
        run = IngestionRun(
            id=run_id or uuid.uuid4(),
            dataset=dataset,
            started_at=datetime.now(UTC),
            time_window_start_utc=time_window_start_utc,
            time_window_end_utc=time_window_end_utc,
            status="RUNNING",
            records_fetched=0,
            records_inserted=0,
            records_already_present=0,
            records_rejected=0,
            metadata_json=metadata_json or {},
        )
        self.session.add(run)
        await self.session.flush()
        return run

    async def update_run(
        self,
        run_id: uuid.UUID,
        status: str,
        records_fetched: int = 0,
        records_inserted: int = 0,
        records_already_present: int = 0,
        records_rejected: int = 0,
        error_message: str | None = None,
        metadata_json: dict[str, Any] | None = None,
    ) -> IngestionRun | None:
        """Update terminal or intermediate counters and status for an IngestionRun."""
        run = await self.session.get(IngestionRun, run_id)
        if run is None:
            return None

        run.status = status
        run.records_fetched = records_fetched
        run.records_inserted = records_inserted
        run.records_already_present = records_already_present
        run.records_rejected = records_rejected
        run.completed_at = datetime.now(UTC)
        run.error_message = error_message
        if metadata_json:
            merged = dict(run.metadata_json)
            merged.update(metadata_json)
            run.metadata_json = merged

        await self.session.flush()
        return run

    async def get_by_id(self, run_id: uuid.UUID) -> IngestionRun | None:
        """Fetch IngestionRun by primary key."""
        return await self.session.get(IngestionRun, run_id)

    async def get_latest_successful_run(self, dataset: str) -> IngestionRun | None:
        """Fetch the most recent SUCCESS or PARTIAL_SUCCESS run for a dataset."""
        stmt = (
            select(IngestionRun)
            .where(
                IngestionRun.dataset == dataset,
                IngestionRun.status.in_(["SUCCESS", "PARTIAL_SUCCESS"]),
            )
            .order_by(IngestionRun.started_at.desc())
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_latest_run(self, dataset: str) -> IngestionRun | None:
        """Fetch the most recent run regardless of status."""
        stmt = (
            select(IngestionRun)
            .where(IngestionRun.dataset == dataset)
            .order_by(IngestionRun.started_at.desc())
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_runs(
        self,
        dataset: str | None = None,
        limit: int = 50,
    ) -> list[IngestionRun]:
        """List recent ingestion runs sorted by start time descending."""
        stmt = select(IngestionRun).order_by(IngestionRun.started_at.desc()).limit(limit)
        if dataset:
            stmt = stmt.where(IngestionRun.dataset == dataset)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
