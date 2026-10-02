"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, PageHead } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabPanel } from "@/components/ui/tabs";
import { ErrorState, Loading } from "@/components/ui/states";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import type { Doc, Project, User } from "@/lib/types";
import { fmtDate } from "@/lib/utils";

export default function ProjectDetail() {
  const { pid } = useParams<{ pid: string }>();
  const { can } = useAuth();
  const qc = useQueryClient();
  const { toast, toastError } = useToast();
  const [tab, setTab] = useState("docs");
  const p = useQuery({ queryKey: ["project", pid], queryFn: () => api.get<Project>(`/api/projects/${pid}`) });
  const docs = useQuery({ queryKey: ["documents", pid], queryFn: () => api.get<Doc[]>(`/api/projects/${pid}/documents`) });
  const users = useQuery({ queryKey: ["users"], queryFn: () => api.get<User[]>("/api/users"), enabled: can("user.manage") });
  const [modules, setModules] = useState<string | null>(null);
  if (p.isLoading) return <AppShell crumbs={[["Projects", "/projects"]]}><Loading /></AppShell>;
  if (p.error || !p.data) return <AppShell crumbs={[["Projects", "/projects"]]}><ErrorState error={p.error} /></AppShell>;
  const pr = p.data;
  const saveModules = async () => {
    try {
      await api.patch(`/api/projects/${pid}`, { module_codes: (modules ?? "").split(",").map(s => s.trim()).filter(Boolean) });
      toast("บันทึก Module Codes แล้ว"); setModules(null); await qc.invalidateQueries({ queryKey: ["project", pid] });
    } catch (e) { toastError(e); }
  };
  return (
    <AppShell crumbs={[["Projects", "/projects"], [pr.code]]}>
      <PageHead title={`${pr.code} · ${pr.name}`} sub={pr.description || "—"} actions={<Link className="btn" href={`/projects/${pid}/dashboard`}>Dashboard</Link>} />
      <Tabs value={tab} onValueChange={setTab} items={[{ value: "docs", label: "Documents & Versions" }, { value: "members", label: "Members" }, { value: "modules", label: "Module Codes" }]}>
        <TabPanel value="docs">
          {docs.isLoading ? <Loading /> : <div className="tblwrap"><table><thead><tr><th>เอกสาร</th><th>Version</th><th>ไฟล์</th><th>SHA-256</th><th>สถานะ</th><th>Uploaded</th><th></th></tr></thead>
            <tbody>{docs.data?.flatMap(d => d.versions.map(v => (
              <tr key={v.id}><td>{d.name}</td><td>v{v.version}</td><td className="small">{v.filename} ({Math.round(v.size / 1024)} KB)</td><td className="mono small">{v.sha256.slice(0, 16)}…</td>
                <td><Badge status={v.job?.status ?? v.status} /></td><td className="small">{fmtDate(v.created_at)} · {v.created_by}</td>
                <td><Link className="btn sm" href={`/projects/${pid}/documents/${d.id}/processing?v=${v.version}`}>Processing</Link></td></tr>
            )))}</tbody></table></div>}
        </TabPanel>
        <TabPanel value="members">
          {can("user.manage") ? <div className="tblwrap"><table><thead><tr><th>User</th><th>Role</th><th>Active</th></tr></thead>
            <tbody>{users.data?.map(u => <tr key={u.id}><td>{u.username} <span className="muted small">{u.name}</span></td><td>{u.role_names.join(", ")}</td><td>{u.active ? "Yes" : "No"}</td></tr>)}</tbody></table></div>
            : <p className="muted">Local-first: ทุกผู้ใช้เห็นทุก Project ตาม Role (จัดการผู้ใช้ได้ที่ Settings โดย Admin)</p>}
        </TabPanel>
        <TabPanel value="modules">
          <p className="small muted">Module Code ใช้ใน ID เช่น REQ-{pr.code}-RULE3-001 — ระบบอ่านจากหัวข้อ (Rule 3 → RULE3) ถ้าไม่พบใช้ค่าเริ่มต้นของเอกสาร</p>
          {modules === null ? <div className="row-flex">{pr.module_codes.map(m => <Badge key={m} status="REVISED">{m}</Badge>)}{can("project.manage") && <Button size="sm" onClick={() => setModules(pr.module_codes.join(", "))}>แก้ไข</Button>}</div> :
            <div className="row-flex"><input type="text" value={modules} onChange={e => setModules(e.target.value)} aria-label="Module codes" style={{ maxWidth: 400 }} /><Button size="sm" variant="primary" onClick={saveModules}>บันทึก</Button><Button size="sm" onClick={() => setModules(null)}>ยกเลิก</Button></div>}
        </TabPanel>
      </Tabs>
    </AppShell>
  );
}
