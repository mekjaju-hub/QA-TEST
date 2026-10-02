"""Worker tasks run eagerly against the real pipeline (no Redis needed)."""
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
tmp = Path(tempfile.mkdtemp())
os.environ.update({"DATABASE_URL": f"sqlite:///{(tmp / 'w.db').as_posix()}", "STORAGE_ROOT": str(tmp / "st"), "TASK_MODE": "sync"})
sys.path.insert(0, str(ROOT / "worker"))
sys.path.insert(0, str(ROOT / "backend"))


def test_process_job_task_eager():
    from worker.celery_app import celery, process_job
    from app.db import Base, SessionLocal, engine
    import app.models  # noqa: F401
    from app.models import Project
    from app.api.documents import _store_version
    celery.conf.task_always_eager = True
    Base.metadata.create_all(engine)
    db = SessionLocal()
    pr = Project(code="WRK", name="worker test")
    db.add(pr)
    db.commit()
    _, _, job = _store_version(db, project=pr, data=(ROOT / "samples" / "CAM_BRS_v1.txt").read_bytes(), filename="b.txt", ext="txt",
                               document_id=None, default_module="GENERAL", ai_mode="rule", username="t")
    res = process_job.delay(job.id).get()
    assert res["status"] == "READY_FOR_REVIEW"
    assert res["progress"] == 100
    db.close()
