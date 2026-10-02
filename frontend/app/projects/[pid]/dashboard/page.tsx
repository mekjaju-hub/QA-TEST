"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AppShell, PageHead, Rail } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Empty, ErrorState, Loading, Progress } from "@/components/ui/states";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Project, Run } from "@/lib/types";
import { STATUS_COLOR, fmtDate } from "@/lib/utils";

type Dash = {
  project: Project; kpi: Record<string, number>; test_cases_by_status: Record<string, number>; last_run: Run | null;
  recent_runs: { id: string; status: string; summary: Record<string, number>; started_at: string; source: string }[];
  processing_jobs: { document: string; version: number; job_id: string; status: string; stage: string; progress: number; started_at: string }[];
  latest_brs: { document: string; version: number; uploaded_at: string } | null;
};

function Bars({ data, total }: { data: [string, number][]; total: number }) {
  return <div className="chart">{data.map(([k, v]) => (
    <div className="row" key={k}><span>{k}</span><span className="bar"><i style={{ width: `${total ? (v / total) * 100 : 0}%`, background: `var(--${STATUS_COLOR[k] ?? "gray"})` }} /></span><b>{v}</b></div>
  ))}</div>;
}

export default function Dashboard() {
  const { pid } = useParams<{ pid: string }>();
  const { can } = useAuth();
  const q = useQuery({ queryKey: ["dashboard", pid], queryFn: () => api.get<Dash>(`/api/projects/${pid}/dashboard`), refetchInterval: 10000 });
  const d = q.data;
  const crumbs: [string, string?][] = [["Projects", "/projects"], [d?.project.code ?? "…", `/projects/${pid}`], ["Dashboard"]];
  if (q.isLoading) return <AppShell crumbs={crumbs}><Loading /></AppShell>;
  if (q.error || !d) return <AppShell crumbs={crumbs}><ErrorState error={q.error} onRetry={() => q.refetch()} /></AppShell>;
  const k = d.kpi;
  const cards: [string, number | string, string, string][] = [
    ["Requirement", k.requirements, "requirements", "var(--ink)"], ["Needs Clarification", k.needs_clarification, "requirements?status=NEEDS_CLARIFICATION", "var(--orange)"],
    ["Conflict", k.conflicts, "clarifications?tab=conflicts", "var(--red)"], ["Test Scenario", k.test_scenarios, "test-scenarios", "var(--ink)"],
    ["Test Case", k.test_cases, "test-cases", "var(--ink)"], ["Approved", k.approved, "test-cases?status=APPROVED", "var(--green)"],
    ["Ready for Automation", k.ready_for_automation, "test-cases?status=READY_FOR_AUTOMATION", "var(--green)"], ["Automation Coverage", `${k.automation_coverage}%`, "automation/pytest", "var(--blue)"],
  ];
  const lr = d.last_run;
  return (
    <AppShell crumbs={crumbs}>
      <PageHead title="Dashboard" sub={d.latest_brs ? <>BRS ล่าสุด: {d.latest_brs.document} v{d.latest_brs.version} ({fmtDate(d.latest_brs.uploaded_at)})</> : "ยังไม่มีเอกสาร BRS"} />
      <Rail pid={pid} />
      {!d.latest_brs ? <Empty title="ยังไม่มีเอกสาร" body="เริ่มจากอัปโหลด BRS" action={can("doc.upload") && <Link className="btn pri" href={`/projects/${pid}/documents/upload`}>อัปโหลด BRS</Link>} /> : <>
        <div className="grid g4" style={{ marginBottom: 14 }}>
          {cards.map(([label, v, href, c]) => <Link key={label} className="card kpi" href={`/projects/${pid}/${href}`}><div className="v" style={{ color: c }}>{v}</div><div className="k">{label}</div></Link>)}
        </div>
        <div className="grid g2" style={{ marginBottom: 14 }}>
          <div className="card"><h2>Test Case ตาม Status</h2>{Object.keys(d.test_cases_by_status).length ? <Bars data={Object.entries(d.test_cases_by_status)} total={k.test_cases} /> : <p className="muted small">ยังไม่มี Test Case</p>}
            <p className="small muted" style={{ marginTop: 8 }}>Automated {k.automated} · Manual {k.manual}</p></div>
          <div className="card"><h2>Pass / Fail / Blocked — Run ล่าสุด</h2>{lr ? <>
            <Bars data={[["PASSED", lr.summary.passed ?? 0], ["FAILED", lr.summary.failed ?? 0], ["BLOCKED", lr.summary.blocked ?? 0]]} total={lr.summary.total ?? 0} />
            <p className="small" style={{ marginTop: 8 }}><Link href={`/projects/${pid}/test-runs/${lr.id}`}>ดูรายละเอียด Run</Link> · {fmtDate(lr.started_at)}</p></> : <p className="muted small">ยังไม่มี Test Run</p>}</div>
        </div>
        <div className="grid g2">
          <div className="card"><h2>Document Processing</h2>
            <table><tbody>{d.processing_jobs.map(j => <tr key={j.job_id}><td>{j.document} v{j.version}</td><td><Badge status={j.status} /></td><td style={{ minWidth: 120 }}><Progress value={j.progress} /></td></tr>)}</tbody></table></div>
          <div className="card"><h2>Test Run ล่าสุด</h2>{d.recent_runs.length ? <table><tbody>{d.recent_runs.map(r => <tr key={r.id}><td><Link href={`/projects/${pid}/test-runs/${r.id}`} className="mono small">{r.id.slice(0, 8)}</Link></td><td>{r.source}</td><td><Badge status={r.status} /></td><td className="small">{r.summary.passed ?? 0}/{r.summary.total ?? 0} passed</td><td className="small">{fmtDate(r.started_at)}</td></tr>)}</tbody></table> : <p className="muted small">—</p>}</div>
        </div></>}
    </AppShell>
  );
}
