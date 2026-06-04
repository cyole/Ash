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
  method?: "DELETE" | "GET" | "PATCH" | "POST";
  path: string;
}

export interface OpenAICompatibleModelConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  contextLength?: number | null;
}

export interface ModelConfigStatus {
  configured: boolean;
  providerKey: string | null;
  name: string | null;
  baseUrl: string | null;
  model: string | null;
  hasApiKey: boolean;
  configPath: string;
}

export interface OpenAIModelsResult {
  models: string[];
  modelsUrl: string;
}

export interface HermesExtensionsCatalog {
  skills: HermesSkillCatalogItem[];
  plugins: HermesPluginCatalogItem[];
  skillsRoot: string;
  optionalSkillsRoot: string;
  pluginsRoot: string;
}

export interface HermesSkillCatalogItem {
  name: string;
  description: string;
  category: string;
  source: "installed" | "bundled" | "optional" | string;
  status: "enabled" | "available" | "disabled" | string;
  version: string | null;
  author: string | null;
  path: string;
}

export interface HermesPluginCatalogItem {
  key: string;
  name: string;
  description: string;
  kind: string;
  version: string | null;
  author: string | null;
  source: "bundled" | "user" | string;
  status: "enabled" | "available" | "disabled" | string;
  requiresEnv: string[];
  path: string;
}
