"""Add ingestion run time window, already present count, and partial success status.

Revision ID: 004_ingestion_run_tracking
Revises: 003_final_integrity_hardening
Create Date: 2026-11-04 20:05:00.000000

"""

# ruff: noqa: E501

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "004_ingestion_run_tracking"
down_revision: str | None = "003_final_integrity_hardening"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Add time window and records_already_present columns
    op.add_column(
        "ingestion_runs",
        sa.Column("time_window_start_utc", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "ingestion_runs",
        sa.Column("time_window_end_utc", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "ingestion_runs",
        sa.Column(
            "records_already_present",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )

    # 2. Update status check constraint to include PARTIAL_SUCCESS
    op.drop_constraint("chk_ingestion_runs_status", "ingestion_runs", type_="check")
    op.create_check_constraint(
        "chk_ingestion_runs_status",
        "ingestion_runs",
        "status IN ('PENDING', 'RUNNING', 'SUCCESS', 'PARTIAL_SUCCESS', 'FAILED')",
    )

    # 3. Add window query index
    op.create_index(
        "idx_ingestion_runs_window",
        "ingestion_runs",
        ["dataset", "time_window_start_utc", "time_window_end_utc"],
    )


def downgrade() -> None:
    # 1. Drop index
    op.drop_index("idx_ingestion_runs_window", table_name="ingestion_runs")

    # 2. Revert check constraint
    op.drop_constraint("chk_ingestion_runs_status", "ingestion_runs", type_="check")
    op.create_check_constraint(
        "chk_ingestion_runs_status",
        "ingestion_runs",
        "status IN ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED')",
    )

    # 3. Drop added columns
    op.drop_column("ingestion_runs", "records_already_present")
    op.drop_column("ingestion_runs", "time_window_end_utc")
    op.drop_column("ingestion_runs", "time_window_start_utc")
