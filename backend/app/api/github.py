"""GitHub Integration API (P21) — หัวข้อ 35: connect / repository/propose / action/approve / action/execute."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..core.errors import AppError
from ..db import get_db
from ..models import GithubActionRequest, GithubIntegration
from ..services import github_service as gh
from .deps import Principal, get_project, require
from .serializers import gh_out

router = APIRouter(prefix="/api", tags=["github"])


class ConnectIn(BaseModel):
    project_id: str
    owner: str = Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9_.\-]+$")
    repo: str = Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9_.\-]+$")
    default_branch: str = "main"


class ProposeIn(BaseModel):
    project_id: str
    artifact_id: str | None = None
    action_type: str = Field(pattern="^(CREATE_REPOSITORY|CREATE_BRANCH_COMMIT_PR)$")
    repository: str = Field(pattern=r"^[A-Za-z0-9_.\-]+/[A-Za-z0-9_.\-]+$")
    branch: str = ""
    commit_message: str = Field(min_length=3, max_length=2000)


class ReqIn(BaseModel):
    request_id: str


def _req(db: Session, rid: str) -> GithubActionRequest:
    r = db.get(GithubActionRequest, rid)
    if r is None:
        raise AppError("NOT_FOUND", "ไม่พบ Proposal", status=404)
    return r


@router.get("/projects/{project_id}/github")
def overview(project_id: str, p: Principal = Depends(require("github.propose")), db: Session = Depends(get_db)):
    get_project(db, project_id)
    gi = db.query(GithubIntegration).filter_by(project_id=project_id).first()
    reqs = db.scalars(select(GithubActionRequest).where(GithubActionRequest.project_id == project_id).order_by(GithubActionRequest.created_at.desc()))
    return {"token_configured": bool(get_settings().github_token),
            "integration": {"owner": gi.owner, "repo": gi.repo, "default_branch": gi.default_branch, "status": gi.status} if gi else None,
            "requests": [gh_out(r) for r in reqs]}


@router.post("/github/connect")
def connect(body: ConnectIn, p: Principal = Depends(require("github.propose")), db: Session = Depends(get_db)):
    get_project(db, body.project_id)
    gi = gh.connect(db, body.project_id, body.owner, body.repo, body.default_branch, p.username)
    db.commit()
    return {"owner": gi.owner, "repo": gi.repo, "default_branch": gi.default_branch, "status": gi.status}


@router.post("/github/repository/propose")
def propose(body: ProposeIn, p: Principal = Depends(require("github.propose")), db: Session = Depends(get_db)):
    get_project(db, body.project_id)
    r = gh.propose(db, body.project_id, body.artifact_id, body.action_type, body.branch, body.commit_message, body.repository, p.username)
    db.commit()
    return gh_out(r)


@router.post("/github/action/approve")
def approve(body: ReqIn, p: Principal = Depends(require("github.approve")), db: Session = Depends(get_db)):
    r = gh.approve(db, _req(db, body.request_id), p.username)
    db.commit()
    return gh_out(r)


@router.post("/github/action/reject")
def reject(body: ReqIn, p: Principal = Depends(require("github.approve")), db: Session = Depends(get_db)):
    r = _req(db, body.request_id)
    if r.status not in ("PROPOSED", "APPROVED", "BLOCKED"):
        raise AppError("INVALID_STATE", f"ปฏิเสธไม่ได้ในสถานะ {r.status}", status=409)
    r.status = "REJECTED"
    db.commit()
    return gh_out(r)


@router.post("/github/action/execute")
def execute(body: ReqIn, p: Principal = Depends(require("github.approve")), db: Session = Depends(get_db)):
    r = _req(db, body.request_id)
    try:
        gh.execute(db, r, p.username)
    finally:
        db.commit()
    return gh_out(r)
