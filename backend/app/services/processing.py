"""Document Processing Pipeline (หัวข้อ 6, 31) — background job, ราย Section.

Stages: UPLOADED → EXTRACTING → NORMALIZING → CREATING_SECTIONS → ANALYZING_REQUIREMENTS →
        DETECTING_CONFLICTS → GENERATING_QUESTIONS → READY_FOR_REVIEW | FAILED | CANCELLED

- Each section result is committed immediately; a failed section does not stop the job.
- retry(only_failed) / retry(section_ids) / resume() re-run only the needed sections.
- Version N>1: unchanged sections/requirements are carried over; new requirements `supersede`
  unmatched old ones; impact proposals are generated (services/compare.py).
Port of startAnalysis() in 04_source/p5_pages_a.js.
"""
from __future__ import annotations

import re
import time
import traceback

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.errors import AppError
from ..core.masking import mask
from ..models import (
    Document, DocumentImage, DocumentSection, DocumentVersion, ProcessingJob, ProcessingJobSection, Project, Requirement,
    RequirementConflict,
)
from ..repositories import apply_engine_to_req, audit, new_requirement_row, next_seq, now, req_to_engine
from .ai_provider import get_provider
from .engine.analysis import analyze_quality, build_requirement, detect_conflicts, module_from
from .engine.parsers import parse_document
from .engine.text import blocks_to_sections
from .storage import get_storage

STAGES = ["UPLOADED", "EXTRACTING", "NORMALIZING", "CREATING_SECTIONS", "ANALYZING_REQUIREMENTS", "DETECTING_CONFLICTS",
          "GENERATING_QUESTIONS", "READY_FOR_REVIEW"]
IMG_EXT = {"image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/bmp": "bmp", "image/x-emf": "emf", "image/x-wmf": "wmf"}


def _log(job: ProcessingJob, msg: str) -> None:
    job.log = (job.log or []) + [f"{now().isoformat(timespec='seconds')} {mask(msg)}"]
    if len(job.log) > 2000:
        job.log = job.log[-1800:]


def _stage(db: Session, job: ProcessingJob, stage: str, progress: int | None = None) -> None:
    job.stage = stage
    job.status = "RUNNING"
    if progress is not None:
        job.progress = progress
    _log(job, f"Stage → {stage}")
    db.commit()


def extract_and_section(db: Session, job: ProcessingJob) -> None:
    v = db.get(DocumentVersion, job.version_id)
    doc = db.get(Document, v.document_id)
    st = get_storage()
    _stage(db, job, "EXTRACTING", 5)
    data = st.read_bytes(v.storage_path)
    parsed = parse_document(data, v.ext)
    v.warnings, v.page_count, v.encoding = parsed["warnings"], parsed["page_count"], parsed["encoding"][:40]
    _log(job, f"Extracted {len(parsed['blocks'])} blocks, {len(parsed['images'])} images ({', '.join(parsed['warnings'])})")
    _stage(db, job, "NORMALIZING", 10)
    _stage(db, job, "CREATING_SECTIONS", 15)
    sections = blocks_to_sections(parsed["blocks"], doc.name)
    img_section: dict[str, str] = {}
    for s in sections:
        db.add(DocumentSection(id=s["id"], version_id=v.id, seq=s["seq"], title=s["title"][:400],
                               parent_title=(s.get("parent_title") or None) and s["parent_title"][:400], kind=s["kind"],
                               page=s.get("page"), page_end=s.get("page_end"), text=s["text"], original_text=s["original_text"],
                               rows=s.get("rows"), comments=s.get("comments") or [], row_offset=s.get("row_offset") or 1,
                               overlap=bool(s.get("overlap"))))
        db.add(ProcessingJobSection(job_id=job.id, section_id=s["id"]))
        for iid in s.get("image_ids") or []:
            img_section.setdefault(iid, s["id"])
    for im in parsed["images"]:
        ext = IMG_EXT.get(im["content_type"], "bin")
        key = f"images/{doc.id}/v{v.version}/{im['id']}.{ext}"
        st.write_bytes(key, im["blob"])
        db.add(DocumentImage(id=im["id"], version_id=v.id, section_id=img_section.get(im["id"]), content_type=im["content_type"],
                             storage_path=key, alt=im.get("alt", ""), caption=im.get("caption", ""), near_text=im.get("near_text", ""),
                             status="NEEDS_VISUAL_REVIEW"))
    v.status = "EXTRACTED"
    _log(job, f"Created {len(sections)} sections")
    db.commit()


def _norm(t: str) -> str:
    return re.sub(r"\s+", " ", str(t)).strip()


