"""ORM → JSON dicts (camel-free snake_case). Secrets never appear here."""
from __future__ import annotations

from ..core.rbac import ROLES, perms_for
from ..models import (
    AutomationArtifact, Document, DocumentVersion, GithubActionRequest, ProcessingJob, Project, Requirement,
    RequirementConflict, TestCase, TestRun, TestScenario, User,
)
from ..repositories import FIELD_COLS


def iso(dt) -> str | None:
    return dt.isoformat() if dt else None


def user_out(u: User) -> dict:
    return {"id": u.id, "username": u.username, "name": u.name, "roles": u.role_codes,
            "role_names": [ROLES.get(r, r) for r in u.role_codes], "active": u.active,
            "must_change_password": u.must_change_password, "permissions": perms_for(u.role_codes),
            "last_login_at": iso(u.last_login_at), "created_at": iso(u.created_at)}


def project_out(p: Project, stats: dict | None = None) -> dict:
    return {"id": p.id, "code": p.code, "name": p.name, "description": p.description, "module_codes": p.module_codes or [],
            "created_by": p.created_by, "created_at": iso(p.created_at), "updated_at": iso(p.updated_at), **(stats or {})}


def version_out(v: DocumentVersion, job: ProcessingJob | None = None) -> dict:
    return {"id": v.id, "version": v.version, "filename": v.filename, "ext": v.ext, "size": v.size, "sha256": v.sha256,
            "encoding": v.encoding, "page_count": v.page_count, "warnings": v.warnings or [], "ai_mode": v.ai_mode,
            "status": v.status, "created_by": v.created_by, "created_at": iso(v.created_at),
            "job": job_out(job) if job else None}


def job_out(j: ProcessingJob) -> dict:
    return {"id": j.id, "status": j.status, "stage": j.stage, "progress": j.progress, "ai_mode": j.ai_mode,
            "cancel_requested": j.cancel_requested, "error": j.error, "started_at": iso(j.started_at),
            "finished_at": iso(j.finished_at)}


def document_out(d: Document, versions: list[dict] | None = None) -> dict:
    return {"id": d.id, "project_id": d.project_id, "name": d.name, "default_module": d.default_module,
            "latest_version": d.latest_version, "created_by": d.created_by, "created_at": iso(d.created_at),
            "versions": versions or []}


def requirement_out(r: Requirement, brief: bool = False) -> dict:
    s = r.source
    out = {
        "id": r.id, "req_id": r.req_id, "project_id": r.project_id, "document_id": r.document_id, "doc_version": r.doc_version,
        "version": r.version, "type": r.type, "module": r.module, "submodule": r.submodule, "title": r.title,
        "status": r.status, "conflict_status": r.conflict_status, "completeness_score": r.completeness_score,
        "clarity_score": r.clarity_score, "ai_confidence": r.ai_confidence, "origin": r.origin, "is_latest": r.is_latest,
        "duplicate_of": r.duplicate_of,
        "source": {"document_name": s.document_name if s else None, "page": s.page if s else "NOT_FOUND",
                   "page_end": s.page_end if s else None, "section": s.section if s else None,
                   "section_id": s.section_id if s else None, "table": s.table_ref if s else "NOT_FOUND",
                   "screenshot_id": s.screenshot_id if s else "NOT_FOUND"},
        "open_questions": sum(1 for q in r.questions if not q.resolved),
        "updated_at": iso(r.updated_at),
    }
    if brief:
        return out
    out.update({
        "original_text": r.original_text, "normalized_text": r.normalized_text,
        "fields": {c: getattr(r, c) for c in FIELD_COLS},
        "completeness_reasons": r.completeness_reasons, "clarity_reasons": r.clarity_reasons,
        "ai_meta": r.ai_meta, "source_unverified": r.source_unverified, "supersedes": r.supersedes or [],
        "created_by": r.created_by, "reviewed_by": r.reviewed_by, "approved_by": r.approved_by, "created_at": iso(r.created_at),
        "questions": [{"id": q.id, "key": q.key, "text": q.text, "answer": q.answer, "resolved": q.resolved, "field": q.field,
                       "answered_by": q.answered_by, "resolved_by": q.resolved_by, "resolved_at": iso(q.resolved_at),
                       "assumption": ({"id": q.assumption.id, "label": q.assumption.label, "text": q.assumption.text,
                                       "state": q.assumption.state, "edited_by": q.assumption.edited_by} if q.assumption else None)}
                      for q in r.questions],
        "ai_output": {  # หัวข้อ 32 structure
            "found_in_brs": [f"{k}: {getattr(r, k)}" for k in FIELD_COLS if getattr(r, k) not in ("NOT_FOUND", False, True, "")],
            "assumptions": [q.assumption.text for q in r.questions if q.assumption],
            "recommendations": (r.ai_meta or {}).get("recommendations", []),
            "clarification_questions": [q.text for q in r.questions if not q.resolved],
            "conflicts": [], "source_references": [f"{s.document_name} หน้า {s.page} / {s.section}" if s else "NOT_FOUND"],
            "confidence": r.ai_confidence,
        },
    })
    return out


