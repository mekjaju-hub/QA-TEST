"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, PageHead } from "@/components/shell";
import { AuthImage } from "@/components/auth-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CodeEditor } from "@/components/ui/code-editor";
import { Empty, ErrorState, Loading } from "@/components/ui/states";
import { TabPanel, Tabs } from "@/components/ui/tabs";
import { api, download } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { fmtDate } from "@/lib/utils";

type TC = { id: string; title: string; type: string; priority: string; steps: string[]; expected: string; observed: string; func: string; file: string; needs_login: boolean; sig?: string; hid?: string; is_new?: boolean };
type RunResult = { tc_id?: string; name: string; status: string; message: string; duration: number };
type WebRun = { at: string; status: string; duration: number; summary: Record<string, number>; with_login: boolean; results: RunResult[]; stdout: string; stderr: string; error_code: string | null };
type Exploration = {
  id: string; url: string; created_at: string; created_by: string; status: number | null; duration_sec: number;
  before: { title: string }; login: { attempted: boolean; success?: boolean; message?: string; reason?: string };
  observations: string[]; test_cases: TC[]; files: Record<string, string>; screenshots: string[]; last_run?: WebRun; warnings: string[];
  history_key?: string; history_page?: string; history_before?: { explorations: number; test_cases: number }; designs_left?: number; clicks?: Clicks; kind?: string; script?: ScriptRow[]; password_saved?: boolean;
};
type ClickItem = { kind: string; label: string; clicked: boolean; reason?: string; n?: number; summary?: string; changed?: boolean; url_after?: string };
type Clicks = { start_url: string; logged_in: boolean; blocked_writes: number; items: ClickItem[] };
type Summary = { id: string; url: string; title: string; created_at: string; test_cases: number; login: Exploration["login"]; last_run?: Record<string, number> | null };

const PRACTICE_QUESTIONS = [
  "หน้านี้มีไว้ทำอะไร? ผู้ใช้จะมาทำอะไรเป็นอย่างแรก",
  "มีช่องกรอกอะไรบ้าง? ช่องไหนบังคับกรอก ถ้าเว้นว่างควรเกิดอะไรขึ้น",
  "ถ้ากรอกข้อมูลผิด ระบบควรแสดงอะไร และควรอยู่หน้าเดิมหรือไม่",
  "หลัง Login สำเร็จ URL เปลี่ยนไปไหน และเห็นเมนูอะไรบ้าง",
  "มีอะไรที่ทดสอบอัตโนมัติไม่ได้ไหม เช่น CAPTCHA หรือ OTP",
];