def _analyze_section(db: Session, job: ProcessingJob, js: ProcessingJobSection, project: Project, doc: Document,
                     v: DocumentVersion, prev: DocumentVersion | None, provider, username: str) -> int:
    sec = db.get(DocumentSection, js.section_id)
    old = list(db.scalars(select(Requirement).where(Requirement.version_id == v.id, Requirement.source.has(section_id=sec.id))))
    if any(r.status == "APPROVED" for r in old):
        raise AppError("SECTION_HAS_APPROVED", "Section นี้มี Requirement ที่ Approved แล้ว จึงไม่ประมวลผลซ้ำ",
                       action="แก้ไข Requirement ผ่าน Requirement Explorer แทน")
    for r in old:
        db.delete(r)
    db.flush()
    sec_d = {"id": sec.id, "title": sec.title, "parent_title": sec.parent_title, "page": sec.page, "page_end": sec.page_end,
             "kind": sec.kind, "text": sec.text, "rows": sec.rows, "row_offset": sec.row_offset}
    # carry over unchanged section from previous version
    prev_sec = None
    if prev is not None:
        prev_sec = db.scalar(select(DocumentSection).where(DocumentSection.version_id == prev.id, DocumentSection.title == sec.title))
    if prev_sec is not None and prev_sec.text == sec.text:
        carried = list(db.scalars(select(Requirement).where(Requirement.document_id == doc.id, Requirement.is_latest.is_(True))
                                  .where(Requirement.source.has(section_id=prev_sec.id))))
        for r in carried:
            r.source.section_id, r.version_id, r.doc_version = sec.id, v.id, v.version
            if sec.page is not None:
                r.source.page = str(sec.page)
        _log(job, f"Section {sec.seq} unchanged from v{prev.version}: carried {len(carried)} requirements")
        return len(carried)

    img = db.scalar(select(DocumentImage).where(DocumentImage.section_id == sec.id))
    module = module_from(sec.parent_title or sec.title, doc.default_module or "GENERAL")
    ctx = {"project_code": project.code, "module": module, "section": sec_d, "doc_name": doc.name,
           "screenshot_id": img.id if img else None}
    items = provider.extract(sec_d)
    created = [build_requirement(ctx, it["stmt"], it["fields"], it["meta"], lambda k: next_seq(db, k)) for it in items]
    kept: list[Requirement] = []
    if prev_sec is not None:
        olds = list(db.scalars(select(Requirement).where(Requirement.document_id == doc.id, Requirement.is_latest.is_(True))
                               .where(Requirement.source.has(section_id=prev_sec.id))))
        remaining = []
        for c in created:
            o = next((x for x in olds if _norm(x.original_text) == _norm(c["original_text"])), None)
            if o is not None and o not in kept:
                o.source.section_id, o.version_id, o.doc_version = sec.id, v.id, v.version
                kept.append(o)
            else:
                remaining.append(c)
        created = remaining
        unmatched = [o.id for o in olds if o not in kept]
        for c in created:
            c["supersedes"] = unmatched
    for c in created:
        db.add(new_requirement_row(c, project_id=project.id, document_id=doc.id, version_id=v.id, doc_version=v.version,
                                   created_by=username))
    if kept:
        _log(job, f"Section {sec.seq}: {len(kept)} requirements unchanged (carried over)")
    _log(job, f'Section {sec.seq} "{sec.title}" → {len(created)} requirements')
    return len(created) + len(kept)


def run_conflict_detection(db: Session, project_id: str) -> int:
    reqs = list(db.scalars(select(Requirement).where(Requirement.project_id == project_id, Requirement.is_latest.is_(True),
                                                     Requirement.status != "DEPRECATED")))
    existing = [{"a": c.req_a_id, "b": c.req_b_id, "status": c.status}
                for c in db.scalars(select(RequirementConflict).where(RequirementConflict.project_id == project_id))]
    eng = [req_to_engine(r) for r in reqs]
    found, dups = detect_conflicts(eng, existing)
    byid = {r.id: r for r in reqs}
    for c in found:
        db.add(RequirementConflict(id=c["id"], project_id=project_id, req_a_id=c["a"], req_b_id=c["b"], similarity=c["similarity"],
                                   diffs=c["diffs"], status="OPEN", history=[{"at": now().isoformat(), "by": "system", "action": "DETECTED"}]))
        for rid in (c["a"], c["b"]):
            byid[rid].conflict_status = "OPEN"
            byid[rid].status = "CONFLICT"
    for rid, orig in dups.items():
        byid[rid].duplicate_of = orig
    # refresh scores (duplicates penalise clarity) for non-final requirements
    for r in reqs:
        if r.status not in ("APPROVED", "DEPRECATED"):
            d = req_to_engine(r)
            q = analyze_quality(d)
            r.completeness_score, r.completeness_reasons = q["completeness"]["score"], q["completeness"]["reasons"]
            r.clarity_score, r.clarity_reasons = q["clarity"]["score"], q["clarity"]["reasons"]
    db.flush()
    return len(found)


