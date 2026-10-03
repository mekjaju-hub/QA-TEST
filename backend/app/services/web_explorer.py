"""Web Explorer (practice mode): open a URL in a headless browser, observe the page, optionally log in,
then describe what was seen so the user can practise observation → test cases → pytest automation.

Safety rules (PROJECT_INSTRUCTIONS / SECURITY.md):
- Only http/https URLs. One page load + at most one login attempt per exploration (no brute force, no crawling).
- CAPTCHA / OTP are never solved or bypassed: when detected the login step is skipped and reported.
- The password is used once in memory and never stored, logged or returned. The username is stored masked.
"""
from __future__ import annotations

import re
import time
from urllib.parse import urlparse

from ..core.errors import AppError

SNAPSHOT_JS = r"""
() => {
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const clean = t => (t || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const txt = el => clean(el.innerText || el.value || el.getAttribute('aria-label') || el.title || '');
  const labelOf = el => {
    if (el.id) { const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (l) return clean(l.innerText); }
    const p = el.closest('label'); if (p) return clean(p.innerText);
    return clean(el.getAttribute('aria-label') || '');
  };
  const formIdx = el => el.form ? Array.from(document.forms).indexOf(el.form) : -1;
  const fields = Array.from(document.querySelectorAll('input,select,textarea'))
    .filter(e => (e.getAttribute('type') || '').toLowerCase() !== 'hidden' && vis(e)).slice(0, 40)
    .map(e => ({ tag: e.tagName.toLowerCase(), type: (e.getAttribute('type') || (e.tagName === 'INPUT' ? 'text' : e.tagName)).toLowerCase(),
      name: e.getAttribute('name') || '', id: e.id || '', placeholder: e.getAttribute('placeholder') || '', label: labelOf(e),
      required: !!e.required, autocomplete: e.getAttribute('autocomplete') || '', form: formIdx(e),
      options: e.tagName === 'SELECT' ? Array.from(e.options).slice(0, 30).map(o => ({ text: clean(o.text), value: o.value, disabled: !!o.disabled })) : undefined,
      selected: e.tagName === 'SELECT' ? e.value : undefined }));
  const buttons = Array.from(document.querySelectorAll('button,input[type=submit],input[type=button],[role=button]'))
    .filter(vis).slice(0, 30)
    .map(e => ({ text: txt(e), type: (e.getAttribute('type') || (e.tagName === 'BUTTON' ? 'submit' : '')).toLowerCase(), id: e.id || '',
      name: e.getAttribute('name') || '', form: formIdx(e) }));
  const links = Array.from(document.querySelectorAll('a[href]')).filter(vis).slice(0, 60)
    .map(a => ({ text: txt(a), href: a.href, nav: !!a.closest('nav,header,aside,[role=navigation]') }));
  const headings = Array.from(document.querySelectorAll('h1,h2,h3')).filter(vis).slice(0, 15)
    .map(h => ({ level: +h.tagName[1], text: txt(h) })).filter(h => h.text);
  const body = (document.body && document.body.innerText) || '';
  const captcha = !!document.querySelector('iframe[src*="recaptcha"],iframe[src*="hcaptcha"],iframe[src*="turnstile"],.g-recaptcha,.h-captcha,.cf-turnstile')
    || /captcha/i.test(body);
  const otp = !!document.querySelector('input[autocomplete="one-time-code"]') || /\bOTP\b|one[- ]time (pass)?code|รหัส OTP/i.test(body);
  const alerts = Array.from(document.querySelectorAll('[role=alert],[aria-live=assertive],[data-test*=error],[data-testid*=error],.error-message,.alert-danger,.alert-error,.err-box,.invalid-feedback,.text-danger,.field-error,.flash.error'))
    .filter(vis).map(txt).filter(Boolean).slice(0, 5);
  return { title: document.title || '', url: location.href, lang: document.documentElement.lang || '', headings, fields, buttons, links,
    forms: document.forms.length, captcha, otp, alerts, imgs_no_alt: Array.from(document.images).filter(i => !i.alt && vis(i)).length,
    has_password: fields.some(f => f.type === 'password') };
}
"""

