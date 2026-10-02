"""SINGLE_USER_MODE: one admin account, no forced password change, demo users disabled (run-dev / personal use)."""
import os
import sqlite3
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]


def _run(env, *args):
    r = subprocess.run([sys.executable, *args], cwd=BACKEND, env=env, capture_output=True, text=True, timeout=300)
    assert r.returncode == 0, r.stdout + r.stderr


def test_single_user_mode_seed(tmp_path):
    db = tmp_path / "su.sqlite3"
    env = {**os.environ, "DATABASE_URL": f"sqlite:///{db.as_posix()}", "STORAGE_ROOT": str(tmp_path / "files"),
           "TASK_MODE": "inline", "SECRET_KEY": "test-secret-key-0123456789abcdef0123", "PYTHONUTF8": "1"}
    env.pop("SINGLE_USER_MODE", None)
    _run(env, "-m", "alembic", "upgrade", "head")
    _run(env, "-m", "app.seed")                      # normal mode first: admin must change password, demo users active
    con = sqlite3.connect(db)
    assert con.execute("select must_change_password from users where username='admin'").fetchone()[0] == 1
    assert con.execute("select count(*) from users where active=1").fetchone()[0] == 4
    con.close()
    _run({**env, "SINGLE_USER_MODE": "true"}, "-m", "app.seed")   # switching an existing DB to single-user mode
    con = sqlite3.connect(db)
    assert con.execute("select must_change_password, active from users where username='admin'").fetchone() == (0, 1)
    assert [r[0] for r in con.execute("select username from users where active=1")] == ["admin"]
    con.close()
