"""BRS Version Comparison & Impact Analysis (หัวข้อ 17) — port of sectionDiff/buildImpactProposals/applyImpact.

Never edits approved test cases automatically: every effect is an Impact Proposal that QA approves.
"""
from __future__ import annotations

import difflib
import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.errors import AppError
from ..models import (
    AutomationArtifact, Document, DocumentSection, DocumentVersion, ImpactAnalysis, Requirement, TestCase, TestScenario,
)
from ..repositories import audit, now

APPROVED_STATES = ("APPROVED", "READY_FOR_AUTOMATION", "AUTOMATED")


def _sections(db: Session, v: DocumentVersion) -> list[DocumentSection]:
    return list(db.scalars(select(DocumentSection).where(DocumentSection.version_id == v.id).order_by(DocumentSection.seq)))


def section_diff(prev_secs: list, cur_secs: list) -> dict:
    added = [s for s in cur_secs if not any(p.title == s.title for p in prev_secs)]
    removed = [s for s in prev_secs if not any(c.title == s.title for c in cur_secs)]
    changed = []
    for s in cur_secs:
        p = next((x for x in prev_secs if x.title == s.title), None)
        if p is not None and p.text != s.text:
            changed.append((p, s))
    return {"added": added, "removed": removed, "changed": changed}


def unified(a: str, b: str) -> list[dict]:
    out = []
    for line in difflib.ndiff(a.split("\n"), b.split("\n")):
        tag = line[:2]
        if tag == "? ":
            continue
        out.append({"t": {"+ ": "a", "- ": "d"}.get(tag, "c"), "s": line[2:]})
    return out


def _norm(t: str) -> str:
    return re.sub(r"\s+", " ", str(t)).strip()


def build_impact_proposals(db: Session, doc: Document, prev: DocumentVersion, cur: DocumentVersion, username: str) -> ImpactAnalysis:
    ps, cs = _sections(db, prev), _sections(db, cur)
    diff = section_diff(ps, cs)
    ia = db.scalar(select(ImpactAnalysis).where(ImpactAnalysis.document_id == doc.id, ImpactAnalysis.to_version == cur.version))
    if ia is None:
        ia = ImpactAnalysis(project_id=doc.project_id, document_id=doc.id, from_version=prev.version, to_version=cur.version,
                            created_by=username, items=[])
        db.add(ia)
    items: list[dict] = list(ia.items or [])
    seen = {(i["entity_type"], i["entity_id"]) for i in items}

    def push(entity_type: str, entity_id: str, label: str, proposal: str, reason: str) -> None:
        if (entity_type, entity_id) in seen:
            return
        seen.add((entity_type, entity_id))
        items.append({"entity_type": entity_type, "entity_id": entity_id, "label": label, "proposal": proposal,
                      "reason": reason, "status": "PROPOSED", "decided_by": None, "decided_at": None})

    def reqs_of_section(sec_id: str) -> list[Requirement]:
        return list(db.scalars(select(Requirement).where(Requirement.document_id == doc.id, Requirement.source.has(section_id=sec_id))))

    def cascade(r: Requirement, proposal: str, why: str) -> None:
        push("Requirement", r.id, r.req_id, proposal, why)
        for s in db.scalars(select(TestScenario).where(TestScenario.requirement_id == r.id)):
            push("Test Scenario", s.id, s.ts_id, "Deprecation Candidate" if proposal == "Deprecation Candidate" else "Review Required",
                 f"Requirement {r.req_id} {why}")
        for t in db.scalars(select(TestCase).where(TestCase.requirement_id == r.id, TestCase.status != "DEPRECATED")):
            prop = "Deprecation Candidate" if proposal == "Deprecation Candidate" else ("Update Required" if t.status in APPROVED_STATES else "Review Required")
            push("Test Case", t.id, t.tc_id, prop, f"Requirement {r.req_id} {why} — Retest แนะนำ")
            for a in db.scalars(select(AutomationArtifact).where(AutomationArtifact.project_id == doc.project_id)):
                if t.id in (a.test_case_ids or []):
                    push("Automation Script", a.id, f"{a.kind}: {a.name}", "Review Required", f"ใช้ Test Case {t.tc_id}")

    for p_sec, c_sec in diff["changed"]:
        rs = reqs_of_section(p_sec.id) + reqs_of_section(c_sec.id)
        for r in rs:
            if r.supersedes:
                push("Requirement", r.id, r.req_id, "New Test Required",
                     f'Requirement ใหม่จากการแก้ไข Section "{c_sec.title}" (แทน {len(r.supersedes)} รายการเดิม)')
            elif _norm(r.original_text) in _norm(c_sec.text):
                push("Requirement", r.id, r.req_id, "No Impact", f'ข้อความเดิมยังอยู่ใน Section "{c_sec.title}" v{cur.version}')
            else:
                cascade(r, "Update Required", f'ข้อความใน Section "{p_sec.title}" ถูกแก้ไขใน v{cur.version}')
    for p_sec in diff["removed"]:
        for r in reqs_of_section(p_sec.id):
            cascade(r, "Deprecation Candidate", f'อยู่ใน Section "{p_sec.title}" ที่ถูกลบ')
    for c_sec in diff["added"]:
        push("Section", c_sec.id, c_sec.title, "New Test Required", f"Section ใหม่ใน v{cur.version}")
    ia.items = items
    ia.retest = sorted({i["label"] for i in items if i["entity_type"] == "Test Case"})
    ia.section_diff = {"added": [s.title for s in diff["added"]], "removed": [s.title for s in diff["removed"]],
                       "changed": [c.title for _, c in diff["changed"]]}
    db.flush()
    return ia


