"""Test Automation replay: run a recorded scenario again in a *visible* browser, step by step, so the user can watch it.

Each step: scroll to the element → draw a red frame + label "ขั้นที่ N: …" around it → screenshot (shows where it is)
→ do the action → check the result (URL / popup / text). Progress is polled by the UI. Stops at the first failure.
"""
from __future__ import annotations

import os
import re
import threading
import time
import uuid
from datetime import datetime, timezone
from urllib.parse import urlparse

from ..core.errors import AppError
from .web_explorer import to_locator

HIGHLIGHT_JS = r"""
([el, label]) => {
  document.querySelectorAll('.__wqa_hl').forEach(e => e.remove());
  if (!el) return;
  el.scrollIntoView({ block: 'center', inline: 'center' });
  const r = el.getBoundingClientRect();
  const box = document.createElement('div');
  box.className = '__wqa_hl';
  Object.assign(box.style, { position: 'fixed', left: (r.left - 4) + 'px', top: (r.top - 4) + 'px', width: (r.width + 8) + 'px',
    height: (r.height + 8) + 'px', border: '3px solid #e5383b', borderRadius: '6px', zIndex: 2147483647, pointerEvents: 'none',
    boxShadow: '0 0 0 4000px rgba(0,0,0,0.12)' });
  const tag = document.createElement('div');
  tag.className = '__wqa_hl';
  tag.textContent = label;
  Object.assign(tag.style, { position: 'fixed', left: Math.max(4, r.left - 4) + 'px', top: Math.max(4, r.top - 34) + 'px', background: '#e5383b',
    color: '#fff', font: '600 13px system-ui, sans-serif', padding: '4px 8px', borderRadius: '4px', zIndex: 2147483647,
    pointerEvents: 'none', maxWidth: '70vw', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' });
  document.body.append(box, tag);
}
"""
BANNER_JS = r"""
(label) => {
  document.querySelectorAll('.__wqa_hl').forEach(e => e.remove());
  const tag = document.createElement('div');
  tag.className = '__wqa_hl';
  tag.textContent = label;
  Object.assign(tag.style, { position: 'fixed', left: '50%', top: '12px', transform: 'translateX(-50%)', background: '#1b2a44',
    color: '#fff', font: '600 14px system-ui, sans-serif', padding: '8px 14px', borderRadius: '6px', zIndex: 2147483647, pointerEvents: 'none' });
  document.body.append(tag);
}
"""
CLEAR_JS = "() => document.querySelectorAll('.__wqa_hl').forEach(e => e.remove())"

_runs: dict[str, "Replay"] = {}
_lock = threading.Lock()


