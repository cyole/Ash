import type {
  ApprovalInput,
  CreateSessionInput,
  HermesHealth,
  HermesMessage,
  HermesModel,
  HermesRun,
  HermesSession,
  HermesStreamEvent,
  HermesUploadedFile,
  RenameSessionInput,
  SessionChatInput,
  StartRunInput,
} from "@/lib/hermes/types";

export interface HermesBackend {
  health(): Promise<HermesHealth>;
  listModels(): Promise<HermesModel[]>;
  listSessions(): Promise<HermesSession[]>;
  createSession(input?: CreateSessionInput): Promise<HermesSession>;
  renameSession(input: RenameSessionInput): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  listSessionMessages(sessionId: string): Promise<HermesMessage[]>;
  uploadFiles(files: File[]): Promise<HermesUploadedFile[]>;
  streamSessionChat(input: SessionChatInput): AsyncIterable<HermesStreamEvent>;
  startRun(input: StartRunInput): Promise<HermesRun>;
  stopRun(runId: string): Promise<void>;
  approveRun(input: ApprovalInput): Promise<void>;
}