def compare_payload(db: Session, doc: Document, from_v: int, to_v: int) -> dict:
    A = db.scalar(select(DocumentVersion).where(DocumentVersion.document_id == doc.id, DocumentVersion.version == from_v))
    B = db.scalar(select(DocumentVersion).where(DocumentVersion.document_id == doc.id, DocumentVersion.version == to_v))
    if A is None or B is None:
        raise AppError("NOT_FOUND", "ไม่พบ Version ที่เลือก", status=404)
    d = section_diff(_sections(db, A), _sections(db, B))
    ia = db.scalar(select(ImpactAnalysis).where(ImpactAnalysis.document_id == doc.id, ImpactAnalysis.to_version == to_v))
    return {
        "document": {"id": doc.id, "name": doc.name}, "from": from_v, "to": to_v,
        "added": [{"id": s.id, "title": s.title, "text": s.text} for s in d["added"]],
        "removed": [{"id": s.id, "title": s.title, "text": s.text} for s in d["removed"]],
        "changed": [{"title": c.title, "diff": unified(p.text, c.text)} for p, c in d["changed"]],
        "impact": ({"id": ia.id, "items": ia.items, "retest": ia.retest, "status": ia.status} if ia else None),
    }


def apply_impact(db: Session, ia: ImpactAnalysis, index: int | None, decision: str, username: str) -> ImpactAnalysis:
    if decision not in ("APPROVED", "REJECTED"):
        raise AppError("INVALID_DECISION", "Decision ต้องเป็น APPROVED หรือ REJECTED")
    items = [dict(i) for i in ia.items]
    targets = range(len(items)) if index is None else [index]
    for k in targets:
        i = items[k]
        if i["status"] != "PROPOSED":
            continue
        i.update(status=decision, decided_by=username, decided_at=now().isoformat())
        if decision == "APPROVED":
            if i["entity_type"] == "Requirement" and i["proposal"] in ("Deprecation Candidate", "Update Required"):
                r = db.get(Requirement, i["entity_id"])
                # Update Required → deprecate only when a newer requirement supersedes it
                if r is not None and (i["proposal"] == "Deprecation Candidate" or
                                      any(r.id in (x.supersedes or []) for x in db.scalars(select(Requirement).where(Requirement.document_id == r.document_id)))):
                    r.status, r.is_latest = "DEPRECATED", False
            if i["entity_type"] == "Test Scenario" and i["proposal"] == "Deprecation Candidate":
                s = db.get(TestScenario, i["entity_id"])
                if s is not None:
                    s.status = "DEPRECATED"
            # Test Case: flag only — never auto-edit approved test cases (AC 37)
        audit(db, username, f"IMPACT_{decision}", i["label"], i["proposal"])
    ia.items = items
    if all(i["status"] != "PROPOSED" for i in items):
        ia.status = "DECIDED"
    db.flush()
    return ia
