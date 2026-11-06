"""Automated BMRS ingestion and day-ahead evaluation scheduler.

Provides:
1. Lightweight, zero-external-dependency asyncio background task scheduling.
2. PostgreSQL advisory-lock cluster leader election (multi-replica safe).
3. Per-job non-overlapping execution locks.
4. Comprehensive execution audit metrics and health reporting.
"""

import asyncio
import logging
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, AsyncSession, async_sessionmaker

from app.core.config import Settings, get_settings
from app.core.database import get_engine
from app.schemas.data_health import JobHealthDetail, SchedulerHealthDetail
from app.services.actuals_service import ActualsIngestionService
from app.services.evaluation_orchestration_service import EvaluationOrchestrationService
from app.services.forecast_service import ForecastIngestionService

logger = logging.getLogger("windiq.scheduler")


@dataclass
class JobState:
    """In-memory state and statistics for a registered background pipeline job."""

    job_id: str
    interval_seconds: float
    status: str = "IDLE"  # IDLE, RUNNING, SUCCESS, FAILED
    last_run_utc: datetime | None = None
    last_successful_run_utc: datetime | None = None
    next_run_utc: datetime | None = None
    last_duration_seconds: float | None = None
    consecutive_failures: int = 0
    records_fetched: int = 0
    records_inserted: int = 0
    records_already_present: int = 0
    records_rejected: int = 0
    last_error: str | None = None
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