ALERT_SEL = "[role=alert],[aria-live=assertive],[data-test*=error],[data-testid*=error],.error-message,.alert-danger,.alert-error,.err-box,.invalid-feedback,.text-danger,.field-error,.flash.error"
ALERT_JS = "() => Array.from(document.querySelectorAll(%s)).some(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (e.innerText || '').trim().length > 0; })" % repr(ALERT_SEL)

LOGIN_BTN_RX = re.compile(r"log\s*in|sign\s*in|เข้าสู่ระบบ|ล็อกอิน|ลงชื่อเข้าใช้|submit|continue|ตกลง|next", re.I)
LOGOUT_RX = re.compile(r"log\s*out|sign\s*out|ออกจากระบบ|ลงชื่อออก", re.I)
USER_TYPES = {"text", "email", "tel", ""}


def check_url(url: str) -> str:
    url = (url or "").strip()
    if url and "://" not in url:
        url = "https://" + url
    u = urlparse(url)
    if u.scheme not in ("http", "https") or not u.netloc:
        raise AppError("VALIDATION", "URL ต้องขึ้นต้นด้วย http:// หรือ https:// เช่น https://www.example.com", status=422)
    return url


def mask_user(u: str | None) -> str:
    if not u:
        return ""
    return u[0] + "***" + (u[-1] if len(u) > 2 else "")


# ------------------------------------------------------------------ locator strategies (shared with code generation)
def candidates_field(f: dict) -> list[dict]:
    out = []
    if f.get("label"):
        out.append({"by": "label", "value": f["label"]})
    if f.get("placeholder"):
        out.append({"by": "placeholder", "value": f["placeholder"]})
    if f.get("id"):
        out.append({"by": "css", "value": f'[id="{f["id"]}"]'})
    if f.get("name"):
        out.append({"by": "css", "value": f'{f["tag"]}[name="{f["name"]}"]'})
    if f.get("type") == "password":
        out.append({"by": "css", "value": 'input[type="password"]'})
    return out


def candidates_button(b: dict) -> list[dict]:
    out = []
    if b.get("text"):
        out.append({"by": "role", "role": "button", "value": b["text"]})
    if b.get("id"):
        out.append({"by": "css", "value": f'[id="{b["id"]}"]'})
    if b.get("type") == "submit":
        out.append({"by": "css", "value": '[type="submit"]'})
    return out


def candidates_link(l: dict) -> list[dict]:
    return [{"by": "role", "role": "link", "value": l["text"]}] if l.get("text") else []


ICON_GAP = r"[\s\ue000-\uf8ff]*"   # spaces / icon-font glyphs (Font Awesome ::before) around a button or link name


def role_name(text: str):
    """The visible name of a button/link, matched the way a person reads it: whole text, any upper/lower case
    (CSS text-transform shows "WOMEN" for "Women") and ignoring icon-font glyphs ("\uf03a API Testing")."""
    return re.compile("^" + ICON_GAP + re.escape(text) + ICON_GAP + "$", re.IGNORECASE)


def to_locator(page, spec: dict):
    by = spec["by"]
    if by == "label":
        return page.get_by_label(spec["value"], exact=True)
    if by == "placeholder":
        return page.get_by_placeholder(spec["value"], exact=True)
    if by == "role":
        return page.get_by_role(spec["role"], name=role_name(spec["value"]))
    return page.locator(spec["value"])


def pick_unique(page, cands: list[dict]) -> dict | None:
    """First strategy that matches exactly one element (what a stable test needs)."""
    for c in cands:
        try:
            if to_locator(page, c).count() == 1:
                return c
        except Exception:  # noqa: BLE001 — invalid selector for this page, try the next strategy
            continue
    return None


def _annotate(page, snap: dict) -> dict:
    for f in snap["fields"]:
        f["locator"] = pick_unique(page, candidates_field(f))
    for b in snap["buttons"]:
        b["locator"] = pick_unique(page, candidates_button(b))
    seen = set()
    for l in snap["links"]:
        key = l["text"]
        l["locator"] = pick_unique(page, candidates_link(l)) if key and key not in seen else None
        seen.add(key)
    return snap


