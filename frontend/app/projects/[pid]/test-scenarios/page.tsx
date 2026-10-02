"use client";
import Link from "next/link";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, PageHead, Rail } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Empty, ErrorState, Loading } from "@/components/ui/states";
import { api, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { projectCrumbs, useProject } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import type { Scenario } from "@/lib/types";
import { TEST_TYPES } from "@/lib/utils";

type List = { items: Scenario[]; blocked_requirements: string[]; approved_requirement_count: number };

export default function ScenariosPage() {
  const { pid } = useParams<{ pid: string }>();
  const router = useRouter();
  const p = useProject(pid);
  const { can } = useAuth();
  const qc = useQueryClient();
  const { toast, toastError } = useToast();
  const { prompt } = useConfirm();
  const [f, setF] = useState({ q: "", type: "", status: "" });
  const [sel, setSel] = useState<string[]>([]);
  const q = useQuery({ queryKey: ["scenarios", pid, f], queryFn: () => api.get<List>(`/api/projects/${pid}/test-scenarios${qs(f)}`) });
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["scenarios", pid] }), qc.invalidateQueries({ queryKey: ["dashboard", pid] })]);
  const crumbs = projectCrumbs(pid, p.data?.code, ["Test Scenarios"]);
  const gen = async () => { try { const r = await api.post<{ created: number; skipped: string[] }>(`/api/projects/${pid}/test-scenarios/generate`, {}); toast(`สร้าง Scenario ใหม่ ${r.created} รายการ (ข้ามรายการซ้ำอัตโนมัติ)`); await refresh(); } catch (e) { toastError(e); } };
  const genTc = async () => {
    try {
      const r = await api.post<{ created: number; blocked: string[] }>(`/api/projects/${pid}/test-cases/generate`, { scenario_ids: sel });
      if (r.blocked.length) toast(`ข้าม ${r.blocked.length} Scenario: ${r.blocked.join(", ")}`, true);
      toast(`สร้าง Test Case ${r.created} รายการ`); setSel([]); router.push(`/projects/${pid}/test-cases`);
    } catch (e) { toastError(e); }
  };
  const patch = async (s: Scenario, body: object, msg: string) => { try { await api.patch(`/api/test-scenarios/${s.id}`, body); toast(msg); await refresh(); } catch (e) { toastError(e); } };
  const d = q.data;
  return (
    <AppShell crumbs={crumbs}>
      <PageHead title="Test Scenario Review" sub="สร้างจาก Requirement ที่ Approved เท่านั้น · ป้องกัน Scenario ซ้ำ (Requirement + Test Type)"
        actions={can("scenario.edit") && <><Button onClick={gen} disabled={!d?.approved_requirement_count}>Generate Scenarios ({d?.approved_requirement_count ?? 0} Requirement)</Button>
          {can("tc.edit") && <Button variant="primary" onClick={genTc} disabled={!sel.length}>สร้าง Test Case จาก Scenario ที่เลือก ({sel.length})</Button>}</>} />
      <Rail pid={pid} />
      {!!d?.blocked_requirements.length && <div className="warnbox">{d.blocked_requirements.length} Requirement ยังเป็น NEEDS_CLARIFICATION หรือ CONFLICT จึงยังสร้าง Scenario/Test Case ไม่ได้ <Link href={`/projects/${pid}/clarifications`}>ไปที่ Clarification Center</Link></div>}
      <div className="toolbar">
        <input type="text" placeholder="ค้นหา" aria-label="ค้นหา" value={f.q} onChange={e => setF({ ...f, q: e.target.value })} />
        <select aria-label="Test Type" value={f.type} onChange={e => setF({ ...f, type: e.target.value })}><option value="">ทุก Test Type</option>{TEST_TYPES.map(t => <option key={t}>{t}</option>)}</select>
        <select aria-label="Status" value={f.status} onChange={e => setF({ ...f, status: e.target.value })}><option value="">ทุก Status</option>{["AI_GENERATED", "WAITING_FOR_REVIEW", "APPROVED", "DEPRECATED"].map(t => <option key={t}>{t}</option>)}</select>
        <Button size="sm" onClick={() => setSel((d?.items ?? []).filter(s => s.status !== "DEPRECATED" && !s.test_case_count).map(s => s.id))}>เลือกทั้งหมดที่ยังไม่มี Test Case</Button>
      </div>
      {q.isLoading ? <Loading /> : q.error ? <ErrorState error={q.error} /> : !d?.items.length ?
        <Empty title="ยังไม่มี Test Scenario" body={d?.approved_requirement_count ? "กด Generate Scenarios เพื่อสร้างจาก Requirement ที่ Approved" : "ต้อง Approve Requirement ใน Requirement Explorer ก่อน"} action={<Link className="btn" href={`/projects/${pid}/requirements`}>ไปที่ Requirement Explorer</Link>} /> :
        <div className="tblwrap"><table><thead><tr><th><span className="hide">เลือก</span></th><th>Scenario ID</th><th>Requirement</th><th>Title</th><th>Type</th><th>Priority</th><th>Risk</th><th>Test Case</th><th>Status</th><th></th></tr></thead><tbody>
          {d.items.map(s => <tr key={s.id}>
            <td><input type="checkbox" aria-label={`เลือก ${s.ts_id}`} checked={sel.includes(s.id)} onChange={e => setSel(x => e.target.checked ? [...x, s.id] : x.filter(i => i !== s.id))} /></td>
            <td className="mono">{s.ts_id}</td><td className="mono small"><Link href={`/projects/${pid}/requirements?sel=${s.requirement_id}`}>{s.req_id}</Link></td>
            <td>{s.title}<details><summary className="small muted">AI Rationale</summary><div className="small">{s.rationale}<br />{s.pr_reasons.map((r, i) => <div key={i}>{r}</div>)}</div></details></td>
            <td>{s.type}</td><td>{s.priority}</td><td>{s.risk}</td><td>{s.test_case_count}</td><td><Badge status={s.status} /></td>
            <td className="row-flex">{can("scenario.edit") && s.status !== "APPROVED" && s.status !== "DEPRECATED" && <Button size="sm" variant="success" onClick={() => patch(s, { status: "APPROVED", reason: "Approve" }, `Approve ${s.ts_id}`)}>Approve</Button>}
              {can("scenario.edit") && s.status !== "DEPRECATED" && <Button size="sm" onClick={async () => { const t = await prompt({ title: `แก้ไข Scenario ${s.ts_id}`, prompt: { label: "Title", initial: s.title, required: true } }); if (t) await patch(s, { title: t, reason: "แก้ไข Title" }, "บันทึกแล้ว"); }}>แก้ไข</Button>}</td></tr>)}
        </tbody></table></div>}
    </AppShell>
  );
}
