"use client";
import * as D from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Dialog({ open, onOpenChange, title, description, children, wide, footer }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: ReactNode; children?: ReactNode; wide?: boolean; footer?: ReactNode;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="modal-bg" />
        <D.Content className={cn("modal", wide && "wide")} style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 51 }}>
          <D.Title asChild><h2>{title}</h2></D.Title>
          {description ? <D.Description asChild><div className="small muted" style={{ marginBottom: 10 }}>{description}</div></D.Description> : <D.Description className="hide">{title}</D.Description>}
          {children}
          {footer && <div className="acts">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