class Replay:
    def __init__(self, exploration: dict, *, password: str | None = None, headless: bool | None = None, slow_ms: int = 700,
                 shot_writer=None, steps: list[dict] | None = None, shot_dir: str = "replay"):
        self.id = uuid.uuid4().hex[:10]
        self.eid = exploration["id"]
        self.url = exploration["url"]
        self.steps = [s for s in (steps if steps is not None else exploration.get("recorded_steps", []))]
        self.shot_dir = shot_dir   # storage folder of the screenshots (one per data row in a data-driven run)
        if not self.steps:
            raise AppError("NOT_REPLAYABLE", "เล่นซ้ำได้เฉพาะรายการที่มาจาก 'บันทึกการใช้งาน (Record)'", status=409)
        self.password = password or next((s.get("value") for s in self.steps if s.get("secret") and s.get("value")), None)
        self.headless = (os.getenv("WEB_RECORDER_HEADLESS", "") == "1") if headless is None else headless
        self.slow_ms = max(0, min(3000, slow_ms))
        self.shot_writer = shot_writer  # callable(name, png_bytes)
        self.status = "starting"
        self.current = 0
        self.results: list[dict] = [{"no": s["no"], "text": s["text"], "seg": s.get("seg", 0), "status": "pending",
                                     **({"pos": s["pos_text"]} if s.get("pos_text") else {})} for s in self.steps]
        self.error: str | None = None
        self.started_at = datetime.now(timezone.utc).isoformat()
        self.finished_at: str | None = None
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)

    def start(self) -> "Replay":
        with _lock:
            if any(r.status in ("starting", "running") for r in _runs.values()):
                raise AppError("REPLAY_BUSY", "กำลังเล่นซ้ำรายการอื่นอยู่ — รอให้จบก่อน", status=409)
            _runs[self.id] = self
        self._thread.start()
        return self

    def cancel(self) -> None:
        self._stop.set()

    def view(self) -> dict:
        return {"id": self.id, "exploration_id": self.eid, "status": self.status, "current": self.current, "error": self.error,
                "results": self.results, "started_at": self.started_at, "finished_at": self.finished_at,
                "summary": {"total": len(self.results), "passed": len([r for r in self.results if r["status"] == "passed"]),
                            "failed": len([r for r in self.results if r["status"] == "failed"]),
                            "warning": len([r for r in self.results if r["status"] == "warning"])}}

    # -------------------------------------------------------------- browser thread
    def _run(self) -> None:
        from playwright.sync_api import Error as PwError
        from playwright.sync_api import expect, sync_playwright
        dialogs: list[str] = []
        try:
            with sync_playwright() as p:
                try:
                    browser = p.chromium.launch(headless=self.headless, slow_mo=self.slow_ms // 3)
                except PwError as e:
                    raise RuntimeError("เปิด browser ไม่ได้ — ต้องรันบนเครื่องที่มีหน้าจอ (RUN-DEV.bat): " + str(e)[:200])
                ctx = browser.new_context(viewport={"width": 1280, "height": 800}, locale="th-TH")
                from .web_recorder import AD_HOSTS_RX, no_os_login_prompts
                ctx.route(AD_HOSTS_RX, lambda route: route.abort())   # same as when recording: no ad overlays
                page = ctx.new_page()
                no_os_login_prompts(ctx, page)                         # no Windows passkey / Microsoft account dialog
                page.set_default_timeout(10000)
                page.on("dialog", lambda d: (dialogs.append(d.message), d.accept() if d.type == "alert" else d.dismiss()))
                self.status = "running"
                page.goto(self.url, wait_until="domcontentloaded")
                skip_seg = None   # a failed test case: skip the rest of it, then go on with the next test case that opens its own page
                for i, s in enumerate(self.steps):
                    if self._stop.is_set():
                        self.results[i]["status"] = "skipped"
                        continue
                    if skip_seg is not None:
                        if s.get("seg", 0) == skip_seg or not s.get("fresh"):
                            self.results[i]["status"] = "skipped"
                            skip_seg = s.get("seg", 0)
                            continue
                        skip_seg = None
                    self.current = s["no"]
                    r = self.results[i]
                    r["status"] = "running"
                    t0 = time.monotonic()
                    try:
                        self._do(page, s, dialogs, expect, i)
                        r["status"] = "passed"
                    except Exception as e:  # noqa: BLE001
                        r["message"] = re.sub(r"\s+", " ", str(e))[:400]
                        if s["action"] == "popup":   # a message the page showed by itself (may be temporary) → warn, keep going
                            r["status"] = "warning"
                            r["message"] = "ไม่พบข้อความที่เคยแสดงตอนบันทึก (อาจเป็นข้อความชั่วคราว เช่น error ตอนนั้น) — " + r["message"][:200]
                            continue
                        r["status"] = "failed"
                        try:
                            self._shot(page, f"step_{s['no']}_fail")
                            r["shot"] = f"step_{s['no']}_fail"
                        except Exception:  # noqa: BLE001
                            pass
                        skip_seg = s.get("seg", 0)
                    finally:
                        r["ms"] = int((time.monotonic() - t0) * 1000)
                try:
                    page.evaluate(BANNER_JS, "เล่นซ้ำจบแล้ว — " + ("ผ่านทุกขั้น" if all(x["status"] in ("passed", "warning") for x in self.results) else "มีขั้นที่ไม่ผ่าน"))
                    page.wait_for_timeout(1500 if not self.headless else 0)
                except PwError:
                    pass
                browser.close()
            self.status = "passed" if all(x["status"] in ("passed", "warning") for x in self.results) else ("cancelled" if self._stop.is_set() else "failed")
        except Exception as e:  # noqa: BLE001
            self.status, self.error = "error", str(e)[:500]
        finally:
            self.finished_at = datetime.now(timezone.utc).isoformat()

    def _shot(self, page, name: str) -> None:
        if self.shot_writer:
            self.shot_writer(name, page.screenshot())

    def _do(self, page, s: dict, dialogs: list, expect, i: int) -> None:
        a = s["action"]
        label = f"ขั้นที่ {s['no']}: {s['text']}" + (f" · ตำแหน่งที่บันทึก {s['pos_text']}" if s.get("pos_text") else "")
        r = self.results[i]
        if a in ("click", "fill", "select", "check", "press"):
            loc = to_locator(page, s["el"]["locator"]).first
            loc.wait_for(state="visible", timeout=10000)
            page.evaluate(HIGHLIGHT_JS, [loc.element_handle(), label])
            page.wait_for_timeout(self.slow_ms)
            self._shot(page, f"step_{s['no']}")
            r["shot"] = f"step_{s['no']}"
            page.evaluate(CLEAR_JS)
            if a == "click":
                n_before = len(dialogs)
                box = loc.bounding_box()
                if box:   # where the mouse really clicks now (centre of the element, page coordinates)
                    sx, sy = page.evaluate("() => [window.scrollX, window.scrollY]")
                    r["click_at"] = f"x={round(box['x'] + box['width'] / 2 + sx)}, y={round(box['y'] + box['height'] / 2 + sy)}"
                loc.click()
                if s.get("url_after"):
                    u = urlparse(s["url_after"])
                    target = (u.path or "/") + (("?" + u.query) if u.query else "")
                    expect(page).to_have_url(re.compile(re.escape(target)))
                    r["check"] = f"ไปหน้า {target} แล้ว"
                elif len(dialogs) > n_before:
                    pass
            elif a == "fill":
                # each password field keeps its own saved value (a flow may log in to 2 systems with different passwords);
                # the password typed at replay time is only for fields whose value was not saved
                value = (s.get("value") or self.password) if s.get("secret") else s.get("value")
                if s.get("secret") and not value:
                    raise AssertionError("ขั้นนี้ต้องใช้รหัสผ่าน แต่ไม่ได้บันทึกไว้และไม่ได้ใส่ตอนกดเล่นซ้ำ")
                loc.fill(value or "")
            elif a == "select":
                loc.select_option(s.get("value") or "")
            elif a == "check":
                loc.check() if s.get("checked") else loc.uncheck()
            elif a == "press":
                loc.press("Enter")
            page.wait_for_timeout(max(150, self.slow_ms // 2))
            return
        if a == "goto":
            page.goto(s["url"], wait_until="domcontentloaded")
            page.evaluate(BANNER_JS, f"✔ {label}")
            page.wait_for_timeout(self.slow_ms)
            self._shot(page, f"step_{s['no']}")
            r["shot"] = f"step_{s['no']}"
            r["check"] = "เปิดหน้าแล้ว: " + (urlparse(page.url).path or "/")
            return
        if a == "dialog":
            need = sum(1 for x in self.steps[: i + 1] if x["action"] == "dialog")
            for _ in range(50):
                if len(dialogs) >= need:
                    break
                page.wait_for_timeout(100)
            if len(dialogs) < need:
                raise AssertionError(f"ไม่พบ popup \"{s['message']}\"")
            if dialogs[need - 1] != s["message"]:
                raise AssertionError(f"popup ข้อความไม่ตรง: ได้ \"{dialogs[need - 1]}\" แต่ที่บันทึกไว้คือ \"{s['message']}\"")
            r["check"] = f"popup: \"{s['message']}\""
            page.evaluate(BANNER_JS, f"✔ {label}")
            self._shot(page, f"step_{s['no']}")
            r["shot"] = f"step_{s['no']}"
            return
        if a in ("popup", "assert_text"):
            text = s.get("check") if a == "assert_text" else " ".join(s["text"].split(" ")[0:8])[:60]
            # only elements the user can see: pages such as Google Translate keep hidden copies of the same text
            target = page.get_by_text(text if a == "assert_text" else re.compile(re.escape(text))).filter(visible=True)
            if a == "assert_text" and s.get("mode") == "hidden":
                expect(target).to_have_count(0)
                page.evaluate(BANNER_JS, f"✔ {label}")
            else:
                expect(target.first).to_be_visible()
                page.evaluate(HIGHLIGHT_JS, [target.first.element_handle(), f"✔ {label}"])
            page.wait_for_timeout(self.slow_ms)
            self._shot(page, f"step_{s['no']}")
            r["shot"] = f"step_{s['no']}"
            page.evaluate(CLEAR_JS)
            r["check"] = "พบข้อความแล้ว" if s.get("mode") != "hidden" else "ไม่พบข้อความ (ถูกต้อง)"
            return


def get(rid: str) -> "Replay":
    r = _runs.get(rid)
    if r is None:
        raise AppError("NOT_FOUND", "ไม่พบการเล่นซ้ำนี้", status=404)
    return r


# ================================================================== data-driven replay: same recording, new data per row (CSV)
TRUE_WORDS = {"1", "true", "yes", "y", "x", "on", "checked", "✓", "ใช่", "ติ๊ก"}
EXPECT_COL = "_expect_text"     # optional column: text that must be visible at the end of the row
MAX_ROWS = 200
_data_runs: dict[str, "DataRun"] = {}


def _col_name(raw: str) -> str:
    c = re.sub(r"[\s,;\"']+", "_", (raw or "").strip()).strip("_")
    return c[:40] or "field"


def data_fields(steps: list[dict]) -> list[dict]:
    """The fields of a recording that can take new data: one CSV column each (secret password fields are never a column)."""
    from .web_recorder import el_name
    out, used = [], set()
    for s in steps:
        if s["action"] not in ("fill", "select", "check") or s.get("secret"):
            continue
        base = _col_name(el_name(s["el"]))
        col, n = base, 2
        while col in used:
            col, n = f"{base}_{n}", n + 1
        used.add(col)
        sample = ("1" if s.get("checked") else "0") if s["action"] == "check" else (s.get("option") if s["action"] == "select" and s.get("option") else s.get("value") or "")
        out.append({"column": col, "no": s["no"], "action": s["action"], "field": el_name(s["el"]), "sample": sample})
    return out


def template_csv(steps: list[dict]) -> str:
    import csv
    import io
    f = data_fields(steps)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([x["column"] for x in f] + [EXPECT_COL])
    w.writerow([x["sample"] for x in f] + [""])
    return "\ufeff" + buf.getvalue()     # BOM → Excel opens Thai text correctly


def parse_csv(text: str, steps: list[dict]) -> list[dict]:
    import csv
    import io
    text = (text or "").lstrip("\ufeff")
    if not text.strip():
        raise AppError("CSV_EMPTY", "ไฟล์ CSV ว่าง", status=400)
    try:   # Excel in some locales saves with ';' or tab
        delim = csv.Sniffer().sniff(text.splitlines()[0], delimiters=",;\t").delimiter
    except csv.Error:
        delim = ","
    rows = list(csv.DictReader(io.StringIO(text), delimiter=delim))
    cols = {x["column"] for x in data_fields(steps)}
    head = set(rows[0].keys()) if rows else set()
    if not rows or not (head & cols):
        raise AppError("CSV_NO_COLUMNS", "ไม่พบคอลัมน์ที่ตรงกับช่องที่บันทึกไว้ — ดาวน์โหลด Template แล้วใช้หัวคอลัมน์เดิม "
                       f"({', '.join(sorted(cols)) or 'ไม่มีช่องกรอก'})", status=400)
    rows = [{k: (v or "").strip() for k, v in r.items() if k} for r in rows if any((v or "").strip() for v in r.values() if v is not None)]
    if len(rows) > MAX_ROWS:
        raise AppError("CSV_TOO_MANY_ROWS", f"รองรับสูงสุด {MAX_ROWS} แถวต่อครั้ง", status=400)
    return rows


def apply_row(steps: list[dict], row: dict) -> list[dict]:
    """A copy of the steps with this row's values; an empty cell keeps the recorded value."""
    by_no = {x["no"]: x["column"] for x in data_fields(steps)}
    swaps = []   # recorded value → new value, so a popup/text that echoes the input ("สำเร็จ: สมชาย") is checked with the new data
    for s in steps:
        col = by_no.get(s["no"])
        v = row.get(col, "") if col else ""
        if col and v and s["action"] == "fill" and s.get("value") and len(str(s["value"])) >= 2:
            swaps.append((str(s["value"]), v))
    out = []
    for s in steps:
        if s["action"] in ("dialog", "popup", "assert_text") and swaps:
            s = dict(s)
            key = {"dialog": "message", "popup": "text", "assert_text": "check"}[s["action"]]
            for old_v, new_v in sorted(swaps, key=lambda x: -len(x[0])):
                s[key] = s[key].replace(old_v, new_v)
            if s["action"] != "popup":
                from .web_recorder import describe_step
                s["text"] = describe_step(s)
            out.append(s)
            continue
        s = dict(s)
        col = by_no.get(s["no"])
        v = row.get(col, "") if col else ""
        if col and v != "":
            if s["action"] == "check":
                s["checked"] = v.lower() in TRUE_WORDS
            else:
                s["value"] = v
                s.pop("option", None)
            from .web_recorder import describe_step
            s["text"] = describe_step(s)
        out.append(s)
    exp = row.get(EXPECT_COL, "")
    if exp:
        out.append({"action": "assert_text", "check": exp, "mode": "visible", "no": len(out) + 1, "seg": out[-1].get("seg", 0) if out else 0,
                    "text": f"ตรวจว่าเห็นข้อความ \"{exp}\" (ผลที่คาดหวังของแถวนี้)"})
    return out


class DataRun:
    """Replay one recording once per CSV row, one after another, and keep the result of every row."""

    def __init__(self, exploration: dict, rows: list[dict], *, password: str | None = None, slow_ms: int = 700,
                 shot_writer=None, result_writer=None, headless: bool | None = None):
        self.id = uuid.uuid4().hex[:10]
        self.eid = exploration["id"]
        self.exploration = exploration
        self.base = exploration.get("recorded_steps", [])
        if not self.base:
            raise AppError("NOT_REPLAYABLE", "เล่นซ้ำได้เฉพาะรายการที่มาจาก 'บันทึกการใช้งาน (Record)'", status=409)
        self.fields = data_fields(self.base)
        self.rows = rows
        self.password, self.slow_ms, self.headless = password, slow_ms, headless
        self.shot_writer = shot_writer      # callable(dir, name, png)
        self.result_writer = result_writer  # callable(csv_text) — keeps the result file in storage
        self.status = "starting"
        self.current_row = 0
        self.row_results: list[dict] = [{"row": i + 1, "values": r, "status": "pending"} for i, r in enumerate(rows)]
        self.error: str | None = None
        self.started_at = datetime.now(timezone.utc).isoformat()
        self.finished_at: str | None = None
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)

    def start(self) -> "DataRun":
        with _lock:
            if any(r.status in ("starting", "running") for r in list(_runs.values()) + list(_data_runs.values())):
                raise AppError("REPLAY_BUSY", "กำลังเล่นซ้ำรายการอื่นอยู่ — รอให้จบก่อน", status=409)
            _data_runs[self.id] = self
        self._thread.start()
        return self

    def cancel(self) -> None:
        self._stop.set()
        for rr in self.row_results:
            rp = _runs.get(rr.get("replay_id") or "")
            if rp:
                rp.cancel()

    def _run(self) -> None:
        try:
            self.status = "running"
            for i, row in enumerate(self.rows):
                rr = self.row_results[i]
                if self._stop.is_set():
                    rr["status"] = "skipped"
                    continue
                self.current_row = i + 1
                d = f"data/{self.id}/row{i + 1}"
                writer = (lambda name, png, d=d: self.shot_writer(d, name, png)) if self.shot_writer else None
                rp = Replay(self.exploration, password=self.password, slow_ms=self.slow_ms, headless=self.headless,
                            shot_writer=writer, steps=apply_row(self.base, row), shot_dir=d)
                with _lock:
                    _runs[rp.id] = rp
                rr.update({"status": "running", "replay_id": rp.id})
                rp._run()                     # same thread: rows run one by one
                v = rp.view()
                failed = next((x for x in v["results"] if x["status"] == "failed"), None)
                rr.update({"status": "error" if rp.status == "error" else rp.status, "passed": v["summary"]["passed"],
                           "total": v["summary"]["total"], "failed_step": failed["no"] if failed else None,
                           "message": rp.error or (failed or {}).get("message", "")})
            done = [r for r in self.row_results if r["status"] not in ("pending", "skipped")]
            self.status = "cancelled" if self._stop.is_set() else ("passed" if done and all(r["status"] == "passed" for r in done) else "failed")
        except Exception as e:  # noqa: BLE001
            self.status, self.error = "error", str(e)[:500]
        finally:
            self.finished_at = datetime.now(timezone.utc).isoformat()
            if self.result_writer:
                try:
                    self.result_writer(self.results_csv())
                except Exception:  # noqa: BLE001
                    pass

    def view(self) -> dict:
        rs = self.row_results
        return {"id": self.id, "exploration_id": self.eid, "status": self.status, "current_row": self.current_row, "error": self.error,
                "fields": self.fields, "rows": rs, "started_at": self.started_at, "finished_at": self.finished_at,
                "summary": {"total": len(rs), "passed": len([r for r in rs if r["status"] == "passed"]),
                            "failed": len([r for r in rs if r["status"] in ("failed", "error")])}}

    def results_csv(self) -> str:
        import csv
        import io
        cols = [f["column"] for f in self.fields]
        extra = sorted({k for r in self.rows for k in r} - set(cols))
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["row"] + cols + extra + ["status", "passed_steps", "total_steps", "failed_step", "message"])
        for rr in self.row_results:
            v = rr["values"]
            w.writerow([rr["row"]] + [v.get(c, "") for c in cols + extra] +
                       [rr["status"], rr.get("passed", ""), rr.get("total", ""), rr.get("failed_step") or "", rr.get("message", "")])
        return "\ufeff" + buf.getvalue()


def get_data_run(did: str) -> DataRun:
    r = _data_runs.get(did)
    if r is None:
        raise AppError("NOT_FOUND", "ไม่พบการรันด้วยชุดข้อมูลนี้", status=404)
    return r
