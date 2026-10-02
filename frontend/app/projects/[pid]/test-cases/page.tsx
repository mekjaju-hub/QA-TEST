"use client";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, PageHead, Rail } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Empty, ErrorState, Loading } from "@/components/ui/states";
import { api, download, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { projectCrumbs, useProject } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import type { TestCaseBrief } from "@/lib/types";
import { TEST_TYPES } from "@/lib/utils";

type Row = Pick<TestCaseBrief, "title" | "given" | "when" | "then" | "priority" | "risk">;

function Inner() {
  const { pid } = useParams<{ pid: string }>();
  const sp = useSearchParams();
  const p = useProject(pid);
  const { can } = useAuth();
  const qc = useQueryClient();
  const { toast, toastError } = useToast();
  const { confirm, prompt } = useConfirm();
  const [f, setF] = useState({ q: "", type: "", status: sp.get("status") ?? "", priority: "", sort: "tc_id" });
  const [sel, setSel] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Row>>({});
  const q = useQuery({ queryKey: ["testcases", pid, f], queryFn: () => api.get<{ items: TestCaseBrief[]; statuses: string[] }>(`/api/projects/${pid}/test-cases${qs(f)}`) });
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["testcases", pid] }), qc.invalidateQueries({ queryKey: ["dashboard", pid] })]);
  const crumbs = projectCrumbs(pid, p.data?.code, ["Test Cases"]);
  const items = q.data?.items ?? [];
  const bulk = async (status: string) => {
    const ids = items.filter(t => sel.includes(t.id) && !t.locked).map(t => t.id);
    if (!ids.length) { toast("ไม่มีรายการที่เปลี่ยนสถานะได้ (Approved ถูก Lock)", true); return; }
    if (!(await confirm({ title: `${status === "APPROVED" ? "Approve" : status} Test Case`, body: `${ids.length} รายการ${status === "APPROVED" ? " · Test Case จะถูก Lock" : ""}`, confirmText: "ยืนยัน" }))) return;
    try { const r = await api.post<{ updated: number; errors: string[] }>("/api/test-cases/bulk-status", { ids, status, comment: "Bulk" }); toast(`อัปเดต ${r.updated} รายการ`); r.errors.forEach(e => toast(e, true)); setSel([]); await refresh(); } catch (e) { toastError(e); }
  };
  const saveDrafts = async () => {
    const changed = Object.entries(drafts);
    if (!changed.length) { setEditing(false); return; }
    const reason = await prompt({ title: "บันทึกการแก้ไขในตาราง", body: `${changed.length} รายการ · เก็บค่าเดิมใน Version History`, prompt: { label: "เหตุผล (บังคับ)", required: true } });
    if (!reason) return;
    let ok = 0;
    for (const [id, row] of changed) { try { await api.patch(`/api/test-cases/${id}`, { ...row, reason }); ok++; } catch (e) { toastError(e); } }
    toast(`บันทึก ${ok}/${changed.length} รายการ`); setDrafts({}); setEditing(false); await refresh();
  };
  const cell = (t: TestCaseBrief, k: keyof Row) => {
    const v = drafts[t.id]?.[k] ?? t[k];
    if (!editing || t.locked) return <span className={k === "title" ? "" : "small"}>{v}</span>;
    const set = (val: string) => setDrafts(d => ({ ...d, [t.id]: { ...(d[t.id] ?? { title: t.title, given: t.given, when: t.when, then: t.then, priority: t.priority, risk: t.risk }), [k]: val } }));
    if (k === "priority") return <select aria-label="Priority" value={v} onChange={e => set(e.target.value)}>{["Critical", "High", "Medium", "Low"].map(x => <option key={x}>{x}</option>)}</select>;
    if (k === "risk") return <select aria-label="Risk" value={v} onChange={e => set(e.target.value)}>{["High", "Medium", "Low"].map(x => <option key={x}>{x}</option>)}</select>;
    return <textarea aria-label={k} value={v} rows={2} onChange={e => set(e.target.value)} style={{ minWidth: 180, minHeight: 50 }} />;
  };
  return (
    <AppShell crumbs={crumbs}>
      <PageHead title="Test Case Review" sub="แก้ไขในตาราง · Approve แล้ว Lock · แก้ต้องสร้าง Version ใหม่"
        actions={<>{can("tc.export") && <Button onClick={() => download(`/api/projects/${pid}/test-cases/export`, "test-cases.xlsx").catch(toastError)}>Export Excel</Button>}
          {can("tc.edit") && (editing ? <><Button variant="primary" onClick={saveDrafts}>บันทึกการแก้ไข ({Object.keys(drafts).length})</Button><Button onClick={() => { setDrafts({}); setEditing(false); }}>ยกเลิก</Button></> : <Button onClick={() => setEditing(true)}>แก้ไขในตาราง</Button>)}
          {can("tc.approve") && <><Button variant="success" disabled={!sel.length} onClick={() => bulk("APPROVED")}>Approve ({sel.length})</Button><Button disabled={!sel.length} onClick={() => bulk("NEEDS_CLARIFICATION")}>Needs Clarification</Button></>}</>} />
      <Rail pid={pid} />
      <div className="toolbar">
        <input type="text" placeholder="ค้นหา TC / REQ / Title" aria-label="ค้นหา" value={f.q} onChange={e => setF({ ...f, q: e.target.value })} />
        <select aria-label="Test Type" value={f.type} onChange={e => setF({ ...f, type: e.target.value })}><option value="">ทุก Type</option>{TEST_TYPES.map(t => <option key={t}>{t}</option>)}</select>
        <select aria-label="Status" value={f.status} onChange={e => setF({ ...f, status: e.target.value })}><option value="">ทุก Status</option>{q.data?.statuses.map(t => <option key={t}>{t}</option>)}</select>
        <select aria-label="Priority" value={f.priority} onChange={e => setF({ ...f, priority: e.target.value })}><option value="">ทุก Priority</option>{["Critical", "High", "Medium", "Low"].map(t => <option key={t}>{t}</option>)}</select>
        <select aria-label="Sort" value={f.sort} onChange={e => setF({ ...f, sort: e.target.value })}><option value="tc_id">เรียงตาม ID</option><option value="priority">Priority</option><option value="status">Status</option><option value="updated">แก้ไขล่าสุด</option></select>
        <span className="sp" /><span className="small muted">{items.length} รายการ</span>
      </div>
      {q.isLoading ? <Loading /> : q.error ? <ErrorState error={q.error} /> : !items.length ? <Empty title="ยังไม่มี Test Case" body="สร้างจากหน้า Test Scenarios" action={<Link className="btn" href={`/projects/${pid}/test-scenarios`}>ไปที่ Test Scenarios</Link>} /> :
        <div className="tblwrap"><table><thead><tr><th><input type="checkbox" aria-label="เลือกทั้งหมด" checked={sel.length === items.length} onChange={e => setSel(e.target.checked ? items.map(t => t.id) : [])} /></th><th>Test Case ID</th><th>Title</th><th>Given</th><th>When</th><th>Then</th><th>Type</th><th>Priority</th><th>Risk</th><th>Status</th></tr></thead><tbody>
          {items.map(t => <tr key={t.id}>
            <td><input type="checkbox" aria-label={`เลือก ${t.tc_id}`} checked={sel.includes(t.id)} onChange={e => setSel(x => e.target.checked ? [...x, t.id] : x.filter(i => i !== t.id))} /></td>
            <td className="mono small"><Link href={`/projects/${pid}/test-cases/${t.id}`}>{t.tc_id}</Link> <span className="muted">v{t.version}</span>{t.locked && <div className="locked">🔒 Locked</div>}<div className="muted">{t.req_id}</div></td>
            <td>{cell(t, "title")}</td><td>{cell(t, "given")}</td><td>{cell(t, "when")}</td><td>{cell(t, "then")}</td><td>{t.type}</td><td>{cell(t, "priority")}</td><td>{cell(t, "risk")}</td><td><Badge status={t.status} /></td></tr>)}
        </tbody></table></div>}
    </AppShell>
  );
}

export default function TestCasesPage() { return <Suspense><Inner /></Suspense>; }