export default function WebExplorerPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const { toast, toastError } = useToast();
  const [url, setUrl] = useState("");
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [tab, setTab] = useState("observe");
  const [practice, setPractice] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const [notes, setNotes] = useState("");
  const [extra, setExtra] = useState(5);
  const [mode, setMode] = useState<"explore" | "record">("explore");
  const [runPass, setRunPass] = useState("");
  const [clickMode, setClickMode] = useState(true);
  const [maxClicks, setMaxClicks] = useState(10);
  // open an exploration / prefill a URL when coming from the History page (?id=… or ?url=…)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("id")) { setSel(sp.get("id")); setRevealed(true); }
    if (sp.get("url")) setUrl(sp.get("url") || "");
  }, []);
  const [file, setFile] = useState<string>("");

  const list = useQuery({ queryKey: ["web-explorer"], queryFn: () => api.get<Summary[]>("/api/web-explorer"), enabled: can("auto.view") });
  const detail = useQuery({ queryKey: ["web-explorer", sel], queryFn: () => api.get<Exploration>(`/api/web-explorer/${sel}`), enabled: !!sel });
  const d = detail.data;

  useEffect(() => {
    if (!d) return;
    const first = Object.keys(d.files).sort().find(f => f.startsWith("tests/test_")) || Object.keys(d.files)[0];
    setFile(first);
  }, [d?.id]);

  const explore = useMutation({
    mutationFn: () => api.post<Exploration>("/api/web-explorer", { url, username: user || null, password: pass || null, extra, click_explore: clickMode, max_clicks: maxClicks }),
    onSuccess: res => {
      qc.setQueryData(["web-explorer", res.id], res);
      qc.invalidateQueries({ queryKey: ["web-explorer"], exact: true });
      setSel(res.id); setTab("observe"); setRevealed(false); setNotes("");
      toast(`สำรวจเสร็จ: ได้ ${res.test_cases.length} Test Case`);
    },
    onError: toastError,
  });
  const run = useMutation({
    mutationFn: () => api.post<WebRun>(`/api/web-explorer/${sel}/run`, { username: user || null, password: (d?.kind === "record" ? runPass : "") || pass || null }),
    onSuccess: r => { qc.invalidateQueries({ queryKey: ["web-explorer"] }); toast(`รันเสร็จ: ผ่าน ${r.summary.passed ?? 0}/${r.summary.total ?? 0}`); },
    onError: toastError,
  });
  const del = useMutation({
    mutationFn: (id: string) => api.raw(`/api/web-explorer/${id}`, "DELETE"),
    onSuccess: () => { setSel(null); qc.invalidateQueries({ queryKey: ["web-explorer"] }); },
    onError: toastError,
  });

  const locked = practice && !revealed;
  const files = useMemo(() => (d ? Object.keys(d.files).sort((a, b) => (a.startsWith("tests/") ? 0 : 1) - (b.startsWith("tests/") ? 0 : 1) || a.localeCompare(b)) : []), [d]);

  if (!can("auto.generate")) return <AppShell crumbs={[["Web Explorer"]]}><div className="err-box">ต้องมีสิทธิ์ Generate Automation</div></AppShell>;

  return (
    <AppShell crumbs={[["Web Explorer (โหมดฝึก)"]]}>
      <PageHead title="Web Explorer · ฝึกสังเกตและเขียน Automation"
        sub="วางลิงก์หน้าเว็บ → ระบบเปิด browser ให้ดู → สรุปสิ่งที่เห็น → แตกเป็น Test Case → สร้าง pytest และรันได้ทันที" />

      <div className="split2" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
        <div>
          <div className="row-flex" role="group" aria-label="โหมด" style={{ gap: 6, marginBottom: 8 }}>
            <button type="button" className={`btn sm ${mode === "explore" ? "pri" : ""}`} onClick={() => setMode("explore")}>สำรวจอัตโนมัติ</button>
            <button type="button" className={`btn sm ${mode === "record" ? "pri" : ""}`} onClick={() => setMode("record")}>บันทึกการใช้งาน (Record)</button>
          </div>
          {mode === "record" ? <RecordPanel onDone={id => { qc.invalidateQueries({ queryKey: ["web-explorer"] }); setSel(id); setTab("observe"); setRevealed(true); }} /> : <>
        <form className="card" onSubmit={e => { e.preventDefault(); explore.mutate(); }} aria-label="สำรวจหน้าเว็บ">
          <h2 style={{ marginTop: 0 }}>1. ใส่หน้าเว็บที่จะสำรวจ</h2>
          <div className="field"><label htmlFor="wx-url">URL หน้าเว็บ</label>
            <input id="wx-url" type="text" required placeholder="https://www.example.com/login" value={url} onChange={e => setUrl(e.target.value)} /></div>
          <div className="grid g2">
            <div className="field"><label htmlFor="wx-user">Username (ไม่บังคับ)</label>
              <input id="wx-user" type="text" autoComplete="off" value={user} onChange={e => setUser(e.target.value)} /></div>
            <div className="field"><label htmlFor="wx-pass">Password (ไม่บังคับ)</label>
              <input id="wx-pass" type="password" autoComplete="new-password" value={pass} onChange={e => setPass(e.target.value)} /></div>
          </div>
          <div className="field" style={{ maxWidth: 360 }}><label htmlFor="wx-extra">ออกแบบ Test Case ใหม่เพิ่ม (ข้อ) — ไม่ซ้ำกับที่หน้านี้เคยมี</label>
            <input id="wx-extra" type="number" min={0} max={30} value={extra} onChange={e => setExtra(Math.max(0, Math.min(30, Number(e.target.value) || 0)))} /></div>
          <p className="small muted" style={{ marginTop: 0 }}>
            ใส่ Username/Password เมื่ออยากให้ลอง Login 1 ครั้งแล้วดูหน้าหลัง Login · ระบบไม่บันทึกรหัสผ่าน · ใช้บัญชีทดสอบเท่านั้น ·
            ไม่แก้ CAPTCHA/OTP ให้ · ใช้กับเว็บที่คุณได้รับอนุญาตให้ทดสอบ
          </p>
          <label className="small" style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
            <input type="checkbox" checked={clickMode} onChange={e => setClickMode(e.target.checked)} />
            <b>กดสำรวจ (Click Explore)</b>: กดปุ่ม/ลิงก์ที่ปลอดภัยทีละอันเพื่อดูว่าเกิดอะไรขึ้น สูงสุด
            <input type="number" aria-label="จำนวนครั้งที่กดสูงสุด" min={1} max={20} value={maxClicks} style={{ width: 60 }} disabled={!clickMode}
              onChange={e => setMaxClicks(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} /> ครั้ง
          </label>
          {clickMode && <p className="small muted" style={{ margin: "0 0 8px 24px" }}>
            ไม่กดปุ่มชำระเงิน/ซื้อ/สั่งซื้อ/Checkout, ลบ, ส่ง/ยืนยัน/บันทึก, ออกจากระบบ, สร้าง/อนุมัติ และลิงก์ไปเว็บอื่น · ระหว่างกดระบบยกเลิกการส่งข้อมูลไป server (POST/PUT/DELETE) ทั้งหมด · ใช้กับเว็บทดสอบเท่านั้น
          </p>}
          <label className="small" style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 10 }}>
            <input type="checkbox" checked={practice} onChange={e => setPractice(e.target.checked)} /> โหมดฝึก: ซ่อน Test Case และโค้ดไว้ก่อน ให้ลองสังเกตเองก่อน
          </label>
          <Button variant="primary" type="submit" loading={explore.isPending}>สำรวจหน้าเว็บ</Button>
          {explore.isPending && <p className="small muted">กำลังเปิด browser, โหลดหน้า{user && pass ? " และลอง Login" : ""}… ใช้เวลา 5–30 วินาที</p>}
          {explore.error ? <ErrorState error={explore.error} /> : null}
        </form>
          </>}
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>ประวัติการสำรวจ</h2>
          {list.isLoading ? <Loading /> : list.error ? <ErrorState error={list.error} /> : !list.data?.length ?
            <p className="muted small">ยังไม่มี — ลองใส่ URL ของเว็บที่อยากฝึก หรือหน้า Login ของระบบนี้เอง: http://127.0.0.1:3000/login</p> :
            <div className="tblwrap" style={{ maxHeight: 260, overflowY: "auto" }}><table><thead><tr><th>หน้าเว็บ</th><th>TC</th><th>Login</th><th>รันล่าสุด</th><th>เวลา</th></tr></thead><tbody>
              {list.data.map(s => (
                <tr key={s.id} onClick={() => { setSel(s.id); setRevealed(false); setNotes(""); }} style={{ cursor: "pointer", background: s.id === sel ? "var(--blue-bg)" : undefined }}>
                  <td className="small"><b>{s.title || "(ไม่มี title)"}</b><br /><span className="muted">{s.url}</span></td>
                  <td>{s.test_cases}</td>
                  <td>{s.login?.success ? <Badge status="PASSED">สำเร็จ</Badge> : s.login?.attempted ? <Badge status="FAILED">ไม่สำเร็จ</Badge> : <span className="muted small">-</span>}</td>
                  <td className="small">{s.last_run ? `${s.last_run.passed ?? 0}/${s.last_run.total ?? 0} ผ่าน` : "-"}</td>
                  <td className="small">{fmtDate(s.created_at)}</td>
                </tr>))}
            </tbody></table></div>}
        </div>
      </div>

      {sel && (detail.isLoading ? <Loading /> : detail.error ? <ErrorState error={detail.error} /> : d && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="row-flex" style={{ justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div><h2 style={{ margin: 0 }}>{d.kind === "record" && <span className="badge b-purple" style={{ marginRight: 6 }}>บันทึกการใช้งาน</span>}{d.before.title || d.url}</h2><span className="small muted">{d.url} · สำรวจเมื่อ {fmtDate(d.created_at)} · HTTP {d.status ?? "-"}</span></div>
            <div className="row-flex" style={{ gap: 8 }}>
              <Button size="sm" onClick={() => download(`/api/web-explorer/${d.id}/zip`, `webtest_${d.id}.zip`).catch(toastError)}>ดาวน์โหลดโปรเจกต์ pytest (ZIP)</Button>
              <Button size="sm" variant="danger" onClick={() => del.mutate(d.id)} loading={del.isPending}>ลบ</Button>
            </div>
          </div>

          {d.history_key && (() => {
            const fresh = d.test_cases.filter(t => t.is_new).length;
            return <div className="infobox" style={{ marginTop: 10 }}>
              <b>ประวัติของหน้า {d.history_page}</b> — ก่อนรอบนี้สำรวจแล้ว {d.history_before?.explorations ?? 0} ครั้ง มี Test Case สะสม {d.history_before?.test_cases ?? 0} ข้อ ·
              รอบนี้ได้ Test Case <b>ใหม่ {fresh} ข้อ</b>
              {d.designs_left !== undefined && <> · ยังมีแบบที่ยังไม่เคยออกแบบอีก {d.designs_left} ข้อ{d.designs_left === 0 && " (ครบทุกแบบที่ระบบรู้จักแล้ว)"}</>} ·{" "}
              <Link href={`/web-explorer/history?key=${d.history_key}`}>ดูประวัติทั้งหมดของหน้านี้ →</Link>
            </div>;
          })()}

          <Tabs value={tab} onValueChange={setTab} items={[
            { value: "observe", label: "① สิ่งที่เห็น" },
            { value: "cases", label: `② Test Cases (${d.test_cases.length})` },
            { value: "code", label: "③ pytest + รัน" },
            ...(d.kind === "record" ? [{ value: "auto", label: "④ Test Automation (เล่นซ้ำ)" }, { value: "script", label: "⑤ Script ทีละขั้น" }] : []),
            { value: "learn", label: d.kind === "record" ? "⑥ เรียนรู้ pytest" : "④ เรียนรู้ pytest" },
          ]}>
            <TabPanel value="observe">
              <div className="split2">
                <div>
                  <h3>หน้าแรกที่เปิด</h3>
                  {d.screenshots.includes("before") && <AuthImage src={`/api/web-explorer/${d.id}/screenshot/before`} alt="ภาพหน้าเว็บตอนเปิด" style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 6 }} />}
                  {d.screenshots.includes("after") && <>
                    <h3>หลัง Login</h3>
                    <AuthImage src={`/api/web-explorer/${d.id}/screenshot/after`} alt="ภาพหน้าเว็บหลัง Login" style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 6 }} />
                  </>}
                </div>
                <div>
                  {practice && <div className="infobox">
                    <b>ฝึกสังเกตก่อน:</b> ดูภาพทางซ้ายแล้วจดว่าเห็นอะไร และคิดว่าควรทดสอบอะไรบ้าง ก่อนกดดูเฉลย
                    <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{PRACTICE_QUESTIONS.map(q => <li key={q} className="small">{q}</li>)}</ul>
                    <textarea aria-label="บันทึกสิ่งที่สังเกต" rows={5} style={{ width: "100%", marginTop: 8 }} placeholder="จดสิ่งที่เห็น / Test Case ที่คิดได้ (ไม่บันทึกลงระบบ)" value={notes} onChange={e => setNotes(e.target.value)} />
                    {!revealed && <Button size="sm" variant="primary" onClick={() => setRevealed(true)} style={{ marginTop: 6 }}>ดูเฉลย: สิ่งที่ระบบสังเกตได้</Button>}
                  </div>}
                  {!locked && <>
                    <h3>สิ่งที่ระบบสังเกตได้</h3>
                    <ul className="small" style={{ paddingLeft: 18 }}>{d.observations.map((o, i) => <li key={i} style={{ marginBottom: 4 }}>{o}</li>)}</ul>
                    <Button size="sm" onClick={() => setTab("cases")}>ไปดู Test Case ที่แตกออกมา →</Button>
                  </>}
                </div>
              </div>
              {d.clicks && !locked && <ClickTable id={d.id} c={d.clicks} />}
              {d.clicks && locked && <p className="small muted">ผลการกดสำรวจจะแสดงหลังกด "ดูเฉลย" — ลองเดาก่อนว่ากดปุ่มแต่ละปุ่มแล้วจะเกิดอะไรขึ้น</p>}
            </TabPanel>

            <TabPanel value="cases">
              {locked ? <Locked onReveal={() => setRevealed(true)} /> : <>
                <p className="small muted">Test Case แต่ละข้อมาจากสิ่งที่สังเกตเห็น และมี pytest 1 ฟังก์ชันคู่กัน (คอลัมน์ขวาสุด) กดชื่อฟังก์ชันเพื่อดูโค้ด</p>
                <div className="tblwrap"><table><thead><tr><th>ID</th><th>ประวัติ</th><th>Test Case</th><th>ประเภท</th><th>ขั้นตอน</th><th>ผลที่คาดหวัง</th><th>ตอนสำรวจเห็น</th><th>pytest</th></tr></thead><tbody>
                  {d.test_cases.map(t => (
                    <tr key={t.id}>
                      <td className="mono small">{t.id}</td>
                      <td className="small"><span className="mono">{t.hid ?? "-"}</span><br />{t.is_new ? <span className="badge b-green">ใหม่</span> : <span className="badge b-gray">เคยมีแล้ว</span>}</td>
                      <td><b>{t.title}</b>{t.needs_login && <><br /><span className="badge b-orange">ต้องใช้ Username/Password</span></>}</td>
                      <td className="small">{t.type}<br /><span className="muted">{t.priority}</span></td>
                      <td className="small"><ol style={{ margin: 0, paddingLeft: 16 }}>{t.steps.map((s, i) => <li key={i}>{s}</li>)}</ol></td>
                      <td className="small">{t.expected}</td>
                      <td className="small muted">{t.observed}</td>
                      <td className="small"><a href="#" className="mono" onClick={e => { e.preventDefault(); setFile(t.file); setTab("code"); }}>{t.func}</a></td>
                    </tr>))}
                </tbody></table></div>
              </>}
            </TabPanel>

            <TabPanel value="code">
              {locked ? <Locked onReveal={() => setRevealed(true)} /> : <div className="split2" style={{ gridTemplateColumns: "220px minmax(0,1fr)" }}>
                <nav aria-label="ไฟล์ในโปรเจกต์" className="small">
                  {files.map(f => <div key={f}><a href="#" className="mono" style={{ fontWeight: f === file ? 700 : 400 }} onClick={e => { e.preventDefault(); setFile(f); }}>{f}</a></div>)}
                  <div className="card" style={{ marginTop: 12, padding: 10 }}>
                    <b>รัน Test เลย</b>
                    {d.kind === "record" ? <>
                      <p className="small muted" style={{ margin: "4px 0 8px" }}>เล่นซ้ำตามที่บันทึกไว้ (ทำรายการจริง)</p>
                      {d.test_cases.some(t => t.steps.some(st => st.includes("********"))) && <div className="field">
                        <label htmlFor="run-pass">รหัสผ่านที่ใช้ตอนบันทึก</label>
                        <input id="run-pass" type="password" autoComplete="off" value={runPass} onChange={e => setRunPass(e.target.value)} />
                        <span className="small muted">ระบบไม่เก็บรหัสผ่านตอนบันทึก ต้องใส่ตอนรัน ถ้าเว้นว่างจะใช้ค่าตัวอย่าง และขั้นตอน Login จะไม่ผ่าน</span>
                      </div>}
                    </> : <p className="small muted" style={{ margin: "4px 0 8px" }}>รันแบบ headless ในเครื่องนี้ {user && pass ? "พร้อม Username/Password ที่กรอกไว้ด้านบน" : "(ไม่ได้กรอก Username/Password — Test ที่ต้อง Login จะถูกข้าม)"}</p>}
                    {can("run.execute") ? <Button size="sm" variant="success" onClick={() => run.mutate()} loading={run.isPending}>Run pytest</Button> : <span className="small muted">ไม่มีสิทธิ์ Run</span>}
                  </div>
                </nav>
                <div>{file && <CodeEditor path={file} value={d.files[file] ?? ""} readOnly height={460} />}</div>
              </div>}
              {!locked && <RunView run={run.data ?? d.last_run} pending={run.isPending} />}
            </TabPanel>

            {d.kind === "record" && <TabPanel value="auto"><ReplayPanel d={d} /></TabPanel>}
            {d.kind === "record" && <TabPanel value="script"><ScriptTable rows={d.script ?? []} /></TabPanel>}
            <TabPanel value="learn"><LearnPytest /></TabPanel>
          </Tabs>
        </div>
      ))}
      {!sel && !list.isLoading && !list.data?.length && <div style={{ marginTop: 14 }}><Empty title="เริ่มจากวางลิงก์หน้าเว็บ" body="ระบบจะเปิดหน้าเว็บด้วย browser อัตโนมัติ ถ่ายภาพ สรุปสิ่งที่เห็น แล้วสร้าง Test Case กับ pytest ให้ฝึกอ่านและรัน" /></div>}
    </AppShell>
  );
}

