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


_CAPS_ROLE = __import__("re").compile(r'get_by_role\(("[a-z]+"), name=("[^"\\]*"), exact=True\)')


def _upgrade_record(d: dict) -> dict:
    """Recordings saved by older versions used exact button/link names, which fail when the site shows the name in CSS
    capitals ("WOMEN" for "Women") or puts an icon-font glyph in front ("\uf03a API Testing"). Switch them to NAME()
    (whole name, any case, icons ignored) and add the ad-blocking conftest — old recordings run without re-recording."""
    if d.get("kind") != "record" or not d.get("files"):
        return d
    files = dict(d["files"])
    k = "tests/test_06_recorded.py"
    code = files.get(k, "")
    if code and "def NAME(" not in code:
        code = _CAPS_ROLE.sub(lambda m: f"get_by_role({m.group(1)}, name=NAME({m.group(2)}))", code)
        lines = code.splitlines()
        at = next((i for i, ln in enumerate(lines) if ln.startswith("PASSWORD = ")), None)
        if at is not None:
            lines[at + 1:at + 1] = ["", ""] + web_testgen.NAME_HELPER
        files[k] = "\n".join(lines) + "\n"
    if "no_os_login_prompts" not in files.get("conftest.py", ""):
        files["conftest.py"] = web_testgen.build_record(d["url"], "", [])["files"]["conftest.py"]
    return {**d, "files": files}


@router.get("/web-explorer/{eid}")
def get_exploration(eid: str, p: Principal = Depends(require("auto.view"))):
    return _upgrade_record(_load(eid))


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
    d = _upgrade_record(_load(eid))
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
    files = dict(_upgrade_record(d)["files"])
    if d.get("kind") == "record":
        if body.password:
            env["RECORD_PASSWORD"] = body.password  # the password typed during recording is never stored — supplied per run
        # recordings made before this fix used a fixed sample password only
        f = files.get("tests/test_06_recorded.py", "")
        files["tests/test_06_recorded.py"] = f.replace('PASSWORD = os.getenv("RECORD_PASSWORD") or "Test-Pass-123!"',
                                                       'PASSWORD = os.getenv("RECORD_PASSWORD") or os.getenv("LOGIN_PASS") or "Test-Pass-123!"')
    out = sandbox.run_pytest(files, sandbox.Limits(**lim, limit_address_space=False, max_procs=4096), test_env=env)

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
def _alive(h: dict) -> list[dict]:
    out = []
    for x in reversed(h["explorations"]):
        if x.get("deleted"):
            continue
        try:
            out.append(_load(x["id"]))
        except AppError:
            continue
    return out


def _best_exploration(h: dict) -> dict | None:
    """Most recent automatic exploration still on disk — preferring one where login succeeded (after-login designs)."""
    alive = [d for d in _alive(h) if d.get("kind") != "record"]
    if not alive:
        return None
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


def _func_code(source: str, func: str) -> str:
    """The generated pytest function (with its decorators) for one test case, cut out of the test file."""
    lines = source.splitlines()
    head = next((i for i, ln in enumerate(lines) if ln.startswith(f"def {func}(")), None)
    if head is None:
        return ""
    start = head
    while start > 0 and lines[start - 1].strip() and not lines[start - 1].startswith(("def ", "class ", "import ", "from ")):
        start -= 1          # decorators (also multi-line @pytest.mark.parametrize(...))
    end = head + 1
    while end < len(lines) and (not lines[end].strip() or lines[end][0] in " \t"):
        end += 1
    while end > head and not lines[end - 1].strip():
        end -= 1
    return "\n".join(lines[start:end])


