"use client";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { loginSchema, type LoginInput } from "@/lib/schemas";
import { Button } from "@/components/ui/button";

function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const { setSession } = useAuth();
  const [err, setErr] = useState<string | null>(sp.get("reason"));
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });
  const onSubmit = async (v: LoginInput) => {
    setErr(null);
    try {
      const r = await api.post<{ access_token: string; must_change_password: boolean }>("/api/auth/login", v);
      await setSession(r.access_token);
      router.replace(r.must_change_password ? "/change-password" : (sp.get("next") || "/projects"));
    } catch (e) {
      setErr(e instanceof ApiError ? e.body.user_message : String(e));
    }
  };
  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate aria-label="เข้าสู่ระบบ">
      <h1 style={{ marginBottom: 6 }}>เข้าสู่ระบบ</h1>
      <p className="muted small">Local Account (รองรับ SSO/Entra ID ในอนาคต)</p>
      {err && <div className="err-box" role="alert">{err}</div>}
      <div className="field"><label htmlFor="username">Username</label><input id="username" type="text" autoComplete="username" {...register("username")} />{errors.username && <span className="small" style={{ color: "var(--red)" }}>{errors.username.message}</span>}</div>
      <div className="field"><label htmlFor="password">Password</label><input id="password" type="password" autoComplete="current-password" {...register("password")} />{errors.password && <span className="small" style={{ color: "var(--red)" }}>{errors.password.message}</span>}</div>
      <Button variant="primary" type="submit" loading={isSubmitting} style={{ width: "100%", justifyContent: "center" }}>เข้าสู่ระบบ</Button>
      <p className="small muted" style={{ marginTop: 12 }}>ครั้งแรก: ใช้ Seed Admin แล้วระบบจะบังคับเปลี่ยนรหัสผ่านทันที</p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="login">
      <div className="l">
        <h1>BRS to QA Automation Platform</h1>
        <p>แปลงเอกสาร BRS เป็น Requirement, Test Case และ Automation โดยมี QA อนุมัติทุกขั้น</p>
        <div className="flow"><div>AI Draft</div><div>QA Review → Needs Clarification</div><div>Approved</div><div>Generate Automation</div><div>Run Test → Review Result</div></div>
      </div>
      <div className="r"><Suspense><LoginForm /></Suspense></div>
    </div>
  );
}
