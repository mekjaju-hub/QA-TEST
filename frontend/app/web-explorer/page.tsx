"use client";
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

type TC = { id: string; title: string; type: string; priority: string; steps: string[]; expected: string; observed: string; func: string; file: string; needs_login: boolean };
type RunResult = { tc_id?: string; name: string; status: string; message: string; duration: number };
type WebRun = { at: string; status: string; duration: number; summary: Record<string, number>; with_login: boolean; results: RunResult[]; stdout: string; stderr: string; error_code: string | null };
type Exploration = {
  id: string; url: string; created_at: string; created_by: string; status: number | null; duration_sec: number;
  before: { title: string }; login: { attempted: boolean; success?: boolean; message?: string; reason?: string };
  observations: string[]; test_cases: TC[]; files: Record<string, string>; screenshots: string[]; last_run?: WebRun; warnings: string[];
};
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
  const [file, setFile] = useState<string>("");

  const list = useQuery({ queryKey: ["web-explorer"], queryFn: () => api.get<Summary[]>("/api/web-explorer"), enabled: can("auto.view") });
  const detail = useQuery({ queryKey: ["web-explorer", sel], queryFn: () => api.get<Exploration>(`/api/web-explorer/${sel}`), enabled: !!sel });
  const d = detail.data;

  useEffect(() => {
    if (!d) return;
    const first = Object.keys(d.files).find(f => f.startsWith("tests/")) || Object.keys(d.files)[0];
    setFile(first);
  }, [d?.id]);

  const explore = useMutation({
    mutationFn: () => api.post<Exploration>("/api/web-explorer", { url, username: user || null, password: pass || null }),
    onSuccess: res => {
      qc.setQueryData(["web-explorer", res.id], res);
      qc.invalidateQueries({ queryKey: ["web-explorer"], exact: true });
      setSel(res.id); setTab("observe"); setRevealed(false); setNotes("");
      toast(`สำรวจเสร็จ: ได้ ${res.test_cases.length} Test Case`);
    },
    onError: toastError,
  });
  const run = useMutation({
    mutationFn: () => api.post<WebRun>(`/api/web-explorer/${sel}/run`, { username: user || null, password: pass || null }),
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
          <p className="small muted" style={{ marginTop: 0 }}>
            ใส่ Username/Password เมื่ออยากให้ลอง Login 1 ครั้งแล้วดูหน้าหลัง Login · ระบบไม่บันทึกรหัสผ่าน · ใช้บัญชีทดสอบเท่านั้น ·
            ไม่แก้ CAPTCHA/OTP ให้ · ใช้กับเว็บที่คุณได้รับอนุญาตให้ทดสอบ
          </p>
          <label className="small" style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 10 }}>
            <input type="checkbox" checked={practice} onChange={e => setPractice(e.target.checked)} /> โหมดฝึก: ซ่อน Test Case และโค้ดไว้ก่อน ให้ลองสังเกตเองก่อน
          </label>
          <Button variant="primary" type="submit" loading={explore.isPending}>สำรวจหน้าเว็บ</Button>
          {explore.isPending && <p className="small muted">กำลังเปิด browser, โหลดหน้า{user && pass ? " และลอง Login" : ""}… ใช้เวลา 5–30 วินาที</p>}
          {explore.error ? <ErrorState error={explore.error} /> : null}
        </form>

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
            <div><h2 style={{ margin: 0 }}>{d.before.title || d.url}</h2><span className="small muted">{d.url} · สำรวจเมื่อ {fmtDate(d.created_at)} · HTTP {d.status ?? "-"}</span></div>
            <div className="row-flex" style={{ gap: 8 }}>
              <Button size="sm" onClick={() => download(`/api/web-explorer/${d.id}/zip`, `webtest_${d.id}.zip`).catch(toastError)}>ดาวน์โหลดโปรเจกต์ pytest (ZIP)</Button>
              <Button size="sm" variant="danger" onClick={() => del.mutate(d.id)} loading={del.isPending}>ลบ</Button>
            </div>
          </div>

          <Tabs value={tab} onValueChange={setTab} items={[
            { value: "observe", label: "① สิ่งที่เห็น" },
            { value: "cases", label: `② Test Cases (${d.test_cases.length})` },
            { value: "code", label: "③ pytest + รัน" },
            { value: "learn", label: "④ เรียนรู้ pytest" },
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
            </TabPanel>

            <TabPanel value="cases">
              {locked ? <Locked onReveal={() => setRevealed(true)} /> : <>
                <p className="small muted">Test Case แต่ละข้อมาจากสิ่งที่สังเกตเห็น และมี pytest 1 ฟังก์ชันคู่กัน (คอลัมน์ขวาสุด) กดชื่อฟังก์ชันเพื่อดูโค้ด</p>
                <div className="tblwrap"><table><thead><tr><th>ID</th><th>Test Case</th><th>ประเภท</th><th>ขั้นตอน</th><th>ผลที่คาดหวัง</th><th>ตอนสำรวจเห็น</th><th>pytest</th></tr></thead><tbody>
                  {d.test_cases.map(t => (
                    <tr key={t.id}>
                      <td className="mono small">{t.id}</td>
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
                    <p className="small muted" style={{ margin: "4px 0 8px" }}>รันแบบ headless ในเครื่องนี้ {user && pass ? "พร้อม Username/Password ที่กรอกไว้ด้านบน" : "(ไม่ได้กรอก Username/Password — Test ที่ต้อง Login จะถูกข้าม)"}</p>
                    {can("run.execute") ? <Button size="sm" variant="success" onClick={() => run.mutate()} loading={run.isPending}>Run pytest</Button> : <span className="small muted">ไม่มีสิทธิ์ Run</span>}
                  </div>
                </nav>
                <div>{file && <CodeEditor path={file} value={d.files[file] ?? ""} readOnly height={460} />}</div>
              </div>}
              {!locked && <RunView run={run.data ?? d.last_run} pending={run.isPending} />}
            </TabPanel>

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
