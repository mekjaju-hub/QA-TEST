"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { Project } from "./types";

export function useProject(pid: string) {
  return useQuery({ queryKey: ["project", pid], queryFn: () => api.get<Project>(`/api/projects/${pid}`) });
}

export function projectCrumbs(pid: string, code: string | undefined, ...rest: [string, string?][]): [string, string?][] {
  return [["Projects", "/projects"], [code ?? "…", `/projects/${pid}`], ...rest];
}
