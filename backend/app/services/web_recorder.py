"""Web Recorder: the user works in a real (visible) browser window, we record what they do and turn it into a
test scenario + pytest-playwright code.

Recorded in the page (init script, top frame only): clicks on buttons/links/checkboxes, the final value typed into each
field, dropdown choices, Enter key, HTML pop-ups (role=dialog / modal) that appear. Recorded by Playwright: JS alert /
confirm / prompt messages and page navigations.

Safety: passwords are never stored (the generated test reads RECORD_PASSWORD or uses a synthetic value); numbers that
look like card / national-ID numbers are masked. JS alerts are accepted (OK), confirm/prompt are dismissed (Cancel).
"""
from __future__ import annotations

import os
import queue
import re
import threading
import time
import uuid
from datetime import datetime, timezone
from urllib.parse import urlparse

from ..core.errors import AppError
from .web_explorer import check_url

RECORDER_JS = r"""
(() => {
  if (window !== window.top || window.__wqaRecorder) return;
  window.__wqaRecorder = true;
  const send = ev => { try { window.__wqaRec(Object.assign({ url: location.href, t: Date.now() }, ev)); } catch (e) {} };
  const clean = t => (t || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const cssq = v => (window.CSS && CSS.escape) ? CSS.escape(v) : v.replace(/["\\]/g, '\\$&');
  const labelOf = el => {
    if (el.id) { const l = document.querySelector('label[for="' + cssq(el.id) + '"]'); if (l) return clean(l.innerText); }
    const p = el.closest('label'); if (p) return clean(p.innerText);
    return clean(el.getAttribute('aria-label') || '');
  };
  // the accessible name Playwright matches (DOM text) — NOT innerText, which follows CSS text-transform
  // (a menu styled "WOMEN" is really "Women" → get_by_role(name="WOMEN", exact=True) would never be found)
  const domText = n => {
    if (n.nodeType === 3) return n.data;
    if (n.nodeType !== 1 || n.hidden || n.getAttribute('aria-hidden') === 'true' || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(n.tagName)) return '';
    if (n.tagName === 'IMG') return ' ' + (n.getAttribute('alt') || '') + ' ';
    const inner = Array.from((n.shadowRoot || n).childNodes).map(domText).join('');
    return /^(DIV|P|LI|BR|H[1-6]|TR|TD|SECTION|ARTICLE)$/.test(n.tagName) ? ' ' + inner + ' ' : inner;
  };
  const labelledBy = el => (el.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => id && document.getElementById(id)).filter(Boolean).map(domText).join(' ');
  // icon fonts (Font Awesome …) put a private-use glyph in ::before → not part of the name a person reads
  const noIcons = t => clean((t || '').replace(/[\uE000-\uF8FF]/g, ' '));
  const nameOf = el => noIcons(el.getAttribute('aria-label') || labelledBy(el) || domText(el) || el.value || el.title || '');
  const isBtn = el => el.matches('button,[role=button],input[type=submit],input[type=button],input[type=reset]');
  // querySelectorAll that also looks inside open Shadow DOM (Playwright locators do the same)
  const deepAll = sel => {
    const out = [];
    const walk = root => { try { root.querySelectorAll(sel).forEach(e => out.push(e)); } catch (e) { return; }
      root.querySelectorAll('*').forEach(e => { if (e.shadowRoot) walk(e.shadowRoot); }); };
    walk(document);
    return out;
  };
  const same = (sel, el) => deepAll(sel).length === 1;
  // the test matches names ignoring upper/lower case and icons → count the same way so the locator stays unique
  const countText = (sel, text) => deepAll(sel).filter(e => nameOf(e).toLowerCase() === text.toLowerCase()).length;
  const locatorOf = el => {
    const tag = el.tagName.toLowerCase();
    if (isBtn(el)) { const n = nameOf(el); if (n && countText('button,[role=button],input[type=submit],input[type=button],input[type=reset]', n) === 1) return { by: 'role', role: 'button', value: n }; }
    if (tag === 'a') { const n = nameOf(el); if (n && countText('a[href]', n) === 1) return { by: 'role', role: 'link', value: n }; }
    if (['input', 'select', 'textarea'].includes(tag)) {
      const lb = labelOf(el);
      if (lb && deepAll('input,select,textarea').filter(e => labelOf(e) === lb).length === 1) return { by: 'label', value: lb };
      const ph = el.getAttribute('placeholder');
      if (ph && deepAll('[placeholder]').filter(e => e.getAttribute('placeholder') === ph).length === 1) return { by: 'placeholder', value: ph };
    }
    if (el.id && same('#' + cssq(el.id), el)) return { by: 'css', value: '[id="' + el.id + '"]' };
    const nm = el.getAttribute('name'); if (nm && same(tag + '[name="' + cssq(nm) + '"]', el)) return { by: 'css', value: tag + '[name="' + nm + '"]' };
    for (const a of ['data-testid', 'data-test', 'data-qa']) { const v = el.getAttribute(a); if (v && same('[' + a + '="' + cssq(v) + '"]', el)) return { by: 'css', value: '[' + a + '="' + v + '"]' }; }
    // last resort: CSS path
    const parts = []; let e = el;
    while (e && e.nodeType === 1 && parts.length < 6) {
      let s = e.tagName.toLowerCase(); const p = e.parentElement;
      if (p) { const sib = Array.from(p.children).filter(c => c.tagName === e.tagName); if (sib.length > 1) s += ':nth-of-type(' + (sib.indexOf(e) + 1) + ')'; }
      parts.unshift(s); if (e.id) { parts[0] = '#' + cssq(e.id); break; } e = p;
    }
    return { by: 'css', value: parts.join(' > ') };
  };
  // never read .value of a field here (it may be a password) — only buttons/links have a visible 'name'
  const textOf = el => (isBtn(el) || el.tagName === 'A' || !['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) ? nameOf(el) : clean(el.getAttribute('aria-label') || '');
  // where is it? → position on screen (thirds of the viewport) + the part of the page it belongs to
  const where = el => {
    const r = el.getBoundingClientRect(), W = window.innerWidth || 1, H = window.innerHeight || 1;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const v = cy < H / 3 ? 'ด้านบน' : (cy < 2 * H / 3 ? 'กลาง' : 'ด้านล่าง'), h = cx < W / 3 ? 'ซ้าย' : (cx < 2 * W / 3 ? 'กลาง' : 'ขวา');
    const box = el.closest('[role=dialog],[aria-modal=true],dialog,form,nav,header,footer,aside,[role=navigation],table,main,section');
    let ctx = '';
    if (box) {
      const tg = box.tagName.toLowerCase(), role = box.getAttribute('role') || '';
      ctx = role === 'dialog' || box.getAttribute('aria-modal') === 'true' || tg === 'dialog' ? 'ในหน้าต่าง popup'
        : tg === 'form' ? 'ในฟอร์ม' : (tg === 'nav' || role === 'navigation') ? 'ในแถบเมนู' : tg === 'header' ? 'ในส่วนหัวของหน้า'
        : tg === 'footer' ? 'ในส่วนท้ายของหน้า' : tg === 'aside' ? 'ในแถบด้านข้าง' : tg === 'table' ? 'ในตาราง' : '';
      const hd = box.querySelector('h1,h2,h3,legend,[role=heading]');
      if (hd && clean(hd.innerText)) ctx += (ctx ? ' ' : '') + 'หัวข้อ "' + clean(hd.innerText).slice(0, 40) + '"';
    }
    return { x: Math.round(r.left + window.scrollX), y: Math.round(r.top + window.scrollY), w: Math.round(r.width), h: Math.round(r.height),
      area: v + (h === 'กลาง' && v === 'กลาง' ? '' : (v === 'กลาง' ? '' : '-') + h) + 'ของหน้าจอ', context: ctx };
  };
  const describe = el => ({ tag: el.tagName.toLowerCase(), type: (el.getAttribute('type') || '').toLowerCase(), text: textOf(el),
    label: labelOf(el), placeholder: el.getAttribute('placeholder') || '', name: el.getAttribute('name') || '', id: el.id || '',
    required: !!el.required, locator: locatorOf(el), pos: where(el) });
  const CLICKABLE = 'button,a[href],[role=button],[role=link],[role=tab],[role=menuitem],input[type=submit],input[type=button],input[type=reset],input[type=checkbox],input[type=radio],summary,[onclick]';
  // the real element under the mouse, also inside Shadow DOM (web components) — walk the composed path
  const clickTarget = e => {
    const path = (e.composedPath && e.composedPath()) || [e.target];
    for (const n of path) { if (n && n.nodeType === 1 && n.matches && n.matches(CLICKABLE)) return n; }
    const t = path[0];
    return t && t.closest ? t.closest(CLICKABLE) : null;
  };
  const sendClick = el => {
    const tag = el.tagName.toLowerCase(), type = (el.getAttribute('type') || '').toLowerCase();
    if (tag === 'input' && (type === 'checkbox' || type === 'radio')) return; // recorded by 'change'
    send({ type: 'click', el: describe(el) });
  };
  // Listen on `window` in the capture phase = before any handler of the page can stop the event.
  // Some sites act on pointerdown and leave the page before 'click' fires → keep it and send it when the page unloads.
  let pending = null;
  window.addEventListener('pointerdown', e => { const el = clickTarget(e); pending = el ? { el, d: describe(el) } : null; }, true);
  window.addEventListener('click', e => { const el = clickTarget(e); pending = null; if (el) sendClick(el); }, true);
  window.addEventListener('pagehide', () => { if (pending) { send({ type: 'click', el: pending.d, early: true }); pending = null; } }, true);
  const valueEvent = el => {
    if (!el || !el.tagName) return null;
    const tag = el.tagName.toLowerCase(), type = (el.getAttribute('type') || '').toLowerCase();
    if (tag === 'select') return { type: 'select', el: describe(el), value: el.value, option: clean(el.options[el.selectedIndex] ? el.options[el.selectedIndex].text : '') };
    if (type === 'checkbox' || type === 'radio') return { type: 'check', el: describe(el), checked: el.checked };
    if (['input', 'textarea'].includes(tag) && !['submit', 'button', 'reset', 'file', 'hidden'].includes(type))
      return { type: 'fill', el: describe(el), value: el.value, secret: type === 'password' };
    return null;
  };
  const realTarget = e => ((e.composedPath && e.composedPath()[0]) || e.target);
  window.addEventListener('input', e => { const v = valueEvent(realTarget(e)); if (v && v.type === 'fill') send(v); }, true);
  window.addEventListener('change', e => { const v = valueEvent(realTarget(e)); if (v) send(v); }, true);
  window.addEventListener('keydown', e => {
    const t = realTarget(e);
    if (e.key === 'Enter' && t && t.tagName && t.tagName.toLowerCase() === 'input') send({ type: 'press', key: 'Enter', el: describe(t) });
  }, true);
  let acted = false;
  ['pointerdown', 'click', 'input', 'keydown', 'change'].forEach(n => window.addEventListener(n, () => { acted = true; }, true));
  const seen = new WeakSet();
  const scan = () => document.querySelectorAll('[role=dialog],[role=alertdialog],[aria-modal=true],dialog[open],.modal.show,.swal2-popup,.toast,[role=alert]').forEach(d => {
    const r = d.getBoundingClientRect(); const txt = clean(d.innerText);
    if (r.width > 0 && r.height > 0 && txt && !seen.has(d)) { seen.add(d); if (acted) send({ type: 'popup', text: txt.slice(0, 160) }); }
  });
  // observe `document` (documentElement may not exist yet when this init script runs)
  new MutationObserver(() => scan()).observe(document, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'open', 'style', 'hidden'] });
})();
"""

