"""Role-based access control — same permission matrix as the prototype (p2_core.js PERMS)."""
from __future__ import annotations

ROLES = {
    "ADMIN": "Admin",
    "QA_MANUAL": "QA Manual",
    "QA_AUTOMATION": "QA Automation",
    "BA": "Business Analyst",
}

PERMS: dict[str, list[str]] = {
    "project.manage": ["ADMIN"],
    "project.view": ["ADMIN", "QA_MANUAL", "QA_AUTOMATION", "BA"],
    "doc.upload": ["ADMIN", "QA_MANUAL"],
    "doc.process": ["ADMIN", "QA_MANUAL"],
    "doc.view": ["ADMIN", "QA_MANUAL", "QA_AUTOMATION", "BA"],
    "req.view": ["ADMIN", "QA_MANUAL", "QA_AUTOMATION", "BA"],
    "req.edit": ["ADMIN", "QA_MANUAL"],
    "req.approve": ["ADMIN", "QA_MANUAL"],
    "question.answer": ["ADMIN", "QA_MANUAL", "BA"],
    "question.resolve": ["ADMIN", "QA_MANUAL", "BA"],
    "assumption.edit": ["ADMIN", "QA_MANUAL"],
    "conflict.resolve": ["ADMIN", "QA_MANUAL", "BA"],
    "impact.approve": ["ADMIN", "QA_MANUAL"],
    "scenario.edit": ["ADMIN", "QA_MANUAL"],
    "tc.view": ["ADMIN", "QA_MANUAL", "QA_AUTOMATION", "BA"],
    "tc.edit": ["ADMIN", "QA_MANUAL"],
    "tc.approve": ["ADMIN", "QA_MANUAL"],
    "tc.export": ["ADMIN", "QA_MANUAL", "QA_AUTOMATION"],
    "comment": ["ADMIN", "QA_MANUAL", "QA_AUTOMATION", "BA"],
    "auto.generate": ["ADMIN", "QA_AUTOMATION"],
    "auto.edit": ["ADMIN", "QA_AUTOMATION"],
    "auto.view": ["ADMIN", "QA_AUTOMATION", "QA_MANUAL", "BA"],
    "run.execute": ["ADMIN", "QA_AUTOMATION"],
    "run.view": ["ADMIN", "QA_AUTOMATION", "QA_MANUAL", "BA"],
    "github.propose": ["ADMIN", "QA_AUTOMATION"],
    "github.approve": ["ADMIN", "QA_AUTOMATION"],
    "settings": ["ADMIN"],
    "audit.view": ["ADMIN"],
    "user.manage": ["ADMIN"],
}


def has_perm(role_codes: list[str], perm: str) -> bool:
    allowed = PERMS.get(perm, [])
    return any(r in allowed for r in role_codes)


def perms_for(role_codes: list[str]) -> list[str]:
    return sorted(p for p in PERMS if has_perm(role_codes, p))
