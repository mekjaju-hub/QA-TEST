"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, PageHead } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Tabs, TabPanel } from "@/components/ui/tabs";
import { ErrorState, Loading } from "@/components/ui/states";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import type { PublicSettings, User } from "@/lib/types";
import { fmtDate } from "@/lib/utils";

type S = { settings: PublicSettings & { github_owner?: string; github_repo?: string }; roles: Record<string, string>; network_warning: string };

export default function SettingsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const { toast, toastError } = useToast();
  const [tab, setTab] = useState("users");
  const [newUser, setNewUser] = useState<{ username: string; name: string; role: string; password: string } | null>(null);
  const s = useQuery({ queryKey: ["settings"], queryFn: () => api.get<S>("/api/settings"), enabled: can("settings") });
  const users = useQuery({ queryKey: ["users"], queryFn: () => api.get<User[]>("/api/users"), enabled: can("user.manage") });
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  if (!can("settings")) return <AppShell crumbs={[["Settings"]]}><div className="err-box">เฉพาะ Admin</div></AppShell>;
  if (s.isLoading) return <AppShell crumbs={[["Settings"]]}><Loading /></AppShell>;
  if (s.error || !s.data) return <AppShell crumbs={[["Settings"]]}><ErrorState error={s.error} /></AppShell>;
  const st = { ...s.data.settings, ...draft } as Record<string, unknown>;
  const save = async () => { try { await api.patch("/api/settings", { values: draft }); toast("บันทึก Settings แล้ว"); setDraft({}); await qc.invalidateQueries({ queryKey: ["settings"] }); } catch (e) { toastError(e); } };
  const patchUser = async (u: User, body: object, msg: string) => { try { await api.patch(`/api/users/${u.id}`, body); toast(msg); await users.refetch(); } catch (e) { toastError(e); } };
  const num = (k: string, label: string) => <div className="field"><label htmlFor={k}>{label}</label><input id={k} type="number" value={Number(st[k] ?? 0)} onChange={e => setDraft({ ...draft, [k]: Number(e.target.value) })} /></div>;
  return (
    <AppShell crumbs={[["Settings"]]}>
      <PageHead title="Settings" sub="Secret (CLAUDE_API_KEY, GITHUB_TOKEN, SECRET_KEY) ตั้งใน .env ฝั่ง Server เท่านั้น — หน้าเว็บแสดงเพียงสถานะว่าตั้งค่าแล้วหรือไม่" actions={Object.keys(draft).length > 0 && <Button variant="primary" onClick={save}>บันทึก ({Object.keys(draft).length})</Button>} />
      <Tabs value={tab} onValueChange={setTab} items={["users", "ai", "runner", "github", "env", "network", "session"].map(v => ({ value: v, label: { users: "Users & Roles", ai: "AI Provider", runner: "Test Runner", github: "GitHub", env: "Environments", network: "Network Sharing", session: "Session" }[v]! }))}>
        <TabPanel value="users">
          <div className="toolbar"><Button variant="primary" onClick={() => setNewUser({ username: "", name: "", role: "QA_MANUAL", password: "" })}>เพิ่มผู้ใช้</Button></div>
          <div className="tblwrap"><table><thead><tr><th>Username</th><th>ชื่อ</th><th>Role</th><th>Active</th><th>Last login</th><th></th></tr></thead><tbody>
            {users.data?.map(u => <tr key={u.id}><td className="mono">{u.username}</td><td>{u.name}</td>
              <td><select aria-label={`role ${u.username}`} value={u.roles[0]} onChange={e => patchUser(u, { roles: [e.target.value] }, "เปลี่ยน Role แล้ว")}>{Object.entries(s.data!.roles).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
              <td>{u.active ? <Badge status="APPROVED">Active</Badge> : <Badge>Inactive</Badge>}</td><td className="small">{fmtDate(u.last_login_at)}</td>
              <td className="row-flex"><Button size="sm" onClick={() => patchUser(u, { active: !u.active }, u.active ? "ปิดบัญชีแล้ว" : "เปิดบัญชีแล้ว")}>{u.active ? "ปิด" : "เปิด"}</Button></td></tr>)}
          </tbody></table></div>
        </TabPanel>
        <TabPanel value="ai"><div className="card">
          <div className="field"><label htmlFor="ai_mode">วิธีวิเคราะห์ค่าเริ่มต้น</label><select id="ai_mode" value={String(st.ai_mode)} onChange={e => setDraft({ ...draft, ai_mode: e.target.value })}><option value="rule">Rule Engine</option><option value="claude">Claude API</option></select></div>
          <p>Claude: {s.data.settings.claude_configured ? <Badge status="APPROVED">Configured</Badge> : <Badge status="NEEDS_CONFIGURATION" />} · Model: <span className="mono">{s.data.settings.claude_model}</span></p>
          <label className="row-flex"><input type="checkbox" checked={!!st.vision_enabled} onChange={e => setDraft({ ...draft, vision_enabled: e.target.checked })} /> เปิด Vision Model สำหรับรูปหน้าจอ</label>
          <p className="small muted">ระบบ Mask Secret/Customer ID ก่อนส่งข้อความ Section ไป Claude ทุกครั้ง · บันทึก Model, Prompt Version, Input Hash, Token Usage</p></div></TabPanel>
        <TabPanel value="runner"><div className="card grid g3">{num("runner_timeout_sec", "Timeout (วินาที)")}{num("runner_max_output_kb", "Max Log (KB)")}<div className="small muted">RAM สูงสุด {s.data.settings.runner_max_memory_mb} MB · โหมด {s.data.settings.runner_mode} (ตั้งใน .env)</div></div></TabPanel>
        <TabPanel value="github"><div className="card grid g2">
          <div className="field"><label htmlFor="gho">Owner</label><input id="gho" type="text" value={String(st.github_owner ?? "")} onChange={e => setDraft({ ...draft, github_owner: e.target.value })} /></div>
          <div className="field"><label htmlFor="ghr">Repository</label><input id="ghr" type="text" value={String(st.github_repo ?? "")} onChange={e => setDraft({ ...draft, github_repo: e.target.value })} /></div>
          <p>Token: {s.data.settings.github_configured ? <Badge status="APPROVED">Configured (Backend)</Badge> : <Badge status="NEEDS_CONFIGURATION" />}</p></div></TabPanel>
        <TabPanel value="env"><div className="card">
          <div className="field"><label htmlFor="allow">Environment Allowlist (1 บรรทัด/URL) — Production ถูก Block โดยค่าเริ่มต้น</label>
            <textarea id="allow" value={(st.env_allowlist as string[]).join("\n")} onChange={e => setDraft({ ...draft, env_allowlist: e.target.value.split("\n").map(x => x.trim()).filter(Boolean) })} /></div>
          <div className="grid g2">{num("jmeter_max_users", "JMeter Max Users")}{num("jmeter_max_minutes", "JMeter Max Minutes")}</div></div></TabPanel>
        <TabPanel value="network"><div className="dangerbox"><b>คำเตือนด้าน Security</b><p>{s.data.network_warning}</p></div>
          <p>สถานะปัจจุบัน: BIND_HOST = <span className="mono">{s.data.settings.bind_host}</span> · Network Sharing {s.data.settings.network_sharing ? <Badge status="FAILED">ON</Badge> : <Badge status="APPROVED">OFF</Badge>}</p>
          <p className="small">เปิดได้โดยแก้ .env: <span className="mono">BIND_HOST=0.0.0.0</span> และ <span className="mono">ALLOW_NETWORK_SHARING=true</span> แล้ว <span className="mono">docker compose up -d</span></p></TabPanel>
        <TabPanel value="session"><div className="card"><p>Session Timeout (Idle): <b>{s.data.settings.session_minutes} นาที</b> (ตั้งใน .env <span className="mono">SESSION_MINUTES</span>)</p><p>Storage: <span className="mono">{s.data.settings.storage_root}</span> · Task mode: {s.data.settings.task_mode}</p></div></TabPanel>
      </Tabs>
      <Dialog open={!!newUser} onOpenChange={o => !o && setNewUser(null)} title="เพิ่มผู้ใช้" description="ผู้ใช้ใหม่ต้องเปลี่ยนรหัสผ่านเมื่อ Login ครั้งแรก"
        footer={<><Button onClick={() => setNewUser(null)}>ยกเลิก</Button><Button variant="primary" onClick={async () => { try { await api.post("/api/users", { username: newUser!.username, name: newUser!.name, roles: [newUser!.role], password: newUser!.password }); toast("เพิ่มผู้ใช้แล้ว"); setNewUser(null); await users.refetch(); } catch (e) { toastError(e); } }}>บันทึก</Button></>}>
        {newUser && <>{(["username", "name", "password"] as const).map(k => <div key={k} className="field"><label htmlFor={`nu-${k}`}>{k}</label><input id={`nu-${k}`} type={k === "password" ? "password" : "text"} value={newUser[k]} onChange={e => setNewUser({ ...newUser, [k]: e.target.value })} /></div>)}
          <div className="field"><label htmlFor="nu-role">Role</label><select id="nu-role" value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })}>{Object.entries(s.data.roles).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div></>}
      </Dialog>
    </AppShell>
  );
}
