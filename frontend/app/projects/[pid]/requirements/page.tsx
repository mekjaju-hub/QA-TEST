"use client";
import Link from "next/link";
import { Fragment, Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, PageHead } from "@/components/shell";
import { AuthImage } from "@/components/auth-image";
import { Highlight, Reasons } from "@/components/req-bits";
import { AssumptionLabel, Badge, NFValue } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm";
import { Empty, ErrorState, Loading, ScoreBar } from "@/components/ui/states";
import { api, ApiError, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { projectCrumbs, useProject } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import type { Diff, Requirement, RequirementBrief } from "@/lib/types";
import { fmtDate } from "@/lib/utils";

const STATUSES = ["AI_GENERATED", "WAITING_FOR_REVIEW", "NEEDS_CLARIFICATION", "CONFLICT", "REVISED", "APPROVED", "DEPRECATED"];
const FIELD_LABELS: [string, string][] = [["business_rule", "Business Rule"], ["preconditions", "Preconditions"], ["input", "Input"], ["process", "Process"],
  ["output", "Output"], ["expected_result", "Expected Result"], ["role", "Role"], ["threshold", "Threshold"], ["unit", "Unit"], ["date_range", "Date Range"],
  ["inclusion", "Inclusion"], ["exclusion", "Exclusion"]];
const EDITABLE = ["expected_result", "role", "threshold_op", "threshold_value", "unit", "date_range", "input", "output", "inclusion", "exclusion", "preconditions"];

function Inner() {
  const { pid } = useParams<{ pid: string }>();
  const sp = useSearchParams();
  const p = useProject(pid);
  const { can } = useAuth();
  const qc = useQueryClient();
  const { toast, toastError } = useToast();
  const { confirm, prompt } = useConfirm();
  const [f, setF] = useState({ q: "", type: "", status: sp.get("status") ?? "", max_score: "", conflict: false, needs_clarification: false, show_old: false });
  const [sel, setSel] = useState<string | null>(sp.get("sel"));
  const [cmpSel, setCmpSel] = useState<string[]>([]);
  const [cmp, setCmp] = useState<{ a: Requirement; b: Requirement; similarity: number; diffs: Diff[] } | null>(null);
  const [edit, setEdit] = useState<Record<string, string> | null>(null);
  const [section, setSection] = useState<{ title: string; text: string; rows: string[][] | null } | null>(null);
  const [img, setImg] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ["requirements", pid, f], queryFn: () => api.get<{ items: RequirementBrief[]; types: string[] }>(
      `/api/projects/${pid}/requirements${qs({ q: f.q, type: f.type, status: f.status, max_score: f.max_score || undefined, conflict: f.conflict, needs_clarification: f.needs_clarification, show_old: f.show_old })}`),
  });
  const items = useMemo(() => list.data?.items ?? [], [list.data]);
  const current = sel ?? items[0]?.id ?? null;
  useEffect(() => { if (!sel && items[0]) setSel(items[0].id); }, [items, sel]);
  const det = useQuery({ queryKey: ["requirement", current], enabled: !!current, queryFn: () => api.get<Requirement>(`/api/requirements/${current}`) });
  const crumbs = projectCrumbs(pid, p.data?.code, ["Requirements"]);
  const refresh = async () => { await qc.invalidateQueries({ queryKey: ["requirements", pid] }); await qc.invalidateQueries({ queryKey: ["requirement", current] }); await qc.invalidateQueries({ queryKey: ["dashboard", pid] }); };
  const run = async (fn: () => Promise<unknown>, msg: string) => { try { await fn(); toast(msg); await refresh(); } catch (e) { toastError(e); } };
  const r = det.data;

  const approve = async () => {
    if (!r) return;
    try { await api.post(`/api/requirements/${r.id}/approve`); toast(`Approve ${r.req_id} แล้ว`); await refresh(); }
    catch (e) {
      if (e instanceof ApiError && e.body.code === "SOURCE_UNVERIFIED" && await confirm({ title: "Source ไม่ได้รับการยืนยัน", body: "AI อ้างข้อความที่ไม่พบตรงตัวในต้นฉบับ ยืนยันว่าตรวจแล้ว?", confirmText: "ยืนยันและ Approve" }))
        await run(() => api.post(`/api/requirements/${r.id}/approve?confirm_unverified=true`), `Approve ${r.req_id} แล้ว`);
      else toastError(e);
    }
  };
  const saveEdit = async () => {
    if (!r || !edit) return;
    const { __reason, __title, ...fields } = edit;
    if (!__reason || __reason.trim().length < 3) { toast("ระบุเหตุผลการแก้ไข", true); return; }
    const changed = Object.fromEntries(Object.entries(fields).filter(([k, v]) => v !== r.fields[k]));
    await run(() => api.patch(`/api/requirements/${r.id}`, { reason: __reason, title: __title !== r.title ? __title : undefined, fields: changed }), `บันทึก ${r.req_id} เป็น Version ใหม่แล้ว`);
    setEdit(null);
  };
  const doCompare = async () => {
    if (cmpSel.length !== 2) { toast("เลือก 2 รายการเพื่อเปรียบเทียบ", true); return; }
    try { setCmp(await api.get(`/api/requirements/compare/${cmpSel[0]}/${cmpSel[1]}`)); } catch (e) { toastError(e); }
  };
  const genScenarios = () => run(() => api.post(`/api/projects/${pid}/test-scenarios/generate`, {}).then(x => { const d = x as { created: number; skipped: string[] }; toast(`สร้าง Scenario ใหม่ ${d.created} รายการ (ข้าม ${d.skipped.length} ที่ยังไม่ Approved)`); }), "เสร็จ");

  return (
    <AppShell crumbs={crumbs}>
      <PageHead title="Requirement Explorer" sub={`${p.data?.code ?? ""} · Source ซ้าย · Requirement กลาง · AI Analysis ขวา`} />
      <div className="toolbar">
        <input type="text" placeholder="ค้นหา ID / ข้อความ" aria-label="ค้นหา" value={f.q} onChange={e => setF({ ...f, q: e.target.value })} />
        <select aria-label="Type" value={f.type} onChange={e => setF({ ...f, type: e.target.value })}><option value="">ทุก Type</option>{list.data?.types.map(t => <option key={t}>{t}</option>)}</select>
        <select aria-label="Status" value={f.status} onChange={e => setF({ ...f, status: e.target.value })}><option value="">ทุก Status</option>{STATUSES.map(t => <option key={t}>{t}</option>)}</select>
        <select aria-label="Score" value={f.max_score} onChange={e => setF({ ...f, max_score: e.target.value })}><option value="">ทุก Score</option>{[49, 69, 89].map(n => <option key={n} value={n}>Score ต่ำกว่า {n + 1}</option>)}</select>
        <label className="row-flex small"><input type="checkbox" checked={f.conflict} onChange={e => setF({ ...f, conflict: e.target.checked })} /> Conflict</label>
        <label className="row-flex small"><input type="checkbox" checked={f.needs_clarification} onChange={e => setF({ ...f, needs_clarification: e.target.checked })} /> Needs Clarification</label>
        <label className="row-flex small"><input type="checkbox" checked={f.show_old} onChange={e => setF({ ...f, show_old: e.target.checked })} /> แสดง Version เก่า</label>
        <span className="sp" /><span className="small muted">{items.length} รายการ</span>
        <Button onClick={doCompare} disabled={cmpSel.length !== 2}>Compare 2 รายการ</Button>
        {can("scenario.edit") && <Button variant="primary" onClick={genScenarios}>สร้าง Scenario จาก Requirement ที่ Approved</Button>}
      </div>
      {list.isLoading ? <Loading /> : list.error ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : !items.length ?
        <Empty title="ไม่พบ Requirement" body="อัปโหลดและวิเคราะห์ BRS ก่อน หรือล้าง Filter" action={can("doc.upload") && <Link className="btn pri" href={`/projects/${pid}/documents/upload`}>อัปโหลด BRS</Link>} /> : <>
        <div className="tblwrap list" style={{ maxHeight: 300, marginBottom: 14 }}><table>
          <thead><tr><th><span className="hide">เลือก</span></th><th>Requirement ID</th><th>Type</th><th>Title</th><th>Complete</th><th>Clarity</th><th>หน้า</th><th>Status</th></tr></thead>
          <tbody>{items.map(x => (
            <tr key={x.id} className={`click ${x.id === current ? "sel" : ""}`} onClick={() => setSel(x.id)}>
              <td onClick={e => e.stopPropagation()}><input type="checkbox" aria-label={`เลือก ${x.req_id} เพื่อเปรียบเทียบ`} checked={cmpSel.includes(x.id)} onChange={e => setCmpSel(s => e.target.checked ? [...s, x.id].slice(-2) : s.filter(i => i !== x.id))} /></td>
              <td className="mono">{x.req_id}</td><td className="small">{x.type}</td><td>{x.title}</td><td>{x.completeness_score}</td><td>{x.clarity_score}</td>
              <td><NFValue v={x.source.page} /></td><td><Badge status={x.status} />{x.open_questions > 0 && <span className="small muted"> ({x.open_questions} คำถาม)</span>}</td></tr>))}</tbody></table></div>
        {det.isLoading ? <Loading /> : det.error ? <ErrorState error={det.error} /> : r && (
          <div className="split3">
            <section className="card" aria-label="Source">
              <h3>Source</h3>
              <p className="small muted">{r.source.document_name} v{r.doc_version} · หน้า <NFValue v={r.source.page} /> · {r.source.section}</p>
              <div className="src"><Highlight text={r.original_text} needles={[r.fields.threshold_raw, r.fields.role, r.fields.exclusion, r.fields.inclusion, r.fields.date_range]} /></div>
              <div className="row-flex" style={{ marginTop: 10 }}>
                {r.source.section_id && <Button size="sm" onClick={async () => { try { setSection(await api.get(`/api/sections/${r.source.section_id}`)); } catch (e) { toastError(e); } }}>ดู Source {r.source.table !== "NOT_FOUND" ? "Table" : "Section"}</Button>}
                {r.source.table !== "NOT_FOUND" && <Badge status="REVISED">{r.source.table}</Badge>}
                {r.source.screenshot_id !== "NOT_FOUND" && <Button size="sm" onClick={() => setImg(r.source.screenshot_id)}>ดู Screenshot</Button>}
                <Link className="btn sm" href={`/projects/${pid}/traceability?req=${r.id}`}>Traceability</Link>
              </div>
              {!!r.versions?.length && <><h3 style={{ marginTop: 14 }}>ประวัติ Version</h3>{r.versions.map(v => <div key={v.version} className="small">v{v.version} · {v.kind} · {v.changed_by} · {fmtDate(v.created_at)} — {v.reason}<div className="muted">{v.changes.map(c => `${c.field}: ${String(c.old)} → ${String(c.new)}`).join(" · ")}</div></div>)}</>}
            </section>
            <section className="card" aria-label="Requirement">
              <div className="row-flex" style={{ marginBottom: 8 }}><h3 className="mono" style={{ margin: 0 }}>{r.req_id}</h3><Badge status={r.status} /><Badge>{r.type}</Badge><span className="small muted">v{r.version} · {r.origin}</span></div>
              <p><b>{r.title}</b></p>
              <dl className="kv">{FIELD_LABELS.map(([k, l]) => <Fragment key={k}><dt>{l}</dt><dd><NFValue v={r.fields[k]} /></dd></Fragment>)}<dt>Module</dt><dd>{r.module} / {r.submodule}</dd></dl>
              <div className="row-flex" style={{ marginTop: 12 }}>
                {can("req.edit") && r.status !== "DEPRECATED" && <Button size="sm" onClick={() => setEdit({ ...Object.fromEntries(EDITABLE.map(k => [k, r.fields[k]])), __title: r.title, __reason: "" })}>Edit (Version ใหม่)</Button>}
                {can("req.approve") && r.status === "AI_GENERATED" && <Button size="sm" onClick={() => run(() => api.post(`/api/requirements/${r.id}/review`, { text: "" }), "บันทึก Review แล้ว")}>Review</Button>}
                {can("req.approve") && !["APPROVED", "DEPRECATED"].includes(r.status) && <Button size="sm" variant="success" onClick={approve}>Approve</Button>}
                {can("comment") && <Button size="sm" onClick={async () => { const t = await prompt({ title: "เพิ่ม Comment", prompt: { label: "ข้อความ", required: true, multiline: true } }); if (t) await run(() => api.post(`/api/requirements/${r.id}/comments`, { text: t }), "เพิ่ม Comment แล้ว"); }}>Comment</Button>}
              </div>
              {!!r.comments?.length && <><h3 style={{ marginTop: 14 }}>Comments</h3>{r.comments.map(c => <div key={c.id} className="small"><b>{c.username}</b> · {fmtDate(c.created_at)}<div>{c.text}</div></div>)}</>}
            </section>
            <section className="card" aria-label="AI Analysis">
              <h3>AI Analysis</h3>
              <ScoreBar label="Completeness" score={r.completeness_score} /><Reasons items={r.completeness_reasons} />
              <div style={{ height: 8 }} />
              <ScoreBar label="Clarity" score={r.clarity_score} /><Reasons items={r.clarity_reasons} />
              <p className="small muted" style={{ marginTop: 8 }}>Engine: {String(r.ai_meta.engine ?? "rule")} · Model: {String(r.ai_meta.model ?? "-")} · Prompt: {String(r.ai_meta.prompt_version ?? "-")} · Confidence {r.ai_confidence}</p>
              {r.source_unverified && <div className="warnbox">AI อ้างข้อความที่ไม่พบตรงตัวในต้นฉบับ (-20 Clarity)</div>}
              <h3 style={{ marginTop: 10 }}>Found in BRS</h3><ul className="small">{r.ai_output.found_in_brs.slice(0, 8).map((x, i) => <li key={i}>{x}</li>)}</ul>
              {r.questions.length > 0 && <><h3>Clarification Questions</h3>{r.questions.map(q => <div key={q.id} className="small" style={{ marginBottom: 6 }}>
                <Badge status={q.resolved ? "RESOLVED" : "OPEN"} /> {q.text}{q.answer && <div className="muted">ตอบ: {q.answer}</div>}
                {q.assumption && <div><AssumptionLabel /> {q.assumption.text} <Badge status={q.assumption.state} /></div>}</div>)}
                <Link className="btn sm" href={`/projects/${pid}/clarifications?req=${r.id}`}>ไปที่ Clarification Center</Link></>}
              {!!r.conflicts?.length && <><h3 style={{ marginTop: 10 }}>Conflicts</h3>{r.conflicts.map(c => <div key={c.id} className="small"><Badge status={c.status} /> กับ {c.other} ({c.similarity}%) — {c.diffs.map(d => d.field).join(", ")}</div>)}</>}
              {r.ai_output.recommendations.length > 0 && <><h3 style={{ marginTop: 10 }}>Recommendations</h3><ul className="small">{r.ai_output.recommendations.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
            </section>
          </div>)}
      </>}
      <Dialog open={!!edit} onOpenChange={o => !o && setEdit(null)} title={`แก้ไข ${r?.req_id ?? ""} (สร้าง Version ใหม่)`} wide description="ค่าเดิมจะถูกเก็บใน Version History · ถ้า Requirement Approved แล้วต้อง Review/Approve ใหม่"
        footer={<><Button onClick={() => setEdit(null)}>ยกเลิก</Button><Button variant="primary" onClick={saveEdit}>บันทึก</Button></>}>
        {edit && <div className="grid g2">
          <div className="field" style={{ gridColumn: "1/-1" }}><label htmlFor="e-title">Title</label><input id="e-title" type="text" value={edit.__title} onChange={e => setEdit({ ...edit, __title: e.target.value })} /></div>
          {EDITABLE.map(k => <div className="field" key={k}><label htmlFor={`e-${k}`}>{k}</label><input id={`e-${k}`} type="text" value={edit[k] ?? ""} onChange={e => setEdit({ ...edit, [k]: e.target.value })} /></div>)}
          <div className="field" style={{ gridColumn: "1/-1" }}><label htmlFor="e-reason">เหตุผลการแก้ไข (บังคับ)</label><textarea id="e-reason" value={edit.__reason} onChange={e => setEdit({ ...edit, __reason: e.target.value })} /></div>
        </div>}
      </Dialog>
      <Dialog open={!!cmp} onOpenChange={o => !o && setCmp(null)} title={`Compare ${cmp?.a.req_id} ↔ ${cmp?.b.req_id}`} wide description={`ความคล้าย ${cmp?.similarity}%`}>
        {cmp && <><div className="split2">{[cmp.a, cmp.b].map(x => <div key={x.id} className="card"><b className="mono">{x.req_id}</b> <Badge status={x.status} /><div className="src" style={{ marginTop: 6 }}>{x.original_text}</div><p className="small muted">หน้า {x.source.page} · {x.source.section}</p></div>)}</div>
          <h3 style={{ marginTop: 10 }}>จุดที่ต่างกัน</h3>{cmp.diffs.length ? <table><tbody>{cmp.diffs.map((d, i) => <tr key={i}><td>{d.field}</td><td><mark>{d.a}</mark></td><td><mark>{d.b}</mark></td></tr>)}</tbody></table> : <p className="muted small">ไม่พบความต่างในฟิลด์หลัก</p>}</>}
      </Dialog>
      <Dialog open={!!section} onOpenChange={o => !o && setSection(null)} title={section?.title ?? ""} wide>
        {section?.rows ? <div className="tblwrap"><table><tbody>{section.rows.map((row, i) => <tr key={i}>{row.map((c, j) => i === 0 ? <th key={j}>{c}</th> : <td key={j}>{c}</td>)}</tr>)}</tbody></table></div> : <div className="src">{section?.text}</div>}
      </Dialog>
      <Dialog open={!!img} onOpenChange={o => !o && setImg(null)} title="Screenshot (Evidence)" wide description="NEEDS_VISUAL_REVIEW — ระบบไม่เดาข้อความในรูป">
        {img && <AuthImage src={`/api/images/${img}`} alt="screenshot" style={{ maxWidth: "100%" }} />}
      </Dialog>
    </AppShell>
  );
}

export default function RequirementsPage() { return <Suspense><Inner /></Suspense>; }
