"""Background task dispatch.

TASK_MODE=celery → send to Redis/Celery (worker/ service)
TASK_MODE=inline → run in a daemon thread inside the API process (Development Mode without Docker)
TASK_MODE=sync   → run immediately (tests)
"""
from __future__ import annotations

import logging
import threading

from ..config import get_settings
from ..db import SessionLocal

log = logging.getLogger("tasks")


def _run_processing(job_id: str, only_failed: bool, section_ids: list[str] | None, username: str) -> None:
    from .processing import run_job
    db = SessionLocal()
    try:
        run_job(db, job_id, only_failed=only_failed, section_ids=section_ids, username=username)
    except Exception:  # noqa: BLE001
        log.exception("processing job %s crashed", job_id)
    finally:
        db.close()


def _run_test(run_id: str) -> None:
    from .run_service import execute_run
    db = SessionLocal()
    try:
        execute_run(db, run_id)
    except Exception:  # noqa: BLE001
        log.exception("test run %s crashed", run_id)
    finally:
        db.close()


def _dispatch(celery_name: str, fn, *args) -> None:
    mode = get_settings().task_mode
    if mode == "celery":
        from celery import Celery
        app = Celery(broker=get_settings().redis_url)
        app.send_task(celery_name, args=list(args))
    elif mode == "sync":
        fn(*args)
    else:
        threading.Thread(target=fn, args=args, daemon=True).start()


def enqueue_processing(job_id: str, *, only_failed: bool = False, section_ids: list[str] | None = None, username: str = "system") -> None:
    _dispatch("worker.process_job", _run_processing, job_id, only_failed, section_ids, username)


def enqueue_run(run_id: str) -> None:
    _dispatch("worker.execute_run", _run_test, run_id)
