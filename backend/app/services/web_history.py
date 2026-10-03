"""Per-page test-case history for Web Explorer.

Every exploration of a page (host + path, query ignored) is added to that page's history:
- each test-case design is identified by a stable signature (`sig`) → stored once, with a page-scoped ID (WP-001 …),
  first/last seen, how many explorations designed it and the latest run result;
- the next exploration of the same page asks the generator for *new* designs only (no duplicates).
Stored as JSON in storage/explore/history/<key>.json — no database migration needed.
"""
from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from urllib.parse import urlparse

from ..core.errors import AppError
from .storage import get_storage

HBASE = "explore/history"
EBASE = "explore/web"


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def page_id(url: str) -> tuple[str, str]:
    """(key, label) — the same page with different query strings / fragments shares one history."""
    u = urlparse(url)
    label = f"{(u.hostname or '').lower()}{':' + str(u.port) if u.port else ''}{u.path or '/'}"
    slug = re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")[:40] or "page"
    return f"{slug}-{hashlib.sha1(label.encode()).hexdigest()[:8]}", label


def _key(key: str) -> str:
    if not re.fullmatch(r"[a-z0-9\-]{3,60}", key or ""):
        raise AppError("NOT_FOUND", "ไม่พบประวัติของหน้านี้", status=404)
    return f"{HBASE}/{key}.json"


def load(key: str, *, missing_ok: bool = False) -> dict | None:
    st = get_storage()
    k = _key(key)
    if not st.exists(k):
        if missing_ok:
            return None
        raise AppError("NOT_FOUND", "ไม่พบประวัติของหน้านี้", status=404)
    return json.loads(st.read_text(k))


def save(h: dict) -> None:
    get_storage().write_text(_key(h["key"]), json.dumps(h, ensure_ascii=False, indent=1))


def for_url(url: str) -> dict:
    key, label = page_id(url)
    return load(key, missing_ok=True) or {"key": key, "page": label, "url": url, "title": "", "created_at": now(),
                                         "updated_at": now(), "explorations": [], "test_cases": {}, "next_no": 1}


def known_sigs(h: dict) -> set[str]:
    return set(h["test_cases"])


def assign_ids(h: dict, sigs: list[str]) -> dict[str, str]:
    """Give every new signature the next page-scoped ID; returns sig → WP-xxx for all given sigs."""
    for s in sigs:
        if s not in h["test_cases"]:
            h["test_cases"][s] = {"hid": f"WP-{h['next_no']:03d}"}
            h["next_no"] += 1
    return {s: h["test_cases"][s]["hid"] for s in sigs}


def record_exploration(h: dict, data: dict) -> dict:
    """Add one exploration (already built with hid_map) to the page history."""
    at = data["created_at"]
    h.update({"url": data["url"], "title": data["before"]["title"] or h.get("title", ""), "updated_at": at})
    new = 0
    for t in data["test_cases"]:
        e = h["test_cases"].setdefault(t["sig"], {"hid": t.get("hid")})
        if "first_seen" not in e:
            e.update({"first_seen": at, "first_exploration": data["id"], "designed": 0, "runs": 0, "passed": 0})
            new += 1
        e.update({k: t[k] for k in ("title", "type", "priority", "steps", "expected", "observed", "needs_login")})
        e.update({k: t[k] for k in ("start_url", "independent", "func", "file") if k in t})
        e.update({"last_seen": at, "last_exploration": data["id"]})
        e["designed"] = e.get("designed", 0) + 1
    lg = data.get("login") or {}
    if not any(x["id"] == data["id"] for x in h["explorations"]):
        h["explorations"].append({"id": data["id"], "at": at, "by": data.get("created_by"), "status": data.get("status"),
                                  "tc": len(data["test_cases"]), "new_tc": new,
                                  "login": "ok" if lg.get("success") else ("fail" if lg.get("attempted") else "-")})
    return h


def record_run(h: dict, data: dict, run: dict) -> dict:
    """Map pytest results back to the page's test cases (by test function name)."""
    by_func = {t["func"]: t["sig"] for t in data["test_cases"]}
    for r in run["results"]:
        func = r["name"].split("::")[-1].split("[")[0]
        sig = by_func.get(func)
        if not sig or sig not in h["test_cases"]:
            continue
        e = h["test_cases"][sig]
        e["runs"] = e.get("runs", 0) + 1
        e["passed"] = e.get("passed", 0) + (1 if r["status"] == "PASSED" else 0)
        e.update({"last_result": r["status"], "last_run_at": run["at"], "last_message": (r.get("message") or "")[:300]})
    for x in h["explorations"]:
        if x["id"] == data["id"]:
            x["last_run"] = run["summary"]
    h["updated_at"] = run["at"]
    return h


def list_pages() -> list[dict]:
    st = get_storage()
    out = []
    for k in st.list(HBASE):
        if not k.endswith(".json"):
            continue
        try:
            h = json.loads(st.read_text(f"{HBASE}/{k}"))
        except Exception:  # noqa: BLE001
            continue
        tcs = h["test_cases"].values()
        out.append({"key": h["key"], "page": h["page"], "url": h["url"], "title": h.get("title", ""), "updated_at": h["updated_at"],
                    "explorations": len(h["explorations"]), "test_cases": len([t for t in tcs if "first_seen" in t]),
                    "passed_last": len([t for t in tcs if t.get("last_result") == "PASSED"]),
                    "failed_last": len([t for t in tcs if t.get("last_result") == "FAILED"])})
    return sorted(out, key=lambda x: x["updated_at"], reverse=True)


# ------------------------------------------------------------------ backfill explorations made before history existed
LEGACY_SIG = {"TC-WEB-001": "page.opens", "TC-WEB-002": "page.main_elements", "TC-WEB-003": "page.links",
              "TC-LOGIN-001": "login.password_masked", "TC-LOGIN-002": "login.empty_submit", "TC-LOGIN-003": "login.wrong_password",
              "TC-LOGIN-004": "login.valid", "TC-HOME-001": "home.menu", "TC-HOME-002": "home.logout"}


def backfill() -> int:
    st = get_storage()
    ids = sorted({k.split("/")[0] for k in st.list(EBASE) if k.endswith("result.json")})
    done = 0
    for eid in ids:
        try:
            data = json.loads(st.read_text(f"{EBASE}/{eid}/result.json"))
        except Exception:  # noqa: BLE001
            continue
        if data.get("history_key"):
            continue
        h = for_url(data["url"])
        for t in data["test_cases"]:
            t.setdefault("sig", LEGACY_SIG.get(t["id"], "legacy:" + t["id"]))
        hids = assign_ids(h, [t["sig"] for t in data["test_cases"]])
        for t in data["test_cases"]:
            t["hid"] = hids[t["sig"]]
            t.setdefault("is_new", False)
        record_exploration(h, data)
        if data.get("last_run"):
            record_run(h, data, data["last_run"])
        save(h)
        data["history_key"] = h["key"]
        st.write_text(f"{EBASE}/{eid}/result.json", json.dumps(data, ensure_ascii=False, indent=1))
        done += 1
    return done
