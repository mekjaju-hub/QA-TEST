"""SQLAlchemy models — 40 tables (หัวข้อ 34 + id_sequences, impact_analyses).

Conventions
- Primary key: UUID string (portable across PostgreSQL / SQLite dev mode)
- Business IDs (REQ-/TS-/TC-) are separate unique columns
- NOT_FOUND is stored literally when a value is absent in the BRS (หัวข้อ 32)
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db import Base

NF = "NOT_FOUND"


def uid() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _id() -> Mapped[str]:
    return mapped_column(String(36), primary_key=True, default=uid)


def _ts() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


# ---------------------------------------------------------------- Users / RBAC
class Role(Base):
    __tablename__ = "roles"
    id: Mapped[str] = _id()
    code: Mapped[str] = mapped_column(String(32), unique=True)  # ADMIN | QA_MANUAL | QA_AUTOMATION | BA
    name: Mapped[str] = mapped_column(String(64))


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = _id()
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(128), default="")
    password_hash: Mapped[str] = mapped_column(String(128))
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = _ts()
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    roles: Mapped[list[Role]] = relationship(secondary="user_roles", lazy="selectin")

    @property
    def role_codes(self) -> list[str]:
        return [r.code for r in self.roles]


class UserRole(Base):
    __tablename__ = "user_roles"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    role_id: Mapped[str] = mapped_column(ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True)


# ---------------------------------------------------------------- Projects
class Project(Base):
    __tablename__ = "projects"
    id: Mapped[str] = _id()
    code: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    module_codes: Mapped[list] = mapped_column(JSON, default=list)
    created_by: Mapped[str] = mapped_column(String(64), default="system")
    created_at: Mapped[datetime] = _ts()
    updated_at: Mapped[datetime] = _ts()


class ProjectMember(Base):
    __tablename__ = "project_members"
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    role_code: Mapped[str] = mapped_column(String(32))


class IdSequence(Base):
    """Running numbers for REQ-/TS-/TC- IDs per (project, module)."""
    __tablename__ = "id_sequences"
    key: Mapped[str] = mapped_column(String(120), primary_key=True)
    value: Mapped[int] = mapped_column(Integer, default=0)


# ---------------------------------------------------------------- Documents
class Document(Base):
    __tablename__ = "documents"
    id: Mapped[str] = _id()
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    default_module: Mapped[str] = mapped_column(String(32), default="GENERAL")
    latest_version: Mapped[int] = mapped_column(Integer, default=0)
    created_by: Mapped[str] = mapped_column(String(64), default="system")
    created_at: Mapped[datetime] = _ts()
    versions: Mapped[list["DocumentVersion"]] = relationship(back_populates="document", order_by="DocumentVersion.version")


class DocumentVersion(Base):
    __tablename__ = "document_versions"
    __table_args__ = (UniqueConstraint("document_id", "version"),)
    id: Mapped[str] = _id()
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    filename: Mapped[str] = mapped_column(String(200))
    ext: Mapped[str] = mapped_column(String(10))
    size: Mapped[int] = mapped_column(Integer, default=0)
    sha256: Mapped[str] = mapped_column(String(64))
    storage_path: Mapped[str] = mapped_column(String(400))
    encoding: Mapped[str] = mapped_column(String(40), default="")
    page_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    warnings: Mapped[list] = mapped_column(JSON, default=list)
    ai_mode: Mapped[str] = mapped_column(String(16), default="rule")
    status: Mapped[str] = mapped_column(String(32), default="UPLOADED")
    created_by: Mapped[str] = mapped_column(String(64), default="system")
    created_at: Mapped[datetime] = _ts()
    document: Mapped[Document] = relationship(back_populates="versions")


class DocumentSection(Base):
    __tablename__ = "document_sections"
    id: Mapped[str] = _id()
    version_id: Mapped[str] = mapped_column(ForeignKey("document_versions.id", ondelete="CASCADE"), index=True)
    seq: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(400))
    parent_title: Mapped[str | None] = mapped_column(String(400), nullable=True)
    kind: Mapped[str] = mapped_column(String(10), default="text")  # text | table
    page: Mapped[int | None] = mapped_column(Integer, nullable=True)
    page_end: Mapped[int | None] = mapped_column(Integer, nullable=True)
    text: Mapped[str] = mapped_column(Text, default="")
    original_text: Mapped[str] = mapped_column(Text, default="")
    rows: Mapped[list | None] = mapped_column(JSON, nullable=True)
    comments: Mapped[list] = mapped_column(JSON, default=list)
    row_offset: Mapped[int] = mapped_column(Integer, default=1)
    overlap: Mapped[bool] = mapped_column(Boolean, default=False)


class DocumentImage(Base):
    __tablename__ = "document_images"
    id: Mapped[str] = _id()
    version_id: Mapped[str] = mapped_column(ForeignKey("document_versions.id", ondelete="CASCADE"), index=True)
    section_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    content_type: Mapped[str] = mapped_column(String(64))
    storage_path: Mapped[str] = mapped_column(String(400))
    alt: Mapped[str] = mapped_column(Text, default="")
    caption: Mapped[str] = mapped_column(Text, default="")
    near_text: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(32), default="NEEDS_VISUAL_REVIEW")


class ProcessingJob(Base):
    __tablename__ = "processing_jobs"
    id: Mapped[str] = _id()
    version_id: Mapped[str] = mapped_column(ForeignKey("document_versions.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(32), default="UPLOADED")
    stage: Mapped[str] = mapped_column(String(40), default="UPLOADED")
    progress: Mapped[int] = mapped_column(Integer, default=0)
    ai_mode: Mapped[str] = mapped_column(String(16), default="rule")
    cancel_requested: Mapped[bool] = mapped_column(Boolean, default=False)
    error: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    log: Mapped[list] = mapped_column(JSON, default=list)
    started_at: Mapped[datetime] = _ts()
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ProcessingJobSection(Base):
    __tablename__ = "processing_job_sections"
    id: Mapped[str] = _id()
    job_id: Mapped[str] = mapped_column(ForeignKey("processing_jobs.id", ondelete="CASCADE"), index=True)
    section_id: Mapped[str] = mapped_column(ForeignKey("document_sections.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(16), default="PENDING")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    req_count: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = _ts()


# ---------------------------------------------------------------- Requirements
class Requirement(Base):
    __tablename__ = "requirements"
    __table_args__ = (Index("ix_req_project_status", "project_id", "status"),)
    id: Mapped[str] = _id()
    req_id: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    document_id: Mapped[str | None] = mapped_column(ForeignKey("documents.id", ondelete="SET NULL"), nullable=True)
    version_id: Mapped[str | None] = mapped_column(ForeignKey("document_versions.id", ondelete="SET NULL"), nullable=True)
    doc_version: Mapped[int] = mapped_column(Integer, default=1)
    version: Mapped[int] = mapped_column(Integer, default=1)
    type: Mapped[str] = mapped_column(String(40))
    module: Mapped[str] = mapped_column(String(32))
    submodule: Mapped[str] = mapped_column(String(400), default=NF)
    title: Mapped[str] = mapped_column(String(200))
    original_text: Mapped[str] = mapped_column(Text)
    normalized_text: Mapped[str] = mapped_column(Text)
    business_rule: Mapped[str] = mapped_column(Text, default=NF)
    preconditions: Mapped[str] = mapped_column(Text, default=NF)
    input: Mapped[str] = mapped_column(Text, default=NF)
    process: Mapped[str] = mapped_column(Text, default=NF)
    output: Mapped[str] = mapped_column(Text, default=NF)
    expected_result: Mapped[str] = mapped_column(Text, default=NF)
    role: Mapped[str] = mapped_column(String(200), default=NF)
    threshold: Mapped[str] = mapped_column(String(80), default=NF)
    threshold_op: Mapped[str] = mapped_column(String(10), default=NF)
    threshold_value: Mapped[str] = mapped_column(String(40), default=NF)
    threshold_raw: Mapped[str] = mapped_column(String(200), default=NF)
    threshold_ambiguous: Mapped[bool] = mapped_column(Boolean, default=False)
    unit: Mapped[str] = mapped_column(String(40), default=NF)
    date_range: Mapped[str] = mapped_column(String(200), default=NF)
    inclusion: Mapped[str] = mapped_column(Text, default=NF)
    exclusion: Mapped[str] = mapped_column(Text, default=NF)
    ai_confidence: Mapped[float] = mapped_column(Float, default=0.6)
    ai_meta: Mapped[dict] = mapped_column(JSON, default=dict)
    completeness_score: Mapped[int] = mapped_column(Integer, default=0)
    completeness_reasons: Mapped[list] = mapped_column(JSON, default=list)
    clarity_score: Mapped[int] = mapped_column(Integer, default=0)
    clarity_reasons: Mapped[list] = mapped_column(JSON, default=list)
    source_unverified: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(32), default="AI_GENERATED")
    conflict_status: Mapped[str] = mapped_column(String(16), default="NONE")
    duplicate_of: Mapped[str | None] = mapped_column(String(80), nullable=True)
    origin: Mapped[str] = mapped_column(String(20), default="RULE_ENGINE")
    is_latest: Mapped[bool] = mapped_column(Boolean, default=True)
    supersedes: Mapped[list] = mapped_column(JSON, default=list)
    created_by: Mapped[str] = mapped_column(String(64), default="system")
    reviewed_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    approved_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = _ts()
    updated_at: Mapped[datetime] = _ts()

    source: Mapped["RequirementSource"] = relationship(uselist=False, lazy="selectin", cascade="all, delete-orphan")
    questions: Mapped[list["RequirementQuestion"]] = relationship(lazy="selectin", cascade="all, delete-orphan", order_by="RequirementQuestion.created_at")


class RequirementVersion(Base):
    __tablename__ = "requirement_versions"
    id: Mapped[str] = _id()
    requirement_id: Mapped[str] = mapped_column(ForeignKey("requirements.id", ondelete="CASCADE"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    snapshot: Mapped[dict] = mapped_column(JSON)
    changes: Mapped[list] = mapped_column(JSON, default=list)
    kind: Mapped[str] = mapped_column(String(20), default="Human-edited")
    changed_by: Mapped[str] = mapped_column(String(64))
    reason: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = _ts()


class RequirementSource(Base):
    __tablename__ = "requirement_sources"
    id: Mapped[str] = _id()
    requirement_id: Mapped[str] = mapped_column(ForeignKey("requirements.id", ondelete="CASCADE"), index=True)
    document_name: Mapped[str] = mapped_column(String(200), default=NF)
    page: Mapped[str] = mapped_column(String(20), default=NF)
    page_end: Mapped[str | None] = mapped_column(String(20), nullable=True)
    section: Mapped[str] = mapped_column(String(400), default=NF)
    section_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    table_ref: Mapped[str] = mapped_column(String(400), default=NF)
    screenshot_id: Mapped[str] = mapped_column(String(36), default=NF)


class RequirementQuestion(Base):
    __tablename__ = "requirement_questions"
    id: Mapped[str] = _id()
    requirement_id: Mapped[str] = mapped_column(ForeignKey("requirements.id", ondelete="CASCADE"), index=True)
    key: Mapped[str] = mapped_column(String(32))
    text: Mapped[str] = mapped_column(Text)
    answer: Mapped[str] = mapped_column(Text, default="")
    field: Mapped[str | None] = mapped_column(String(32), nullable=True)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    answered_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    resolved_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = _ts()
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    assumption: Mapped["RequirementAssumption | None"] = relationship(uselist=False, lazy="selectin", cascade="all, delete-orphan")


class RequirementAssumption(Base):
    __tablename__ = "requirement_assumptions"
    id: Mapped[str] = _id()
    requirement_id: Mapped[str] = mapped_column(ForeignKey("requirements.id", ondelete="CASCADE"), index=True)
    question_id: Mapped[str | None] = mapped_column(ForeignKey("requirement_questions.id", ondelete="CASCADE"), nullable=True)
    label: Mapped[str] = mapped_column(String(60), default="AI ASSUMPTION - NOT FOUND IN BRS")
    text: Mapped[str] = mapped_column(Text)
    state: Mapped[str] = mapped_column(String(16), default="DRAFT")  # DRAFT | ACCEPTED | REJECTED
    edited_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    updated_at: Mapped[datetime] = _ts()


class RequirementConflict(Base):
    __tablename__ = "requirement_conflicts"
    id: Mapped[str] = _id()
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    req_a_id: Mapped[str] = mapped_column(ForeignKey("requirements.id", ondelete="CASCADE"))
    req_b_id: Mapped[str] = mapped_column(ForeignKey("requirements.id", ondelete="CASCADE"))
    similarity: Mapped[int] = mapped_column(Integer)
    diffs: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(16), default="OPEN")
    resolution: Mapped[str] = mapped_column(String(40), default="")
    reason: Mapped[str] = mapped_column(Text, default="")
    resolved_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    history: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = _ts()


# ---------------------------------------------------------------- Test design
class TestScenario(Base):
    __tablename__ = "test_scenarios"
    __test__ = False
    id: Mapped[str] = _id()
    ts_id: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    requirement_id: Mapped[str] = mapped_column(ForeignKey("requirements.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text, default="")
    objective: Mapped[str] = mapped_column(Text, default="")
    type: Mapped[str] = mapped_column(String(20))
    priority: Mapped[str] = mapped_column(String(10))
    risk: Mapped[str] = mapped_column(String(10))
    pr_reasons: Mapped[list] = mapped_column(JSON, default=list)
    source_page: Mapped[str] = mapped_column(String(20), default=NF)
    source_section: Mapped[str] = mapped_column(String(400), default=NF)
    rationale: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(32), default="AI_GENERATED")
    version: Mapped[int] = mapped_column(Integer, default=1)
    reviewer: Mapped[str | None] = mapped_column(String(64), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = _ts()


class TestScenarioVersion(Base):
    __tablename__ = "test_scenario_versions"
    __test__ = False
    id: Mapped[str] = _id()
    scenario_id: Mapped[str] = mapped_column(ForeignKey("test_scenarios.id", ondelete="CASCADE"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    snapshot: Mapped[dict] = mapped_column(JSON)
    changed_by: Mapped[str] = mapped_column(String(64))
    reason: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = _ts()


class TestCase(Base):
    __tablename__ = "test_cases"
    __test__ = False
    id: Mapped[str] = _id()
    tc_id: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    scenario_id: Mapped[str] = mapped_column(ForeignKey("test_scenarios.id", ondelete="CASCADE"), index=True)
    requirement_id: Mapped[str] = mapped_column(ForeignKey("requirements.id", ondelete="CASCADE"), index=True)
    req_version: Mapped[int] = mapped_column(Integer, default=1)
    version: Mapped[int] = mapped_column(Integer, default=1)
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text, default="")
    business_explanation: Mapped[str] = mapped_column(Text, default="")
    given: Mapped[str] = mapped_column(Text, default="")
    when: Mapped[str] = mapped_column(Text, default="")
    then: Mapped[str] = mapped_column(Text, default="")
    preconditions: Mapped[str] = mapped_column(Text, default="")
    overall_expected: Mapped[str] = mapped_column(Text, default="")
    type: Mapped[str] = mapped_column(String(20))
    priority: Mapped[str] = mapped_column(String(10))
    risk: Mapped[str] = mapped_column(String(10))
    pr_reasons: Mapped[list] = mapped_column(JSON, default=list)
    origin: Mapped[str] = mapped_column(String(40), default="BRS Explicit Rule")
    automation_candidate: Mapped[str] = mapped_column(String(10), default="Maybe")
    automation_tool: Mapped[str] = mapped_column(String(40), default="Pytest")
    assumption: Mapped[str] = mapped_column(Text, default="")
    clarification_ref: Mapped[str] = mapped_column(Text, default="")
    source_page: Mapped[str] = mapped_column(String(20), default=NF)
    source_section: Mapped[str] = mapped_column(String(400), default=NF)
    status: Mapped[str] = mapped_column(String(32), default="AI_GENERATED")
    locked: Mapped[bool] = mapped_column(Boolean, default=False)
    edited_by: Mapped[str] = mapped_column(String(64), default="AI")
    reviewer: Mapped[str | None] = mapped_column(String(64), nullable=True)
    approved_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = _ts()
    updated_at: Mapped[datetime] = _ts()

    steps: Mapped[list["TestStep"]] = relationship(lazy="selectin", cascade="all, delete-orphan", order_by="TestStep.step_no")
    data_rows: Mapped[list["TestDataRow"]] = relationship(lazy="selectin", cascade="all, delete-orphan", order_by="TestDataRow.seq")


class TestCaseVersion(Base):
    __tablename__ = "test_case_versions"
    __test__ = False
    id: Mapped[str] = _id()
    test_case_id: Mapped[str] = mapped_column(ForeignKey("test_cases.id", ondelete="CASCADE"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    snapshot: Mapped[dict] = mapped_column(JSON)
    changes: Mapped[list] = mapped_column(JSON, default=list)  # [{field, old, new}]
    kind: Mapped[str] = mapped_column(String(20), default="AI-generated")
    changed_by: Mapped[str] = mapped_column(String(64))
    reason: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = _ts()


class TestStep(Base):
    __tablename__ = "test_steps"
    __test__ = False
    id: Mapped[str] = _id()
    test_case_id: Mapped[str] = mapped_column(ForeignKey("test_cases.id", ondelete="CASCADE"), index=True)
    step_no: Mapped[int] = mapped_column(Integer)
    action: Mapped[str] = mapped_column(Text)
    test_data: Mapped[str] = mapped_column(Text, default="")
    expected: Mapped[str] = mapped_column(Text, default="")
    origin: Mapped[str] = mapped_column(String(40), default="")
    label: Mapped[str] = mapped_column(String(80), default="")


class TestDataRow(Base):
    __tablename__ = "test_data"
    __test__ = False
    id: Mapped[str] = _id()
    test_case_id: Mapped[str] = mapped_column(ForeignKey("test_cases.id", ondelete="CASCADE"), index=True)
    seq: Mapped[int] = mapped_column(Integer)
    value: Mapped[str] = mapped_column(Text)
    raw: Mapped[str | None] = mapped_column(Text, nullable=True)  # length boundaries can exceed 200 chars
    expected: Mapped[str] = mapped_column(Text, default="")
    origin: Mapped[str] = mapped_column(String(40), default="")
    note: Mapped[str] = mapped_column(String(80), default="")
    label: Mapped[str] = mapped_column(String(80), default="")


# ---------------------------------------------------------------- Automation
class AutomationArtifact(Base):
    __tablename__ = "automation_artifacts"
    id: Mapped[str] = _id()
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20))  # python|pytest|postman|sql|playwright|jmeter|github_actions
    name: Mapped[str] = mapped_column(String(200))
    test_case_ids: Mapped[list] = mapped_column(JSON, default=list)
    tc_codes: Mapped[list] = mapped_column(JSON, default=list)
    is_draft: Mapped[bool] = mapped_column(Boolean, default=False)
    edited: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(32), default="GENERATED")
    storage_path: Mapped[str] = mapped_column(String(400))
    files: Mapped[list] = mapped_column(JSON, default=list)  # [path]
    tips: Mapped[dict] = mapped_column(JSON, default=dict)
    options: Mapped[dict] = mapped_column(JSON, default=dict)
    scan_problems: Mapped[list] = mapped_column(JSON, default=list)
    created_by: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = _ts()
    updated_at: Mapped[datetime] = _ts()


class PythonArtifact(Base):
    __tablename__ = "python_artifacts"
    id: Mapped[str] = _id()
    artifact_id: Mapped[str] = mapped_column(ForeignKey("automation_artifacts.id", ondelete="CASCADE"), unique=True)
    rule_functions: Mapped[list] = mapped_column(JSON, default=list)


class PytestArtifact(Base):
    __tablename__ = "pytest_artifacts"
    id: Mapped[str] = _id()
    artifact_id: Mapped[str] = mapped_column(ForeignKey("automation_artifacts.id", ondelete="CASCADE"), unique=True)
    test_files: Mapped[list] = mapped_column(JSON, default=list)
    markers: Mapped[list] = mapped_column(JSON, default=list)


class PostmanArtifact(Base):
    __tablename__ = "postman_artifacts"
    id: Mapped[str] = _id()
    artifact_id: Mapped[str] = mapped_column(ForeignKey("automation_artifacts.id", ondelete="CASCADE"), unique=True)
    auth_type: Mapped[str] = mapped_column(String(20), default="none")
    status: Mapped[str] = mapped_column(String(32), default="NEEDS_CONFIGURATION")


class SqlArtifact(Base):
    __tablename__ = "sql_artifacts"
    id: Mapped[str] = _id()
    artifact_id: Mapped[str] = mapped_column(ForeignKey("automation_artifacts.id", ondelete="CASCADE"), unique=True)
    dialect: Mapped[str] = mapped_column(String(20), default="MySQL")
    query_types: Mapped[list] = mapped_column(JSON, default=list)
    read_only: Mapped[bool] = mapped_column(Boolean, default=True)


class PlaywrightArtifact(Base):
    __tablename__ = "playwright_artifacts"
    id: Mapped[str] = _id()
    artifact_id: Mapped[str] = mapped_column(ForeignKey("automation_artifacts.id", ondelete="CASCADE"), unique=True)
    browser: Mapped[str] = mapped_column(String(20), default="chromium")
    page_name: Mapped[str] = mapped_column(String(80), default="Target")
    locators: Mapped[list] = mapped_column(JSON, default=list)
    manual_checkpoints: Mapped[list] = mapped_column(JSON, default=list)


class JmeterArtifact(Base):
    __tablename__ = "jmeter_artifacts"
    id: Mapped[str] = _id()
    artifact_id: Mapped[str] = mapped_column(ForeignKey("automation_artifacts.id", ondelete="CASCADE"), unique=True)
    profile: Mapped[dict] = mapped_column(JSON, default=dict)
    target_url: Mapped[str] = mapped_column(String(300), default="")
    approved_by: Mapped[str | None] = mapped_column(String(64), nullable=True)


# ---------------------------------------------------------------- Runs
class TestRun(Base):
    __tablename__ = "test_runs"
    __test__ = False
    id: Mapped[str] = _id()
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    artifact_id: Mapped[str | None] = mapped_column(ForeignKey("automation_artifacts.id", ondelete="SET NULL"), nullable=True)
    source: Mapped[str] = mapped_column(String(20), default="RUNNER")  # RUNNER | JUNIT_IMPORT | NEWMAN_IMPORT
    status: Mapped[str] = mapped_column(String(16), default="QUEUED")
    progress: Mapped[int] = mapped_column(Integer, default=0)
    cancel_requested: Mapped[bool] = mapped_column(Boolean, default=False)
    exit_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    stdout: Mapped[str] = mapped_column(Text, default="")
    stderr: Mapped[str] = mapped_column(Text, default="")
    summary: Mapped[dict] = mapped_column(JSON, default=dict)
    duration: Mapped[float] = mapped_column(Float, default=0.0)
    triggered_by: Mapped[str] = mapped_column(String(64))
    started_at: Mapped[datetime] = _ts()
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    results: Mapped[list["TestRunResult"]] = relationship(lazy="selectin", cascade="all, delete-orphan")


class TestRunResult(Base):
    __tablename__ = "test_run_results"
    __test__ = False
    id: Mapped[str] = _id()
    run_id: Mapped[str] = mapped_column(ForeignKey("test_runs.id", ondelete="CASCADE"), index=True)
    test_case_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    tc_id: Mapped[str] = mapped_column(String(80), default=NF)
    name: Mapped[str] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(16))  # PASSED | FAILED | BLOCKED
    message: Mapped[str] = mapped_column(Text, default="")
    duration: Mapped[float] = mapped_column(Float, default=0.0)


class TestRunArtifact(Base):
    __tablename__ = "test_run_artifacts"
    __test__ = False
    id: Mapped[str] = _id()
    run_id: Mapped[str] = mapped_column(ForeignKey("test_runs.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20))  # junit | html | screenshot | log
    name: Mapped[str] = mapped_column(String(200))
    storage_path: Mapped[str] = mapped_column(String(400))
    size: Mapped[int] = mapped_column(Integer, default=0)


# ---------------------------------------------------------------- GitHub
class GithubIntegration(Base):
    __tablename__ = "github_integrations"
    id: Mapped[str] = _id()
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), unique=True)
    owner: Mapped[str] = mapped_column(String(100), default="")
    repo: Mapped[str] = mapped_column(String(100), default="")
    default_branch: Mapped[str] = mapped_column(String(100), default="main")
    status: Mapped[str] = mapped_column(String(32), default="NEEDS_CONFIGURATION")
    updated_at: Mapped[datetime] = _ts()


class GithubActionRequest(Base):
    __tablename__ = "github_action_requests"
    id: Mapped[str] = _id()
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    artifact_id: Mapped[str | None] = mapped_column(ForeignKey("automation_artifacts.id", ondelete="SET NULL"), nullable=True)
    action_type: Mapped[str] = mapped_column(String(40))  # CREATE_REPOSITORY | CREATE_BRANCH_COMMIT_PR
    repository: Mapped[str] = mapped_column(String(200))
    branch: Mapped[str] = mapped_column(String(200))
    base_branch: Mapped[str] = mapped_column(String(200), default="main")
    commit_message: Mapped[str] = mapped_column(Text)
    files: Mapped[list] = mapped_column(JSON, default=list)
    diff: Mapped[str] = mapped_column(Text, default="")
    scan_problems: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(32), default="PROPOSED")
    proposed_by: Mapped[str] = mapped_column(String(64))
    approved_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    result: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = _ts()


# ---------------------------------------------------------------- Governance
class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[str] = _id()
    at: Mapped[datetime] = _ts()
    username: Mapped[str] = mapped_column(String(64), index=True)
    action: Mapped[str] = mapped_column(String(40), index=True)
    entity: Mapped[str] = mapped_column(String(300), default="")
    detail: Mapped[str] = mapped_column(Text, default="")
    correlation_id: Mapped[str] = mapped_column(String(16), default="")
    ip: Mapped[str] = mapped_column(String(64), default="")


class Comment(Base):
    __tablename__ = "comments"
    id: Mapped[str] = _id()
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    entity_type: Mapped[str] = mapped_column(String(30))
    entity_id: Mapped[str] = mapped_column(String(36), index=True)
    username: Mapped[str] = mapped_column(String(64))
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = _ts()


class Approval(Base):
    __tablename__ = "approvals"
    id: Mapped[str] = _id()
    entity_type: Mapped[str] = mapped_column(String(30))
    entity_id: Mapped[str] = mapped_column(String(36), index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    action: Mapped[str] = mapped_column(String(30))
    username: Mapped[str] = mapped_column(String(64))
    comment: Mapped[str] = mapped_column(Text, default="")
    at: Mapped[datetime] = _ts()


class ImpactAnalysis(Base):
    __tablename__ = "impact_analyses"
    id: Mapped[str] = _id()
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"))
    from_version: Mapped[int] = mapped_column(Integer)
    to_version: Mapped[int] = mapped_column(Integer)
    section_diff: Mapped[dict] = mapped_column(JSON, default=dict)
    items: Mapped[list] = mapped_column(JSON, default=list)  # [{entity_type, entity_id, code, proposal, reason, state}]
    retest: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(20), default="PROPOSED")
    created_by: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = _ts()


class ApplicationSetting(Base):
    __tablename__ = "application_settings"
    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[dict | list | str | int | bool | None] = mapped_column(JSON)
    updated_by: Mapped[str] = mapped_column(String(64), default="system")
    updated_at: Mapped[datetime] = _ts()