@router.get("/web-history/{key}/case/{hid}")
def history_case(key: str, hid: str, p: Principal = Depends(require("auto.view"))):
    """One test case of a page in full: how it was written (pre-condition, steps, expected), where it came from,
    the explained script (recorded test cases) and the generated pytest code — plus prev/next for navigation."""
    h = wh.load(key)
    order = sorted((t["hid"], s) for s, t in h["test_cases"].items() if "first_seen" in t and t.get("hid"))
    idx = next((i for i, (x, _) in enumerate(order) if x == hid), None)
    if idx is None:
        raise AppError("NOT_FOUND", f"ไม่พบ Test Case {hid} ในหน้านี้", status=404)
    sig = order[idx][1]
    e = h["test_cases"][sig]
    tried, source, tc = set(), None, None
    for eid in [e.get("last_exploration"), e.get("first_exploration")] + [x["id"] for x in reversed(h["explorations"]) if not x.get("deleted")]:
        if not eid or eid in tried:
            continue
        tried.add(eid)
        try:
            d = _load(eid)
        except AppError:
            continue
        tc = next((t for t in d.get("test_cases", []) if t.get("sig") == sig), None)
        if tc:
            source = d
            break
    code, script = "", []
    if tc and tc.get("func") and tc.get("file"):
        code = _func_code(source.get("files", {}).get(tc["file"], ""), tc["func"])
    if tc and source and source.get("kind") == "record" and tc.get("type") == "Scenario (Recorded)":
        try:
            n = int(tc["id"].rsplit("-", 1)[-1])
            script = [r for r in source.get("script", []) if r.get("seg", 0) == n - 1]
        except ValueError:
            script = []
    group = sig.split(":")[0].split(".")[0]
    return {"page": {"key": h["key"], "page": h["page"], "url": h["url"], "title": h.get("title", "")},
            "case": {"sig": sig, "group": group, **e},
            "source": ({"id": source["id"], "kind": source.get("kind", "explore"), "created_at": source.get("created_at"),
                        "created_by": source.get("created_by"), "url": source.get("url"), "tc_id": tc.get("id"),
                        "func": tc.get("func"), "file": tc.get("file"), "start_url": tc.get("start_url"),
                        "independent": tc.get("independent")} if source else None),
            "code": code, "script": script,
            "prev": order[idx - 1][0] if idx > 0 else None, "next": order[idx + 1][0] if idx + 1 < len(order) else None,
            "position": idx + 1, "total": len(order)}


@router.get("/web-history/{key}/zip")
def history_zip(key: str, p: Principal = Depends(require("auto.view")), db: Session = Depends(get_db)):
    """One pytest project with every test case this page has accumulated (built from the best exploration snapshot)."""
    h = wh.load(key)
    d = _best_exploration(h)
    recs = [x for x in _alive(h) if x.get("kind") == "record"]
    if d is None and not recs:
        raise AppError("NOT_FOUND", "ไม่มีผลการสำรวจของหน้านี้เหลืออยู่ — สำรวจหน้านี้ใหม่อีกครั้ง", status=404)
    sigs = {s for s, t in h["test_cases"].items() if "first_seen" in t}
    hid_map = {s: t["hid"] for s, t in h["test_cases"].items()}
    if d is not None:
        gen = web_testgen.build(d, history_sigs=sigs, include_sigs=sigs, hid_map=hid_map)
    else:
        gen = {"test_cases": [], "files": dict(recs[0]["files"]), "slug": recs[0]["slug"]}
        gen["files"].pop("tests/test_06_recorded.py", None)
    # every recorded scenario of this page goes in as its own test file
    for i, r in enumerate(recs, 1):
        path = f"tests/test_06_recorded_{i:02d}.py"
        gen["files"][path] = r["files"]["tests/test_06_recorded.py"]
        gen["test_cases"] += [{**t, "file": path} for t in r["test_cases"]]
    gen["files"]["TEST_CASES.md"] = web_testgen._tc_markdown(h["url"], gen["test_cases"])
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


# ================================================================== Test Case Library (all websites, no duplicates)
from ..services import web_library as wl  # noqa: E402


def _library(q: str, category: str, result: str, site: str) -> tuple[list[dict], list[dict]]:
    wh.backfill()
    rows = wl.build()
    return rows, wl.filtered(rows, q=q, category=category, result=result, site=site)


@router.get("/web-library")
def library(q: str = "", category: str = "", result: str = "", site: str = "", p: Principal = Depends(require("auto.view"))):
    rows, items = _library(q, category, result, site)
    cats = [{"code": code, "label": label, "count": len([r for r in rows if r["category"] == code])}
            for code, label in wl.CATEGORY_LABEL.items()]
    sites = sorted({s["page"].split("/")[0] for r in rows for s in r["sources"]})
    return {"total": len(rows), "count": len(items), "categories": cats, "sites": sites, "headers": wl.HEADERS,
            "items": items, "table": wl.table(items)}


