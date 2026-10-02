"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { AuthProvider } from "@/lib/auth";
import { ToastProvider } from "@/lib/toast";
import { ConfirmProvider } from "@/components/ui/confirm";
import { ApiError } from "@/lib/api";

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 5000, retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2, refetchOnWindowFocus: false } },
  }));
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <AuthProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