def run_job(db: Session, job_id: str, *, only_failed: bool = False, section_ids: list[str] | None = None,
            username: str = "system") -> ProcessingJob:
    job = db.get(ProcessingJob, job_id)
    if job is None:
        raise AppError("NOT_FOUND", "ไม่พบ Job", status=404)
    v = db.get(DocumentVersion, job.version_id)
    doc = db.get(Document, v.document_id)
    project = db.get(Project, doc.project_id)
    job.cancel_requested = False
    job.error = None
    job.finished_at = None
    try:
        if not db.scalar(select(ProcessingJobSection.id).where(ProcessingJobSection.job_id == job.id).limit(1)):
            extract_and_section(db, job)
    except AppError as e:
        job.status, job.stage, job.error = "FAILED", "FAILED", e.to_dict(include_technical=True)
        v.status = "FAILED"
        _log(job, f"FAILED {e.code}: {e.technical or e.user_message}")
        job.finished_at = now()
        db.commit()
        return job
    except Exception as e:  # noqa: BLE001
        err = AppError("CORRUPT_FILE", "อ่านเอกสารไม่สำเร็จ", technical=f"{e}\n{traceback.format_exc()[-800:]}")
        job.status, job.stage, job.error = "FAILED", "FAILED", err.to_dict(include_technical=True)
        v.status = "FAILED"
        job.finished_at = now()
        _log(job, f"FAILED {err.code}: {e}")
        db.commit()
        return job

    try:
        provider = get_provider(job.ai_mode)
    except AppError as e:
        _log(job, f"{e.code}: {e.user_message} — ใช้ Rule Engine แทน")
        job.ai_mode = "rule"
        provider = get_provider("rule")
    prev = db.scalar(select(DocumentVersion).where(DocumentVersion.document_id == doc.id, DocumentVersion.version == v.version - 1))
    _stage(db, job, "ANALYZING_REQUIREMENTS")
    all_js = list(db.scalars(select(ProcessingJobSection).where(ProcessingJobSection.job_id == job.id)
                             .join(DocumentSection, DocumentSection.id == ProcessingJobSection.section_id).order_by(DocumentSection.seq)))
    if section_ids:
        targets = [j for j in all_js if j.section_id in section_ids]
    elif only_failed:
        targets = [j for j in all_js if j.status == "FAILED"]
    else:
        targets = [j for j in all_js if j.status != "DONE"]
    _log(job, f"Start analysis (mode={job.ai_mode}, sections={len(targets)})")
    cancelled = False
    for js in targets:
        db.refresh(job)
        if job.cancel_requested:
            cancelled = True
            break
        js.status, js.error = "RUNNING", None
        js.attempts += 1
        db.commit()
        t0 = time.monotonic()
        try:
            js.req_count = _analyze_section(db, job, js, project, doc, v, prev, provider, username)
            js.status = "DONE"
        except AppError as e:
            db.rollback()
            js = db.get(ProcessingJobSection, js.id)
            js.status, js.error = "FAILED", e.to_dict(include_technical=True)
            _log(job, f"Section FAILED {e.code}: {e.technical or e.user_message}")
        except Exception as e:  # noqa: BLE001
            db.rollback()
            js = db.get(ProcessingJobSection, js.id)
            err = AppError("DOCUMENT_SECTION_FAILED", "วิเคราะห์ Section ไม่สำเร็จ", technical=str(e), retryable=True, action="กด Retry Section")
            js.status, js.error = "FAILED", err.to_dict(include_technical=True)
            _log(job, f"Section FAILED {err.code}: {e}")
        js.updated_at = now()
        done = sum(1 for x in all_js if x.status == "DONE")
        job.progress = 15 + round(done / max(1, len(all_js)) * 70)
        _log(job, f"section {js.section_id[:8]} {js.status} in {int((time.monotonic() - t0) * 1000)} ms")
        db.commit()

    if cancelled:
        job.status, job.stage = "CANCELLED", "CANCELLED"
        _log(job, "Cancelled by user — use Resume Job to continue")
        db.commit()
        return job
    _stage(db, job, "DETECTING_CONFLICTS", 90)
    n = run_conflict_detection(db, project.id)
    _log(job, f"Conflict detection: {n} new conflicts")
    _stage(db, job, "GENERATING_QUESTIONS", 95)
    if prev is not None:
        from .compare import build_impact_proposals
        build_impact_proposals(db, doc, prev, v, username)
        _log(job, f"Impact proposals generated v{prev.version} → v{v.version}")
    failed = sum(1 for x in all_js if x.status == "FAILED")
    job.status = "FAILED" if failed else "READY_FOR_REVIEW"
    job.stage = "FAILED" if failed else "READY_FOR_REVIEW"
    job.progress = 100 if not failed else job.progress
    v.status = job.status
    job.finished_at = now()
    _log(job, f"{failed} sections failed — use Retry Failed Only" if failed else "Ready for Review")
    audit(db, username, "PROCESS_DONE", f"{doc.name} v{v.version}", job.status)
    db.commit()
    return job