SENSITIVE_RX = re.compile(r"\b(?:\d[ -]?){13,19}\b")
# ad / tracking hosts: their full-screen overlays (e.g. Google "vignette") cover the page and break recording & replay
AD_HOSTS_RX = re.compile(r"^https?://([^/]*\.)?(googlesyndication\.com|doubleclick\.net|googleadservices\.com|adservice\.google\.[a-z.]+|"
                         r"fundingchoicesmessages\.google\.com|google-analytics\.com|googletagmanager\.com|amazon-adsystem\.com|adnxs\.com)/")
def no_os_login_prompts(ctx, pg) -> None:
    """Sites that ask for a passkey / security key (WebAuthn) make Windows pop up "Windows Security — sign in with your
    Microsoft account / passkey" over the browser. Give the page a virtual (fake) authenticator instead, so no system
    dialog appears and the user just types the username/password as usual."""
    try:
        cdp = ctx.new_cdp_session(pg)
        cdp.send("WebAuthn.enable", {"enableUI": False})
        cdp.send("WebAuthn.addVirtualAuthenticator", {"options": {"protocol": "ctap2", "transport": "internal",
                 "hasResidentKey": True, "hasUserVerification": True, "isUserVerified": True}})
    except Exception:  # noqa: BLE001  (not Chromium / page already closed)
        pass


