export type ChatRole = "system" | "user" | "assistant" | "tool" | "command";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  streaming?: boolean;
  error?: boolean;
}

export interface TraceItem {
  id: string;
  label: string;
  detail: string;
  status: "running" | "done" | "error";
  createdAt: number;
}
