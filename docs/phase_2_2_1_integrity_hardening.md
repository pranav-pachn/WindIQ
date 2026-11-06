# WindIQ — Phase 2.2.1 Implementation Report: Database Integrity Hardening

**Author**: Senior Database Architect & Python Backend Engineer  
**Date**: November 4, 2026  
**Status**: COMPLETE & VERIFIED  
**Target Milestone**: Phase 2.2.1 — Database Integrity Hardening (Hourly Actual & Evaluation Integrity, Precision, Versioning, and Triggers)  

---

## 1. Executive Summary

Phase 2.2.1 delivers comprehensive database-level integrity hardening across WindIQ's relational persistence tier. Building on Phase 2.2, this phase replaces software-only assumptions with deterministic, multi-layered PostgreSQL constraints and triggers:

1. **Hourly Actual Integrity**: Guaranteed derivation from exactly two half-hourly readings at HH:00 and HH:30, strictly 30 minutes apart, on the same UTC delivery hour, preventing reading reuse across aggregates, and mathematically verifying that the hourly generation equals the average of both readings.
2. **Evaluation Integrity**: Enforced timestamp alignment across evaluations, forecasts, and actuals; guaranteed publication compliance (cutoff enforcement); strict parity between copied generation values and referenced records; signed and absolute error math checks; and validation that overforecast/underforecast direction flags never contradict signed error.
3. **Configuration Versioning**: Added `configuration_version` and `metric_version` directly to `forecast_evaluations` with automatic synchronization and validation against referenced `evaluation_configurations`, freezing evaluation lineage.
4. **Numeric Precision**: Transitioned all generation MW and error metrics from `DOUBLE PRECISION` to exact PostgreSQL `NUMERIC(12, 4)` and percentage errors to `NUMERIC(10, 4)`. Rounding rules ensure exact compliance with January benchmark metrics within an explicit tolerance of < 0.01 MW / 0.01%.
5. **Constraint Cleanup**: Removed redundant duplicate non-unique indexes (`idx_raw_actual_start_time`, `idx_hourly_actuals_delivery_hour`) already covered by unique constraints.
6. **Alembic Migration & Integration Tests**: Implemented migration `002_integrity_hardening.py` with reversible forward and rollback lifecycle. Authored 12 new PostgreSQL integration tests in [`backend/tests/test_integrity_hardening.py`](file:///c:/Users/prana/Projects/WindIQ/backend/tests/test_integrity_hardening.py), bringing the total repository test suite to 54 passing tests.

---

## 2. Integrity Improvements Implemented

### 2.1 Hourly Actual Derivation & Protection

- **Exact Interval Check**: The first half-hour reading must be at `HH:00:00 UTC` matching `delivery_hour_utc`, and the second half-hour reading must be at `HH:30:00 UTC` (`delivery_hour_utc + INTERVAL '30 minutes'`).
- **Mathematical Average Verification**: Trigger `fn_validate_hourly_actual()` verifies:
  $$\text{generation\_mw} = \text{ROUND}\left(\frac{\text{reading\_00} + \text{reading\_30}}{2}, 4\right)$$
  Any discrepancy $\ge 0.0001\text{ MW}$ is rejected with SQLSTATE `23514` (`check_violation`).
- **Reuse Prevention**: Enforced via dual unique constraints `uq_hourly_actuals_first_reading` and `uq_hourly_actuals_second_reading`, reinforced by trigger cross-column checks preventing any source reading from being used in more than one hourly aggregate.
- **On-the-Hour Constraint**: Enforced via check constraint `chk_hourly_actuals_on_the_hour`:
  ```sql
  CHECK (
      EXTRACT(MINUTE FROM delivery_hour_utc AT TIME ZONE 'UTC') = 0 AND
      EXTRACT(SECOND FROM delivery_hour_utc AT TIME ZONE 'UTC') = 0
  )
  ```

### 2.2 Forecast Evaluation Integrity

- **Delivery Hour Alignment**: Trigger `fn_validate_forecast_evaluation()` asserts `raw_forecast_records.delivery_hour_utc = forecast_evaluations.delivery_hour_utc` and `hourly_actuals.delivery_hour_utc = forecast_evaluations.delivery_hour_utc`.
- **Decision Cutoff Enforcement**: Asserts `raw_forecast_records.publish_time_utc <= forecast_evaluations.decision_cutoff_utc`. Any forecast published after cutoff is rejected with `check_violation`.
- **Copied Value Parity**: Asserts `forecast_evaluations.forecast_generation_mw = raw_forecast_records.generation_mw` and `forecast_evaluations.actual_generation_mw = hourly_actuals.generation_mw`.
- **Mathematical Error Consistency**:
  - Signed error: `chk_eval_signed_error` enforces $\text{signed\_error\_mw} = \text{forecast\_mw} - \text{actual\_mw}$.
  - Absolute error: `chk_eval_absolute_error` enforces $\text{absolute\_error\_mw} = |\text{signed\_error\_mw}|$.
  - Percentage error: `chk_eval_percentage_error` enforces $\text{absolute\_percentage\_error} = \frac{\text{absolute\_error\_mw}}{\text{actual\_mw}} \times 100\%$ within 0.01% rounding tolerance.
- **Direction Flag Consistency**:
  - $\text{signed\_error\_mw} > 0 \implies \text{is\_overforecast} = \text{TRUE}, \text{is\_underforecast} = \text{FALSE}$.
  - $\text{signed\_error\_mw} < 0 \implies \text{is\_overforecast} = \text{FALSE}, \text{is\_underforecast} = \text{TRUE}$.
  - $\text{signed\_error\_mw} = 0 \implies \text{is\_overforecast} = \text{FALSE}, \text{is\_underforecast} = \text{FALSE}$.
  - Automatically populated by trigger if omitted; raises `check_violation` if contradictory flags are supplied.

### 2.3 Evaluation Configuration Versioning

Added columns to `forecast_evaluations`:
- `configuration_version INTEGER NOT NULL DEFAULT 1`
- `metric_version VARCHAR(32) NOT NULL DEFAULT 'v1.0'`

The trigger `fn_validate_forecast_evaluation()` synchronizes these columns directly from the referenced `evaluation_configurations` row, permanently freezing the configuration under which the evaluation was generated.

---

## 3. Numeric Precision & Rounding Rules

| Field Name | Table | Previous Type | Hardened Type | Scale Rationale |
| :--- | :--- | :--- | :--- | :--- |
| `generation_mw` | `raw_forecast_records` | `DOUBLE PRECISION` | `NUMERIC(12, 4)` | Preserves exact MW up to 99,999,999.9999 MW without floating-point artifacts. |
| `generation_mw` | `raw_actual_records` | `DOUBLE PRECISION` | `NUMERIC(12, 4)` | Accurately stores settlement readings (e.g. .0 or .5 MW). |
| `generation_mw` | `hourly_actuals` | `DOUBLE PRECISION` | `NUMERIC(12, 4)` | Exact average of two half-hourly readings without IEEE 754 drift. |
| `forecast_generation_mw` | `forecast_evaluations` | `DOUBLE PRECISION` | `NUMERIC(12, 4)` | Exact copied value from forecast record. |
| `actual_generation_mw` | `forecast_evaluations` | `DOUBLE PRECISION` | `NUMERIC(12, 4)` | Exact copied value from hourly actual. |
| `signed_error_mw` | `forecast_evaluations` | `DOUBLE PRECISION` | `NUMERIC(12, 4)` | Exact difference $\pm 99,999,999.9999\text{ MW}$. |
| `absolute_error_mw` | `forecast_evaluations` | `DOUBLE PRECISION` | `NUMERIC(12, 4)` | Exact non-negative absolute error. |
| `absolute_percentage_error` | `forecast_evaluations` | `DOUBLE PRECISION` | `NUMERIC(10, 4)` | Supports error percentages up to $999,999.9999\%$ to $0.0001\%$ precision. |

### Rounding & Tolerance Rules
1. **Database Storage**: Generation differences and averages are computed and stored to 4 decimal places (`NUMERIC(12, 4)`).
2. **Percentage Error**: Evaluated to 4 decimal places; check constraints permit a rounding tolerance of $\le 0.01\%$ to accommodate 2-decimal reporting standards ($14.18\%$ vs $14.1752\%$).
3. **January 2026 KPI Regression**:
   - $\text{MAE} = 2038.91\text{ MW}$
   - $\text{RMSE} = 2504.76\text{ MW}$
   - $\text{MAPE} = 22.04\%$
   - $\text{Bias} = 1747.89\text{ MW}$
   - Verified that transition to `NUMERIC(12, 4)` introduces $0.00\%$ deviation from validated January metrics.

---

## 4. DDL & Trigger Specification

### 4.1 Hourly Actual Validation Trigger

```sql
CREATE OR REPLACE FUNCTION fn_validate_hourly_actual()
RETURNS TRIGGER AS $$
DECLARE
    v_first_start TIMESTAMPTZ;
    v_first_gen NUMERIC;
    v_second_start TIMESTAMPTZ;
    v_second_gen NUMERIC;
    v_expected_gen NUMERIC;
BEGIN
    -- Ensure distinct source readings
    IF NEW.first_half_hour_record_id = NEW.second_half_hour_record_id THEN
        RAISE EXCEPTION 'first_half_hour_record_id and second_half_hour_record_id cannot be identical (chk_hourly_actuals_distinct_readings)'
        USING ERRCODE = 'check_violation';
    END IF;

    -- Ensure delivery_hour_utc is on the hour in UTC
    IF EXTRACT(MINUTE FROM NEW.delivery_hour_utc AT TIME ZONE 'UTC') <> 0
       OR EXTRACT(SECOND FROM NEW.delivery_hour_utc AT TIME ZONE 'UTC') <> 0 THEN
        RAISE EXCEPTION 'delivery_hour_utc must be exactly on the hour in UTC (HH:00:00), got %', NEW.delivery_hour_utc
        USING ERRCODE = 'check_violation';
    END IF;

    -- Fetch first half hour reading
    SELECT source_start_time_utc, generation_mw
    INTO v_first_start, v_first_gen
    FROM raw_actual_records
    WHERE id = NEW.first_half_hour_record_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'first_half_hour_record_id % not found in raw_actual_records', NEW.first_half_hour_record_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    -- Fetch second half hour reading
    SELECT source_start_time_utc, generation_mw
    INTO v_second_start, v_second_gen
    FROM raw_actual_records
    WHERE id = NEW.second_half_hour_record_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'second_half_hour_record_id % not found in raw_actual_records', NEW.second_half_hour_record_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    -- First reading must match delivery_hour_utc (HH:00)
    IF v_first_start <> NEW.delivery_hour_utc THEN
        RAISE EXCEPTION 'First half-hour reading timestamp (%) must equal delivery_hour_utc (%)',
            v_first_start, NEW.delivery_hour_utc
        USING ERRCODE = 'check_violation';
    END IF;

    -- Second reading must match delivery_hour_utc + 30 mins (HH:30)
    IF v_second_start <> (NEW.delivery_hour_utc + INTERVAL '30 minutes') THEN
        RAISE EXCEPTION 'Second half-hour reading timestamp (%) must be delivery_hour_utc + 30m (%)',
            v_second_start, (NEW.delivery_hour_utc + INTERVAL '30 minutes')
        USING ERRCODE = 'check_violation';
    END IF;

    -- Both readings must be exactly 30 minutes apart
    IF (v_second_start - v_first_start) <> INTERVAL '30 minutes' THEN
        RAISE EXCEPTION 'Source readings must be exactly 30 minutes apart, got % to %',
            v_first_start, v_second_start
        USING ERRCODE = 'check_violation';
    END IF;

    -- Readings cannot be reused across other hourly aggregates
    IF EXISTS (
        SELECT 1 FROM hourly_actuals
        WHERE id <> COALESCE(NEW.id, -1)
          AND (first_half_hour_record_id IN (NEW.first_half_hour_record_id, NEW.second_half_hour_record_id)
            OR second_half_hour_record_id IN (NEW.first_half_hour_record_id, NEW.second_half_hour_record_id))
    ) THEN
        RAISE EXCEPTION 'Source readings cannot be reused in another hourly aggregate'
        USING ERRCODE = 'unique_violation';
    END IF;

    -- Generation must equal mathematical average
    v_expected_gen := ROUND(((v_first_gen + v_second_gen) / 2.0)::numeric, 4);
    IF ABS(ROUND(NEW.generation_mw::numeric, 4) - v_expected_gen) >= 0.0001 THEN
        RAISE EXCEPTION 'Hourly generation_mw (%) must equal average of source readings (%)',
            NEW.generation_mw, v_expected_gen
        USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_hourly_actual
BEFORE INSERT OR UPDATE ON hourly_actuals
FOR EACH ROW EXECUTE FUNCTION fn_validate_hourly_actual();
```

### 4.2 Forecast Evaluation Validation Trigger

```sql
CREATE OR REPLACE FUNCTION fn_validate_forecast_evaluation()
RETURNS TRIGGER AS $$
DECLARE
    v_fc_delivery TIMESTAMPTZ;
    v_fc_publish TIMESTAMPTZ;
    v_fc_gen NUMERIC;
    v_act_delivery TIMESTAMPTZ;
    v_act_gen NUMERIC;
    v_cfg_version INT;
    v_cfg_metric_version VARCHAR;
BEGIN
    -- Ensure delivery_hour_utc is on the hour in UTC
    IF EXTRACT(MINUTE FROM NEW.delivery_hour_utc AT TIME ZONE 'UTC') <> 0
       OR EXTRACT(SECOND FROM NEW.delivery_hour_utc AT TIME ZONE 'UTC') <> 0 THEN
        RAISE EXCEPTION 'Evaluation delivery_hour_utc must be exactly on the hour in UTC (HH:00:00), got %', NEW.delivery_hour_utc
        USING ERRCODE = 'check_violation';
    END IF;

    -- 1. Validate referenced forecast record
    IF NEW.forecast_record_id IS NOT NULL THEN
        SELECT delivery_hour_utc, publish_time_utc, generation_mw
        INTO v_fc_delivery, v_fc_publish, v_fc_gen
        FROM raw_forecast_records
        WHERE id = NEW.forecast_record_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'forecast_record_id % not found', NEW.forecast_record_id
            USING ERRCODE = 'foreign_key_violation';
        END IF;

        IF v_fc_delivery <> NEW.delivery_hour_utc THEN
            RAISE EXCEPTION 'Forecast delivery hour (%) does not match evaluation delivery hour (%)',
                v_fc_delivery, NEW.delivery_hour_utc
            USING ERRCODE = 'check_violation';
        END IF;

        IF v_fc_publish > NEW.decision_cutoff_utc THEN
            RAISE EXCEPTION 'Forecast publication time (%) is later than decision cutoff (%)',
                v_fc_publish, NEW.decision_cutoff_utc
            USING ERRCODE = 'check_violation';
        END IF;

        IF NEW.forecast_generation_mw IS NOT NULL AND ABS(ROUND(NEW.forecast_generation_mw::numeric, 4) - ROUND(v_fc_gen::numeric, 4)) >= 0.0001 THEN
            RAISE EXCEPTION 'Copied forecast_generation_mw (%) does not match raw forecast record (%)',
                NEW.forecast_generation_mw, v_fc_gen
            USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    -- 2. Validate referenced hourly actual record
    IF NEW.hourly_actual_id IS NOT NULL THEN
        SELECT delivery_hour_utc, generation_mw
        INTO v_act_delivery, v_act_gen
        FROM hourly_actuals
        WHERE id = NEW.hourly_actual_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'hourly_actual_id % not found', NEW.hourly_actual_id
            USING ERRCODE = 'foreign_key_violation';
        END IF;

        IF v_act_delivery <> NEW.delivery_hour_utc THEN
            RAISE EXCEPTION 'Actual delivery hour (%) does not match evaluation delivery hour (%)',
                v_act_delivery, NEW.delivery_hour_utc
            USING ERRCODE = 'check_violation';
        END IF;

        IF NEW.actual_generation_mw IS NOT NULL AND ABS(ROUND(NEW.actual_generation_mw::numeric, 4) - ROUND(v_act_gen::numeric, 4)) >= 0.0001 THEN
            RAISE EXCEPTION 'Copied actual_generation_mw (%) does not match hourly actual record (%)',
                NEW.actual_generation_mw, v_act_gen
            USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    -- 3. Version synchronization and enforcement
    IF NEW.evaluation_configuration_id IS NOT NULL THEN
        SELECT configuration_version, metric_version
        INTO v_cfg_version, v_cfg_metric_version
        FROM evaluation_configurations
        WHERE id = NEW.evaluation_configuration_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'evaluation_configuration_id % not found', NEW.evaluation_configuration_id
            USING ERRCODE = 'foreign_key_violation';
        END IF;

        IF NEW.configuration_version IS NULL THEN
            NEW.configuration_version := v_cfg_version;
        ELSIF NEW.configuration_version <> v_cfg_version THEN
            RAISE EXCEPTION 'Evaluation configuration_version (%) does not match configuration record (%)',
                NEW.configuration_version, v_cfg_version
            USING ERRCODE = 'check_violation';
        END IF;

        IF NEW.metric_version IS NULL THEN
            NEW.metric_version := v_cfg_metric_version;
        ELSIF NEW.metric_version <> v_cfg_metric_version THEN
            RAISE EXCEPTION 'Evaluation metric_version (%) does not match configuration record (%)',
                NEW.metric_version, v_cfg_metric_version
            USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    -- 4. Direction flags consistency and auto-population
    IF NEW.signed_error_mw IS NOT NULL THEN
        IF NEW.signed_error_mw > 0 THEN
            IF NEW.is_overforecast IS FALSE OR NEW.is_underforecast IS TRUE THEN
                RAISE EXCEPTION 'Direction flags contradict positive signed error'
                USING ERRCODE = 'check_violation';
            END IF;
            NEW.is_overforecast := TRUE;
            NEW.is_underforecast := FALSE;
        ELSIF NEW.signed_error_mw < 0 THEN
            IF NEW.is_overforecast IS TRUE OR NEW.is_underforecast IS FALSE THEN
                RAISE EXCEPTION 'Direction flags contradict negative signed error'
                USING ERRCODE = 'check_violation';
            END IF;
            NEW.is_overforecast := FALSE;
            NEW.is_underforecast := TRUE;
        ELSE
            IF NEW.is_overforecast IS TRUE OR NEW.is_underforecast IS TRUE THEN
                RAISE EXCEPTION 'Direction flags cannot be TRUE when error is zero'
                USING ERRCODE = 'check_violation';
            END IF;
            NEW.is_overforecast := FALSE;
            NEW.is_underforecast := FALSE;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_forecast_evaluation
BEFORE INSERT OR UPDATE ON forecast_evaluations
FOR EACH ROW EXECUTE FUNCTION fn_validate_forecast_evaluation();
```

---

## 5. Migration Execution Details

- **Migration File**: [`backend/migrations/versions/002_integrity_hardening.py`](file:///c:/Users/prana/Projects/WindIQ/backend/migrations/versions/002_integrity_hardening.py)
- **Revision ID**: `002_integrity_hardening` (Down Revision: `001_initial_database_schema`)
- **Lifecycle Verification Executed**:
  1. `alembic upgrade head`: Applied cleanly on PostgreSQL 18 instance.
  2. `alembic downgrade 001_initial_database_schema`: Successfully reverted all constraints, triggers, and columns to Phase 2.2 schema.
  3. `alembic downgrade base`: Successfully reverted to empty database.
  4. `alembic upgrade head`: Full clean re-application of migrations 001 and 002.

---

## 6. PostgreSQL Integration Test Results

12 dedicated integration tests were executed against live PostgreSQL in [`backend/tests/test_integrity_hardening.py`](file:///c:/Users/prana/Projects/WindIQ/backend/tests/test_integrity_hardening.py):

| Test Name | Verified Scenario | Status |
| :--- | :--- | :--- |
| `test_hourly_actual_wrong_half_hour_timestamp_rejected` | Source reading not matching HH:00 or HH:30 rejected | PASSED |
| `test_hourly_actual_delivery_hour_not_on_the_hour_rejected` | Delivery hour not on the hour (HH:00:00 UTC) rejected | PASSED |
| `test_hourly_actual_different_delivery_hour_rejected` | Source readings from different delivery hours rejected | PASSED |
| `test_hourly_actual_reused_source_reading_rejected` | Reusing source reading across aggregates rejected | PASSED |
| `test_hourly_actual_incorrect_average_rejected` | Hourly generation not equal to average rejected | PASSED |
| `test_forecast_publication_after_cutoff_rejected` | Forecast published after decision cutoff rejected | PASSED |
| `test_forecast_evaluation_delivery_hour_mismatch_rejected` | Evaluation and forecast/actual delivery hour mismatch rejected | PASSED |
| `test_forecast_evaluation_incorrect_copied_values_rejected` | Copied forecast/actual MW differing from source rejected | PASSED |
| `test_forecast_evaluation_incorrect_signed_and_abs_errors_rejected` | Inconsistent signed, absolute, or percentage error rejected | PASSED |
| `test_forecast_evaluation_inconsistent_direction_flags_rejected` | Over/under flags contradicting signed error rejected | PASSED |
| `test_forecast_evaluation_configuration_version_synchronized` | Evaluation configuration and metric versions synchronized and frozen | PASSED |
| `test_numeric_precision_rounding_accuracy` | NUMERIC(12, 4) exact decimal representation verified against benchmark | PASSED |

### Repository Test Suite Summary
- **Total Test Count**: 54 tests.
- **Pass Rate**: 100% (54 passed in 10.90s).
- **Linter Status**: 0 errors (`ruff check backend` and `ruff format --check backend` clean).

---

## 7. Known Limitations & Next Steps

1. **Ingestion Pipelines**: Source ingestion from BMRS stream endpoints remains uncoupled, scheduled for Phase 2.3.
2. **Bulk Evaluation Loading**: When writing bulk insert utilities in Phase 2.3/2.4, ensure all calculated fields (signed error, absolute error, direction flags) are calculated prior to commit or allowed to default to trigger-derived values.

