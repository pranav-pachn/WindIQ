# WindIQ — Phase 2.2 Implementation Report: PostgreSQL Database Models & Alembic Migrations

**Author**: Senior Database Architect & Python Backend Engineer  
**Date**: November 4, 2026  
**Status**: COMPLETE & VERIFIED  
**Target Milestone**: Phase 2.2 — Relational Database Architecture, SQLAlchemy 2.x Async Models, and Alembic Migrations  

---

## 1. Executive Summary

Phase 2.2 establishes the relational persistence and audit foundation for WindIQ. All seven core relational models have been implemented using SQLAlchemy 2.0 async declarative mappings, with strict relational integrity, explicit named constraints, check constraints, and performance indexes.

Alembic has been configured for asynchronous operation using `asyncpg`, and the baseline migration script `001_initial_database_schema.py` was executed and verified for clean forward (`upgrade head`) and rollback (`downgrade base`) behavior against a live PostgreSQL 18 instance.

Twelve comprehensive integration tests were authored and validated against live PostgreSQL, asserting composite uniqueness, source-reading lineage, deletion protection (`ON DELETE RESTRICT`), and dynamic database readiness probing (`/health/ready`). All 42 tests across the WindIQ test suite pass.

---

## 2. Implemented Models and Relational DDL

The database architecture consists of seven relational tables located under `backend/app/models/`:

| Model Class | Table Name | Purpose | Primary Key | Key Foreign Keys |
| :--- | :--- | :--- | :--- | :--- |
| `IngestionRun` | `ingestion_runs` | Tracks pipeline ingestion executions and lifecycle metrics | `UUID` | None |
| `RawForecastRecord` | `raw_forecast_records` | Stores immutable WINDFOR forecast publications | `BIGINT` | `ingestion_run_id` (`ON DELETE SET NULL`) |
| `RawActualRecord` | `raw_actual_records` | Stores half-hourly FUELHH settlement readings | `BIGINT` | `ingestion_run_id` (`ON DELETE SET NULL`) |
| `HourlyActual` | `hourly_actuals` | Aggregates exactly two half-hourly actual readings | `BIGINT` | `first_half_hour_record_id`, `second_half_hour_record_id` (`ON DELETE RESTRICT`) |
| `EvaluationConfiguration` | `evaluation_configurations` | Governs decision cutoffs and timezone evaluation rules | `INTEGER` | None |
| `ForecastEvaluation` | `forecast_evaluations` | Stores day-ahead evaluations linking forecast to actual | `BIGINT` | `forecast_record_id`, `actual_hourly_id`, `evaluation_configuration_id` (`ON DELETE RESTRICT`) |
| `DataQualityEvent` | `data_quality_events` | Logs audit anomalies, timing drift, and missing records | `BIGINT` | `ingestion_run_id` (`ON DELETE SET NULL`) |

### Complete Table DDL Summary