def _login_parts(snap: dict) -> tuple[dict | None, dict | None, dict | None]:
    pw = next((f for f in snap["fields"] if f["type"] == "password" and f.get("locator")), None)
    if not pw:
        return None, None, None
    same_form = [f for f in snap["fields"] if f["form"] == pw["form"]]
    pool = same_form if pw["form"] >= 0 else snap["fields"]
    user = None
    for f in pool:
        if f is pw:
            break
        if f["type"] in USER_TYPES and f["tag"] == "input" and f.get("locator"):
            user = f
    btns = [b for b in snap["buttons"] if b.get("locator") and (pw["form"] < 0 or b["form"] == pw["form"])]
    submit = next((b for b in btns if LOGIN_BTN_RX.search(b["text"] or "")), None) or next((b for b in btns if b["type"] == "submit"), None)
    return user, pw, submit


def explore(url: str, *, username: str | None = None, password: str | None = None, shots: dict | None = None,
            timeout_ms: int = 30000, click_explore: bool = False, max_clicks: int = 10) -> dict:
    """Open url, snapshot, optionally log in once. `shots` receives PNG bytes {'before': .., 'after': ..}."""
    url = check_url(url)
    try:
        from playwright.sync_api import Error as PwError
        from playwright.sync_api import sync_playwright
    except ImportError as e:
        raise AppError("PLAYWRIGHT_MISSING", "ยังไม่ได้ติดตั้ง Playwright สำหรับ Python", status=503,
                       technical=str(e), action="ปิดแล้วเปิด RUN-DEV.bat ใหม่ (ติดตั้งให้อัตโนมัติ) หรือรัน: pip install playwright && python -m playwright install chromium")
    shots = shots if shots is not None else {}
    t0 = time.monotonic()
    result: dict = {"url": url, "login": {"attempted": False}, "warnings": []}
    try:
        with sync_playwright() as p:
            try:
                browser = p.chromium.launch(headless=True)
            except PwError as e:
                raise AppError("BROWSER_MISSING", "ยังไม่ได้ติดตั้ง Chromium สำหรับ Playwright", status=503, technical=str(e)[:500],
                               action="รัน: .venv\\Scripts\\python -m playwright install chromium (หรือเปิด RUN-DEV.bat ใหม่)")
            ctx = browser.new_context(viewport={"width": 1280, "height": 800}, locale="th-TH")
            page = ctx.new_page()
            page.set_default_timeout(10000)
            try:
                resp = page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
            except PwError as e:
                raise AppError("PAGE_UNREACHABLE", "เปิดหน้าเว็บไม่ได้ — ตรวจ URL หรือการเชื่อมต่ออินเทอร์เน็ต", status=422, technical=str(e)[:500])
            try:
                page.wait_for_load_state("networkidle", timeout=8000)
            except PwError:
                result["warnings"].append("หน้าเว็บยังโหลดข้อมูลอยู่เรื่อยๆ (ไม่นิ่งภายใน 8 วินาที) — ถ่ายภาพ ณ ตอนนั้น")
            result["status"] = resp.status if resp else None
            before = _annotate(page, page.evaluate(SNAPSHOT_JS))
            shots["before"] = page.screenshot(full_page=False)
            result["before"] = before
            user_f, pw_f, submit_b = _login_parts(before)
            result["login_form"] = {"user": user_f, "password": pw_f, "submit": submit_b} if pw_f else None

            if pw_f and username and password:
                if before["captcha"]:
                    result["login"] = {"attempted": False, "reason": "CAPTCHA", "message": "พบ CAPTCHA — ระบบไม่แก้/ข้าม CAPTCHA ให้ ต้อง Login เองด้วยมือ"}
                else:
                    result["login"] = _try_login(page, before, user_f, pw_f, submit_b, username, password, PwError)
                    if result["login"].get("success"):
                        after = _annotate(page, page.evaluate(SNAPSHOT_JS))
                        result["after"] = after
                        shots["after"] = page.screenshot(full_page=False)
                        if after["otp"]:
                            result["login"]["otp"] = True
                            result["warnings"].append("หลัง Login พบหน้าขอ OTP — ระบบไม่กรอก OTP ให้ (ต้องทดสอบด้วยมือ)")
            elif pw_f and not (username and password):
                result["login"] = {"attempted": False, "reason": "NO_CREDENTIALS", "message": "พบฟอร์ม Login แต่ไม่ได้ใส่ Username/Password — สำรวจเฉพาะหน้าแรก"}
            if click_explore:
                # explore the page the user ends up on: after login when login worked, otherwise the first page
                on_after = bool(result.get("after"))
                snap = result["after"] if on_after else before
                result["clicks"] = click_explore_page(page, ctx, page.url if on_after else url, snap, max_clicks, shots, PwError)
                result["clicks"]["logged_in"] = on_after
            ctx.close()
            browser.close()
    finally:
        result["duration_sec"] = round(time.monotonic() - t0, 1)
    return result


