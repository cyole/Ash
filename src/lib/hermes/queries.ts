import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { DEFAULT_HERMES_API_URL, HermesApiClient } from "@/lib/hermes/api";
import { getRuntimeApiAuth, getRuntimeStatus, isTauriRuntime } from "@/lib/tauri";

export const hermesQueryKeys = {
  extensionsCatalog: ["hermes-extensions-catalog"] as const,
  modelConfigStatus: ["model-config-status"] as const,
  runtimeStatus: ["runtime-status"] as const,
  runtimeApiAuth: ["runtime-api-auth"] as const,
  sessions: (apiUrl: string, hasApiKey: boolean) => ["hermes-sessions", apiUrl, hasApiKey] as const,
  models: (apiUrl: string, hasApiKey: boolean) => ["hermes-models", apiUrl, hasApiKey] as const,
  sessionMessages: (apiUrl: string, hasApiKey: boolean, sessionId: string | null) =>
    ["hermes-session-messages", apiUrl, hasApiKey, sessionId] as const,
};

export function useHermesApi() {
  const tauriRuntime = useMemo(() => isTauriRuntime(), []);

  const status = useQuery({
    queryKey: hermesQueryKeys.runtimeStatus,
    queryFn: getRuntimeStatus,
    refetchInterval: 15_000,
  });

  const apiAuth = useQuery({
    queryKey: hermesQueryKeys.runtimeApiAuth,
    queryFn: getRuntimeApiAuth,
    retry: false,
  });

  const apiUrl = apiAuth.data?.apiUrl ?? status.data?.apiUrl ?? DEFAULT_HERMES_API_URL;
  const apiKey = apiAuth.data?.apiKey ?? undefined;
  const apiReady = !tauriRuntime || apiAuth.isSuccess;
  const client = useMemo(() => new HermesApiClient({ baseUrl: apiUrl, apiKey }), [apiKey, apiUrl]);

  return {
    apiAuth,
    apiKey,
    apiReady,
    apiUrl,
    client,
    status,
    tauriRuntime,
  };
}
