"""Playwright generator + Locator Advisor (from user-provided DOM) + Recorded Flow converter.

No function here reads, solves or bypasses CAPTCHA/OTP — they are Manual Checkpoints (หัวข้อ 23, 45).
"""
from __future__ import annotations

import re
from html.parser import HTMLParser

from .common import GenTC, one_line, py_str, slug, tip

DEFAULT_LOCATORS = [{"name": "username_input", "strategy": "get_by_label", "value": "Username"},
                    {"name": "password_input", "strategy": "get_by_label", "value": "Password"},
                    {"name": "login_button", "strategy": "get_by_role", "value": "button|Login"},
                    {"name": "result_table", "strategy": "get_by_test_id", "value": "NEEDS_CONFIGURATION"}]
STRATEGIES = {"get_by_test_id", "get_by_role", "get_by_label", "get_by_text", "css", "xpath"}


def _loc_expr(loc: dict) -> str:
    s, v = loc["strategy"], loc["value"]
    if s == "get_by_role":
        role, _, name = v.partition("|")
        return f"self.page.get_by_role({py_str(role)}, name={py_str(name)})"
    if s == "css":
        return f"self.page.locator({py_str(v)})"
    if s == "xpath":
        return f"self.page.locator({py_str('xpath=' + v)})  # XPath = ตัวเลือกสุดท้าย"
    return f"self.page.{s}({py_str(v)})"


