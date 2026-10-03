"""Load / Stress / Spike test of the WebQA2026 website API (what the browser calls on every page).

Each virtual user loops through the pages a QA person opens all day:
  Projects → Dashboard → Requirement Explorer → Web History → Test Case Library
One login is shared by all users (login is rate limited to 5/minute on purpose).

  python perf/webqa_perf.py --mode load   --users 50  --duration 30
  python perf/webqa_perf.py --mode stress --levels 10,25,50,100,200 --step 15
  python perf/webqa_perf.py --mode spike  --users 300
  python perf/webqa_perf.py --mode ratelimit           # checks the per-IP limits (needs the normal .env limits)

Report: storage/perf/webqa_<mode>_<time>.html + .json  ·  SLA: p95 < --sla-ms (2000) and errors < --max-error (2 %)
Use test accounts only. Run against your own machine / a test server — never production.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import statistics
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

try:
    import httpx
except ImportError:  # pragma: no cover
    sys.exit("ต้องติดตั้ง httpx ก่อน: pip install httpx  (มีอยู่แล้วใน backend/requirements.txt)")

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "storage" / "perf"

FLOW = [  # (name, path template)
    ("projects", "/api/projects"),
    ("dashboard", "/api/projects/{pid}/dashboard"),
    ("requirements", "/api/projects/{pid}/requirements"),
    ("web-history", "/api/web-history"),
    ("web-library", "/api/web-library"),
]


def pct(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    k = min(len(s) - 1, max(0, int(round(p / 100 * len(s) + 0.5)) - 1))
    return s[k]


class Stats:
    def __init__(self) -> None:
        self.lat: dict[str, list[float]] = defaultdict(list)
        self.codes: Counter = Counter()
        self.errors: Counter = Counter()
        self.n = 0

    def add(self, step: str, ms: float, code: int | str) -> None:
        self.lat[step].append(ms)
        self.codes[code] += 1
        self.n += 1
        if not (isinstance(code, int) and code < 400):
            self.errors[f"{step}:{code}"] += 1

    def summary(self, seconds: float) -> dict:
        allv = [v for vs in self.lat.values() for v in vs]
        bad = sum(self.errors.values())
        return {"requests": self.n, "rps": round(self.n / max(seconds, 0.001), 1), "error_rate": round(100 * bad / max(self.n, 1), 2),
                "p50": round(pct(allv, 50), 1), "p95": round(pct(allv, 95), 1), "p99": round(pct(allv, 99), 1),
                "max": round(max(allv or [0]), 1), "status": dict(self.codes), "errors": dict(self.errors.most_common(8)),
                "steps": {k: {"n": len(v), "p95": round(pct(v, 95), 1), "avg": round(statistics.mean(v), 1)} for k, v in self.lat.items()}}


async def login(base: str, user: str, password: str) -> str:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(f"{base}/api/auth/login", json={"username": user, "password": password})
        if r.status_code != 200:
            sys.exit(f"Login ไม่สำเร็จ ({r.status_code}): {r.text[:200]} — ตรวจ --user/--password (บัญชีที่เปลี่ยนรหัสผ่านแล้ว)")
        return r.json()["access_token"]


async def vu(c: httpx.AsyncClient, base: str, pid: str, stop: float, st: Stats) -> None:
    while time.monotonic() < stop:
        for name, path in FLOW:
            if time.monotonic() >= stop:
                return
            t0 = time.perf_counter()
            try:
                r = await c.get(base + path.format(pid=pid))
                code: int | str = r.status_code
            except httpx.HTTPError as e:
                code = type(e).__name__
            st.add(name, (time.perf_counter() - t0) * 1000, code)


async def run_level(base: str, token: str, pid: str, users: int, seconds: float) -> dict:
    st = Stats()
    limits = httpx.Limits(max_connections=users, max_keepalive_connections=users)
    async with httpx.AsyncClient(timeout=30, limits=limits, headers={"Authorization": f"Bearer {token}"}) as c:
        stop = time.monotonic() + seconds
        t0 = time.monotonic()
        await asyncio.gather(*(vu(c, base, pid, stop, st) for _ in range(users)))
        return {"users": users, "seconds": seconds, **st.summary(time.monotonic() - t0)}


def verdict(r: dict, sla: float, max_err: float) -> bool:
    return r["p95"] < sla and r["error_rate"] < max_err


async def ratelimit_check(base: str, user: str, password: str) -> list[dict]:
    """Expected with the normal .env: login 5/minute/IP → 429 (stops password guessing); API 600 requests/minute/IP → 429.
    Login is checked first because API requests also count towards the per-IP API limit."""
    out = []
    token = await login(base, user, password)                 # 1st login of this minute
    async with httpx.AsyncClient(timeout=20) as c:
        codes: Counter = Counter()
        seq = []
        for _ in range(8):
            r = await c.post(f"{base}/api/auth/login", json={"username": user, "password": "Wrong-Pass-123!"})
            codes[r.status_code] += 1
            seq.append(r.status_code)
        out.append({"check": "Login 5 ครั้ง/นาที/IP (กันเดารหัสผ่าน)", "codes": dict(codes), "sequence": seq,
                    "ok": 401 in seq and seq[-1] == 429 and seq.index(429) <= 5})
    async with httpx.AsyncClient(timeout=20, headers={"Authorization": f"Bearer {token}"}) as c:
        codes = Counter()
        first429 = None
        for i in range(700):
            r = await c.get(f"{base}/api/projects")
            codes[r.status_code] += 1
            if r.status_code == 429 and first429 is None:
                first429 = i + 1
        out.append({"check": "API 600 ครั้ง/นาที/IP", "codes": dict(codes), "first_429_at": first429,
                    "ok": bool(first429) and first429 > 500})
    return out


def html_report(meta: dict, rows: list[dict], sla: float, max_err: float) -> str:
    tr = "".join(
        f"<tr><td>{r['users']}</td><td>{r['requests']}</td><td>{r['rps']}</td><td>{r['p50']}</td><td>{r['p95']}</td><td>{r['p99']}</td>"
        f"<td>{r['error_rate']}%</td><td class='{'ok' if verdict(r, sla, max_err) else 'bad'}'>{'ผ่าน' if verdict(r, sla, max_err) else 'ไม่ผ่าน'}</td>"
        f"<td><small>{json.dumps(r['status'])}</small></td></tr>" for r in rows)
    steps = "".join(f"<tr><td>{k}</td><td>{v['n']}</td><td>{v['avg']}</td><td>{v['p95']}</td></tr>" for k, v in rows[-1]["steps"].items()) if rows else ""
    return f"""<!doctype html><html lang="th"><meta charset="utf-8"><title>WebQA2026 {meta['mode']} test</title>
