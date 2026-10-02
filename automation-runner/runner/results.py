"""Result parsers: JUnit XML (pytest) and Newman JSON — port of parseJUnit/parseNewman (p4_gen.js)."""
from __future__ import annotations

import json
import re
import xml.etree.ElementTree as ET

NF = "NOT_FOUND"
TC_FROM_NAME = re.compile(r"tc_([a-z0-9]+)_([a-z0-9]+)_(\d{3})", re.I)
TC_LITERAL = re.compile(r"TC-[A-Z0-9]+-[A-Z0-9]+-\d{3}")


def tc_id_from(name: str) -> str:
    m = TC_LITERAL.search(name)
    if m:
        return m.group(0)
    m = TC_FROM_NAME.search(name)
    return f"TC-{m.group(1).upper()}-{m.group(2).upper()}-{m.group(3)}" if m else NF


def parse_junit(xml_text: str | bytes) -> list[dict]:
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as e:
        raise ValueError(f"INVALID_JUNIT: {e}") from e
    out = []
    for tc in root.iter("testcase"):
        cls, name = tc.get("classname", ""), tc.get("name", "")
        path = cls.replace(".", "/") + ".py" if cls else ""
        node = f"{path}::{name}" if path else name
        fail = tc.find("failure") if tc.find("failure") is not None else tc.find("error")
        skip = tc.find("skipped")
        status = "FAILED" if fail is not None else "BLOCKED" if skip is not None else "PASSED"
        msg = ""
        if fail is not None:
            msg = (fail.get("message") or fail.text or "")[:500]
        elif skip is not None:
            msg = (skip.get("message") or "")[:500]
        out.append({"tc_id": tc_id_from(name), "name": node, "status": status, "message": msg, "duration": float(tc.get("time") or 0)})
    return out


def parse_newman(raw: str | bytes | dict) -> list[dict]:
    data = raw if isinstance(raw, dict) else json.loads(raw)
    run = data.get("run", data)
    out = []
    for e in run.get("executions", []):
        name = (e.get("item") or {}).get("name", "request")
        fails = [a for a in e.get("assertions", []) if a.get("error")]
        out.append({"tc_id": tc_id_from(name), "name": name, "status": "FAILED" if fails else "PASSED",
                    "message": "; ".join(a["error"].get("message", "") for a in fails)[:500],
                    "duration": ((e.get("response") or {}).get("responseTime") or 0) / 1000})
    return out


def summarize(results: list[dict]) -> dict:
    c = lambda s: sum(1 for r in results if r["status"] == s)  # noqa: E731
    return {"total": len(results), "passed": c("PASSED"), "failed": c("FAILED"), "blocked": c("BLOCKED")}
