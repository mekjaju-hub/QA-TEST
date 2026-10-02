"""Production-like smoke test against a running stack (docker compose or scripts/run-stack-smoke.sh).

    python scripts/stack_smoke.py --base http://127.0.0.1:3000 --password Admin@12345

Covers: login + forced password change, upload (Celery job), processing, approve, scenarios, test cases,
pytest generation, remote runner execution, dashboard. Exit code 0 = OK.
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
NEW_PW = "Smoke-Strong!Pass1"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:3000")
    ap.add_argument("--password", default="Admin@12345")
    a = ap.parse_args()
    c = httpx.Client(base_url=a.base, timeout=60)
    step = lambda m: print(f"  ✓ {m}", flush=True)  # noqa: E731
    r = c.post("/api/auth/login", json={"username": "admin", "password": a.password})
    if r.status_code == 401:
        r = c.post("/api/auth/login", json={"username": "admin", "password": NEW_PW})
    r.raise_for_status()
    tok = r.json()["access_token"]
    if r.json()["must_change_password"]:
        tok = c.post("/api/auth/change-password", headers={"Authorization": f"Bearer {tok}"},
                     json={"current_password": a.password, "new_password": NEW_PW}).json()["access_token"]
    H = {"Authorization": f"Bearer {tok}"}
    step("login + password change")
    pr = next(p for p in c.get("/api/projects", headers=H).json() if p["code"] == "CAM")
    step(f"seed project CAM ({pr['requirement_count']} requirements)")
    up = c.post(f"/api/projects/{pr['id']}/documents", headers=H, files={"file": ("sample.docx", (ROOT / "samples/sample.docx").read_bytes())}).json()
    doc = up["document"]["id"]
    for _ in range(120):
        prog = c.get(f"/api/documents/{doc}/progress", headers=H).json()
        if prog["job"]["status"] in ("READY_FOR_REVIEW", "FAILED"):
            break
        time.sleep(1)
    assert prog["job"]["status"] == "READY_FOR_REVIEW", prog["log_tail"]
    step(f"upload processed by background worker ({len(prog['sections'])} sections, {len(prog['images'])} images)")
    reqs = c.get(f"/api/projects/{pr['id']}/requirements", headers=H).json()["items"]
    for x in reqs:
        if x["status"] == "WAITING_FOR_REVIEW":
            c.post(f"/api/requirements/{x['id']}/approve", headers=H)
    c.post(f"/api/projects/{pr['id']}/test-scenarios/generate", headers=H, json={}).raise_for_status()
    c.post(f"/api/projects/{pr['id']}/test-cases/generate", headers=H, json={}).raise_for_status()
    tcs = c.get(f"/api/projects/{pr['id']}/test-cases", headers=H).json()["items"]
    c.post("/api/test-cases/bulk-status", headers=H, json={"ids": [t["id"] for t in tcs if not t["locked"]], "status": "APPROVED"})
    tcs = [t for t in c.get(f"/api/projects/{pr['id']}/test-cases", headers=H).json()["items"] if t["status"] in ("APPROVED", "AUTOMATED")]
    step(f"{len(tcs)} test cases approved")
    art = c.post(f"/api/projects/{pr['id']}/automation/generate", headers=H, json={"kind": "pytest", "test_case_ids": [t["id"] for t in tcs]}).json()
    run = c.post(f"/api/automation/{art['id']}/run", headers=H, json={}).json()
    for _ in range(180):
        run = c.get(f"/api/test-runs/{run['id']}", headers=H).json()
        if run["status"] not in ("QUEUED", "RUNNING"):
            break
        time.sleep(1)
    assert run["status"] == "PASSED", (run["status"], run["stderr"][-1000:], run["stdout"][-1000:])
    step(f"pytest executed by automation-runner: {run['summary']}")
    dash = c.get(f"/api/projects/{pr['id']}/dashboard", headers=H).json()
    assert dash["last_run"]["id"] == run["id"]
    step("dashboard shows last run")
    print("STACK SMOKE OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
