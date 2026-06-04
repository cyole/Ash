export interface HermesHealth {
  ok?: boolean;
  status?: string;
  version?: string;
  [key: string]: unknown;
}

export interface HermesModel {
  id: string;
  object?: string;
  created?: number;
  owned_by?: string;
  [key: string]: unknown;
}

export interface HermesModelsResponse {
  object?: string;
  data: HermesModel[];
}

export interface HermesSession {
  id: string;
  title?: string | null;
  source?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
}

export interface CreateSessionInput {
  title?: string;
  source?: string;
}

export interface RenameSessionInput {
  sessionId: string;
  title: string;
}

export interface HermesMessage {
  id?: string;
  role: "system" | "user" | "assistant" | "tool" | "command";
  content: unknown;
  created_at?: string | null;
  reasoning?: string | null;
  timestamp?: number;
  tool_call_id?: string | null;
  tool_calls?: unknown[] | null;
  tool_name?: string | null;
  [key: string]: unknown;
}

export interface HermesUploadedFile {
  name: string;
  path: string;
}

export interface SessionChatInput {
  sessionId?: string;
  message: string;
  model?: string;
  files?: string[];
  onRuntimeSession?: (runtimeSessionId: string, storedSessionId: string) => void;
  signal?: AbortSignal;
  title?: string;
  transientSessionId?: string;
}

export interface StartRunInput {
  prompt: string;
  sessionId?: string;
  model?: string;
  metadata?: Record<string, unknown>;
}

export interface HermesRun {
  run_id: string;
  status?: string;
  [key: string]: unknown;
}

export interface ApprovalInput {
  runId: string;
  decision: "approve" | "deny";
  note?: string;
}

export interface HermesStreamEvent {
  type: string;
  data: unknown;
  sessionId?: string | null;
}
