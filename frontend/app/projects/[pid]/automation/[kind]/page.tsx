"use client";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, PageHead } from "@/components/shell";
import { CodeDiff, CodeEditor } from "@/components/ui/code-editor";
import { AiBadge, Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm";
import { Empty, ErrorState, Loading } from "@/components/ui/states";
import { api, download, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { projectCrumbs, useProject } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import type { Artifact, TestCaseBrief } from "@/lib/types";
import { fmtDate } from "@/lib/utils";

const META: Record<string, { title: string; sub: string }> = {
  python: { title: "Python Generator", sub: "Business Logic, Validator, Date/File/API Helper, Test Data Factory (Service + Repository Pattern)" },
  pytest: { title: "Pytest Generator", sub: "parametrize, fixture, marker testcase, Decimal · Run ได้จากหน้านี้ (Runner จำกัด CPU/RAM/Time)" },
  postman: { title: "Postman Generator", sub: "Collection v2.1 + Environment Template · Auth แบบ Configurable (ห้ามเดา)" },
  sql: { title: "SQL Generator (MySQL)", sub: "Read-only Template พร้อม Placeholder · ไม่เชื่อม Database จริงใน Version นี้" },
  playwright: { title: "Playwright Generator", sub: "Page Object Model · Manual Checkpoint สำหรับ OTP/CAPTCHA · Screenshot on Failure" },
  jmeter: { title: "JMeter Generator", sub: "JMX Preview, Test Profile, CSV Data Template · Safety Control + Approval ก่อน Run" },
};
const ELIGIBLE = ["APPROVED", "READY_FOR_AUTOMATION", "AUTOMATED"];
type Meta = { sql_types: Record<string, string>; auth_types: string[]; browsers: string[]; env_allowlist: string[]; jmeter_max_users: number; jmeter_max_minutes: number };
type Loc = { name: string; strategy: string; value: string; note?: string };
type Full = Artifact & { contents: Record<string, string>; ai_contents: Record<string, string>; jmeter?: { approved_by: string | null } };

function Inner() {
  const { pid, kind } = useParams<{ pid: string; kind: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const p = useProject(pid);
  const { can } = useAuth();
  const qc = useQueryClient();
  const { toast, toastError } = useToast();
  const { confirm } = useConfirm();
  const meta = META[kind];
  const [draft, setDraft] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const [opt, setOpt] = useState<Record<string, unknown>>({ auth: "none", types: ["duplicate", "aggregation"], page_name: "CustomerSearch", login_path: "/login", browser: "chromium", type: "Load", users: 10, minutes: 5, ramp: 30, url: "" });
  const [file, setFile] = useState<string | null>(null);
  const [buf, setBuf] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [adv, setAdv] = useState<{ mode: "html" | "rec"; text: string; found: (Loc & { use: boolean })[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const tcs = useQuery({ queryKey: ["testcases", pid, {}], queryFn: () => api.get<{ items: TestCaseBrief[] }>(`/api/projects/${pid}/test-cases`) });
  const arts = useQuery({ queryKey: ["artifacts", pid, kind], queryFn: () => api.get<Artifact[]>(`/api/projects/${pid}/automation${qs({ kind })}`), enabled: !!meta && can("auto.view") });
  const m = useQuery({ queryKey: ["auto-meta"], queryFn: () => api.get<Meta>("/api/automation/meta"), enabled: can("auto.view") });
  const artId = sp.get("artifact") ?? arts.data?.[0]?.id;
  const art = useQuery({ queryKey: ["artifact", artId], queryFn: () => api.get<Full>(`/api/automation/${artId}`), enabled: !!artId });
  const a = art.data;
  const files = useMemo(() => a?.files ?? [], [a]);
  const cur = file && files.includes(file) ? file : (files.find(x => /test_|rule_service|collection|\.sql$|\.jmx$|_page\.py|workflows/.test(x)) ?? files[0]);
  useEffect(() => { setBuf(null); }, [cur, artId]);
  if (!meta) return <AppShell crumbs={projectCrumbs(pid, p.data?.code, ["Automation"])}><Empty title="ไม่พบหน้า" /></AppShell>;
  const crumbs = projectCrumbs(pid, p.data?.code, ["Automation"], [meta.title]);
  if (!can("auto.view")) return <AppShell crumbs={crumbs}><Empty title="ไม่มีสิทธิ์" body="Role ของคุณไม่มีสิทธิ์ดู Automation Code" /></AppShell>;
  const eligible = (tcs.data?.items ?? []).filter(t => t.status !== "DEPRECATED" && (draft || ELIGIBLE.includes(t.status)));
  const canGen = can("auto.generate"), canEdit = can("auto.edit");
  const content = a && cur ? (buf ?? a.contents[cur]) : "";
  const edited = a && cur ? a.contents[cur] !== a.ai_contents[cur] : false;
  const tips = a && cur ? a.tips[cur] ?? [] : [];
  const refresh = async () => { await qc.invalidateQueries({ queryKey: ["artifact", artId] }); await qc.invalidateQueries({ queryKey: ["artifacts", pid, kind] }); };

  const generate = async () => {
    if (kind === "jmeter" && !(await confirm({ title: "ยืนยัน Target URL", body: <div className="dangerbox">Load/Stress/Spike Test สร้างภาระสูงต่อ {String(opt.url)} — ห้ามยิง Production · ต้องได้รับอนุมัติก่อน Run</div>, danger: true, confirmText: "ยืนยันและ Generate" }))) return;
    setBusy(true);
    try {
      const options = kind === "jmeter" ? { ...opt, confirm: true } : opt;
      const r = await api.post<Artifact>(`/api/projects/${pid}/automation/generate`, { kind, test_case_ids: sel, draft, options });
      toast(`สร้าง ${r.name} แล้ว (${r.files.length} ไฟล์)`); setSel([]);
      if (r.scan_problems.length) toast(`คำเตือน Secret: ${r.scan_problems[0]}`, true);
      router.replace(`/projects/${pid}/automation/${kind}?artifact=${r.id}`);
      await qc.invalidateQueries({ queryKey: ["artifacts", pid, kind] }); await qc.invalidateQueries({ queryKey: ["testcases", pid] });
    } catch (e) { toastError(e); } finally { setBusy(false); }
  };
  const save = async () => {
    if (!a || !cur || buf === null) return;
    try { const r = await api.put<{ warnings: string[] }>(`/api/automation/${a.id}/files`, { path: cur, content: buf }); r.warnings.forEach(w => toast(`คำเตือน: ${w}`, true)); toast("บันทึก Code Draft แล้ว (แยกจาก AI Version)"); setBuf(null); await refresh(); } catch (e) { toastError(e); } };
  const reset = async () => { if (!a || !cur) return; if (!(await confirm({ title: "Reset กลับ AI Version", body: cur, danger: true }))) return; try { await api.post(`/api/automation/${a.id}/reset`, { path: cur }); toast("Reset แล้ว"); setBuf(null); await refresh(); } catch (e) { toastError(e); } };
  const runAdvisor = async () => {
    if (!adv) return;
    try { const r = await api.post<{ locators: Loc[] }>(adv.mode === "html" ? "/api/playwright/locators/from-html" : "/api/playwright/locators/from-recording", { html: adv.text });
      setAdv({ ...adv, found: r.locators.map(l => ({ ...l, use: l.strategy !== "xpath" })) }); } catch (e) { toastError(e); }
  };
  const jm = kind === "jmeter" ? jmeterChecks(opt, m.data) : [];
  return (
    <AppShell crumbs={crumbs}>
      <PageHead title={meta.title} sub={meta.sub} />
      <div className="grid g2" style={{ marginBottom: 14 }}>
        <div className="card"><h3>1. เลือก Test Case</h3>
          <label className="row-flex small" style={{ marginBottom: 8 }}><input type="checkbox" checked={draft} disabled={!canGen} onChange={e => setDraft(e.target.checked)} /> Generate Draft Code (รวม Test Case ที่ยังไม่ Approved)</label>
          {draft && <div className="warnbox small">โหมด Draft: Code ที่ได้จะติดป้าย DRAFT และไม่ควรใช้ Run จริงจนกว่า Test Case จะ Approved</div>}
          {eligible.length ? <><div className="list" style={{ maxHeight: 260 }}>{eligible.map(t => (
            <label key={t.id} className="row-flex small" style={{ padding: "3px 0" }}><input type="checkbox" checked={sel.includes(t.id)} onChange={e => setSel(s => e.target.checked ? [...s, t.id] : s.filter(i => i !== t.id))} />
              <span className="mono">{t.tc_id}</span> {t.type} <Badge status={t.status} /></label>))}</div>
            <Button size="sm" style={{ marginTop: 6 }} onClick={() => setSel(eligible.map(t => t.id))}>เลือกทั้งหมด</Button></>
            : <><p className="small muted">ยังไม่มี Test Case ที่ Approved — ห้ามสร้าง Automation จาก Test Case ที่ยังไม่อนุมัติ</p><Link className="btn sm" href={`/projects/${pid}/test-cases`}>ไปที่ Test Case Review</Link></>}
        </div>
        <div className="card"><h3>2. ตั้งค่าและ Generate</h3>
          {(kind === "python" || kind === "pytest") && <p className="small">โครงสร้าง automation_project: app/services, validators, utilities, repositories, test_data/factory{kind === "pytest" && ", tests/unit, conftest.py, pytest.ini, requirements.txt"} พร้อม Code Tips ภาษาไทย · ค่าจาก BRS ทุกค่ามี Comment อ้าง Requirement ID และหน้า</p>}
          {kind === "postman" && <div className="field"><label htmlFor="auth">Authentication (ห้ามเดา — ถ้าไม่ทราบเลือก NEEDS_CONFIGURATION)</label><select id="auth" value={String(opt.auth)} onChange={e => setOpt({ ...opt, auth: e.target.value })}>
            {[["none", "NEEDS_CONFIGURATION / No Auth"], ["basic", "Basic Auth"], ["bearer", "Bearer Token"], ["apikey", "API Key"], ["oauth2", "OAuth 2.0"], ["cookie", "Cookie Session"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <p className="small muted">Credential ทั้งหมดเป็น Variable ใน Environment Template (ค่าว่าง)</p></div>}
          {kind === "sql" && <div className="field"><label>ประเภท Query (Dialect = MySQL · SELECT เท่านั้น)</label>{Object.entries(m.data?.sql_types ?? {}).map(([k, l]) => (
            <label key={k} className="row-flex small"><input type="checkbox" checked={(opt.types as string[]).includes(k)} onChange={e => setOpt({ ...opt, types: e.target.checked ? [...(opt.types as string[]), k] : (opt.types as string[]).filter(x => x !== k) })} /> {l}</label>))}</div>}
          {kind === "playwright" && <>
            <div className="grid g2"><div className="field"><label htmlFor="pn">ชื่อหน้า (Page Object)</label><input id="pn" type="text" value={String(opt.page_name)} onChange={e => setOpt({ ...opt, page_name: e.target.value })} /></div>
              <div className="field"><label htmlFor="lp">Login Path</label><input id="lp" type="text" value={String(opt.login_path)} onChange={e => setOpt({ ...opt, login_path: e.target.value })} /></div></div>
            <div className="field"><label htmlFor="br">Browser (Headed)</label><select id="br" value={String(opt.browser)} onChange={e => setOpt({ ...opt, browser: e.target.value })}><option value="chromium">Chromium</option><option value="msedge">Microsoft Edge</option><option value="firefox">Firefox</option></select></div>
            <label className="row-flex small"><input type="checkbox" checked={!!opt.otp} onChange={e => setOpt({ ...opt, otp: e.target.checked })} /> มี OTP (Manual Checkpoint)</label>
            <label className="row-flex small"><input type="checkbox" checked={!!opt.captcha} onChange={e => setOpt({ ...opt, captcha: e.target.checked })} /> มี CAPTCHA (ผู้ใช้ทำเอง — ระบบไม่อ่าน/ไม่ข้าม)</label>
            <div className="row-flex" style={{ marginTop: 8 }}><Button size="sm" onClick={() => setAdv({ mode: "html", text: "", found: [] })}>Locator Advisor (DOM ที่อนุญาต)</Button><Button size="sm" onClick={() => setAdv({ mode: "rec", text: "", found: [] })}>แปลง Recorded Flow</Button>
              <span className="small muted">Locator ที่อนุมัติ: {(opt.locators as Loc[] | undefined)?.length || "ค่าเริ่มต้น (NEEDS_CONFIGURATION)"}</span></div>
            <p className="small muted">AI Exploration แบบ Headed บนเครื่องผู้ใช้: <span className="mono">python -m runner.explore --url https://sit…</span> (ดู automation-runner/README.md)</p></>}
          {kind === "jmeter" && <>
            <div className="dangerbox"><b>คำเตือน: Load/Stress/Spike Test สร้างภาระสูงต่อระบบเป้าหมาย</b><br />ห้ามยิง Production · URL ต้องอยู่ใน Environment Allowlist · ต้องได้รับอนุมัติก่อน Run</div>
            <div className="grid g2">
              <div className="field"><label htmlFor="jt">Profile</label><select id="jt" value={String(opt.type)} onChange={e => setOpt({ ...opt, type: e.target.value })}>{["Load", "Stress", "Spike"].map(t => <option key={t}>{t}</option>)}</select></div>
              <div className="field"><label htmlFor="ju">Target URL</label><input id="ju" type="url" value={String(opt.url)} placeholder={m.data?.env_allowlist[0]} onChange={e => setOpt({ ...opt, url: e.target.value })} /></div>
              <div className="field"><label htmlFor="jn">Concurrent Users (สูงสุด {m.data?.jmeter_max_users})</label><input id="jn" type="number" min={1} value={Number(opt.users)} onChange={e => setOpt({ ...opt, users: Number(e.target.value) })} /></div>
              <div className="field"><label htmlFor="jd">Duration นาที (สูงสุด {m.data?.jmeter_max_minutes})</label><input id="jd" type="number" min={1} value={Number(opt.minutes)} onChange={e => setOpt({ ...opt, minutes: Number(e.target.value) })} /></div>
              <div className="field"><label htmlFor="jr">Ramp-up วินาที</label><input id="jr" type="number" min={0} value={Number(opt.ramp)} onChange={e => setOpt({ ...opt, ramp: Number(e.target.value) })} /></div></div>
            {jm.length ? <div className="warnbox small">{jm.map((x, i) => <div key={i}>{x}</div>)}</div> : <p className="small" style={{ color: "var(--green)" }}>ผ่าน Safety Check (ฝั่ง Client — Backend ตรวจซ้ำ)</p>}
            <p className="small muted">Metric: TPS, Error Rate, Response Time, Concurrent Users, Throughput</p></>}
          <div style={{ marginTop: 10 }}>{canGen ? <Button variant={draft ? "default" : "primary"} loading={busy} disabled={!sel.length || jm.length > 0} onClick={generate}>{draft ? "Generate Draft Code" : "Generate"} ({sel.length})</Button> : <p className="small muted">เฉพาะ QA Automation/Admin ที่ Generate ได้</p>}</div>
        </div>
      </div>
      {arts.isLoading ? <Loading /> : !arts.data?.length ? <Empty title="ยังไม่มี Artifact" body="เลือก Test Case แล้วกด Generate" /> : art.error ? <ErrorState error={art.error} /> : !a ? <Loading /> : <>
        <div className="row-flex" style={{ marginBottom: 10 }}><h2 style={{ margin: 0 }}>Artifact</h2>
          <select aria-label="Artifact" value={a.id} onChange={e => router.replace(`/projects/${pid}/automation/${kind}?artifact=${e.target.value}`)}>{arts.data.map(x => <option key={x.id} value={x.id}>{x.name}{x.is_draft ? " [DRAFT]" : ""} · {fmtDate(x.created_at)}</option>)}</select>
          {a.is_draft ? <Badge status="NEEDS_CLARIFICATION">DRAFT</Badge> : <Badge status="APPROVED">จาก Test Case ที่ Approved</Badge>}
          <span className="small muted">Test Case: {a.tc_codes.join(", ") || "-"}</span>
          <Link className="btn sm" href={`/projects/${pid}/traceability`}>Traceability</Link></div>
        {a.scan_problems.length > 0 && <div className="dangerbox small"><b>พบไฟล์ต้องห้าม/Secret</b>{a.scan_problems.map((x, i) => <div key={i}>{x}</div>)}</div>}
        {kind === "jmeter" && <div className="infobox small">Approval ก่อน Run: {a.jmeter?.approved_by ? <>อนุมัติโดย {a.jmeter.approved_by}</> : can("github.approve") ? <Button size="sm" variant="danger" onClick={async () => { if (await confirm({ title: "อนุมัติ JMeter Plan", body: "ยืนยันว่า Target เป็น Non-production และได้รับอนุญาตจากเจ้าของระบบ", danger: true })) { try { await api.post(`/api/automation/${a.id}/jmeter/approve`); await refresh(); } catch (e) { toastError(e); } } }}>อนุมัติ Plan</Button> : "รออนุมัติ"} · Run ผ่าน Runner Interface: <span className="mono">jmeter -n -t …</span> (Emergency Stop = ยกเลิก Process)</div>}
        <div className="editor">
          <div className="card tree" style={{ padding: 8 }}>{files.map(x => <div key={x} className={x === cur ? "on" : ""} title={x} onClick={() => setFile(x)}>{x}{a.contents[x] !== a.ai_contents[x] ? " •" : ""}</div>)}</div>
          <div>
            <div className="row-flex" style={{ marginBottom: 8 }}><b className="mono small">{cur}</b>{edited ? <Badge status="REVISED">Human-edited</Badge> : <AiBadge />}<span className="sp" />
              <Button size="sm" onClick={() => { void navigator.clipboard.writeText(content).then(() => toast("คัดลอกแล้ว")); }}>Copy</Button>
              <Button size="sm" onClick={() => download(`/api/automation/${a.id}/download${qs({ path: cur })}`, cur?.split("/").pop() ?? "file").catch(toastError)}>Download File</Button>
              <Button size="sm" onClick={() => download(`/api/automation/${a.id}/zip`, `${a.name}.zip`).catch(toastError)}>Download Project ZIP</Button>
              {edited && <Button size="sm" onClick={() => setShowDiff(true)}>Code Diff</Button>}
              {canEdit && edited && <Button size="sm" onClick={reset}>Reset กลับ AI Version</Button>}
              <RunButton artifact={a} pid={pid} />
            </div>
            {cur && <CodeEditor path={`${a.id}/${cur}`} value={content} readOnly={!canEdit} onChange={v => setBuf(v)} />}
            {canEdit && <div className="row-flex" style={{ marginTop: 6 }}><Button size="sm" disabled={buf === null || buf === a.contents[cur!]} onClick={save}>บันทึกการแก้ไข Code Draft</Button><span className="small muted">การแก้ไขเก็บเป็น Draft แยกจาก AI Version</span></div>}
          </div>
          <div><h3>Code Tips ภาษาไทย</h3>{tips.length ? tips.map((t, i) => <div key={i} className="tip"><b>{t.code}</b><dl>
            <dt>จุดประสงค์</dt><dd>{t.purpose}</dd><dt>Input</dt><dd>{t.input}</dd><dt>Output</dt><dd>{t.output}</dd><dt>เหตุผลที่ใช้</dt><dd>{t.why}</dd>
            <dt>อธิบายทีละส่วน</dt><dd>{t.explain}</dd><dt>Test Case ที่เชื่อมโยง</dt><dd className="mono">{t.tc}</dd><dt>ข้อควรระวัง</dt><dd>{t.caution}</dd><dt>สิ่งที่ QA ต้องแก้ก่อน Run</dt><dd>{t.fix}</dd></dl></div>)
            : <p className="small muted">ไฟล์นี้ไม่มี Tip เฉพาะ — เลือกไฟล์ที่มีเครื่องหมายในรายการ เช่น rule_service.py, tests/unit/*</p>}</div>
        </div></>}
      <Dialog open={showDiff} onOpenChange={setShowDiff} title={`Code Diff — ${cur}`} wide description="ซ้าย: AI Version · ขวา: Code Draft ปัจจุบัน">
        {a && cur && <CodeDiff path={cur} original={a.ai_contents[cur]} modified={a.contents[cur]} />}
      </Dialog>
      <Dialog open={!!adv} onOpenChange={o => !o && setAdv(null)} title={adv?.mode === "html" ? "Locator Advisor / AI Exploration" : "แปลง Recorded User Flow"} wide
        description={adv?.mode === "html" ? "เปิดหน้าเว็บเอง (Login/OTP/CAPTCHA ด้วยตนเอง) → DevTools → Copy outerHTML ของส่วนที่อนุญาต → วางที่นี่ ระบบอ่านเฉพาะ DOM ที่วาง และเสนอ Locator ตามลำดับ data-testid → role → label → text → CSS → XPath" : "รัน playwright codegen --target python-pytest https://sit… บนเครื่องของคุณ แล้ววาง Script ที่ได้"}
        footer={<><Button onClick={() => setAdv(null)}>ปิด</Button><Button onClick={runAdvisor}>วิเคราะห์</Button>
          <Button variant="primary" disabled={!adv?.found.some(f => f.use)} onClick={() => { setOpt({ ...opt, locators: adv!.found.filter(f => f.use).map(({ use: _u, ...l }) => l) }); toast("อนุมัติ Locator แล้ว — กด Generate เพื่อสร้าง Script"); setAdv(null); }}>อนุมัติ Locator ที่เลือก</Button></>}>
        {adv && <><div className="field"><label htmlFor="advtxt">{adv.mode === "html" ? "HTML / DOM ที่อนุญาตให้อ่าน" : "Recorded Script"}</label><textarea id="advtxt" className="mono" style={{ minHeight: 160, fontSize: 12 }} value={adv.text} onChange={e => setAdv({ ...adv, text: e.target.value })} /></div>
          {adv.found.length > 0 && <div className="tblwrap"><table><thead><tr><th>ใช้</th><th>ชื่อ</th><th>Strategy</th><th>Value</th><th>หมายเหตุ</th></tr></thead><tbody>
            {adv.found.map((l, i) => <tr key={i}><td><input type="checkbox" checked={l.use} onChange={e => setAdv({ ...adv, found: adv.found.map((x, j) => j === i ? { ...x, use: e.target.checked } : x) })} /></td><td className="mono">{l.name}</td><td>{l.strategy}</td><td className="mono small">{l.value}</td><td className="small">{l.note}</td></tr>)}
          </tbody></table></div>}</>}
      </Dialog>
    </AppShell>
  );
}

function jmeterChecks(o: Record<string, unknown>, m?: Meta): string[] {
  const out: string[] = [];
  let u: URL | null = null;
  try { u = new URL(String(o.url)); } catch { out.push("Target URL ไม่ถูกต้องหรือว่าง"); }
  if (u && m && !m.env_allowlist.some(a => { try { return new URL(a).host === u!.host; } catch { return false; } })) out.push(`Host ${u.host} ไม่อยู่ใน Environment Allowlist`);
  if (u && /(^|\.)(prod|production|www)\.|prd/i.test(u.host)) out.push("URL ดูเหมือน Production — ถูก Block โดยค่าเริ่มต้น");
  if (m && Number(o.users) > m.jmeter_max_users) out.push(`Users เกิน Limit ${m.jmeter_max_users}`);
  if (m && Number(o.minutes) > m.jmeter_max_minutes) out.push(`Duration เกิน Limit ${m.jmeter_max_minutes} นาที`);
  return out;
}

// Run button is wired to the automation-runner in Stage 7
function RunButton({ artifact, pid }: { artifact: Artifact; pid: string }) {
  const { can } = useAuth();
  const router = useRouter();
  const { toast, toastError } = useToast();
  const { confirm } = useConfirm();
  if (!["pytest", "python"].includes(artifact.kind) || !can("run.execute")) return null;
  return <Button size="sm" variant="primary" onClick={async () => {
    if (artifact.is_draft && !(await confirm({ title: "Run Draft Code", body: "Artifact นี้เป็น DRAFT (Test Case ยังไม่ Approved) — ผลลัพธ์ใช้อ้างอิงไม่ได้", confirmText: "Run ต่อ" }))) return;
    try { const r = await api.post<{ id: string }>(`/api/automation/${artifact.id}/run`); toast("เริ่ม Run แล้ว"); router.push(`/projects/${pid}/test-runs/${r.id}`); } catch (e) { toastError(e); }
  }}>Run</Button>;
}

export default function AutomationPage() { return <Suspense><Inner /></Suspense>; }