MAX_MINUTES = int(os.getenv("WEB_RECORDER_MAX_MINUTES", "60"))
NAV_AFTER_ACTION_MS = 10000   # a page change this soon after a click/Enter belongs to that click
REDIRECT_MS = 2500            # a page change this soon after another one (or a typed value) is a redirect, not a user step
_lock = threading.Lock()
_active: dict[str, "Recording"] = {}


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Recording:
    def __init__(self, url: str, username: str, *, headless: bool | None = None, actions=None, cdp_port: int | None = None,
                 save_password: bool = True, first_name: str = ""):
        self.id = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S") + "-" + uuid.uuid4().hex[:6]
        self.url = check_url(url)
        self.username = username
        self.headless = (os.getenv("WEB_RECORDER_HEADLESS", "") == "1") if headless is None else headless
        self.cdp_port = cdp_port or (int(os.environ["WEB_RECORDER_CDP_PORT"]) if os.getenv("WEB_RECORDER_CDP_PORT") else None)
        self.actions = actions  # tests only: callable(page) run inside the browser thread as if a user did it
        self.status = "starting"
        self.error: str | None = None
        self.raw: list[dict] = []
        self.shots: dict[str, bytes] = {}
        self.title = ""
        self.started_at = now()
        self.save_password = save_password   # user's choice: keep the real password in the log/code (test accounts only)
        self.paused = False
        self.current_url = self.url
        self.cycle = 1                      # how many test-case cycles were started (resume = new cycle)
        self.raw.append({"type": "segment", "name": first_name or "", "t": int(time.time() * 1000)})
        self._cmds: queue.Queue = queue.Queue()   # browser commands from the API thread (Playwright is single-threaded)
        self._stop = threading.Event()
        self._done = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)

    # -------------------------------------------------------------- browser thread
    def _run(self) -> None:
        try:
            from playwright.sync_api import Error as PwError
            from playwright.sync_api import sync_playwright
        except ImportError:
            self.status, self.error = "error", "ยังไม่ได้ติดตั้ง Playwright — เปิด RUN-DEV.bat ใหม่"
            self._done.set()
            return
        try:
            with sync_playwright() as p:
                args = [f"--remote-debugging-port={self.cdp_port}"] if self.cdp_port else []
                try:
                    browser = p.chromium.launch(headless=self.headless, args=args)
                except PwError as e:
                    raise RuntimeError("เปิด browser ไม่ได้ — ต้องรันบนเครื่องที่มีหน้าจอ (RUN-DEV.bat) และติดตั้ง Chromium แล้ว: " + str(e)[:200])
                ctx = browser.new_context(viewport={"width": 1280, "height": 800}, locale="th-TH")
                ctx.expose_binding("__wqaRec", lambda source, ev: self._on_event(ev))
                ctx.add_init_script(RECORDER_JS)
                ctx.route(AD_HOSTS_RX, lambda route: route.abort())
                page = ctx.new_page()
                no_os_login_prompts(ctx, page)
                page.on("dialog", self._on_dialog)
                page.goto(self.url, wait_until="domcontentloaded", timeout=30000)
                self.current_url = page.url
                self._add({"type": "nav", "url": page.url, "initial": True})
                self._watch(page)
                ctx.on("page", lambda pg: (no_os_login_prompts(ctx, pg), pg.on("dialog", self._on_dialog), self._watch(pg)))  # new tabs
                self.title = page.title()
                self.shots["before"] = page.screenshot()
                self.status = "recording"
                if self.actions:
                    self.actions(page)
                deadline = time.monotonic() + MAX_MINUTES * 60
                while not self._stop.is_set() and time.monotonic() < deadline:
                    open_pages = [pg for pg in ctx.pages if not pg.is_closed()]
                    if not open_pages or not browser.is_connected():
                        break
                    page = open_pages[-1]
                    try:
                        self._run_commands(page)
                        page.wait_for_timeout(250)  # lets Playwright deliver events while we wait
                    except PwError:
                        # the person closed this window/tab while we waited → keep what was recorded; stop only if
                        # no window is left (checked at the top of the loop)
                        continue
                self._fail_commands("หน้าต่าง browser ถูกปิดแล้ว")
                if not page.is_closed():
                    try:
                        page.wait_for_timeout(500)
                        self.shots["after"] = page.screenshot()
                    except PwError:
                        pass
                try:
                    browser.close()
                except PwError:
                    pass
            self.status = "stopped"
        except Exception as e:  # noqa: BLE001
            self.status, self.error = "error", str(e)[:500]
        finally:
            self._done.set()

    def _watch(self, pg) -> None:
        def on_nav(fr):
            if fr == pg.main_frame:
                self.current_url = fr.url
                self._add({"type": "nav", "url": fr.url})
        pg.on("framenavigated", on_nav)

    def _run_commands(self, page) -> None:
        """Run commands queued by the API thread (e.g. open the start URL of a new test case) in the browser thread."""
        while True:
            try:
                cmd = self._cmds.get_nowait()
            except queue.Empty:
                return
            try:
                if cmd["op"] == "goto":
                    page.bring_to_front()
                    page.goto(cmd["url"], wait_until="domcontentloaded", timeout=30000)
                    self.current_url = page.url
            except Exception as e:  # noqa: BLE001
                cmd["error"] = str(e)[:300]
            finally:
                cmd["done"].set()

    def _fail_commands(self, why: str) -> None:
        while True:
            try:
                cmd = self._cmds.get_nowait()
            except queue.Empty:
                return
            cmd["error"] = why
            cmd["done"].set()

    def _browser_goto(self, url: str, timeout: float = 40) -> None:
        cmd = {"op": "goto", "url": url, "done": threading.Event(), "error": None}
        self._cmds.put(cmd)
        if not cmd["done"].wait(timeout):
            raise AppError("RECORDER_NAV_TIMEOUT", "เปิดหน้าเว็บไม่ทันเวลา — ลองใหม่อีกครั้ง", status=504)
        if cmd["error"]:
            raise AppError("RECORDER_NAV_FAILED", "เปิดหน้า URL นี้ไม่ได้: " + cmd["error"], status=400)

    def _add(self, ev: dict) -> None:
        ev["t"] = ev.get("t") or int(time.time() * 1000)
        with _lock:
            self.raw.append(ev)

    def _on_event(self, ev: dict) -> None:
        if not isinstance(ev, dict) or ev.get("type") not in ("click", "fill", "select", "check", "press", "popup"):
            return
        if self.paused:
            return
        if ev.get("type") == "fill" and ev.get("secret") and not self.save_password:
            ev["value"] = None
        if ev.get("type") == "fill" and ev.get("value") and not ev.get("secret"):
            ev["masked"] = bool(SENSITIVE_RX.search(ev["value"]))
            if ev["masked"]:
                ev["value"] = SENSITIVE_RX.sub(lambda m: "*" * len(m.group(0)), ev["value"])
        self._add(ev)

    def _on_dialog(self, d) -> None:
        if not self.paused:
            self._add({"type": "dialog", "kind": d.type, "message": d.message[:300]})
        try:
            d.accept() if d.type == "alert" else d.dismiss()
        except Exception:  # noqa: BLE001
            pass

    # -------------------------------------------------------------- control
    def start(self) -> "Recording":
        self._thread.start()
        for _ in range(200):  # wait until the page is open (max ~40 s)
            if self.status != "starting":
                break
            time.sleep(0.2)
        return self

    def stop(self, timeout: float = 30) -> None:
        self._stop.set()
        self._done.wait(timeout)

    # user controls while recording
    def pause(self) -> None:
        """'หยุด' = end the current cycle. Nothing is recorded until the user starts the next cycle (or continues)."""
        self.paused = True

    def resume(self, *, new_case: bool = False, name: str = "", url: str | None = None) -> None:
        """Continue recording. new_case=True starts a NEW cycle: a new test case that opens its own start URL
        (default: the page the browser is on now) — it does not depend on the steps recorded before."""
        if new_case:
            self.new_cycle(name, url)
        self.paused = False

    def new_cycle(self, name: str = "", url: str | None = None) -> None:
        if self.status not in ("starting", "recording"):
            raise AppError("RECORDER_CLOSED", "หน้าต่าง browser ถูกปิดแล้ว — กดบันทึก แล้วเริ่มบันทึกรอบใหม่", status=409)
        target = check_url(url.strip()) if url and url.strip() else self.current_url
        seg = {"type": "segment", "name": name.strip()[:120], "url": target}
        was_paused, self.paused = self.paused, True        # nothing is recorded while the page is (re)loading
        self._add(seg)
        try:
            if url and url.strip() and target != self.current_url:
                self._browser_goto(target)
        except Exception:
            with _lock:
                if seg in self.raw:
                    self.raw.remove(seg)
            self.paused = was_paused
            raise
        self.cycle += 1
        self.paused = False

    def add_testcase(self, name: str = "", url: str | None = None) -> None:
        """Steps after this point become the next test case. Without a URL it continues from where the previous one
        ended (the test replays the earlier steps first); with a URL it is a new, independent cycle."""
        if url and url.strip():
            self.new_cycle(name, url)
            return
        self._add({"type": "segment", "name": name.strip()[:120]})

    def add_check(self, text: str, mode: str = "visible") -> None:
        self._add({"type": "assert_text", "text": text.strip()[:200], "mode": "hidden" if mode == "hidden" else "visible"})

    def steps(self) -> list[dict]:
        with _lock:
            raw = list(self.raw)
        return to_steps(self.url, raw)


