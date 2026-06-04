import type { HermesBackend } from "@/lib/hermes/backend";
import type {
  HermesHealth,
  HermesMessage,
  HermesModel,
  HermesSession,
  RenameSessionInput,
} from "@/lib/hermes/types";
import type { RuntimeDashboardApiInput } from "@/types/hermes";

export const DEFAULT_HERMES_API_URL = "http://127.0.0.1:9120";

const MAX_ERROR_BODY_LENGTH = 1_000;
const SESSION_TOKEN_HEADER = "X-Hermes-Session-Token";

interface HermesApiClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  requestImpl?: <T>(input: RuntimeDashboardApiInput) => Promise<T>;
  sessionToken?: string;
}

interface ModelOptionsProvider {
  models?: unknown;
  name?: unknown;
  provider?: unknown;
}

interface ModelOptionsPayload {
  models?: unknown;
  providers?: unknown;
}

export class HermesApiError extends Error {
  readonly body: string;
  readonly status: number;
  readonly statusText: string;

  constructor(status: number, statusText: string, body: string) {
    const detail = trimErrorBody(body);
    super(`Hermes API request failed: ${status} ${statusText}${detail ? `: ${detail}` : ""}`);
    this.name = "HermesApiError";
    this.body = body;
    this.status = status;
    this.statusText = statusText;
  }
}

export class HermesApiClient implements HermesBackend {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly requestImpl?: <T>(input: RuntimeDashboardApiInput) => Promise<T>;
  private readonly sessionToken?: string;

  constructor(options: HermesApiClientOptions = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_HERMES_API_URL);
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.requestImpl = options.requestImpl;
    this.sessionToken = options.sessionToken;
  }

  async health(): Promise<HermesHealth> {
    return this.request<HermesHealth>("/api/status");
  }

  async listModels(): Promise<HermesModel[]> {
    const response = await this.request<ModelOptionsPayload>("/api/model/options");
    return normalizeModelOptions(response);
  }

  async listSessions(): Promise<HermesSession[]> {
    const response = await this.request<ListResponse<HermesSession>>(
      "/api/sessions?limit=100&offset=0&min_messages=1&order=recent",
    );
    return normalizeSessionsResponse(response);
  }

  async renameSession(input: RenameSessionInput): Promise<void> {
    await this.request(`/api/sessions/${encodeURIComponent(input.sessionId)}`, {
      method: "PATCH",
      body: JSON.stringify({ title: input.title }),
    });
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.request(`/api/sessions/${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
    });
  }

  async listSessionMessages(sessionId: string): Promise<HermesMessage[]> {
    const response = await this.request<ListResponse<HermesMessage>>(
      `/api/sessions/${encodeURIComponent(sessionId)}/messages`,
    );
    return normalizeMessagesResponse(response);
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (this.requestImpl) {
      return this.requestImpl<T>({
        body: requestBodyValue(init.body),
        method: requestMethodValue(init.method),
        path,
      });
    }

    const response = await this.rawRequest(path, init);
    return response.json() as Promise<T>;
  }

  private async rawRequest(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("Accept", headers.get("Accept") ?? "application/json");

    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    if (this.sessionToken && !headers.has(SESSION_TOKEN_HEADER)) {
      headers.set(SESSION_TOKEN_HEADER, this.sessionToken);
    }

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    });

    if (!response.ok) {
      throw new HermesApiError(response.status, response.statusText, await readResponseText(response));
    }

    return response;
  }
}

type ListResponse<T> = T[] | { data?: T[]; messages?: T[]; sessions?: T[] };

async function readResponseText(response: Response) {
  try {
    return await response.text();
  } catch (error) {
    console.error("Failed to read Hermes API error response", error);
    return "";
  }
}

function trimErrorBody(body: string) {
  const detail = body.trim();
  return detail.length > MAX_ERROR_BODY_LENGTH ? `${detail.slice(0, MAX_ERROR_BODY_LENGTH)}...` : detail;
}

function normalizeSessionsResponse(response: ListResponse<HermesSession>) {
  return Array.isArray(response) ? response : response.sessions ?? response.data ?? [];
}

function normalizeMessagesResponse(response: ListResponse<HermesMessage>) {
  return Array.isArray(response) ? response : response.messages ?? response.data ?? [];
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

function requestBodyValue(body: BodyInit | null | undefined) {
  if (body === undefined || body === null) {
    return undefined;
  }

  if (typeof body !== "string") {
    throw new Error("Hermes dashboard API 代理只支持 JSON 字符串请求体。");
  }

  try {
    return JSON.parse(body) as unknown;
  } catch (error) {
    throw new Error(`Hermes dashboard API 请求体不是有效 JSON：${error instanceof Error ? error.message : String(error)}`);
  }
}

function requestMethodValue(method: string | undefined) {
  const normalized = (method ?? "GET").toUpperCase();
  if (
    normalized === "DELETE"
    || normalized === "GET"
    || normalized === "PATCH"
    || normalized === "POST"
  ) {
    return normalized;
  }

  throw new Error(`不支持的 Hermes dashboard API 方法：${normalized}。`);
}

function normalizeModelOptions(payload: ModelOptionsPayload): HermesModel[] {
  const models = new Map<string, HermesModel>();
  collectModels(payload.models, models);

  const providers = payload.providers;
  if (Array.isArray(providers)) {
    for (const provider of providers) {
      if (isModelOptionsProvider(provider)) {
        collectModels(provider.models, models, providerName(provider));
      }
    }
  } else if (isRecord(providers)) {
    for (const [key, provider] of Object.entries(providers)) {
      if (isModelOptionsProvider(provider)) {
        collectModels(provider.models, models, providerName(provider) ?? key);
      }
    }
  }

  return [...models.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function collectModels(input: unknown, output: Map<string, HermesModel>, provider?: string | null) {
  if (!Array.isArray(input)) {
    return;
  }

  for (const item of input) {
    const id = modelId(item);
    if (!id) {
      continue;
    }

    output.set(id, {
      id,
      owned_by: provider ?? undefined,
    });
  }
}

function modelId(input: unknown) {
  if (typeof input === "string") {
    return input.trim();
  }

  if (!isRecord(input)) {
    return "";
  }

  return (
    readString(input, "id")
    ?? readString(input, "model")
    ?? readString(input, "name")
    ?? ""
  ).trim();
}

function isModelOptionsProvider(input: unknown): input is ModelOptionsProvider {
  return isRecord(input);
}

function providerName(provider: ModelOptionsProvider) {
  return typeof provider.name === "string"
    ? provider.name
    : typeof provider.provider === "string"
      ? provider.provider
      : null;
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(record: Record<PropertyKey, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : null;
}