```sql
-- 1. Ingestion Runs
CREATE TABLE ingestion_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dataset VARCHAR(32) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    records_extracted INTEGER NOT NULL DEFAULT 0,
    records_inserted INTEGER NOT NULL DEFAULT 0,
    records_rejected INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT chk_ingestion_runs_status CHECK (status IN ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED'))
);

-- 2. Raw Forecast Records (WINDFOR)
CREATE TABLE raw_forecast_records (
    id BIGSERIAL PRIMARY KEY,
    publish_time_utc TIMESTAMPTZ NOT NULL,
    delivery_hour_utc TIMESTAMPTZ NOT NULL,
    generation_mw DOUBLE PRECISION NOT NULL,
    source_dataset VARCHAR(32) NOT NULL DEFAULT 'WINDFOR',
    ingestion_run_id UUID REFERENCES ingestion_runs(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_raw_forecast_pub_del UNIQUE (publish_time_utc, delivery_hour_utc),
    CONSTRAINT chk_raw_forecast_generation_non_negative CHECK (generation_mw >= 0.0)
);

-- 3. Raw Actual Records (FUELHH)
CREATE TABLE raw_actual_records (
    id BIGSERIAL PRIMARY KEY,
    start_time_utc TIMESTAMPTZ NOT NULL UNIQUE,
    settlement_date DATE NOT NULL,
    settlement_period SMALLINT NOT NULL,
    fuel_type VARCHAR(16) NOT NULL DEFAULT 'WIND',
    generation_mw DOUBLE PRECISION NOT NULL,
    source_dataset VARCHAR(32) NOT NULL DEFAULT 'FUELHH',
    ingestion_run_id UUID REFERENCES ingestion_runs(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_raw_actual_start_time UNIQUE (start_time_utc),
    CONSTRAINT chk_raw_actual_generation_non_negative CHECK (generation_mw >= 0.0),
    CONSTRAINT chk_raw_actual_settlement_period CHECK (settlement_period BETWEEN 1 AND 50)
);

-- 4. Hourly Actuals
CREATE TABLE hourly_actuals (
    id BIGSERIAL PRIMARY KEY,
    delivery_hour_utc TIMESTAMPTZ NOT NULL UNIQUE,
    generation_mw DOUBLE PRECISION NOT NULL,
    first_half_hour_record_id BIGINT NOT NULL REFERENCES raw_actual_records(id) ON DELETE RESTRICT,
    second_half_hour_record_id BIGINT NOT NULL REFERENCES raw_actual_records(id) ON DELETE RESTRICT,
    is_complete BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_hourly_actuals_delivery_hour UNIQUE (delivery_hour_utc),
    CONSTRAINT chk_hourly_actuals_distinct_readings CHECK (first_half_hour_record_id <> second_half_hour_record_id),
    CONSTRAINT chk_hourly_actuals_generation_non_negative CHECK (generation_mw >= 0.0)
);

-- 5. Evaluation Configurations
CREATE TABLE evaluation_configurations (
    id SERIAL PRIMARY KEY,
    configuration_name VARCHAR(64) NOT NULL UNIQUE,
    decision_cutoff_hour SMALLINT NOT NULL,
    decision_cutoff_minute SMALLINT NOT NULL,
    timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/London',
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_eval_config_name UNIQUE (configuration_name),
    CONSTRAINT chk_eval_config_cutoff_hour CHECK (decision_cutoff_hour BETWEEN 0 AND 23),
    CONSTRAINT chk_eval_config_cutoff_minute CHECK (decision_cutoff_minute BETWEEN 0 AND 59)
);

-- 6. Forecast Evaluations
CREATE TABLE forecast_evaluations (
    id BIGSERIAL PRIMARY KEY,
    forecast_record_id BIGINT NOT NULL REFERENCES raw_forecast_records(id) ON DELETE RESTRICT,
    actual_hourly_id BIGINT NOT NULL REFERENCES hourly_actuals(id) ON DELETE RESTRICT,
    evaluation_configuration_id INTEGER NOT NULL REFERENCES evaluation_configurations(id) ON DELETE RESTRICT,
    decision_date DATE NOT NULL,
    decision_cutoff_utc TIMESTAMPTZ NOT NULL,
    delivery_hour_utc TIMESTAMPTZ NOT NULL,
    forecast_generation_mw DOUBLE PRECISION NOT NULL,
    actual_generation_mw DOUBLE PRECISION NOT NULL,
    error_mw DOUBLE PRECISION,
    absolute_error_mw DOUBLE PRECISION,
    absolute_percentage_error DOUBLE PRECISION,
    is_overforecast BOOLEAN,
    is_underforecast BOOLEAN,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_forecast_eval_delivery_config UNIQUE (delivery_hour_utc, evaluation_configuration_id),
    CONSTRAINT chk_forecast_eval_abs_error_non_negative CHECK (absolute_error_mw >= 0.0)
);

-- 7. Data Quality Events
CREATE TABLE data_quality_events (
    id BIGSERIAL PRIMARY KEY,
    dataset VARCHAR(32) NOT NULL,
    issue_type VARCHAR(64) NOT NULL,
    severity VARCHAR(16) NOT NULL DEFAULT 'WARNING',
    event_timestamp_utc TIMESTAMPTZ,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    ingestion_run_id UUID REFERENCES ingestion_runs(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_data_quality_events_severity CHECK (severity IN ('INFO', 'WARNING', 'ERROR', 'CRITICAL'))
);
```

