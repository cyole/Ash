import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { DEFAULT_HERMES_API_URL, HermesApiClient } from "@/lib/hermes/api";
import { dashboardApi, getRuntimeConnection, getRuntimeStatus, isTauriRuntime } from "@/lib/tauri";

export const hermesQueryKeys = {
  extensionsCatalog: ["hermes-extensions-catalog"] as const,
  runtimeStatus: ["runtime-status"] as const,
  runtimeConnection: ["runtime-connection"] as const,
  sessions: (apiUrl: string, hasSessionToken: boolean) => ["hermes-sessions", apiUrl, hasSessionToken] as const,
  models: (apiUrl: string, hasSessionToken: boolean) => ["hermes-models", apiUrl, hasSessionToken] as const,
  modelSettings: (apiUrl: string, hasSessionToken: boolean) => ["hermes-model-settings", apiUrl, hasSessionToken] as const,
  sessionMessages: (apiUrl: string, hasSessionToken: boolean, sessionId: string | null) =>
    ["hermes-session-messages", apiUrl, hasSessionToken, sessionId] as const,
};

export function useHermesApi() {
  const tauriRuntime = useMemo(() => isTauriRuntime(), []);

  const status = useQuery({
    queryKey: hermesQueryKeys.runtimeStatus,
    queryFn: getRuntimeStatus,
    refetchInterval: 15_000,
  });

  const connection = useQuery({
    queryKey: hermesQueryKeys.runtimeConnection,
    queryFn: getRuntimeConnection,
    retry: false,
  });

  const apiUrl = connection.data?.apiUrl ?? status.data?.apiUrl ?? DEFAULT_HERMES_API_URL;
  const sessionToken = connection.data?.sessionToken ?? undefined;
  const apiReady = !tauriRuntime || connection.isSuccess;
  const client = useMemo(
    () => new HermesApiClient({
      baseUrl: apiUrl,
      requestImpl: tauriRuntime ? dashboardApi : undefined,
      sessionToken,
    }),
    [apiUrl, sessionToken, tauriRuntime],
  );

  return {
    apiReady,
    apiUrl,
    client,
    connection,
    sessionToken,
    status,
    tauriRuntime,
  };
}
