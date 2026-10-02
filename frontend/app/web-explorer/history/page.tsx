"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell, PageHead } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, ErrorState, Loading } from "@/components/ui/states";
import { api, download } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { fmtDate } from "@/lib/utils";

type PageSummary = { key: string; page: string; url: string; title: string; updated_at: string; explorations: number; test_cases: number; passed_last: number; failed_last: number };
type HistTC = {
  sig: string; hid: string; title: string; type: string; priority: string; steps: string[]; expected: string; observed: string; needs_login: boolean;
  first_seen: string; last_seen: string; first_exploration: string; designed: number; runs: number; passed: number; last_result?: string; last_message?: string;
};
type HistExpl = { id: string; at: string; by: string; status: number | null; tc: number; new_tc: number; login: string; last_run?: Record<string, number>; deleted?: boolean };
type History = { key: string; page: string; url: string; title: string; created_at: string; updated_at: string; explorations: HistExpl[]; test_cases: HistTC[] };

const KIND: Record<string, string> = { page: "หน้าเว็บ", login: "Login", home: "หลัง Login", field: "ช่องกรอก" };

export default function WebHistoryPage() {
  const { can } = useAuth();
  const { toastError } = useToast();
  const [key, setKey] = useState<string | null>(null);
  const [filter, setFilter] = useState({ q: "", kind: "", result: "" });
  useEffect(() => { const k = new URLSearchParams(window.location.search).get("key"); if (k) setKey(k); }, []);

  const pages = useQuery({ queryKey: ["web-history"], queryFn: () => api.get<PageSummary[]>("/api/web-history"), enabled: can("auto.view") });
  const det = useQuery({ queryKey: ["web-history", key], queryFn: () => api.get<History>(`/api/web-history/${key}`), enabled: !!key });
  const h = det.data;

  const rows = useMemo(() => (h?.test_cases ?? []).filter(t =>
    (!filter.q || `${t.hid} ${t.title} ${t.expected}`.toLowerCase().includes(filter.q.toLowerCase())) &&
    (!filter.kind || t.sig.startsWith(filter.kind + ".")) &&
    (!filter.result || (filter.result === "none" ? !t.last_result : t.last_result === filter.result))), [h, filter]);

  if (!can("auto.view")) return <AppShell crumbs={[["Web History"]]}><div className="err-box">ไม่มีสิทธิ์ดูหน้านี้</div></AppShell>;

  return (
    <AppShell crumbs={[["Web Explorer", "/web-explorer"], ["ประวัติ Test Case ของหน้าเว็บ"]]}>
      <PageHead title="Web History · ประวัติ Test Case ของแต่ละหน้าเว็บ"
        sub="ทุกครั้งที่สำรวจหน้าเว็บ Test Case จะถูกเก็บไว้ที่นี่ หน้าเดียวกันเก็บรวมกัน (ไม่สน ?query) และแต่ละ Test Case มีรหัส WP-xxx ถาวร ไม่ซ้ำกัน"
        actions={<Link className="btn" href="/web-explorer">← กลับไป Web Explorer</Link>} />

      {pages.isLoading ? <Loading /> : pages.error ? <ErrorState error={pages.error} /> : !pages.data?.length ?
        <Empty title="ยังไม่มีประวัติ" body="ไปที่ Web Explorer แล้วสำรวจหน้าเว็บสักหน้า ประวัติจะเริ่มเก็บอัตโนมัติ" action={<Link className="btn pri" href="/web-explorer">ไป Web Explorer</Link>} /> :
        <div className="tblwrap" style={{ maxHeight: 300, overflowY: "auto" }}><table><thead><tr>
          <th>หน้าเว็บ</th><th>สำรวจ (ครั้ง)</th><th>Test Case สะสม</th><th>ผลรันล่าสุด</th><th>อัปเดต</th></tr></thead><tbody>
          {pages.data.map(p => (
            <tr key={p.key} onClick={() => setKey(p.key)} style={{ cursor: "pointer", background: p.key === key ? "var(--blue-bg)" : undefined }}>
              <td className="small"><b>{p.title || "(ไม่มี title)"}</b><br /><span className="muted mono">{p.page}</span></td>
              <td>{p.explorations}</td>
              <td><b>{p.test_cases}</b></td>
              <td className="small">{p.passed_last + p.failed_last ? <>ผ่าน {p.passed_last} · ไม่ผ่าน {p.failed_last}</> : <span className="muted">ยังไม่ได้รัน</span>}</td>
              <td className="small">{fmtDate(p.updated_at)}</td>
            </tr>))}
        </tbody></table></div>}

      {key && (det.isLoading ? <Loading /> : det.error ? <ErrorState error={det.error} /> : h && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="row-flex" style={{ justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div><h2 style={{ margin: 0 }}>{h.title || h.page}</h2>
              <span className="small muted">{h.page} · เริ่มเก็บ {fmtDate(h.created_at)} · {h.explorations.length} การสำรวจ · {h.test_cases.length} Test Case</span></div>
            <div className="row-flex" style={{ gap: 8, flexWrap: "wrap" }}>
              <Link className="btn sm pri" href={`/web-explorer?url=${encodeURIComponent(h.url)}`}>สำรวจหน้านี้อีกครั้ง (ได้ TC ใหม่)</Link>
              <Button size="sm" onClick={() => download(`/api/web-history/${h.key}/zip`, `webtest_history_${h.key}.zip`).catch(toastError)}>pytest รวมทุก TC (ZIP)</Button>
              <Button size="sm" onClick={() => download(`/api/web-history/${h.key}/csv`, `web_history_${h.key}.csv`).catch(toastError)}>Export CSV (Excel)</Button>
            </div>
          </div>

          <Stats tcs={h.test_cases} />

          <h3>Test Case ทั้งหมดของหน้านี้</h3>
          <div className="toolbar">
            <input type="text" aria-label="ค้นหา Test Case" placeholder="ค้นหา WP-ID / ชื่อ / ผลที่คาดหวัง" value={filter.q} onChange={e => setFilter({ ...filter, q: e.target.value })} />
            <select aria-label="กลุ่ม" value={filter.kind} onChange={e => setFilter({ ...filter, kind: e.target.value })}>
              <option value="">ทุกกลุ่ม</option>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select aria-label="ผลรันล่าสุด" value={filter.result} onChange={e => setFilter({ ...filter, result: e.target.value })}>
              <option value="">ทุกผล</option><option value="PASSED">ผ่าน</option><option value="FAILED">ไม่ผ่าน</option><option value="SKIPPED">ข้าม</option><option value="none">ยังไม่ได้รัน</option>
            </select>
            <span className="small muted">{rows.length} รายการ</span>
          </div>
          <div className="tblwrap"><table><thead><tr>
            <th>ID</th><th>Test Case</th><th>กลุ่ม / ประเภท</th><th>ขั้นตอน</th><th>ผลที่คาดหวัง</th><th>ออกแบบครั้งแรก</th><th>ถูกออกแบบ</th><th>ผลรันล่าสุด</th></tr></thead><tbody>
            {rows.map(t => (
              <tr key={t.sig}>
                <td className="mono small">{t.hid}</td>
                <td><b>{t.title}</b>{t.needs_login && <><br /><span className="badge b-orange">ต้อง Login</span></>}</td>
                <td className="small">{KIND[t.sig.split(".")[0]] ?? "-"}<br /><span className="muted">{t.type} · {t.priority}</span></td>
                <td className="small"><ol style={{ margin: 0, paddingLeft: 16 }}>{t.steps.map((s, i) => <li key={i}>{s}</li>)}</ol></td>
                <td className="small">{t.expected}</td>
                <td className="small">{fmtDate(t.first_seen)}<br /><Link className="mono" href={`/web-explorer?id=${t.first_exploration}`}>{t.first_exploration}</Link></td>
                <td className="small">{t.designed} ครั้ง</td>
                <td className="small">{t.last_result ? <><Badge status={t.last_result} /><br /><span className="muted">รัน {t.runs} · ผ่าน {t.passed}</span>
                  {t.last_result === "FAILED" && t.last_message && <details><summary>เหตุผล</summary><span style={{ whiteSpace: "pre-wrap" }}>{t.last_message}</span></details>}</> : <span className="muted">-</span>}</td>
              </tr>))}
          </tbody></table></div>

          <h3>ไทม์ไลน์การสำรวจ</h3>
          <div className="tblwrap"><table><thead><tr><th>เวลา</th><th>โดย</th><th>HTTP</th><th>Login</th><th>Test Case</th><th>ใหม่</th><th>ผลรัน</th><th></th></tr></thead><tbody>
            {[...h.explorations].reverse().map(x => (
              <tr key={x.id}>
                <td className="small">{fmtDate(x.at)}</td><td className="small">{x.by}</td><td>{x.status ?? "-"}</td>
                <td>{x.login === "ok" ? <Badge status="PASSED">สำเร็จ</Badge> : x.login === "fail" ? <Badge status="FAILED">ไม่สำเร็จ</Badge> : <span className="muted">-</span>}</td>
                <td>{x.tc}</td><td><b>+{x.new_tc}</b></td>
                <td className="small">{x.last_run ? `${x.last_run.passed ?? 0}/${x.last_run.total ?? 0} ผ่าน` : "-"}</td>
                <td className="small">{x.deleted ? <span className="muted">ลบผลสำรวจแล้ว</span> : <Link href={`/web-explorer?id=${x.id}`}>เปิด</Link>}</td>
              </tr>))}
          </tbody></table></div>
        </div>
      ))}
    </AppShell>
  );
}

function Stats({ tcs }: { tcs: HistTC[] }) {
  const by = (k: string) => tcs.filter(t => t.sig.startsWith(k + ".")).length;
  const ran = tcs.filter(t => t.last_result);
  return (
    <div className="grid g4" style={{ margin: "12px 0" }}>
      <div className="kpi card"><div className="v">{tcs.length}</div><div className="k">Test Case สะสม</div></div>
      <div className="kpi card"><div className="v">{by("page")} / {by("login")} / {by("home")} / {by("field")}</div><div className="k">หน้าเว็บ / Login / หลัง Login / ช่องกรอก</div></div>
      <div className="kpi card"><div className="v">{ran.filter(t => t.last_result === "PASSED").length} / {ran.length}</div><div className="k">ผ่าน / เคยรัน</div></div>
      <div className="kpi card"><div className="v">{ran.filter(t => t.last_result === "FAILED").length}</div><div className="k">ไม่ผ่านในรอบล่าสุด (ควรตรวจ)</div></div>
    </div>
  );
}