class WindIQScheduler:
    """Asynchronous background scheduler for automated ingestion and evaluation."""

    def __init__(
        self,
        engine: AsyncEngine | None = None,
        settings: Settings | None = None,
    ):
        self.settings = settings or get_settings()
        self.engine = engine or get_engine(self.settings)
        self.session_factory = async_sessionmaker(
            bind=self.engine,
            class_=AsyncSession,
            expire_on_commit=False,
            autoflush=False,
        )
        self.tz = ZoneInfo(self.settings.TIMEZONE)

        self._stop_event = asyncio.Event()
        self._is_running = False
        self._is_leader = False
        self._leader_conn: AsyncConnection | None = None
        self._tasks: list[asyncio.Task] = []

        # Job definitions and state tracking
        self.jobs: dict[str, JobState] = {
            "windfor_ingestion": JobState(
                job_id="windfor_ingestion",
                interval_seconds=self.settings.WINDFOR_POLL_INTERVAL_MINUTES * 60.0,
            ),
            "fuelhh_ingestion": JobState(
                job_id="fuelhh_ingestion",
                interval_seconds=self.settings.FUELHH_POLL_INTERVAL_MINUTES * 60.0,
            ),
            "day_ahead_evaluation": JobState(
                job_id="day_ahead_evaluation",
                interval_seconds=self.settings.EVALUATION_POLL_INTERVAL_MINUTES * 60.0,
            ),
        }

    @property
    def is_running(self) -> bool:
        """True if the scheduler lifecycle has started."""
        return self._is_running

    @property
    def is_leader(self) -> bool:
        """True if this scheduler instance holds the cluster PostgreSQL advisory lock."""
        return self._is_leader

    async def _acquire_leader_lock(self) -> bool:
        """Attempt to acquire the cluster-wide PostgreSQL 64-bit advisory lock."""
        try:
            if self._leader_conn is None or self._leader_conn.closed:
                self._leader_conn = await self.engine.connect()

            stmt = text("SELECT pg_try_advisory_lock(:lock_id)")
            result = await self._leader_conn.execute(
                stmt, {"lock_id": self.settings.SCHEDULER_LOCK_ID}
            )
            acquired = result.scalar() is True
            return acquired
        except Exception as exc:
            logger.warning("Failed to query advisory lock for leader election: %s", exc)
            return False

    async def _release_leader_lock(self) -> None:
        """Release the PostgreSQL advisory lock on shutdown."""
        if self._leader_conn is not None and not self._leader_conn.closed:
            try:
                if self._is_leader:
                    stmt = text("SELECT pg_advisory_unlock(:lock_id)")
                    await self._leader_conn.execute(
                        stmt, {"lock_id": self.settings.SCHEDULER_LOCK_ID}
                    )
            except Exception as exc:
                logger.warning("Error releasing PostgreSQL advisory lock: %s", exc)
            finally:
                await self._leader_conn.close()
                self._leader_conn = None

    async def start(self) -> None:
        """Start the scheduler, elect leader via PostgreSQL advisory lock, and begin job loops."""
        if not self.settings.SCHEDULER_ENABLED:
            logger.info("WindIQ Scheduler is disabled via SCHEDULER_ENABLED=False.")
            return

        if self._is_running:
            return

        self._is_running = True
        self._stop_event.clear()

        # 1. Attempt leader election
        acquired = await self._acquire_leader_lock()
        if acquired:
            self._is_leader = True
            logger.info(
                "Acquired cluster leader lock (%d). Scheduler active as LEADER.",
                self.settings.SCHEDULER_LOCK_ID,
            )
            self._start_worker_tasks()
        else:
            self._is_leader = False
            logger.info(
                "Cluster leader lock held by another instance. Scheduler standing by as FOLLOWER."
            )
            self._tasks.append(asyncio.create_task(self._standby_loop()))

    def _start_worker_tasks(self) -> None:
        """Spawn background coroutine loops for each registered job."""
        self._tasks.append(
            asyncio.create_task(self._job_loop("windfor_ingestion", self._execute_windfor_job))
        )
        self._tasks.append(
            asyncio.create_task(self._job_loop("fuelhh_ingestion", self._execute_fuelhh_job))
        )
        self._tasks.append(
            asyncio.create_task(
                self._job_loop("day_ahead_evaluation", self._execute_evaluation_job)
            )
        )

    async def _standby_loop(self) -> None:
        """Watchdog loop for follower instances attempting to claim leader lock on failover."""
        while not self._stop_event.is_set():
            try:
                await asyncio.sleep(15.0)
                if not self._is_leader:
                    acquired = await self._acquire_leader_lock()
                    if acquired:
                        self._is_leader = True
                        logger.info(
                            "Promoted to LEADER on lock acquisition. Starting worker tasks."
                        )
                        self._start_worker_tasks()
                        break
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.debug("Error in standby watchdog loop: %s", exc)

    async def stop(self) -> None:
        """Gracefully stop all job loops and release PostgreSQL advisory lock."""
        if not self._is_running:
            return

        logger.info("Stopping WindIQ background scheduler...")
        self._stop_event.set()

        # Cancel all running tasks
        for task in self._tasks:
            if not task.done():
                task.cancel()

        await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks.clear()

        # Release cluster advisory lock
        await self._release_leader_lock()

        self._is_running = False
        self._is_leader = False
        logger.info("WindIQ background scheduler stopped successfully.")

    async def _job_loop(self, job_id: str, job_func) -> None:
        """Generic runner loop executing a job at fixed intervals with error protection."""
        job = self.jobs[job_id]

        # Stagger initial run slightly to prevent thundering herd
        initial_delay = 2.0
        job.next_run_utc = datetime.now(UTC) + timedelta(seconds=initial_delay)
        try:
            await asyncio.sleep(initial_delay)
        except asyncio.CancelledError:
            return

        while not self._stop_event.is_set():
            if not self._is_leader:
                break

            # Execute job if lock is available (prevent overlapping)
            if job.lock.locked():
                logger.warning("[%s] Previous execution still active. Skipping interval.", job_id)
            else:
                async with job.lock:
                    await self._run_single_job(job, job_func)

            job.next_run_utc = datetime.now(UTC) + timedelta(seconds=job.interval_seconds)

            try:
                await asyncio.sleep(job.interval_seconds)
            except asyncio.CancelledError:
                break

    async def _run_single_job(self, job: JobState, job_func) -> None:
        """Wrap single job execution with timing, counters, and error capture."""
        job.status = "RUNNING"
        job.last_run_utc = datetime.now(UTC)
        t_start = time.perf_counter()

        try:
            res = await job_func()
            elapsed = time.perf_counter() - t_start
            job.status = "SUCCESS"
            job.last_successful_run_utc = datetime.now(UTC)
            job.last_duration_seconds = round(elapsed, 2)
            job.consecutive_failures = 0
            job.last_error = None

            if isinstance(res, dict):
                job.records_fetched = res.get("records_fetched", 0)
                job.records_inserted = res.get("records_inserted", 0)
                job.records_already_present = res.get("records_already_present", 0)
                job.records_rejected = res.get("records_rejected", 0)

            logger.info("[%s] Completed in %.2fs", job.job_id, elapsed)
        except Exception as exc:
            elapsed = time.perf_counter() - t_start
            job.status = "FAILED"
            job.last_duration_seconds = round(elapsed, 2)
            job.consecutive_failures += 1
            job.last_error = str(exc)
            logger.exception("[%s] Failed after %.2fs: %s", job.job_id, elapsed, exc)

    async def _execute_windfor_job(self) -> dict[str, int]:
        """Scheduled polling of WINDFOR forecasts across configured rolling horizon."""
        today_local = datetime.now(self.tz).date()
        start_date = today_local - timedelta(days=self.settings.WINDFOR_POLL_HORIZON_DAYS)

        total_fetched = 0
        total_inserted = 0
        total_already = 0
        total_rejected = 0

        async with self.session_factory() as session:
            service = ForecastIngestionService(session)
            curr = start_date
            while curr <= today_local:
                run = await service.ingest_single_day(decision_date=curr, use_cache=False)
                total_fetched += run.records_fetched
                total_inserted += run.records_inserted
                total_already += run.records_already_present
                total_rejected += run.records_rejected
                curr += timedelta(days=1)

        return {
            "records_fetched": total_fetched,
            "records_inserted": total_inserted,
            "records_already_present": total_already,
            "records_rejected": total_rejected,
        }

    async def _execute_fuelhh_job(self) -> dict[str, int]:
        """Scheduled polling of FUELHH actuals across configured rolling horizon."""
        today_local = datetime.now(self.tz).date()
        start_date = today_local - timedelta(days=self.settings.FUELHH_POLL_HORIZON_DAYS)

        total_fetched = 0
        total_inserted = 0
        total_already = 0
        total_rejected = 0

        async with self.session_factory() as session:
            service = ActualsIngestionService(session)
            curr = start_date
            while curr <= today_local:
                run = await service.ingest_single_day(delivery_date=curr, use_cache=False)
                total_fetched += run.records_fetched
                total_inserted += run.records_inserted
                total_already += run.records_already_present
                total_rejected += run.records_rejected
                curr += timedelta(days=1)

        return {
            "records_fetched": total_fetched,
            "records_inserted": total_inserted,
            "records_already_present": total_already,
            "records_rejected": total_rejected,
        }

    async def _execute_evaluation_job(self) -> dict[str, int]:
        """Scheduled day-ahead evaluation orchestration checking rolling dates."""
        total_fetched = 0
        total_inserted = 0
        total_already = 0
        total_rejected = 0

        async with self.session_factory() as session:
            service = EvaluationOrchestrationService(session, self.settings)
            runs = await service.run_rolling_evaluation_window(lookback_days=2)
            for r in runs:
                total_fetched += r.records_fetched
                total_inserted += r.records_inserted
                total_already += r.records_already_present
                total_rejected += r.records_rejected

        return {
            "records_fetched": total_fetched,
            "records_inserted": total_inserted,
            "records_already_present": total_already,
            "records_rejected": total_rejected,
        }

    async def trigger_job_now(self, job_id: str) -> dict[str, int]:
        """Manually trigger an immediate execution of a registered job."""
        if job_id not in self.jobs:
            raise ValueError(f"Unknown job identifier: {job_id}")

        job = self.jobs[job_id]
        if job_id == "windfor_ingestion":
            func = self._execute_windfor_job
        elif job_id == "fuelhh_ingestion":
            func = self._execute_fuelhh_job
        elif job_id == "day_ahead_evaluation":
            func = self._execute_evaluation_job
        else:
            raise ValueError(f"Unmapped runner for job: {job_id}")

        async with job.lock:
            await self._run_single_job(job, func)

        return {
            "records_fetched": job.records_fetched,
            "records_inserted": job.records_inserted,
            "records_already_present": job.records_already_present,
            "records_rejected": job.records_rejected,
        }

    def get_health_detail(self) -> SchedulerHealthDetail:
        """Construct the operational health payload for the data health API."""
        status_str = "STOPPED"
        if not self.settings.SCHEDULER_ENABLED:
            status_str = "DISABLED"
        elif self._is_running:
            status_str = "RUNNING" if self._is_leader else "STANDBY"

        job_details: dict[str, JobHealthDetail] = {}
        for j_id, j in self.jobs.items():
            job_details[j_id] = JobHealthDetail(
                job_id=j.job_id,
                status=j.status,
                last_run_utc=j.last_run_utc,
                last_successful_run_utc=j.last_successful_run_utc,
                next_run_utc=j.next_run_utc,
                last_duration_seconds=j.last_duration_seconds,
                consecutive_failures=j.consecutive_failures,
                records_fetched=j.records_fetched,
                records_inserted=j.records_inserted,
                records_already_present=j.records_already_present,
                records_rejected=j.records_rejected,
                last_error=j.last_error,
            )

        return SchedulerHealthDetail(
            status=status_str,
            is_leader=self._is_leader,
            enabled=self.settings.SCHEDULER_ENABLED,
            jobs=job_details,
        )
