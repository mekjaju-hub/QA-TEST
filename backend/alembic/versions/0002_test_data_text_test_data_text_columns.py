"""test_data text columns

Revision ID: 0002_test_data_text
Revises: 0001_initial
Create Date: 2026-10-01 22:45:29.148669
"""
from alembic import op
import sqlalchemy as sa


revision = '0002_test_data_text'
down_revision = '0001_initial'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # batch mode works on both PostgreSQL and SQLite (dev mode)
    with op.batch_alter_table("test_data") as b:
        b.alter_column("value", existing_type=sa.VARCHAR(length=200), type_=sa.Text(), existing_nullable=False)
        b.alter_column("raw", existing_type=sa.VARCHAR(length=200), type_=sa.Text(), existing_nullable=True)


def downgrade() -> None:
    with op.batch_alter_table("test_data") as b:
        b.alter_column("raw", existing_type=sa.Text(), type_=sa.VARCHAR(length=200), existing_nullable=True)
        b.alter_column("value", existing_type=sa.Text(), type_=sa.VARCHAR(length=200), existing_nullable=False)
