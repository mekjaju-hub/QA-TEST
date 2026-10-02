"use client";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Project } from "@/lib/types";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Loading } from "./ui/states";

type DashKpi = { kpi: Record<string, number>; last_run: { summary: Record<string, number> } | null };

// Sidebar Navigation — PAGE_SPECIFICATION 27.3 (menus hidden by permission; backend re-checks)
export const NAV: [string, [string, string, string | null][]][] = [
  ["ภาพรวม", [["dashboard", "Dashboard", null], ["", "Project Detail", null]]],
  ["เอกสาร", [["documents/upload", "Upload", "doc.upload"], ["documents/processing", "Processing", null], ["documents/compare", "Version Compare", null]]],
  ["Requirement", [["requirements", "Requirement Explorer", null], ["clarifications", "Clarification & Conflict", null]]],
  ["Test Design", [["test-scenarios", "Test Scenarios", null], ["test-cases", "Test Cases", null]]],
  ["Automation", [["automation/python", "Python", "auto.view"], ["automation/pytest", "Pytest", "auto.view"], ["automation/postman", "Postman", "auto.generate"],
    ["automation/sql", "SQL (MySQL)", "auto.generate"], ["automation/playwright", "Playwright", "auto.generate"], ["automation/jmeter", "JMeter", "auto.generate"]]],
  ["Execution", [["test-runs", "Test Runs", "run.view"]]],
  ["Integration", [["github", "GitHub", "github.propose"]]],
];

export function useProjects() {
  return useQuery({ queryKey: ["projects"], queryFn: () => api.get<Project[]>("/api/projects") });
}

export function AppShell({ crumbs, children }: { crumbs: [string, string?][]; children: ReactNode }) {
  const { user, loading, can, logout, settings } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ pid?: string }>();
  const pid = params?.pid;
  const [open, setOpen] = useState(false);
  const projects = useProjects();
  const dash = useQuery({ queryKey: ["dashboard", pid], queryFn: () => api.get<DashKpi>(`/api/projects/${pid}/dashboard`), enabled: !!pid && !!user, refetchInterval: 15000 });

  useEffect(() => { if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`); }, [loading, user, router, pathname]);
  useEffect(() => { if (user?.must_change_password) router.replace("/change-password"); }, [user, router]);
  if (loading || !user) return <Loading />;

  const k = dash.data?.kpi;
  const count = (key: string) => {
    if (!k) return null;
    if (key === "clarifications" && k.needs_clarification + k.conflicts) return <span className={`cnt ${k.conflicts ? "bad" : "warn"}`}>{k.needs_clarification + k.conflicts}</span>;
    return null;
  };
  return (
    <div className="app">
      <aside className={`side ${open ? "open" : ""}`}>
        <div className="brand"><b>BRS → QA Automation</b><span>Local-first · {settings?.network_sharing ? "LAN sharing ON" : "localhost"}</span></div>
        <nav className="nav" aria-label="เมนูหลัก">
          <Link href="/projects" className={pathname === "/projects" ? "on" : ""}>Projects</Link>
          {pid && NAV.map(([group, items]) => {
            const visible = items.filter(([, , perm]) => !perm || can(perm));
            if (!visible.length) return null;
            return (
              <div key={group}>
                <div className="grp">{group}</div>
                {visible.map(([seg, label]) => {
                  const href = `/projects/${pid}${seg ? "/" + seg : ""}`;
                  const on = seg ? pathname.startsWith(href) : pathname === href;
                  return <Link key={seg} href={href} className={on ? "on" : ""} onClick={() => setOpen(false)}>{label}{count(seg)}</Link>;
                })}
              </div>
            );
          })}
          {can("auto.generate") && <><div className="grp">ฝึก Automation</div>
            <Link href="/web-explorer" className={pathname === "/web-explorer" ? "on" : ""}>Web Explorer</Link></>}
          {(can("settings") || can("audit.view")) && <div className="grp">ระบบ (Admin)</div>}
          {can("settings") && <Link href="/settings" className={pathname === "/settings" ? "on" : ""}>Settings</Link>}
          {can("audit.view") && <Link href="/audit-log" className={pathname === "/audit-log" ? "on" : ""}>Audit Log</Link>}
        </nav>
      </aside>
      <div className="main">
        <header className="top">
          <Button size="sm" className="menu-btn" aria-label="เปิดเมนู" onClick={() => setOpen(o => !o)}>☰</Button>
          <nav className="crumb" aria-label="Breadcrumb">
            {crumbs.map(([label, href], i) => (
              <span key={i}>{i > 0 && " / "}{href && i < crumbs.length - 1 ? <Link href={href}>{label}</Link> : label}</span>
            ))}
          </nav>
          <label className="small muted" htmlFor="projSel">Project</label>
          <select id="projSel" value={pid ?? ""} onChange={e => router.push(e.target.value ? `/projects/${e.target.value}/dashboard` : "/projects")}>
            <option value="">— เลือก Project —</option>
            {projects.data?.map(p => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
          </select>
          <div className="userchip">
            <span>{user.name || user.username}</span>
            {user.role_names.map(r => <Badge key={r}>{r}</Badge>)}
            <Link className="btn sm" href="/change-password">เปลี่ยนรหัสผ่าน</Link>
            <Button size="sm" onClick={() => void logout()}>ออกจากระบบ</Button>
          </div>
        </header>
        <main className="content" id="content">{children}</main>
      </div>
    </div>
  );
}

export function PageHead({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return <div className="pagehead"><div><h1>{title}</h1>{sub && <div className="sub">{sub}</div>}</div><div className="acts">{actions}</div></div>;
}

// Workflow rail — signature element of the prototype
export function Rail({ pid }: { pid: string }) {
  const dash = useQuery({ queryKey: ["dashboard", pid], queryFn: () => api.get<DashKpi & { last_run: { id: string; summary: Record<string, number> } | null }>(`/api/projects/${pid}/dashboard`) });
  const k = dash.data?.kpi;
  if (!k) return null;
  const lr = dash.data?.last_run;
  const items: [string, string | number, string, string][] = [
    ["requirements", k.requirements, "Requirement (AI Draft)", "var(--purple)"],
    ["clarifications", k.needs_clarification + k.conflicts, "รอ Clarify / Conflict", k.conflicts ? "var(--red)" : "var(--orange)"],
    ["test-cases", k.test_cases - k.approved, "Test Case รอ QA Review", "var(--orange)"],
    ["test-cases", k.approved, "Approved", "var(--green)"],
    ["automation/pytest", k.automated, "Automated", "var(--blue)"],
    [lr ? `test-runs/${lr.id}` : "test-runs", lr ? `${lr.summary.passed ?? 0}/${lr.summary.total ?? 0}` : "–", "Run ล่าสุด (Pass)", lr ? ((lr.summary.failed ?? 0) ? "var(--red)" : "var(--green)") : "var(--gray)"],
  ];
  return (
    <nav className="rail" aria-label="Workflow">
      {items.map(([seg, n, l, c], i) => <Link key={i} href={`/projects/${pid}/${seg}`} style={{ ["--c" as string]: c }}><span className="n">{n}</span><span className="l">{l}</span></Link>)}
    </nav>
  );
}
