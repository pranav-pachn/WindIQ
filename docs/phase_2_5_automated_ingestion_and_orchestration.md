# WindIQ Phase 2.5 — Automated Ingestion & Evaluation Orchestration

**Document Version**: 2.5.0  
**Status**: APPROVED & VERIFIED  
**Phase**: Phase 2.5 — Automated Ingestion & Evaluation Orchestration  
**Runtime**: Python 3.12 / 3.13, FastAPI, SQLAlchemy 2.x async, PostgreSQL 16+, Docker Compose  

---

## 1. Executive Summary

Phase 2.5 transitions WindIQ from manual and on-demand ingestion into a fully automated, resilient, and multi-replica-safe operational platform.

The pipeline automatically:
1. Polls BMRS WINDFOR wind forecast publications on a configured interval (default: 30 minutes).
2. Polls BMRS FUELHH half-hourly settlement generation actuals (default: 15 minutes).
3. Persists raw source records idempotently, preserving full publication revision history.
4. Synthesizes valid hourly actuals strictly from complete, verified pairs (HH:00 and HH:30).
5. Orchestrates day-ahead evaluations at the configured decision cutoff (09:00 Europe/London), selecting the latest forecast published at or before cutoff.
6. Enforces strict evaluation immutability: existing, committed evaluations are never silently rewritten by later forecast releases.
7. Elects a single cluster leader across container replicas using PostgreSQL 64-bit advisory locks (`pg_try_advisory_lock`), avoiding external distributed infrastructure like Redis, Celery, or Kafka.
8. Exposes granular operational health and job execution metrics through `GET /api/v1/data-health`.
9. Reconciles 100% against all validated January 2026 benchmark metrics across 744 evaluation hours.

---

## 2. Orchestration Architecture

```mermaid
flowchart TD
    subgraph Host / Cluster Replicas
        R1["FastAPI Replica 1 (Leader)"]
        R2["FastAPI Replica 2 (Standby)"]
    end

    subgraph PostgreSQL Database
        AdvLock["PostgreSQL Advisory Lock (ID: 24566378415277825)"]
        RawFC["raw_forecast_records"]
        RawAct["raw_actual_records"]
        HourlyAct["hourly_actuals"]
        Evals["forecast_evaluations"]
        Runs["ingestion_runs"]
        Events["data_quality_events"]
    end

    subgraph External APIs
        BMRS_FC["Elexon BMRS WINDFOR API"]
        BMRS_Act["Elexon BMRS FUELHH API"]
    end

    R1 -->|pg_try_advisory_lock -> TRUE| AdvLock
    R2 -->|pg_try_advisory_lock -> FALSE (Standby Loop)| AdvLock

    R1 -->|1. Poll Forecasts| BMRS_FC
    R1 -->|2. Poll Actuals| BMRS_Act

    R1 -->|3. Idempotent Ingestion| RawFC
    R1 -->|4. Idempotent Ingestion| RawAct
    R1 -->|5. Pair Synthesis (HH:00 + HH:30)| HourlyAct
    R1 -->|6. Cutoff-Aware Evaluation (09:00 UK)| Evals
    R1 -->|7. Audit Tracking & Quality Events| Runs & Events

    Client["Dashboard / Monitoring Client"] -->|GET /api/v1/data-health| R1 & R2
```

---

## 3. Core Components

