"""Test Runs API (P19–P20) — หัวข้อ 35: run / cancel / get / logs (+ rerun, import, artifacts)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.errors import AppError
from ..db import get_db
from ..models import AutomationArtifact, TestRun, TestRunArtifact
from ..repositories import audit
from ..services import run_service
from ..services.storage import get_storage
from ..services.tasks import enqueue_run
from .deps import Principal, get_project, require
from .serializers import run_out

router = APIRouter(prefix="/api", tags=["runs"])


class RunIn(BaseModel):
    node_ids: list[str] = []


class RerunIn(BaseModel):
    failed_only: bool = False


def _run(db: Session, rid: str) -> TestRun:
    r = db.get(TestRun, rid)
    if r is None:
        raise AppError("NOT_FOUND", "ไม่พบ Test Run", status=404)
    return r


@router.post("/automation/{aid}/run")
def run_artifact(aid: str, body: RunIn | None = None, p: Principal = Depends(require("run.execute")), db: Session = Depends(get_db)):
    a = db.get(AutomationArtifact, aid)
    if a is None:
        raise AppError("NOT_FOUND", "ไม่พบ Artifact", status=404)
    run = run_service.create_run(db, a, p.username, body.node_ids if body else None)
    db.commit()
    enqueue_run(run.id)
    db.refresh(run)
    return run_out(run)


@router.post("/test-runs/{rid}/cancel")
def cancel(rid: str, p: Principal = Depends(require("run.execute")), db: Session = Depends(get_db)):
    r = _run(db, rid)
    if r.status not in ("QUEUED", "RUNNING"):
        raise AppError("INVALID_STATE", f"Cancel ไม่ได้ในสถานะ {r.status}", status=409)
    r.cancel_requested = True
    audit(db, p.username, "TEST_RUN_CANCEL", rid[:8])
    db.commit()
    return run_out(r)


@router.post("/test-runs/{rid}/rerun")
def rerun(rid: str, body: RerunIn, p: Principal = Depends(require("run.execute")), db: Session = Depends(get_db)):
    r = _run(db, rid)
    a = db.get(AutomationArtifact, r.artifact_id) if r.artifact_id else None
    if a is None:
        raise AppError("NOT_RUNNABLE", "Run นี้มาจากการ Import — Re-run ไม่ได้", status=409)
    nodes = sorted({x.name.split("[")[0] for x in r.results if x.status == "FAILED"}) if body.failed_only else []
    if body.failed_only and not nodes:
        raise AppError("NOTHING_TO_RETRY", "ไม่มี Test ที่ Fail ให้ Retry", status=409)
    run = run_service.create_run(db, a, p.username, nodes)
    db.commit()
    enqueue_run(run.id)
    return run_out(run)


@router.get("/projects/{project_id}/test-runs")
def list_runs(project_id: str, p: Principal = Depends(require("run.view")), db: Session = Depends(get_db)):
    get_project(db, project_id)
    out = []
    for r in db.scalars(select(TestRun).where(TestRun.project_id == project_id).order_by(TestRun.started_at.desc()).limit(200)):
        d = run_out(r)
        d.pop("results")
        a = db.get(AutomationArtifact, r.artifact_id) if r.artifact_id else None
        d["artifact_name"] = a.name if a else None
        out.append(d)
    return out


@router.get("/test-runs/{rid}")
def get_run(rid: str, p: Principal = Depends(require("run.view")), db: Session = Depends(get_db)):
    r = _run(db, rid)
    d = run_out(r, with_logs=True)
    d["artifacts"] = [{"id": x.id, "kind": x.kind, "name": x.name, "size": x.size}
                      for x in db.scalars(select(TestRunArtifact).where(TestRunArtifact.run_id == r.id))]
    a = db.get(AutomationArtifact, r.artifact_id) if r.artifact_id else None
    d["artifact"] = {"id": a.id, "name": a.name, "kind": a.kind, "is_draft": a.is_draft} if a else None
    return d


@router.get("/test-runs/{rid}/logs")
def logs(rid: str, offset: int = 0, p: Principal = Depends(require("run.view")), db: Session = Depends(get_db)):
    """Incremental log streaming: client polls with the last offset it received."""
    r = _run(db, rid)
    return {"status": r.status, "progress": r.progress, "offset": len(r.stdout or ""), "stdout": (r.stdout or "")[offset:],
            "stderr": r.stderr if r.status not in ("QUEUED", "RUNNING") else ""}


@router.get("/test-runs/{rid}/artifacts/{art_id}")
def run_artifact_file(rid: str, art_id: str, p: Principal = Depends(require("run.view")), db: Session = Depends(get_db)):
    x = db.get(TestRunArtifact, art_id)
    if x is None or x.run_id != rid:
        raise AppError("NOT_FOUND", "ไม่พบไฟล์", status=404)
    media = {"junit": "application/xml", "html": "text/html", "screenshot": "image/png"}.get(x.kind, "text/plain")
    audit(db, p.username, "DOWNLOAD", x.name)
    db.commit()
    return Response(get_storage().read_bytes(x.storage_path), media_type=media,
                    headers={"Content-Disposition": f'attachment; filename="{x.name.rsplit("/", 1)[-1]}"', "Content-Security-Policy": "sandbox"})


@router.post("/projects/{project_id}/test-runs/import")
async def import_run(project_id: str, kind: str = Form(...), file: UploadFile = File(...), p: Principal = Depends(require("run.execute")),
                     db: Session = Depends(get_db)):
    get_project(db, project_id)
    if kind not in ("junit", "newman"):
        raise AppError("VALIDATION", "kind ต้องเป็น junit หรือ newman")
    data = await file.read(20 * 1024 * 1024 + 1)
    if len(data) > 20 * 1024 * 1024:
        raise AppError("FILE_TOO_LARGE", "ไฟล์ผลลัพธ์ใหญ่เกิน 20 MB", status=413)
    run = run_service.import_results(db, project_id, kind, data, p.username)
    db.commit()
    return run_out(run)
