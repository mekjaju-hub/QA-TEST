"""Web Explorer API (practice mode): URL → observe → Test Cases → pytest-playwright → Run.

Results live in storage/explore/web/<id>/ (result.json + screenshots). Passwords are never stored.
"""
from __future__ import annotations

import io
import json
import uuid
import zipfile
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..core.errors import AppError
from ..db import get_db
from ..repositories import audit
from ..services import web_explorer as wx
from ..services import web_testgen
from ..services.storage import get_storage
from .deps import Principal, require

router = APIRouter(prefix="/api", tags=["web-explorer"])
BASE = "explore/web"


class ExploreIn(BaseModel):
    url: str = Field(min_length=3, max_length=2000)
    username: str | None = Field(default=None, max_length=200)
    password: str | None = Field(default=None, max_length=200)


class WebRunIn(BaseModel):
    username: str | None = Field(default=None, max_length=200)
    password: str | None = Field(default=None, max_length=200)


def _key(eid: str, name: str) -> str:
    if not eid.replace("-", "").isalnum():
        raise AppError("NOT_FOUND", "ไม่พบผลการสำรวจ", status=404)
    return f"{BASE}/{eid}/{name}"


def _load(eid: str) -> dict:
    st = get_storage()
    k = _key(eid, "result.json")
    if not st.exists(k):
        raise AppError("NOT_FOUND", "ไม่พบผลการสำรวจ", status=404)
    return json.loads(st.read_text(k))


def _save(eid: str, data: dict) -> None:
    get_storage().write_text(_key(eid, "result.json"), json.dumps(data, ensure_ascii=False, indent=1))


def _summary(d: dict) -> dict:
    return {"id": d["id"], "url": d["url"], "title": d["before"]["title"], "created_at": d["created_at"], "created_by": d["created_by"],
            "test_cases": len(d["test_cases"]), "login": d.get("login", {}), "last_run": (d.get("last_run") or {}).get("summary")}


@router.post("/web-explorer")
def explore(body: ExploreIn, p: Principal = Depends(require("auto.generate")), db: Session = Depends(get_db)):
    shots: dict = {}
    r = wx.explore(body.url, username=body.username or None, password=body.password or None, shots=shots)
    gen = web_testgen.build(r)
    eid = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S") + "-" + uuid.uuid4().hex[:6]
    data = {"id": eid, "created_at": datetime.now(timezone.utc).isoformat(), "created_by": p.username, **r,
            "observations": wx.observations(r), "test_cases": gen["test_cases"], "files": gen["files"], "slug": gen["slug"],
            "screenshots": sorted(shots)}
    st = get_storage()
    for name, png in shots.items():
        st.write_bytes(_key(eid, f"{name}.png"), png)
    _save(eid, data)
    lg = r.get("login") or {}
    audit(db, p.username, "WEB_EXPLORE", r["url"][:200],
          f"tc={len(gen['test_cases'])} login={'ok' if lg.get('success') else ('tried' if lg.get('attempted') else 'no')} user={lg.get('user_masked', '')}", ip=p.ip)
    db.commit()
    return data


@router.get("/web-explorer")
def list_explorations(p: Principal = Depends(require("auto.view"))):
    st = get_storage()
    ids = sorted({k.split("/")[0] for k in st.list(BASE) if k.endswith("result.json")}, reverse=True)[:50]
    out = []
    for eid in ids:
        try:
            out.append(_summary(_load(eid)))
        except Exception:  # noqa: BLE001 — skip unreadable entries
            continue
    return out


@router.get("/web-explorer/{eid}")
def get_exploration(eid: str, p: Principal = Depends(require("auto.view"))):
    return _load(eid)


@router.get("/web-explorer/{eid}/screenshot/{which}")
def screenshot(eid: str, which: str, p: Principal = Depends(require("auto.view"))):
    if which not in ("before", "after"):
        raise AppError("NOT_FOUND", "ไม่พบภาพ", status=404)
    st = get_storage()
    k = _key(eid, f"{which}.png")
    if not st.exists(k):
        raise AppError("NOT_FOUND", "ไม่พบภาพ", status=404)
    return Response(st.read_bytes(k), media_type="image/png")


@router.get("/web-explorer/{eid}/zip")
def download_zip(eid: str, p: Principal = Depends(require("auto.view")), db: Session = Depends(get_db)):
    d = _load(eid)
    buf = io.BytesIO()
    root = f"webtest_{d['slug']}"
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for path, content in d["files"].items():
            z.writestr(f"{root}/{path}", content)
    audit(db, p.username, "DOWNLOAD", f"{root}.zip")
    db.commit()
    return Response(buf.getvalue(), media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="{root}.zip"'})


@router.delete("/web-explorer/{eid}")
def delete_exploration(eid: str, p: Principal = Depends(require("auto.generate")), db: Session = Depends(get_db)):
    _load(eid)
    get_storage().delete_prefix(f"{BASE}/{eid}")
    audit(db, p.username, "WEB_EXPLORE_DELETE", eid)
    db.commit()
    return {"ok": True}


@router.post("/web-explorer/{eid}/run")
def run_tests(eid: str, body: WebRunIn | None = None, p: Principal = Depends(require("run.execute")), db: Session = Depends(get_db)):
    """Run the generated pytest-playwright project in the local sandbox (headless). Credentials only live in the child env."""
    from ..services.run_service import _limits, _runner_module
    body = body or WebRunIn()
    d = _load(eid)
    sandbox, _ = _runner_module()
    lim = _limits()
    lim.update({"timeout_sec": max(lim["timeout_sec"], 180), "cpu_sec": max(lim["cpu_sec"], 300)})
    env = {"BASE_URL": d["url"]}
    if body.username and body.password:
        env.update({"LOGIN_USER": body.username, "LOGIN_PASS": body.password})
    out = sandbox.run_pytest(d["files"], sandbox.Limits(**lim, limit_address_space=False, max_procs=4096), test_env=env)

    def scrub(s: str) -> str:
        for secret in (body.password, body.username):
            if secret and len(secret) >= 3:
                s = s.replace(secret, "***")
        return s
    run = {"at": datetime.now(timezone.utc).isoformat(), "by": p.username, "status": out.status, "exit_code": out.exit_code,
           "duration": out.duration, "summary": out.summary, "error_code": out.error_code, "with_login": bool(env.get("LOGIN_USER")),
           "results": [{**r, "message": scrub(r.get("message") or "")[:2000]} for r in out.results],
           "stdout": scrub(out.stdout)[-20000:], "stderr": scrub(out.stderr)[-5000:]}
    d["last_run"] = run
    _save(eid, d)
    audit(db, p.username, "WEB_TEST_RUN", d["url"][:200], f"{out.status} {out.summary}", ip=p.ip)
    db.commit()
    return run
