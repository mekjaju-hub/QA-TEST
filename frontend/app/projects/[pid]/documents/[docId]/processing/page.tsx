"use client";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AppShell, PageHead } from "@/components/shell";
import { AuthImage } from "@/components/auth-image";
import { Badge, NFValue } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ErrorState, Loading, Progress } from "@/components/ui/states";
import { useConfirm } from "@/components/ui/confirm";
import { api, download, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { projectCrumbs, useProject } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import type { Doc, DocVersion, ErrorLike, Job } from "@/lib/types";

const STAGES = ["UPLOADED", "EXTRACTING", "NORMALIZING", "CREATING_SECTIONS", "ANALYZING_REQUIREMENTS", "DETECTING_CONFLICTS", "GENERATING_QUESTIONS", "READY_FOR_REVIEW"];
const LABEL: Record<string, string> = { UPLOADED: "Uploaded", EXTRACTING: "Extracting", NORMALIZING: "Normalizing", CREATING_SECTIONS: "Creating Sections", ANALYZING_REQUIREMENTS: "Analyzing Requirements", DETECTING_CONFLICTS: "Detecting Conflicts", GENERATING_QUESTIONS: "Generating Questions", READY_FOR_REVIEW: "Ready for Review" };
type Sec = { id: string; seq: number; title: string; kind: string; page: number | null; page_end: number | null; overlap: boolean; status: string; attempts: number; error: ErrorLike | null; req_count: number };
type Prog = { document: Doc; version: DocVersion; job: Job; sections: Sec[]; images: { id: string; section_id: string | null; caption: string; status: string; near_text: string }[]; log_tail: string[] };
type SectionDetail = { id: string; title: string; text: string; rows: string[][] | null; page: number | null; requirements: { id: string; req_id: string; status: string }[] };

function Inner() {
  const { pid, docId } = useParams<{ pid: string; docId: string }>();
  const v = useSearchParams().get("v");
  const p = useProject(pid);
  const { can } = useAuth();
  const { toast, toastError } = useToast();
  const { confirm } = useConfirm();
  const [failedOnly, setFailedOnly] = useState(false);
  const [secView, setSecView] = useState<SectionDetail | null>(null);
  const [errView, setErrView] = useState<ErrorLike | null>(null);
  const [imgView, setImgView] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["progress", docId, v], queryFn: () => api.get<Prog>(`/api/documents/${docId}/progress${qs({ version: v })}`),
    refetchInterval: d => (["RUNNING", "QUEUED"].includes(d.state.data?.job.status ?? "") || d.state.data?.job.status === "UPLOADED" ? 1500 : false),
  });
  const crumbs = projectCrumbs(pid, p.data?.code, ["Processing", `/projects/${pid}/documents/processing`], [q.data ? `${q.data.document.name} v${q.data.version.version}` : "…"]);
  if (q.isLoading) return <AppShell crumbs={crumbs}><Loading /></AppShell>;
  if (q.error || !q.data) return <AppShell crumbs={crumbs}><ErrorState error={q.error} onRetry={() => q.refetch()} /></AppShell>;
  const { job, version, sections, images } = q.data;
  const running = ["RUNNING", "QUEUED"].includes(job.status);
  const failed = sections.filter(s => s.status === "FAILED");
  const stIdx = job.status === "READY_FOR_REVIEW" ? 7 : Math.max(0, STAGES.indexOf(job.stage));
  const body = { version: version.version };
  const act = async (path: string, msg: string, extra: object = {}) => {
    try { await api.post(`/api/documents/${docId}/${path}`, { ...body, ...extra }); toast(msg); await q.refetch(); } catch (e) { toastError(e); }
  };
  const canP = can("doc.process");
  const openSection = async (id: string) => { try { setSecView(await api.get<SectionDetail>(`/api/sections/${id}`)); } catch (e) { toastError(e); } };
  return (
    <AppShell crumbs={crumbs}>
      <PageHead title={`${q.data.document.name} · v${version.version}`}
        sub={<>{sections.length} Sections · {images.length} รูปภาพ · SHA-256 <span className="mono">{version.sha256.slice(0, 16)}…</span> · วิธีวิเคราะห์: {job.ai_mode === "claude" ? "Claude AI" : "Rule Engine"}</>}
        actions={<>
          {canP && ["UPLOADED", "FAILED"].includes(job.status) && !sections.length && <Button variant="primary" onClick={() => act("process", "เริ่มประมวลผลแล้ว")}>เริ่มประมวลผล</Button>}
          {canP && job.status === "CANCELLED" && <Button variant="primary" onClick={() => act("resume", "Resume Job แล้ว")}>Resume Job</Button>}
          {canP && running && <Button variant="danger" onClick={async () => { if (await confirm({ title: "Cancel Job", body: "หยุดหลัง Section ปัจจุบันเสร็จ — Resume ภายหลังได้โดยไม่ทำ Section ที่เสร็จแล้วซ้ำ", danger: true, confirmText: "Cancel Job" })) await act("cancel", "ส่งคำขอ Cancel แล้ว"); }}>Cancel Job</Button>}
          {canP && failed.length > 0 && !running && <Button onClick={() => act("retry-failed", "Retry เฉพาะ Section ที่ Fail")}>Retry Failed Only ({failed.length})</Button>}
          <Button onClick={() => download(`/api/documents/${docId}/log${qs({ version: version.version })}`, "processing.log")}>Download Processing Log</Button>
          {version.version > 1 && <Link className="btn" href={`/projects/${pid}/documents/compare?doc=${docId}&from=${version.version - 1}&to=${version.version}`}>Compare กับ v{version.version - 1}</Link>}
        </>} />
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="stepper">{STAGES.map((s, i) => {
          const fail = job.status === "FAILED" && i === 7;
          return <span key={s} className={fail ? "fail" : i < stIdx ? "done" : i === stIdx ? "cur" : ""}>{fail ? "Failed" : LABEL[s]}</span>;
        })}</div>
        <div className="row-flex"><div className="sp"><Progress value={job.progress} /></div><b>{job.progress}%</b> <Badge status={job.status} /></div>
        {version.warnings.length > 0 && <p className="small muted" style={{ marginTop: 8 }}>{version.warnings.join(" · ")}</p>}
        {job.error && <div className="err-box" style={{ marginTop: 8 }}><b>{job.error.code}</b>: {job.error.user_message} {job.error.suggested_action && <>— {job.error.suggested_action}</>}</div>}
      </div>
      <div className="toolbar"><label className="row-flex small"><input type="checkbox" checked={failedOnly} onChange={e => setFailedOnly(e.target.checked)} /> แสดงเฉพาะ Section ที่ Fail</label><span className="sp" />
        {job.status === "READY_FOR_REVIEW" && <Link className="btn pri" href={`/projects/${pid}/requirements`}>ไปที่ Requirement Explorer</Link>}</div>
      <div className="tblwrap"><table><thead><tr><th>#</th><th>Section</th><th>หน้า</th><th>ชนิด</th><th>สถานะ</th><th>Requirement</th><th>ครั้งที่ทำ</th><th></th></tr></thead><tbody>
        {sections.filter(s => !failedOnly || s.status === "FAILED").map(s => (
          <tr key={s.id}><td>{s.seq}</td><td>{s.title}{s.overlap && <> <Badge>overlap</Badge></>}{s.error && <div className="small" style={{ color: "var(--red)" }}>{s.error.code}: {s.error.user_message}</div>}</td>
            <td>{s.page ?? <NFValue />}{s.page_end && s.page_end !== s.page ? `–${s.page_end}` : ""}</td><td>{s.kind === "table" ? "ตาราง" : "ข้อความ"}</td>
            <td><Badge status={s.status} /></td><td>{s.req_count}</td><td>{s.attempts}</td>
            <td className="row-flex"><Button size="sm" onClick={() => openSection(s.id)}>ดู</Button>
              {canP && !running && s.status !== "RUNNING" && <Button size="sm" onClick={() => act("retry-failed", `Retry Section ${s.seq}`, { section_ids: [s.id] })}>Retry Section</Button>}
              {s.error && <Button size="sm" onClick={() => setErrView(s.error)}>Error</Button>}</td></tr>))}
      </tbody></table></div>
      {images.length > 0 && <><h2 style={{ marginTop: 18 }}>รูปภาพจากเอกสาร ({images.length})</h2>
        <div className="grid g4">{images.map(im => <div className="card" key={im.id}>
          <AuthImage src={`/api/images/${im.id}`} alt={im.caption || "screenshot"} style={{ maxWidth: "100%", maxHeight: 140, cursor: "zoom-in" }} onClick={() => setImgView(im.id)} />
          <Badge status={im.status} /><div className="small muted">{im.caption || im.near_text}</div></div>)}</div></>}
      <details style={{ marginTop: 16 }}><summary className="small">Log ล่าสุด</summary><pre className="codeview">{q.data.log_tail.join("\n")}</pre></details>
      <Dialog open={!!secView} onOpenChange={o => !o && setSecView(null)} title={secView?.title ?? ""} wide description={<>หน้า {secView?.page ?? "NOT_FOUND"} · Requirement: {secView?.requirements.map(r => r.req_id).join(", ") || "-"}</>}>
        {secView?.rows ? <div className="tblwrap"><table><tbody>{secView.rows.map((r, i) => <tr key={i}>{r.map((c, j) => i === 0 ? <th key={j}>{c}</th> : <td key={j}>{c}</td>)}</tr>)}</tbody></table></div> : <div className="src">{secView?.text}</div>}
      </Dialog>
      <Dialog open={!!errView} onOpenChange={o => !o && setErrView(null)} title={`Error ${errView?.code ?? ""}`}>
        <dl className="kv"><dt>User Message</dt><dd>{errView?.user_message}</dd><dt>Suggested Action</dt><dd>{errView?.suggested_action}</dd><dt>Retryable</dt><dd>{String(errView?.retryable)}</dd><dt>Correlation ID</dt><dd className="mono">{errView?.correlation_id}</dd>{errView?.technical && <><dt>Technical (Admin)</dt><dd className="mono small">{errView.technical}</dd></>}</dl>
      </Dialog>
      <Dialog open={!!imgView} onOpenChange={o => !o && setImgView(null)} title="รูปภาพ (Needs Visual Review)" wide description="ระบบไม่อ่านหรือเดาข้อความในรูปภาพ — ต้องให้ QA ตรวจเอง หรือเปิด Vision Model">
        {imgView && <AuthImage src={`/api/images/${imgView}`} alt="screenshot" style={{ maxWidth: "100%" }} />}
      </Dialog>
    </AppShell>
  );
}

export default function ProcessingPage() { return <Suspense><Inner /></Suspense>; }