function Locked({ onReveal }: { onReveal: () => void }) {
  return <div className="infobox">โหมดฝึก: ลองเขียน Test Case จากสิ่งที่สังเกตเองก่อน แล้วค่อยเทียบกับเฉลย <Button size="sm" variant="primary" onClick={onReveal}>ดูเฉลย</Button></div>;
}

function RunView({ run, pending }: { run?: WebRun; pending: boolean }) {
  if (pending) return <p className="small muted" style={{ marginTop: 12 }}>กำลังรัน pytest… (เปิด browser แบบมองไม่เห็นและทำตามขั้นตอนในโค้ด)</p>;
  if (!run) return null;
  return (
    <div style={{ marginTop: 14 }}>
      <h3>ผลการรันล่าสุด <Badge status={run.status} /> <span className="small muted">{fmtDate(run.at)} · {run.duration}s · {run.with_login ? "มี Login" : "ไม่มี Login"}</span></h3>
      <p className="small">ทั้งหมด {run.summary.total ?? 0} · ผ่าน {run.summary.passed ?? 0} · ไม่ผ่าน {run.summary.failed ?? 0} · ข้าม {run.summary.blocked ?? run.summary.skipped ?? 0}</p>
      <div className="tblwrap"><table><thead><tr><th>Test</th><th>ผล</th><th>ข้อความ</th></tr></thead><tbody>
        {run.results.map(r => <tr key={r.name}><td className="mono small">{r.name}</td><td><Badge status={r.status} /></td><td className="small" style={{ whiteSpace: "pre-wrap" }}>{r.message?.slice(0, 400)}</td></tr>)}
      </tbody></table></div>
      <details style={{ marginTop: 8 }}><summary className="small">ดู log ของ pytest</summary><pre className="code" style={{ minHeight: 0, maxHeight: 360 }}>{run.stdout}{run.stderr ? "\n--- stderr ---\n" + run.stderr : ""}</pre></details>
    </div>
  );
}

