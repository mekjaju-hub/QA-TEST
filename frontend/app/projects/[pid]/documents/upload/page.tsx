"use client";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AppShell, PageHead } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabPanel } from "@/components/ui/tabs";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { projectCrumbs, useProject } from "@/lib/hooks";
import { pasteSchema, type PasteInput } from "@/lib/schemas";
import { useToast } from "@/lib/toast";
import type { Doc, DocVersion } from "@/lib/types";

const ACCEPT = ".docx,.xlsx,.csv,.pdf,.txt";
type Result = { name: string; ok: boolean; msg: string; docId?: string; version?: number };

export default function UploadPage() {
  const { pid } = useParams<{ pid: string }>();
  const router = useRouter();
  const { settings, can } = useAuth();
  const p = useProject(pid);
  const docs = useQuery({ queryKey: ["documents", pid], queryFn: () => api.get<Doc[]>(`/api/projects/${pid}/documents`) });
  const { toast } = useToast();
  const [tab, setTab] = useState("file");
  const [target, setTarget] = useState("");
  const [module, setModule] = useState("GENERAL");
  const [mode, setMode] = useState(settings?.ai_mode === "claude" && settings.claude_configured ? "claude" : "rule");
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const paste = useForm<PasteInput>({ resolver: zodResolver(pasteSchema) });

  const uploadFiles = async (files: FileList | File[]) => {
    setBusy(true);
    const out: Result[] = [];
    for (const f of Array.from(files)) {  // per-file errors do not cancel other files
      const fd = new FormData();
      fd.append("file", f); fd.append("default_module", module); fd.append("ai_mode", mode); fd.append("auto_process", "true");
      if (target) fd.append("document_id", target);
      try {
        const r = await api.upload<{ document: Doc; version: DocVersion }>(`/api/projects/${pid}/documents`, fd);
        out.push({ name: f.name, ok: true, msg: `v${r.version.version} · SHA-256 ${r.version.sha256.slice(0, 12)}…`, docId: r.document.id, version: r.version.version });
      } catch (e) {
        out.push({ name: f.name, ok: false, msg: e instanceof ApiError ? `${e.body.code}: ${e.body.user_message}${e.body.suggested_action ? " — " + e.body.suggested_action : ""}` : String(e) });
      }
      setResults([...out]);
    }
    setBusy(false);
    void docs.refetch();
    if (out.some(r => r.ok)) toast(`อัปโหลดสำเร็จ ${out.filter(r => r.ok).length}/${out.length} ไฟล์ — เริ่มประมวลผลแล้ว`);
  };

  const onPaste = async (v: PasteInput) => {
    try {
      const r = await api.post<{ document: Doc; version: DocVersion }>(`/api/projects/${pid}/paste-text`, { ...v, document_id: target || null, default_module: module, ai_mode: mode });
      router.push(`/projects/${pid}/documents/${r.document.id}/processing?v=${r.version.version}`);
    } catch (e) { paste.setError("text", { message: e instanceof ApiError ? e.body.user_message : String(e) }); }
  };

  if (!can("doc.upload")) return <AppShell crumbs={projectCrumbs(pid, p.data?.code, ["Upload"])}><div className="err-box">คุณไม่มีสิทธิ์อัปโหลดเอกสาร (doc.upload)</div></AppShell>;
  return (
    <AppShell crumbs={projectCrumbs(pid, p.data?.code, ["Upload"])}>
      <PageHead title="Document Upload" sub={`รองรับ DOCX, XLSX, CSV, PDF (เลือกข้อความได้), TXT และ Copy/Paste · สูงสุด ${settings?.max_upload_mb ?? 50} MB/ไฟล์ · ตรวจชนิดไฟล์จากเนื้อหา + SHA-256`} />
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="grid g3">
          <div className="field"><label htmlFor="tgt">เอกสาร</label><select id="tgt" value={target} onChange={e => setTarget(e.target.value)}>
            <option value="">เอกสารใหม่</option>{docs.data?.map(d => <option key={d.id} value={d.id}>Version ใหม่ของ: {d.name} (ปัจจุบัน v{d.latest_version})</option>)}</select></div>
          <div className="field"><label htmlFor="mod">Module Code เริ่มต้น</label><input id="mod" type="text" value={module} onChange={e => setModule(e.target.value.toUpperCase())} /></div>
          <div className="field"><label htmlFor="mode">วิธีวิเคราะห์</label><select id="mode" value={mode} onChange={e => setMode(e.target.value)}>
            <option value="rule">Rule Engine (Offline, Deterministic)</option>
            <option value="claude" disabled={!settings?.claude_configured}>Claude AI {settings?.claude_configured ? `(${settings.claude_model})` : "— NEEDS_CONFIGURATION"}</option></select></div>
        </div>
        <p className="small muted">Vision Model: {settings?.vision_enabled ? "เปิด" : "ปิด — รูปภาพหน้าจอจะถูกเก็บเป็น Evidence สถานะ NEEDS_VISUAL_REVIEW (ไม่เดาข้อความในรูป)"}</p>
      </div>
      <Tabs value={tab} onValueChange={setTab} items={[{ value: "file", label: "Upload File" }, { value: "paste", label: "Paste Text" }]}>
        <TabPanel value="file">
          <div className={`drop ${over ? "over" : ""}`} role="button" tabIndex={0} aria-label="ลากไฟล์มาวาง หรือคลิกเพื่อเลือกไฟล์"
            onClick={() => input.current?.click()} onKeyDown={e => { if (e.key === "Enter") input.current?.click(); }}
            onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={e => { e.preventDefault(); setOver(false); void uploadFiles(e.dataTransfer.files); }}>
            <b>ลากไฟล์มาวางที่นี่ หรือคลิกเพื่อเลือก (หลายไฟล์ได้)</b><div className="small muted">{ACCEPT}</div>
            <input ref={input} type="file" multiple accept={ACCEPT} className="hide" data-testid="file-input" onChange={e => e.target.files && void uploadFiles(e.target.files)} />
          </div>
          {busy && <p className="small">กำลังอัปโหลด…</p>}
          {results.length > 0 && <div className="tblwrap" style={{ marginTop: 12 }}><table><thead><tr><th>ไฟล์</th><th>ผลลัพธ์</th><th></th></tr></thead><tbody>
            {results.map((r, i) => <tr key={i}><td>{r.name}</td><td>{r.ok ? <Badge status="DONE">สำเร็จ</Badge> : <Badge status="FAILED">ล้มเหลว</Badge>} <span className="small">{r.msg}</span></td>
              <td>{r.ok && <a className="btn sm" href={`/projects/${pid}/documents/${r.docId}/processing?v=${r.version}`}>ดู Processing</a>}</td></tr>)}</tbody></table></div>}
        </TabPanel>
        <TabPanel value="paste">
          <form onSubmit={paste.handleSubmit(onPaste)} noValidate>
            <div className="field"><label htmlFor="pt">ชื่อเอกสาร (Virtual Document)</label><input id="pt" type="text" {...paste.register("title")} />{paste.formState.errors.title && <span className="small" style={{ color: "var(--red)" }}>{paste.formState.errors.title.message}</span>}</div>
            <div className="field"><label htmlFor="px">ข้อความ BRS</label><textarea id="px" rows={14} {...paste.register("text")} />{paste.formState.errors.text && <span className="small" style={{ color: "var(--red)" }}>{paste.formState.errors.text.message}</span>}</div>
            <Button variant="primary" type="submit" loading={paste.formState.isSubmitting}>บันทึกและเริ่มวิเคราะห์</Button>
          </form>
        </TabPanel>
      </Tabs>
    </AppShell>
  );
}
