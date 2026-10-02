// Types mirror backend/app/api/serializers.py

export type User = {
  id: string; username: string; name: string; roles: string[]; role_names: string[]; active: boolean;
  must_change_password: boolean; permissions: string[]; last_login_at: string | null;
};

export type PublicSettings = {
  app_name: string; session_minutes: number; max_upload_mb: number; ai_mode: string; claude_configured: boolean;
  claude_model: string; vision_enabled: boolean; runner_mode: string; runner_timeout_sec: number; runner_max_memory_mb: number;
  runner_max_output_kb: number; github_configured: boolean; env_allowlist: string[]; jmeter_max_users: number;
  jmeter_max_minutes: number; bind_host: string; network_sharing: boolean; storage_root: string; task_mode: string;
};

export type Project = {
  id: string; code: string; name: string; description: string; module_codes: string[]; created_at: string; updated_at: string;
  requirement_count?: number; test_case_count?: number; document_count?: number; latest_brs_version?: number | null;
};

export type Job = { id: string; status: string; stage: string; progress: number; ai_mode: string; cancel_requested: boolean; error: ErrorLike | null; started_at: string; finished_at: string | null };
export type ErrorLike = { code: string; user_message: string; suggested_action?: string; technical?: string; correlation_id?: string; retryable?: boolean };

export type DocVersion = {
  id: string; version: number; filename: string; ext: string; size: number; sha256: string; encoding: string; page_count: number | null;
  warnings: string[]; ai_mode: string; status: string; created_by: string; created_at: string; job: Job | null;
};
export type Doc = { id: string; project_id: string; name: string; default_module: string; latest_version: number; created_at: string; versions: DocVersion[] };

export type Source = { document_name: string | null; page: string; page_end: string | null; section: string | null; section_id: string | null; table: string; screenshot_id: string };
export type Reason = { ok: boolean; text: string };
export type Assumption = { id: string; label: string; text: string; state: string; edited_by: string | null };
export type Question = { id: string; key: string; text: string; answer: string; resolved: boolean; field: string | null; answered_by: string | null; resolved_by: string | null; assumption: Assumption | null };

export type RequirementBrief = {
  id: string; req_id: string; project_id: string; document_id: string | null; doc_version: number; version: number; type: string; module: string;
  submodule: string; title: string; status: string; conflict_status: string; completeness_score: number; clarity_score: number;
  ai_confidence: number; origin: string; is_latest: boolean; duplicate_of: string | null; source: Source; open_questions: number; updated_at: string;
};
export type Requirement = RequirementBrief & {
  original_text: string; normalized_text: string; fields: Record<string, string>; completeness_reasons: Reason[]; clarity_reasons: Reason[];
  ai_meta: Record<string, unknown>; source_unverified: boolean; supersedes: string[]; created_by: string; reviewed_by: string | null; approved_by: string | null;
  questions: Question[];
  ai_output: { found_in_brs: string[]; assumptions: string[]; recommendations: string[]; clarification_questions: string[]; conflicts: string[]; source_references: string[]; confidence: number };
  conflicts?: { id: string; status: string; similarity: number; diffs: Diff[]; other: string }[];
  versions?: { version: number; changes: { field: string; old: unknown; new: unknown }[]; kind: string; changed_by: string; reason: string; created_at: string }[];
  comments?: { id: string; username: string; text: string; created_at: string }[];
};
export type Diff = { field: string; a: string; b: string };
export type Conflict = { id: string; similarity: number; diffs: Diff[]; status: string; resolution: string; reason: string; resolved_by: string | null; history: { at: string; by: string; action: string; reason?: string }[]; a: Requirement | null; b: Requirement | null };

export type Scenario = {
  id: string; ts_id: string; requirement_id: string; req_id: string | null; title: string; description: string; objective: string; type: string;
  priority: string; risk: string; pr_reasons: string[]; source_page: string; source_section: string; rationale: string; status: string; version: number;
  reviewer: string | null; test_case_count?: number;
};

export type Step = { n: number; action: string; data: string; expected: string; origin: string; label: string };
export type TestDatum = { value: string; raw: string | null; expected: string; origin: string; note: string; label: string };
export type TestCaseBrief = {
  id: string; tc_id: string; scenario_id: string; ts_id: string | null; requirement_id: string; req_id: string | null; req_version: number; version: number;
  status: string; locked: boolean; title: string; type: string; priority: string; risk: string; automation_candidate: string; automation_tool: string;
  edited_by: string; approved_by: string | null; approved_at: string | null; source_page: string; source_section: string; updated_at: string;
  given: string; when: string; then: string;
};
export type TestCase = TestCaseBrief & {
  description: string; business_explanation: string; preconditions: string; overall_expected: string; pr_reasons: string[]; origin: string;
  assumption: string; clarification_ref: string; steps: Step[]; test_data: TestDatum[];
  requirement?: { id: string; req_id: string; status: string; original_text: string; version: number } | null;
  history?: { version: number; kind: string; changed_by: string; reason: string; changes: { field: string; old: unknown; new: unknown }[]; created_at: string }[];
  approvals?: { action: string; username: string; comment: string; version: number; at: string }[];
  comments?: { username: string; text: string; created_at: string }[];
};

export type Tip = { code: string; purpose: string; input: string; output: string; why: string; explain: string; tc: string; caution: string; fix: string };
export type Artifact = {
  id: string; project_id: string; kind: string; name: string; test_case_ids: string[]; tc_codes: string[]; is_draft: boolean; edited: boolean; status: string;
  files: string[]; tips: Record<string, Tip[]>; options: Record<string, unknown>; scan_problems: string[]; created_by: string; created_at: string; updated_at: string;
};

export type RunResult = { id: string; test_case_id: string | null; tc_id: string; name: string; status: string; message: string; duration: number };
export type Run = {
  id: string; project_id: string; artifact_id: string | null; source: string; status: string; progress: number; exit_code: number | null;
  summary: { total?: number; passed?: number; failed?: number; blocked?: number }; duration: number; triggered_by: string; started_at: string;
  finished_at: string | null; cancel_requested: boolean; results: RunResult[]; stdout?: string; stderr?: string;
  artifacts?: { id: string; kind: string; name: string; size: number }[];
};
