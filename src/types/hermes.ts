export type RuntimeMode =
  | "local-app"
  | "local-managed"
  | "local-managed-dashboard"
  | "local-existing"
  | "remote"
  | "browser-preview";

export interface HermesStatus {
  installed: boolean;
  running: boolean;
  dashboardRunning: boolean;
  backgroundGatewayRunning: boolean;
  sessionTokenConfigured: boolean;
  path: string | null;
  pythonPath: string | null;
  version: string | null;
  mode: RuntimeMode;
  apiUrl: string;
  wsUrl: string | null;
  installSource: "managed" | "system" | string;
  bundledRuntimeArchive: string;
  bundledRuntimeFound: boolean;
  managedRoot: string;
  hermesHome: string;
  configPath: string;
  legacyConfigPath: string | null;
  legacyConfigFound: boolean;
  logPath: string;
  recentLogLines: string[];
  dashboardStatus: string | null;
  backendPid: number | null;
}

export interface RuntimeCommandResult {
  success: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface RuntimeConnection {
  apiUrl: string;
  wsUrl: string | null;
  sessionToken: string | null;
}

export interface RuntimeDashboardApiInput {
  body?: unknown;
  method?: "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
  path: string;
  timeoutMs?: number;
}
