import type { HermesStreamEvent } from "@/lib/hermes/types";
import type { TraceItem } from "@/features/chat/types";

export function streamDelta(event: HermesStreamEvent) {
  const data = event.data;
  if (data === "[DONE]") {
    return "";
  }

  if (typeof data === "string") {
    return event.type === "message" ? data : "";
  }

  if (!data || typeof data !== "object") {
    return "";
  }

  const record = data as Record<string, unknown>;
  const choices = record.choices;
  if (Array.isArray(choices)) {
    const first = choices[0] as { delta?: { content?: unknown }; text?: unknown } | undefined;
    if (typeof first?.delta?.content === "string") {
      return first.delta.content;
    }
    if (typeof first?.text === "string") {
      return first.text;
    }
  }

  if (typeof record.delta === "string") {
    return record.delta;
  }

  if (record.delta && typeof record.delta === "object" && "content" in record.delta) {
    const content = (record.delta as { content?: unknown }).content;
    return typeof content === "string" ? content : "";
  }

  if (typeof record.text === "string" && /delta|message/.test(event.type)) {
    return record.text;
  }

  return "";
}

export function streamFinalText(event: HermesStreamEvent) {
  const data = event.data;
  const eventName = streamEventName(event);

  if (!/completed|final|done/.test(eventName)) {
    return "";
  }

  if (!data || typeof data !== "object") {
    return "";
  }

  const record = data as Record<string, unknown>;
  return typeof record.output === "string" ? record.output : "";
}

export function streamTrace(event: HermesStreamEvent): Omit<TraceItem, "id" | "createdAt"> | null {
  const data = event.data;
  const eventName = streamEventName(event);

  if (eventName === "message" || eventName === "message.delta" || data === "[DONE]") {
    return null;
  }

  const detail = traceDetail(data);
  const failed = /failed|error/.test(eventName) || detail.toLowerCase().includes("error");

  return {
    label: eventName,
    detail,
    status: failed ? "error" : /completed|done|resolved/.test(eventName) ? "done" : "running",
  };
}

function streamEventName(event: HermesStreamEvent) {
  const data = event.data;
  return event.type === "message" && data && typeof data === "object"
    ? String((data as Record<string, unknown>).event ?? event.type)
    : event.type;
}

function traceDetail(data: unknown) {
  if (typeof data === "string") {
    return data;
  }

  if (!data || typeof data !== "object") {
    return "事件已接收";
  }

  const record = data as Record<string, unknown>;
  for (const key of ["tool", "name", "preview", "text", "error", "output"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return JSON.stringify(data).slice(0, 240);
}
