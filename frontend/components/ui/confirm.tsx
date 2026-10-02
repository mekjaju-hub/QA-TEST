"use client";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Dialog } from "./dialog";
import { Button } from "./button";

type Opts = { title: string; body?: ReactNode; confirmText?: string; danger?: boolean; prompt?: { label: string; initial?: string; required?: boolean; multiline?: boolean } };
type Ctx = { confirm: (o: Opts) => Promise<boolean>; prompt: (o: Opts) => Promise<string | null> };
const C = createContext<Ctx | null>(null);

// Confirmation Dialog for important actions (หัวข้อ 36)
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<Opts | null>(null);
  const [val, setVal] = useState("");
  const resolver = useRef<(v: string | null | boolean) => void>(() => undefined);
  const open = (o: Opts) => new Promise<string | null | boolean>(res => { resolver.current = res; setVal(o.prompt?.initial ?? ""); setOpts(o); });
  const close = (v: string | null | boolean) => { setOpts(null); resolver.current(v); };
  const confirm = useCallback(async (o: Opts) => (await open(o)) === true, []);
  const prompt = useCallback(async (o: Opts) => { const r = await open(o); return typeof r === "string" ? r : null; }, []);
  return (
    <C.Provider value={{ confirm, prompt }}>
      {children}
      <Dialog open={!!opts} onOpenChange={o => { if (!o) close(opts?.prompt ? null : false); }} title={opts?.title ?? ""} description={opts?.body}
        footer={<>
          <Button onClick={() => close(opts?.prompt ? null : false)}>ยกเลิก</Button>
          <Button variant={opts?.danger ? "danger" : "primary"} disabled={!!opts?.prompt?.required && !val.trim()}
            onClick={() => close(opts?.prompt ? val.trim() : true)}>{opts?.confirmText ?? "ยืนยัน"}</Button>
        </>}>
        {opts?.prompt && <div className="field"><label htmlFor="dlg-input">{opts.prompt.label}</label>
          {opts.prompt.multiline ? <textarea id="dlg-input" value={val} onChange={e => setVal(e.target.value)} autoFocus /> :
            <input id="dlg-input" type="text" value={val} onChange={e => setVal(e.target.value)} autoFocus />}</div>}
      </Dialog>
    </C.Provider>
  );
}

export function useConfirm() {
  const v = useContext(C);
  if (!v) throw new Error("useConfirm outside ConfirmProvider");
  return v;
}
