"""Database integrity hardening: constraints, numeric types, and triggers.

Revision ID: 002_integrity_hardening
Revises: 001_initial_database_schema
Create Date: 2026-11-04 18:05:00.000000

"""

# ruff: noqa: E501

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "002_integrity_hardening"
down_revision: str | None = "001_initial_database_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Clean up redundant non-unique indexes covered by unique constraints
    op.drop_index("idx_raw_actual_start_time", table_name="raw_actual_records")
    op.drop_index("idx_hourly_actuals_delivery_hour", table_name="hourly_actuals")

    # 2. Convert generation MW and error columns from DOUBLE PRECISION to NUMERIC
    op.alter_column(
        "raw_forecast_records",
        "generation_mw",
        type_=sa.Numeric(12, 4),
        existing_type=sa.Double(),
        nullable=False,
    )
    op.alter_column(
        "raw_actual_records",
        "generation_mw",
        type_=sa.Numeric(12, 4),
        existing_type=sa.Double(),
        nullable=False,
    )
    op.alter_column(
        "hourly_actuals",
        "generation_mw",
        type_=sa.Numeric(12, 4),
        existing_type=sa.Double(),
        nullable=False,
    )
    op.alter_column(
        "forecast_evaluations",
        "forecast_generation_mw",
        type_=sa.Numeric(12, 4),
        existing_type=sa.Double(),
        nullable=True,
    )
    op.alter_column(
        "forecast_evaluations",
        "actual_generation_mw",
        type_=sa.Numeric(12, 4),
        existing_type=sa.Double(),
        nullable=True,
    )
    op.alter_column(
        "forecast_evaluations",
        "signed_error_mw",
        type_=sa.Numeric(12, 4),
        existing_type=sa.Double(),
        nullable=True,
    )
    op.alter_column(
        "forecast_evaluations",
        "absolute_error_mw",
        type_=sa.Numeric(12, 4),
        existing_type=sa.Double(),
        nullable=True,
    )
    op.alter_column(
        "forecast_evaluations",
        "absolute_percentage_error",
        type_=sa.Numeric(10, 4),
        existing_type=sa.Double(),
        nullable=True,
    )

    # 3. Add configuration versioning and direction flags to forecast_evaluations
    op.add_column(
        "forecast_evaluations",
        sa.Column(
            "configuration_version",
            sa.Integer(),
            nullable=False,
            server_default="1",
        ),
    )
    op.add_column(
        "forecast_evaluations",
        sa.Column(
            "metric_version",
            sa.String(length=32),
            nullable=False,
            server_default="v1.0",
        ),
    )
    op.add_column(
        "forecast_evaluations",
        sa.Column("is_overforecast", sa.Boolean(), nullable=True),
    )
    op.add_column(
        "forecast_evaluations",
        sa.Column("is_underforecast", sa.Boolean(), nullable=True),
    )

    # 4. Add unique constraints to hourly_actuals preventing source reading reuse
    op.create_unique_constraint(
        "uq_hourly_actuals_first_reading",
        "hourly_actuals",
        ["first_half_hour_record_id"],
    )
    op.create_unique_constraint(
        "uq_hourly_actuals_second_reading",
        "hourly_actuals",
        ["second_half_hour_record_id"],
    )

    # 5. Add check constraints to hourly_actuals
    op.create_check_constraint(
        "chk_hourly_actuals_on_the_hour",
        "hourly_actuals",
        "EXTRACT(MINUTE FROM delivery_hour_utc AT TIME ZONE 'UTC') = 0 AND EXTRACT(SECOND FROM delivery_hour_utc AT TIME ZONE 'UTC') = 0",
    )

    # 6. Add check constraints to forecast_evaluations
    op.create_check_constraint(
        "chk_eval_on_the_hour",
        "forecast_evaluations",
        "EXTRACT(MINUTE FROM delivery_hour_utc AT TIME ZONE 'UTC') = 0 AND EXTRACT(SECOND FROM delivery_hour_utc AT TIME ZONE 'UTC') = 0",
    )
    op.create_check_constraint(
        "chk_eval_signed_error",
        "forecast_evaluations",
        "signed_error_mw IS NULL OR (forecast_generation_mw IS NOT NULL AND actual_generation_mw IS NOT NULL AND ABS(signed_error_mw - (forecast_generation_mw - actual_generation_mw)) < 0.0001)",
    )
    op.create_check_constraint(
        "chk_eval_absolute_error",
        "forecast_evaluations",
        "absolute_error_mw IS NULL OR (signed_error_mw IS NOT NULL AND ABS(absolute_error_mw - ABS(signed_error_mw)) < 0.0001)",
    )
    op.create_check_constraint(
        "chk_eval_percentage_error",
        "forecast_evaluations",
        "absolute_percentage_error IS NULL OR (actual_generation_mw IS NOT NULL AND actual_generation_mw > 0 AND absolute_error_mw IS NOT NULL AND ABS(absolute_percentage_error - ((absolute_error_mw / actual_generation_mw) * 100.0)) <= 0.01)",
    )
    op.create_check_constraint(
        "chk_eval_direction_flags",
        "forecast_evaluations",
        "(is_overforecast IS NULL AND is_underforecast IS NULL) OR "
        "(signed_error_mw > 0 AND is_overforecast IS TRUE AND is_underforecast IS FALSE) OR "
        "(signed_error_mw < 0 AND is_overforecast IS FALSE AND is_underforecast IS TRUE) OR "
        "(signed_error_mw = 0 AND is_overforecast IS FALSE AND is_underforecast IS FALSE)",
    )
    op.create_check_constraint(
        "chk_eval_abs_error_non_negative",
        "forecast_evaluations",
        "absolute_error_mw IS NULL OR absolute_error_mw >= 0.0",
    )
    op.create_check_constraint(
        "chk_eval_pct_error_non_negative",
        "forecast_evaluations",
        "absolute_percentage_error IS NULL OR absolute_percentage_error >= 0.0",
    )

    # 7. Create PL/pgSQL validation functions and triggers (single statements for asyncpg)
    op.execute(
        """
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
        """
    )
    op.execute("DROP TRIGGER IF EXISTS trg_validate_hourly_actual ON hourly_actuals;")
    op.execute(
        """
        CREATE TRIGGER trg_validate_hourly_actual
        BEFORE INSERT OR UPDATE ON hourly_actuals
        FOR EACH ROW EXECUTE FUNCTION fn_validate_hourly_actual();
        """
    )

    op.execute(
        """
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
        """
    )
    op.execute("DROP TRIGGER IF EXISTS trg_validate_forecast_evaluation ON forecast_evaluations;")
    op.execute(
        """
        CREATE TRIGGER trg_validate_forecast_evaluation
        BEFORE INSERT OR UPDATE ON forecast_evaluations
        FOR EACH ROW EXECUTE FUNCTION fn_validate_forecast_evaluation();
        """
    )


