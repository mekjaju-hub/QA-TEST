"""Celery worker — runs Document Processing jobs and Test Runs in the background (หัวข้อ 4).

Shares code with the backend (`backend/app`) through PYTHONPATH, so there is a single implementation
of the pipeline. Start:
    celery -A worker.celery_app worker --loglevel=INFO --concurrency=2      (Linux/Docker)
    celery -A worker.celery_app worker --loglevel=INFO --pool=solo           (Windows dev)
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

BACKEND = Path(os.getenv("BACKEND_PATH", Path(__file__).resolve().parents[2] / "backend"))
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from celery import Celery  # noqa: E402

from app.config import get_settings  # noqa: E402

settings = get_settings()
celery = Celery("brsqa", broker=settings.redis_url, backend=settings.redis_url)
celery.conf.update(
    task_acks_late=True,               # job survives worker restart (Resume)
    worker_prefetch_multiplier=1,
    task_reject_on_worker_lost=True,
    task_time_limit=60 * 60 * 3,       # 3h hard limit for 200-page BRS
    task_soft_time_limit=60 * 60 * 2,
    broker_connection_retry_on_startup=True,
    task_default_retry_delay=30,
)


@celery.task(name="worker.process_job", bind=True, max_retries=3)
def process_job(self, job_id: str, only_failed: bool = False, section_ids: list[str] | None = None, username: str = "system"):
    """Run/Resume/Retry a processing job. Section-level failures are recorded per section, not retried blindly."""
    from app.db import SessionLocal
    from app.services.processing import run_job
    db = SessionLocal()
    try:
        job = run_job(db, job_id, only_failed=only_failed, section_ids=section_ids, username=username)
        return {"job_id": job.id, "status": job.status, "progress": job.progress}
    except Exception as exc:  # infrastructure error (DB down etc.) → Celery retry
        raise self.retry(exc=exc)
    finally:
        db.close()


@celery.task(name="worker.execute_run", bind=True, max_retries=0)
def execute_run(self, run_id: str):
    from app.db import SessionLocal
    from app.services.run_service import execute_run as _execute
    db = SessionLocal()
    try:
        run = _execute(db, run_id)
        return {"run_id": run.id, "status": run.status}
    finally:
        db.close()


app = celery  # `celery -A worker.celery_app` discovers `app`
