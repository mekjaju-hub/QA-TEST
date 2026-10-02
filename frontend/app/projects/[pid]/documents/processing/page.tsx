"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AppShell, PageHead } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Empty, Loading, Progress } from "@/components/ui/states";
import { api } from "@/lib/api";
import { projectCrumbs, useProject } from "@/lib/hooks";
import type { Doc } from "@/lib/types";

export default function ProcessingList() {
  const { pid } = useParams<{ pid: string }>();
  const p = useProject(pid);
  const docs = useQuery({ queryKey: ["documents", pid], queryFn: () => api.get<Doc[]>(`/api/projects/${pid}/documents`), refetchInterval: 4000 });
  return (
    <AppShell crumbs={projectCrumbs(pid, p.data?.code, ["Processing"])}>
      <PageHead title="Document Processing" sub="สถานะการประมวลผลของทุกเอกสาร (Background Job)" />
      {docs.isLoading ? <Loading /> : !docs.data?.length ? <Empty title="ยังไม่มีเอกสาร" body="อัปโหลด BRS ก่อน" action={<Link className="btn pri" href={`/projects/${pid}/documents/upload`}>อัปโหลด</Link>} /> :
        <div className="tblwrap"><table><thead><tr><th>เอกสาร</th><th>Version</th><th>Stage</th><th>สถานะ</th><th>Progress</th></tr></thead><tbody>
          {docs.data.flatMap(d => d.versions.map(v => (
            <tr key={v.id}><td><Link href={`/projects/${pid}/documents/${d.id}/processing?v=${v.version}`}>{d.name}</Link></td><td>v{v.version}</td><td className="small">{v.job?.stage}</td>
              <td><Badge status={v.job?.status ?? v.status} /></td><td style={{ minWidth: 160 }}><Progress value={v.job?.progress ?? 0} /></td></tr>)))}
        </tbody></table></div>}
    </AppShell>
  );
}