def _try_login(page, before, user_f, pw_f, submit_b, username, password, PwError) -> dict:
    start_url = page.url
    out: dict = {"attempted": True, "success": False, "user_masked": mask_user(username)}
    try:
        if user_f:
            to_locator(page, user_f["locator"]).fill(username)
        else:
            out["note"] = "ไม่พบช่อง Username ในฟอร์มเดียวกับ Password — กรอกเฉพาะ Password"
        pw = to_locator(page, pw_f["locator"])
        pw.fill(password)
        if submit_b:
            to_locator(page, submit_b["locator"]).click()
        else:
            pw.press("Enter")
        try:
            page.wait_for_load_state("networkidle", timeout=10000)
        except PwError:
            pass
        # Wait until the password field is gone (= logged in). Do NOT stop just because the URL changed:
        # many SPAs (e.g. saucedemo) change the URL first and render the next page a moment later.
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            try:
                loc = to_locator(page, pw_f["locator"])
                if loc.count() == 0 or not loc.first.is_visible():
                    break
                if time.monotonic() > deadline - 12 and page.evaluate(ALERT_JS):
                    break  # an error message appeared (e.g. wrong password) — no need to wait longer
            except PwError:  # page is navigating — try again
                pass
            page.wait_for_timeout(300)
        try:
            page.wait_for_load_state("networkidle", timeout=8000)
        except PwError:
            pass
        snap = None
        for _ in range(3):
            try:
                snap = page.evaluate(SNAPSHOT_JS)
                break
            except PwError:  # "Execution context was destroyed" while a redirect finishes
                page.wait_for_timeout(1000)
        if snap is None:
            snap = page.evaluate(SNAPSHOT_JS)
        pw_visible = snap["has_password"]
        out.update({"url_before": start_url, "url_after": page.url, "url_changed": page.url != start_url,
                    "password_still_visible": pw_visible, "alerts": snap["alerts"]})
        out["success"] = not pw_visible
        if not out["success"]:
            out["message"] = "Login ไม่สำเร็จ" + (f" — ข้อความที่เห็น: {snap['alerts'][0]}" if snap["alerts"] else
                                                   " (รอ 15 วินาทีแล้วยังเห็นช่อง Password อยู่ — ตรวจ Username/Password หรือหน้านี้อาจไม่ใช่หน้า Login)")
    except PwError as e:
        out["message"] = "Login ไม่สำเร็จ: กรอกหรือกดปุ่มไม่ได้"
        out["technical"] = str(e)[:300]
    return out


