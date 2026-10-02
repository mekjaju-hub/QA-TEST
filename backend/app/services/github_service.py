"""GitHub Integration (หัวข้อ 24): Proposal → Approve → Execute. Token stays on the backend.

Rules enforced here:
- No merge, no force push (refs are updated with force=false; new branch only), no branch deletion
- Forbidden files / secrets block the proposal (status BLOCKED)
- Every action needs an explicit approval before execute
"""
from __future__ import annotations

import base64
import difflib
import re

import httpx
from sqlalchemy.orm import Session

from ..config import get_settings
from ..core.errors import AppError
from ..core.masking import mask
from ..models import AutomationArtifact, GithubActionRequest, GithubIntegration
from ..repositories import audit, now
from . import automation_service as auto
from .generators import gen_github_workflow, scan_files_for_secrets

ACTIONS = ("CREATE_REPOSITORY", "CREATE_BRANCH_COMMIT_PR")
BRANCH_RE = re.compile(r"^(?!.*\.\.)(?!/)(?!.*//)[A-Za-z0-9._/\-]{1,100}(?<![/.])$")
_transport: httpx.BaseTransport | None = None  # tests inject httpx.MockTransport


def set_transport(t: httpx.BaseTransport | None) -> None:
    global _transport
    _transport = t


def _client() -> httpx.Client:
    st = get_settings()
    if not st.github_token:
        raise AppError("NEEDS_CONFIGURATION", "ยังไม่ได้ตั้งค่า GITHUB_TOKEN ฝั่ง Backend", status=400,
                       action="ตั้ง GITHUB_TOKEN (Fine-grained PAT หรือ GitHub App token) ใน .env แล้ว Restart")
    return httpx.Client(base_url=st.github_api_url, timeout=30, transport=_transport,
                        headers={"Authorization": f"Bearer {st.github_token}", "Accept": "application/vnd.github+json",
                                 "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "brs-qa-platform"})


def _check(res: httpx.Response, what: str) -> dict:
    if res.status_code >= 400:
        raise AppError("GITHUB_API_ERROR", f"GitHub API ผิดพลาด: {what}", status=502, retryable=res.status_code >= 500,
                       technical=mask(f"{res.status_code} {res.text[:300]}"))
    return res.json() if res.content else {}


def connect(db: Session, project_id: str, owner: str, repo: str, default_branch: str, username: str) -> GithubIntegration:
    gi = db.query(GithubIntegration).filter_by(project_id=project_id).first() or GithubIntegration(project_id=project_id)
    gi.owner, gi.repo, gi.default_branch, gi.updated_at = owner.strip(), repo.strip(), default_branch.strip() or "main", now()
    if not get_settings().github_token:
        gi.status = "NEEDS_CONFIGURATION"
    else:
        with _client() as c:
            r = c.get(f"/repos/{gi.owner}/{gi.repo}")
            gi.status = "CONNECTED" if r.status_code == 200 else ("REPO_NOT_FOUND" if r.status_code == 404 else "ERROR")
            if r.status_code == 200:
                gi.default_branch = r.json().get("default_branch", gi.default_branch)
    db.add(gi)
    audit(db, username, "GITHUB_CONNECT", f"{owner}/{repo}", gi.status)
    db.flush()
    return gi


def propose(db: Session, project_id: str, artifact_id: str | None, action_type: str, branch: str, commit_message: str,
            repository: str, username: str) -> GithubActionRequest:
    if action_type not in ACTIONS:
        raise AppError("VALIDATION", "Action Type ไม่ถูกต้อง")
    if action_type == "CREATE_BRANCH_COMMIT_PR" and not BRANCH_RE.match(branch or ""):
        raise AppError("VALIDATION", "ชื่อ Branch ไม่ถูกต้อง")
    if branch in ("main", "master"):
        raise AppError("VALIDATION", "ห้าม Commit ตรงเข้า main/master — ใช้ Branch ใหม่ + Pull Request")
    files: dict[str, str] = {}
    if artifact_id:
        a = db.get(AutomationArtifact, artifact_id)
        if a is None or a.project_id != project_id:
            raise AppError("NOT_FOUND", "ไม่พบ Artifact", status=404)
        if a.is_draft:
            raise AppError("DRAFT_ARTIFACT", "Artifact นี้เป็น DRAFT — ห้าม Push จนกว่า Test Case จะ Approved", status=409)
        files = auto.all_files(a)
        if a.kind in ("python", "pytest", "playwright") and ".github/workflows/qa-automation.yml" not in files:
            files[".github/workflows/qa-automation.yml"] = gen_github_workflow({"code": a.name.split("-")[0], "name": a.name})
    problems = scan_files_for_secrets(files)
    diff = "".join("".join(difflib.unified_diff([], c.splitlines(True), fromfile="/dev/null", tofile=f"b/{p}")) for p, c in sorted(files.items()))
    req = GithubActionRequest(project_id=project_id, artifact_id=artifact_id, action_type=action_type, repository=repository,
                              branch=branch or "", commit_message=commit_message, files=sorted(files), diff=diff[:500_000],
                              scan_problems=problems, status="BLOCKED" if problems else "PROPOSED", proposed_by=username)
    db.add(req)
    audit(db, username, "GITHUB_PROPOSE", f"{repository}:{branch}", f"{action_type} files={len(files)} {'BLOCKED' if problems else ''}")
    db.flush()
    return req


def approve(db: Session, req: GithubActionRequest, username: str) -> GithubActionRequest:
    if req.status != "PROPOSED":
        raise AppError("INVALID_STATE", f"อนุมัติไม่ได้ในสถานะ {req.status}", status=409)
    req.status, req.approved_by, req.approved_at = "APPROVED", username, now()
    audit(db, username, "GITHUB_APPROVE", f"{req.repository}:{req.branch}", req.action_type)
    return req


def execute(db: Session, req: GithubActionRequest, username: str) -> GithubActionRequest:
    if req.status != "APPROVED":
        raise AppError("NOT_APPROVED", "ต้องได้รับอนุมัติก่อน Execute", status=409)
    owner, _, repo = req.repository.partition("/")
    if not owner or not repo:
        raise AppError("VALIDATION", "Repository ต้องอยู่ในรูปแบบ owner/repo")
    try:
        with _client() as c:
            if req.action_type == "CREATE_REPOSITORY":
                me = _check(c.get("/user"), "get user")
                url = "/user/repos" if me.get("login", "").lower() == owner.lower() else f"/orgs/{owner}/repos"
                r = _check(c.post(url, json={"name": repo, "private": True, "auto_init": True,
                                             "description": "QA automation generated by BRS to QA Automation Platform"}), "create repository")
                req.result = {"html_url": r.get("html_url"), "private": r.get("private")}
            else:
                req.result = _commit_and_pr(c, db, req, owner, repo)
    except AppError as e:
        req.status, req.result = "FAILED", {"error": e.to_dict(include_technical=True)}
        audit(db, username, "GITHUB_EXECUTE_FAILED", f"{req.repository}:{req.branch}", e.code)
        raise
    req.status, req.executed_at = "EXECUTED", now()
    audit(db, username, "GITHUB_EXECUTE", f"{req.repository}:{req.branch}", str(req.result)[:300])
    return req


def _commit_and_pr(c: httpx.Client, db: Session, req: GithubActionRequest, owner: str, repo: str) -> dict:
    base = req.base_branch or "main"
    repo_info = _check(c.get(f"/repos/{owner}/{repo}"), "get repository")
    base = repo_info.get("default_branch", base)
    base_ref = _check(c.get(f"/repos/{owner}/{repo}/git/ref/heads/{base}"), "get base branch")
    base_sha = base_ref["object"]["sha"]
    if c.get(f"/repos/{owner}/{repo}/git/ref/heads/{req.branch}").status_code == 200:
        raise AppError("BRANCH_EXISTS", f"Branch {req.branch} มีอยู่แล้ว — ระบบไม่ Force Push/เขียนทับ", status=409, action="ใช้ชื่อ Branch ใหม่")
    base_commit = _check(c.get(f"/repos/{owner}/{repo}/git/commits/{base_sha}"), "get base commit")
    a = db.get(AutomationArtifact, req.artifact_id) if req.artifact_id else None
    files = auto.all_files(a) if a else {}
    if a and a.kind in ("python", "pytest", "playwright"):
        files.setdefault(".github/workflows/qa-automation.yml", gen_github_workflow({"code": a.name.split("-")[0], "name": a.name}))
    if scan_files_for_secrets(files):  # re-check at execution time (file may have been edited after approval)
        raise AppError("SECRET_DETECTED", "พบไฟล์ต้องห้าม/Secret — ยกเลิกการ Push", status=409)
    tree = []
    for path, content in sorted(files.items()):
        blob = _check(c.post(f"/repos/{owner}/{repo}/git/blobs", json={"content": base64.b64encode(content.encode()).decode(), "encoding": "base64"}), "create blob")
        tree.append({"path": path, "mode": "100644", "type": "blob", "sha": blob["sha"]})
    new_tree = _check(c.post(f"/repos/{owner}/{repo}/git/trees", json={"base_tree": base_commit["tree"]["sha"], "tree": tree}), "create tree")
    commit = _check(c.post(f"/repos/{owner}/{repo}/git/commits", json={"message": req.commit_message, "tree": new_tree["sha"], "parents": [base_sha]}), "create commit")
    _check(c.post(f"/repos/{owner}/{repo}/git/refs", json={"ref": f"refs/heads/{req.branch}", "sha": commit["sha"]}), "create branch")
    pr = _check(c.post(f"/repos/{owner}/{repo}/pulls", json={"title": req.commit_message.splitlines()[0][:120], "head": req.branch, "base": base,
                                                             "body": f"Generated by BRS to QA Automation Platform\n\nTest cases: {', '.join(a.tc_codes) if a else '-'}\n\n"
                                                                     "⚠️ Review required — this PR is never merged automatically.", "draft": False}), "create pull request")
    return {"commit": commit["sha"], "branch": req.branch, "pull_request": pr.get("html_url"), "files": len(tree), "merged": False}
