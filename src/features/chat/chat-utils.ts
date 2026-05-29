import type { HermesMessage } from "@/lib/hermes/types";
import type { ChatMessage, ChatRole } from "@/features/chat/types";

export function mapHermesMessage(message: HermesMessage): ChatMessage {
  return {
    id: String(message.id ?? createId("message")),
    role: message.role,
    content: messageContent(message.content),
    createdAt: messageTimestamp(message),
  };
}

export function roleLabel(role: ChatRole) {
  const labels: Record<ChatRole, string> = {
    user: "你",
    assistant: "Hermes",
    system: "系统",
    tool: "工具",
    command: "命令",
  };
  return labels[role];
}

export function createId(prefix: string) {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function messageContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        if (item && typeof item === "object" && "text" in item && typeof item.text === "string") {
          return item.text;
        }

        return JSON.stringify(item);
      })
      .join("\n");
  }

  if (content == null) {
    return "";
  }

  return JSON.stringify(content, null, 2);
}

function messageTimestamp(message: HermesMessage) {
  const createdAt = typeof message.created_at === "string" ? Date.parse(message.created_at) : NaN;
  if (!Number.isNaN(createdAt)) {
    return createdAt;
  }

  const timestamp = message.timestamp;
  if (typeof timestamp === "number") {
    return timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
  }

  return Date.now();
}
