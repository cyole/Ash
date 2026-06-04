import { invoke } from "@tauri-apps/api/core";

import type { HermesStreamEvent, SessionChatInput } from "@/lib/hermes/types";
import type {
  HermesExtensionsCatalog,
  HermesStatus,
  ModelConfigStatus,
  OpenAICompatibleModelConfig,
  OpenAIModelsResult,
  RuntimeCommandResult,
  RuntimeConnection,
  RuntimeDashboardApiInput,
} from "@/types/hermes";

export interface AppSettingsLoadResult {
  path: string;
  settings: Record<string, unknown> | null;
}

export interface HermesTuiSession {
  messageCount: number;
  messages: unknown[];
  sessionId: string;
  storedSessionId: string;
}

interface TuiRpcEvent {
  payload: unknown;
  sessionId: string | null;
  type: string;
}

interface JsonRpcResponse<T> {
  error?: {
    code?: number;
    message?: string;
  };
  id?: number;
  result?: T;
}

interface TuiSessionResult {
  message_count?: number;
  messages?: unknown[];
  session_id?: string;
  stored_session_id?: string;
}

const defaultDashboardUrl = "http://127.0.0.1:9120";
const defaultDashboardWsUrl = "ws://127.0.0.1:9120/api/ws";

export function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in window;
}

export async function loadAppSettings(): Promise<AppSettingsLoadResult> {
  if (!isTauriRuntime()) {
    return {
      path: "browser-preview:localStorage/hermes.settings.v1",
      settings: null,
    };
  }

  return invoke<AppSettingsLoadResult>("app_settings_load");
}

export async function saveAppSettings(settings: Record<string, unknown>): Promise<AppSettingsLoadResult> {
  if (!isTauriRuntime()) {
    return {
      path: "browser-preview:localStorage/hermes.settings.v1",
      settings,
    };
  }

  return invoke<AppSettingsLoadResult>("app_settings_save", { input: { settings } });
}

export async function getRuntimeStatus(): Promise<HermesStatus> {
  if (!isTauriRuntime()) {
    return {
      installed: false,
      running: false,
      dashboardRunning: false,
      backgroundGatewayRunning: false,
      sessionTokenConfigured: false,
      path: null,
      pythonPath: null,
      version: null,
      mode: "browser-preview",
      apiUrl: defaultDashboardUrl,
      wsUrl: null,
      installSource: "browser-preview",
      bundledRuntimeArchive: "打开 Tauri 应用后可查看内置运行时路径。",
      bundledRuntimeFound: false,
      managedRoot: "打开 Tauri 应用后可查看托管运行时路径。",
      hermesHome: "打开 Tauri 应用后可查看 Hermes 主目录路径。",
      configPath: "打开 Tauri 应用后可查看本地引擎配置路径。",
      legacyConfigPath: null,
      legacyConfigFound: false,
      logPath: "打开 Tauri 应用后可查看日志路径。",
      recentLogLines: [],
      dashboardStatus: null,
      backendPid: null,
    };
  }

  return invoke<HermesStatus>("runtime_status");
}

export async function prepareRuntime(): Promise<RuntimeCommandResult> {
  return invoke<RuntimeCommandResult>("runtime_prepare");
}

export async function startDashboard(): Promise<RuntimeCommandResult> {
  return invoke<RuntimeCommandResult>("runtime_dashboard_start");
}

export async function stopDashboard(): Promise<RuntimeCommandResult> {
  return invoke<RuntimeCommandResult>("runtime_dashboard_stop");
}

export async function checkDashboard(): Promise<RuntimeCommandResult> {
  return invoke<RuntimeCommandResult>("runtime_dashboard_status");
}

export async function runDoctor(): Promise<RuntimeCommandResult> {
  return invoke<RuntimeCommandResult>("runtime_doctor");
}

export async function setupPortal(): Promise<RuntimeCommandResult> {
  return invoke<RuntimeCommandResult>("runtime_setup_portal");
}

export async function restartDashboard(): Promise<RuntimeCommandResult> {
  return invoke<RuntimeCommandResult>("runtime_dashboard_restart");
}

export async function revealRuntimeLogs(): Promise<RuntimeCommandResult> {
  return invoke<RuntimeCommandResult>("runtime_reveal_logs");
}

export async function getRuntimeConnection(): Promise<RuntimeConnection> {
  if (!isTauriRuntime()) {
    return {
      apiUrl: defaultDashboardUrl,
      sessionToken: null,
      wsUrl: defaultDashboardWsUrl,
    };
  }

  return invoke<RuntimeConnection>("runtime_connection");
}

export async function dashboardApi<T>(input: RuntimeDashboardApiInput): Promise<T> {
  if (!isTauriRuntime()) {
    throw new Error("Hermes dashboard API 代理仅在 Tauri 桌面应用中可用。");
  }

  return invoke<T>("runtime_dashboard_api", { input });
}

