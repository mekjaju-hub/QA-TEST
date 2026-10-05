"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell, PageHead, useProjects } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/states";
import { QA_MODES, QA_PAGE_ROUTE, QA_SKILLS, type QAMode } from "@/lib/qa-path";

// Progress (checklist + quiz answers) is a per-browser convenience → localStorage (guarded; page works without it).
const KEY = "brsqa.qa-path";
type Saved = { done: Record<string, boolean>; ans: Record<string, number> };
const load = (): Saved => { try { const v = JSON.parse(localStorage.getItem(KEY) || "{}"); return { done: v.done ?? {}, ans: v.ans ?? {} }; } catch { return { done: {}, ans: {} }; } };

const taskKey = (m: QAMode, i: number) => `${m.id}_${i}`;

export default function QAPathPage() {
  const [saved, setSaved] = useState<Saved>({ done: {}, ans: {} });
  const [modeId, setModeId] = useState<string | null>(null);
  const projects = useProjects();
  const pid = projects.data?.[0]?.id;

  useEffect(() => {
    setSaved(load());
    const m = new URLSearchParams(window.location.search).get("mode");
    if (m && QA_MODES.some(x => x.id === m)) setModeId(m);
  }, []);
  const update = (next: Saved) => { setSaved(next); try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked */ } };
  const go = (id: string | null) => {
    setModeId(id);
    try { window.history.replaceState(null, "", id ? `/qa-path?mode=${id}` : "/qa-path"); } catch { /* ignore */ }
  };

  const prog = (m: QAMode) => ({ done: m.tasks.filter((_, i) => saved.done[taskKey(m, i)]).length, total: m.tasks.length });
  const all = QA_MODES.reduce((a, m) => { const p = prog(m); return { d: a.d + p.done, t: a.t + p.total }; }, { d: 0, t: 0 });
  const pct = all.t ? Math.round((all.d / all.t) * 100) : 0;
  const mode = QA_MODES.find(m => m.id === modeId) ?? null;
  const idx = mode ? QA_MODES.indexOf(mode) : -1;
  const prev = QA_MODES[idx - 1], next = QA_MODES[idx + 1];

  return (
    <AppShell crumbs={[["Become to QA Engineer", "/qa-path"], [mode ? `Mode ${mode.no}` : "ภาพรวม"]]}>
      <PageHead title="Become to QA Engineer" sub="เส้นทาง Upskill จาก Software Tester (Manual) สู่ QA Engineer · 12 สัปดาห์ · ฝึกด้วยเครื่องมือในเว็บนี้"
        actions={<span className="badge b-blue" data-testid="qa-progress">ความคืบหน้า {pct}%</span>} />
      <div style={{ marginBottom: 14 }}><Progress value={pct} /></div>
      {!pid && !projects.isLoading && <div className="err-box" style={{ borderColor: "var(--orange)", background: "var(--orange-bg)" }}>ยังไม่มี Project — <Link href="/projects">สร้าง Project ก่อน</Link> เพื่อให้ลิงก์ไปหน้าฝึกแต่ละ Mode ใช้งานได้</div>}

      <div className="tabs" role="tablist">
        <button className={!mode ? "on" : ""} onClick={() => go(null)}>ภาพรวม Roadmap</button>
        {QA_MODES.map(m => { const p = prog(m); return <button key={m.id} className={mode?.id === m.id ? "on" : ""} onClick={() => go(m.id)}>Mode {m.no}{p.done === p.total ? " ✓" : ""}</button>; })}
      </div>

      {!mode ? (
        <>
          <div className="card" style={{ marginBottom: 14, background: "var(--blue-bg)" }}>เริ่มจากสิ่งที่ทำอยู่แล้ว (อ่าน BRS, ประสาน UAT, ทำเอกสาร Result) แล้วค่อยเพิ่มทักษะเทคนิคทีละ Mode ทุก Mode ใช้เมนูจริงในเว็บนี้เป็นสนามฝึก</div>
          <div className="card" style={{ marginBottom: 14 }}>
            <h2>Skill Gap: งานปัจจุบัน vs JD</h2>
            <div className="tblwrap"><table><thead><tr><th>ทักษะ</th><th>สถานะ</th><th>สิ่งที่ต้องพัฒนา</th><th>ฝึกที่</th></tr></thead><tbody>
              {QA_SKILLS.map(([s, st, dev, m]) => <tr key={s}><td>{s}</td><td><span className={`badge ${st === "มีแล้ว" ? "b-green" : "b-orange"}`}>{st}</span></td><td className="small">{dev}</td><td><a href={`/qa-path?mode=m${m}`} onClick={e => { e.preventDefault(); go(`m${m}`); }}>Mode {m}</a></td></tr>)}
            </tbody></table></div>
          </div>
          <h2 style={{ marginBottom: 8 }}>ลำดับการฝึก</h2>
          <div className="qa-steps">
            {QA_MODES.map(m => { const p = prog(m); return (
              <a key={m.id} className="card qa-step" href={`/qa-path?mode=${m.id}`} onClick={e => { e.preventDefault(); go(m.id); }}>
                <div className="qa-no">{m.no}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="small muted">{m.weeks} · {m.tag}</div><b>{m.title}</b><div className="small muted">{m.goal}</div>
                  <div style={{ marginTop: 6 }}><Progress value={Math.round((p.done / p.total) * 100)} /></div>
                </div>
                <span className="small">{p.done}/{p.total}</span>
              </a>); })}
          </div>
        </>
      ) : (
        <>
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", marginBottom: 14 }}>
            <div className="card"><div className="small muted">{mode.weeks} · {mode.tag}</div><h2>Mode {mode.no}: {mode.title}</h2><p>{mode.goal}</p><div className="small muted">ตอบโจทย์ JD: <i>{mode.jd}</i></div></div>
            <div className="card">
              <h3>สนามฝึกในเว็บนี้</h3>
              <div className="row-flex">{mode.pages.map(([k, l]) => pid ? <Link key={k} className="btn" href={`/projects/${pid}/${QA_PAGE_ROUTE[k] ?? k}`}>{l} →</Link> : <span key={k} className="btn" aria-disabled="true">{l}</span>)}</div>
              <h3 style={{ marginTop: 12 }}>ผลงานที่ต้องได้</h3><p className="small">{mode.deliverable}</p>
            </div>
          </div>
          <div className="card" style={{ marginBottom: 14 }}>
            <h3>Practice checklist ({prog(mode).done}/{mode.tasks.length})</h3>
            {mode.tasks.map((t, i) => <label key={i} className="qa-task"><input type="checkbox" checked={!!saved.done[taskKey(mode, i)]} onChange={e => update({ ...saved, done: { ...saved.done, [taskKey(mode, i)]: e.target.checked } })} /> <span>{t}</span></label>)}
          </div>
          <div className="card" style={{ marginBottom: 14 }}>
            <h3>Quiz ทบทวน</h3>
            {mode.quiz.map(([q, opts, c], qi) => { const a = saved.ans[mode.id + qi]; return (
              <div key={qi} className="qa-q"><b>{qi + 1}. {q}</b>
                <div className="qa-opts">{opts.map((o, oi) => <Button key={oi} size="sm" variant={a === undefined ? "default" : oi === c ? "success" : a === oi ? "danger" : "default"} onClick={() => update({ ...saved, ans: { ...saved.ans, [mode.id + qi]: oi } })}>{o}</Button>)}</div>
                {a !== undefined && <div className={`small ${a === c ? "" : "muted"}`}>{a === c ? "ถูกต้อง" : "ยังไม่ถูก คำตอบที่ถูกไฮไลต์สีเขียว"}</div>}
              </div>); })}
          </div>
          <div className="row-flex">
            {prev && <Button onClick={() => go(prev.id)}>← Mode {prev.no}</Button>}<span style={{ flex: 1 }} />
            {next ? <Button variant="primary" onClick={() => go(next.id)}>Mode {next.no}: {next.title} →</Button> : <Button variant="primary" onClick={() => go(null)}>กลับภาพรวม</Button>}
          </div>
        </>
      )}
    </AppShell>
  );
}
