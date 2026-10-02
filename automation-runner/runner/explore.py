"""User-controlled website exploration (หัวข้อ 23 AI Website Exploration) — run on the user's own PC.

    python -m runner.explore --url https://sit.example.test --out ..\\storage\\runs\\explore

1. Opens a *headed* browser at the Base URL (Chromium / Edge / Firefox).
2. The user logs in by hand (Username/Password/OTP/CAPTCHA) — nothing here reads or solves CAPTCHA/OTP.
3. The user navigates to the page to analyse and presses Enter in the terminal.
4. Only that page's DOM + accessibility tree are saved (masked), for the Locator Advisor in the web UI.
   Session storage is NOT saved unless --save-session is given, and then only into a git-ignored folder.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

MASK = [(re.compile(r'(value=")[^"]*(")', re.I), r"\1***\2"), (re.compile(r"\b\d{13}\b"), "*************")]


def masked(html: str) -> str:
    for rx, rep in MASK:
        html = rx.sub(rep, html)
    return html


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--url", required=True)
    ap.add_argument("--browser", default="chromium", choices=["chromium", "msedge", "firefox"])
    ap.add_argument("--out", default=str(Path(__file__).resolve().parents[2] / "storage" / "runs" / "explore"))
    ap.add_argument("--allow", action="append", default=[], help="allowed host (repeatable); default = host of --url")
    ap.add_argument("--save-session", action="store_true", help="save storage_state to .auth/ (git-ignored)")
    a = ap.parse_args(argv)
    host = urlparse(a.url).netloc
    if not host:
        print("URL ไม่ถูกต้อง", file=sys.stderr)
        return 2
    allowed = set(a.allow) | {host}
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("ติดตั้งก่อน: pip install playwright && python -m playwright install chromium", file=sys.stderr)
        return 2
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        bt = pw.firefox if a.browser == "firefox" else pw.chromium
        browser = bt.launch(headless=False, channel="msedge" if a.browser == "msedge" else None)
        ctx = browser.new_context()
        page = ctx.new_page()
        page.goto(a.url)
        input("\n[MANUAL CHECKPOINT] Login เอง (รวม OTP/CAPTCHA) แล้วไปที่หน้าที่ต้องการวิเคราะห์ จากนั้นกด Enter ที่นี่… ")
        cur = urlparse(page.url).netloc
        if cur not in allowed:
            print(f"หน้าปัจจุบัน ({cur}) ไม่อยู่ใน host ที่อนุญาต {sorted(allowed)} — ไม่บันทึก DOM", file=sys.stderr)
            browser.close()
            return 3
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        html_path = out / f"dom_{stamp}.html"
        html_path.write_text(masked(page.content()), encoding="utf-8")
        snap = page.accessibility.snapshot() if hasattr(page, "accessibility") else None
        (out / f"a11y_{stamp}.json").write_text(json.dumps(snap, ensure_ascii=False, indent=2), encoding="utf-8")
        if a.save_session:
            auth = Path(".auth")
            auth.mkdir(exist_ok=True)
            ctx.storage_state(path=str(auth / "storage_state.json"))
            print("Session saved to .auth/storage_state.json (ห้าม Commit)")
        browser.close()
    print(f"\nบันทึกแล้ว: {html_path}\nเปิดหน้า Playwright Generator → Locator Advisor แล้ววางเนื้อหาไฟล์นี้ เพื่อให้ระบบเสนอ Locator และอนุมัติก่อนสร้าง Script")
    return 0


if __name__ == "__main__":
    sys.exit(main())
