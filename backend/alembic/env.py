from __future__ import annotations

import os

from alembic import context
from sqlalchemy import create_engine, pool

from app.config import get_settings
from app.db import Base
import app.models  # noqa: F401  (register tables)

target_metadata = Base.metadata


def _url() -> str:
    return os.getenv("DATABASE_URL") or get_settings().database_url


def run_migrations_offline() -> None:
    context.configure(url=_url(), target_metadata=target_metadata, literal_binds=True, render_as_batch=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = create_engine(_url(), poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata,
                          render_as_batch=connection.dialect.name == "sqlite", compare_type=True)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
