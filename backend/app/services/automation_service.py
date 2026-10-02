"""Automation artifacts: generate, store (AI version + editable current), edit, reset, diff, ZIP (หัวข้อ 18, 20–26).

Storage layout: artifacts/{project_code}/{artifact_id}/ai/<files>     (immutable AI version)
                artifacts/{project_code}/{artifact_id}/current/<files> (Code Draft edited by QA)
"""
from __future__ import annotations

import difflib
import io
import zipfile

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.errors import AppError
from ..models import (
    AutomationArtifact, JmeterArtifact, PlaywrightArtifact, PostmanArtifact, Project, PytestArtifact, PythonArtifact, Requirement,
    SqlArtifact, TestCase,
)
from ..repositories import audit, next_seq, now, req_to_engine
from .generators import (
    GenTC, gen_github_workflow, gen_jmeter, gen_playwright, gen_postman, gen_pytest_layer, gen_python_layer, gen_sql, jmeter_safety,
    scan_files_for_secrets,
)
from .generators.python_gen import rule_entries
from .storage import get_storage, safe_filename

KINDS = ["python", "pytest", "postman", "sql", "playwright", "jmeter", "github_actions"]
ELIGIBLE = ("APPROVED", "READY_FOR_AUTOMATION", "AUTOMATED")
DRAFT_HEADER = "# DRAFT — generated from test cases that are NOT approved. Do not run as final.\n"


def to_gen(db: Session, t: TestCase) -> GenTC:
    from ..api.serializers import tc_snapshot
    r = db.get(Requirement, t.requirement_id)
    if r is None:
        raise AppError("TRACEABILITY_BROKEN", f"{t.tc_id} ไม่มี Requirement อ้างอิง — สร้าง Automation ไม่ได้", status=409)
    return GenTC(id=t.id, tc_id=t.tc_id, version=t.version, status=t.status, data=tc_snapshot(t), req=req_to_engine(r))


def _safe_rel(path: str) -> str:
    parts = [p for p in path.replace("\\", "/").split("/") if p not in ("", ".", "..")]
    if not parts:
        raise AppError("PATH_TRAVERSAL", "Path ไม่ถูกต้อง")
    return "/".join(parts[:-1] + [safe_filename(parts[-1]) if parts[-1] not in (".gitkeep", ".gitignore", ".env.example") else parts[-1]])


def generate(db: Session, project: Project, kind: str, test_case_ids: list[str], *, draft: bool, options: dict, username: str,
             runtime: dict) -> AutomationArtifact:
    if kind not in KINDS:
        raise AppError("VALIDATION", f"ไม่รองรับ {kind}")
    tcs = [db.get(TestCase, i) for i in test_case_ids]
    tcs = [t for t in tcs if t is not None and t.project_id == project.id]
    if not tcs and kind != "github_actions":
        raise AppError("VALIDATION", "เลือก Test Case อย่างน้อย 1 รายการ")
    not_ok = [t.tc_id for t in tcs if t.status not in ELIGIBLE]
    if not_ok and not draft:
        raise AppError("TEST_CASE_NOT_APPROVED", f"มี Test Case ที่ยังไม่ Approved: {', '.join(not_ok)}", status=409,
                       action="Approve ก่อน หรือเลือก Generate Draft Code อย่างชัดเจน")
    gens = [to_gen(db, t) for t in tcs]
    p = {"code": project.code, "name": project.name}
    if kind == "python":
        out = gen_python_layer(gens, p)
    elif kind == "pytest":
        out = gen_pytest_layer(gens, p)
    elif kind == "postman":
        out = gen_postman(gens, p, options.get("auth", "none"))
    elif kind == "sql":
        out = gen_sql(gens, p, options.get("types"))
    elif kind == "playwright":
        out = gen_playwright(gens, p, options)
    elif kind == "jmeter":
        issues = jmeter_safety(options.get("url", ""), options, runtime["env_allowlist"], runtime["jmeter_max_users"], runtime["jmeter_max_minutes"])
        if issues:
            raise AppError("JMETER_SAFETY", "ไม่ผ่าน Safety Check: " + issues[0], status=409, technical="; ".join(issues))
        out = gen_jmeter(gens, p, options)
    else:
        out = {"files": {".github/workflows/qa-automation.yml": gen_github_workflow(p)}, "tips": {}}
    files: dict[str, str] = {_safe_rel(k): v for k, v in out["files"].items()}
    if draft:
        files = {k: (DRAFT_HEADER + v if k.endswith(".py") and v else v) for k, v in files.items()}
    problems = scan_files_for_secrets(files)
    n = next_seq(db, f"ART-{project.code}-{kind}")
    a = AutomationArtifact(project_id=project.id, kind=kind, name=f"{project.code}-{kind}-{n:03d}", test_case_ids=[t.id for t in tcs],
                           tc_codes=[t.tc_id for t in tcs], is_draft=draft, status="DRAFT_CODE" if draft else "GENERATED",
                           storage_path="", files=sorted(files), tips=out["tips"], options=options, scan_problems=problems, created_by=username)
    db.add(a)
    db.flush()
    a.storage_path = f"artifacts/{project.code}/{a.id}"
    st = get_storage()
    for path, content in files.items():
        st.write_text(f"{a.storage_path}/ai/{path}", content)
        st.write_text(f"{a.storage_path}/current/{path}", content)
    detail = {
        "python": lambda: PythonArtifact(artifact_id=a.id, rule_functions=[x["fn"] for x in rule_entries(gens)]),
        "pytest": lambda: PytestArtifact(artifact_id=a.id, test_files=[f for f in files if f.startswith("tests/unit/")], markers=[t.tc_id for t in tcs]),
        "postman": lambda: PostmanArtifact(artifact_id=a.id, auth_type=options.get("auth", "none"),
                                           status="NEEDS_CONFIGURATION" if options.get("auth", "none") == "none" else "GENERATED"),
        "sql": lambda: SqlArtifact(artifact_id=a.id, query_types=options.get("types") or ["duplicate", "aggregation"]),
        "playwright": lambda: PlaywrightArtifact(artifact_id=a.id, browser=options.get("browser", "chromium"), page_name=options.get("page_name", "Target"),
                                                 locators=options.get("locators") or [],
                                                 manual_checkpoints=[x for x in ("otp", "captcha") if options.get(x)]),
        "jmeter": lambda: JmeterArtifact(artifact_id=a.id, profile=options, target_url=options.get("url", "")),
    }.get(kind)
    if detail:
        db.add(detail())
    if not draft and kind in ("python", "pytest", "playwright", "postman"):
        from ..api.testdesign import set_tc_status
        for t in tcs:
            if t.status != "AUTOMATED":
                set_tc_status(db, t, "AUTOMATED", username, f"Generated {kind} artifact {a.name}")
    audit(db, username, "AUTOMATION_GENERATE", a.name, f"{kind} for {','.join(a.tc_codes)}{' [DRAFT]' if draft else ''}")
    db.flush()
    return a