def gen_playwright(tcs: list[GenTC], project: dict, opts: dict) -> dict:
    page_name = opts.get("page_name") or "Target"
    mod = slug(page_name) + "_page"
    cls = re.sub(r"[^A-Za-z0-9]", "", page_name) + "Page"
    locs = [l for l in (opts.get("locators") or []) if l.get("strategy") in STRATEGIES] or DEFAULT_LOCATORS
    names = {slug(l["name"]) for l in locs}
    for req in ("username_input", "password_input", "login_button", "result_table"):
        if req not in names:
            locs.append(next(d for d in DEFAULT_LOCATORS if d["name"] == req))
    files: dict[str, str] = {}
    files["pages/__init__.py"] = ""
    files["pages/base_page.py"] = '''from playwright.sync_api import Page


class BasePage:
    def __init__(self, page: Page, base_url: str):
        self.page = page
        self.base_url = base_url

    def open(self, path: str = ""):
        self.page.goto(f"{self.base_url}{path}")

    def manual_checkpoint(self, reason: str):
        """Pause for the human to complete OTP / CAPTCHA. Never automate these."""
        print(f"MANUAL CHECKPOINT: {reason} — complete it in the browser, then press Resume in the inspector")
        self.page.pause()
'''
    props = "\n".join(f"    @property\n    def {slug(l['name'])}(self):\n        return {_loc_expr(l)}\n" for l in locs)
    files[f"pages/{mod}.py"] = f'''from pages.base_page import BasePage


class {cls}(BasePage):
    """Page Object for {page_name}.
    Locator priority: data-testid > role > label > text > CSS > XPath.
    """

{props}
    def login(self, username: str, password: str):
        self.username_input.fill(username)
        self.password_input.fill(password)
        self.login_button.click()
'''
    files["tests/ui/__init__.py"] = ""
    files["tests/ui/conftest.py"] = '''import os
from pathlib import Path

import pytest

AUTH_DIR = Path(".auth")  # restricted dir for storage_state, git-ignored — never commit sessions


@pytest.fixture(scope="session")
def base_url_env():
    url = os.getenv("BASE_URL", "")
    if not url:
        pytest.skip("NEEDS_CONFIGURATION: BASE_URL")
    return url


@pytest.fixture(scope="session")
def credentials():
    user, pw = os.getenv("APP_USERNAME"), os.getenv("APP_PASSWORD")
    if not user or not pw:
        pytest.skip("NEEDS_CONFIGURATION: APP_USERNAME / APP_PASSWORD in .env")
    return user, pw


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    rep = outcome.get_result()
    if rep.when == "call" and rep.failed and "page" in item.funcargs:
        Path("screenshots").mkdir(exist_ok=True)
        item.funcargs["page"].screenshot(path=f"screenshots/{item.name}.png", full_page=True)
'''
    login_path = opts.get("login_path") or "/"
    for tc in tcs:
        d = tc.data
        checkpoints = ""
        if opts.get("otp"):
            checkpoints += '    po.manual_checkpoint("กรอก OTP ด้วยตนเอง")\n'
        if opts.get("captcha"):
            checkpoints += '    po.manual_checkpoint("ทำ CAPTCHA ด้วยตนเอง — ระบบไม่อ่านหรือข้าม CAPTCHA")\n'
        steps = "\n".join(f"    # Step {s['n']}: {one_line(s['action'], 100)} | Expected: {str(s['expected'])[:80]}" for s in d["steps"][1:])
        files[f"tests/ui/test_{slug(tc.tc_id)}.py"] = f'''"""{tc.tc_id} | {tc.req_id} | {d['title'].replace('"', "'")[:80]}"""
import pytest

from pages.{mod} import {cls}


@pytest.mark.testcase("{tc.tc_id}")
def test_{slug(tc.tc_id)}_ui(page, base_url_env, credentials):
    po = {cls}(page, base_url_env)
    po.open({py_str(login_path)})
    po.login(*credentials)
{checkpoints}{steps}
    assert po.result_table.is_visible()  # NEEDS_CONFIGURATION: replace with real assertion
'''
    browser = opts.get("browser") or "chromium"
    flag = "--browser chromium --browser-channel msedge" if browser == "msedge" else f"--browser {browser}"
    files["playwright.config.md"] = (f"Browsers: {browser} (headed). Run:\n  pip install pytest-playwright && python -m playwright install {('chromium' if browser == 'msedge' else browser)}\n"
                                     f"  pytest tests/ui --headed {flag} --tracing retain-on-failure --screenshot only-on-failure\n"
                                     "Headless Mode: remove --headed (future default for CI).\n")
    ids = ", ".join(t.tc_id for t in tcs)
    tips = {f"pages/{mod}.py": [tip(f"class {cls}(BasePage)", "รวม Locator และการใช้งานหน้าเว็บไว้ที่เดียว", "Playwright page", "Methods สำหรับใช้งานหน้าเว็บ",
                                    "Page Object Model ช่วยแยก Locator ออกจาก Test Case ทำให้ดูแลง่ายเมื่อ UI เปลี่ยน",
                                    "Locator เรียงตามลำดับความเสถียร data-testid ก่อน XPath เป็นตัวสุดท้าย", ids,
                                    "Locator ที่เป็น NEEDS_CONFIGURATION ต้องแก้ก่อน", "เปิดหน้าเว็บจริงแล้วตรวจ Locator ทุกตัว")],
            "pages/base_page.py": [tip("manual_checkpoint()", "หยุดให้ผู้ใช้กรอก OTP/ทำ CAPTCHA เอง", "เหตุผล", "Browser หยุดรอ",
                                       "ระบบห้ามอ่านหรือข้าม CAPTCHA และห้ามเก็บ OTP", "page.pause() เปิด Inspector ให้กด Resume หลังทำเสร็จ", "-",
                                       "ใช้ได้เฉพาะ Headed Mode", "-")],
            "tests/ui/conftest.py": [tip("pytest_runtest_makereport", "ถ่าย Screenshot เมื่อ Test Fail", "ผล Test", "screenshots/*.png",
                                         "มีหลักฐานประกอบ Defect", "Hook ทำงานหลัง Test แต่ละข้อ", ids, "Screenshot อาจมีข้อมูลบนหน้าจอ ห้าม Commit", "-")]}
    return {"files": files, "tips": tips}