<style>body{{font-family:system-ui,sans-serif;margin:24px;color:#222}}table{{border-collapse:collapse;margin:12px 0}}td,th{{border:1px solid #ccc;padding:6px 10px;text-align:right}}
th{{background:#f3f3f3}}.ok{{color:#0a7d32;font-weight:600}}.bad{{color:#c62828;font-weight:600}}</style>
<h1>WebQA2026 — {meta['mode'].upper()} test</h1>
<p>{meta['at']} · {meta['base']} · Flow: Projects → Dashboard → Requirements → Web History → Library · SLA p95 &lt; {sla} ms, error &lt; {max_err}%</p>
<table><tr><th>Users</th><th>Requests</th><th>req/s</th><th>p50 ms</th><th>p95 ms</th><th>p99 ms</th><th>Error</th><th>SLA</th><th>HTTP status</th></tr>{tr}</table>
<h2>รายหน้า (ระดับสุดท้าย)</h2><table><tr><th>หน้า</th><th>Requests</th><th>avg ms</th><th>p95 ms</th></tr>{steps}</table>
<p><b>Breaking point:</b> {meta.get('breaking_point') or 'ไม่พบในช่วงที่ทดสอบ'}</p></html>"""


async def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base", default=os.getenv("WEBQA_BASE", "http://127.0.0.1:8000"))
    ap.add_argument("--user", default=os.getenv("WEBQA_USER", "admin"))
    ap.add_argument("--password", default=os.getenv("WEBQA_PASSWORD", ""))
    ap.add_argument("--mode", choices=["load", "stress", "spike", "ratelimit"], default="load")
    ap.add_argument("--users", type=int, default=50)
    ap.add_argument("--duration", type=float, default=30)
    ap.add_argument("--levels", default="10,25,50,100,200,400")
    ap.add_argument("--step", type=float, default=15, help="seconds per stress level")
    ap.add_argument("--sla-ms", type=float, default=2000)
    ap.add_argument("--max-error", type=float, default=2.0)
    a = ap.parse_args()
    if not a.password:
        sys.exit("ใส่รหัสผ่านบัญชีทดสอบด้วย --password หรือ WEBQA_PASSWORD")
    base = a.base.rstrip("/")
    OUT.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    meta = {"mode": a.mode, "base": base, "at": datetime.now().isoformat(timespec="seconds")}

    if a.mode == "ratelimit":
        res = await ratelimit_check(base, a.user, a.password)
        for r in res:
            print(("✓ " if r["ok"] else "✗ ") + r["check"], r["codes"], f"(429 ครั้งแรกที่ request #{r.get('first_429_at')})" if "first_429_at" in r else "")
        (OUT / f"webqa_ratelimit_{stamp}.json").write_text(json.dumps({**meta, "checks": res}, ensure_ascii=False, indent=1), encoding="utf-8")
        return 0 if all(r["ok"] for r in res) else 1

    token = await login(base, a.user, a.password)
    async with httpx.AsyncClient(timeout=20, headers={"Authorization": f"Bearer {token}"}) as c:
        ps = (await c.get(f"{base}/api/projects")).json()
        pid = (next((p for p in ps if p["code"] == "CAM"), None) or ps[0])["id"]

    rows: list[dict] = []
    if a.mode == "load":
        plan = [(a.users, a.duration)]
    elif a.mode == "stress":
        plan = [(int(x), a.step) for x in a.levels.split(",")]
    else:  # spike: quiet → sudden peak → quiet (does it recover?)
        plan = [(5, 10), (a.users, 15), (5, 10)]
    for users, secs in plan:
        r = await run_level(base, token, pid, users, secs)
        rows.append(r)
        ok = verdict(r, a.sla_ms, a.max_error)
        print(f"{users:>5} users · {r['rps']:>7} req/s · p50 {r['p50']:>7} ms · p95 {r['p95']:>7} ms · error {r['error_rate']:>5}% · "
              f"{'ผ่าน' if ok else 'ไม่ผ่าน'}  {r['status']}")
        if a.mode == "stress" and not ok:
            meta["breaking_point"] = f"{users} users (p95 {r['p95']} ms, error {r['error_rate']}%)"
            break
    if a.mode == "spike":
        meta["recovered"] = verdict(rows[-1], a.sla_ms, a.max_error)
        print("ฟื้นตัวหลัง spike:", "ใช่" if meta["recovered"] else "ไม่")
    f = OUT / f"webqa_{a.mode}_{stamp}"
    f.with_suffix(".json").write_text(json.dumps({**meta, "levels": rows}, ensure_ascii=False, indent=1), encoding="utf-8")
    f.with_suffix(".html").write_text(html_report(meta, rows, a.sla_ms, a.max_error), encoding="utf-8")
    print("รายงาน:", f.with_suffix(".html"))
    return 0 if (a.mode != "load" or verdict(rows[0], a.sla_ms, a.max_error)) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
