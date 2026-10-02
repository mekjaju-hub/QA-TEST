"""Automation Generators API (P13–P18)."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import PlainTextResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..core.errors import AppError
from ..db import get_db
from ..models import AutomationArtifact, JmeterArtifact, TestCase
from ..repositories import audit, now
from ..services import automation_service as svc
from ..services.generators import SQL_TYPES, locators_from_html, locators_from_recording
from .admin import runtime_settings
from .deps import Principal, get_project, require
from .serializers import artifact_out

router = APIRouter(prefix="/api", tags=["automation"])


class GenerateIn(BaseModel):
    kind: str = Field(pattern="^(python|pytest|postman|sql|playwright|jmeter|github_actions)$")
    test_case_ids: list[str] = []
    draft: bool = False
    options: dict = {}


class TcGenIn(BaseModel):
    draft: bool = False
    options: dict = {}


class FileIn(BaseModel):
    path: str = Field(min_length=1, max_length=400)
    content: str


class ResetIn(BaseModel):
    path: str | None = None


class HtmlIn(BaseModel):
    html: str = Field(min_length=1, max_length=200_000)


def _art(db: Session, aid: str) -> AutomationArtifact:
    a = db.get(AutomationArtifact, aid)
    if a is None:
        raise AppError("NOT_FOUND", "ไม่พบ Artifact", status=404)
    return a


@router.get("/automation/meta")
def meta(p: Principal = Depends(require("auto.view")), db: Session = Depends(get_db)):
    st = runtime_settings(db)
    return {"sql_types": SQL_TYPES, "auth_types": ["none", "basic", "bearer", "apikey", "oauth2", "cookie"],
            "browsers": ["chromium", "msedge", "firefox"], "env_allowlist": st["env_allowlist"],
            "jmeter_max_users": st["jmeter_max_users"], "jmeter_max_minutes": st["jmeter_max_minutes"]}


@router.post("/projects/{project_id}/automation/generate")
def generate(project_id: str, body: GenerateIn, p: Principal = Depends(require("auto.generate")), db: Session = Depends(get_db)):
    pr = get_project(db, project_id)
    a = svc.generate(db, pr, body.kind, body.test_case_ids, draft=body.draft, options=body.options, username=p.username,
                     runtime=runtime_settings(db))
    db.commit()
    return artifact_out(a)


def _gen_for_tc(kind: str):
    def endpoint(tid: str, body: TcGenIn | None = None, p: Principal = Depends(require("auto.generate")), db: Session = Depends(get_db)):
        t = db.get(TestCase, tid)
        if t is None:
            raise AppError("NOT_FOUND", "ไม่พบ Test Case", status=404)
        a = svc.generate(db, get_project(db, t.project_id), kind, [t.id], draft=bool(body and body.draft),
                         options=(body.options if body else {}), username=p.username, runtime=runtime_settings(db))
        db.commit()
        return artifact_out(a)
    return endpoint


for _k in ("python", "pytest", "postman", "sql", "playwright"):  # หัวข้อ 35: POST /api/test-cases/{id}/{kind}/generate
    router.add_api_route(f"/test-cases/{{tid}}/{_k}/generate", _gen_for_tc(_k), methods=["POST"], name=f"generate_{_k}")


@router.get("/projects/{project_id}/automation")
def list_artifacts(project_id: str, kind: str | None = None, p: Principal = Depends(require("auto.view")), db: Session = Depends(get_db)):
    get_project(db, project_id)
    return [artifact_out(a) for a in svc.list_artifacts(db, project_id, kind)]


@router.get("/automation/{aid}")
def get_artifact(aid: str, p: Principal = Depends(require("auto.view")), db: Session = Depends(get_db)):
    a = _art(db, aid)
    out = artifact_out(a)
    out["contents"] = svc.all_files(a)
    out["ai_contents"] = svc.all_files(a, "ai")
    jm = db.query(JmeterArtifact).filter_by(artifact_id=a.id).first()
    if jm:
        out["jmeter"] = {"approved_by": jm.approved_by, "target_url": jm.target_url, "profile": jm.profile}
    return out


@router.put("/automation/{aid}/files")
def save_file(aid: str, body: FileIn, p: Principal = Depends(require("auto.edit")), db: Session = Depends(get_db)):
    a = _art(db, aid)
    problems = svc.save_file(db, a, body.path, body.content, p.username)
    db.commit()
    return {"artifact": artifact_out(a), "warnings": problems}


@router.post("/automation/{aid}/reset")
def reset(aid: str, body: ResetIn, p: Principal = Depends(require("auto.edit")), db: Session = Depends(get_db)):
    a = _art(db, aid)
    svc.reset_file(db, a, body.path, p.username)
    db.commit()
    return artifact_out(a)


@router.get("/automation/{aid}/diff", response_class=PlainTextResponse)
def diff(aid: str, path: str, p: Principal = Depends(require("auto.view")), db: Session = Depends(get_db)):
    return svc.diff(_art(db, aid), path)


@router.get("/automation/{aid}/download")
def download_file(aid: str, path: str, p: Principal = Depends(require("auto.view")), db: Session = Depends(get_db)):
    a = _art(db, aid)
    content = svc.read_file(a, path)
    audit(db, p.username, "DOWNLOAD", f"{a.name}/{path}")
    db.commit()
    return Response(content.encode("utf-8"), media_type="text/plain; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{path.rsplit("/", 1)[-1]}"'})


@router.get("/automation/{aid}/zip")
def download_zip(aid: str, p: Principal = Depends(require("auto.view")), db: Session = Depends(get_db)):
    a = _art(db, aid)
    data = svc.zip_bytes(a)
    audit(db, p.username, "DOWNLOAD", f"{a.name}.zip")
    db.commit()
    return Response(data, media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="{a.name}.zip"'})


@router.post("/automation/{aid}/jmeter/approve")
def approve_jmeter(aid: str, p: Principal = Depends(require("github.approve")), db: Session = Depends(get_db)):
    """Approval before run (หัวข้อ 26). The run itself is done outside production via the Runner Interface."""
    a = _art(db, aid)
    jm = db.query(JmeterArtifact).filter_by(artifact_id=a.id).first()
    if jm is None:
        raise AppError("VALIDATION", "Artifact นี้ไม่ใช่ JMeter Plan")
    jm.approved_by = p.username
    a.status, a.updated_at = "APPROVED", now()
    audit(db, p.username, "JMETER_APPROVE", a.name, jm.target_url)
    db.commit()
    return artifact_out(a)


@router.post("/playwright/locators/from-html")
def locator_advisor(body: HtmlIn, p: Principal = Depends(require("auto.generate"))):
    """Reads ONLY the DOM the user pasted (permitted DOM) and proposes locators; user approves before script generation."""
    return {"locators": locators_from_html(body.html)}


@router.post("/playwright/locators/from-recording")
def locator_from_recording(body: HtmlIn, p: Principal = Depends(require("auto.generate"))):
    return {"locators": locators_from_recording(body.html)}