ACTION_EVENTS = ("click", "fill", "select", "check", "press", "assert_text", "dialog", "popup")
USER_ACTIONS = ("click", "fill", "select", "check", "press")


def _parse(start_url: str, raw: list[dict]) -> list[dict]:
    """Raw events → flat list of steps with 'segment' markers (nothing dropped yet).

    Page changes: one that follows a click/Enter is attached to it (url_after); one right after another page change
    or a typed value is a redirect; any other one is the user typing a URL / going back → a 'goto' step."""
    steps: list[dict] = []
    last_url = start_url
    last_nav_t = 0
    last_act_t = 0
    for ev in raw:
        kind = ev["type"]
        t = ev.get("t") or 0
        if kind == "segment":
            steps.append({"action": "segment", "name": ev.get("name", ""), "start_url": ev.get("url") or None})
            if ev.get("url"):   # a new cycle: the test case opens its own start page
                steps.append({"action": "goto", "url": ev["url"], "fresh": True, "t": t})
                last_url, last_nav_t = ev["url"], t
            continue
        if kind == "assert_text":
            steps.append({"action": "assert_text", "check": ev["text"], "mode": ev.get("mode", "visible")})
            continue
        if kind == "nav":
            url = ev["url"]
            if ev.get("initial"):
                last_url, last_nav_t = url, t
                continue
            if url == last_url or "#google_vignette" in url:   # same page / full-screen ad overlay → not a user step
                continue
            prev = steps[-1] if steps else None
            if (prev and prev["action"] in ("click", "press") and t - prev.get("t", 0) < NAV_AFTER_ACTION_MS
                    and (not prev.get("url_after") or t - last_nav_t < REDIRECT_MS)):   # its redirect, not a new page
                prev["url_after"] = url
            elif t - max(last_nav_t, last_act_t) < REDIRECT_MS:
                if prev and prev["action"] == "goto" and not prev.get("fresh"):
                    prev["url"] = url          # typed URL that redirected → keep where it ended up
            else:
                steps.append({"action": "goto", "url": url, "manual": True, "t": t})
            last_url, last_nav_t = url, t
            continue
        if kind in USER_ACTIONS:
            last_act_t = max(last_act_t, t)
        if kind in ("click", "press"):
            # a link that navigates on pointerdown reports its click when the page unloads — sometimes after the
            # page change was seen → that 'goto' was really this click
            prev = steps[-1] if steps else None
            if prev and prev.get("manual") and (ev.get("early") or t <= prev["t"]) and abs(t - prev["t"]) < REDIRECT_MS:
                steps.pop()
                ev = {**ev, "_url_after": prev["url"]}
        if kind == "fill":
            key = repr(ev["el"]["locator"])
            prev = next((s for s in reversed(steps) if s["action"] == "fill" and s["key"] == key), None)
            idx = steps.index(prev) if prev else -1
            if prev and all(s["action"] in ("fill", "select", "check") for s in steps[idx + 1:]):
                prev.update({"value": ev.get("value"), "secret": ev.get("secret", False), "masked": ev.get("masked", False)})
                continue
            steps.append({"action": "fill", "key": key, "el": ev["el"], "value": ev.get("value"), "secret": ev.get("secret", False),
                          "masked": ev.get("masked", False)})
        elif kind == "select":
            steps.append({"action": "select", "key": repr(ev["el"]["locator"]), "el": ev["el"], "value": ev.get("value"), "option": ev.get("option")})
        elif kind == "check":
            steps.append({"action": "check", "key": repr(ev["el"]["locator"]), "el": ev["el"], "checked": ev.get("checked")})
        elif kind == "click":
            # a click on a field that was just typed into is noise; double clicks on the same element are recorded once
            if steps and steps[-1]["action"] == "click" and steps[-1]["key"] == repr(ev["el"]["locator"]) and t - steps[-1]["t"] < 400:
                continue
            steps.append({"action": "click", "key": repr(ev["el"]["locator"]), "el": ev["el"], "t": t})
        elif kind == "press":
            steps.append({"action": "press", "key": repr(ev["el"]["locator"]), "el": ev["el"], "t": t})
        elif kind == "dialog":
            steps.append({"action": "dialog", "kind": ev["kind"], "message": ev["message"]})
        elif kind == "popup":
            if not any(s["action"] == "popup" and s["text"] == ev["text"] for s in steps[-3:]):
                steps.append({"action": "popup", "text": ev["text"]})
        if kind in ("click", "press") and ev.get("_url_after") and steps and steps[-1]["action"] == kind:
            steps[-1]["url_after"] = ev["_url_after"]
    return steps