export async function getExtensionsCatalog(): Promise<HermesExtensionsCatalog> {
  if (!isTauriRuntime()) {
    return {
      skills: [],
      plugins: [],
      skillsRoot: "打开 Tauri 应用后可查看技能目录。",
      optionalSkillsRoot: "打开 Tauri 应用后可查看可选技能目录。",
      pluginsRoot: "打开 Tauri 应用后可查看插件目录。",
    };
  }

  return invoke<HermesExtensionsCatalog>("runtime_extensions_catalog");
}

export async function getModelConfigStatus(): Promise<ModelConfigStatus> {
  if (!isTauriRuntime()) {
    return {
      configured: false,
      providerKey: null,
      name: null,
      baseUrl: null,
      model: null,
      hasApiKey: false,
      configPath: "打开 Tauri 应用后可查看模型配置路径。",
    };
  }

  return invoke<ModelConfigStatus>("model_config_status");
}

export async function saveOpenAICompatibleModelConfig(
  input: OpenAICompatibleModelConfig,
): Promise<ModelConfigStatus> {
  if (!isTauriRuntime()) {
    throw new Error("模型配置保存仅在 Tauri 桌面应用中可用。");
  }

  return invoke<ModelConfigStatus>("model_config_save_openai", { input });
}

export async function fetchOpenAICompatibleModels(
  input: Pick<OpenAICompatibleModelConfig, "baseUrl" | "apiKey">,
): Promise<OpenAIModelsResult> {
  if (isTauriRuntime()) {
    return invoke<OpenAIModelsResult>("model_config_fetch_openai_models", { input });
  }

  const baseUrl = normalizeOpenAIBaseUrl(input.baseUrl);
  const apiKey = input.apiKey.trim();

  if (!apiKey) {
    throw new Error("请输入 API Key。");
  }

  const modelsUrl = openAIModelsUrl(baseUrl);
  const response = await fetch(modelsUrl, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body.trim() || `模型服务返回 HTTP ${response.status}。`);
  }

  const payload = await response.json() as { data?: Array<{ id?: unknown }> };
  const models = [...new Set((payload.data ?? [])
    .map((model) => typeof model.id === "string" ? model.id.trim() : "")
    .filter(Boolean))]
    .sort();

  if (models.length === 0) {
    throw new Error("模型服务响应中没有 data[].id。");
  }

  return { models, modelsUrl };
}

export async function createHermesTuiSession(title: string): Promise<HermesTuiSession> {
  const rpc = await TuiRpcConnection.connect();
  try {
    const result = await rpc.request<TuiSessionResult>("session.create", {
      cols: 100,
      title,
    });
    return normalizeTuiSessionResult(result);
  } finally {
    rpc.close();
  }
}

export async function* streamHermesSessionChat(input: SessionChatInput): AsyncIterable<HermesStreamEvent> {
  if (input.signal?.aborted) {
    throw abortError();
  }

  const text = input.message.trim();
  if (!text) {
    throw new Error("消息不能为空。");
  }

  const rpc = await TuiRpcConnection.connect(input.signal);
  try {
    const sessionId = await resolveTransientSessionId(rpc, input);
    await rpc.request("prompt.submit", {
      session_id: sessionId,
      text,
    });

    while (true) {
      const event = await rpc.nextEvent(input.signal);
      if (!event) {
        break;
      }

      if (event.type === "gateway.ready") {
        continue;
      }

      if (event.sessionId && event.sessionId !== sessionId) {
        continue;
      }

      yield {
        type: event.type,
        data: event.payload,
      };

      if (event.type === "message.complete" || event.type === "error") {
        break;
      }
    }
  } finally {
    rpc.close();
  }
}

async function resolveTransientSessionId(
  rpc: TuiRpcConnection,
  input: SessionChatInput,
) {
  if (input.transientSessionId) {
    return input.transientSessionId;
  }

  if (input.sessionId) {
    const result = await rpc.request<TuiSessionResult>("session.resume", {
      cols: 100,
      session_id: input.sessionId,
    });
    return normalizeTuiSessionResult(result).sessionId;
  }

  const result = await rpc.request<TuiSessionResult>("session.create", {
    cols: 100,
    title: input.title,
  });
  return normalizeTuiSessionResult(result).sessionId;
}

function normalizeTuiSessionResult(result: TuiSessionResult): HermesTuiSession {
  const sessionId = typeof result.session_id === "string" ? result.session_id : "";
  const storedSessionId = typeof result.stored_session_id === "string" ? result.stored_session_id : sessionId;

  if (!sessionId || !storedSessionId) {
    throw new Error("Hermes TUI 没有返回有效 session_id。");
  }

  return {
    messageCount: typeof result.message_count === "number" ? result.message_count : 0,
    messages: Array.isArray(result.messages) ? result.messages : [],
    sessionId,
    storedSessionId,
  };
}