def observations(r: dict) -> list[str]:
    """Plain-language list of what was seen — the 'observe first' step of the exercise."""
    b = r["before"]
    obs = [f"เปิด {r['url']} ได้ (HTTP {r.get('status') or '-'}) ใช้เวลา {r.get('duration_sec')} วินาที",
           f"ชื่อหน้าเว็บ (title): \"{b['title'] or '(ไม่มี)'}\""]
    if (r.get("status") or 0) >= 400:
        obs.append(f"หน้านี้ตอบ HTTP {r['status']} — ถ้าเป็นหน้าที่ต้อง Login ก่อน (เช่น /inventory.html) ให้ใส่ URL ของหน้า Login แทน")
    if b["headings"]:
        obs.append("หัวข้อบนหน้า: " + " · ".join(h["text"] for h in b["headings"][:5]))
    if b["fields"]:
        obs.append(f"ช่องกรอก {len(b['fields'])} ช่อง: " + ", ".join(
            f"{f['label'] or f['placeholder'] or f['name'] or f['type']} ({f['type']}{', จำเป็น' if f['required'] else ''})" for f in b["fields"][:8]))
    dds = [f for f in b["fields"] if f["tag"] == "select"]
    if dds:
        obs.append("Dropdown: " + ", ".join(f"{f['label'] or f['name'] or f['id'] or 'select'} ({len(f.get('options') or [])} ตัวเลือก)" for f in dds[:5]))
    if b["buttons"]:
        obs.append("ปุ่ม: " + ", ".join(x["text"] or "(ไม่มีข้อความ)" for x in b["buttons"][:8]))
    if b["links"]:
        obs.append(f"ลิงก์ {len(b['links'])} รายการ เช่น " + ", ".join(l["text"] for l in b["links"][:6] if l["text"]))
    if b["has_password"]:
        obs.append("มีฟอร์ม Login (พบช่อง Password)")
    if b["captcha"]:
        obs.append("พบ CAPTCHA — ทดสอบ Login อัตโนมัติไม่ได้ (ต้องใช้ Environment ทดสอบที่ปิด CAPTCHA)")
    if b["imgs_no_alt"]:
        obs.append(f"รูปภาพไม่มีข้อความ alt {b['imgs_no_alt']} รูป (เรื่อง Accessibility)")
    if not b["lang"]:
        obs.append("หน้าเว็บไม่ได้ระบุภาษา (<html lang>)")
    lg = r.get("login") or {}
    if lg.get("attempted"):
        if lg.get("success"):
            obs.append(f"Login สำเร็จ: URL เปลี่ยนจาก {urlparse(lg['url_before']).path or '/'} เป็น {urlparse(lg['url_after']).path or '/'}")
        else:
            obs.append(lg.get("message") or "Login ไม่สำเร็จ")
    elif lg.get("message"):
        obs.append(lg["message"])
    a = r.get("after")
    if a:
        if a["headings"]:
            obs.append("หลัง Login เห็นหัวข้อ: " + " · ".join(h["text"] for h in a["headings"][:5]))
        menu = [l["text"] for l in a["links"] if l["text"] and l.get("nav")][:10]
        if menu:
            obs.append("หลัง Login เห็นเมนู: " + ", ".join(menu))
        if any(LOGOUT_RX.search(x["text"] or "") for x in a["buttons"] + a["links"]):
            obs.append("มีปุ่ม/ลิงก์ ออกจากระบบ")
    c = r.get("clicks")
    if c:
        done = [x for x in c["items"] if x.get("clicked")]
        skipped = [x for x in c["items"] if not x.get("clicked")]
        obs.append(f"กดสำรวจ{' (หลัง Login)' if c.get('logged_in') else ''}: กด {len(done)} รายการ — มีผล {len([x for x in done if x.get('changed')])}, "
                   f"ไม่มีอะไรเปลี่ยน {len([x for x in done if not x.get('changed')])} · ข้าม {len(skipped)} รายการ (ไม่ปลอดภัย/ไม่มีชื่อ/ครบจำนวน)")
        for x in done[:12]:
            obs.append(f"  • กด \"{x['label']}\" → {x['summary']}")
    obs += r.get("warnings", [])
    return obs