### 3.1 Background Scheduler (`WindIQScheduler`)
- **Location**: [`backend/app/services/scheduler.py`](file:///c:/Users/prana/Projects/WindIQ/backend/app/services/scheduler.py)
- **Lifecycle Integration**: Integrated into FastAPI application lifespan ([`backend/app/main.py`](file:///c:/Users/prana/Projects/WindIQ/backend/app/main.py)). Starts automatically on container boot and shuts down cleanly on ASGI termination (`SIGTERM`/`SIGINT`).
- **Zero-External Dependencies**: Utilizes native Python `asyncio` tasks and loops without Celery, Redis, or external brokers.
- **Per-Job Non-Overlapping Locks**: Each registered job maintains its own `asyncio.Lock()`. If an execution takes longer than the polling interval, subsequent intervals log a warning and skip execution rather than spawning overlapping tasks.

### 3.2 PostgreSQL 64-bit Advisory Lock Leader Election
- **Lock Identifier**: `24566378415277825` (`0x57494E44495101` — derived from `"WINDIQ"` + namespace `0x01`).
- **Leader Election**: During startup, `_acquire_leader_lock()` executes `SELECT pg_try_advisory_lock(:lock_id)` over a dedicated async connection.
  - If `True`: The replica is elected **LEADER** and begins executing the polling loops.
  - If `False`: The replica enters **STANDBY** mode and runs a lightweight watchdog loop (polling every 15 seconds) to claim the lock if the leader crashes or restarts.
- **Graceful Failover**: When the leader shuts down, `_release_leader_lock()` invokes `SELECT pg_advisory_unlock(:lock_id)` and closes the connection. A standby replica immediately acquires the lock and transitions to `RUNNING`.

### 3.3 Automated Polling Jobs

| Job Identifier | Default Interval | Service Executed | Description |
| :--- | :--- | :--- | :--- |
| `windfor_ingestion` | 30 minutes | `ForecastIngestionService` | Polls BMRS WINDFOR API for yesterday, today, and tomorrow. Stores forecasts idempotently while preserving publication versions. |
| `fuelhh_ingestion` | 15 minutes | `ActualsIngestionService` | Polls BMRS FUELHH API for settlement actuals. Synthesizes hourly actuals from complete `HH:00` and `HH:30` pairs. |
| `day_ahead_evaluation` | 15 minutes | `EvaluationOrchestrationService` | Evaluates rolling calendar dates where decision cutoff (09:00 Europe/London) has elapsed. Selects latest forecast $\le$ cutoff and creates evaluation records. |

### 3.4 Day-Ahead Evaluation Orchestration & Immutability
- **Location**: [`backend/app/services/evaluation_orchestration_service.py`](file:///c:/Users/prana/Projects/WindIQ/backend/app/services/evaluation_orchestration_service.py)
- **Decision Cutoff Enforcement**: Calculates the exact UTC timestamp corresponding to 09:00 Europe/London for the decision date. If the current time is before the cutoff, evaluation is safely deferred.
- **Latest Eligible Forecast Selection**: Queries `RawForecastRepository.get_latest_forecast_before_cutoff(del_hour_utc, cutoff_utc)`, selecting the latest published forecast at or before cutoff.
- **Evaluation Immutability Guarantee**: Prior to evaluating an hour, the service queries `EvaluationRepository.get_evaluation(del_hour_utc, config.id)`. If an evaluation is already committed, it is untouched and counted as `already_present`. Subsequent forecast publications released after the cutoff cannot alter historical accuracy scores.

---

## 4. Operational Health API (`GET /api/v1/data-health`)

The data health endpoint ([`backend/app/api/v1/data_health.py`](file:///c:/Users/prana/Projects/WindIQ/backend/app/api/v1/data_health.py)) exposes real-time operational metrics for all background jobs and cluster leadership:

```json
{
  "health_status": "HEALTHY",
  "data_integrity_score": 100.0,
  "summary": {
    "total_delivery_hours_evaluated": 744,
    "missing_actual_hours": 0,
    "missing_forecast_hours": 0,
    "incomplete_hourly_actual_pairs": 0,
    "half_hourly_spacing_violations": 0,
    "null_generation_readings": 0,
    "duplicate_keys_detected": 0,
    "expected_delivery_hours": 744,
    "available_delivery_hours": 744,
    "evaluation_coverage_pct": 100.0,
    "is_fully_evaluated": true
  },
  "datasets": {
    "WINDFOR": {
      "latest_successful_ingestion_utc": "2026-11-04T16:48:50.059410Z",
      "latest_ingestion_status": "SUCCESS",
      "total_records": 19710,
      "records_fetched": 1606,
      "records_inserted": 1606,
      "records_already_present": 0,
      "records_rejected": 0
    },
    "FUELHH": {
      "latest_successful_ingestion_utc": "2026-11-04T16:48:51.140610Z",
      "latest_ingestion_status": "SUCCESS",
      "total_records": 1617,
      "records_fetched": 129,
      "records_inserted": 129,
      "records_already_present": 0,
      "records_rejected": 0
    }
  },
  "publication_cycle_health": {
    "total_publication_cycles_observed": 248,
    "average_cycles_per_day": 8.0,
    "min_cycles_per_day": 8,
    "max_cycles_per_day": 8
  },
  "scheduler": {
    "status": "RUNNING",
    "is_leader": true,
    "enabled": true,
    "jobs": {
      "windfor_ingestion": {
        "job_id": "windfor_ingestion",
        "status": "SUCCESS",
        "last_run_utc": "2026-11-04T16:48:46.373162Z",
        "last_successful_run_utc": "2026-11-04T16:48:50.059410Z",
        "next_run_utc": "2026-11-04T17:18:50.060594Z",
        "last_duration_seconds": 3.69,
        "consecutive_failures": 0,
        "records_fetched": 1606,
        "records_inserted": 1606,
        "records_already_present": 0,
        "records_rejected": 0,
        "last_error": null
      },
      "fuelhh_ingestion": {
        "job_id": "fuelhh_ingestion",
        "status": "SUCCESS",
        "last_run_utc": "2026-11-04T16:48:46.406010Z",
        "last_successful_run_utc": "2026-11-04T16:48:51.140610Z",
        "next_run_utc": "2026-11-04T17:03:51.141022Z",
        "last_duration_seconds": 4.73,
        "consecutive_failures": 0,
        "records_fetched": 129,
        "records_inserted": 129,
        "records_already_present": 0,
        "records_rejected": 0,
        "last_error": null
      },
      "day_ahead_evaluation": {
        "job_id": "day_ahead_evaluation",
        "status": "SUCCESS",
        "last_run_utc": "2026-11-04T16:48:46.409071Z",
        "last_successful_run_utc": "2026-11-04T16:48:49.563323Z",
        "next_run_utc": "2026-11-04T17:03:49.563865Z",
        "last_duration_seconds": 3.15,
        "consecutive_failures": 0,
        "records_fetched": 96,
        "records_inserted": 0,
        "records_already_present": 0,
        "records_rejected": 149,
        "last_error": null
      }
    }
  }
}
```

---

## 5. Verification & Benchmark Reconciliation

### 5.1 Automated Test Suite
The automated test suite contains **101 tests** across unit, database, api, and scheduler suites:

- [`backend/tests/test_scheduler.py`](file:///c:/Users/prana/Projects/WindIQ/backend/tests/test_scheduler.py): **8 passed**
  - `test_scheduler_startup_and_graceful_shutdown`: Verified clean start and stop.
  - `test_scheduler_leader_election_and_standby_failover`: Verified PostgreSQL advisory lock acquisition, follower standby, and failover lock claim.
  - `test_non_overlapping_job_locks`: Verified per-job non-overlapping locking mechanism.
  - `test_evaluation_orchestration_future_cutoff_skipped`: Verified evaluations before cutoff are skipped.
  - `test_evaluation_immutability_guarantee`: Verified existing committed evaluations are never rewritten.
  - `test_scheduler_trigger_job_now`: Verified explicit execution triggering.
  - `test_data_health_api_scheduler_health_reporting`: Verified `/api/v1/data-health` reports scheduler state and job counters.
  - `test_january_2026_benchmark_reconciliation`: Verified mathematical reconciliation against January 2026 benchmark.
- [`backend/tests/test_api_endpoints.py`](file:///c:/Users/prana/Projects/WindIQ/backend/tests/test_api_endpoints.py): **10 passed**
- [`backend/tests/test_analytics_service.py`](file:///c:/Users/prana/Projects/WindIQ/backend/tests/test_analytics_service.py): **5 passed**
- [`backend/tests/test_ingestion_and_repositories.py`](file:///c:/Users/prana/Projects/WindIQ/backend/tests/test_ingestion_and_repositories.py): **9 passed**
- [`backend/tests/test_final_integrity_audit.py`](file:///c:/Users/prana/Projects/WindIQ/backend/tests/test_final_integrity_audit.py): **9 passed**
- [`backend/tests/test_integrity_hardening.py`](file:///c:/Users/prana/Projects/WindIQ/backend/tests/test_integrity_hardening.py): **12 passed**
- [`backend/tests/test_database.py`](file:///c:/Users/prana/Projects/WindIQ/backend/tests/test_database.py): **12 passed**
- [`backend/tests/test_bmrs_client.py`](file:///c:/Users/prana/Projects/WindIQ/backend/tests/test_bmrs_client.py): **6 passed**
- [`backend/tests/test_config.py`](file:///c:/Users/prana/Projects/WindIQ/backend/tests/test_config.py): **8 passed**
- [`backend/tests/test_health.py`](file:///c:/Users/prana/Projects/WindIQ/backend/tests/test_health.py): **6 passed**
- Existing Phase 1 pipeline tests (`tests/`): **16 passed**

### 5.2 January 2026 Benchmark Reconciliation

| Metric | Target Official Benchmark | PostgreSQL Implementation | Status |
| :--- | :--- | :--- | :--- |
| **Valid Comparisons** | 744 hours | 744 hours | MATCH |
| **MAE** | 2,038.9126 MW | 2,038.9126 MW | MATCH |
| **RMSE** | 2,504.7587 MW | 2,504.7587 MW | MATCH |
| **MAPE** | 22.0446% | 22.0446% | MATCH |
| **Bias** | +1,747.8871 MW | +1,747.8871 MW | MATCH |
| **Overforecast Count** | 632 hours | 632 hours | MATCH |
| **Underforecast Count** | 112 hours | 112 hours | MATCH |
| **Exact Match Count** | 0 hours | 0 hours | MATCH |
| **Data Integrity Score** | 100.0% | 100.0% | MATCH |

---

## 6. Conclusion & Next Steps

Phase 2.5 successfully establishes automated, resilient ingestion and evaluation orchestration for WindIQ. The platform operates continuously in Docker Compose with zero external message brokers, safely handles concurrent replicas via PostgreSQL advisory locks, and guarantees the mathematical integrity of historical evaluation data.

WindIQ is now ready for **Phase 3 (Frontend User Interface & Visualizations)**.

