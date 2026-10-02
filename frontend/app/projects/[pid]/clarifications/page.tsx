"use client";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, PageHead, Rail } from "@/components/shell";
import { Highlight } from "@/components/req-bits";
import { AssumptionLabel, Badge, NFValue } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm";
import { Tabs, TabPanel } from "@/components/ui/tabs";
import { Empty, ErrorState, Loading } from "@/components/ui/states";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { projectCrumbs, useProject } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import type { Conflict } from "@/lib/types";
import { fmtDate } from "@/lib/utils";

type QRow = { requirement_id: string; req_id: string; req_status: string; original_text: string; source_page: string; source_section: string; question_id: string; key: string; field: string | null; text: string; answer: string; resolved: boolean; answered_by: string | null; resolved_by: string | null };
type ARow = { requirement_id: string; req_id: string; original_text: string; source_page: string; question_id: string; label: string; text: string; state: string; edited_by: string | null };
type Center = { questions: QRow[]; assumptions: ARow[]; conflicts: Conflict[] };

function Inner() {
  const { pid } = useParams<{ pid: string }>();
  const sp = useSearchParams();
  const reqFilter = sp.get("req");
  const p = useProject(pid);
  const { can } = useAuth();
  const qc = useQueryClient();
  const { toast, toastError } = useToast();
  const { prompt } = useConfirm();
  const [tab, setTab] = useState(sp.get("tab") ?? "questions");
  const [showResolved, setShowResolved] = useState(false);
  const [answer, setAnswer] = useState<{ row: QRow; text: string; field: string } | null>(null);
  const [resolve, setResolve] = useState<{ c: Conflict; keep: string; reason: string } | null>(null);
  const q = useQuery({ queryKey: ["clarifications", pid], queryFn: () => api.get<Center>(`/api/projects/${pid}/clarifications`) });
  const crumbs = projectCrumbs(pid, p.data?.code, ["Clarification & Conflict"]);
  const refresh = async () => { await qc.invalidateQueries({ queryKey: ["clarifications", pid] }); await qc.invalidateQueries({ queryKey: ["dashboard", pid] }); await qc.invalidateQueries({ queryKey: ["requirements", pid] }); };
  const post = async (url: string, body: unknown, msg: string) => { try { await api.post(url, body); toast(msg); await refresh(); return true; } catch (e) { toastError(e); return false; } };
  if (q.isLoading) return <AppShell crumbs={crumbs}><Loading /></AppShell>;
  if (q.error || !q.data) return <AppShell crumbs={crumbs}><ErrorState error={q.error} onRetry={() => q.refetch()} /></AppShell>;
  const qs_ = q.data.questions.filter(x => (!reqFilter || x.requirement_id === reqFilter) && (showResolved || !x.resolved));
  const as_ = q.data.assumptions.filter(x => !reqFilter || x.requirement_id === reqFilter);
  const cs = q.data.conflicts;
  const openQ = q.data.questions.filter(x => !x.resolved).length;
  const openC = cs.filter(c => c.status === "OPEN").length;
  return (
    <AppShell crumbs={crumbs}>
      <PageHead title="Clarification & Conflict Center" sub="BA ตอบคำถามและ Resolve · QA แก้ไข/ยอมรับ Assumption · Conflict ต้อง Resolve พร้อมเหตุผล (ระบบไม่เลือกฝั่งล่าสุดอัตโนมัติ)" />
      <Rail pid={pid} />
      {reqFilter && <div className="infobox">กรองเฉพาะ Requirement ที่เลือก · <Link href={`/projects/${pid}/clarifications`}>แสดงทั้งหมด</Link></div>}
      <Tabs value={tab} onValueChange={setTab} items={[{ value: "questions", label: `Questions (${openQ})` }, { value: "assumptions", label: `Assumptions (${as_.length})` }, { value: "conflicts", label: `Conflicts (${openC})` }]}>
        <TabPanel value="questions">
          <div className="toolbar"><label className="row-flex small"><input type="checkbox" checked={showResolved} onChange={e => setShowResolved(e.target.checked)} /> แสดงที่ Resolve แล้ว</label></div>
          {!qs_.length ? <Empty title="ไม่มีคำถามค้าง" body="Requirement ที่ชัดเจนแล้วพร้อม Approve" /> :
            <div className="tblwrap"><table><thead><tr><th>Requirement</th><th>Source</th><th>คำถามถึง BA</th><th>คำตอบ</th><th>สถานะ</th><th></th></tr></thead><tbody>
              {qs_.map(x => <tr key={x.question_id}>
                <td className="mono small"><Link href={`/projects/${pid}/requirements?sel=${x.requirement_id}`}>{x.req_id}</Link><div><Badge status={x.req_status} /></div></td>
                <td className="small" style={{ maxWidth: 320 }}><div className="src">{x.original_text}</div>หน้า <NFValue v={x.source_page} /> · {x.source_section}</td>
                <td>{x.text}</td><td className="small">{x.answer || <span className="muted">—</span>}{x.answered_by && <div className="muted">โดย {x.answered_by}</div>}</td>
                <td><Badge status={x.resolved ? "RESOLVED" : "OPEN"} /></td>
                <td className="row-flex">{!x.resolved && can("question.answer") && <Button size="sm" onClick={() => setAnswer({ row: x, text: x.answer, field: "" })}>ตอบ</Button>}
                  {!x.resolved && x.answer && can("question.resolve") && <Button size="sm" variant="success" onClick={() => post(`/api/requirements/${x.requirement_id}/resolve-question`, { question_id: x.question_id, resolve: true }, `Resolve แล้ว — ${x.req_id}`)}>Resolve Clarification</Button>}</td>
              </tr>)}</tbody></table></div>}
        </TabPanel>
        <TabPanel value="assumptions">
          {!as_.length ? <Empty title="ไม่มี Assumption" /> : <div className="tblwrap"><table><thead><tr><th>Requirement</th><th>Assumption</th><th>สถานะ</th><th></th></tr></thead><tbody>
            {as_.map(a => <tr key={a.question_id}><td className="mono small">{a.req_id}<div className="small muted">หน้า {a.source_page}</div></td>
              <td><AssumptionLabel /><div>{a.text}</div>{a.edited_by && <div className="small muted">แก้ไขโดย {a.edited_by}</div>}</td><td><Badge status={a.state} /></td>
              <td className="row-flex">{can("assumption.edit") && <>
                <Button size="sm" onClick={async () => { const t = await prompt({ title: "แก้ไข Assumption", body: "AI ASSUMPTION - NOT FOUND IN BRS — ห้ามนำไปแสดงเป็น Requirement ที่ยืนยันแล้ว", prompt: { label: "ข้อความ", initial: a.text, required: true, multiline: true } }); if (t) await post(`/api/requirements/${a.requirement_id}/assumption`, { question_id: a.question_id, text: t }, "แก้ไขแล้ว"); }}>แก้ไข</Button>
                {a.state !== "ACCEPTED" && <Button size="sm" variant="success" onClick={() => post(`/api/requirements/${a.requirement_id}/assumption`, { question_id: a.question_id, state: "ACCEPTED" }, "ยอมรับ Assumption")}>ยอมรับ</Button>}
                {a.state !== "REJECTED" && <Button size="sm" onClick={() => post(`/api/requirements/${a.requirement_id}/assumption`, { question_id: a.question_id, state: "REJECTED" }, "ปฏิเสธ Assumption")}>ปฏิเสธ</Button>}</>}</td></tr>)}
          </tbody></table></div>}
        </TabPanel>
        <TabPanel value="conflicts">
          {!cs.length ? <Empty title="ไม่พบ Conflict" /> : cs.map(c => (
            <div key={c.id} className="card" style={{ marginBottom: 12, borderLeft: `3px solid var(--${c.status === "OPEN" ? "red" : "green"})` }}>
              <div className="row-flex" style={{ marginBottom: 8 }}><Badge status={c.status} /><span className="small muted">ความคล้าย {c.similarity}% · {c.diffs.map(d => d.field).join(", ")}</span>
                {c.status === "RESOLVED" && <span className="small">→ {c.resolution} · {c.resolved_by} · เหตุผล: {c.reason}</span>}</div>
              <div className="split2">{(["a", "b"] as const).map(side => { const r = c[side]; if (!r) return null; return (
                <div key={side}><b className="mono">{r.req_id}</b> <Badge status={r.status} /><p className="small muted">หน้า <NFValue v={r.source.page} /> · {r.source.section}</p>
                  <div className="src"><Highlight text={r.original_text} needles={c.diffs.map(d => side === "a" ? d.a : d.b).concat(c.diffs.flatMap(d => d.field.startsWith("Operator") ? [r.fields.threshold_raw] : []))} /></div>
                  <table className="small" style={{ marginTop: 6 }}><tbody>{c.diffs.map(d => <tr key={d.field}><td>{d.field}</td><td><mark>{side === "a" ? d.a : d.b}</mark></td></tr>)}</tbody></table>
                  {c.status === "OPEN" && can("conflict.resolve") && <Button size="sm" style={{ marginTop: 8 }} onClick={() => setResolve({ c, keep: side, reason: "" })}>เลือก {r.req_id}</Button>}
                </div>); })}</div>
              {c.status === "OPEN" && can("conflict.resolve") && <Button size="sm" style={{ marginTop: 8 }} onClick={() => setResolve({ c, keep: "both", reason: "" })}>ไม่ขัดแย้ง — ใช้ทั้งสอง</Button>}
              <details className="small" style={{ marginTop: 8 }}><summary>ประวัติ</summary>{c.history.map((h, i) => <div key={i}>{fmtDate(h.at)} · {h.by} · {h.action}{h.reason && ` — ${h.reason}`}</div>)}</details>
            </div>))}
        </TabPanel>
      </Tabs>
      <Dialog open={!!answer} onOpenChange={o => !o && setAnswer(null)} title={`ตอบคำถาม ${answer?.row.req_id ?? ""}`} description={answer?.row.text}
        footer={<><Button onClick={() => setAnswer(null)}>ยกเลิก</Button>
          <Button disabled={!answer?.text.trim()} onClick={async () => { if (answer && await post(`/api/requirements/${answer.row.requirement_id}/resolve-question`, { question_id: answer.row.question_id, answer: answer.text }, "บันทึกคำตอบแล้ว")) setAnswer(null); }}>บันทึกคำตอบ</Button>
          {can("question.resolve") && <Button variant="success" disabled={!answer?.text.trim()} onClick={async () => { if (answer && await post(`/api/requirements/${answer.row.requirement_id}/resolve-question`, { question_id: answer.row.question_id, answer: answer.text, field_value: answer.field || undefined, resolve: true }, "ตอบและ Resolve แล้ว")) setAnswer(null); }}>ตอบและ Resolve</Button>}</>}>
        {answer && <><div className="src" style={{ marginBottom: 10 }}>{answer.row.original_text}</div>
          <div className="field"><label htmlFor="ans">คำตอบ</label><textarea id="ans" value={answer.text} onChange={e => setAnswer({ ...answer, text: e.target.value })} /></div>
          {answer.row.field && <div className="field"><label htmlFor="fv">อัปเดตฟิลด์ {answer.row.field} (ไม่บังคับ)</label><input id="fv" type="text" value={answer.field} onChange={e => setAnswer({ ...answer, field: e.target.value })} placeholder={answer.row.field === "threshold_op" ? ">=" : ""} /></div>}</>}
      </Dialog>
      <Dialog open={!!resolve} onOpenChange={o => !o && setResolve(null)} title="Resolve Conflict" description={resolve?.keep === "both" ? "ไม่ขัดแย้ง ใช้ทั้งสอง Requirement" : `เก็บ ${resolve?.c[resolve.keep as "a" | "b"]?.req_id} · อีกฝั่งจะเป็น DEPRECATED`}
        footer={<><Button onClick={() => setResolve(null)}>ยกเลิก</Button><Button variant="primary" disabled={(resolve?.reason.trim().length ?? 0) < 3}
          onClick={async () => { if (resolve && await post(`/api/requirements/${resolve.c.a!.id}/resolve-conflict`, { conflict_id: resolve.c.id, keep: resolve.keep, reason: resolve.reason }, "Resolve Conflict แล้ว")) setResolve(null); }}>ยืนยัน</Button></>}>
        {resolve && <div className="field"><label htmlFor="rr">เหตุผลในการเลือก (บังคับ, เก็บในประวัติ)</label><textarea id="rr" value={resolve.reason} onChange={e => setResolve({ ...resolve, reason: e.target.value })} /></div>}
      </Dialog>
    </AppShell>
  );
}

export default function ClarificationsPage() { return <Suspense><Inner /></Suspense>; }