const SNIPPET_AAA = `def test_login_wrong_password(page):
    # Arrange: เตรียม — เปิดหน้า Login
    page.goto("https://example.com/login")
    # Act: ทำ — กรอกรหัสผิดแล้วกดปุ่ม
    page.get_by_label("Username").fill("qa.user")
    page.get_by_label("Password").fill("Wrong-123!")
    page.get_by_role("button", name="Login").click()
    # Assert: ตรวจผล — ต้องยังอยู่หน้า Login
    expect(page.get_by_label("Password")).to_be_visible()`;

const SNIPPET_FIXTURE = `# conftest.py
@pytest.fixture
def credentials():
    return os.getenv("LOGIN_USER"), os.getenv("LOGIN_PASS")

# tests/test_login.py — แค่ใส่ชื่อ fixture เป็นพารามิเตอร์ pytest จะส่งค่าให้เอง
def test_valid_login(page, credentials):
    user, password = credentials`;

function LearnPytest() {
  return (
    <div className="grid g2" style={{ marginTop: 10 }}>
      <Lesson title="pytest ใช้ทำอะไร">
        <p>pytest คือเครื่องมือ<b>รัน Test ที่เขียนด้วย Python</b> มันจะหาไฟล์ชื่อ <code>test_*.py</code> หาฟังก์ชันชื่อ <code>test_*</code> แล้วรันทีละตัว
          จากนั้นสรุปว่า <b>PASSED</b> (ผ่าน), <b>FAILED</b> (ไม่ผ่าน) หรือ <b>SKIPPED</b> (ข้าม)</p>
        <p>เมื่อใช้คู่กับ <b>Playwright</b> โค้ดจะสั่ง browser จริงให้เปิดเว็บ คลิก พิมพ์ แล้วตรวจผล แทนคนที่ต้องทำซ้ำทุกครั้งที่ระบบเปลี่ยน</p>
      </Lesson>
      <Lesson title="1 Test = Arrange → Act → Assert">
        <pre className="code" style={{ minHeight: 0 }}>{SNIPPET_AAA}</pre>
        <p className="small">ทุก Test Case ในแท็บ ② แปลงเป็นโค้ดได้ด้วย 3 ขั้นนี้: <b>ขั้นตอน</b> = Arrange/Act, <b>ผลที่คาดหวัง</b> = Assert</p>
      </Lesson>
      <Lesson title="หา element บนหน้าเว็บ (Locator)">
        <p>ใช้วิธีที่ใกล้กับสิ่งที่ผู้ใช้เห็นที่สุดก่อน เพราะเปลี่ยนยากกว่าโค้ดเบื้องหลัง เรียงจากดีที่สุด:</p>
        <ol className="small">
          <li><code>get_by_role(&quot;button&quot;, name=&quot;Login&quot;)</code> — ปุ่ม/ลิงก์/หัวข้อตามชื่อที่เห็น</li>
          <li><code>get_by_label(&quot;Username&quot;)</code> — ช่องกรอกตามป้ายชื่อ</li>
          <li><code>get_by_placeholder(&quot;Search&quot;)</code> — ช่องกรอกตามข้อความจางๆ</li>
          <li><code>locator(&quot;#id&quot;)</code> — ใช้เมื่อไม่มีทางอื่น</li>
        </ol>
        <p className="small">ระบบเลือก Locator ที่ตอนสำรวจเจอ element <b>ตรงกันตัวเดียว</b>เท่านั้น เพื่อให้ Test ไม่สับสน</p>
      </Lesson>
      <Lesson title="expect() กับ assert">
        <p><code>expect(locator).to_be_visible()</code> จะ<b>รอให้เป็นจริง</b>สูงสุด 5 วินาที เหมาะกับหน้าเว็บที่โหลดช้า ส่วน <code>assert</code> ตรวจทันทีครั้งเดียว ใช้กับค่าทั่วไป เช่น HTTP status</p>
        <p className="small">ที่ใช้บ่อย: <code>to_be_visible</code>, <code>to_be_hidden</code>, <code>to_have_title</code>, <code>to_have_url</code>, <code>to_have_text</code>, <code>to_have_attribute</code></p>
      </Lesson>
      <Lesson title="fixture และ conftest.py">
        <pre className="code" style={{ minHeight: 0 }}>{SNIPPET_FIXTURE}</pre>
        <p className="small"><code>page</code> เป็น fixture ที่ pytest-playwright เตรียม browser tab ใหม่ให้ทุก Test · รหัสผ่านอ่านจาก environment variable ไม่เขียนลงโค้ด</p>
      </Lesson>
      <Lesson title="Page Object, marker, parametrize">
        <ul className="small">
          <li><b>Page Object</b> (<code>pages/login_page.py</code>): เก็บ Locator ของหน้าไว้ที่เดียว ถ้าหน้าเว็บเปลี่ยน แก้ไฟล์เดียว</li>
          <li><b>marker</b> <code>@pytest.mark.smoke</code>: ติดป้ายให้ Test แล้วรันเฉพาะกลุ่มด้วย <code>pytest -m smoke</code></li>
          <li><b>parametrize</b>: รัน Test เดียวกันกับข้อมูลหลายชุด เช่น ตรวจลิงก์ทีละลิงก์</li>
        </ul>
      </Lesson>
      <Lesson title="รันบนเครื่องตัวเอง">
        <pre className="code" style={{ minHeight: 0 }}>{`pip install -r requirements.txt
python -m playwright install chromium
pytest                              # รันทั้งหมด
pytest -m smoke                     # เฉพาะ smoke
pytest -k login --headed --slowmo 500   # ดู browser ทำงานช้าๆ
pytest --lf                         # รันซ้ำเฉพาะตัวที่ Fail ครั้งก่อน`}</pre>
        <p className="small">ดาวน์โหลดโปรเจกต์ด้วยปุ่ม ZIP ด้านบน แล้วเปิดใน VS Code · ถ้า Fail ดูภาพใน <code>test-results/</code></p>
      </Lesson>
      <Lesson title="แบบฝึกหัดต่อยอด">
        <ol className="small">
          <li>เพิ่ม Test: กรอก Username อย่างเดียวแล้วกด Login ต้องไม่เข้าสู่ระบบ</li>
          <li>เพิ่ม Test: ตรวจข้อความ error ด้วย <code>to_have_text</code> หลังกรอกรหัสผิด</li>
          <li>ลองเปลี่ยน Locator ให้ผิด แล้วรันดูว่า error บอกอะไร</li>
          <li>รัน <code>--headed --slowmo 500</code> แล้วสังเกตว่า browser ทำตามโค้ดทีละบรรทัด</li>
        </ol>
      </Lesson>
    </div>
  );
}

function Lesson({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="card" style={{ marginBottom: 0, padding: 16 }}><h3 style={{ marginTop: 0 }}>{title}</h3>{children}</section>;
}

function ClickTable({ id, c }: { id: string; c: Clicks }) {
  const done = c.items.filter(x => x.clicked);
  return (
    <div style={{ marginTop: 14 }}>
      <h3>ผลการกดสำรวจ {c.logged_in ? "(หลัง Login)" : ""}</h3>
      <p className="small muted">เริ่มจาก {c.start_url} ทุกครั้ง · กด {done.length} รายการ · มีผล {done.filter(x => x.changed).length} ·
        ข้าม {c.items.length - done.length} รายการ{c.blocked_writes ? ` · ระบบกันการส่งข้อมูลไป server ${c.blocked_writes} ครั้ง` : ""}</p>
      <div className="tblwrap"><table><thead><tr><th>#</th><th>ปุ่ม / ลิงก์</th><th>กดไหม</th><th>เกิดอะไรขึ้น</th><th>ภาพหลังกด</th></tr></thead><tbody>
        {c.items.map((x, i) => (
          <tr key={i}>
            <td className="small">{x.n ?? "-"}</td>
            <td><b>{x.label}</b><br /><span className="small muted">{x.kind === "button" ? "ปุ่ม" : "ลิงก์"}</span></td>
            <td>{x.clicked ? <Badge status="DONE">กดแล้ว</Badge> : <span className="small"><Badge status="CANCELLED">ข้าม</Badge><br />{x.reason}</span>}</td>
            <td className="small">{x.clicked ? (x.changed ? x.summary : <span className="muted">{x.summary}</span>) : "-"}</td>
            <td>{x.clicked && x.n ? <AuthImage src={`/api/web-explorer/${id}/screenshot/click_${x.n}`} alt={`หลังกด ${x.label}`} style={{ width: 180, border: "1px solid var(--line)", borderRadius: 4 }} /> : null}</td>
          </tr>))}
      </tbody></table></div>
    </div>
  );
}

type ScriptRow = { no: number; seg: number; seg_name: string; event: string; where: string; command: string; meaning: string };
type RecSeg = { name: string; events: number; start_url?: string | null };
type RecView = {
  id: string; url: string; status: string; error?: string | null; paused: boolean; save_password: boolean;
  current_url?: string; cycle?: number; discarded?: boolean; message?: string;
  segments: RecSeg[];
  steps: { no: number; action: string; text: string; seg: number; seg_name: string }[]; script: ScriptRow[]; exploration_id?: string | null;
};

function RecordPanel({ onDone }: { onDone: (explorationId: string) => void }) {
  const { toast, toastError } = useToast();
  const [url, setUrl] = useState("");
  const [firstName, setFirstName] = useState("");
  const [savePw, setSavePw] = useState(true);
  const [rid, setRid] = useState<string | null>(null);
  const [tcName, setTcName] = useState("");
  const [tcFresh, setTcFresh] = useState(false);
  const [tcUrl, setTcUrl] = useState("");
  const [cycle, setCycle] = useState({ name: "", url: "" });       // next cycle (after "หยุดบันทึก")
  const [confirmSave, setConfirmSave] = useState(false);
  const [check, setCheck] = useState({ text: "", mode: "visible" });
  const live = useQuery({ queryKey: ["web-recorder", rid], queryFn: () => api.get<RecView>(`/api/web-recorder/${rid}`), enabled: !!rid,
    refetchInterval: q => (q.state.data && !["recording", "starting"].includes(q.state.data.status) ? false : 1000) });
  const qc = useQueryClient();
  const setView = (r: RecView) => qc.setQueryData(["web-recorder", r.id], r);
  // reset the whole cycle → back to the start form, ready for a new recording (any URL, not tied to the old page)
  const resetCycle = (lastUrl?: string) => {
    setRid(null); setConfirmSave(false); setTcName(""); setTcFresh(false); setTcUrl(""); setCycle({ name: "", url: "" }); setFirstName("");
    if (lastUrl) setUrl(lastUrl);
  };
  // reconnect to a recording that is still open (page refresh / navigated away)
  useEffect(() => { api.get<RecView | null>("/api/web-recorder-active").then(r => { if (r) { setRid(r.id); setView(r); } }).catch(() => undefined); }, []);
  const start = useMutation({
    mutationFn: () => api.post<RecView>("/api/web-recorder/start", { url, save_password: savePw, name: firstName }),
    onSuccess: r => { setRid(r.id); setView(r); toast("เปิดหน้าต่าง browser บนเครื่องแล้ว — เริ่มใช้งานได้เลย"); },
    onError: toastError,
  });
  const act = useMutation({
    mutationFn: (x: { path: string; body?: unknown }) => api.post<RecView>(`/api/web-recorder/${rid}/${x.path}`, x.body ?? {}),
    onSuccess: setView, onError: toastError,
  });
  const save = useMutation({
    mutationFn: () => api.post<RecView>(`/api/web-recorder/${rid}/stop`),
    onSuccess: r => {
      resetCycle(r.current_url || r.url);
      if (r.exploration_id) { toast(`บันทึกแล้ว: ${r.steps.length} ขั้นตอน · ${new Set(r.steps.map(s => s.seg)).size} Test Case — พร้อมเริ่มรอบใหม่`); onDone(r.exploration_id); }
      else toast(r.message || "ไม่มีขั้นตอนให้บันทึก — เริ่มรอบใหม่ได้เลย");
    },
    onError: (e: unknown) => { toastError(e); if ((e as { status?: number })?.status === 404) resetCycle(); },
  });
  const v = live.data;
  const recording = !!rid && (!v || ["recording", "starting"].includes(v.status));
  const segList = v?.segments ?? [];
  const lastEmpty = segList.length > 0 && segList[segList.length - 1].events === 0;
  const tcCount = segList.filter(x => x.events > 0).length;
  const segs = useMemo(() => {
    const m = new Map<number, { name: string; rows: ScriptRow[] }>();
    (v?.script ?? []).forEach(r => { if (!m.has(r.seg)) m.set(r.seg, { name: r.seg_name, rows: [] }); m.get(r.seg)!.rows.push(r); });
    return Array.from(m.entries());
  }, [v]);
  const pause = () => { setCycle({ name: "", url: v?.current_url || v?.url || "" }); act.mutate({ path: "pause" }); };
  const newCycle = () => act.mutate({ path: "resume", body: { new_case: true, name: cycle.name, url: cycle.url || null } },
    { onSuccess: r => { setView(r); toast(`เริ่มรอบที่ ${r.cycle ?? ""} แล้ว — Test Case ใหม่ เริ่มที่ ${r.current_url ?? cycle.url}`); } });
  const saveClick = () => { if (lastEmpty && segList.length > 1 && !confirmSave) { setConfirmSave(true); return; } save.mutate(); };
  return (
    <div className="card" aria-label="บันทึกการใช้งาน">
      <h2 style={{ marginTop: 0 }}>บันทึกการใช้งานเป็น Test Case</h2>
      {!rid && <>
        <p className="small muted" style={{ marginTop: 0 }}>ระบบเปิดหน้าต่าง browser บนเครื่องนี้ ให้คุณใช้งานเว็บตามปกติ ทุกการคลิก/พิมพ์/popup/การเปลี่ยนหน้า จะถูกบันทึกเป็นขั้นตอนพร้อมคำอธิบาย</p>
        <div className="field"><label htmlFor="rec-url">URL หน้าเริ่มต้น</label>
          <input id="rec-url" type="text" placeholder="https://www.example.com/register" value={url} onChange={e => setUrl(e.target.value)} /></div>
        <div className="field"><label htmlFor="rec-name">ชื่อ Test Case แรก (ไม่บังคับ)</label>
          <input id="rec-name" type="text" placeholder="เช่น Login เข้าระบบ" value={firstName} onChange={e => setFirstName(e.target.value)} /></div>
        <label className="small" style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
          <input type="checkbox" checked={savePw} onChange={e => setSavePw(e.target.checked)} /> บันทึกรหัสผ่านจริงไว้ใน Log และโค้ด (ใช้กับบัญชีทดสอบเท่านั้น)
        </label>
        <div className="warnbox small">{savePw ? "รหัสผ่านจะเห็นได้ใน Log, Script, โค้ด และไฟล์ ZIP — อย่าใช้บัญชีจริง" : "รหัสผ่านไม่ถูกบันทึก — ใส่ตอนกด Run/เล่นซ้ำ"} ·
          ตัวเลข 13–19 หลัก (บัตร/เลขบัตรประชาชน) ถูกปิดบัง · alert กด OK, confirm กด Cancel · Test ที่ได้ <b>ทำรายการจริงซ้ำ</b> — ใช้กับเว็บทดสอบเท่านั้น</div>
        <Button variant="primary" onClick={() => start.mutate()} loading={start.isPending} disabled={!url}>▶ เริ่มบันทึก</Button>
        {start.error ? <ErrorState error={start.error} /> : null}
      </>}
      {rid && <>
        <div className={v?.paused ? "warnbox small" : "infobox small"} aria-live="polite">
          {!recording ? <>หน้าต่าง browser ถูกปิดแล้ว — กด &quot;บันทึกเป็น Test Case&quot; หรือ &quot;เริ่มรอบใหม่&quot;</> :
            v?.paused ? <>⏸ หยุดบันทึกแล้ว (จบรอบที่ {v?.cycle ?? 1}) — สิ่งที่ทำตอนนี้จะไม่ถูกบันทึก · รอเริ่มรอบใหม่</> :
              <>● กำลังบันทึก รอบที่ {v?.cycle ?? 1} — ใช้งานในหน้าต่าง browser ที่เปิดขึ้น ({v?.current_url || v?.url})</>}
        </div>
        {v?.error && <div className="err-box">{v.error}</div>}
        <div className="row-flex" style={{ gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          {recording && !v?.paused && <Button size="sm" onClick={pause} loading={act.isPending}>⏸ หยุดบันทึก (จบรอบนี้)</Button>}
          <Button size="sm" variant="success" onClick={saveClick} loading={save.isPending} disabled={!tcCount && recording}>
            ■ บันทึกเป็น Test Case ({tcCount}) และปิด browser</Button>
          {!recording && <Button size="sm" onClick={() => resetCycle(v?.current_url || v?.url)}>เริ่มรอบใหม่ (ไม่บันทึกรอบนี้)</Button>}
        </div>
        {confirmSave && <div className="warnbox small" role="alert" style={{ marginBottom: 10 }}>
          Test Case ล่าสุด &quot;{segList[segList.length - 1]?.name || `Test Case ${segList.length}`}&quot; ยังไม่มีขั้นตอน จึง<b>จะไม่ถูกสร้าง</b> — คลิก/พิมพ์/เปลี่ยนหน้าในหน้าต่าง browser ก่อน หรือบันทึกเฉพาะ {tcCount} Test Case ที่มีขั้นตอน
          <div className="row-flex" style={{ gap: 8, marginTop: 6 }}>
            <Button size="sm" variant="success" onClick={() => save.mutate()} loading={save.isPending}>บันทึก {tcCount} Test Case</Button>
            <Button size="sm" onClick={() => setConfirmSave(false)}>กลับไปบันทึกต่อ</Button>
          </div>
        </div>}
        {recording && v?.paused && <div className="card" style={{ padding: 10, marginBottom: 10, borderColor: "var(--orange)" }} aria-label="รอบใหม่">
          <b>เริ่มรอบใหม่ (รอบที่ {(v?.cycle ?? 1) + 1})</b>
          <p className="small muted" style={{ margin: "2px 0 6px" }}>รอบใหม่ = Test Case ใหม่ที่เปิดหน้า URL ของตัวเอง ไม่ต้องทำขั้นตอนของรอบก่อน (ไม่อิงหน้าเดิม) — แก้ URL เป็นหน้าอื่นได้</p>
          <div className="grid g2" style={{ gap: 6 }}>
            <input type="text" aria-label="ชื่อ Test Case รอบใหม่" placeholder="ชื่อ Test Case (ไม่บังคับ)" value={cycle.name} onChange={e => setCycle({ ...cycle, name: e.target.value })} />
            <input type="text" aria-label="URL เริ่มต้นของรอบใหม่" placeholder="URL เริ่มต้น (ว่าง = หน้าที่เปิดอยู่)" value={cycle.url} onChange={e => setCycle({ ...cycle, url: e.target.value })} />
          </div>
          <div className="row-flex" style={{ gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            <Button size="sm" variant="primary" onClick={newCycle} loading={act.isPending}>▶ เริ่มรอบใหม่ (Test Case ใหม่)</Button>
            <Button size="sm" onClick={() => act.mutate({ path: "resume", body: { new_case: false } })}>↩ ทำต่อ Test Case เดิม</Button>
          </div>
        </div>}
        <div className="grid g2" style={{ marginBottom: 8 }}>
          <div className="card" style={{ padding: 10 }}>
            <b className="small">Add Test Case</b>
            <p className="small muted" style={{ margin: "2px 0 6px" }}>{tcFresh ? "Test Case ถัดไปเริ่มใหม่ที่ URL นี้ (ไม่ต่อจากขั้นตอนเดิม)" : "ขั้นตอนหลังจากนี้เป็น Test Case ถัดไป (ทำต่อจากจุดเดิม)"}</p>
            <div className="row-flex" style={{ gap: 6 }}>
              <input type="text" aria-label="ชื่อ Test Case ถัดไป" placeholder="ชื่อ Test Case ถัดไป" value={tcName} onChange={e => setTcName(e.target.value)} />
              <Button size="sm" onClick={() => { act.mutate({ path: "testcase", body: { name: tcName, url: tcFresh ? (tcUrl || v?.current_url || null) : null } }); setTcName(""); }}
                disabled={!recording || !!v?.paused}>
                {lastEmpty && segList.length > 1 && !tcFresh ? "เปลี่ยนชื่อ Test Case นี้" : "+ Add Test Case"}</Button>
            </div>
            <label className="small" style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}>
              <input type="checkbox" checked={tcFresh} onChange={e => { setTcFresh(e.target.checked); if (e.target.checked && !tcUrl) setTcUrl(v?.current_url || ""); }} /> เริ่มใหม่จาก URL (ไม่อิงหน้าเดิม)
            </label>
            {tcFresh && <input type="text" aria-label="URL ของ Test Case ถัดไป" placeholder="https://..." value={tcUrl} onChange={e => setTcUrl(e.target.value)} style={{ marginTop: 4 }} />}
          </div>
          <div className="card" style={{ padding: 10 }}>
            <b className="small">ตรวจสอบข้อความ (Text)</b>
            <p className="small muted" style={{ margin: "2px 0 6px" }}>เพิ่มขั้นตรวจว่าหน้าเว็บตอนนี้แสดง/ไม่แสดงคำนี้</p>
            <div className="row-flex" style={{ gap: 6 }}>
              <input type="text" aria-label="ข้อความที่ต้องตรวจ" placeholder="เช่น Products" value={check.text} onChange={e => setCheck({ ...check, text: e.target.value })} />
              <select aria-label="แบบการตรวจ" value={check.mode} onChange={e => setCheck({ ...check, mode: e.target.value })}>
                <option value="visible">ต้องเห็น</option><option value="hidden">ต้องไม่เห็น</option>
              </select>
              <Button size="sm" onClick={() => { act.mutate({ path: "check", body: check }); setCheck({ ...check, text: "" }); }} disabled={!recording || !!v?.paused || !check.text.trim()}>+ ตรวจ</Button>
            </div>
          </div>
        </div>
        {segList.length > 0 && <div className="small" style={{ margin: "4px 0 8px" }} aria-label="Test Case ที่กำลังบันทึก">
          {segList.filter((x, i) => x.events > 0 || i === segList.length - 1).map((x, i, arr) => (
            <span key={i} className={`badge ${x.events ? "b-blue" : "b-orange"}`} style={{ marginRight: 6 }} title={x.start_url ? `เริ่มที่ ${x.start_url}` : "ต่อจาก Test Case ก่อนหน้า"}>
              {x.start_url && i > 0 ? "⟳ " : ""}Test Case {i + 1}{x.name ? `: ${x.name}` : ""} — {x.events ? `${x.events} ขั้นตอน` : (i === arr.length - 1 ? "กำลังรอขั้นตอนแรก" : "ว่าง")}
            </span>))}
          {lastEmpty && segList.length > 1 && <div className="muted" style={{ marginTop: 4 }}>Test Case ล่าสุดยังไม่มีขั้นตอน — คลิก/พิมพ์ หรือเปลี่ยนหน้า (พิมพ์ URL/ย้อนกลับ) ในหน้าต่าง browser อย่างน้อย 1 ครั้ง (ถ้าบันทึกตอนนี้จะไม่ถูกสร้าง)</div>}
          <div className="muted" style={{ marginTop: 4 }}>⟳ = รอบใหม่ เริ่มที่ URL ของตัวเอง · ไม่มี ⟳ = ต่อจาก Test Case ก่อนหน้า</div>
        </div>}
        {!segs.length ? <p className="small muted">ยังไม่มีขั้นตอน — ลองคลิกหรือพิมพ์ในหน้าต่าง browser</p> :
          segs.map(([seg, g], i) => <div key={seg}><h3 style={{ margin: "10px 0 4px" }}>Test Case {i + 1}{g.name ? `: ${g.name}` : ""}</h3><ScriptTable rows={g.rows} compact /></div>)}
        {save.error ? <ErrorState error={save.error} /> : null}
      </>}
    </div>
  );
}

function ScriptTable({ rows, compact }: { rows: ScriptRow[]; compact?: boolean }) {
  if (!rows.length) return <p className="small muted">ไม่มีขั้นตอน</p>;
  let last = -1;
  return (
    <div className="tblwrap" style={compact ? { maxHeight: 320, overflowY: "auto" } : undefined}><table><thead><tr>
      <th>#</th><th>เหตุการณ์</th><th>อยู่ตรงไหน</th><th>คำสั่ง (Playwright)</th><th>ความหมาย</th></tr></thead><tbody>
      {rows.map(r => {
        const head = !compact && r.seg !== last; last = r.seg;
        return [head && <tr key={`h${r.seg}`}><td colSpan={5} className="small" style={{ background: "var(--blue-bg)" }}><b>Test Case {r.seg + 1}{r.seg_name ? `: ${r.seg_name}` : ""}</b></td></tr>,
          <tr key={r.no}>
            <td className="small">{r.no}</td>
            <td className="small"><b>{r.event}</b></td>
            <td className="small">{r.where || "-"}</td>
            <td className="mono small" style={{ wordBreak: "break-all" }}>{r.command}</td>
            <td className="small muted">{r.meaning}</td>
          </tr>];
      })}
    </tbody></table></div>
  );
}

type ReplayView = { id: string; status: string; current: number; error?: string | null;
  results: { no: number; text: string; seg: number; status: string; message?: string; shot?: string; check?: string; ms?: number }[];
  summary: { total: number; passed: number; failed: number } };

function ReplayPanel({ d }: { d: Exploration }) {
  const { can } = useAuth();
  const { toastError } = useToast();
  const [rid, setRid] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [speed, setSpeed] = useState(700);
  const needPw = !d.password_saved && d.test_cases.some(t => t.steps.some(st => st.includes("********")));
  const live = useQuery({ queryKey: ["web-replay", rid], queryFn: () => api.get<ReplayView>(`/api/web-replay/${rid}`), enabled: !!rid,
    refetchInterval: q => (q.state.data && !["starting", "running"].includes(q.state.data.status) ? false : 700) });
  const start = useMutation({ mutationFn: () => api.post<ReplayView>(`/api/web-explorer/${d.id}/replay`, { password: pw || null, slow_ms: speed }),
    onSuccess: r => setRid(r.id), onError: toastError });
  const cancel = useMutation({ mutationFn: () => api.post<ReplayView>(`/api/web-replay/${rid}/cancel`), onError: toastError });
  const v = live.data;
  const running = !!v && ["starting", "running"].includes(v.status);
  const label: Record<string, string> = { pending: "รอ", running: "กำลังทำ", passed: "ผ่าน", failed: "ไม่ผ่าน", skipped: "ข้าม" };
  const badge: Record<string, string> = { pending: "PENDING", running: "RUNNING", passed: "PASSED", failed: "FAILED", skipped: "CANCELLED" };
  return (
    <div style={{ marginTop: 10 }}>
      <div className="infobox small">กด <b>เล่นซ้ำ</b> แล้วหน้าต่าง browser จะเปิดขึ้นบนเครื่องและทำตามที่บันทึกไว้ครบทุกขั้น — ก่อนกดแต่ละปุ่ม/ช่องจะมีกรอบสีแดงบอกว่าอยู่ตรงไหน
        และตรวจผล (หน้าเปลี่ยน, popup, ข้อความ) ทุกขั้น · ทำรายการจริงซ้ำ ใช้กับเว็บทดสอบเท่านั้น</div>
      <div className="row-flex" style={{ gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 10 }}>
        {needPw && <div className="field" style={{ margin: 0 }}><label htmlFor="rp-pw">รหัสผ่าน (ไม่ได้บันทึกไว้)</label>
          <input id="rp-pw" type="password" autoComplete="off" value={pw} onChange={e => setPw(e.target.value)} /></div>}
        <div className="field" style={{ margin: 0 }}><label htmlFor="rp-speed">ความเร็ว</label>
          <select id="rp-speed" value={speed} onChange={e => setSpeed(Number(e.target.value))}>
            <option value={1500}>ช้ามาก (ดูทันทุกขั้น)</option><option value={700}>ปกติ</option><option value={200}>เร็ว</option>
          </select></div>
        {can("run.execute") ? (running
          ? <Button variant="danger" onClick={() => cancel.mutate()}>หยุดเล่นซ้ำ</Button>
          : <Button variant="success" onClick={() => start.mutate()} loading={start.isPending}>▶ เล่นซ้ำ (Test Automation)</Button>)
          : <span className="small muted">ไม่มีสิทธิ์ Run</span>}
        {v && <span className="small"><Badge status={v.status === "passed" ? "PASSED" : v.status === "failed" || v.status === "error" ? "FAILED" : "RUNNING"} />
          {" "}ผ่าน {v.summary.passed}/{v.summary.total}{v.summary.failed ? ` · ไม่ผ่าน ${v.summary.failed}` : ""}</span>}
      </div>
      {v?.error && <div className="err-box">{v.error}</div>}
      {v && <div className="tblwrap"><table><thead><tr><th>#</th><th>ขั้นตอน</th><th>ผล</th><th>ตรวจ / ข้อความ</th><th>ภาพ (กรอบแดง = ตำแหน่ง)</th></tr></thead><tbody>
        {v.results.map(r => (
          <tr key={r.no} style={r.status === "running" ? { background: "var(--blue-bg)" } : undefined}>
            <td className="small">{r.no}</td>
            <td className="small"><b>{r.text}</b></td>
            <td><Badge status={badge[r.status]}>{label[r.status]}</Badge>{r.ms !== undefined && <><br /><span className="small muted">{r.ms} ms</span></>}</td>
            <td className="small">{r.status === "failed" ? <span style={{ color: "var(--red)" }}>{r.message}</span> : r.check ?? ""}</td>
            <td>{r.shot && <AuthImage src={`/api/web-replay/${v.id}/shot/${r.shot}`} alt={`ขั้นที่ ${r.no}`} style={{ width: 220, border: "1px solid var(--line)", borderRadius: 4 }} />}</td>
          </tr>))}
      </tbody></table></div>}
    </div>
  );
}
