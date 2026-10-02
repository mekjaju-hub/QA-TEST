"""Test Scenario Review, Test Case Review/Detail, Excel export, Traceability (P10–P12, P22)."""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..core.errors import AppError
from ..core.masking import mask
from ..db import get_db
from ..models import (
    Approval, AutomationArtifact, Comment, Document, DocumentSection, DocumentVersion, Requirement, TestCase,
    TestCaseVersion, TestDataRow, TestRun, TestRunResult, TestScenario, TestScenarioVersion, TestStep,
)
from ..repositories import audit, next_seq, now, req_to_engine
from ..services import testdesign
from ..services.excel_export import export_project_xlsx
from .deps import Principal, get_project, require
from .serializers import TC_FIELDS, iso, scenario_out, tc_snapshot, testcase_out

router = APIRouter(prefix="/api", tags=["test-design"])
APPROVED_STATES = ("APPROVED", "READY_FOR_AUTOMATION", "AUTOMATED")
TC_STATUSES = ["DRAFT", "AI_GENERATED", "WAITING_FOR_REVIEW", "NEEDS_CLARIFICATION", "CONFLICT", "REVISED", "APPROVED",
               "READY_FOR_AUTOMATION", "AUTOMATED", "DEPRECATED"]


class GenScenariosIn(BaseModel):
    requirement_ids: list[str] | None = None  # None = all APPROVED


class ScenarioPatch(BaseModel):
    title: str | None = Field(default=None, max_length=300)
    objective: str | None = Field(default=None, max_length=2000)
    priority: str | None = Field(default=None, pattern="^(Critical|High|Medium|Low)$")
    risk: str | None = Field(default=None, pattern="^(High|Medium|Low)$")
    status: str | None = Field(default=None, pattern="^(WAITING_FOR_REVIEW|APPROVED|DEPRECATED)$")
    reason: str = Field(default="แก้ไขโดย QA", max_length=1000)


class GenTcIn(BaseModel):
    scenario_ids: list[str] = []


class StepIn(BaseModel):
    n: int
    action: str = Field(max_length=4000)
    data: str = Field(default="", max_length=4000)
    expected: str = Field(default="", max_length=4000)
    origin: str = ""
    label: str = ""


class TcPatch(BaseModel):
    reason: str = Field(min_length=3, max_length=2000)
    title: str | None = Field(default=None, max_length=300)
    business_explanation: str | None = None
    given: str | None = None
    when: str | None = None
    then: str | None = None
    preconditions: str | None = None
    overall_expected: str | None = None
    priority: str | None = Field(default=None, pattern="^(Critical|High|Medium|Low)$")
    risk: str | None = Field(default=None, pattern="^(High|Medium|Low)$")
    automation_candidate: str | None = Field(default=None, pattern="^(Yes|No|Maybe)$")
    automation_tool: str | None = Field(default=None, max_length=40)
    steps: list[StepIn] | None = None


class TcStatusIn(BaseModel):
    status: str
    comment: str = Field(default="", max_length=2000)


class BulkIn(BaseModel):
    ids: list[str]
    status: str = "APPROVED"
    comment: str = "Bulk"


