"use client";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell, PageHead, useProjects } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Empty, ErrorState, Loading } from "@/components/ui/states";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { projectSchema, type ProjectInput } from "@/lib/schemas";
import { useToast } from "@/lib/toast";
import { fmtDate } from "@/lib/utils";

export default function ProjectsPage() {
  const q = useProjects();
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { toast, toastError } = useToast();
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<ProjectInput>({ resolver: zodResolver(projectSchema) });
  const onSubmit = async (v: ProjectInput) => {
    try {
      await api.post("/api/projects", projectSchema.parse(v));
      toast("สร้าง Project แล้ว"); setOpen(false); reset(); await qc.invalidateQueries({ queryKey: ["projects"] });
    } catch (e) { toastError(e); }
  };
  return (
    <AppShell crumbs={[["Projects"]]}>
      <PageHead title="Projects" sub="เลือกหรือสร้าง Project — Project Code เป็นส่วนหนึ่งของทุก ID (REQ-/TS-/TC-)"
        actions={can("project.manage") && <Button variant="primary" onClick={() => setOpen(true)}>Create Project</Button>} />
      {q.isLoading ? <Loading /> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data?.length ?
        <Empty title="ยังไม่มี Project" body={can("project.manage") ? "สร้าง Project แรก" : "ติดต่อ Admin เพื่อสร้าง Project"} /> :
        <div className="tblwrap"><table>
          <thead><tr><th>Code</th><th>Name</th><th>BRS Version ล่าสุด</th><th>Documents</th><th>Requirements</th><th>Test Cases</th><th>Updated</th></tr></thead>
          <tbody>{q.data.map(p => (
            <tr key={p.id}><td className="mono"><Link href={`/projects/${p.id}/dashboard`}>{p.code}</Link></td><td>{p.name}</td>
              <td>{p.latest_brs_version ? `v${p.latest_brs_version}` : "-"}</td><td>{p.document_count}</td><td>{p.requirement_count}</td><td>{p.test_case_count}</td><td className="small">{fmtDate(p.updated_at)}</td></tr>
          ))}</tbody></table></div>}
      <Dialog open={open} onOpenChange={setOpen} title="Create Project">
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="field"><label htmlFor="code">Project Code</label><input id="code" type="text" placeholder="CAM" {...register("code")} />{errors.code && <span className="small" style={{ color: "var(--red)" }}>{errors.code.message}</span>}</div>
          <div className="field"><label htmlFor="name">ชื่อ Project</label><input id="name" type="text" {...register("name")} />{errors.name && <span className="small" style={{ color: "var(--red)" }}>{errors.name.message}</span>}</div>
          <div className="field"><label htmlFor="desc">คำอธิบาย</label><textarea id="desc" {...register("description")} /></div>
          <div className="acts"><Button type="button" onClick={() => setOpen(false)}>ยกเลิก</Button><Button variant="primary" type="submit" loading={isSubmitting}>สร้าง</Button></div>
        </form>
      </Dialog>
    </AppShell>
  );
}