def downgrade() -> None:
    # 1. Drop validation triggers and functions
    op.execute("DROP TRIGGER IF EXISTS trg_validate_forecast_evaluation ON forecast_evaluations;")
    op.execute("DROP FUNCTION IF EXISTS fn_validate_forecast_evaluation();")
    op.execute("DROP TRIGGER IF EXISTS trg_validate_hourly_actual ON hourly_actuals;")
    op.execute("DROP FUNCTION IF EXISTS fn_validate_hourly_actual();")

    # 2. Drop check constraints
    op.drop_constraint("chk_eval_pct_error_non_negative", "forecast_evaluations", type_="check")
    op.drop_constraint("chk_eval_abs_error_non_negative", "forecast_evaluations", type_="check")
    op.drop_constraint("chk_eval_direction_flags", "forecast_evaluations", type_="check")
    op.drop_constraint("chk_eval_percentage_error", "forecast_evaluations", type_="check")
    op.drop_constraint("chk_eval_absolute_error", "forecast_evaluations", type_="check")
    op.drop_constraint("chk_eval_signed_error", "forecast_evaluations", type_="check")
    op.drop_constraint("chk_eval_on_the_hour", "forecast_evaluations", type_="check")
    op.drop_constraint("chk_hourly_actuals_on_the_hour", "hourly_actuals", type_="check")

    # 3. Drop unique constraints from hourly_actuals
    op.drop_constraint("uq_hourly_actuals_second_reading", "hourly_actuals", type_="unique")
    op.drop_constraint("uq_hourly_actuals_first_reading", "hourly_actuals", type_="unique")

    # 4. Drop added columns from forecast_evaluations
    op.drop_column("forecast_evaluations", "is_underforecast")
    op.drop_column("forecast_evaluations", "is_overforecast")
    op.drop_column("forecast_evaluations", "metric_version")
    op.drop_column("forecast_evaluations", "configuration_version")

    # 5. Revert NUMERIC columns back to DOUBLE PRECISION
    op.alter_column(
        "forecast_evaluations",
        "absolute_percentage_error",
        type_=sa.Double(),
        existing_type=sa.Numeric(10, 4),
        nullable=True,
    )
    op.alter_column(
        "forecast_evaluations",
        "absolute_error_mw",
        type_=sa.Double(),
        existing_type=sa.Numeric(12, 4),
        nullable=True,
    )
    op.alter_column(
        "forecast_evaluations",
        "signed_error_mw",
        type_=sa.Double(),
        existing_type=sa.Numeric(12, 4),
        nullable=True,
    )
    op.alter_column(
        "forecast_evaluations",
        "actual_generation_mw",
        type_=sa.Double(),
        existing_type=sa.Numeric(12, 4),
        nullable=True,
    )
    op.alter_column(
        "forecast_evaluations",
        "forecast_generation_mw",
        type_=sa.Double(),
        existing_type=sa.Numeric(12, 4),
        nullable=True,
    )
    op.alter_column(
        "hourly_actuals",
        "generation_mw",
        type_=sa.Double(),
        existing_type=sa.Numeric(12, 4),
        nullable=False,
    )
    op.alter_column(
        "raw_actual_records",
        "generation_mw",
        type_=sa.Double(),
        existing_type=sa.Numeric(12, 4),
        nullable=False,
    )
    op.alter_column(
        "raw_forecast_records",
        "generation_mw",
        type_=sa.Double(),
        existing_type=sa.Numeric(12, 4),
        nullable=False,
    )

    # 6. Recreate dropped indexes
    op.create_index(
        "idx_hourly_actuals_delivery_hour",
        "hourly_actuals",
        ["delivery_hour_utc"],
    )
    op.create_index(
        "idx_raw_actual_start_time",
        "raw_actual_records",
        ["source_start_time_utc"],
    )
