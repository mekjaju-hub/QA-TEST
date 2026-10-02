"""Documents & Processing (P05–P07)."""
from __future__ import annotations

import hashlib

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import PlainTextResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..core.errors import AppError
from ..db import get_db
from ..models import (
    Document, DocumentImage, DocumentSection, DocumentVersion, ImpactAnalysis, ProcessingJob, ProcessingJobSection, Requirement,
)
from ..repositories import audit
from ..services.compare import apply_impact, compare_payload
from ..services.engine.parsers import ALLOWED_EXT, ext_of, sniff_type
from ..services.storage import get_storage, safe_filename
from ..services.tasks import enqueue_processing
from .deps import Principal, get_project, require
from .serializers import document_out, job_out, version_out

router = APIRouter(prefix="/api", tags=["documents"])


class PasteIn(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    text: str = Field(min_length=10, max_length=2_000_000)
    document_id: str | None = None
    default_module: str = Field(default="GENERAL", max_length=32)
    ai_mode: str = Field(default="rule", pattern="^(rule|claude)$")
    auto_process: bool = True


class ProcessIn(BaseModel):
    version: int | None = None
    ai_mode: str | None = Field(default=None, pattern="^(rule|claude)$")


class RetryIn(BaseModel):
    version: int | None = None
    section_ids: list[str] | None = None


class ImpactDecisionIn(BaseModel):
    index: int | None = None  # None = all pending
    decision: str = Field(pattern="^(APPROVED|REJECTED)$")


def _store_version(db: Session, *, project, data: bytes, filename: str, ext: str, document_id: str | None, default_module: str,
                   ai_mode: str, username: str) -> tuple[Document, DocumentVersion, ProcessingJob]:
    st = get_settings()
    if len(data) > st.max_upload_mb * 1024 * 1024:
        raise AppError("FILE_TOO_LARGE", f"ไฟล์ใหญ่เกิน {st.max_upload_mb} MB", status=413, action="แยกไฟล์หรือเพิ่ม MAX_UPLOAD_MB")
    if not data:
        raise AppError("EMPTY_FILE", "ไฟล์ว่าง")
    if ext not in ALLOWED_EXT + ["paste"]:
        raise AppError("UNSUPPORTED_FILE", "ไม่รองรับไฟล์ประเภทนี้", technical=ext, action="ใช้ DOCX, XLSX, CSV, PDF หรือ TXT")
    if not sniff_type(data, ext):
        raise AppError("INVALID_FILE_TYPE", "เนื้อหาไฟล์ไม่ตรงกับนามสกุล", technical=ext, action="ตรวจว่าไฟล์ไม่ได้ถูกเปลี่ยนนามสกุล")
    name = safe_filename(filename)
    if document_id:
        doc = db.get(Document, document_id)
        if doc is None or doc.project_id != project.id:
            raise AppError("NOT_FOUND", "ไม่พบเอกสารเดิม", status=404)
    else:
        doc = Document(project_id=project.id, name=name, default_module=(default_module or "GENERAL").upper()[:32], created_by=username)
        db.add(doc)
        db.flush()
    doc.latest_version += 1
    n = doc.latest_version
    key = f"uploads/{project.code}/{doc.id}/v{n}/{name}"
    get_storage().write_bytes(key, data)
    v = DocumentVersion(document_id=doc.id, version=n, filename=name, ext=ext, size=len(data), sha256=hashlib.sha256(data).hexdigest(),
                        storage_path=key, ai_mode=ai_mode, created_by=username)
    db.add(v)
    db.flush()
    job = ProcessingJob(version_id=v.id, ai_mode=ai_mode, status="UPLOADED", stage="UPLOADED", log=[])
    db.add(job)
    audit(db, username, "UPLOAD", f"{project.code}/{name} v{n}", f"sha256={v.sha256[:16]} size={len(data)}")
    db.commit()
    return doc, v, job


@router.post("/projects/{project_id}/documents")
async def upload(project_id: str, file: UploadFile = File(...), document_id: str | None = Form(default=None),
                 default_module: str = Form(default="GENERAL"), ai_mode: str = Form(default="rule"),
                 auto_process: bool = Form(default=True), p: Principal = Depends(require("doc.upload")), db: Session = Depends(get_db)):
    pr = get_project(db, project_id)
    if ai_mode not in ("rule", "claude"):
        raise AppError("VALIDATION", "ai_mode ต้องเป็น rule หรือ claude")
    limit = get_settings().max_upload_mb * 1024 * 1024
    data = await file.read(limit + 1)
    doc, v, job = _store_version(db, project=pr, data=data, filename=file.filename or "document", ext=ext_of(file.filename or ""),
                                 document_id=document_id or None, default_module=default_module, ai_mode=ai_mode, username=p.username)
    if auto_process:
        enqueue_processing(job.id, username=p.username)
    return {"document": document_out(doc), "version": version_out(v, job)}


@router.post("/projects/{project_id}/paste-text")
def paste_text(project_id: str, body: PasteIn, p: Principal = Depends(require("doc.upload")), db: Session = Depends(get_db)):
    pr = get_project(db, project_id)
    title = body.title if body.title.lower().endswith(".txt") else body.title + ".txt"
    doc, v, job = _store_version(db, project=pr, data=body.text.encode("utf-8"), filename=title, ext="txt",
                                 document_id=body.document_id, default_module=body.default_module, ai_mode=body.ai_mode, username=p.username)
    if body.auto_process:
        enqueue_processing(job.id, username=p.username)
    return {"document": document_out(doc), "version": version_out(v, job)}


def _versions(db: Session, doc: Document) -> list[dict]:
    out = []
    for v in db.scalars(select(DocumentVersion).where(DocumentVersion.document_id == doc.id).order_by(DocumentVersion.version)):
        job = db.scalar(select(ProcessingJob).where(ProcessingJob.version_id == v.id).order_by(ProcessingJob.started_at.desc()))
        out.append(version_out(v, job))
    return out


@router.get("/projects/{project_id}/documents")
def list_documents(project_id: str, p: Principal = Depends(require("doc.view")), db: Session = Depends(get_db)):
    pr = get_project(db, project_id)
    return [document_out(d, _versions(db, d)) for d in db.scalars(select(Document).where(Document.project_id == pr.id).order_by(Document.created_at))]


def _doc(db: Session, document_id: str) -> Document:
    d = db.get(Document, document_id)
    if d is None:
        raise AppError("NOT_FOUND", "ไม่พบเอกสาร", status=404)
    return d


def _version(db: Session, doc: Document, version: int | None) -> DocumentVersion:
    n = version or doc.latest_version
    v = db.scalar(select(DocumentVersion).where(DocumentVersion.document_id == doc.id, DocumentVersion.version == n))
    if v is None:
        raise AppError("NOT_FOUND", f"ไม่พบ Version {n}", status=404)
    return v


def _job(db: Session, v: DocumentVersion) -> ProcessingJob:
    j = db.scalar(select(ProcessingJob).where(ProcessingJob.version_id == v.id).order_by(ProcessingJob.started_at.desc()))
    if j is None:
        j = ProcessingJob(version_id=v.id, ai_mode=v.ai_mode, log=[])
        db.add(j)
        db.flush()
    return j


@router.get("/documents/{document_id}")
def get_document(document_id: str, p: Principal = Depends(require("doc.view")), db: Session = Depends(get_db)):
    d = _doc(db, document_id)
    return document_out(d, _versions(db, d))


@router.post("/documents/{document_id}/process")
def process(document_id: str, body: ProcessIn, p: Principal = Depends(require("doc.process")), db: Session = Depends(get_db)):
    d = _doc(db, document_id)
    v = _version(db, d, body.version)
    j = _job(db, v)
    if j.status == "RUNNING":
        raise AppError("JOB_RUNNING", "งานนี้กำลังทำงานอยู่", status=409)
    if body.ai_mode:
        j.ai_mode = v.ai_mode = body.ai_mode
    j.status = "QUEUED"
    audit(db, p.username, "PROCESS", f"{d.name} v{v.version}", f"mode={j.ai_mode}")
    db.commit()
    enqueue_processing(j.id, username=p.username)
    return job_out(j)


@router.post("/documents/{document_id}/retry-failed")
def retry_failed(document_id: str, body: RetryIn, p: Principal = Depends(require("doc.process")), db: Session = Depends(get_db)):
    d = _doc(db, document_id)
    v = _version(db, d, body.version)
    j = _job(db, v)
    if j.status == "RUNNING":
        raise AppError("JOB_RUNNING", "งานนี้กำลังทำงานอยู่", status=409)
    j.status = "QUEUED"
    audit(db, p.username, "PROCESS_RETRY", f"{d.name} v{v.version}", f"sections={body.section_ids or 'failed-only'}")
    db.commit()
    enqueue_processing(j.id, only_failed=not body.section_ids, section_ids=body.section_ids, username=p.username)
    return job_out(j)


@router.post("/documents/{document_id}/cancel")
def cancel(document_id: str, body: ProcessIn, p: Principal = Depends(require("doc.process")), db: Session = Depends(get_db)):
    d = _doc(db, document_id)
    j = _job(db, _version(db, d, body.version))
    j.cancel_requested = True
    audit(db, p.username, "PROCESS_CANCEL", d.name)
    db.commit()
    return job_out(j)


@router.post("/documents/{document_id}/resume")
def resume(document_id: str, body: ProcessIn, p: Principal = Depends(require("doc.process")), db: Session = Depends(get_db)):
    d = _doc(db, document_id)
    j = _job(db, _version(db, d, body.version))
    if j.status == "RUNNING":
        raise AppError("JOB_RUNNING", "งานนี้กำลังทำงานอยู่", status=409)
    j.status = "QUEUED"
    audit(db, p.username, "PROCESS_RESUME", d.name)
    db.commit()
    enqueue_processing(j.id, username=p.username)
    return job_out(j)


@router.get("/documents/{document_id}/progress")
def progress(document_id: str, version: int | None = None, p: Principal = Depends(require("doc.view")), db: Session = Depends(get_db)):
    d = _doc(db, document_id)
    v = _version(db, d, version)
    j = _job(db, v)
    db.commit()
    rows = db.execute(select(DocumentSection, ProcessingJobSection)
                      .join(ProcessingJobSection, ProcessingJobSection.section_id == DocumentSection.id)
                      .where(ProcessingJobSection.job_id == j.id).order_by(DocumentSection.seq)).all()
    images = list(db.scalars(select(DocumentImage).where(DocumentImage.version_id == v.id)))
    return {"document": document_out(d), "version": version_out(v), "job": job_out(j),
            "sections": [{"id": s.id, "seq": s.seq, "title": s.title, "kind": s.kind, "page": s.page, "page_end": s.page_end,
                          "overlap": s.overlap, "status": js.status, "attempts": js.attempts, "error": js.error,
                          "req_count": js.req_count} for s, js in rows],
            "images": [{"id": i.id, "section_id": i.section_id, "caption": i.caption, "alt": i.alt, "near_text": i.near_text,
                        "status": i.status, "content_type": i.content_type} for i in images],
            "log_tail": (j.log or [])[-50:]}


@router.get("/documents/{document_id}/log", response_class=PlainTextResponse)
def download_log(document_id: str, version: int | None = None, p: Principal = Depends(require("doc.view")), db: Session = Depends(get_db)):
    d = _doc(db, document_id)
    j = _job(db, _version(db, d, version))
    audit(db, p.username, "DOWNLOAD", f"processing log {d.name}")
    db.commit()
    return PlainTextResponse("\n".join(j.log or []), headers={"Content-Disposition": f'attachment; filename="processing_{d.id[:8]}.log"'})


@router.get("/sections/{section_id}")
def get_section(section_id: str, p: Principal = Depends(require("doc.view")), db: Session = Depends(get_db)):
    s = db.get(DocumentSection, section_id)
    if s is None:
        raise AppError("NOT_FOUND", "ไม่พบ Section", status=404)
    reqs = list(db.scalars(select(Requirement).where(Requirement.source.has(section_id=s.id))))
    return {"id": s.id, "seq": s.seq, "title": s.title, "kind": s.kind, "page": s.page, "page_end": s.page_end, "text": s.text,
            "original_text": s.original_text, "rows": s.rows, "comments": s.comments,
            "requirements": [{"id": r.id, "req_id": r.req_id, "status": r.status} for r in reqs]}


@router.get("/images/{image_id}")
def get_image(image_id: str, p: Principal = Depends(require("doc.view")), db: Session = Depends(get_db)):
    im = db.get(DocumentImage, image_id)
    if im is None:
        raise AppError("NOT_FOUND", "ไม่พบรูปภาพ", status=404)
    return Response(get_storage().read_bytes(im.storage_path), media_type=im.content_type,
                    headers={"Cache-Control": "private, max-age=3600"})


@router.get("/documents/{document_id}/compare")
def compare(document_id: str, from_version: int, to_version: int, p: Principal = Depends(require("doc.view")), db: Session = Depends(get_db)):
    return compare_payload(db, _doc(db, document_id), from_version, to_version)


@router.post("/impact/{impact_id}/decide")
def decide_impact(impact_id: str, body: ImpactDecisionIn, p: Principal = Depends(require("impact.approve")), db: Session = Depends(get_db)):
    ia = db.get(ImpactAnalysis, impact_id)
    if ia is None:
        raise AppError("NOT_FOUND", "ไม่พบ Impact Analysis", status=404)
    apply_impact(db, ia, body.index, body.decision, p.username)
    db.commit()
    return {"id": ia.id, "items": ia.items, "status": ia.status, "retest": ia.retest}