---

## 3. Entity Relationships & Integrity Design

1. **Preservation of Forecast History**:
   - `raw_forecast_records` enforces composite uniqueness on `(publish_time_utc, delivery_hour_utc)` (`uq_raw_forecast_pub_del`). Multiple publication cycles for the same delivery hour can be stored without collision.
2. **Aggregated Actual Lineage**:
   - `hourly_actuals` links to exactly two distinct source records in `raw_actual_records` via `first_half_hour_record_id` and `second_half_hour_record_id`.
   - `chk_hourly_actuals_distinct_readings` prevents assigning the same half-hourly reading twice.
3. **Traceability of Accuracy Evaluations**:
   - `forecast_evaluations` retains strict foreign keys to the selected `raw_forecast_records.id`, the aggregated `hourly_actuals.id`, and the governing `evaluation_configurations.id`.
4. **Historical Deletion Protection**:
   - All evaluation foreign keys and hourly actual source foreign keys use `ON DELETE RESTRICT`. A source forecast or actual cannot be removed if it forms part of an official evaluation.
5. **Configurable Coexistence**:
   - Unique constraint `uq_forecast_eval_delivery_config` on `(delivery_hour_utc, evaluation_configuration_id)` enables evaluating multiple decision cutoffs simultaneously without collision.

---

## 4. Constraint and Index Decisions

| Constraint / Index Name | Table | Type | Rationale |
| :--- | :--- | :--- | :--- |
| `uq_raw_forecast_pub_del` | `raw_forecast_records` | UNIQUE | Prevents duplicate ingestions while allowing version history across publication runs. |
| `idx_raw_forecast_delivery_publish` | `raw_forecast_records` | INDEX | Accelerates day-ahead selection query: `delivery_hour_utc = :dh AND publish_time_utc <= :cutoff ORDER BY publish_time_utc DESC LIMIT 1`. |
| `uq_raw_actual_start_time` | `raw_actual_records` | UNIQUE | Enforces unique half-hourly intervals for actual generation. |
| `idx_raw_actual_settlement` | `raw_actual_records` | INDEX | Accelerates settlement day / period lookups. |
| `chk_hourly_actuals_distinct_readings` | `hourly_actuals` | CHECK | Guarantees hourly actuals are derived from two distinct half-hours. |
| `uq_forecast_eval_delivery_config` | `forecast_evaluations` | UNIQUE | Ensures idempotency of evaluations per configuration and delivery hour. |
| `idx_forecast_evaluations_delivery` | `forecast_evaluations` | INDEX | Accelerates time-range slicing for evaluation metrics and dashboards. |

---

## 5. Migration Execution Details

- **Alembic Environment**: Configured in `backend/alembic.ini` and `backend/migrations/env.py` using `asyncio` mode with `asyncpg`.
- **Initial Migration**: `backend/migrations/versions/001_initial_database_schema.py`.
- **Migration Verification**:
  1. `alembic upgrade head`: Applied cleanly, creating extension `uuid-ossp`, all 7 tables, check constraints, foreign keys, and indexes.
  2. `alembic downgrade base`: Dropped all 7 tables and extensions in exact reverse dependency order without residual locks or orphan dependencies.
  3. `alembic upgrade head`: Re-applied cleanly to establish the test environment.

---

## 6. Commands Executed

