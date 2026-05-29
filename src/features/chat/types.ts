export type ChatRole = "system" | "user" | "assistant" | "tool" | "command";

export interface ChatAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  url?: string;
  file?: File;
  path?: string;
  uploadError?: string;
  uploading?: boolean;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  attachments?: ChatAttachment[];
  createdAt: number;
  reasoning?: string;
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
