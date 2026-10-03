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
                 shot_writer=None):
        self.id = uuid.uuid4().hex[:10]
        self.eid = exploration["id"]
        self.url = exploration["url"]
        self.steps = [s for s in exploration.get("recorded_steps", [])]
        if not self.steps:
            raise AppError("NOT_REPLAYABLE", "เล่นซ้ำได้เฉพาะรายการที่มาจาก 'บันทึกการใช้งาน (Record)'", status=409)
        self.password = password or next((s.get("value") for s in self.steps if s.get("secret") and s.get("value")), None)
        self.headless = (os.getenv("WEB_RECORDER_HEADLESS", "") == "1") if headless is None else headless
        self.slow_ms = max(0, min(3000, slow_ms))
        self.shot_writer = shot_writer  # callable(name, png_bytes)
        self.status = "starting"
        self.current = 0
        self.results: list[dict] = [{"no": s["no"], "text": s["text"], "seg": s.get("seg", 0), "status": "pending"} for s in self.steps]
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
                            "failed": len([r for r in self.results if r["status"] == "failed"])}}

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
                for i, s in enumerate(self.steps):
                    if self._stop.is_set():
                        self.results[i]["status"] = "skipped"
                        continue
                    self.current = s["no"]
                    r = self.results[i]
                    r["status"] = "running"
                    t0 = time.monotonic()
                    try:
                        self._do(page, s, dialogs, expect, i)
                        r["status"] = "passed"
                    except Exception as e:  # noqa: BLE001
                        r["status"] = "failed"
                        r["message"] = re.sub(r"\s+", " ", str(e))[:400]
                        try:
                            self._shot(page, f"step_{s['no']}_fail")
                            r["shot"] = f"step_{s['no']}_fail"
                        except Exception:  # noqa: BLE001
                            pass
                        for rest in self.results[i + 1:]:
                            rest["status"] = "skipped"
                        break
                    finally:
                        r["ms"] = int((time.monotonic() - t0) * 1000)
                try:
                    page.evaluate(BANNER_JS, "เล่นซ้ำจบแล้ว — " + ("ผ่านทุกขั้น" if all(x["status"] == "passed" for x in self.results) else "มีขั้นที่ไม่ผ่าน"))
                    page.wait_for_timeout(1500 if not self.headless else 0)
                except PwError:
                    pass
                browser.close()
            self.status = "passed" if all(x["status"] == "passed" for x in self.results) else ("cancelled" if self._stop.is_set() else "failed")
        except Exception as e:  # noqa: BLE001
            self.status, self.error = "error", str(e)[:500]
        finally:
            self.finished_at = datetime.now(timezone.utc).isoformat()

    def _shot(self, page, name: str) -> None:
        if self.shot_writer:
            self.shot_writer(name, page.screenshot())

    def _do(self, page, s: dict, dialogs: list, expect, i: int) -> None:
        a = s["action"]
        label = f"ขั้นที่ {s['no']}: {s['text']}"
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
                loc.click()
                if s.get("url_after"):
                    u = urlparse(s["url_after"])
                    target = (u.path or "/") + (("?" + u.query) if u.query else "")
                    expect(page).to_have_url(re.compile(re.escape(target)))
                    r["check"] = f"ไปหน้า {target} แล้ว"
                elif len(dialogs) > n_before:
                    pass
            elif a == "fill":
                value = self.password if s.get("secret") else s.get("value")
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
            target = page.get_by_text(text if a == "assert_text" else re.compile(re.escape(text)))
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


def get(rid: str) -> Replay:
    r = _runs.get(rid)
    if r is None:
        raise AppError("NOT_FOUND", "ไม่พบการเล่นซ้ำนี้", status=404)
    return r