class TuiRpcConnection {
  private closed = false;
  private eventQueue: TuiRpcEvent[] = [];
  private failure: unknown = null;
  private nextId = 1;
  private pending = new Map<number, {
    reject: (error: unknown) => void;
    resolve: (value: unknown) => void;
  }>();
  private wake: (() => void) | null = null;

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", (event) => this.handleMessage(event.data));
    socket.addEventListener("close", () => {
      this.closed = true;
      this.rejectPending(new Error("Hermes TUI WebSocket 已关闭。"));
      this.notify();
    });
    socket.addEventListener("error", () => {
      this.failure = new Error("Hermes TUI WebSocket 连接失败。");
      this.rejectPending(this.failure);
      this.notify();
    });
  }

  static async connect(signal?: AbortSignal) {
    const connection = await getRuntimeConnection();
    const wsUrl = connection.wsUrl;
    if (!wsUrl) {
      throw new Error("Hermes dashboard 没有返回 WebSocket 地址。");
    }

    const socket = new WebSocket(wsUrl);
    const rpc = new TuiRpcConnection(socket);
    await waitForSocketOpen(socket, signal);
    return rpc;
  }

  close() {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.socket.close();
    this.rejectPending(new Error("Hermes TUI WebSocket 已关闭。"));
    this.notify();
  }

  request<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    if (this.closed || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Hermes TUI WebSocket 未连接。"));
    }

    const id = this.nextId;
    this.nextId += 1;
    const payload = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        reject,
        resolve: (value) => resolve(value as T),
      });
      this.socket.send(JSON.stringify(payload));
    });
  }

  async nextEvent(signal?: AbortSignal): Promise<TuiRpcEvent | null> {
    while (this.eventQueue.length === 0 && !this.closed && !this.failure) {
      await this.wait(signal);
    }

    if (this.failure) {
      throw this.failure;
    }

    return this.eventQueue.shift() ?? null;
  }

  private handleMessage(raw: unknown) {
    const text = typeof raw === "string" ? raw : "";
    if (!text) {
      return;
    }

    let message: unknown;
    try {
      message = JSON.parse(text);
    } catch (error) {
      this.failure = error;
      this.notify();
      return;
    }

    if (!isRecord(message)) {
      return;
    }

    if (readString(message, "method") === "event") {
      const params = recordValue(message.params);
      const type = params ? readString(params, "type") : null;
      if (!type) {
        return;
      }

      this.eventQueue.push({
        payload: params?.payload ?? null,
        sessionId: params ? readString(params, "session_id") : null,
        type,
      });
      this.notify();
      return;
    }

    const id = typeof message.id === "number" ? message.id : null;
    if (id === null) {
      return;
    }

    const pending = this.pending.get(id);
    if (!pending) {
      return;
    }

    this.pending.delete(id);
    const response = message as JsonRpcResponse<unknown>;
    if (response.error) {
      pending.reject(new Error(response.error.message ?? `Hermes TUI RPC ${id} 失败。`));
      return;
    }

    pending.resolve(response.result);
  }

  private notify() {
    this.wake?.();
    this.wake = null;
  }

  private rejectPending(error: unknown) {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }

  private wait(signal?: AbortSignal) {
    if (signal?.aborted) {
      return Promise.reject(abortError());
    }

    return new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        signal?.removeEventListener("abort", handleAbort);
      };
      const handleAbort = () => {
        cleanup();
        reject(abortError());
      };
      this.wake = () => {
        cleanup();
        resolve();
      };
      signal?.addEventListener("abort", handleAbort, { once: true });
    });
  }
}

function waitForSocketOpen(socket: WebSocket, signal?: AbortSignal) {
  if (signal?.aborted) {
    return Promise.reject(abortError());
  }

  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      socket.removeEventListener("open", handleOpen);
      socket.removeEventListener("error", handleError);
      signal?.removeEventListener("abort", handleAbort);
    };
    const handleOpen = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("Hermes TUI WebSocket 连接失败。"));
    };
    const handleAbort = () => {
      cleanup();
      socket.close();
      reject(abortError());
    };

    socket.addEventListener("open", handleOpen, { once: true });
    socket.addEventListener("error", handleError, { once: true });
    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

function abortError() {
  return new DOMException("The operation was aborted.", "AbortError");
}

function normalizeOpenAIBaseUrl(input: string) {
  const baseUrl = input.trim().replace(/\/+$/, "");

  if (!baseUrl) {
    throw new Error("请输入服务地址。");
  }

  if (!/^https?:\/\//.test(baseUrl)) {
    throw new Error("服务地址需要以 http:// 或 https:// 开头。");
  }

  return baseUrl;
}

function openAIModelsUrl(baseUrl: string) {
  const lastSegment = baseUrl.split("/").filter(Boolean).at(-1) ?? "";
  return /^v\d+$/.test(lastSegment) ? `${baseUrl}/models` : `${baseUrl}/v1/models`;
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null;
}

function recordValue(value: unknown): Record<PropertyKey, unknown> | null {
  return isRecord(value) ? value : null;
}

function readString(record: Record<PropertyKey, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : null;
}