def conflict_out(c: RequirementConflict, a: Requirement | None, b: Requirement | None) -> dict:
    side = lambda r: requirement_out(r) if r else None  # noqa: E731
    return {"id": c.id, "project_id": c.project_id, "similarity": c.similarity, "diffs": c.diffs, "status": c.status,
            "resolution": c.resolution, "reason": c.reason, "resolved_by": c.resolved_by, "resolved_at": iso(c.resolved_at),
            "history": c.history, "a": side(a), "b": side(b), "created_at": iso(c.created_at)}


def scenario_out(s: TestScenario, req_code: str | None = None) -> dict:
    return {"id": s.id, "ts_id": s.ts_id, "project_id": s.project_id, "requirement_id": s.requirement_id, "req_id": req_code,
            "title": s.title, "description": s.description, "objective": s.objective, "type": s.type, "priority": s.priority,
            "risk": s.risk, "pr_reasons": s.pr_reasons, "source_page": s.source_page, "source_section": s.source_section,
            "rationale": s.rationale, "status": s.status, "version": s.version, "reviewer": s.reviewer,
            "approved_at": iso(s.approved_at), "created_at": iso(s.created_at)}


TC_FIELDS = ["title", "description", "business_explanation", "given", "when", "then", "preconditions", "overall_expected",
             "type", "priority", "risk", "pr_reasons", "origin", "automation_candidate", "automation_tool", "assumption",
             "clarification_ref"]


def tc_snapshot(t: TestCase) -> dict:
    d = {k: getattr(t, k) for k in TC_FIELDS}
    d["steps"] = [{"n": s.step_no, "action": s.action, "data": s.test_data, "expected": s.expected, "origin": s.origin, "label": s.label} for s in t.steps]
    d["test_data"] = [{"value": x.value, "raw": x.raw, "expected": x.expected, "origin": x.origin, "note": x.note, "label": x.label} for x in t.data_rows]
    return d


def testcase_out(t: TestCase, *, ts_code: str | None = None, req_code: str | None = None, brief: bool = False) -> dict:
    out = {"id": t.id, "tc_id": t.tc_id, "project_id": t.project_id, "scenario_id": t.scenario_id, "ts_id": ts_code,
           "requirement_id": t.requirement_id, "req_id": req_code, "req_version": t.req_version, "version": t.version,
           "status": t.status, "locked": t.locked, "title": t.title, "type": t.type, "priority": t.priority, "risk": t.risk,
           "automation_candidate": t.automation_candidate, "automation_tool": t.automation_tool, "edited_by": t.edited_by,
           "approved_by": t.approved_by, "approved_at": iso(t.approved_at), "source_page": t.source_page,
           "source_section": t.source_section, "updated_at": iso(t.updated_at), "given": t.given, "when": t.when, "then": t.then}
    if not brief:
        out.update(tc_snapshot(t))
        out["reviewer"] = t.reviewer
        out["created_at"] = iso(t.created_at)
    return out


def artifact_out(a: AutomationArtifact) -> dict:
    return {"id": a.id, "project_id": a.project_id, "kind": a.kind, "name": a.name, "test_case_ids": a.test_case_ids,
            "tc_codes": a.tc_codes, "is_draft": a.is_draft, "edited": a.edited, "status": a.status, "files": a.files,
            "tips": a.tips, "options": a.options, "scan_problems": a.scan_problems, "created_by": a.created_by,
            "created_at": iso(a.created_at), "updated_at": iso(a.updated_at)}


def run_out(r: TestRun, with_logs: bool = False) -> dict:
    out = {"id": r.id, "project_id": r.project_id, "artifact_id": r.artifact_id, "source": r.source, "status": r.status,
           "progress": r.progress, "exit_code": r.exit_code, "summary": r.summary, "duration": r.duration,
           "triggered_by": r.triggered_by, "started_at": iso(r.started_at), "finished_at": iso(r.finished_at),
           "cancel_requested": r.cancel_requested,
           "results": [{"id": x.id, "test_case_id": x.test_case_id, "tc_id": x.tc_id, "name": x.name, "status": x.status,
                        "message": x.message, "duration": x.duration} for x in r.results]}
    if with_logs:
        out["stdout"], out["stderr"] = r.stdout, r.stderr
    return out


def gh_out(g: GithubActionRequest) -> dict:
    return {"id": g.id, "project_id": g.project_id, "artifact_id": g.artifact_id, "action_type": g.action_type,
            "repository": g.repository, "branch": g.branch, "base_branch": g.base_branch, "commit_message": g.commit_message,
            "files": g.files, "diff": g.diff, "scan_problems": g.scan_problems, "status": g.status, "proposed_by": g.proposed_by,
            "approved_by": g.approved_by, "approved_at": iso(g.approved_at), "executed_at": iso(g.executed_at),
            "result": g.result, "created_at": iso(g.created_at)}
