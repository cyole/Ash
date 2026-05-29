import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { HermesSettingsProvider } from "@/features/settings/settings-store";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 10_000,
    },
  },
});

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <HermesSettingsProvider>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </HermesSettingsProvider>
  );
}