# ------------------------------------------------------------------ Locator Advisor (user-pasted DOM only)
class _DomCollector(HTMLParser):
    TAGS = {"input", "button", "a", "select", "textarea", "table"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.elements: list[dict] = []
        self.labels: dict[str, str] = {}
        self._stack: list[dict] = []
        self._label_for: str | None = None
        self._label_text: list[str] = []
        self._in_label = False
        self._counts: dict[str, int] = {}

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "label":
            self._in_label, self._label_for, self._label_text = True, a.get("for"), []
        if tag in self.TAGS or "role" in a or "data-testid" in a:
            self._counts[tag] = self._counts.get(tag, 0) + 1
            el = {"tag": tag, "attrs": a, "text": "", "idx": self._counts[tag], "in_label": "".join(self._label_text).strip() if self._in_label else ""}
            self.elements.append(el)
            if tag not in ("input",):
                self._stack.append(el)

    def handle_endtag(self, tag):
        if tag == "label":
            text = "".join(self._label_text).strip()
            if self._label_for:
                self.labels[self._label_for] = text
            self._in_label = False
        if self._stack and self._stack[-1]["tag"] == tag:
            self._stack.pop()

    def handle_data(self, data):
        if self._in_label:
            self._label_text.append(data)
        for el in self._stack:
            el["text"] += data


def locators_from_html(html: str) -> list[dict]:
    p = _DomCollector()
    p.feed(html[:200_000])
    out, used = [], set()

    def nm(s: str) -> str:
        n = slug(s)[:30] or "element"
        while n in used:
            n += "_2"
        used.add(n)
        return n

    implicit = {"button": "button", "a": "link", "select": "combobox", "textarea": "textbox", "table": "table"}
    for el in p.elements:
        a, tag = el["attrs"], el["tag"]
        tid, aria = a.get("data-testid"), a.get("aria-label")
        role = a.get("role") or implicit.get(tag)
        if tag == "input":
            typ = (a.get("type") or "text").lower()
            role = role or ("checkbox" if typ == "checkbox" else "radio" if typ == "radio" else "button" if typ == "submit" else "textbox")
        lab = p.labels.get(a.get("id", ""), "") or el["in_label"]
        text = (el["text"] or a.get("value") or "").strip()[:40]
        if tid:
            out.append({"name": nm(tid), "strategy": "get_by_test_id", "value": tid, "note": "1 data-testid (เสถียรที่สุด)"})
        elif role and (aria or text) and role in ("button", "link", "checkbox", "radio", "tab", "table"):
            out.append({"name": nm(f"{aria or text}_{role}"), "strategy": "get_by_role", "value": f"{role}|{aria or text}", "note": "2 role + accessible name"})
        elif lab or aria:
            out.append({"name": nm(f"{lab or aria}_input"), "strategy": "get_by_label", "value": lab or aria, "note": "3 label"})
        elif text and tag != "input":
            out.append({"name": nm(text), "strategy": "get_by_text", "value": text, "note": "4 text"})
        elif a.get("id") or a.get("name"):
            v = f"#{a['id']}" if a.get("id") else f'{tag}[name="{a["name"]}"]'
            out.append({"name": nm(a.get("id") or a.get("name")), "strategy": "css", "value": v, "note": "5 CSS — ควรขอให้ Dev เพิ่ม data-testid"})
        else:
            out.append({"name": nm(f"{tag}_{el['idx']}"), "strategy": "xpath", "value": f"//{tag}[{el['idx']}]", "note": "6 XPath — ตัวเลือกสุดท้าย เปราะบาง"})
    return out[:60]


def locators_from_recording(src: str) -> list[dict]:
    """Convert `playwright codegen --target python-pytest` output into approved-able locators."""
    locs, used = [], set()
    for m in re.finditer(r"page\.(get_by_test_id|get_by_role|get_by_label|get_by_text|get_by_placeholder|locator)\(([^)]*)\)", src):
        args = [x[0] or x[1] for x in re.findall(r'"([^"]*)"|\'([^\']*)\'', m.group(2))]
        if not args:
            continue
        kind = m.group(1)
        if kind == "locator":
            strategy = "xpath" if args[0].startswith(("xpath=", "//")) else "css"
        elif kind == "get_by_placeholder":
            strategy = "get_by_label"
        else:
            strategy = kind
        value = f"{args[0]}|{args[1] if len(args) > 1 else ''}" if strategy == "get_by_role" else re.sub(r"^xpath=", "", args[0])
        if (strategy, value) in used:
            continue
        used.add((strategy, value))
        base = (args[1] if len(args) > 1 else args[0]) + (f"_{args[0]}" if strategy == "get_by_role" else "")
        locs.append({"name": slug(base)[:30] or "element", "strategy": strategy, "value": value, "note": "จาก Recorded Flow"})
    return locs
