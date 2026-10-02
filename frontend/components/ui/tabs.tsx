"use client";
import * as T from "@radix-ui/react-tabs";
import type { ReactNode } from "react";

export function Tabs({ value, onValueChange, items, children }: { value: string; onValueChange: (v: string) => void; items: { value: string; label: ReactNode }[]; children: ReactNode }) {
  return (
    <T.Root value={value} onValueChange={onValueChange}>
      <T.List className="tabs" aria-label="tabs">
        {items.map(i => <T.Trigger key={i.value} value={i.value} className={value === i.value ? "on" : ""}>{i.label}</T.Trigger>)}
      </T.List>
      {children}
    </T.Root>
  );
}
export const TabPanel = T.Content;