# ------------------------------------------------------------------ Click Explore (safe clicks only)
# Never click anything that could pay, buy, delete, send, save or change an account. Matched against the
# visible text, aria-label, id, name and href of the element. Anything without a readable label is skipped too.
UNSAFE_RX = re.compile(
    r"pay|payment|checkout|check[\s_-]*out|purchase|\bbuy\b|\border\b|billing|invoice|subscri|donat|wallet|credit|"
    r"ชำระ|จ่าย|ซื้อ|สั่งซื้อ|โอน|เติมเงิน|บัตร|"
    r"delete|remove|\btrash\b|ลบ|logout|log[\s_-]*out|sign[\s_-]*out|ออกจากระบบ|ลงชื่อออก|"
    r"submit|\bsend\b|ส่ง|confirm|ยืนยัน|\bsave\b|บันทึก|\bapply\b|reset|รีเซ็ต|ล้าง|clear|"
    r"password|รหัสผ่าน|upload|อัปโหลด|download|ดาวน์โหลด|approve|อนุมัติ|reject|ปฏิเสธ|publish|\bpost\b|"
    r"create|สร้าง|invite|เชิญ|register|sign[\s_-]*up|สมัคร|\bbook\b|จอง|accept|ยอมรับ|"
    r"deactivate|close[\s_-]*account|ปิดบัญชี|\brun\b|execute|รัน|import|export|generate|merge|deploy|install",
    re.I)
CLICK_STATE_JS = r"""
() => {
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const lines = Array.from(new Set(((document.body && document.body.innerText) || '').split('\n')
    .map(t => t.replace(/\s+/g, ' ').trim()).filter(t => t && t.length <= 120))).slice(0, 600);
  const modals = Array.from(document.querySelectorAll('[role=dialog],[aria-modal=true],dialog[open],.modal.show,.modal[open]')).filter(vis).length;
  return { url: location.href, title: document.title, lines, modals };
}
"""
MODAL_SEL = "[role=dialog],[aria-modal=true],dialog[open],.modal.show"


def classify(item: dict, kind: str) -> tuple[bool, str]:
    label = (item.get("text") or "").strip()
    probe = " ".join(str(item.get(k) or "") for k in ("text", "id", "name", "href"))
    if not item.get("locator"):
        return False, "หาปุ่มนี้แบบไม่ซ้ำไม่ได้"
    if not label:
        return False, "ไม่มีข้อความบอกว่าปุ่มทำอะไร"
    m = UNSAFE_RX.search(probe)
    if m:
        return False, f"ไม่ปลอดภัย (คำว่า \"{m.group(0)}\")"
    if kind == "button" and item.get("type") == "submit" and item.get("form", -1) >= 0:
        return False, "เป็นปุ่มส่งฟอร์ม"
    if kind == "link":
        href = item.get("href") or ""
        if href.startswith(("mailto:", "tel:", "javascript:")):
            return False, "ลิงก์อีเมล/โทร/สคริปต์"
    return True, ""


def _block_writes(route):
    # Safety net: during Click Explore nothing may be written to the server (POST/PUT/PATCH/DELETE are cancelled)
    if route.request.method in ("GET", "HEAD", "OPTIONS"):
        route.continue_()
    else:
        route.abort()


