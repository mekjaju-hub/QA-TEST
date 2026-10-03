"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell, PageHead } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, Loading } from "@/components/ui/states";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { fmtDate } from "@/lib/utils";
import { caseHref } from "@/lib/web-history";

type ScriptRow = { no: number; seg: number; seg_name: string; event: string; where: string; command: string; meaning: string };
type CaseDetail = {
  page: { key: string; page: string; url: string; title: string };
  case: {
    sig: string; group: string; hid: string; title: string; type: string; priority: string; steps: string[]; expected: string; observed?: string;
    needs_login?: boolean; first_seen: string; last_seen: string; first_exploration: string; last_exploration?: string; designed: number;
    runs: number; passed: number; last_result?: string; last_message?: string; last_run_at?: string; start_url?: string; independent?: boolean;
  };
  source: { id: string; kind: string; created_at: string; created_by: string; url: string; tc_id: string; func?: string; file?: string;
    start_url?: string; independent?: boolean } | null;
  code: string; script: ScriptRow[]; prev: string | null; next: string | null; position: number; total: number;
};

const GROUP: Record<string, string> = { page: "หน้าเว็บ", login: "Login", home: "หลัง Login", field: "ช่องกรอก", dropdown: "Dropdown",
  click: "การกด (Click Explore)", record: "บันทึกการใช้งาน (Record)", "record-neg": "Negative จากการบันทึก", legacy: "รุ่นเก่า" };

