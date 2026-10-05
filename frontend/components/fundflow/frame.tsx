"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AppShell, PageHead } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/ui/states";
import { FFError, ff, ffToken, type FFKind, type StaffMe } from "@/lib/fundflow";
import { useToast } from "@/lib/toast";

export type FFSession = { kind: FFKind; name: string; role?: string; can: (p: string) => boolean };

export function useFFError() {
  const { toast } = useToast();
  return (e: unknown) => toast(e instanceof FFError || e instanceof Error ? e.message : String(e), true);
}

function CustomerLogin({ onDone }: { onDone: () => void }) {
  const { toast } = useToast(); const onErr = useFFError();
  const [username, setUsername] = useState("demo");
  const [otp, setOtp] = useState(""); const [ref, setRef] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const request = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { const r = await ff<{ otpRef: string }>(null, "/api/auth/login", { method: "POST", body: { username: username.trim() } }); setRef(r.otpRef); }
    catch (x) { onErr(x); } finally { setBusy(false); }
  };
  const verify = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      const r = await ff<{ token: string; customer: { name: string } }>(null, "/api/auth/verify", { method: "POST", body: { username: username.trim(), otp } });
      ffToken.set("customer", r.token); try { sessionStorage.setItem("ff_name", r.customer.name); } catch { /* blocked */ }
      toast(`ยินดีต้อนรับ ${r.customer.name}`); onDone();
    } catch (x) { onErr(x); } finally { setBusy(false); }
  };
  return (
    <div className="card" style={{ maxWidth: 420 }}>
      <h2>เข้าสู่ระบบลูกค้า FundFlow</h2>
      <form onSubmit={request}>
        <div className="field"><label htmlFor="ff-user">Username</label><input id="ff-user" type="text" data-testid="username-input" value={username} onChange={e => setUsername(e.target.value)} required /></div>
        <Button variant="primary" type="submit" loading={busy && !ref} data-testid="request-otp-btn">ขอ OTP</Button>
      </form>
      {ref && <form onSubmit={verify} style={{ marginTop: 14 }}>
        <p className="muted small" data-testid="otp-ref">อ้างอิง {ref}</p>
        <div className="field"><label htmlFor="ff-otp">OTP (mock: 123456)</label><input id="ff-otp" type="text" maxLength={6} data-testid="otp-input" value={otp} onChange={e => setOtp(e.target.value)} required /></div>
        <Button variant="primary" type="submit" loading={busy} data-testid="verify-otp-btn">ยืนยัน</Button>
      </form>}
    </div>
  );
}

function StaffLogin({ onDone }: { onDone: () => void }) {
  const onErr = useFFError();
  const [f, setF] = useState({ username: "", password: "" }); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { const r = await ff<{ token: string }>(null, "/api/staff/login", { method: "POST", body: { username: f.username.trim(), password: f.password } }); ffToken.set("staff", r.token); onDone(); }
    catch (x) { onErr(x); } finally { setBusy(false); }
  };
  return (
    <div className="card" style={{ maxWidth: 420 }}>
      <h2>เข้าสู่ระบบพนักงาน (Back-office)</h2>
      <form onSubmit={submit}>
        <div className="field"><label htmlFor="ffs-user">Username</label><input id="ffs-user" type="text" autoComplete="off" data-testid="staff-username-input" value={f.username} onChange={e => setF({ ...f, username: e.target.value })} required /></div>
        <div className="field"><label htmlFor="ffs-pass">Password</label><input id="ffs-pass" type="password" autoComplete="new-password" data-testid="staff-password-input" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} required /></div>
        <Button variant="primary" type="submit" loading={busy} data-testid="staff-login-btn">เข้าสู่ระบบ</Button>
      </form>
      <p className="muted small" style={{ marginTop: 10 }}>บัญชีทดสอบ (ใช้ได้เฉพาะ FundFlow ตัวอย่าง): ADMIN <code>admin01</code> / <code>Admin@1234</code> · SALE <code>sale01</code> / <code>Sale@1234</code></p>
    </div>
  );
}

/** Page wrapper: AppShell + FundFlow login gate (customer OTP or staff RBAC) + permission check. */
export function FFPage({ kind, title, sub, perm, crumbs, actions, children }: {
  kind: FFKind; title: string; sub?: ReactNode; perm?: string; crumbs?: [string, string?][]; actions?: ReactNode; children: (s: FFSession) => ReactNode;
}) {
  const [session, setSession] = useState<FFSession | null>(null);
  const [ready, setReady] = useState(false);
  const load = useCallback(async () => {
    const tok = ffToken.get(kind);
    if (!tok) { setSession(null); setReady(true); return; }
    try {
      if (kind === "staff") {
        const me = await ff<StaffMe>("staff", "/api/staff/me");
        setSession({ kind, name: me.name, role: me.role, can: p => me.permissions.includes(p) });
      } else {
        await ff("customer", "/api/wallet");
        let n = ""; try { n = sessionStorage.getItem("ff_name") ?? ""; } catch { /* blocked */ }
        setSession({ kind, name: n, can: () => true });
      }
    } catch (e) { if (e instanceof FFError && e.status === 401) ffToken.clear(kind); setSession(null); }
    setReady(true);
  }, [kind]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const h = (e: Event) => { if ((e as CustomEvent).detail === kind) { ffToken.clear(kind); setSession(null); } };
    window.addEventListener("ff-auth-expired", h); return () => window.removeEventListener("ff-auth-expired", h);
  }, [kind]);
  const logout = () => { ffToken.clear(kind); setSession(null); };

  return (
    <AppShell crumbs={[["FundFlow", "/fundflow"], ...(crumbs ?? []), [title]]}>
      <PageHead title={title} sub={sub} actions={<>
        {session && <span className="small muted" style={{ alignSelf: "center" }}>{session.name}{session.role ? ` · ${session.role}` : ""}</span>}
        {actions}
        {session && <Button size="sm" onClick={logout} data-testid="ff-logout-btn">ออกจากระบบ FundFlow</Button>}
      </>} />
      {!ready ? <Loading /> : !session ? (kind === "staff" ? <StaffLogin onDone={() => void load()} /> : <CustomerLogin onDone={() => void load()} />)
        : perm && !session.can(perm) ? <div className="err-box" role="alert">สิทธิ์ของ {session.role} ไม่สามารถใช้หน้านี้ได้ ({perm})</div>
        : children(session)}
    </AppShell>
  );
}

export function Field({ label, error, hint, children, full }: { label: string; error?: string; hint?: ReactNode; children: ReactNode; full?: boolean }) {
  return <div className="field" style={full ? { gridColumn: "1 / -1" } : undefined}><label>{label}</label>{children}{hint && <span className="small muted">{hint}</span>}{error && <div className="small" role="alert" style={{ color: "var(--red)" }}>{error}</div>}</div>;
}