def click_explore_page(page, ctx, start_url: str, snap: dict, max_clicks: int, shots: dict, PwError) -> dict:
    host = urlparse(start_url).netloc
    cands: list[tuple[str, dict]] = []
    seen_labels = set()
    for kind, items in (("button", snap["buttons"]), ("link", snap["links"])):
        for it in items:
            if kind == "link" and urlparse(it.get("href") or "").netloc not in ("", host):
                continue  # other websites are never followed
            key = (kind, (it.get("text") or "").strip())
            if key in seen_labels:
                continue
            seen_labels.add(key)
            cands.append((kind, it))
    out: dict = {"start_url": start_url, "items": [], "blocked_writes": 0}
    clicked = 0
    t_end = time.monotonic() + 120
    dialogs: list[str] = []
    page.on("dialog", lambda d: (dialogs.append(d.message), d.dismiss()))  # dismiss = Cancel → nothing is confirmed
    blocked = {"n": 0}

    def guard(route):
        if route.request.method not in ("GET", "HEAD", "OPTIONS"):
            blocked["n"] += 1
        _block_writes(route)
    page.route("**/*", guard)
    try:
        for kind, it in cands:
            label = (it.get("text") or "").strip() or "(ไม่มีข้อความ)"
            ok, reason = classify(it, kind)
            rec = {"kind": kind, "label": label, "locator": it.get("locator"), "href": it.get("href")}
            if not ok or clicked >= max_clicks or time.monotonic() > t_end:
                rec.update({"clicked": False, "reason": reason or ("ครบจำนวนที่ตั้งไว้" if clicked >= max_clicks else "หมดเวลา")})
                out["items"].append(rec)
                continue
            try:
                page.goto(start_url, wait_until="domcontentloaded", timeout=20000)
                try:
                    page.wait_for_load_state("networkidle", timeout=4000)
                except PwError:
                    pass
                before = page.evaluate(CLICK_STATE_JS)
                pages_before = len(ctx.pages)
                dialogs.clear()
                b0 = blocked["n"]
                to_locator(page, it["locator"]).click(timeout=5000)
                try:
                    page.wait_for_load_state("networkidle", timeout=4000)
                except PwError:
                    pass
                page.wait_for_timeout(700)
                after = page.evaluate(CLICK_STATE_JS)
                clicked += 1
                new_tabs = [p for p in ctx.pages[pages_before:]]
                for p in new_tabs:
                    p.close()
                added = [x for x in after["lines"] if x not in set(before["lines"])]
                removed = [x for x in before["lines"] if x not in set(after["lines"])]
                eff = {"url_before": before["url"], "url_after": after["url"], "url_changed": after["url"] != before["url"],
                       "title_after": after["title"], "modal_opened": after["modals"] > before["modals"], "js_dialogs": list(dialogs),
                       "new_tab": bool(new_tabs), "added": added[:8], "removed": removed[:8], "blocked_writes": blocked["n"] - b0}
                eff["summary"] = _effect_summary(eff)
                eff["changed"] = bool(eff["url_changed"] or eff["modal_opened"] or eff["js_dialogs"] or eff["new_tab"] or added or removed)
                n = len([x for x in out["items"] if x.get("clicked")]) + 1
                shots[f"click_{n}"] = page.screenshot(full_page=False)
                rec.update({"clicked": True, "n": n, **eff})
            except PwError as e:
                rec.update({"clicked": False, "reason": "กดไม่ได้ (ปุ่มถูกบัง/หายไป)", "technical": str(e)[:200]})
            out["items"].append(rec)
    finally:
        page.unroute("**/*", guard)
        out["blocked_writes"] = blocked["n"]
    return out


def _effect_summary(e: dict) -> str:
    parts = []
    if e["url_changed"]:
        u = urlparse(e["url_after"])
        parts.append(f"ไปหน้า {u.path or '/'}{'?' + u.query if u.query else ''}{'#' + u.fragment if u.fragment else ''}")
    if e["modal_opened"]:
        parts.append("มีหน้าต่าง (dialog/modal) เปิดขึ้นมา")
    if e["js_dialogs"]:
        parts.append(f"มีกล่องข้อความเด้งขึ้น: \"{e['js_dialogs'][0][:80]}\"")
    if e["new_tab"]:
        parts.append("เปิดแท็บใหม่")
    if e["added"] and not e["url_changed"]:
        parts.append("ข้อความใหม่บนหน้า: " + ", ".join(f"\"{x[:40]}\"" for x in e["added"][:3]))
    if e["removed"] and not e["url_changed"]:
        parts.append("ข้อความที่หายไป: " + ", ".join(f"\"{x[:40]}\"" for x in e["removed"][:3]))
    if e["blocked_writes"]:
        parts.append(f"ระบบกันการส่งข้อมูลไป server {e['blocked_writes']} ครั้ง (เพื่อไม่ให้ข้อมูลจริงเปลี่ยน)")
    return " · ".join(parts) or "ไม่มีอะไรเปลี่ยนที่มองเห็นได้"
