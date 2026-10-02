"""Repository helpers: ID sequences, audit, and model <-> engine-dict mapping."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.masking import mask
from ..models import (
    NF, AuditLog, IdSequence, Requirement, RequirementAssumption, RequirementQuestion, RequirementSource,
)

FIELD_COLS = ["business_rule", "preconditions", "input", "process", "output", "expected_result", "role", "threshold",
              "threshold_raw", "threshold_op", "threshold_value", "threshold_ambiguous", "unit", "date_range",
              "inclusion", "exclusion"]


def now() -> datetime:
    return datetime.now(timezone.utc)


def next_seq(db: Session, key: str) -> int:
    row = db.get(IdSequence, key, with_for_update=True)
    if row is None:
        row = IdSequence(key=key, value=0)
        db.add(row)
    row.value += 1
    db.flush()
    return row.value


def audit(db: Session, username: str, action: str, entity: str = "", detail: str = "", ip: str = "") -> None:
    db.add(AuditLog(username=username or "anonymous", action=action, entity=mask(entity)[:300], detail=mask(detail),
                    correlation_id=uuid.uuid4().hex[:8], ip=ip))


# ------------------------------------------------------------------ requirement mapping
def req_to_engine(r: Requirement) -> dict:
    """ORM → dict shape used by services/engine/analysis.py and services/testdesign.py."""
    s = r.source
    return {
        "id": r.id, "req_id": r.req_id, "type": r.type, "module": r.module, "submodule": r.submodule, "title": r.title,
        "original_text": r.original_text, "normalized_text": r.normalized_text,
        "fields": {c: getattr(r, c) for c in FIELD_COLS},
        "source": {"page": s.page if s else NF, "page_end": s.page_end if s else None, "section": s.section if s else NF,
                   "section_id": s.section_id if s else None, "table": s.table_ref if s else NF,
                   "screenshot": s.screenshot_id if s else NF, "doc_name": s.document_name if s else NF},
        "ai_meta": r.ai_meta, "confidence": r.ai_confidence, "source_unverified": r.source_unverified,
        "status": r.status, "conflict_status": r.conflict_status, "duplicate_of": r.duplicate_of, "supersedes": r.supersedes or [],
        "completeness": {"score": r.completeness_score, "reasons": r.completeness_reasons},
        "clarity": {"score": r.clarity_score, "reasons": r.clarity_reasons},
        "questions": [{"id": q.id, "key": q.key, "text": q.text, "answer": q.answer, "resolved": q.resolved, "field": q.field,
                       "assumption": ({"id": q.assumption.id, "text": q.assumption.text, "state": q.assumption.state} if q.assumption else None)}
                      for q in r.questions],
        "origin": r.origin, "version": r.version,
    }


def apply_engine_to_req(r: Requirement, d: dict) -> None:
    """Write scores, fields, status and questions back to the ORM row."""
    for c in FIELD_COLS:
        setattr(r, c, d["fields"][c])
    r.type, r.title = d["type"], d["title"][:200]
    r.completeness_score, r.completeness_reasons = d["completeness"]["score"], d["completeness"]["reasons"]
    r.clarity_score, r.clarity_reasons = d["clarity"]["score"], d["clarity"]["reasons"]
    r.status, r.conflict_status = d["status"], d.get("conflict_status", r.conflict_status)
    r.duplicate_of = d.get("duplicate_of")
    r.updated_at = now()
    existing = {q.id: q for q in r.questions}
    keep_ids = set()
    for q in d["questions"]:
        row = existing.get(q["id"])
        if row is None:
            row = RequirementQuestion(id=q["id"], key=q["key"], text=q["text"], answer=q.get("answer", ""),
                                      resolved=q.get("resolved", False), field=q.get("field"))
            if q.get("assumption"):
                row.assumption = RequirementAssumption(id=q["assumption"]["id"], requirement_id=r.id, text=q["assumption"]["text"],
                                                       state=q["assumption"].get("state", "DRAFT"))
            r.questions.append(row)
        keep_ids.add(row.id)
    for qid, row in existing.items():
        if qid not in keep_ids:
            r.questions.remove(row)


def new_requirement_row(d: dict, *, project_id: str, document_id: str | None, version_id: str | None, doc_version: int,
                        created_by: str) -> Requirement:
    r = Requirement(id=d["id"], req_id=d["req_id"], project_id=project_id, document_id=document_id, version_id=version_id,
                    doc_version=doc_version, type=d["type"], module=d["module"], submodule=d["submodule"][:400],
                    title=d["title"][:200], original_text=d["original_text"], normalized_text=d["normalized_text"],
                    ai_confidence=float(d.get("confidence") or 0.6), ai_meta=d.get("ai_meta") or {},
                    source_unverified=d.get("source_unverified", False), origin=d.get("origin", "RULE_ENGINE"),
                    created_by=created_by, supersedes=d.get("supersedes", []))
    s = d["source"]
    r.source = RequirementSource(document_name=s.get("doc_name") or NF, page=str(s.get("page") or NF), page_end=s.get("page_end"),
                                 section=(s.get("section") or NF)[:400], section_id=s.get("section_id"),
                                 table_ref=(s.get("table") or NF)[:400], screenshot_id=s.get("screenshot") or NF)
    r.questions = []
    apply_engine_to_req(r, d)
    return r


def latest_requirements(db: Session, project_id: str) -> list[Requirement]:
    return list(db.scalars(select(Requirement).where(Requirement.project_id == project_id, Requirement.is_latest.is_(True))
                           .order_by(Requirement.req_id)))
