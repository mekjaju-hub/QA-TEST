"use client";
import Link from "next/link";
import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AppShell, PageHead } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Empty, ErrorState, Loading } from "@/components/ui/states";
import { api, qs } from "@/lib/api";
import { projectCrumbs, useProject } from "@/lib/hooks";
import { STATUS_COLOR } from "@/lib/utils";

type TC = { id: string; tc_id: string; version: number; status: string; artifacts: { id: string; kind: string; name: string; is_draft: boolean }[]; results: { run_id: string; status: string; name: string; at: string }[] };
type Chain = { document: { id: string; name: string } | null; version: number; section: { id?: string; title: string | null; page?: number | null }; requirement: { id: string; req_id: string; status: string; title: string; version: number };
  scenarios: { id: string; ts_id: string; type: string; status: string; test_cases: TC[] }[] };

const node = (status: string) => ({ ["--c" as string]: `var(--${STATUS_COLOR[status] ?? "blue"})` });

function Inner() {
  const { pid } = useParams<{ pid: string }>();
  const sp = useSearchParams();
  const p = useProject(pid);
  const req = sp.get("req"), tc = sp.get("tc");
  const q = useQuery({ queryKey: ["trace", pid, req, tc], queryFn: () => api.get<{ chains: Chain[] }>(`/api/projects/${pid}/traceability${qs({ requirement_id: req, test_case_id: tc })}`) });
  const crumbs = projectCrumbs(pid, p.data?.code, ["Traceability"]);
  return (
    <AppShell crumbs={crumbs}>
      <PageHead title="Traceability Viewer" sub="Document → Version → Section → Requirement → Scenario → Test Case → Artifacts → Run → Result" />
      {q.isLoading ? <Loading /> : q.error ? <ErrorState error={q.error} /> : !q.data?.chains.length ? <Empty title="ไม่พบข้อมูล" /> :
        q.data.chains.map(c => (
          <div key={c.requirement.id} className="card" style={{ marginBottom: 12 }}>
            <div className="trace">
              <div className="col"><h4>Document / Version</h4><div className="node">{c.document?.name ?? "-"} · v{c.version}</div></div>
              <div className="col"><h4>Section</h4><div className="node">{c.section.title} {c.section.page ? `· หน้า ${c.section.page}` : ""}</div></div>
              <div className="col"><h4>Requirement</h4><Link href={`/projects/${pid}/requirements?sel=${c.requirement.id}`} className="node" style={{ display: "block", ...node(c.requirement.status) }}><b className="mono">{c.requirement.req_id}</b> v{c.requirement.version}<br /><Badge status={c.requirement.status} /></Link></div>
              <div className="col"><h4>Scenario</h4>{c.scenarios.map(s => <div key={s.id} className="node" style={node(s.status)}><span className="mono">{s.ts_id}</span> · {s.type}</div>)}{!c.scenarios.length && <div className="small muted">—</div>}</div>
              <div className="col"><h4>Test Case</h4>{c.scenarios.flatMap(s => s.test_cases).map(t => <Link key={t.id} href={`/projects/${pid}/test-cases/${t.id}`} className="node" style={{ display: "block", ...node(t.status) }}><span className="mono">{t.tc_id}</span> v{t.version}<br /><Badge status={t.status} /></Link>)}</div>
              <div className="col"><h4>Automation Artifacts</h4>{c.scenarios.flatMap(s => s.test_cases).flatMap(t => t.artifacts.map(a => <Link key={t.id + a.id} href={`/projects/${pid}/automation/${a.kind}?artifact=${a.id}`} className="node" style={{ display: "block" }}>{a.kind}: {a.name}{a.is_draft && " (DRAFT)"}</Link>))}</div>
              <div className="col"><h4>Run → Result</h4>{c.scenarios.flatMap(s => s.test_cases).flatMap(t => t.results.map((r, i) => <Link key={t.id + i} href={`/projects/${pid}/test-runs/${r.run_id}`} className="node" style={{ display: "block", ...node(r.status) }}>{t.tc_id}: <Badge status={r.status} /></Link>))}</div>
            </div>
          </div>))}
    </AppShell>
  );
}

export default function TraceabilityPage() { return <Suspense><Inner /></Suspense>; }
