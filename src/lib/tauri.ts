import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { HermesStreamEvent, SessionChatInput } from "@/lib/hermes/types";
import type {
  HermesExtensionsCatalog,
  HermesStatus,
  ModelConfigStatus,
  OpenAICompatibleModelConfig,
  OpenAIModelsResult,
  RuntimeApiAuth,
  RuntimeCommandResult,
} from "@/types/hermes";

export function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in window;
}

export async function getRuntimeStatus(): Promise<HermesStatus> {
  if (!isTauriRuntime()) {
    return {
      installed: false,
      running: false,
      gatewayRunning: false,
      apiKeyConfigured: false,
      path: null,
      version: null,
      mode: "browser-preview",
      apiUrl: "http://127.0.0.1:8642",
      installSource: "browser-preview",
      bundledRuntimeArchive: "打开 Tauri 应用后可查看内置运行时路径。",
      bundledRuntimeFound: false,
      managedRoot: "打开 Tauri 应用后可查看托管运行时路径。",
      hermesHome: "打开 Tauri 应用后可查看 Hermes 主目录路径。",
      configPath: "打开 Tauri 应用后可查看本地引擎配置路径。",
      legacyConfigPath: null,
      legacyConfigFound: false,
      gatewayStatus: null,
    };
  }

  return invoke<HermesStatus>("runtime_status");
}

export async function prepareRuntime(): Promise<RuntimeCommandResult> {
  return invoke<RuntimeCommandResult>("runtime_prepare");
}

export async function startGateway(): Promise<RuntimeCommandResult> {
  return invoke<RuntimeCommandResult>("runtime_gateway_start");
}

export async function stopGateway(): Promise<RuntimeCommandResult> {
  return invoke<RuntimeCommandResult>("runtime_gateway_stop");
}

export async function checkGateway(): Promise<RuntimeCommandResult> {
  return invoke<RuntimeCommandResult>("runtime_gateway_status");
}

export async function runDoctor(): Promise<RuntimeCommandResult> {
  return invoke<RuntimeCommandResult>("runtime_doctor");
}

export async function setupPortal(): Promise<RuntimeCommandResult> {
  return invoke<RuntimeCommandResult>("runtime_setup_portal");
}

export async function restartGateway(): Promise<RuntimeCommandResult> {
  return invoke<RuntimeCommandResult>("runtime_gateway_restart");
}

export async function getRuntimeApiAuth(): Promise<RuntimeApiAuth> {
  if (!isTauriRuntime()) {
    return {
      apiUrl: "http://127.0.0.1:8642",
      apiKey: null,
    };
  }

  return invoke<RuntimeApiAuth>("runtime_api_auth");
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

interface TauriHermesChatStreamEvent {
  streamId: string;
  type: string;
  data: unknown;
}

export async function* streamHermesSessionChat(input: SessionChatInput): AsyncIterable<HermesStreamEvent> {
  if (!isTauriRuntime()) {
    throw new Error("桌面聊天流仅在 Tauri 应用中可用。");
  }

  if (input.signal?.aborted) {
    throw abortError();
  }

  const streamId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const queue: HermesStreamEvent[] = [];
  let done = false;
  let failure: unknown = null;
  let wake: (() => void) | null = null;
  const notify = () => {
    wake?.();
    wake = null;
  };
  const handleAbort = () => {
    failure = abortError();
    done = true;
    notify();
  };

  const unlisten = await listen<TauriHermesChatStreamEvent>("hermes-chat-stream", (event) => {
    const payload = event.payload;
    if (payload.streamId !== streamId) {
      return;
    }

    if (payload.type === "transport.done") {
      done = true;
      notify();
      return;
    }

    if (payload.type === "transport.error") {
      failure = payload.data;
      done = true;
      notify();
      return;
    }

    queue.push({
      type: payload.type,
      data: payload.data,
    });

    if (payload.data === "[DONE]") {
      done = true;
    }
    notify();
  });
  input.signal?.addEventListener("abort", handleAbort, { once: true });

  const invokePromise = invoke<void>("hermes_chat_stream", {
    input: {
      streamId,
      sessionId: input.sessionId,
      message: input.message,
      model: input.model,
      files: input.files,
    },
  }).catch((error) => {
    failure = error;
    done = true;
    notify();
  });

  try {
    while (!done || queue.length > 0) {
      if (queue.length > 0) {
        yield queue.shift()!;
        continue;
      }

      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }

    if (failure) {
      if (failure instanceof Error) {
        throw failure;
      }
      throw new Error(errorMessage(failure));
    }
    await invokePromise;
  } finally {
    input.signal?.removeEventListener("abort", handleAbort);
    unlisten();
  }
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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
