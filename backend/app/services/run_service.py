"""Test Runs (หัวข้อ 20, P19–P20): create → execute (runner service or local sandbox) → results/evidence.

RUNNER_URL set  → POST files to automation-runner (Docker service) and poll; cancel is forwarded.
RUNNER_URL empty → Development Mode: import automation-runner/runner from the repo and run locally.
Logs are written to the DB incrementally (Log Streaming via GET /api/test-runs/{id}/logs?offset=).
"""
from __future__ import annotations

import base64
import os
import sys
import threading
import time
from pathlib import Path

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import REPO_ROOT, get_settings
from ..core.errors import AppError
from ..core.masking import mask
from ..models import AutomationArtifact, TestCase, TestRun, TestRunArtifact, TestRunResult
from ..repositories import audit, now
from . import automation_service as auto
from .storage import get_storage

RUNNABLE = ("pytest", "python")
TEST_ENV_KEYS = ("TEST_ENV", "BASE_URL", "AUTH_TYPE", "API_TIMEOUT")


def _runner_module():
    path = Path(os.getenv("RUNNER_PATH", REPO_ROOT / "automation-runner"))
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))
    from runner import results, sandbox  # type: ignore
    return sandbox, results


def create_run(db: Session, artifact: AutomationArtifact, username: str, node_ids: list[str] | None = None) -> TestRun:
    if artifact.kind not in RUNNABLE:
        raise AppError("NOT_RUNNABLE", "Run ได้เฉพาะ Python/Pytest artifact (Postman/JMeter/Playwright Headed ใช้ Runner Interface ภายนอก)", status=409)
    if artifact.scan_problems:
        raise AppError("SECRET_DETECTED", "Artifact มีไฟล์ต้องห้าม/Secret — แก้ไขก่อน Run", status=409, technical="; ".join(artifact.scan_problems))
    run = TestRun(project_id=artifact.project_id, artifact_id=artifact.id, source="RUNNER", status="QUEUED", triggered_by=username,
                  summary={"node_ids": node_ids or [], "draft": artifact.is_draft})
    db.add(run)
    audit(db, username, "TEST_RUN", artifact.name, f"node_ids={len(node_ids or [])}{' DRAFT' if artifact.is_draft else ''}")
    db.flush()
    return run


def _limits() -> dict:
    st = get_settings()
    from ..api.admin import runtime_settings
    from ..db import SessionLocal
    with SessionLocal() as db:
        rs = runtime_settings(db)
    return {"timeout_sec": int(rs.get("runner_timeout_sec", st.runner_timeout_sec)), "cpu_sec": st.runner_max_cpu_sec,
            "memory_mb": st.runner_max_memory_mb, "max_output_kb": int(rs.get("runner_max_output_kb", st.runner_max_output_kb))}


def _test_env() -> dict[str, str]:
    return {k: os.environ[k] for k in TEST_ENV_KEYS if k in os.environ}


def _store_results(db: Session, run: TestRun, status: str, exit_code, stdout: str, stderr: str, duration: float, results: list[dict],
                   summary: dict, artifacts: dict[str, bytes], error_code: str | None) -> None:
    st = get_storage()
    tc_map = {t.tc_id: t.id for t in db.scalars(select(TestCase).where(TestCase.project_id == run.project_id))}
    run.results = [TestRunResult(test_case_id=tc_map.get(r["tc_id"]), tc_id=r["tc_id"], name=r["name"][:500], status=r["status"],
                                 message=mask(r.get("message", "")), duration=float(r.get("duration") or 0)) for r in results]
    for rel, data in artifacts.items():
        key = f"runs/{run.id}/{rel}"
        st.write_bytes(key, data)
        kind = "junit" if rel.endswith(".xml") else "html" if rel.endswith(".html") else "screenshot" if rel.endswith(".png") else "log"
        db.add(TestRunArtifact(run_id=run.id, kind=kind, name=rel, storage_path=key, size=len(data)))
    st.write_text(f"runs/{run.id}/stdout.log", mask(stdout))
    st.write_text(f"runs/{run.id}/stderr.log", mask(stderr))
    run.status, run.exit_code, run.duration = status, exit_code, duration
    run.stdout, run.stderr = mask(stdout), mask(stderr)
    run.summary = {**(run.summary or {}), **summary, "error_code": error_code}
    run.progress, run.finished_at = 100, now()


def execute_run(db: Session, run_id: str) -> TestRun:
    run = db.get(TestRun, run_id)
    if run is None:
        raise AppError("NOT_FOUND", "ไม่พบ Test Run", status=404)
    a = db.get(AutomationArtifact, run.artifact_id)
    files = auto.all_files(a)
    node_ids = (run.summary or {}).get("node_ids") or []
    run.status, run.started_at = "RUNNING", now()
    db.commit()
    url = get_settings().runner_url
    try:
        if url:
            _execute_remote(db, run, files, node_ids, url)
        else:
            _execute_local(db, run, files, node_ids)
    except Exception as e:  # noqa: BLE001
        db.rollback()
        run = db.get(TestRun, run_id)
        code = getattr(e, "code", None) or "RUNNER_ERROR"
        run.status, run.stderr, run.finished_at = "FAILED", mask(f"{code}: {getattr(e, 'problems', None) or e}"), now()
        run.summary = {**(run.summary or {}), "error_code": code, "total": 0, "passed": 0, "failed": 0, "blocked": 0}
    if run.status in ("PASSED", "FAILED") and a and not a.is_draft:
        for tid in a.test_case_ids:
            t = db.get(TestCase, tid)
            if t and t.status == "APPROVED":
                t.status = "AUTOMATED"
    audit(db, run.triggered_by, "TEST_RUN_DONE", run.id[:8], f"{run.status} {run.summary}")
    db.commit()
    return run


