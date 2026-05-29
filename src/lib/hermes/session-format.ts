import type { HermesSession } from "@/lib/hermes/types";

export function sessionTitle(session: HermesSession) {
  const title = typeof session.title === "string" ? session.title.trim() : "";
  if (title) {
    return title;
  }

  const preview = sessionPreview(session);
  if (preview) {
    return preview.slice(0, 48);
  }

  return `会话 ${session.id.slice(0, 8)}`;
}

export function sessionSource(session: HermesSession) {
  const source = typeof session.source === "string" && session.source.trim() ? session.source.trim() : null;
  return source ?? readString(session, "platform") ?? readString(session, "source_label") ?? "desktop";
}

export function sessionPreview(session: HermesSession) {
  return readString(session, "preview") ?? readString(session, "last_message") ?? readString(session, "summary") ?? "";
}

export function sessionMessageCount(session: HermesSession) {
  const value = readNumber(session, "message_count") ?? readNumber(session, "messageCount");
  return Number.isFinite(value) ? value : null;
}

export function sessionModelLabel(session: HermesSession) {
  const model = readString(session, "model");
  const provider = readString(session, "provider");

  if (provider && model) {
    return `${provider}/${model}`;
  }

  return model ?? provider ?? "未指定模型";
}

export function sessionUpdatedAt(session: HermesSession) {
  const candidates = [
    session.updated_at,
    session.created_at,
    readString(session, "last_active_at"),
    readString(session, "lastActiveAt"),
    readNumber(session, "last_active"),
    readNumber(session, "started_at"),
    readNumber(session, "createdAt"),
  ];

  for (const candidate of candidates) {
    const timestamp = toTimestamp(candidate);
    if (timestamp) {
      return timestamp;
    }
  }

  return null;
}

export function formatSessionTime(value: number | null) {
  if (!value) {
    return "未知时间";
  }

  const diffMs = Date.now() - value;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) {
    return "刚刚";
  }

  if (diffMs < hour) {
    return `${Math.floor(diffMs / minute)} 分钟前`;
  }

  if (diffMs < day) {
    return `${Math.floor(diffMs / hour)} 小时前`;
  }

  if (diffMs < 7 * day) {
    return `${Math.floor(diffMs / day)} 天前`;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function readString(session: HermesSession, key: string) {
  const value = session[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(session: HermesSession, key: string) {
  const value = session[key];
  return typeof value === "number" ? value : null;
}

function toTimestamp(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? null : timestamp;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1000 : value;
  }

  return null;
}
