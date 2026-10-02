"""Block forbidden files / secrets before any Git action or save (หัวข้อ 24, 33)."""
from __future__ import annotations

import re

FORBIDDEN_FILES = [re.compile(p, re.I) for p in (r"(^|/)\.env$", r"\.auth/", r"\.session$", r"(^|/)(secrets?|credentials?)\.", r"\.har$", r"storage_state")]
SECRET_CONTENT = [re.compile(p, re.I if i == 2 else 0) for i, p in enumerate((
    r"ghp_[A-Za-z0-9]{20,}", r"sk-ant-[A-Za-z0-9_\-]{10,}", r"password\s*=\s*['\"][^'\"{}]+['\"]", r"\b\d{13}\b",
    r"github_pat_[A-Za-z0-9_]{20,}", r"(mysql|postgres(?:ql)?)://[^\s{}]+:[^\s{}]+@"))]


def scan_files_for_secrets(files: dict[str, str]) -> list[str]:
    problems = []
    for path, content in files.items():
        if any(rx.search(path) for rx in FORBIDDEN_FILES):
            problems.append(f"{path}: ไฟล์ต้องห้าม (.env/session/credential)")
        for rx in SECRET_CONTENT:
            if rx.search(content or ""):
                problems.append(f"{path}: พบข้อมูลที่อาจเป็น Secret/Customer ID ({rx.pattern[:20]}…)")
    return problems