def _execute_local(db: Session, run: TestRun, files: dict[str, str], node_ids: list[str]) -> None:
    sandbox, _ = _runner_module()
    cancel = threading.Event()
    buf: list[str] = []
    last = [0.0]
    lock = threading.Lock()

    def on_output(line: str, pct: int) -> None:
        with lock:
            buf.append(line)
            if time.monotonic() - last[0] > 0.7:
                last[0] = time.monotonic()
                _flush(run.id, "".join(buf), pct, cancel)

    try:
        out = sandbox.run_pytest(files, sandbox.Limits(**_limits()), node_ids=node_ids, test_env=_test_env(), cancel=cancel, on_output=on_output)
    except Exception as e:  # validation errors carry .problems
        if e.__class__.__name__ == "ValidationError":
            e.code = "RUNNER_VALIDATION_FAILED"  # type: ignore[attr-defined]
        raise
    db.refresh(run)
    _store_results(db, run, out.status, out.exit_code, out.stdout, out.stderr, out.duration, out.results, out.summary, out.artifacts, out.error_code)


def _flush(run_id: str, stdout: str, pct: int, cancel: threading.Event) -> None:
    """Persist partial log/progress and pick up cancel requests (separate session: called from reader thread)."""
    from ..db import SessionLocal
    with SessionLocal() as s:
        r = s.get(TestRun, run_id)
        if r is None:
            return
        r.stdout, r.progress = mask(stdout)[-200_000:], pct
        if r.cancel_requested:
            cancel.set()
        s.commit()


def _execute_remote(db: Session, run: TestRun, files: dict[str, str], node_ids: list[str], url: str) -> None:
    st = get_settings()
    h = {"X-Runner-Token": st.runner_token}
    with httpx.Client(base_url=url, timeout=30, headers=h) as c:
        res = c.post("/runs", json={"files": files, "node_ids": node_ids, "test_env": _test_env(), "limits": _limits()})
        if res.status_code >= 400:
            raise AppError("RUNNER_UNAVAILABLE", "เรียก automation-runner ไม่สำเร็จ", technical=res.text[:300], retryable=True)
        rid = res.json()["id"]
        stdout = ""
        cancelled = False
        while True:
            time.sleep(1)
            s = c.get(f"/runs/{rid}", params={"offset": len(stdout)}).json()
            stdout += s.get("stdout_chunk", "")
            db.refresh(run)
            if run.cancel_requested and not cancelled:
                c.post(f"/runs/{rid}/cancel")
                cancelled = True
            run.stdout, run.progress = mask(stdout)[-200_000:], s.get("progress", 0)
            db.commit()
            if s["status"] not in ("QUEUED", "RUNNING"):
                break
        arts = {}
        for rel in s.get("artifacts", []):
            r = c.get(f"/runs/{rid}/artifacts/{rel}")
            if r.status_code == 200:
                arts[rel] = base64.b64decode(r.json()["b64"])
        status = s["status"] if s["status"] != "ERROR" else "FAILED"
        _store_results(db, run, status, s.get("exit_code"), stdout, s.get("stderr", ""), s.get("duration", 0.0), s.get("results", []),
                       s.get("summary", {}), arts, s.get("error_code"))


def import_results(db: Session, project_id: str, kind: str, data: bytes, username: str) -> TestRun:
    _, results = _runner_module()
    try:
        parsed = results.parse_junit(data) if kind == "junit" else results.parse_newman(data.decode("utf-8"))
    except (ValueError, UnicodeDecodeError) as e:
        raise AppError("INVALID_RESULT_FILE", "ไฟล์ผลลัพธ์ไม่ถูกต้อง", technical=str(e), action="ใช้ reports/junit.xml จาก pytest หรือ newman --reporter-json") from e
    summary = results.summarize(parsed)
    run = TestRun(project_id=project_id, source="JUNIT_IMPORT" if kind == "junit" else "NEWMAN_IMPORT", status="RUNNING", triggered_by=username, summary={})
    db.add(run)
    db.flush()
    status = "FAILED" if summary["failed"] else "PASSED"
    _store_results(db, run, status, None, f"Imported {kind} result: {summary}", "", sum(r["duration"] for r in parsed), parsed, summary,
                   {f"imported/{'junit.xml' if kind == 'junit' else 'newman.json'}": data}, None)
    audit(db, username, "TEST_RUN_IMPORT", run.id[:8], f"{kind} {summary}")
    return run