class CommentIn(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


# ------------------------------------------------------------------ scenarios
@router.post("/projects/{project_id}/test-scenarios/generate")
def generate_scenarios(project_id: str, body: GenScenariosIn, p: Principal = Depends(require("scenario.edit")), db: Session = Depends(get_db)):
    pr = get_project(db, project_id)
    stmt = select(Requirement).where(Requirement.project_id == pr.id, Requirement.is_latest.is_(True))
    if body.requirement_ids:
        stmt = stmt.where(Requirement.id.in_(body.requirement_ids))
    created, skipped = 0, []
    for r in db.scalars(stmt.order_by(Requirement.req_id)):
        if r.status != "APPROVED":
            skipped.append(f"{r.req_id} ({r.status})")
            continue
        d = req_to_engine(r)
        for t in testdesign.scenario_types_for(d):
            dup = db.scalar(select(TestScenario.id).where(TestScenario.requirement_id == r.id, TestScenario.type == t,
                                                          TestScenario.status != "DEPRECATED"))
            if dup:  # duplicate prevention: one scenario per (requirement, test type)
                continue
            sc = testdesign.build_scenario(d, t)
            n = next_seq(db, f"TS-{pr.code}-{r.module}")
            db.add(TestScenario(ts_id=f"TS-{pr.code}-{r.module}-{n:03d}", project_id=pr.id, requirement_id=r.id,
                                source_page=r.source.page if r.source else "NOT_FOUND",
                                source_section=(r.source.section if r.source else "NOT_FOUND")[:400], **sc))
            created += 1
    audit(db, p.username, "SCENARIO_GENERATE", pr.code, f"{created} created")
    db.commit()
    return {"created": created, "skipped": skipped}


@router.get("/projects/{project_id}/test-scenarios")
def list_scenarios(project_id: str, q: str = "", type: str = "", status: str = "",
                   p: Principal = Depends(require("tc.view")), db: Session = Depends(get_db)):
    pr = get_project(db, project_id)
    stmt = select(TestScenario, Requirement.req_id).join(Requirement, Requirement.id == TestScenario.requirement_id).where(TestScenario.project_id == pr.id)
    if type:
        stmt = stmt.where(TestScenario.type == type)
    if status:
        stmt = stmt.where(TestScenario.status == status)
    if q:
        stmt = stmt.where(or_(TestScenario.ts_id.ilike(f"%{q}%"), TestScenario.title.ilike(f"%{q}%")))
    out = []
    for s, rc in db.execute(stmt.order_by(TestScenario.ts_id)):
        d = scenario_out(s, rc)
        d["test_case_count"] = len(db.scalars(select(TestCase.id).where(TestCase.scenario_id == s.id)).all())
        out.append(d)
    blocked = db.scalars(select(Requirement.req_id).where(Requirement.project_id == pr.id, Requirement.is_latest.is_(True),
                                                          Requirement.status.in_(["NEEDS_CLARIFICATION", "CONFLICT"]))).all()
    approved = db.scalars(select(Requirement.id).where(Requirement.project_id == pr.id, Requirement.is_latest.is_(True),
                                                       Requirement.status == "APPROVED")).all()
    return {"items": out, "blocked_requirements": list(blocked), "approved_requirement_count": len(approved)}


@router.patch("/test-scenarios/{sid}")
def patch_scenario(sid: str, body: ScenarioPatch, p: Principal = Depends(require("scenario.edit")), db: Session = Depends(get_db)):
    s = db.get(TestScenario, sid)
    if s is None:
        raise AppError("NOT_FOUND", "ไม่พบ Test Scenario", status=404)
    snap = scenario_out(s)
    changed = False
    for k in ("title", "objective", "priority", "risk"):
        v = getattr(body, k)
        if v is not None and v != getattr(s, k):
            setattr(s, k, v)
            changed = True
    if changed:
        db.add(TestScenarioVersion(scenario_id=s.id, version=s.version, snapshot=snap, changed_by=p.username, reason=body.reason))
        s.version += 1
        s.status = "WAITING_FOR_REVIEW"
    if body.status:
        s.status = body.status
        if body.status == "APPROVED":
            s.reviewer, s.approved_at = p.username, now()
    audit(db, p.username, "SCENARIO_" + (body.status or "EDIT"), s.ts_id, body.reason)
    db.commit()
    return scenario_out(s)


# ------------------------------------------------------------------ test cases
def _write_tc_children(t: TestCase, data: dict) -> None:
    t.steps = [TestStep(step_no=s["n"], action=s["action"], test_data=str(s.get("data", "")), expected=str(s.get("expected", "")),
                        origin=s.get("origin") or "", label=s.get("label") or "") for s in data["steps"]]
    t.data_rows = [TestDataRow(seq=i + 1, value=str(x["value"]), raw=None if x.get("raw") is None else str(x["raw"]),
                               expected=str(x.get("expected", "")), origin=x.get("origin", ""), note=x.get("note", ""),
                               label=x.get("label", "")) for i, x in enumerate(data.get("test_data", []))]


def generate_test_cases_for(db: Session, scenario_ids: list[str], username: str) -> dict:
    created, blocked = 0, []
    for sid in scenario_ids:
        s = db.get(TestScenario, sid)
        if s is None:
            continue
        r = db.get(Requirement, s.requirement_id)
        if r is None or r.status != "APPROVED":
            blocked.append(f"{s.ts_id} (Requirement {r.status if r else 'missing'})")
            continue
        if s.status == "DEPRECATED":
            blocked.append(f"{s.ts_id} (DEPRECATED)")
            continue
        if db.scalar(select(TestCase.id).where(TestCase.scenario_id == s.id, TestCase.status != "DEPRECATED")):
            continue
        pr = get_project(db, s.project_id)
        data = testdesign.build_test_case(s.type, req_to_engine(r))
        n = next_seq(db, f"TC-{pr.code}-{r.module}")
        tc_code = f"TC-{pr.code}-{r.module}-{n:03d}"
        if db.scalar(select(TestCase.id).where(TestCase.tc_id == tc_code)):
            raise AppError("DUPLICATE_TEST_CASE_ID", f"Test Case ID ซ้ำ: {tc_code}", status=409)
        t = TestCase(tc_id=tc_code, project_id=pr.id, scenario_id=s.id, requirement_id=r.id, req_version=r.version,
                     source_page=r.source.page if r.source else "NOT_FOUND", source_section=(r.source.section if r.source else "NOT_FOUND")[:400],
                     **{k: data[k] for k in TC_FIELDS})
        _write_tc_children(t, data)
        db.add(t)
        db.flush()
        db.add(TestCaseVersion(test_case_id=t.id, version=1, snapshot=data, kind="AI-generated", changed_by="AI",
                               reason=f"สร้างจาก Scenario {s.ts_id}"))
        created += 1
    audit(db, username, "TESTCASE_GENERATE", ",".join(scenario_ids)[:200], f"{created} created")
    return {"created": created, "blocked": blocked}


@router.post("/test-scenarios/{sid}/test-cases/generate")
def generate_test_cases(sid: str, p: Principal = Depends(require("tc.edit")), db: Session = Depends(get_db)):
    res = generate_test_cases_for(db, [sid], p.username)
    db.commit()
    return res


@router.post("/projects/{project_id}/test-cases/generate")
def generate_test_cases_bulk(project_id: str, body: GenTcIn, p: Principal = Depends(require("tc.edit")), db: Session = Depends(get_db)):
    pr = get_project(db, project_id)
    ids = body.scenario_ids or list(db.scalars(select(TestScenario.id).where(TestScenario.project_id == pr.id, TestScenario.status != "DEPRECATED")))
    res = generate_test_cases_for(db, ids, p.username)
    db.commit()
    return res


@router.get("/projects/{project_id}/test-cases")
def list_test_cases(project_id: str, q: str = "", type: str = "", status: str = "", priority: str = "", sort: str = "tc_id",
                    p: Principal = Depends(require("tc.view")), db: Session = Depends(get_db)):
    pr = get_project(db, project_id)
    stmt = (select(TestCase, TestScenario.ts_id, Requirement.req_id).join(TestScenario, TestScenario.id == TestCase.scenario_id)
            .join(Requirement, Requirement.id == TestCase.requirement_id).where(TestCase.project_id == pr.id))
    if type:
        stmt = stmt.where(TestCase.type == type)
    if status:
        stmt = stmt.where(TestCase.status == status)
    if priority:
        stmt = stmt.where(TestCase.priority == priority)
    if q:
        stmt = stmt.where(or_(TestCase.tc_id.ilike(f"%{q}%"), TestCase.title.ilike(f"%{q}%"), Requirement.req_id.ilike(f"%{q}%")))
    col = {"tc_id": TestCase.tc_id, "priority": TestCase.priority, "status": TestCase.status, "updated": TestCase.updated_at.desc()}.get(sort, TestCase.tc_id)
    return {"items": [testcase_out(t, ts_code=ts, req_code=rc, brief=True) for t, ts, rc in db.execute(stmt.order_by(col))],
            "statuses": TC_STATUSES}


def _tc(db: Session, tid: str) -> TestCase:
    t = db.get(TestCase, tid) or db.scalar(select(TestCase).where(TestCase.tc_id == tid))
    if t is None:
        raise AppError("NOT_FOUND", "ไม่พบ Test Case", status=404)
    return t


@router.get("/test-cases/{tid}")
def get_test_case(tid: str, p: Principal = Depends(require("tc.view")), db: Session = Depends(get_db)):
    t = _tc(db, tid)
    s = db.get(TestScenario, t.scenario_id)
    r = db.get(Requirement, t.requirement_id)
    out = testcase_out(t, ts_code=s.ts_id if s else None, req_code=r.req_id if r else None)
    out["requirement"] = {"id": r.id, "req_id": r.req_id, "status": r.status, "original_text": r.original_text, "version": r.version} if r else None
    out["history"] = [{"version": v.version, "kind": v.kind, "changed_by": v.changed_by, "reason": v.reason, "changes": v.changes,
                       "snapshot": v.snapshot, "created_at": iso(v.created_at)}
                      for v in db.scalars(select(TestCaseVersion).where(TestCaseVersion.test_case_id == t.id).order_by(TestCaseVersion.created_at))]
    out["approvals"] = [{"action": a.action, "username": a.username, "comment": a.comment, "version": a.version, "at": iso(a.at)}
                        for a in db.scalars(select(Approval).where(Approval.entity_id == t.id).order_by(Approval.at))]
    out["comments"] = [{"username": c.username, "text": c.text, "created_at": iso(c.created_at)}
                       for c in db.scalars(select(Comment).where(Comment.entity_id == t.id).order_by(Comment.created_at))]
    return out


@router.patch("/test-cases/{tid}")
def patch_test_case(tid: str, body: TcPatch, p: Principal = Depends(require("tc.edit")), db: Session = Depends(get_db)):
    t = _tc(db, tid)
    if t.locked or t.status in APPROVED_STATES:
        raise AppError("TEST_CASE_LOCKED", "Test Case ที่ Approved ถูก Lock — กด Create New Version ก่อนแก้ไข", status=409)
    before = tc_snapshot(t)
    for k in ("title", "business_explanation", "given", "when", "then", "preconditions", "overall_expected", "priority", "risk",
              "automation_candidate", "automation_tool"):
        v = getattr(body, k)
        if v is not None:
            setattr(t, k, v)
    if body.steps is not None:
        data = before | {"steps": [s.model_dump() for s in body.steps]}
        data["test_data"] = before["test_data"]
        _write_tc_children(t, data)
        db.flush()
    after = tc_snapshot(t)
    changes = [{"field": k, "old": before[k], "new": after[k]} for k in after if before.get(k) != after[k]]
    if not changes:
        return testcase_out(t)
    db.add(TestCaseVersion(test_case_id=t.id, version=t.version, snapshot=after, changes=changes, kind="Human-edited",
                           changed_by=p.username, reason=body.reason))
    t.edited_by, t.updated_at = p.username, now()
    if t.status in ("AI_GENERATED", "DRAFT"):
        t.status = "WAITING_FOR_REVIEW"
    audit(db, p.username, "TESTCASE_EDIT", t.tc_id, body.reason)
    db.commit()
    return testcase_out(t)


def set_tc_status(db: Session, t: TestCase, st: str, username: str, comment: str = "") -> None:
    if st not in TC_STATUSES:
        raise AppError("VALIDATION", "Status ไม่ถูกต้อง")
    prev = t.status
    if st == "APPROVED":
        r = db.get(Requirement, t.requirement_id)
        if r is None or r.status != "APPROVED":
            raise AppError("REQUIREMENT_NOT_APPROVED", f"{t.tc_id}: Requirement ยังไม่ Approved ({r.status if r else '-'}) จึงอนุมัติไม่ได้", status=409)
        t.status, t.locked, t.approved_by, t.approved_at, t.reviewer = "APPROVED", True, username, now(), username
    elif st in ("READY_FOR_AUTOMATION", "AUTOMATED"):
        if prev not in APPROVED_STATES:
            raise AppError("NOT_APPROVED", "ต้อง Approve ก่อน", status=409)
        t.status = st
    else:
        if t.locked:
            raise AppError("TEST_CASE_LOCKED", "Test Case ที่ Approved ถูก Lock — กด Create New Version ก่อน", status=409)
        t.status = st
    t.updated_at = now()
    action = {"APPROVED": "APPROVE", "WAITING_FOR_REVIEW": "REJECT"}.get(st, st)
    db.add(Approval(entity_type="test_case", entity_id=t.id, version=t.version, action=action, username=username,
                    comment=f"{prev} → {st}. {comment}".strip()))
    audit(db, username, "TESTCASE_" + st, t.tc_id, comment)


@router.post("/test-cases/{tid}/approve")
def approve_test_case(tid: str, body: TcStatusIn | None = None, p: Principal = Depends(require("tc.approve")), db: Session = Depends(get_db)):
    t = _tc(db, tid)
    set_tc_status(db, t, "APPROVED", p.username, body.comment if body else "")
    db.commit()
    return testcase_out(t)


@router.post("/test-cases/{tid}/status")
def change_tc_status(tid: str, body: TcStatusIn, p: Principal = Depends(require("tc.approve")), db: Session = Depends(get_db)):
    """Reject (→ WAITING_FOR_REVIEW), NEEDS_CLARIFICATION, READY_FOR_AUTOMATION, DEPRECATED."""
    t = _tc(db, tid)
    set_tc_status(db, t, body.status, p.username, body.comment)
    db.commit()
    return testcase_out(t)


@router.post("/test-cases/bulk-status")
def bulk_status(body: BulkIn, p: Principal = Depends(require("tc.approve")), db: Session = Depends(get_db)):
    ok, errors = 0, []
    for tid in body.ids:
        try:
            set_tc_status(db, _tc(db, tid), body.status, p.username, body.comment)
            ok += 1
        except AppError as e:
            errors.append(e.user_message)
    db.commit()
    return {"updated": ok, "errors": errors}


@router.post("/test-cases/{tid}/new-version")
def new_version(tid: str, body: CommentIn, p: Principal = Depends(require("tc.edit")), db: Session = Depends(get_db)):
    """Approved test case stays readable; v+1 is unlocked as REVISED and must be re-approved (หัวข้อ 16)."""
    t = _tc(db, tid)
    snap = tc_snapshot(t)
    db.add(TestCaseVersion(test_case_id=t.id, version=t.version, snapshot=snap, kind="Approved snapshot", changed_by=p.username,
                           reason=f"เก็บ v{t.version} ก่อนสร้าง Version ใหม่: {body.text}"))
    prev = t.status
    t.version += 1
    t.locked, t.status, t.approved_by, t.approved_at = False, "REVISED", None, None
    db.add(Approval(entity_type="test_case", entity_id=t.id, version=t.version, action="NEW_VERSION", username=p.username,
                    comment=f"{prev} → REVISED. {body.text}"))
    audit(db, p.username, "TESTCASE_NEW_VERSION", t.tc_id, f"v{t.version}: {body.text}")
    db.commit()
    return testcase_out(t)


@router.post("/test-cases/{tid}/comments")
def tc_comment(tid: str, body: CommentIn, p: Principal = Depends(require("comment")), db: Session = Depends(get_db)):
    t = _tc(db, tid)
    db.add(Comment(project_id=t.project_id, entity_type="test_case", entity_id=t.id, username=p.username, text=mask(body.text)))
    audit(db, p.username, "COMMENT", t.tc_id)
    db.commit()
    return {"ok": True}


@router.get("/projects/{project_id}/test-cases/export")
def export_excel(project_id: str, p: Principal = Depends(require("tc.export")), db: Session = Depends(get_db)):
    pr = get_project(db, project_id)
    data, key = export_project_xlsx(db, pr, p.username)
    audit(db, p.username, "EXPORT", f"{pr.code} Excel", key)
    db.commit()
    fname = f"{pr.code}_QA_TestCases_{date.today().isoformat()}.xlsx"
    return Response(data, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f'attachment; filename="{fname}"'})


