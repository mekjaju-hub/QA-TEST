import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

export function Card({ className, ...p }: HTMLAttributes<HTMLDivElement>) { return <div className={cn("card", className)} {...p} />; }
export function CardTitle({ className, ...p }: HTMLAttributes<HTMLHeadingElement>) { return <h2 className={cn(className)} {...p} />; }
