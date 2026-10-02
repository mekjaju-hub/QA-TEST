"""Stage 3: schema + Alembic migration (หัวข้อ 34)."""
import os
import subprocess
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect

BACKEND = Path(__file__).resolve().parents[1]

REQUIRED = """users roles user_roles projects project_members documents document_versions document_sections
document_images processing_jobs processing_job_sections requirements requirement_versions requirement_sources
requirement_questions requirement_assumptions requirement_conflicts test_scenarios test_scenario_versions test_cases
test_case_versions test_steps test_data automation_artifacts python_artifacts pytest_artifacts postman_artifacts
sql_artifacts playwright_artifacts jmeter_artifacts test_runs test_run_results test_run_artifacts github_integrations
github_action_requests audit_logs comments approvals application_settings""".split()


def _alembic(url: str, *args: str) -> None:
    env = {**os.environ, "DATABASE_URL": url}
    subprocess.run([sys.executable, "-m", "alembic", *args], cwd=BACKEND, env=env, check=True, capture_output=True)


def _check(url: str) -> None:
    _alembic(url, "upgrade", "head")
    tables = set(inspect(create_engine(url)).get_table_names())
    missing = [t for t in REQUIRED if t not in tables]
    assert not missing, missing
    _alembic(url, "downgrade", "base")
    assert set(inspect(create_engine(url)).get_table_names()) <= {"alembic_version"}


def test_migration_sqlite(tmp_path):
    _check(f"sqlite:///{tmp_path / 'm.db'}")


@pytest.mark.postgres
@pytest.mark.skipif(not os.getenv("TEST_POSTGRES_URL"), reason="TEST_POSTGRES_URL not set")
def test_migration_postgres():
    _check(os.environ["TEST_POSTGRES_URL"])


def test_models_match_migration(tmp_path):
    """Autogenerate must produce no diff → models and migration are in sync."""
    from alembic.autogenerate import compare_metadata
    from alembic.migration import MigrationContext
    from app.db import Base
    import app.models  # noqa: F401
    url = f"sqlite:///{tmp_path / 'c.db'}"
    _alembic(url, "upgrade", "head")
    with create_engine(url).connect() as conn:
        diff = compare_metadata(MigrationContext.configure(conn), Base.metadata)
    assert diff == []
