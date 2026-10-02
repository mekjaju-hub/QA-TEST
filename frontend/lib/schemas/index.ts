import { z } from "zod";

// Form validation (React Hook Form + Zod) — mirrors backend Pydantic rules
export const loginSchema = z.object({
  username: z.string().trim().min(1, "กรุณากรอก Username").max(64),
  password: z.string().min(1, "กรุณากรอก Password").max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const passwordSchema = z.object({
  current_password: z.string().min(1, "กรุณากรอกรหัสผ่านปัจจุบัน"),
  new_password: z.string().min(10, "อย่างน้อย 10 ตัวอักษร")
    .regex(/[a-z]/, "ต้องมีตัวพิมพ์เล็ก").regex(/[A-Z]/, "ต้องมีตัวพิมพ์ใหญ่").regex(/\d/, "ต้องมีตัวเลข").regex(/[^A-Za-z0-9]/, "ต้องมีอักขระพิเศษ"),
  confirm: z.string(),
}).refine(d => d.new_password === d.confirm, { message: "รหัสผ่านใหม่ไม่ตรงกัน", path: ["confirm"] })
  .refine(d => d.new_password !== d.current_password, { message: "รหัสผ่านใหม่ต้องไม่ซ้ำรหัสเดิม", path: ["new_password"] });
export type PasswordInput = z.infer<typeof passwordSchema>;

export const projectSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9]{1,15}$/, "ตัวพิมพ์ใหญ่/ตัวเลข 2–16 ตัว เริ่มด้วยตัวอักษร"),
  name: z.string().trim().min(1, "กรุณากรอกชื่อ Project").max(200),
  description: z.string().max(4000).optional().default(""),
});
export type ProjectInput = z.input<typeof projectSchema>;

export const pasteSchema = z.object({
  title: z.string().trim().min(1, "กรุณาตั้งชื่อเอกสาร").max(180),
  text: z.string().min(10, "ข้อความสั้นเกินไป (อย่างน้อย 10 ตัวอักษร)"),
});
export type PasteInput = z.infer<typeof pasteSchema>;

export const reasonSchema = z.object({ reason: z.string().trim().min(3, "ระบุเหตุผลอย่างน้อย 3 ตัวอักษร") });

export const jmeterSchema = z.object({
  type: z.enum(["Load", "Stress", "Spike"]),
  url: z.string().url("URL ไม่ถูกต้อง"),
  users: z.coerce.number().int().min(1).max(10000),
  ramp: z.coerce.number().int().min(0).max(3600),
  minutes: z.coerce.number().int().min(1).max(600),
});
