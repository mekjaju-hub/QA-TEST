"""Requirement Explorer + Clarification & Conflict Center (P08, P09)."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..core.errors import AppError
from ..core.masking import mask
from ..db import get_db
from ..models import (
    NF, Approval, Comment, Requirement, RequirementAssumption, RequirementConflict, RequirementQuestion, RequirementVersion,
)
from ..repositories import FIELD_COLS, apply_engine_to_req, audit, now, req_to_engine
from ..services.engine.analysis import REQUIREMENT_TYPES, decide_status, normalize_text, reanalyze
from .deps import Principal, get_project, require
from .serializers import conflict_out, iso, requirement_out

router = APIRouter(prefix="/api", tags=["requirements"])


class ReqPatch(BaseModel):
    reason: str = Field(min_length=3, max_length=2000)
    title: str | None = Field(default=None, max_length=200)
    type: str | None = None
    original_text: str | None = Field(default=None, max_length=20000)
    fields: dict[str, str] = {}


class CommentIn(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


class QuestionIn(BaseModel):
    question_id: str
    answer: str | None = Field(default=None, max_length=4000)
    field_value: str | None = Field(default=None, max_length=400)
    resolve: bool = False


class AssumptionIn(BaseModel):
    question_id: str
    text: str | None = Field(default=None, max_length=2000)
    state: str | None = Field(default=None, pattern="^(DRAFT|ACCEPTED|REJECTED)$")


class ConflictResolveIn(BaseModel):
    conflict_id: str
    keep: str = Field(pattern="^(a|b|both)$")
    reason: str = Field(min_length=3, max_length=2000)


def _req(db: Session, rid: str) -> Requirement:
    r = db.get(Requirement, rid)
    if r is None:
        r = db.scalar(select(Requirement).where(Requirement.req_id == rid))
    if r is None:
        raise AppError("NOT_FOUND", "ไม่พบ Requirement", status=404)
    return r


@router.get("/projects/{project_id}/requirements")
def list_requirements(project_id: str, q: str = "", type: str = "", status: str = "", module: str = "", min_score: int = 0,
                      max_score: int = 100, conflict: bool = False, needs_clarification: bool = False, show_old: bool = False,
                      p: Principal = Depends(require("req.view")), db: Session = Depends(get_db)):
    pr = get_project(db, project_id)
    stmt = select(Requirement).where(Requirement.project_id == pr.id)
    if not show_old:
        stmt = stmt.where(Requirement.is_latest.is_(True))
    if type:
        stmt = stmt.where(Requirement.type == type)
    if status:
        stmt = stmt.where(Requirement.status == status)
    if module:
        stmt = stmt.where(Requirement.module == module)
    if conflict:
        stmt = stmt.where(Requirement.conflict_status == "OPEN")
    if needs_clarification:
        stmt = stmt.where(Requirement.status == "NEEDS_CLARIFICATION")
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Requirement.req_id.ilike(like), Requirement.title.ilike(like), Requirement.original_text.ilike(like)))
    rows = [r for r in db.scalars(stmt.order_by(Requirement.req_id))
            if min_score <= min(r.completeness_score, r.clarity_score) <= max_score]
    return {"items": [requirement_out(r, brief=True) for r in rows], "types": REQUIREMENT_TYPES,
            "modules": sorted({r.module for r in rows})}


@router.get("/requirements/{rid}")
def get_requirement(rid: str, p: Principal = Depends(require("req.view")), db: Session = Depends(get_db)):
    r = _req(db, rid)
    out = requirement_out(r)
    confs = list(db.scalars(select(RequirementConflict).where(or_(RequirementConflict.req_a_id == r.id, RequirementConflict.req_b_id == r.id))))
    out["conflicts"] = [{"id": c.id, "status": c.status, "similarity": c.similarity, "diffs": c.diffs,
                         "other": (db.get(Requirement, c.req_b_id if c.req_a_id == r.id else c.req_a_id).req_id)} for c in confs]
    out["ai_output"]["conflicts"] = [f"{c['other']}: " + ", ".join(d["field"] for d in c["diffs"]) for c in out["conflicts"]]
    out["versions"] = [{"version": v.version, "changes": v.changes, "kind": v.kind, "changed_by": v.changed_by, "reason": v.reason,
                        "created_at": iso(v.created_at), "snapshot": v.snapshot}
                       for v in db.scalars(select(RequirementVersion).where(RequirementVersion.requirement_id == r.id).order_by(RequirementVersion.version))]
    out["comments"] = [{"id": c.id, "username": c.username, "text": c.text, "created_at": iso(c.created_at)}
                       for c in db.scalars(select(Comment).where(Comment.entity_id == r.id).order_by(Comment.created_at))]
    return out


def _snapshot(r: Requirement) -> dict:
    return {"title": r.title, "type": r.type, "original_text": r.original_text, **{c: getattr(r, c) for c in FIELD_COLS}, "status": r.status}


@router.patch("/requirements/{rid}")
def patch_requirement(rid: str, body: ReqPatch, p: Principal = Depends(require("req.edit")), db: Session = Depends(get_db)):
    """Edit → keep old values as a version, re-score, require review again."""
    r = _req(db, rid)
    if r.status == "DEPRECATED":
        raise AppError("DEPRECATED", "Requirement นี้ถูก Deprecate แล้ว", status=409)
    before = _snapshot(r)
    if body.type is not None and body.type not in REQUIREMENT_TYPES:
        raise AppError("VALIDATION", "Requirement Type ไม่ถูกต้อง")
    bad = [k for k in body.fields if k not in FIELD_COLS or k == "threshold_ambiguous"]
    if bad:
        raise AppError("VALIDATION", f"ฟิลด์ไม่ถูกต้อง: {', '.join(bad)}")
    d = req_to_engine(r)
    if body.title is not None:
        d["title"] = body.title
    if body.type is not None:
        d["type"] = body.type
    if body.original_text is not None:
        r.original_text = body.original_text
        r.normalized_text = normalize_text(body.original_text).lower()
        d["original_text"] = r.original_text
    for k, v in body.fields.items():
        d["fields"][k] = v.strip() or NF
    if "threshold_op" in body.fields or "threshold_value" in body.fields:
        f = d["fields"]
        f["threshold"] = (f"{f['threshold_op'] + ' ' if f['threshold_op'] != NF else ''}{f['threshold_value']}") if f["threshold_value"] != NF else NF
        f["threshold_ambiguous"] = f["threshold_value"] != NF and f["threshold_op"] == NF
    if d["status"] == "APPROVED":
        d["status"] = "REVISED"
    reanalyze(d)
    if d["status"] not in ("CONFLICT", "NEEDS_CLARIFICATION"):
        d["status"] = "REVISED" if before["status"] in ("APPROVED", "REVISED") else d["status"]
    apply_engine_to_req(r, d)
    after = _snapshot(r)
    changes = [{"field": k, "old": before[k], "new": after[k]} for k in before if before[k] != after[k]]
    db.add(RequirementVersion(requirement_id=r.id, version=r.version, snapshot=before, changes=changes, kind="Human-edited",
                              changed_by=p.username, reason=body.reason))
    r.version += 1
    r.approved_by = None
    audit(db, p.username, "REQUIREMENT_EDIT", r.req_id, body.reason)
    db.commit()
    return requirement_out(r)


@router.post("/requirements/{rid}/review")
def review(rid: str, body: CommentIn | None = None, p: Principal = Depends(require("req.approve")), db: Session = Depends(get_db)):
    r = _req(db, rid)
    r.reviewed_by = p.username
    if r.status == "AI_GENERATED":
        r.status = "WAITING_FOR_REVIEW"
    db.add(Approval(entity_type="requirement", entity_id=r.id, version=r.version, action="REVIEW", username=p.username,
                    comment=body.text if body else ""))
    audit(db, p.username, "REQUIREMENT_REVIEW", r.req_id)
    db.commit()
    return requirement_out(r)


@router.post("/requirements/{rid}/approve")
def approve(rid: str, confirm_unverified: bool = False, p: Principal = Depends(require("req.approve")), db: Session = Depends(get_db)):
    r = _req(db, rid)
    if r.conflict_status == "OPEN":
        raise AppError("HAS_CONFLICT", "มี Conflict ที่ยังไม่ Resolve", status=409, action="ไปที่ Clarification & Conflict Center")
    open_q = [q for q in r.questions if not q.resolved]
    if open_q:
        raise AppError("HAS_OPEN_QUESTIONS", f"ยังมี Clarification ค้าง {len(open_q)} ข้อ — Resolve ก่อน Approve", status=409)
    if r.source_unverified and not confirm_unverified:
        raise AppError("SOURCE_UNVERIFIED", "AI อ้างข้อความที่ไม่พบตรงตัวในต้นฉบับ ต้องยืนยันว่าตรวจแล้ว", status=409,
                       action="ส่ง confirm_unverified=true หลังตรวจ")
    if r.status == "DEPRECATED":
        raise AppError("DEPRECATED", "Requirement นี้ถูก Deprecate แล้ว", status=409)
    r.status, r.approved_by = "APPROVED", p.username
    r.reviewed_by = r.reviewed_by or p.username
    db.add(Approval(entity_type="requirement", entity_id=r.id, version=r.version, action="APPROVE", username=p.username))
    audit(db, p.username, "REQUIREMENT_APPROVE", r.req_id)
    db.commit()
    return requirement_out(r)


@router.post("/requirements/{rid}/comments")
def comment(rid: str, body: CommentIn, p: Principal = Depends(require("comment")), db: Session = Depends(get_db)):
    r = _req(db, rid)
    db.add(Comment(project_id=r.project_id, entity_type="requirement", entity_id=r.id, username=p.username, text=mask(body.text)))
    audit(db, p.username, "COMMENT", r.req_id)
    db.commit()
    return {"ok": True}


@router.post("/requirements/{rid}/resolve-question")
def resolve_question(rid: str, body: QuestionIn, p: Principal = Depends(require("question.answer")), db: Session = Depends(get_db)):
    r = _req(db, rid)
    q = next((x for x in r.questions if x.id == body.question_id), None)
    if q is None:
        raise AppError("NOT_FOUND", "ไม่พบคำถาม", status=404)
    if body.answer is not None:
        q.answer, q.answered_by = mask(body.answer.strip()), p.username
        audit(db, p.username, "CLARIFICATION_ANSWER", r.req_id, q.text)
    if body.resolve:
        if not p.can("question.resolve"):
            raise AppError("FORBIDDEN", "คุณไม่มีสิทธิ์ Resolve Clarification", status=403)
        if not q.answer:
            raise AppError("VALIDATION", "ต้องตอบคำถามก่อน Resolve")
        q.resolved, q.resolved_by, q.resolved_at = True, p.username, now()
        d = req_to_engine(r)
        before = _snapshot(r)
        if body.field_value and q.field:
            d["fields"][q.field] = body.field_value.strip()
            f = d["fields"]
            if q.field in ("threshold_op", "threshold_value"):
                f["threshold"] = (f"{f['threshold_op'] + ' ' if f['threshold_op'] != NF else ''}{f['threshold_value']}") if f["threshold_value"] != NF else NF
                f["threshold_ambiguous"] = f["threshold_op"] == NF
        reanalyze(d)
        apply_engine_to_req(r, d)
        after = _snapshot(r)
        changes = [{"field": k, "old": before[k], "new": after[k]} for k in before if before[k] != after[k] and k != "status"]
        if changes:
            db.add(RequirementVersion(requirement_id=r.id, version=r.version, snapshot=before, changes=changes, kind="Clarification",
                                      changed_by=p.username, reason=f"Clarification: {q.text} → {q.answer}"))
            r.version += 1
        audit(db, p.username, "CLARIFICATION_RESOLVE", r.req_id, f"{q.text} → {q.answer}")
    db.commit()
    return requirement_out(r)


@router.post("/requirements/{rid}/assumption")
def update_assumption(rid: str, body: AssumptionIn, p: Principal = Depends(require("assumption.edit")), db: Session = Depends(get_db)):
    r = _req(db, rid)
    q = next((x for x in r.questions if x.id == body.question_id), None)
    if q is None or q.assumption is None:
        raise AppError("NOT_FOUND", "ไม่พบ Assumption", status=404)
    a: RequirementAssumption = q.assumption
    if body.text:
        a.text = body.text.strip()
    if body.state:
        a.state = body.state
    a.edited_by, a.updated_at = p.username, now()
    audit(db, p.username, f"ASSUMPTION_{body.state or 'EDIT'}", r.req_id, a.text)
    db.commit()
    return requirement_out(r)


@router.get("/projects/{project_id}/clarifications")
def clarification_center(project_id: str, p: Principal = Depends(require("req.view")), db: Session = Depends(get_db)):
    pr = get_project(db, project_id)
    reqs = list(db.scalars(select(Requirement).where(Requirement.project_id == pr.id, Requirement.is_latest.is_(True),
                                                     Requirement.status != "DEPRECATED").order_by(Requirement.req_id)))
    questions, assumptions = [], []
    for r in reqs:
        for q in r.questions:
            base = {"requirement_id": r.id, "req_id": r.req_id, "req_status": r.status, "original_text": r.original_text,
                    "source_page": r.source.page if r.source else NF, "source_section": r.source.section if r.source else NF,
                    "question_id": q.id, "key": q.key, "field": q.field}
            questions.append({**base, "text": q.text, "answer": q.answer, "resolved": q.resolved, "answered_by": q.answered_by,
                              "resolved_by": q.resolved_by})
            if q.assumption:
                assumptions.append({**base, "label": q.assumption.label, "text": q.assumption.text, "state": q.assumption.state,
                                    "edited_by": q.assumption.edited_by})
    confs = list(db.scalars(select(RequirementConflict).where(RequirementConflict.project_id == pr.id).order_by(RequirementConflict.created_at)))
    return {"questions": questions, "assumptions": assumptions,
            "conflicts": [conflict_out(c, db.get(Requirement, c.req_a_id), db.get(Requirement, c.req_b_id)) for c in confs]}


@router.post("/requirements/{rid}/resolve-conflict")
def resolve_conflict(rid: str, body: ConflictResolveIn, p: Principal = Depends(require("conflict.resolve")), db: Session = Depends(get_db)):
    """Never auto-picks the newest side; a reason is mandatory and stored in history (หัวข้อ 10)."""
    target = _req(db, rid)
    c = db.get(RequirementConflict, body.conflict_id)
    if c is None or target.id not in (c.req_a_id, c.req_b_id):
        raise AppError("NOT_FOUND", "ไม่พบ Conflict", status=404)
    if c.status == "RESOLVED":
        raise AppError("ALREADY_RESOLVED", "Conflict นี้ Resolve แล้ว", status=409)
    a, b = db.get(Requirement, c.req_a_id), db.get(Requirement, c.req_b_id)
    label = "ไม่ขัดแย้ง ใช้ทั้งสอง Requirement" if body.keep == "both" else \
        f"เลือก {(a if body.keep == 'a' else b).req_id} · {(b if body.keep == 'a' else a).req_id} → DEPRECATED"
    c.status, c.resolution, c.reason, c.resolved_by, c.resolved_at = "RESOLVED", label[:40], body.reason, p.username, now()
    c.history = (c.history or []) + [{"at": now().isoformat(), "by": p.username, "action": "RESOLVED: " + label, "reason": body.reason}]
    db.flush()
    for r in (a, b):
        other = db.scalar(select(RequirementConflict.id).where(RequirementConflict.id != c.id, RequirementConflict.status == "OPEN",
                                                               or_(RequirementConflict.req_a_id == r.id, RequirementConflict.req_b_id == r.id)))
        r.conflict_status = "OPEN" if other else "RESOLVED"
    loser = b if body.keep == "a" else a if body.keep == "b" else None
    if loser is not None:
        loser.status, loser.is_latest = "DEPRECATED", False
    for r in (a, b):
        if r.status != "DEPRECATED":
            d = req_to_engine(r)
            d["status"] = decide_status(d)
            r.status = d["status"]
    audit(db, p.username, "CONFLICT_RESOLVE", f"{a.req_id} vs {b.req_id}", f"{label} | {body.reason}")
    db.commit()
    return conflict_out(c, a, b)


@router.get("/requirements/compare/{a_id}/{b_id}")
def compare_requirements(a_id: str, b_id: str, p: Principal = Depends(require("req.view")), db: Session = Depends(get_db)):
    a, b = _req(db, a_id), _req(db, b_id)
    from ..services.engine.analysis import bigrams, compare_pair, dice
    sim = dice(bigrams(a.normalized_text), bigrams(b.normalized_text))
    return {"a": requirement_out(a), "b": requirement_out(b), "similarity": round(sim * 100),
            "diffs": compare_pair(req_to_engine(a), req_to_engine(b), sim)}