def _groups(steps: list[dict]) -> list[dict]:
    """Flat steps with markers → one group per 'Add Test Case' / new cycle."""
    groups: list[dict] = []
    for s in steps:
        if s["action"] == "segment":
            groups.append({"name": s["name"], "start_url": s["start_url"], "items": []})
        else:
            if not groups:
                groups.append({"name": "", "start_url": None, "items": []})
            groups[-1]["items"].append(s)
    return groups


def _content(g: dict) -> list[dict]:
    return [s for s in g["items"] if not s.get("fresh")]


def segments_overview(raw: list[dict], start_url: str = "") -> list[dict]:
    """Every test case the user started, with how many steps it has (0 = empty → would be dropped / replaced)."""
    groups = _groups(_parse(start_url, raw))
    return [{"name": g["name"], "events": len(_content(g)), "start_url": g["start_url"]} for g in groups]


def to_steps(start_url: str, raw: list[dict]) -> list[dict]:
    """Raw events → clean ordered steps, each tagged with its test case (seg / seg_name / seg_start).
    An empty test case is replaced by the next one (it keeps the start page of a new cycle)."""
    merged: list[dict] = []
    for g in _groups(_parse(start_url, raw)):
        if merged and not _content(merged[-1]):
            prev = merged.pop()
            if prev["start_url"] and not g["start_url"]:
                g = {**g, "start_url": prev["start_url"], "items": [s for s in prev["items"] if s.get("fresh")] + g["items"]}
        merged.append(g)
    if merged and not _content(merged[-1]):
        merged.pop()
    out = []
    for seg, g in enumerate(merged):
        for s in g["items"]:
            s["seg"] = seg
            s["seg_name"] = g["name"]
            if g["start_url"]:
                s["seg_start"] = g["start_url"]
            out.append(s)
    for i, s in enumerate(out, 1):
        s["no"] = i
        s["text"] = s.get("text") or describe_step(s)
    return out