@router.get("/web-library/export.xlsx")
def library_xlsx(q: str = "", category: str = "", result: str = "", site: str = "", p: Principal = Depends(require("auto.view")),
                 db: Session = Depends(get_db)):
    _, items = _library(q, category, result, site)
    audit(db, p.username, "EXPORT", "web_test_case_library.xlsx", f"{len(items)} test cases")
    db.commit()
    return Response(wl.to_xlsx(items), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": 'attachment; filename="web_test_case_library.xlsx"'})


@router.get("/web-library/export.csv")
def library_csv(q: str = "", category: str = "", result: str = "", site: str = "", p: Principal = Depends(require("auto.view"))):
    import csv
    _, items = _library(q, category, result, site)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(wl.HEADERS)
    w.writerows(wl.table(items))
    return Response("﻿" + buf.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="web_test_case_library.csv"'})


# ================================================================== Web Recorder (record what the user does → scenario test)
from ..services import web_recorder as wr  # noqa: E402


class RecordIn(BaseModel):
    url: str = Field(min_length=3, max_length=2000)
    save_password: bool = True
    name: str = Field(default="", max_length=120)


class RecTestCaseIn(BaseModel):
    name: str = Field(default="", max_length=120)
    url: str | None = Field(default=None, max_length=2000)   # given → new independent cycle that opens this URL


class RecResumeIn(BaseModel):
    new_case: bool = False        # True = start a new cycle (new test case) instead of continuing the paused one
    name: str = Field(default="", max_length=120)
    url: str | None = Field(default=None, max_length=2000)  # start page of the new cycle (default: the page open now)


class RecCheckIn(BaseModel):
    text: str = Field(min_length=1, max_length=200)
    mode: str = Field(default="visible", pattern="^(visible|hidden)$")


class ReplayIn(BaseModel):
    password: str | None = Field(default=None, max_length=200)
    slow_ms: int = Field(default=700, ge=0, le=3000)


def _rec_view(rec) -> dict:
    steps = rec.steps()
    return {"id": rec.id, "url": rec.url, "status": rec.status, "error": rec.error, "started_at": rec.started_at,
            "paused": rec.paused, "save_password": rec.save_password, "current_url": getattr(rec, "current_url", rec.url),
            "cycle": getattr(rec, "cycle", 1), "discarded": getattr(rec, "discarded", False),
            "segments": wr.segments_overview(list(rec.raw), rec.url),
            "steps": [{"no": s["no"], "action": s["action"], "text": s["text"], "seg": s.get("seg", 0), "seg_name": s.get("seg_name", "")}
                      for s in steps],
            "script": web_testgen.script_rows(steps), "exploration_id": getattr(rec, "exploration_id", None)}


@router.post("/web-recorder/start")
def recorder_start(body: RecordIn, p: Principal = Depends(require("auto.generate")), db: Session = Depends(get_db)):
    rec = wr.start(body.url, p.username, save_password=body.save_password, name=body.name)
    audit(db, p.username, "WEB_RECORD_START", rec.url[:200], ip=p.ip)
    db.commit()
    return _rec_view(rec)


@router.get("/web-recorder-active")
def recorder_active(p: Principal = Depends(require("auto.view"))):
    """The recording that is still open (e.g. after a page refresh) — so the UI can reconnect to it."""
    rec = wr.active()
    return _rec_view(rec) if rec else None


@router.get("/web-recorder/{rid}")
def recorder_status(rid: str, p: Principal = Depends(require("auto.view"))):
    return _rec_view(wr.get(rid))


@router.post("/web-recorder/{rid}/pause")
def recorder_pause(rid: str, p: Principal = Depends(require("auto.generate"))):
    rec = wr.get(rid)
    rec.pause()
    return _rec_view(rec)


@router.post("/web-recorder/{rid}/resume")
def recorder_resume(rid: str, body: RecResumeIn | None = None, p: Principal = Depends(require("auto.generate"))):
    rec = wr.get(rid)
    body = body or RecResumeIn()
    rec.resume(new_case=body.new_case, name=body.name, url=body.url)
    return _rec_view(rec)


@router.post("/web-recorder/{rid}/testcase")
def recorder_add_testcase(rid: str, body: RecTestCaseIn, p: Principal = Depends(require("auto.generate"))):
    rec = wr.get(rid)
    rec.add_testcase(body.name, body.url)
    return _rec_view(rec)


@router.post("/web-recorder/{rid}/check")
def recorder_add_check(rid: str, body: RecCheckIn, p: Principal = Depends(require("auto.generate"))):
    rec = wr.get(rid)
    rec.add_check(body.text, body.mode)
    return _rec_view(rec)


@router.post("/web-recorder/{rid}/stop")
def recorder_stop(rid: str, p: Principal = Depends(require("auto.generate")), db: Session = Depends(get_db)):
    rec = wr.get(rid)
    if getattr(rec, "exploration_id", None):
        return _rec_view(rec)
    rec.stop()
    if rec.status == "error":
        raise AppError("RECORDER_FAILED", rec.error or "การบันทึกล้มเหลว", status=500)
    try:
        return _rec_view(save_recording(rec, p.username, db))
    except AppError as e:
        if e.code != "RECORD_EMPTY":
            raise
        # nothing to save: end this cycle cleanly so the UI resets and a new recording can start
        rec.discarded = True
        return {**_rec_view(rec), "message": e.user_message}


def save_recording(rec, username: str, db: Session):
    """Turn a finished recording into an exploration-like result (so it shows in Web Explorer / History / Library)."""
    steps = rec.steps()
    if not [s for s in steps if not s.get("fresh")]:
        raise AppError("RECORD_EMPTY", "ยังไม่ได้บันทึกขั้นตอนใด — กด/พิมพ์ในหน้าต่าง browser ที่เปิดขึ้นก่อน แล้วค่อยกดหยุด", status=422)
    h = wh.for_url(rec.url)
    known = wh.known_sigs(h)
    first = web_testgen.build_record(rec.url, rec.title, steps, history_sigs=known)
    hids = wh.assign_ids(h, [t["sig"] for t in first["test_cases"]])
    gen = web_testgen.build_record(rec.url, rec.title, steps, history_sigs=known, hid_map=hids)
    eid = rec.id
    data = {"id": eid, "kind": "record", "created_at": datetime.now(timezone.utc).isoformat(), "created_by": username, "url": rec.url,
            "status": None, "duration_sec": None, "before": {"title": rec.title}, "login": {"attempted": False}, "warnings": [],
            "observations": ["บันทึกจากการใช้งานจริง (Record) — ขั้นตอนที่ทำ:"] + [f"{s['no']}. {s['text']}" for s in steps],
            "recorded_steps": [{k: v for k, v in s.items() if k not in ("key", "t")} for s in steps],
            "test_cases": gen["test_cases"], "files": gen["files"], "slug": gen["slug"], "screenshots": sorted(rec.shots),
            "script": gen["script"], "password_saved": any(s.get("secret") and s.get("value") for s in steps),
            "history_key": h["key"], "history_page": h["page"],
            "history_before": {"explorations": len(h["explorations"]), "test_cases": len(known)}}
    st = get_storage()
    for name, png in rec.shots.items():
        st.write_bytes(_key(eid, f"{name}.png"), png)
    _save(eid, data)
    wh.save(wh.record_exploration(h, data))
    audit(db, username, "WEB_RECORD", rec.url[:200], f"steps={len(steps)} tc={len(gen['test_cases'])}")
    db.commit()
    rec.exploration_id = eid
    return rec



# ================================================================== Test Automation: replay a recording in a visible browser
from ..services import web_replay as wrp  # noqa: E402


@router.post("/web-explorer/{eid}/replay")
def replay_start(eid: str, body: ReplayIn | None = None, p: Principal = Depends(require("run.execute")), db: Session = Depends(get_db)):
    body = body or ReplayIn()
    d = _load(eid)
    st = get_storage()
    rp = wrp.Replay(d, password=body.password or None, slow_ms=body.slow_ms,
                    shot_writer=lambda name, png: st.write_bytes(_key(eid, f"replay/{name}.png"), png)).start()
    audit(db, p.username, "WEB_REPLAY", d["url"][:200], f"steps={len(rp.steps)}", ip=p.ip)
    db.commit()
    return rp.view()


@router.get("/web-replay/{rid}")
def replay_status(rid: str, p: Principal = Depends(require("auto.view"))):
    return wrp.get(rid).view()


@router.post("/web-replay/{rid}/cancel")
def replay_cancel(rid: str, p: Principal = Depends(require("run.execute"))):
    rp = wrp.get(rid)
    rp.cancel()
    return rp.view()


@router.get("/web-replay/{rid}/shot/{name}")
def replay_shot(rid: str, name: str, p: Principal = Depends(require("auto.view"))):
    import re as _re
    rp = wrp.get(rid)
    if not _re.fullmatch(r"step_\d{1,3}(_fail)?", name):
        raise AppError("NOT_FOUND", "ไม่พบภาพ", status=404)
    st = get_storage()
    k = _key(rp.eid, f"replay/{name}.png")
    if not st.exists(k):
        raise AppError("NOT_FOUND", "ไม่พบภาพ", status=404)
    return Response(st.read_bytes(k), media_type="image/png")
