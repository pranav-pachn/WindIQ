"""Initial database schema with seven core tables.

Revision ID: 001_initial_database_schema
Revises:
Create Date: 2026-11-04 15:50:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "001_initial_database_schema"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Ingestion Runs Table
    op.create_table(
        "ingestion_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("dataset", sa.String(length=32), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="PENDING"),
        sa.Column("records_fetched", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("records_inserted", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("records_rejected", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column(
            "metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.CheckConstraint(
            "status IN ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED')",
            name="chk_ingestion_runs_status",
        ),
    )
    op.create_index("idx_ingestion_runs_dataset_status", "ingestion_runs", ["dataset", "status"])
    op.create_index("idx_ingestion_runs_started_at", "ingestion_runs", ["started_at"])

    # 2. Raw Forecast Records (WINDFOR)
    op.create_table(
        "raw_forecast_records",
        sa.Column("id", sa.BigInteger(), autoincrement=True, primary_key=True),
        sa.Column("publish_time_utc", sa.DateTime(timezone=True), nullable=False),
        sa.Column("delivery_hour_utc", sa.DateTime(timezone=True), nullable=False),
        sa.Column("generation_mw", sa.Double(), nullable=False),
        sa.Column("source_dataset", sa.String(length=32), nullable=False, server_default="WINDFOR"),
        sa.Column(
            "ingestion_run_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("ingestion_runs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "publish_time_utc", "delivery_hour_utc", name="uq_raw_forecast_pub_del"
        ),
        sa.CheckConstraint("generation_mw >= 0.0", name="chk_raw_forecast_generation_non_negative"),
    )
    op.create_index(
        "idx_raw_forecast_delivery_publish",
        "raw_forecast_records",
        ["delivery_hour_utc", "publish_time_utc"],
    )
    op.create_index("idx_raw_forecast_publish_time", "raw_forecast_records", ["publish_time_utc"])

    # 3. Raw Actual Records (FUELHH)
    op.create_table(
        "raw_actual_records",
        sa.Column("id", sa.BigInteger(), autoincrement=True, primary_key=True),
        sa.Column("source_start_time_utc", sa.DateTime(timezone=True), nullable=False),
        sa.Column("settlement_date", sa.Date(), nullable=False),
        sa.Column("settlement_period", sa.SmallInteger(), nullable=False),
        sa.Column("generation_mw", sa.Double(), nullable=False),
        sa.Column("source_dataset", sa.String(length=32), nullable=False, server_default="FUELHH"),
        sa.Column(
            "ingestion_run_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("ingestion_runs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("source_start_time_utc", name="uq_raw_actual_start_time"),
        sa.CheckConstraint("generation_mw >= 0.0", name="chk_raw_actual_generation_non_negative"),
        sa.CheckConstraint(
            "settlement_period BETWEEN 1 AND 50", name="chk_raw_actual_settlement_period"
        ),
    )
    op.create_index(
        "idx_raw_actual_settlement", "raw_actual_records", ["settlement_date", "settlement_period"]
    )
    op.create_index("idx_raw_actual_start_time", "raw_actual_records", ["source_start_time_utc"])

    # 4. Hourly Actuals
    op.create_table(
        "hourly_actuals",
        sa.Column("id", sa.BigInteger(), autoincrement=True, primary_key=True),
        sa.Column("delivery_hour_utc", sa.DateTime(timezone=True), nullable=False),
        sa.Column("generation_mw", sa.Double(), nullable=False),
        sa.Column(
            "first_half_hour_record_id",
            sa.BigInteger(),
            sa.ForeignKey("raw_actual_records.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "second_half_hour_record_id",
            sa.BigInteger(),
            sa.ForeignKey("raw_actual_records.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("delivery_hour_utc", name="uq_hourly_actuals_delivery_hour"),
        sa.CheckConstraint(
            "first_half_hour_record_id <> second_half_hour_record_id",
            name="chk_hourly_actuals_distinct_readings",
        ),
        sa.CheckConstraint(
            "generation_mw >= 0.0", name="chk_hourly_actuals_generation_non_negative"
        ),
    )
    op.create_index("idx_hourly_actuals_delivery_hour", "hourly_actuals", ["delivery_hour_utc"])

    # 5. Evaluation Configurations
    op.create_table(
        "evaluation_configurations",
        sa.Column("id", sa.BigInteger(), autoincrement=True, primary_key=True),
        sa.Column("configuration_name", sa.String(length=64), nullable=False),
        sa.Column("timezone", sa.String(length=64), nullable=False, server_default="Europe/London"),
        sa.Column("cutoff_hour", sa.SmallInteger(), nullable=False),
        sa.Column("cutoff_minute", sa.SmallInteger(), nullable=False),
        sa.Column("metric_version", sa.String(length=32), nullable=False, server_default="v1.0"),
        sa.Column("configuration_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "configuration_name", "configuration_version", name="uq_eval_config_name_version"
        ),
        sa.CheckConstraint("cutoff_hour BETWEEN 0 AND 23", name="chk_eval_config_cutoff_hour"),
        sa.CheckConstraint("cutoff_minute BETWEEN 0 AND 59", name="chk_eval_config_cutoff_minute"),
    )

    # 6. Forecast Evaluations
    op.create_table(
        "forecast_evaluations",
        sa.Column("id", sa.BigInteger(), autoincrement=True, primary_key=True),
        sa.Column(
            "forecast_record_id",
            sa.BigInteger(),
            sa.ForeignKey("raw_forecast_records.id", ondelete="RESTRICT"),
            nullable=True,
        ),
        sa.Column(
            "hourly_actual_id",
            sa.BigInteger(),
            sa.ForeignKey("hourly_actuals.id", ondelete="RESTRICT"),
            nullable=True,
        ),
        sa.Column(
            "evaluation_configuration_id",
            sa.BigInteger(),
            sa.ForeignKey("evaluation_configurations.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("decision_date", sa.Date(), nullable=False),
        sa.Column("decision_cutoff_utc", sa.DateTime(timezone=True), nullable=False),
        sa.Column("delivery_hour_utc", sa.DateTime(timezone=True), nullable=False),
        sa.Column("forecast_generation_mw", sa.Double(), nullable=True),
        sa.Column("actual_generation_mw", sa.Double(), nullable=True),
        sa.Column("signed_error_mw", sa.Double(), nullable=True),
        sa.Column("absolute_error_mw", sa.Double(), nullable=True),
        sa.Column("absolute_percentage_error", sa.Double(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "delivery_hour_utc",
            "evaluation_configuration_id",
            name="uq_forecast_eval_delivery_config",
        ),
    )
    op.create_index(
        "idx_forecast_eval_delivery_date", "forecast_evaluations", ["delivery_hour_utc"]
    )
    op.create_index("idx_forecast_eval_decision_date", "forecast_evaluations", ["decision_date"])
    op.create_index(
        "idx_forecast_eval_config", "forecast_evaluations", ["evaluation_configuration_id"]
    )

    # 7. Data Quality Events
    op.create_table(
        "data_quality_events",
        sa.Column("id", sa.BigInteger(), autoincrement=True, primary_key=True),
        sa.Column(
            "ingestion_run_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("ingestion_runs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("dataset", sa.String(length=32), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("severity", sa.String(length=16), nullable=False, server_default="WARNING"),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("affected_timestamp", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "details",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "severity IN ('INFO', 'WARNING', 'ERROR', 'CRITICAL')", name="chk_dq_events_severity"
        ),
    )
    op.create_index("idx_dq_events_dataset_type", "data_quality_events", ["dataset", "event_type"])
    op.create_index("idx_dq_events_affected_ts", "data_quality_events", ["affected_timestamp"])


def downgrade() -> None:
    op.drop_table("data_quality_events")
    op.drop_table("forecast_evaluations")
    op.drop_table("evaluation_configurations")
    op.drop_table("hourly_actuals")
    op.drop_table("raw_actual_records")
    op.drop_table("raw_forecast_records")
    op.drop_table("ingestion_runs")
