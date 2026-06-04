import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { DEFAULT_DASHBOARD_API_URL, HermesApiClient } from "@/lib/hermes/api";
import { dashboardApi, getRuntimeConnection, getRuntimeStatus, isTauriRuntime } from "@/lib/tauri";

export const ashQueryKeys = {
  extensions: (apiUrl: string, hasSessionToken: boolean) => ["ash-extensions", apiUrl, hasSessionToken] as const,
  runtimeStatus: ["runtime-status"] as const,
  runtimeConnection: ["runtime-connection"] as const,
  sessions: (apiUrl: string, hasSessionToken: boolean) => ["ash-sessions", apiUrl, hasSessionToken] as const,
  models: (apiUrl: string, hasSessionToken: boolean) => ["ash-models", apiUrl, hasSessionToken] as const,
  modelSettings: (apiUrl: string, hasSessionToken: boolean) => ["ash-model-settings", apiUrl, hasSessionToken] as const,
  messagingPlatforms: (apiUrl: string, hasSessionToken: boolean) => ["ash-messaging-platforms", apiUrl, hasSessionToken] as const,
  sessionMessages: (apiUrl: string, hasSessionToken: boolean, sessionId: string | null) =>
    ["ash-session-messages", apiUrl, hasSessionToken, sessionId] as const,
  toolsetConfig: (apiUrl: string, hasSessionToken: boolean, toolsetName: string) =>
    ["ash-toolset-config", apiUrl, hasSessionToken, toolsetName] as const,
};

export function useAshApi() {
  const tauriRuntime = useMemo(() => isTauriRuntime(), []);

  const status = useQuery({
    queryKey: ashQueryKeys.runtimeStatus,
    queryFn: getRuntimeStatus,
    refetchInterval: 15_000,
  });

  const connection = useQuery({
    queryKey: ashQueryKeys.runtimeConnection,
    queryFn: getRuntimeConnection,
    retry: false,
  });

  const apiUrl = connection.data?.apiUrl ?? status.data?.apiUrl ?? DEFAULT_DASHBOARD_API_URL;
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
