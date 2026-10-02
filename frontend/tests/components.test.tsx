import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Badge, NFValue } from "@/components/ui/badge";
import { Highlight, Reasons } from "@/components/req-bits";
import { ErrorState, ScoreBar } from "@/components/ui/states";
import { ApiError } from "@/lib/api";
import { loginSchema, passwordSchema, projectSchema, type LoginInput } from "@/lib/schemas";

describe("Badge (Color Convention หัวข้อ 36)", () => {
  it.each([["APPROVED", "b-green"], ["CONFLICT", "b-red"], ["NEEDS_CLARIFICATION", "b-orange"], ["AI_GENERATED", "b-purple"], ["DRAFT", "b-gray"], ["REVISED", "b-blue"]])("%s → %s", (s, cls) => {
    render(<Badge status={s} />);
    expect(screen.getByText(s)).toHaveClass("badge", cls);
  });
  it("NOT_FOUND rendered in red mono", () => {
    render(<NFValue v="NOT_FOUND" />);
    expect(screen.getByText("NOT_FOUND")).toHaveClass("nf");
  });
});

describe("Requirement bits", () => {
  it("highlights threshold and role inside source text", () => {
    const { container } = render(<Highlight text="ยอดรวมมากกว่าหรือเท่ากับ 200,000 บาท ให้เจ้าหน้าที่Compliance" needles={["มากกว่าหรือเท่ากับ 200,000 บาท", "เจ้าหน้าที่Compliance", "NOT_FOUND"]} />);
    const marks = container.querySelectorAll("mark");
    expect(Array.from(marks).map(m => m.textContent)).toEqual(["มากกว่าหรือเท่ากับ 200,000 บาท", "เจ้าหน้าที่Compliance"]);
  });
  it("score reasons show ✓/✗ classes (no score without reason)", () => {
    const { container } = render(<><ScoreBar label="Completeness" score={65} /><Reasons items={[{ ok: true, text: "มี Input" }, { ok: false, text: "ไม่มี Expected Result" }]} /></>);
    expect(container.querySelector("li.y")?.textContent).toBe("มี Input");
    expect(container.querySelector("li.n")?.textContent).toBe("ไม่มี Expected Result");
    expect(screen.getByText("65")).toBeInTheDocument();
  });
});

describe("ErrorState (หัวข้อ 38)", () => {
  it("shows code, user message, correlation id and retry", async () => {
    const onRetry = vi.fn();
    render(<ErrorState error={new ApiError(409, { code: "HAS_CONFLICT", user_message: "มี Conflict ที่ยังไม่ Resolve", timestamp: "", retryable: false, suggested_action: "ไปที่ Clarification Center", correlation_id: "abc12345" })} onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("HAS_CONFLICT");
    expect(screen.getByRole("alert")).toHaveTextContent("abc12345");
    await userEvent.click(screen.getByText("ลองใหม่"));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe("Form validation (Zod)", () => {
  it("password policy", () => {
    expect(passwordSchema.safeParse({ current_password: "x", new_password: "short", confirm: "short" }).success).toBe(false);
    expect(passwordSchema.safeParse({ current_password: "Admin@12345", new_password: "N3w-Strong!Pass", confirm: "N3w-Strong!Pass" }).success).toBe(true);
    expect(passwordSchema.safeParse({ current_password: "a", new_password: "N3w-Strong!Pass", confirm: "different" }).success).toBe(false);
  });
  it("project code uppercase rule", () => {
    expect(projectSchema.parse({ code: "cam", name: "x" }).code).toBe("CAM");
    expect(projectSchema.safeParse({ code: "1AB", name: "x" }).success).toBe(false);
  });

  function LoginProbe({ onValid }: { onValid: (v: LoginInput) => void }) {
    const { register, handleSubmit, formState: { errors } } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });
    return <form onSubmit={handleSubmit(onValid)}><input aria-label="u" {...register("username")} /><input aria-label="p" {...register("password")} />{errors.username && <span>{errors.username.message}</span>}<button type="submit">go</button></form>;
  }
  it("RHF + Zod blocks empty login", async () => {
    const onValid = vi.fn();
    render(<LoginProbe onValid={onValid} />);
    await userEvent.click(screen.getByText("go"));
    expect(await screen.findByText("กรุณากรอก Username")).toBeInTheDocument();
    expect(onValid).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText("u"), "admin");
    await userEvent.type(screen.getByLabelText("p"), "x");
    await userEvent.click(screen.getByText("go"));
    expect(onValid).toHaveBeenCalled();
  });
});
