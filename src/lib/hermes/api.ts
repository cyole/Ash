import type { HermesBackend } from "@/lib/hermes/backend";
import type {
  ApprovalInput,
  CreateSessionInput,
  HermesHealth,
  HermesMessage,
  HermesModelsResponse,
  HermesRun,
  HermesSession,
  HermesStreamEvent,
  RenameSessionInput,
  SessionChatInput,
  StartRunInput,
} from "@/lib/hermes/types";

export const DEFAULT_HERMES_API_URL = "http://127.0.0.1:8642";

const ENDPOINT_FALLBACK_STATUSES = new Set([404, 405, 501]);
const MAX_ERROR_BODY_LENGTH = 1_000;

interface HermesApiClientOptions {
  baseUrl?: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
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
  private readonly apiKey?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HermesApiClientOptions = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_HERMES_API_URL);
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async health(): Promise<HermesHealth> {
    return this.request<HermesHealth>("/health");
  }

  async listModels() {
    const response = await this.request<HermesModelsResponse>("/v1/models");
    return response.data ?? [];
  }

  async listSessions(): Promise<HermesSession[]> {
    const response = await requestWithEndpointFallback(
      () => this.request<ListResponse<HermesSession>>("/api/sessions"),
      () => this.request<ListResponse<HermesSession>>("/api/hermes/sessions?limit=100"),
    );
    return normalizeSessionsResponse(response);
  }

  async createSession(input: CreateSessionInput = {}): Promise<HermesSession> {
    const response = await requestWithEndpointFallback(
      () => this.request<HermesSession | { session: HermesSession }>("/api/sessions", {
        method: "POST",
        body: JSON.stringify(input),
      }),
      () => this.request<HermesSession | { session: HermesSession }>("/api/hermes/sessions", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    );
    return isSessionWrapper(response) ? response.session : response;
  }

  async renameSession(input: RenameSessionInput): Promise<void> {
    await requestWithEndpointFallback(
      () => this.request(`/api/sessions/${encodeURIComponent(input.sessionId)}`, {
        method: "PATCH",
        body: JSON.stringify({ title: input.title }),
      }),
      () => this.request(`/api/hermes/sessions/${encodeURIComponent(input.sessionId)}/rename`, {
        method: "POST",
        body: JSON.stringify({ title: input.title }),
      }),
    );
  }

  async deleteSession(sessionId: string): Promise<void> {
    await requestWithEndpointFallback(
      () => this.request(`/api/sessions/${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
      }),
      () => this.request(`/api/hermes/sessions/${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
      }),
    );
  }

  async listSessionMessages(sessionId: string): Promise<HermesMessage[]> {
    const response = await requestWithEndpointFallback(
      () => this.request<ListResponse<HermesMessage>>(
        `/api/sessions/${encodeURIComponent(sessionId)}/messages`,
      ),
      () => this.request<ListResponse<HermesMessage>>(
        `/api/hermes/sessions/conversations/${encodeURIComponent(sessionId)}/messages/paginated?offset=0&limit=300`,
      ),
    );
    return normalizeMessagesResponse(response);
  }

  async *streamSessionChat(input: SessionChatInput): AsyncIterable<HermesStreamEvent> {
    const sessionId = input.sessionId || createDesktopSessionId();
    const response = await this.rawRequest("/v1/chat/completions", {
      method: "POST",
      headers: {
        "X-Hermes-Session-Id": sessionId,
      },
      body: JSON.stringify({
        model: input.model,
        stream: true,
        session_id: sessionId,
        messages: [
          {
            role: "user",
            content: input.message,
          },
        ],
        files: input.files,
      }),
      signal: input.signal,
    });

    yield* parseSseStream(response);
  }

  async probeChatCompletion(input: Omit<SessionChatInput, "sessionId">): Promise<string> {
    const response = await this.request<{
      choices?: Array<{ message?: { content?: unknown } }>;
      error?: { message?: unknown };
    }>("/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model: input.model,
        stream: false,
        messages: [
          {
            role: "user",
            content: input.message,
          },
        ],
        files: input.files,
      }),
      signal: input.signal,
    });

    const content = response.choices?.[0]?.message?.content;
    if (typeof content === "string" && content.trim()) {
      return content;
    }

    const error = response.error?.message;
    if (typeof error === "string" && error.trim()) {
      throw new Error(error);
    }

    return "";
  }

  async startRun(input: StartRunInput): Promise<HermesRun> {
    return this.request<HermesRun>("/v1/runs", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async *streamRunEvents(runId: string): AsyncIterable<HermesStreamEvent> {
    const response = await this.rawRequest(`/v1/runs/${encodeURIComponent(runId)}/events`);
    yield* parseSseStream(response);
  }

  async stopRun(runId: string): Promise<void> {
    await this.request(`/v1/runs/${encodeURIComponent(runId)}/stop`, {
      method: "POST",
    });
  }

  async approveRun(input: ApprovalInput): Promise<void> {
    await this.request(`/v1/runs/${encodeURIComponent(input.runId)}/approval`, {
      method: "POST",
      body: JSON.stringify({
        decision: input.decision,
        note: input.note,
      }),
    });
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.rawRequest(path, init);
    return response.json() as Promise<T>;
  }

  private async rawRequest(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("Accept", headers.get("Accept") ?? "application/json");

    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    if (this.apiKey && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${this.apiKey}`);
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

type ListResponse<T> = T[] | { data?: T[]; sessions?: T[]; messages?: T[] };

async function requestWithEndpointFallback<T>(primary: () => Promise<T>, fallback: () => Promise<T>) {
  try {
    return await primary();
  } catch (error) {
    if (!isEndpointFallbackError(error)) {
      throw error;
    }

    return fallback();
  }
}

function isEndpointFallbackError(error: unknown) {
  return error instanceof HermesApiError && ENDPOINT_FALLBACK_STATUSES.has(error.status);
}

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
  return Array.isArray(response) ? response : response.data ?? response.sessions ?? [];
}

function normalizeMessagesResponse(response: ListResponse<HermesMessage>) {
  return Array.isArray(response) ? response : response.data ?? response.messages ?? [];
}

function isSessionWrapper(response: HermesSession | { session: HermesSession }): response is { session: HermesSession } {
  return typeof response === "object" && response !== null && "session" in response;
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

async function* parseSseStream(response: Response): AsyncIterable<HermesStreamEvent> {
  if (!response.body) {
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    let nextBlock = readNextSseBlock(buffer);
    while (nextBlock) {
      buffer = nextBlock.rest;
      const event = parseSseEvent(nextBlock.block);
      if (event) {
        yield event;
      }
      nextBlock = readNextSseBlock(buffer);
    }
  }

  if (buffer.trim()) {
    const event = parseSseEvent(buffer);
    if (event) {
      yield event;
    }
  }
}

function parseSseEvent(chunk: string): HermesStreamEvent | null {
  let type = "message";
  const dataLines: string[] = [];

  for (const line of chunk.split(/\r?\n/)) {
    if (line.startsWith("event:")) {
      type = line.slice("event:".length).trim();
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  const rawData = dataLines.join("\n");

  return {
    type,
    data: parseEventData(rawData),
  };
}

function readNextSseBlock(buffer: string) {
  const delimiter = findSseDelimiter(buffer);
  if (!delimiter) {
    return null;
  }

  return {
    block: buffer.slice(0, delimiter.index),
    rest: buffer.slice(delimiter.index + delimiter.length),
  };
}

function findSseDelimiter(buffer: string) {
  const lfIndex = buffer.indexOf("\n\n");
  const crlfIndex = buffer.indexOf("\r\n\r\n");

  if (lfIndex === -1 && crlfIndex === -1) {
    return null;
  }

  if (lfIndex === -1) {
    return { index: crlfIndex, length: 4 };
  }

  if (crlfIndex === -1 || lfIndex < crlfIndex) {
    return { index: lfIndex, length: 2 };
  }

  return { index: crlfIndex, length: 4 };
}

function parseEventData(rawData: string): unknown {
  if (rawData === "[DONE]") {
    return rawData;
  }

  try {
    return JSON.parse(rawData);
  } catch {
    return rawData;
  }
}

function createDesktopSessionId() {
  const randomId = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(16).slice(2);
  return `desk-${Date.now()}-${randomId}`;
}
