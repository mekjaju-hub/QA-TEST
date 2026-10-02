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
from ..services import web_history as wh
from ..services import web_testgen
from ..services.storage import get_storage
from .deps import Principal, require

router = APIRouter(prefix="/api", tags=["web-explorer"])
BASE = "explore/web"


class ExploreIn(BaseModel):
    url: str = Field(min_length=3, max_length=2000)
    username: str | None = Field(default=None, max_length=200)
    password: str | None = Field(default=None, max_length=200)
    extra: int = Field(default=5, ge=0, le=30, description="จำนวน Test Case แบบใหม่ที่ยังไม่เคยออกแบบให้หน้านี้")
    click_explore: bool = Field(default=False, description="กดปุ่ม/ลิงก์ที่ปลอดภัยเพื่อดูว่าเกิดอะไรขึ้น")
    max_clicks: int = Field(default=10, ge=1, le=20)


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
    r = wx.explore(body.url, username=body.username or None, password=body.password or None, shots=shots,
                   click_explore=body.click_explore, max_clicks=body.max_clicks)
    # page history: design only test cases this page has not had before, give each a page-scoped ID (WP-001 …)
    h = wh.for_url(r["url"])
    known = wh.known_sigs(h)
    first = web_testgen.build(r, history_sigs=known, extra_limit=body.extra)
    hids = wh.assign_ids(h, [t["sig"] for t in first["test_cases"]])
    gen = web_testgen.build(r, history_sigs=known, extra_limit=body.extra, hid_map=hids)
    eid = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S") + "-" + uuid.uuid4().hex[:6]
    data = {"id": eid, "created_at": datetime.now(timezone.utc).isoformat(), "created_by": p.username, **r,
            "observations": wx.observations(r), "test_cases": gen["test_cases"], "files": gen["files"], "slug": gen["slug"],
            "screenshots": sorted(shots), "history_key": h["key"], "history_page": h["page"],
            "history_before": {"explorations": len(h["explorations"]), "test_cases": len(known)},
            "designs_left": gen["candidates_left"]}
    st = get_storage()
    for name, png in shots.items():
        st.write_bytes(_key(eid, f"{name}.png"), png)
    _save(eid, data)
    wh.save(wh.record_exploration(h, data))
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
    import re as _re
    if not (which in ("before", "after") or _re.fullmatch(r"click_\d{1,2}", which)):
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
    d = _load(eid)
    get_storage().delete_prefix(f"{BASE}/{eid}")
    h = wh.load(d["history_key"], missing_ok=True) if d.get("history_key") else None
    if h:  # the page history keeps its test cases; only mark the exploration as deleted
        for x in h["explorations"]:
            if x["id"] == eid:
                x["deleted"] = True
        wh.save(h)
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
    h = wh.load(d["history_key"], missing_ok=True) if d.get("history_key") else None
    if h:
        wh.save(wh.record_run(h, d, run))
    audit(db, p.username, "WEB_TEST_RUN", d["url"][:200], f"{out.status} {out.summary}", ip=p.ip)
    db.commit()
    return run


# ================================================================== page history (P: Web Explorer History)
def _best_exploration(h: dict) -> dict:
    """Most recent exploration still on disk — preferring one where login succeeded (so after-login designs can be built)."""
    alive = []
    for x in reversed(h["explorations"]):
        if x.get("deleted"):
            continue
        try:
            alive.append(_load(x["id"]))
        except AppError:
            continue
    if not alive:
        raise AppError("NOT_FOUND", "ไม่มีผลการสำรวจของหน้านี้เหลืออยู่ — สำรวจหน้านี้ใหม่อีกครั้ง", status=404)
    return next((d for d in alive if (d.get("login") or {}).get("success")), alive[0])


@router.get("/web-history")
def history_list(p: Principal = Depends(require("auto.view"))):
    wh.backfill()
    return wh.list_pages()


@router.get("/web-history/{key}")
def history_detail(key: str, p: Principal = Depends(require("auto.view"))):
    h = wh.load(key)
    tcs = sorted(({"sig": s, **t} for s, t in h["test_cases"].items() if "first_seen" in t), key=lambda t: t["hid"])
    return {**h, "test_cases": tcs}


@router.get("/web-history/{key}/zip")
def history_zip(key: str, p: Principal = Depends(require("auto.view")), db: Session = Depends(get_db)):
    """One pytest project with every test case this page has accumulated (built from the best exploration snapshot)."""
    h = wh.load(key)
    d = _best_exploration(h)
    sigs = {s for s, t in h["test_cases"].items() if "first_seen" in t}
    hid_map = {s: t["hid"] for s, t in h["test_cases"].items()}
    gen = web_testgen.build(d, history_sigs=sigs, include_sigs=sigs, hid_map=hid_map)
    root = f"webtest_history_{gen['slug']}"
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for path, content in gen["files"].items():
            z.writestr(f"{root}/{path}", content)
    audit(db, p.username, "DOWNLOAD", f"{root}.zip", f"{len(gen['test_cases'])}/{len(sigs)} test cases")
    db.commit()
    return Response(buf.getvalue(), media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="{root}.zip"'})


@router.get("/web-history/{key}/csv")
def history_csv(key: str, p: Principal = Depends(require("auto.view"))):
    import csv
    h = wh.load(key)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["ID", "Test Case", "ประเภท", "Priority", "ขั้นตอน", "ผลที่คาดหวัง", "ออกแบบครั้งแรก", "ล่าสุด", "จำนวนครั้งที่ออกแบบ",
                "จำนวนครั้งที่รัน", "ผ่าน", "ผลล่าสุด"])
    for s, t in sorted(h["test_cases"].items(), key=lambda kv: kv[1]["hid"]):
        if "first_seen" not in t:
            continue
        w.writerow([t["hid"], t["title"], t["type"], t["priority"], " | ".join(t["steps"]), t["expected"], t["first_seen"][:19],
                    t["last_seen"][:19], t.get("designed", 0), t.get("runs", 0), t.get("passed", 0), t.get("last_result", "")])
    name = f"web_history_{key}.csv"
    return Response("\ufeff" + buf.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})