def read_file(a: AutomationArtifact, path: str, version: str = "current") -> str:
    if path not in a.files:
        raise AppError("NOT_FOUND", "ไม่พบไฟล์ใน Artifact", status=404)
    return get_storage().read_text(f"{a.storage_path}/{version}/{path}")


def all_files(a: AutomationArtifact, version: str = "current") -> dict[str, str]:
    return {p: read_file(a, p, version) for p in a.files}


def save_file(db: Session, a: AutomationArtifact, path: str, content: str, username: str) -> list[str]:
    if path not in a.files:
        raise AppError("NOT_FOUND", "ไม่พบไฟล์ใน Artifact", status=404)
    if len(content.encode()) > 2 * 1024 * 1024:
        raise AppError("FILE_TOO_LARGE", "ไฟล์ใหญ่เกิน 2 MB")
    problems = scan_files_for_secrets({path: content})
    get_storage().write_text(f"{a.storage_path}/current/{path}", content)
    a.edited = any(read_file(a, p) != read_file(a, p, "ai") for p in a.files)
    a.scan_problems = scan_files_for_secrets(all_files(a))
    a.updated_at = now()
    audit(db, username, "AUTOMATION_EDIT", f"{a.name}/{path}", "Code Draft saved")
    return problems


def reset_file(db: Session, a: AutomationArtifact, path: str | None, username: str) -> None:
    for p in ([path] if path else a.files):
        get_storage().write_text(f"{a.storage_path}/current/{p}", read_file(a, p, "ai"))
    a.edited = any(read_file(a, p) != read_file(a, p, "ai") for p in a.files)
    a.scan_problems = scan_files_for_secrets(all_files(a))
    audit(db, username, "AUTOMATION_RESET", f"{a.name}/{path or '*'}", "Reset to AI version")


def diff(a: AutomationArtifact, path: str) -> str:
    return "".join(difflib.unified_diff(read_file(a, path, "ai").splitlines(True), read_file(a, path).splitlines(True),
                                        fromfile=f"ai/{path}", tofile=f"current/{path}"))


def zip_bytes(a: AutomationArtifact) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for p, c in all_files(a).items():
            z.writestr(f"automation_project/{p}", c)
        if a.kind in ("python", "pytest") and ".github/workflows/qa-automation.yml" not in a.files:
            z.writestr("automation_project/.github/workflows/qa-automation.yml", gen_github_workflow({"code": a.name.split("-")[0], "name": a.name}))
    return buf.getvalue()


def list_artifacts(db: Session, project_id: str, kind: str | None = None) -> list[AutomationArtifact]:
    stmt = select(AutomationArtifact).where(AutomationArtifact.project_id == project_id)
    if kind:
        stmt = stmt.where(AutomationArtifact.kind == kind)
    return list(db.scalars(stmt.order_by(AutomationArtifact.created_at.desc())))
