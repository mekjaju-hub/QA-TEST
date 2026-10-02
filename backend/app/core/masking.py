"""Secret / PII masking (หัวข้อ 33, 39) — port of mask() in 04_source/p2_core.js."""
from __future__ import annotations

import re

_RULES: list[tuple[re.Pattern, object]] = [
    (re.compile(r"(password|passwd|pwd|รหัสผ่าน)\s*[:=]\s*\S+", re.I), r"\1=********"),
    (re.compile(r"(token|api[_-]?key|secret|otp|cookie|session)\s*[:=]\s*\S+", re.I), r"\1=********"),
    (re.compile(r"(Bearer\s+)[A-Za-z0-9._\-]+"), r"\1********"),
    (re.compile(r"sk-[A-Za-z0-9_\-]{8,}"), "sk-********"),
    (re.compile(r"ghp_[A-Za-z0-9]{10,}"), "ghp_********"),
    (re.compile(r"github_pat_[A-Za-z0-9_]{10,}"), "github_pat_********"),
    (re.compile(r"(mysql|postgres(?:ql)?(?:\+\w+)?|mongodb|redis|jdbc:[a-z]+)://[^\s\"']+", re.I), r"\1://********"),
    # Thai national ID (13 digits, optional dashes) → keep last 4
    (re.compile(r"\b\d{1}-?\d{4}-?\d{5}-?\d{2}-?\d{1}\b"), lambda m: "*" * (len(m.group(0)) - 4) + m.group(0)[-4:]),
    # Customer IDs that look real (CUST/CIF/CUS + 4+ digits) — synthetic CUST-TEST-xxxx is left alone
    (re.compile(r"\b(CUST|CIF|CUS)[-_]?\d{4,}\b", re.I), lambda m: m.group(0)[:4] + "****"),
]


def mask(text: object) -> str:
    s = "" if text is None else str(text)
    for pat, rep in _RULES:
        s = pat.sub(rep, s)  # type: ignore[arg-type]
    return s
