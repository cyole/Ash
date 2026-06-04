import type {
  HermesHealth,
  HermesMessage,
  HermesModel,
  HermesSession,
  RenameSessionInput,
} from "@/lib/hermes/types";

export interface HermesBackend {
  deleteSession(sessionId: string): Promise<void>;
  health(): Promise<HermesHealth>;
  listModels(): Promise<HermesModel[]>;
  listSessionMessages(sessionId: string): Promise<HermesMessage[]>;
  listSessions(): Promise<HermesSession[]>;
  renameSession(input: RenameSessionInput): Promise<void>;
}