export default function WebHistoryCasePage() {
  const { can } = useAuth();
  const { toast } = useToast();
  const [sel, setSel] = useState<{ key: string; hid: string } | null>(null);
  useEffect(() => {
    const read = () => { const q = new URLSearchParams(window.location.search); const key = q.get("key"), hid = q.get("hid"); setSel(key && hid ? { key, hid } : null); };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  const det = useQuery({ queryKey: ["web-history-case", sel?.key, sel?.hid], enabled: !!sel && can("auto.view"),
    queryFn: () => api.get<CaseDetail>(`/api/web-history/${encodeURIComponent(sel!.key)}/case/${encodeURIComponent(sel!.hid)}`) });
  const go = (hid: string | null) => {
    if (!hid || !sel) return;
    window.history.pushState(null, "", caseHref(sel.key, hid));
    setSel({ key: sel.key, hid });
    window.scrollTo({ top: 0 });
  };
  const d = det.data;
  const backHref = sel ? `/web-explorer/history?key=${encodeURIComponent(sel.key)}` : "/web-explorer/history";

  if (!can("auto.view")) return <AppShell crumbs={[["Web History"]]}><div className="err-box">ไม่มีสิทธิ์ดูหน้านี้</div></AppShell>;

  return (
    <AppShell crumbs={[["Web Explorer", "/web-explorer"], ["ประวัติ Test Case", backHref], [sel?.hid ?? "Test Case"]]}>
      <PageHead title={d ? `${d.case.hid} · ${d.case.title}` : "รายละเอียด Test Case"}
        sub={d ? <>{d.page.title || d.page.page} · <span className="mono">{d.page.page}</span> · ข้อที่ {d.position} จาก {d.total}</> : undefined}
        actions={<div className="row-flex" style={{ gap: 6, flexWrap: "wrap" }}>
          <Link className="btn" href={backHref}>← กลับไปรายการ Test Case</Link>
          <Button onClick={() => go(d?.prev ?? null)} disabled={!d?.prev} aria-label="Test Case ก่อนหน้า">‹ {d?.prev ?? "ก่อนหน้า"}</Button>
          <Button onClick={() => go(d?.next ?? null)} disabled={!d?.next} aria-label="Test Case ถัดไป">{d?.next ?? "ถัดไป"} ›</Button>
        </div>} />
      {!sel ? <div className="err-box">ไม่ได้ระบุ Test Case — เปิดจากหน้า <Link href="/web-explorer/history">ประวัติ Test Case</Link></div> :
        det.isLoading ? <Loading /> : det.error ? <ErrorState error={det.error} onRetry={() => det.refetch()} /> : d && <CaseBody d={d} onCopy={async text => {
          try { await navigator.clipboard.writeText(text); toast("คัดลอกแล้ว"); } catch { toast("คัดลอกไม่ได้ — เลือกข้อความแล้วกด Ctrl+C"); }
        }} />}
    </AppShell>
  );
}

function CaseBody({ d, onCopy }: { d: CaseDetail; onCopy: (text: string) => void }) {
  const c = d.case;
  const src = d.source;
  const start = src?.start_url || c.start_url;
  const independent = src?.independent ?? c.independent;
  const pre = c.steps.filter(s => s.startsWith("(ทำ Test Case ก่อนหน้า"));
  const steps = c.steps.filter(s => !s.startsWith("(ทำ Test Case ก่อนหน้า"));
  const asText = [
    `${c.hid} ${c.title}`, `ประเภท: ${c.type} · ความสำคัญ: ${c.priority}`, `หน้าเว็บ: ${d.page.url}`,
    pre.length ? `เงื่อนไขก่อนเริ่ม: ${pre.join(" ")}` : "", "ขั้นตอน:", ...steps.map((s, i) => `  ${i + 1}. ${s}`), `ผลที่คาดหวัง: ${c.expected}`,
  ].filter(Boolean).join("\n");
  return (
    <>
      <div className="grid g4" style={{ marginBottom: 12 }}>
        <div className="kpi card"><div className="v" style={{ fontSize: 18 }}>{GROUP[d.case.group] ?? d.case.group}</div><div className="k">กลุ่ม</div></div>
        <div className="kpi card"><div className="v" style={{ fontSize: 18 }}>{c.type}</div><div className="k">ประเภท · ความสำคัญ {c.priority}</div></div>
        <div className="kpi card"><div className="v">{c.last_result ? <Badge status={c.last_result} /> : "-"}</div><div className="k">ผลรันล่าสุด · รัน {c.runs ?? 0} ครั้ง ผ่าน {c.passed ?? 0}</div></div>
        <div className="kpi card"><div className="v">{c.designed} ครั้ง</div><div className="k">ถูกออกแบบ (สำรวจ/บันทึก)</div></div>
      </div>

      <div className="card" aria-label="การเขียน Test Case">
        <div className="row-flex" style={{ justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <h2 style={{ margin: 0 }}>การเขียน Test Case</h2>
          <Button size="sm" onClick={() => onCopy(asText)}>คัดลอกเป็นข้อความ</Button>
        </div>
        <table style={{ marginTop: 10, width: "100%" }}><tbody>
          <tr><th style={{ width: 180 }}>Test Case ID</th><td className="mono">{c.hid}{src?.tc_id ? <span className="muted"> (ในไฟล์: {src.tc_id})</span> : null}</td></tr>
          <tr><th>ชื่อ / สถานการณ์</th><td><b>{c.title}</b>{c.needs_login && <> <span className="badge b-orange">ต้อง Login</span></>}</td></tr>
          <tr><th>หน้าเว็บที่ทดสอบ</th><td className="mono small" style={{ wordBreak: "break-all" }}>{d.page.url}</td></tr>
          <tr><th>เงื่อนไขก่อนเริ่ม (Pre-condition)</th><td className="small">
            {start ? <>เปิดหน้า <span className="mono" style={{ wordBreak: "break-all" }}>{start}</span></> : <>เปิดหน้าเว็บที่ทดสอบ</>}
            {pre.length ? <><br />{pre.join(" ")} — Test Case นี้ต่อจากขั้นตอนของ Test Case ก่อนหน้า</> :
              independent !== undefined ? <><br /><span className="badge b-green">เริ่มเองได้ ไม่ต้องทำ Test Case อื่นก่อน</span></> : null}
          </td></tr>
          <tr><th>ขั้นตอน (Steps)</th><td><ol style={{ margin: 0, paddingLeft: 18 }}>{steps.map((s, i) => <li key={i} style={{ marginBottom: 2 }}>{s}</li>)}</ol></td></tr>
          <tr><th>ผลที่คาดหวัง (Expected)</th><td>{c.expected}</td></tr>
          {c.observed && <tr><th>ที่มา / สิ่งที่สังเกต</th><td className="small">{c.observed}</td></tr>}
          <tr><th>ผลรันล่าสุด</th><td className="small">{c.last_result ? <><Badge status={c.last_result} /> {c.last_run_at ? fmtDate(c.last_run_at) : ""}
            {c.last_result === "FAILED" && c.last_message && <pre className="codeview" style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>{c.last_message}</pre>}</> : <span className="muted">ยังไม่ได้รัน</span>}</td></tr>
        </tbody></table>
      </div>

      <div className="card" style={{ marginTop: 12 }} aria-label="ที่มาของ Test Case">
        <h3 style={{ marginTop: 0 }}>ที่มา</h3>
        <div className="small">
          ออกแบบครั้งแรก {fmtDate(c.first_seen)} จาก <Link className="mono" href={`/web-explorer?id=${c.first_exploration}`}>{c.first_exploration}</Link>
          {" · "}ล่าสุด {fmtDate(c.last_seen)}{c.last_exploration && c.last_exploration !== c.first_exploration ? <> (<Link className="mono" href={`/web-explorer?id=${c.last_exploration}`}>{c.last_exploration}</Link>)</> : null}
          {src && <><br />แหล่งข้อมูลที่แสดง: {src.kind === "record" ? "บันทึกการใช้งาน (Record)" : "การสำรวจอัตโนมัติ"} โดย {src.created_by} · <Link href={`/web-explorer?id=${src.id}`}>เปิดผลนี้ใน Web Explorer (เล่นซ้ำ/Run ได้)</Link>
            {src.func && <><br />ฟังก์ชันทดสอบ: <span className="mono">{src.file}::{src.func}</span></>}</>}
          {!src && <><br /><span className="muted">ผลสำรวจต้นทางถูกลบแล้ว — แสดงเฉพาะข้อมูลที่เก็บในประวัติ</span></>}
        </div>
      </div>

      {d.script.length > 0 && <div className="card" style={{ marginTop: 12 }} aria-label="Script ทีละขั้นตอน">
        <h3 style={{ marginTop: 0 }}>Script ทีละขั้นตอน (จากการบันทึก)</h3>
        <div className="tblwrap"><table><thead><tr><th>#</th><th>เหตุการณ์</th><th>อยู่ตรงไหน</th><th>คำสั่ง (Playwright)</th><th>ความหมาย</th></tr></thead><tbody>
          {d.script.map(r => <tr key={r.no}>
            <td className="small">{r.no}</td><td className="small"><b>{r.event}</b></td><td className="small">{r.where || "-"}</td>
            <td className="mono small" style={{ wordBreak: "break-all" }}>{r.command}</td><td className="small muted">{r.meaning}</td>
          </tr>)}
        </tbody></table></div>
      </div>}

      <div className="card" style={{ marginTop: 12 }} aria-label="โค้ดทดสอบ">
        <div className="row-flex" style={{ justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <h3 style={{ margin: 0 }}>โค้ดทดสอบ (pytest + Playwright)</h3>
          {d.code && <Button size="sm" onClick={() => onCopy(d.code)}>คัดลอกโค้ด</Button>}
        </div>
        {d.code ? <pre className="codeview" style={{ marginTop: 8, overflowX: "auto" }}>{d.code}</pre> :
          <p className="small muted">ไม่มีโค้ดของ Test Case นี้ (ผลสำรวจต้นทางถูกลบ หรือเป็นข้อที่สร้างก่อนระบบเก็บโค้ด) — ดาวน์โหลดรวมได้จากหน้าประวัติ (pytest รวมทุก TC)</p>}
      </div>
    </>
  );
}