# ------------------------------------------------------------------ traceability (P22)
@router.get("/projects/{project_id}/traceability")
def traceability(project_id: str, requirement_id: str | None = None, test_case_id: str | None = None,
                 p: Principal = Depends(require("req.view")), db: Session = Depends(get_db)):
    pr = get_project(db, project_id)
    stmt = select(Requirement).where(Requirement.project_id == pr.id, Requirement.is_latest.is_(True))
    if test_case_id:
        t = _tc(db, test_case_id)
        stmt = stmt.where(Requirement.id == t.requirement_id)
    elif requirement_id:
        stmt = stmt.where(Requirement.id == requirement_id)
    arts = list(db.scalars(select(AutomationArtifact).where(AutomationArtifact.project_id == pr.id)))
    chains = []
    for r in db.scalars(stmt.order_by(Requirement.req_id)):
        doc = db.get(Document, r.document_id) if r.document_id else None
        ver = db.get(DocumentVersion, r.version_id) if r.version_id else None
        sec = db.get(DocumentSection, r.source.section_id) if r.source and r.source.section_id else None
        scen = []
        for s in db.scalars(select(TestScenario).where(TestScenario.requirement_id == r.id)):
            tcs = []
            for t in db.scalars(select(TestCase).where(TestCase.scenario_id == s.id)):
                if test_case_id and t.id != _tc(db, test_case_id).id:
                    continue
                runs = db.execute(select(TestRunResult, TestRun).join(TestRun, TestRun.id == TestRunResult.run_id)
                                  .where(TestRunResult.test_case_id == t.id).order_by(TestRun.started_at.desc()).limit(5)).all()
                tcs.append({"id": t.id, "tc_id": t.tc_id, "version": t.version, "status": t.status,
                            "artifacts": [{"id": a.id, "kind": a.kind, "name": a.name, "is_draft": a.is_draft} for a in arts if t.id in (a.test_case_ids or [])],
                            "results": [{"run_id": run.id, "status": res.status, "name": res.name, "at": iso(run.started_at)} for res, run in runs]})
            scen.append({"id": s.id, "ts_id": s.ts_id, "type": s.type, "status": s.status, "test_cases": tcs})
        chains.append({"document": {"id": doc.id, "name": doc.name} if doc else None, "version": ver.version if ver else r.doc_version,
                       "section": {"id": sec.id, "title": sec.title, "page": sec.page} if sec else {"title": r.source.section if r.source else None},
                       "requirement": {"id": r.id, "req_id": r.req_id, "status": r.status, "title": r.title, "version": r.version},
                       "scenarios": scen})
    return {"project": pr.code, "chains": chains}
