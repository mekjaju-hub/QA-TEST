"""automation-runner HTTP service (internal only — not exposed to the LAN).

POST /runs                 {files, node_ids?, test_env?, limits?}  → {id}
GET  /runs/{id}            status, progress, stdout (offset), results
POST /runs/{id}/cancel
GET  /runs/{id}/artifacts/{path}
Auth: header X-Runner-Token must equal RUNNER_TOKEN.
"""
from __future__ import annotations

import base64
import hmac
import os
import threading
import uuid

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel

from .sandbox import Limits, RunOutcome, run_pytest
from .validate import ValidationError

app = FastAPI(title="automation-runner", docs_url=None, redoc_url=None)
MAX_PARALLEL = int(os.getenv("RUNNER_MAX_PARALLEL", "2"))
_sem = threading.Semaphore(MAX_PARALLEL)
RUNS: dict[str, dict] = {}


def _token() -> str:
    """RUNNER_TOKEN env, or the shared file written by the backend (storage/secrets/runner_token, mounted read-only)."""
    tok = os.getenv("RUNNER_TOKEN", "")
    f = os.getenv("RUNNER_TOKEN_FILE", "")
    if not tok and f and os.path.exists(f):
        with open(f, encoding="utf-8") as fh:
            tok = fh.read().strip()
    return tok


def auth(x_runner_token: str = Header(default="")) -> None:
    tok = _token()
    if not tok or not hmac.compare_digest(x_runner_token, tok):
        raise HTTPException(401, "invalid runner token")


class RunIn(BaseModel):
    files: dict[str, str]
    node_ids: list[str] = []
    test_env: dict[str, str] = {}
    limits: dict = {}


def _cap(limits: dict) -> Limits:
    hard = Limits(timeout_sec=int(os.getenv("RUNNER_TIMEOUT_SEC", "300")), cpu_sec=int(os.getenv("RUNNER_MAX_CPU_SEC", "300")),
                  memory_mb=int(os.getenv("RUNNER_MAX_MEMORY_MB", "2048")), max_output_kb=int(os.getenv("RUNNER_MAX_OUTPUT_KB", "1024")))
    req = Limits(**{k: int(v) for k, v in limits.items() if k in Limits.__dataclass_fields__})
    return Limits(timeout_sec=min(req.timeout_sec, hard.timeout_sec), cpu_sec=min(req.cpu_sec, hard.cpu_sec),
                  memory_mb=min(req.memory_mb, hard.memory_mb), max_output_kb=min(req.max_output_kb, hard.max_output_kb))


@app.get("/health")
def health():
    return {"status": "ok", "running": sum(1 for r in RUNS.values() if r["status"] == "RUNNING")}


@app.post("/runs", dependencies=[Depends(auth)])
def start(body: RunIn):
    rid = uuid.uuid4().hex
    state = {"id": rid, "status": "QUEUED", "progress": 0, "stdout": "", "cancel": threading.Event(), "outcome": None}
    RUNS[rid] = state

    def on_output(line: str, pct: int) -> None:
        state["stdout"] += line
        state["progress"] = pct

    def work():
        with _sem:
            state["status"] = "RUNNING"
            try:
                out = run_pytest(body.files, _cap(body.limits), node_ids=body.node_ids, test_env=body.test_env, cancel=state["cancel"], on_output=on_output)
            except ValidationError as e:
                out = RunOutcome("ERROR", None, "", "\n".join(e.problems), 0.0, error_code="RUNNER_VALIDATION_FAILED")
            state["outcome"], state["status"], state["progress"] = out, out.status, 100
    threading.Thread(target=work, daemon=True).start()
    return {"id": rid}


@app.get("/runs/{rid}", dependencies=[Depends(auth)])
def status(rid: str, offset: int = 0):
    s = RUNS.get(rid)
    if not s:
        raise HTTPException(404, "run not found")
    o: RunOutcome | None = s["outcome"]
    body = {"id": rid, "status": s["status"], "progress": s["progress"], "stdout_chunk": (o.stdout if o else s["stdout"])[offset:]}
    if o:
        body.update(exit_code=o.exit_code, stderr=o.stderr, duration=o.duration, results=o.results, summary=o.summary, error_code=o.error_code,
                    artifacts=list(o.artifacts))
    return body


@app.post("/runs/{rid}/cancel", dependencies=[Depends(auth)])
def cancel(rid: str):
    s = RUNS.get(rid)
    if not s:
        raise HTTPException(404, "run not found")
    s["cancel"].set()
    return {"ok": True}


@app.get("/runs/{rid}/artifacts/{path:path}", dependencies=[Depends(auth)])
def artifact(rid: str, path: str):
    s = RUNS.get(rid)
    if not s or not s["outcome"] or path not in s["outcome"].artifacts:
        raise HTTPException(404, "artifact not found")
    return {"path": path, "b64": base64.b64encode(s["outcome"].artifacts[path]).decode()}
