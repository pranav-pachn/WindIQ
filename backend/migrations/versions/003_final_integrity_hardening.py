"""Final database integrity hardening: concurrency tracking, source immutability, zero-actual policy.

Revision ID: 003_final_integrity_hardening
Revises: 002_integrity_hardening
Create Date: 2026-11-04 19:45:00.000000

"""

# ruff: noqa: E501

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "003_final_integrity_hardening"
down_revision: str | None = "002_integrity_hardening"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Create hourly_actual_reading_usages table for concurrency-safe single-use enforcement
    op.create_table(
        "hourly_actual_reading_usages",
        sa.Column("raw_actual_record_id", sa.BigInteger(), nullable=False),
        sa.Column("hourly_actual_id", sa.BigInteger(), nullable=False),
        sa.Column("position", sa.SmallInteger(), nullable=False),
        sa.ForeignKeyConstraint(
            ["hourly_actual_id"],
            ["hourly_actuals.id"],
            name="fk_hourly_usage_hourly_actual",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["raw_actual_record_id"],
            ["raw_actual_records.id"],
            name="fk_hourly_usage_raw_actual",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("raw_actual_record_id", name="pk_hourly_actual_reading_usages"),
        sa.CheckConstraint("position IN (1, 2)", name="chk_hourly_usage_position"),
    )
    op.create_index(
        "idx_hourly_usage_hourly_actual_id",
        "hourly_actual_reading_usages",
        ["hourly_actual_id"],
    )

    # 2. Backfill existing hourly actual usages if any exist
    op.execute(
        """
        INSERT INTO hourly_actual_reading_usages (raw_actual_record_id, hourly_actual_id, position)
        SELECT first_half_hour_record_id, id, 1 FROM hourly_actuals
        UNION ALL
        SELECT second_half_hour_record_id, id, 2 FROM hourly_actuals;
        """
    )

    # 3. Trigger to maintain hourly_actual_reading_usages
    op.execute(
        """
        CREATE OR REPLACE FUNCTION fn_sync_hourly_actual_reading_usages()
        RETURNS TRIGGER AS $$
        BEGIN
            IF TG_OP = 'UPDATE' THEN
                DELETE FROM hourly_actual_reading_usages WHERE hourly_actual_id = OLD.id;
            END IF;

            INSERT INTO hourly_actual_reading_usages (raw_actual_record_id, hourly_actual_id, position)
            VALUES (NEW.first_half_hour_record_id, NEW.id, 1);

            INSERT INTO hourly_actual_reading_usages (raw_actual_record_id, hourly_actual_id, position)
            VALUES (NEW.second_half_hour_record_id, NEW.id, 2);

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute("DROP TRIGGER IF EXISTS trg_sync_hourly_actual_reading_usages ON hourly_actuals;")
    op.execute(
        """
        CREATE TRIGGER trg_sync_hourly_actual_reading_usages
        AFTER INSERT OR UPDATE ON hourly_actuals
        FOR EACH ROW EXECUTE FUNCTION fn_sync_hourly_actual_reading_usages();
        """
    )

    # 4. Update fn_validate_hourly_actual() with FOR SHARE row locking
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

            -- Fetch first half hour reading with FOR SHARE lock
            SELECT source_start_time_utc, generation_mw
            INTO v_first_start, v_first_gen
            FROM raw_actual_records
            WHERE id = NEW.first_half_hour_record_id
            FOR SHARE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'first_half_hour_record_id % not found in raw_actual_records', NEW.first_half_hour_record_id
                USING ERRCODE = 'foreign_key_violation';
            END IF;

            -- Fetch second half hour reading with FOR SHARE lock
            SELECT source_start_time_utc, generation_mw
            INTO v_second_start, v_second_gen
            FROM raw_actual_records
            WHERE id = NEW.second_half_hour_record_id
            FOR SHARE;

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
                SELECT 1 FROM hourly_actual_reading_usages
                WHERE raw_actual_record_id IN (NEW.first_half_hour_record_id, NEW.second_half_hour_record_id)
                  AND hourly_actual_id <> COALESCE(NEW.id, -1)
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

    # 5. Immutability trigger for raw_forecast_records
    op.execute(
        """
        CREATE OR REPLACE FUNCTION fn_protect_raw_forecast_record()
        RETURNS TRIGGER AS $$
        BEGIN
            IF EXISTS (SELECT 1 FROM forecast_evaluations WHERE forecast_record_id = OLD.id) THEN
                IF NEW.generation_mw <> OLD.generation_mw
                   OR NEW.publish_time_utc <> OLD.publish_time_utc
                   OR NEW.delivery_hour_utc <> OLD.delivery_hour_utc THEN
                    RAISE EXCEPTION 'Cannot modify raw_forecast_record (id=%) because it is referenced by forecast_evaluations', OLD.id
                    USING ERRCODE = 'restrict_violation';
                END IF;
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute("DROP TRIGGER IF EXISTS trg_protect_raw_forecast_record ON raw_forecast_records;")
    op.execute(
        """
        CREATE TRIGGER trg_protect_raw_forecast_record
        BEFORE UPDATE ON raw_forecast_records
        FOR EACH ROW EXECUTE FUNCTION fn_protect_raw_forecast_record();
        """
    )

    # 6. Immutability trigger for raw_actual_records
    op.execute(
        """
        CREATE OR REPLACE FUNCTION fn_protect_raw_actual_record()
        RETURNS TRIGGER AS $$
        BEGIN
            IF EXISTS (SELECT 1 FROM hourly_actual_reading_usages WHERE raw_actual_record_id = OLD.id) THEN
                IF NEW.generation_mw <> OLD.generation_mw
                   OR NEW.source_start_time_utc <> OLD.source_start_time_utc
                   OR NEW.settlement_date <> OLD.settlement_date
                   OR NEW.settlement_period <> OLD.settlement_period THEN
                    RAISE EXCEPTION 'Cannot modify raw_actual_record (id=%) because it is referenced by hourly_actuals', OLD.id
                    USING ERRCODE = 'restrict_violation';
                END IF;
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute("DROP TRIGGER IF EXISTS trg_protect_raw_actual_record ON raw_actual_records;")
    op.execute(
        """
        CREATE TRIGGER trg_protect_raw_actual_record
        BEFORE UPDATE ON raw_actual_records
        FOR EACH ROW EXECUTE FUNCTION fn_protect_raw_actual_record();
        """
    )

    # 7. Immutability trigger for hourly_actuals when referenced by forecast_evaluations
    op.execute(
        """
        CREATE OR REPLACE FUNCTION fn_protect_hourly_actual_eval()
        RETURNS TRIGGER AS $$
        BEGIN
            IF EXISTS (SELECT 1 FROM forecast_evaluations WHERE hourly_actual_id = OLD.id) THEN
                IF NEW.generation_mw <> OLD.generation_mw
                   OR NEW.delivery_hour_utc <> OLD.delivery_hour_utc
                   OR NEW.first_half_hour_record_id <> OLD.first_half_hour_record_id
                   OR NEW.second_half_hour_record_id <> OLD.second_half_hour_record_id THEN
                    RAISE EXCEPTION 'Cannot modify hourly_actual (id=%) because it is referenced by forecast_evaluations', OLD.id
                    USING ERRCODE = 'restrict_violation';
                END IF;
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute("DROP TRIGGER IF EXISTS trg_protect_hourly_actual_eval ON hourly_actuals;")
    op.execute(
        """
        CREATE TRIGGER trg_protect_hourly_actual_eval
        BEFORE UPDATE ON hourly_actuals
        FOR EACH ROW EXECUTE FUNCTION fn_protect_hourly_actual_eval();
        """
    )

    # 8. Immutability trigger for evaluation_configurations
    op.execute(
        """
        CREATE OR REPLACE FUNCTION fn_protect_evaluation_configuration()
        RETURNS TRIGGER AS $$
        BEGIN
            IF EXISTS (SELECT 1 FROM forecast_evaluations WHERE evaluation_configuration_id = OLD.id) THEN
                IF NEW.cutoff_hour <> OLD.cutoff_hour
                   OR NEW.cutoff_minute <> OLD.cutoff_minute
                   OR NEW.timezone <> OLD.timezone
                   OR NEW.metric_version <> OLD.metric_version
                   OR NEW.configuration_version <> OLD.configuration_version
                   OR NEW.configuration_name <> OLD.configuration_name THEN
                    RAISE EXCEPTION 'Cannot modify evaluation_configuration (id=%) because it is referenced by forecast_evaluations. Create a new configuration version instead.', OLD.id
                    USING ERRCODE = 'restrict_violation';
                END IF;
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        "DROP TRIGGER IF EXISTS trg_protect_evaluation_configuration ON evaluation_configurations;"
    )
    op.execute(
        """
        CREATE TRIGGER trg_protect_evaluation_configuration
        BEFORE UPDATE ON evaluation_configurations
        FOR EACH ROW EXECUTE FUNCTION fn_protect_evaluation_configuration();
        """
    )

    # 9. Check constraint enforcing NULL percentage error when actual generation is zero or negative
    op.create_check_constraint(
        "chk_eval_zero_actual_null_pct",
        "forecast_evaluations",
        "actual_generation_mw > 0 OR absolute_percentage_error IS NULL",
    )


def downgrade() -> None:
    # 1. Drop check constraint
    op.drop_constraint("chk_eval_zero_actual_null_pct", "forecast_evaluations", type_="check")

    # 2. Drop immutability triggers and functions
    op.execute(
        "DROP TRIGGER IF EXISTS trg_protect_evaluation_configuration ON evaluation_configurations;"
    )
    op.execute("DROP FUNCTION IF EXISTS fn_protect_evaluation_configuration();")

    op.execute("DROP TRIGGER IF EXISTS trg_protect_hourly_actual_eval ON hourly_actuals;")
    op.execute("DROP FUNCTION IF EXISTS fn_protect_hourly_actual_eval();")

    op.execute("DROP TRIGGER IF EXISTS trg_protect_raw_actual_record ON raw_actual_records;")
    op.execute("DROP FUNCTION IF EXISTS fn_protect_raw_actual_record();")

    op.execute("DROP TRIGGER IF EXISTS trg_protect_raw_forecast_record ON raw_forecast_records;")
    op.execute("DROP FUNCTION IF EXISTS fn_protect_raw_forecast_record();")

    # 3. Restore fn_validate_hourly_actual() to Phase 2.2.1 definition
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

    # 4. Drop sync trigger and function
    op.execute("DROP TRIGGER IF EXISTS trg_sync_hourly_actual_reading_usages ON hourly_actuals;")
    op.execute("DROP FUNCTION IF EXISTS fn_sync_hourly_actual_reading_usages();")

    # 5. Drop index and table
    op.drop_index("idx_hourly_usage_hourly_actual_id", table_name="hourly_actual_reading_usages")
    op.drop_table("hourly_actual_reading_usages")
