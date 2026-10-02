"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { passwordSchema, type PasswordInput } from "@/lib/schemas";
import { Button } from "@/components/ui/button";

export default function ChangePasswordPage() {
  const { user, setSession } = useAuth();
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<PasswordInput>({ resolver: zodResolver(passwordSchema) });
  const onSubmit = async (v: PasswordInput) => {
    setErr(null);
    try {
      const r = await api.post<{ access_token: string }>("/api/auth/change-password", { current_password: v.current_password, new_password: v.new_password });
      await setSession(r.access_token);
      router.replace("/projects");
    } catch (e) { setErr(e instanceof ApiError ? e.body.user_message : String(e)); }
  };
  const fe = (k: keyof PasswordInput) => errors[k] && <span className="small" style={{ color: "var(--red)" }}>{errors[k]?.message}</span>;
  return (
    <div className="login">
      <div className="l"><h1>เปลี่ยนรหัสผ่าน</h1><p>{user?.must_change_password ? "บัญชีนี้ต้องเปลี่ยนรหัสผ่านก่อนใช้งาน (Seed/Reset Password)" : "ตั้งรหัสผ่านใหม่"}</p>
        <p className="small">อย่างน้อย 10 ตัว มีตัวพิมพ์ใหญ่ พิมพ์เล็ก ตัวเลข และอักขระพิเศษ — รหัสผ่านถูก Hash ด้วย bcrypt</p></div>
      <div className="r">
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          {err && <div className="err-box" role="alert">{err}</div>}
          <div className="field"><label htmlFor="cur">รหัสผ่านปัจจุบัน</label><input id="cur" type="password" autoComplete="current-password" {...register("current_password")} />{fe("current_password")}</div>
          <div className="field"><label htmlFor="np">รหัสผ่านใหม่</label><input id="np" type="password" autoComplete="new-password" {...register("new_password")} />{fe("new_password")}</div>
          <div className="field"><label htmlFor="cf">ยืนยันรหัสผ่านใหม่</label><input id="cf" type="password" autoComplete="new-password" {...register("confirm")} />{fe("confirm")}</div>
          <Button variant="primary" type="submit" loading={isSubmitting}>บันทึก</Button>
        </form>
      </div>
    </div>
  );
}