def el_name(el: dict) -> str:
    return el.get("label") or el.get("text") or el.get("placeholder") or el.get("name") or el.get("id") or el.get("tag", "element")


def describe_step(s: dict) -> str:
    a = s["action"]
    if a == "click":
        kind = "ลิงก์" if s["el"]["tag"] == "a" else "ปุ่ม"
        out = f"กด{kind} \"{el_name(s['el'])}\""
        if s.get("url_after"):
            u = urlparse(s["url_after"])
            out += f" → ไปหน้า {u.path or '/'}"
        return out
    if a == "fill":
        if s.get("secret"):
            if s.get("value"):
                return f"กรอก \"{el_name(s['el'])}\" = \"{s['value']}\" (รหัสผ่าน)"
            return f"กรอก \"{el_name(s['el'])}\" = ******** (รหัสผ่าน ไม่บันทึกค่าจริง)"
        return f"กรอก \"{el_name(s['el'])}\" = \"{s.get('value') or ''}\"" + (" (ปิดบังตัวเลขที่อาจเป็นข้อมูลส่วนตัว)" if s.get("masked") else "")
    if a == "select":
        return f"เลือก \"{s.get('option') or s.get('value')}\" ใน \"{el_name(s['el'])}\""
    if a == "check":
        return f"{'ติ๊ก' if s.get('checked') else 'เอาติ๊กออก'} \"{el_name(s['el'])}\""
    if a == "press":
        return f"กด Enter ที่ \"{el_name(s['el'])}\""
    if a == "dialog":
        return f"พบกล่องข้อความ ({s['kind']}): \"{s['message']}\""
    if a == "assert_text":
        return f"ตรวจว่า{'เห็น' if s.get('mode') != 'hidden' else 'ไม่เห็น'}ข้อความ \"{s['check']}\""
    if a == "goto":
        if s.get("fresh"):
            return f"เปิดหน้า {s['url']} (เริ่ม Test Case ใหม่)"
        return f"ไปที่หน้า {s['url']} (พิมพ์ URL / ย้อนกลับ)"
    return s.get("text", "")


# ------------------------------------------------------------------ registry used by the API
def start(url: str, username: str, *, save_password: bool = True, name: str = "") -> Recording:
    with _lock:
        busy = [r for r in _active.values() if r.status in ("starting", "recording")]
    if busy:
        raise AppError("RECORDER_BUSY", "มีการบันทึกที่ยังไม่หยุดอยู่ — กด 'หยุดบันทึก' ก่อน", status=409)
    rec = Recording(url, username, save_password=save_password, first_name=name).start()
    with _lock:
        _active[rec.id] = rec
    if rec.status == "error":
        raise AppError("RECORDER_FAILED", rec.error or "เริ่มบันทึกไม่ได้", status=503)
    return rec


def active() -> Recording | None:
    with _lock:
        return next((r for r in _active.values() if r.status in ("starting", "recording") and not getattr(r, "exploration_id", None)), None)


def get(rid: str) -> Recording:
    rec = _active.get(rid)
    if rec is None:
        raise AppError("NOT_FOUND", "ไม่พบการบันทึกนี้ (อาจปิดระบบไปแล้ว)", status=404)
    return rec