```powershell
# 1. Dependency installation
pip install asyncpg alembic psycopg2-binary

# 2. Database cluster initialization (Port 5433)
& "C:\Program Files\PostgreSQL\18\bin\initdb.exe" -D "C:\Users\prana\Projects\WindIQ\.pg_test_db" -U postgres --auth-local=trust --auth-host=trust

# 3. Database server daemon execution
& "C:\Program Files\PostgreSQL\18\bin\postgres.exe" -D "C:\Users\prana\Projects\WindIQ\.pg_test_db" -p 5433

# 4. Create test database
& "C:\Program Files\PostgreSQL\18\bin\createdb.exe" -U postgres -p 5433 windiq_test

# 5. Execute Alembic migrations
$env:DATABASE_URL = "postgresql+asyncpg://postgres@127.0.0.1:5433/windiq_test"
cd backend
alembic upgrade head
alembic downgrade base
alembic upgrade head
cd ..

# 6. Run database integration test suite
python -m pytest backend/tests/test_database.py -v

# 7. Run full project test suite
python -m pytest -v

# 8. Linting and formatting checks
python -m ruff check backend
python -m ruff format --check backend
```

---

## 7. PostgreSQL Test Results

Integration testing ran directly against PostgreSQL 18.6 on port 5433 (no SQLite substitutes). All 12 test scenarios passed:

```
backend/tests/test_database.py::test_1_all_seven_tables_exist PASSED     [  8%]
backend/tests/test_database.py::test_2_multiple_publication_versions_allowed PASSED [ 16%]
backend/tests/test_database.py::test_3_multiple_publication_versions_preserved PASSED [ 25%]
backend/tests/test_database.py::test_4_duplicate_forecast_composite_keys_rejected PASSED [ 33%]
backend/tests/test_database.py::test_5_actual_source_timestamp_uniqueness PASSED [ 41%]
backend/tests/test_database.py::test_6_hourly_actuals_require_valid_source_records PASSED [ 50%]
backend/tests/test_database.py::test_7_evaluation_foreign_keys_work PASSED [ 58%]
backend/tests/test_database.py::test_8_duplicate_evaluations_same_config_delivery_rejected PASSED [ 66%]
backend/tests/test_database.py::test_9_different_evaluation_configurations_can_coexist PASSED [ 75%]
backend/tests/test_database.py::test_10_historical_records_protected_from_deletion PASSED [ 83%]
backend/tests/test_database.py::test_11_readiness_fails_when_postgres_unavailable PASSED [ 91%]
backend/tests/test_database.py::test_12_readiness_succeeds_when_postgres_reachable PASSED [100%]
```

Full repository test execution results:
- **Total Tests**: 42 passed (16 Phase 1 pipeline tests, 14 Phase 2.1 API & config tests, 12 Phase 2.2 PostgreSQL database tests).
- **Duration**: 7.24s.
- **Failures**: 0.

---

## 8. Docker Verification Status

- **Docker Version**: 29.6.2, Build dfc4efb (Docker Compose v5.3.1).
- **Verification Result**: The Docker daemon was stopped on the local host (`npipe:////./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified`). Consequently, containerized Compose services were not started.
- **Mitigation**: A dedicated native PostgreSQL 18 cluster was initialized at `.pg_test_db` on port 5433 with trust authentication to perform real database verification against PostgreSQL.

---

## 9. Known Limitations & Next Steps

1. **Ingestion Pipelines**: The database tables are fully modeled and migrated, but ingestion services (populating tables from Elexon BMRS API and backfilling January 2026 data) are slated for Phase 2.3.
2. **Evaluation Logic**: Calculation and insertion of `forecast_evaluations` records will be orchestrated by the upcoming forecast selection and accuracy services.
3. **Database Port Configuration**: Default development environment points to port 5432. Local tests executed against port 5433. Production and Docker Compose deployments map port 5432 directly.

