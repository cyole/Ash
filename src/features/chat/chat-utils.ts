import type { ChatAttachment, ChatMessage, ChatRole } from "@/features/chat/types";
import type { HermesMessage } from "@/lib/hermes/types";

const pendingSessionMessagePrefix = "hermes.pendingSessionMessage.";

export function mapHermesMessage(message: HermesMessage): ChatMessage {
  return {
    id: String(message.id ?? createId("message")),
    role: message.role,
    attachments: messageAttachments(message.content),
    content: messageContent(message.content),
    createdAt: messageTimestamp(message),
    reasoning: typeof message.reasoning === "string" ? message.reasoning : undefined,
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

export function savePendingSessionMessage(sessionId: string, message: string) {
  try {
    window.sessionStorage.setItem(pendingSessionMessageKey(sessionId), message);
    return true;
  } catch (error) {
    console.error("Failed to save pending session message", error);
    return false;
  }
}

export function popPendingSessionMessage(sessionId: string) {
  const key = pendingSessionMessageKey(sessionId);

  try {
    const message = window.sessionStorage.getItem(key);
    window.sessionStorage.removeItem(key);
    return message;
  } catch (error) {
    console.error("Failed to read pending session message", error);
    return null;
  }
}

function pendingSessionMessageKey(sessionId: string) {
  return `${pendingSessionMessagePrefix}${sessionId}`;
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

        if (item && typeof item === "object") {
          if ("text" in item && typeof item.text === "string") {
            return item.text;
          }

          if ("type" in item && (item.type === "image" || item.type === "file")) {
            const name = "name" in item && typeof item.name === "string" ? item.name : "附件";
            return `[${item.type === "image" ? "图片" : "文件"}：${name}]`;
          }
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

function messageAttachments(content: unknown): ChatAttachment[] | undefined {
  if (!Array.isArray(content)) {
    return undefined;
  }

  const attachments = content.flatMap((item): ChatAttachment[] => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const record = item as Record<string, unknown>;
    if (record.type !== "image" && record.type !== "file") {
      return [];
    }

    const name = typeof record.name === "string" && record.name.trim() ? record.name.trim() : "附件";
    const path = typeof record.path === "string" && record.path.trim() ? record.path.trim() : undefined;
    const mediaType = typeof record.media_type === "string" && record.media_type.trim()
      ? record.media_type.trim()
      : record.type === "image"
        ? "image/*"
        : "application/octet-stream";

    return [{
      id: createId("attachment"),
      name,
      path,
      size: 0,
      type: mediaType,
    }];
  });

  return attachments.length > 0 ? attachments : undefined;
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
