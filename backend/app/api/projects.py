from __future__ import annotations

import re

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..core.errors import AppError
from ..db import get_db
from ..models import (
    AutomationArtifact, Document, DocumentVersion, ProcessingJob, Project, Requirement, RequirementConflict, TestCase,
    TestRun, TestScenario,
)
from ..repositories import audit, now
from .deps import Principal, get_project, require
from .serializers import iso, project_out, run_out

router = APIRouter(prefix="/api/projects", tags=["projects"])
APPROVED_STATES = ("APPROVED", "READY_FOR_AUTOMATION", "AUTOMATED")


class ProjectIn(BaseModel):
    code: str = Field(min_length=2, max_length=16)
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=4000)
    module_codes: list[str] = []


class ProjectPatch(BaseModel):
    code: str | None = Field(default=None, min_length=2, max_length=16)
    name: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    module_codes: list[str] | None = None


def _code(c: str) -> str:
    c = c.strip().upper()
    if not re.fullmatch(r"[A-Z][A-Z0-9]{1,15}", c):
        raise AppError("INVALID_CODE", "Project Code ต้องเป็นตัวพิมพ์ใหญ่/ตัวเลข 2–16 ตัว เริ่มด้วยตัวอักษร")
    return c


def _stats(db: Session, p: Project) -> dict:
    cnt = lambda m, *w: db.scalar(select(func.count()).select_from(m).where(*w)) or 0  # noqa: E731
    last_v = db.scalar(select(func.max(DocumentVersion.version)).join(Document).where(Document.project_id == p.id))
    return {"requirement_count": cnt(Requirement, Requirement.project_id == p.id, Requirement.is_latest.is_(True)),
            "test_case_count": cnt(TestCase, TestCase.project_id == p.id),
            "document_count": cnt(Document, Document.project_id == p.id), "latest_brs_version": last_v}


@router.get("")
def list_projects(p: Principal = Depends(require("project.view")), db: Session = Depends(get_db)):
    return [project_out(x, _stats(db, x)) for x in db.scalars(select(Project).order_by(Project.code))]


@router.post("")
def create_project(body: ProjectIn, p: Principal = Depends(require("project.manage")), db: Session = Depends(get_db)):
    code = _code(body.code)
    if db.scalar(select(Project).where(Project.code == code)):
        raise AppError("DUPLICATE", f"Project Code {code} มีอยู่แล้ว", status=409)
    pr = Project(code=code, name=body.name.strip(), description=body.description,
                 module_codes=[m.strip().upper() for m in body.module_codes if m.strip()], created_by=p.username)
    db.add(pr)
    audit(db, p.username, "PROJECT_CREATE", code, ip=p.ip)
    db.commit()
    return project_out(pr, _stats(db, pr))


@router.get("/{project_id}")
def get_project_detail(project_id: str, p: Principal = Depends(require("project.view")), db: Session = Depends(get_db)):
    pr = get_project(db, project_id)
    return project_out(pr, _stats(db, pr))


@router.patch("/{project_id}")
def patch_project(project_id: str, body: ProjectPatch, p: Principal = Depends(require("project.manage")), db: Session = Depends(get_db)):
    pr = get_project(db, project_id)
    if body.code and _code(body.code) != pr.code:
        if db.scalar(select(func.count()).select_from(Requirement).where(Requirement.project_id == pr.id)):
            raise AppError("CODE_LOCKED", "แก้ Project Code ไม่ได้หลังมี Requirement แล้ว (Code เป็นส่วนหนึ่งของทุก ID)", status=409)
        pr.code = _code(body.code)
    if body.name is not None:
        pr.name = body.name
    if body.description is not None:
        pr.description = body.description
    if body.module_codes is not None:
        pr.module_codes = [m.strip().upper() for m in body.module_codes if m.strip()]
    pr.updated_at = now()
    audit(db, p.username, "PROJECT_UPDATE", pr.code, ip=p.ip)
    db.commit()
    return project_out(pr, _stats(db, pr))


@router.get("/{project_id}/dashboard")
def dashboard(project_id: str, p: Principal = Depends(require("project.view")), db: Session = Depends(get_db)):
    """หัวข้อ 28 Dashboard."""
    pr = get_project(db, project_id)
    reqs = list(db.scalars(select(Requirement).where(Requirement.project_id == pr.id, Requirement.is_latest.is_(True))))
    tcs = list(db.scalars(select(TestCase).where(TestCase.project_id == pr.id)))
    scen = db.scalar(select(func.count()).select_from(TestScenario).where(TestScenario.project_id == pr.id)) or 0
    open_conf = db.scalar(select(func.count()).select_from(RequirementConflict)
                          .where(RequirementConflict.project_id == pr.id, RequirementConflict.status == "OPEN")) or 0
    arts = list(db.scalars(select(AutomationArtifact).where(AutomationArtifact.project_id == pr.id)))
    automated_ids = {tid for a in arts if not a.is_draft for tid in (a.test_case_ids or [])}
    runs = list(db.scalars(select(TestRun).where(TestRun.project_id == pr.id).order_by(TestRun.started_at.desc()).limit(10)))
    last = next((r for r in runs if r.status not in ("QUEUED", "RUNNING")), None)
    by_status: dict[str, int] = {}
    for t in tcs:
        by_status[t.status] = by_status.get(t.status, 0) + 1
    approved = sum(1 for t in tcs if t.status in APPROVED_STATES)
    jobs = list(db.execute(select(Document.name, DocumentVersion.version, ProcessingJob)
                           .join(DocumentVersion, DocumentVersion.document_id == Document.id)
                           .join(ProcessingJob, ProcessingJob.version_id == DocumentVersion.id)
                           .where(Document.project_id == pr.id).order_by(ProcessingJob.started_at.desc()).limit(10)))
    latest_v = db.execute(select(Document.name, DocumentVersion.version, DocumentVersion.created_at)
                          .join(DocumentVersion, DocumentVersion.document_id == Document.id)
                          .where(Document.project_id == pr.id).order_by(DocumentVersion.created_at.desc()).limit(1)).first()
    return {
        "project": project_out(pr),
        "kpi": {
            "requirements": len(reqs),
            "needs_clarification": sum(1 for r in reqs if r.status == "NEEDS_CLARIFICATION"),
            "conflicts": open_conf,
            "test_scenarios": scen,
            "test_cases": len(tcs),
            "approved": approved,
            "ready_for_automation": sum(1 for t in tcs if t.status == "READY_FOR_AUTOMATION"),
            "automated": sum(1 for t in tcs if t.id in automated_ids),
            "manual": sum(1 for t in tcs if t.id not in automated_ids),
            "automation_coverage": round(100 * sum(1 for t in tcs if t.id in automated_ids) / approved) if approved else 0,
        },
        "test_cases_by_status": by_status,
        "last_run": run_out(last) if last else None,
        "recent_runs": [{"id": r.id, "status": r.status, "summary": r.summary, "started_at": iso(r.started_at), "source": r.source} for r in runs],
        "processing_jobs": [{"document": n, "version": v, "job_id": j.id, "status": j.status, "stage": j.stage, "progress": j.progress,
                             "started_at": iso(j.started_at)} for n, v, j in jobs],
        "latest_brs": ({"document": latest_v[0], "version": latest_v[1], "uploaded_at": iso(latest_v[2])} if latest_v else None),
    }
