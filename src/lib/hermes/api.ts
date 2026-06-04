import type { HermesBackend } from "@/lib/hermes/backend";
import type {
  HermesHealth,
  HermesMessage,
  HermesModel,
  HermesSession,
  RenameSessionInput,
} from "@/lib/hermes/types";
import type {
  ActionResponse,
  ActionStatusResponse,
  AnalyticsResponse,
  AudioSpeakResponse,
  AudioTranscriptionResponse,
  AuxiliaryModelsResponse,
  ConfigSchemaResponse,
  CronJob,
  CronJobCreatePayload,
  CronJobUpdates,
  ElevenLabsVoicesResponse,
  EnvVarInfo,
  HermesConfig,
  HermesConfigRecord,
  LogsResponse,
  MessagingPlatformsResponse,
  MessagingPlatformTestResponse,
  MessagingPlatformUpdate,
  ModelAssignmentRequest,
  ModelAssignmentResponse,
  ModelInfoResponse,
  ModelOptionsResponse,
  OAuthPollResponse,
  OAuthProvidersResponse,
  OAuthStartResponse,
  OAuthSubmitResponse,
  PaginatedSessions,
  ProfileCreatePayload,
  ProfileSetupCommand,
  ProfileSoul,
  ProfilesResponse,
  RecommendedDefaultModel,
  SessionArchiveFilter,
  SessionInfo,
  SessionMessage as DashboardSessionMessage,
  SessionMessagesResponse,
  SessionOrder,
  SessionSearchResponse,
  SkillInfo,
  StatusResponse,
  ToolsetConfig,
  ToolsetInfo,
} from "@/types/hermes-dashboard";
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

  async api<T>(input: RuntimeDashboardApiInput): Promise<T> {
    return this.request<T>(
      input.path,
      {
        method: input.method ?? "GET",
        body: input.body === undefined ? undefined : JSON.stringify(input.body),
      },
      input.timeoutMs,
    );
  }

  async health(): Promise<HermesHealth> {
    return this.request<HermesHealth>("/api/status");
  }

  async listModels(): Promise<HermesModel[]> {
    const response = await this.getGlobalModelOptions();
    return normalizeModelOptions(response);
  }

  async listSessions(): Promise<HermesSession[]> {
    const response = await this.listSessionsPage(100, 1);
    return response.sessions.map(normalizeSessionInfo);
  }

  async listSessionsPage(
    limit = 40,
    minMessages = 0,
    archived: SessionArchiveFilter = "exclude",
    order: SessionOrder = "recent",
  ): Promise<PaginatedSessions> {
    const response = await this.api<PaginatedSessions>({
      path: `/api/sessions?limit=${limit}&offset=0&min_messages=${Math.max(0, minMessages)}&archived=${archived}&order=${order}`,
    });

    return {
      ...response,
      sessions: response.sessions.slice(0, limit),
      offset: 0,
    };
  }

  async renameSession(input: RenameSessionInput): Promise<void> {
    await this.renameSessionResult(input.sessionId, input.title);
  }

  async renameSessionResult(sessionId: string, title: string): Promise<{ ok: boolean; title: string }> {
    return this.api<{ ok: boolean; title: string }>({
      path: `/api/sessions/${encodeURIComponent(sessionId)}`,
      method: "PATCH",
      body: { title },
    });
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.deleteSessionResult(sessionId);
  }

  async deleteSessionResult(sessionId: string): Promise<{ ok: boolean }> {
    return this.api<{ ok: boolean }>({
      path: `/api/sessions/${encodeURIComponent(sessionId)}`,
      method: "DELETE",
    });
  }

  async listSessionMessages(sessionId: string): Promise<HermesMessage[]> {
    const response = await this.getSessionMessages(sessionId);
    return response.messages.map(normalizeSessionMessage);
  }

  async setSessionArchived(sessionId: string, archived: boolean): Promise<{ ok: boolean }> {
    return this.api<{ ok: boolean }>({
      path: `/api/sessions/${encodeURIComponent(sessionId)}`,
      method: "PATCH",
      body: { archived },
    });
  }

  async searchSessions(query: string): Promise<SessionSearchResponse> {
    return this.api<SessionSearchResponse>({
      path: `/api/sessions/search?q=${encodeURIComponent(query)}`,
    });
  }

  async getSessionMessages(sessionId: string): Promise<SessionMessagesResponse> {
    return this.api<SessionMessagesResponse>({
      path: `/api/sessions/${encodeURIComponent(sessionId)}/messages`,
    });
  }

  async getGlobalModelInfo(): Promise<ModelInfoResponse> {
    return this.api<ModelInfoResponse>({ path: "/api/model/info" });
  }

  async getStatus(): Promise<StatusResponse> {
    return this.api<StatusResponse>({ path: "/api/status" });
  }

  async getLogs(params: {
    component?: string;
    file?: string;
    level?: string;
    lines?: number;
  }): Promise<LogsResponse> {
    const query = new URLSearchParams();

    if (params.file) {
      query.set("file", params.file);
    }

    if (typeof params.lines === "number") {
      query.set("lines", String(params.lines));
    }

    if (params.level && params.level !== "ALL") {
      query.set("level", params.level);
    }

    if (params.component && params.component !== "all") {
      query.set("component", params.component);
    }

    const suffix = query.toString();
    return this.api<LogsResponse>({
      path: suffix ? `/api/logs?${suffix}` : "/api/logs",
    });
  }

  async getHermesConfig(): Promise<HermesConfig> {
    return this.api<HermesConfig>({ path: "/api/config" });
  }

  async getHermesConfigRecord(): Promise<HermesConfigRecord> {
    return this.api<HermesConfigRecord>({ path: "/api/config" });
  }

  async getHermesConfigDefaults(): Promise<HermesConfigRecord> {
    return this.api<HermesConfigRecord>({ path: "/api/config/defaults" });
  }

  async getHermesConfigSchema(): Promise<ConfigSchemaResponse> {
    return this.api<ConfigSchemaResponse>({ path: "/api/config/schema" });
  }

  async saveHermesConfig(config: HermesConfigRecord): Promise<{ ok: boolean }> {
    return this.api<{ ok: boolean }>({
      path: "/api/config",
      method: "PUT",
      body: { config },
    });
  }

  async getEnvVars(): Promise<Record<string, EnvVarInfo>> {
    return this.api<Record<string, EnvVarInfo>>({ path: "/api/env" });
  }

  async setEnvVar(key: string, value: string): Promise<{ ok: boolean }> {
    return this.api<{ ok: boolean }>({
      path: "/api/env",
      method: "PUT",
      body: { key, value },
    });
  }

  async validateProviderCredential(
    key: string,
    value: string,
  ): Promise<{ message: string; models?: string[]; ok: boolean; reachable: boolean }> {
    return this.api<{ message: string; models?: string[]; ok: boolean; reachable: boolean }>({
      path: "/api/providers/validate",
      method: "POST",
      body: { key, value },
    });
  }

  async deleteEnvVar(key: string): Promise<{ ok: boolean }> {
    return this.api<{ ok: boolean }>({
      path: "/api/env",
      method: "DELETE",
      body: { key },
    });
  }

  async revealEnvVar(key: string): Promise<{ key: string; value: string }> {
    return this.api<{ key: string; value: string }>({
      path: "/api/env/reveal",
      method: "POST",
      body: { key },
    });
  }

  async listOAuthProviders(): Promise<OAuthProvidersResponse> {
    return this.api<OAuthProvidersResponse>({ path: "/api/providers/oauth" });
  }

  async startOAuthLogin(providerId: string): Promise<OAuthStartResponse> {
    return this.api<OAuthStartResponse>({
      path: `/api/providers/oauth/${encodeURIComponent(providerId)}/start`,
      method: "POST",
      body: {},
    });
  }

  async submitOAuthCode(providerId: string, sessionId: string, code: string): Promise<OAuthSubmitResponse> {
    return this.api<OAuthSubmitResponse>({
      path: `/api/providers/oauth/${encodeURIComponent(providerId)}/submit`,
      method: "POST",
      body: { session_id: sessionId, code },
    });
  }

  async pollOAuthSession(providerId: string, sessionId: string): Promise<OAuthPollResponse> {
    return this.api<OAuthPollResponse>({
      path: `/api/providers/oauth/${encodeURIComponent(providerId)}/poll/${encodeURIComponent(sessionId)}`,
    });
  }

  async cancelOAuthSession(sessionId: string): Promise<{ ok: boolean }> {
    return this.api<{ ok: boolean }>({
      path: `/api/providers/oauth/sessions/${encodeURIComponent(sessionId)}`,
      method: "DELETE",
    });
  }

  async getSkills(): Promise<SkillInfo[]> {
    return this.api<SkillInfo[]>({ path: "/api/skills" });
  }

  async toggleSkill(name: string, enabled: boolean): Promise<{ enabled: boolean; name: string; ok: boolean }> {
    return this.api<{ enabled: boolean; name: string; ok: boolean }>({
      path: "/api/skills/toggle",
      method: "PUT",
      body: { name, enabled },
    });
  }

  async getToolsets(): Promise<ToolsetInfo[]> {
    return this.api<ToolsetInfo[]>({ path: "/api/tools/toolsets" });
  }

  async toggleToolset(name: string, enabled: boolean): Promise<{ enabled: boolean; name: string; ok: boolean }> {
    return this.api<{ enabled: boolean; name: string; ok: boolean }>({
      path: `/api/tools/toolsets/${encodeURIComponent(name)}`,
      method: "PUT",
      body: { enabled },
    });
  }

  async getToolsetConfig(name: string): Promise<ToolsetConfig> {
    return this.api<ToolsetConfig>({
      path: `/api/tools/toolsets/${encodeURIComponent(name)}/config`,
    });
  }

  async selectToolsetProvider(name: string, provider: string): Promise<{ name: string; ok: boolean; provider: string }> {
    return this.api<{ name: string; ok: boolean; provider: string }>({
      path: `/api/tools/toolsets/${encodeURIComponent(name)}/provider`,
      method: "PUT",
      body: { provider },
    });
  }

  async getMessagingPlatforms(): Promise<MessagingPlatformsResponse> {
    return this.api<MessagingPlatformsResponse>({ path: "/api/messaging/platforms" });
  }

  async updateMessagingPlatform(platformId: string, body: MessagingPlatformUpdate): Promise<{ ok: boolean; platform: string }> {
    return this.api<{ ok: boolean; platform: string }>({
      path: `/api/messaging/platforms/${encodeURIComponent(platformId)}`,
      method: "PUT",
      body,
    });
  }

  async testMessagingPlatform(platformId: string): Promise<MessagingPlatformTestResponse> {
    return this.api<MessagingPlatformTestResponse>({
      path: `/api/messaging/platforms/${encodeURIComponent(platformId)}/test`,
      method: "POST",
    });
  }

  async getCronJobs(): Promise<CronJob[]> {
    return this.api<CronJob[]>({ path: "/api/cron/jobs" });
  }

  async getCronJob(jobId: string): Promise<CronJob> {
    return this.api<CronJob>({
      path: `/api/cron/jobs/${encodeURIComponent(jobId)}`,
    });
  }

  async createCronJob(body: CronJobCreatePayload): Promise<CronJob> {
    return this.api<CronJob>({
      path: "/api/cron/jobs",
      method: "POST",
      body,
    });
  }

  async updateCronJob(jobId: string, updates: CronJobUpdates): Promise<CronJob> {
    return this.api<CronJob>({
      path: `/api/cron/jobs/${encodeURIComponent(jobId)}`,
      method: "PUT",
      body: { updates },
    });
  }

  async pauseCronJob(jobId: string): Promise<CronJob> {
    return this.api<CronJob>({
      path: `/api/cron/jobs/${encodeURIComponent(jobId)}/pause`,
      method: "POST",
    });
  }

  async resumeCronJob(jobId: string): Promise<CronJob> {
    return this.api<CronJob>({
      path: `/api/cron/jobs/${encodeURIComponent(jobId)}/resume`,
      method: "POST",
    });
  }

  async triggerCronJob(jobId: string): Promise<CronJob> {
    return this.api<CronJob>({
      path: `/api/cron/jobs/${encodeURIComponent(jobId)}/trigger`,
      method: "POST",
    });
  }

  async deleteCronJob(jobId: string): Promise<{ ok: boolean }> {
    return this.api<{ ok: boolean }>({
      path: `/api/cron/jobs/${encodeURIComponent(jobId)}`,
      method: "DELETE",
    });
  }

  async getProfiles(): Promise<ProfilesResponse> {
    return this.api<ProfilesResponse>({ path: "/api/profiles" });
  }

  async createProfile(body: ProfileCreatePayload): Promise<{ name: string; ok: boolean; path: string }> {
    return this.api<{ name: string; ok: boolean; path: string }>({
      path: "/api/profiles",
      method: "POST",
      body,
    });
  }

  async renameProfile(name: string, newName: string): Promise<{ name: string; ok: boolean; path: string }> {
    return this.api<{ name: string; ok: boolean; path: string }>({
      path: `/api/profiles/${encodeURIComponent(name)}`,
      method: "PATCH",
      body: { new_name: newName },
    });
  }

  async deleteProfile(name: string): Promise<{ ok: boolean; path: string }> {
    return this.api<{ ok: boolean; path: string }>({
      path: `/api/profiles/${encodeURIComponent(name)}`,
      method: "DELETE",
    });
  }

  async getProfileSoul(name: string): Promise<ProfileSoul> {
    return this.api<ProfileSoul>({
      path: `/api/profiles/${encodeURIComponent(name)}/soul`,
    });
  }

  async updateProfileSoul(name: string, content: string): Promise<{ ok: boolean }> {
    return this.api<{ ok: boolean }>({
      path: `/api/profiles/${encodeURIComponent(name)}/soul`,
      method: "PUT",
      body: { content },
    });
  }

  async getProfileSetupCommand(name: string): Promise<ProfileSetupCommand> {
    return this.api<ProfileSetupCommand>({
      path: `/api/profiles/${encodeURIComponent(name)}/setup-command`,
    });
  }

  async getUsageAnalytics(days = 30): Promise<AnalyticsResponse> {
    return this.api<AnalyticsResponse>({
      path: `/api/analytics/usage?days=${Math.max(1, Math.floor(days))}`,
    });
  }

  async getGlobalModelOptions(): Promise<ModelOptionsResponse> {
    return this.api<ModelOptionsResponse>({ path: "/api/model/options" });
  }

  async getRecommendedDefaultModel(provider: string): Promise<RecommendedDefaultModel> {
    return this.api<RecommendedDefaultModel>({
      path: `/api/model/recommended-default?provider=${encodeURIComponent(provider)}`,
    });
  }

  async setGlobalModel(provider: string, model: string): Promise<{ model: string; ok: boolean; provider: string }> {
    return this.api<{ model: string; ok: boolean; provider: string }>({
      path: "/api/model/set",
      method: "POST",
      body: {
        scope: "main",
        provider,
        model,
      },
    });
  }

  async getAuxiliaryModels(): Promise<AuxiliaryModelsResponse> {
    return this.api<AuxiliaryModelsResponse>({ path: "/api/model/auxiliary" });
  }

  async setModelAssignment(body: ModelAssignmentRequest): Promise<ModelAssignmentResponse> {
    return this.api<ModelAssignmentResponse>({
      path: "/api/model/set",
      method: "POST",
      body,
    });
  }

  async restartGateway(): Promise<ActionResponse> {
    return this.api<ActionResponse>({
      path: "/api/gateway/restart",
      method: "POST",
    });
  }

  async updateHermes(): Promise<ActionResponse> {
    return this.api<ActionResponse>({
      path: "/api/hermes/update",
      method: "POST",
    });
  }

  async getActionStatus(name: string, lines = 200): Promise<ActionStatusResponse> {
    return this.api<ActionStatusResponse>({
      path: `/api/actions/${encodeURIComponent(name)}/status?lines=${Math.max(1, lines)}`,
    });
  }

  async transcribeAudio(dataUrl: string, mimeType?: string): Promise<AudioTranscriptionResponse> {
    return this.api<AudioTranscriptionResponse>({
      path: "/api/audio/transcribe",
      method: "POST",
      body: {
        data_url: dataUrl,
        mime_type: mimeType,
      },
    });
  }

  async speakText(text: string): Promise<AudioSpeakResponse> {
    return this.api<AudioSpeakResponse>({
      path: "/api/audio/speak",
      method: "POST",
      body: { text },
    });
  }

  async getElevenLabsVoices(): Promise<ElevenLabsVoicesResponse> {
    return this.api<ElevenLabsVoicesResponse>({ path: "/api/audio/elevenlabs/voices" });
  }

  private async request<T>(path: string, init: RequestInit = {}, timeoutMs?: number): Promise<T> {
    if (this.requestImpl) {
      return this.requestImpl<T>({
        body: requestBodyValue(init.body),
        method: requestMethodValue(init.method),
        path,
        timeoutMs,
      });
    }

    const response = await this.rawRequest(path, init, timeoutMs);
    return response.json() as Promise<T>;
  }

  private async rawRequest(path: string, init: RequestInit = {}, timeoutMs?: number) {
    const headers = new Headers(init.headers);
    headers.set("Accept", headers.get("Accept") ?? "application/json");

    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    if (this.sessionToken && !headers.has(SESSION_TOKEN_HEADER)) {
      headers.set(SESSION_TOKEN_HEADER, this.sessionToken);
    }

    const controller = timeoutMs && timeoutMs > 0 ? new AbortController() : null;
    const timeoutId = controller
      ? globalThis.setTimeout(() => controller.abort(), timeoutMs)
      : null;

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        headers,
        signal: init.signal ?? controller?.signal,
      });
    } finally {
      if (timeoutId !== null) {
        globalThis.clearTimeout(timeoutId);
      }
    }

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

function normalizeSessionInfo(session: SessionInfo): HermesSession {
  return {
    ...session,
    created_at: timestampToIso(session.started_at),
    title: session.title,
    updated_at: timestampToIso(session.last_active),
  };
}

function normalizeSessionMessage(message: DashboardSessionMessage): HermesMessage {
  return {
    ...message,
    content: message.content,
    created_at: timestampToIso(message.timestamp),
    reasoning: message.reasoning ?? message.reasoning_content ?? null,
    role: message.role,
    tool_call_id: message.tool_call_id ?? null,
    tool_calls: Array.isArray(message.tool_calls) ? message.tool_calls : null,
    tool_name: message.tool_name ?? null,
  };
}

function timestampToIso(timestamp: null | number | undefined) {
  return typeof timestamp === "number" && Number.isFinite(timestamp)
    ? new Date(timestamp * 1000).toISOString()
    : null;
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
    || normalized === "PUT"
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
