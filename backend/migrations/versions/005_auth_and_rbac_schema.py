"""Phase 4.1: Authentication, RBAC, Refresh Token Family Chains, Scoped API Keys, and Immutable Audit Log.

Revision ID: 005_auth_and_rbac_schema
Revises: 004_ingestion_run_tracking
Create Date: 2026-11-05 22:30:00.000000

"""

# ruff: noqa: E501

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "005_auth_and_rbac_schema"
down_revision: str | None = "004_ingestion_run_tracking"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Users Table
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=True),
        sa.Column("role", sa.String(length=32), nullable=False, server_default="Viewer"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index("idx_users_email", "users", ["email"])

    # 2. Refresh Token Family Chains Table
    op.create_table(
        "refresh_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("family_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("jti", sa.String(length=64), nullable=False),
        sa.Column("hashed_token", sa.String(length=64), nullable=False),
        sa.Column("is_used", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_revoked", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("replaced_by_jti", sa.String(length=64), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE", name="fk_refresh_tokens_user_id"),
        sa.UniqueConstraint("jti", name="uq_refresh_tokens_jti"),
        sa.UniqueConstraint("hashed_token", name="uq_refresh_tokens_hashed_token"),
    )
    op.create_index("idx_refresh_tokens_family", "refresh_tokens", ["family_id"])
    op.create_index("idx_refresh_tokens_user", "refresh_tokens", ["user_id"])

    # 3. Scoped Machine-to-Machine API Keys Table
    op.create_table(
        "api_keys",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("key_prefix", sa.String(length=17), nullable=False),
        sa.Column("hashed_key", sa.String(length=64), nullable=False),
        sa.Column("scopes", sa.ARRAY(sa.String()), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_revoked", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE", name="fk_api_keys_user_id"),
        sa.UniqueConstraint("hashed_key", name="uq_api_keys_hashed_key"),
    )
    op.create_index("idx_api_keys_user", "api_keys", ["user_id"])

    # 4. Security Audit Event Log Table
    op.create_table(
        "security_audit_logs",
        sa.Column("id", sa.BigInteger(), autoincrement=True, primary_key=True),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("ip_address", sa.String(length=64), nullable=False),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("details", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL", name="fk_security_audit_user_id"),
    )
    op.create_index("idx_security_audit_created_desc", "security_audit_logs", ["created_at"])

    # 5. Immutability Trigger: Prohibits UPDATE and DELETE operations on security_audit_logs
    op.execute(
        """
        CREATE OR REPLACE FUNCTION prevent_audit_log_tampering()
        RETURNS TRIGGER AS $$
        BEGIN
            RAISE EXCEPTION 'security_audit_logs is an append-only audit table. UPDATE and DELETE operations are prohibited.';
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_security_audit_immutable
        BEFORE UPDATE OR DELETE ON security_audit_logs
        FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_tampering();
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_security_audit_immutable ON security_audit_logs;")
    op.execute("DROP FUNCTION IF EXISTS prevent_audit_log_tampering();")
    op.drop_table("security_audit_logs")
    op.drop_table("api_keys")
    op.drop_table("refresh_tokens")
    op.drop_table("users")
