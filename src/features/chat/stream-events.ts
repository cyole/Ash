import type { HermesStreamEvent } from "@/lib/hermes/types";
import type { TraceItem } from "@/features/chat/types";

const SENSITIVE_TRACE_KEY = /(api[-_]?key|authorization|bearer|credential|password|secret|token)/i;
const BEARER_VALUE = /Bearer\s+[A-Za-z0-9._~+/=-]+/g;

export function streamDelta(event: HermesStreamEvent) {
  const data = event.data;
  const eventName = streamEventName(event);

  if (eventName === "reasoning.delta" || eventName === "thinking.delta") {
    return "";
  }

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

  const messageContent = readNestedString(record, ["message", "content"]);
  if (messageContent && /delta|message/.test(event.type)) {
    return messageContent;
  }

  if (typeof record.content === "string" && /delta|message/.test(event.type)) {
    return record.content;
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
  if (typeof record.parsed_content === "string") {
    return record.parsed_content;
  }

  const choiceMessage = readChoiceMessage(record);
  if (choiceMessage) {
    return choiceMessage;
  }

  for (const key of ["output", "content", "text", "output_text"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return readNestedString(record, ["message", "content"]) ?? "";
}

export function streamReasoningDelta(event: HermesStreamEvent) {
  const data = event.data;
  const eventName = streamEventName(event);

  if (eventName !== "reasoning.delta" && eventName !== "thinking.delta") {
    return "";
  }

  if (typeof data === "string") {
    return data;
  }

  if (!data || typeof data !== "object") {
    return "";
  }

  const record = data as Record<string, unknown>;
  if (typeof record.text === "string") {
    return record.text;
  }

  if (typeof record.delta === "string") {
    return record.delta;
  }

  return "";
}

export function streamFinalReasoning(event: HermesStreamEvent) {
  const data = event.data;
  const eventName = streamEventName(event);

  if (!/completed|final|done/.test(eventName) || !data || typeof data !== "object") {
    return "";
  }

  const record = data as Record<string, unknown>;
  return typeof record.parsed_reasoning === "string" ? record.parsed_reasoning : "";
}

export function streamTrace(event: HermesStreamEvent): Omit<TraceItem, "id" | "createdAt"> | null {
  const data = event.data;
  const eventName = streamEventName(event);

  if (
    eventName === "message"
    || eventName === "message.delta"
    || eventName === "reasoning.delta"
    || eventName === "thinking.delta"
    || data === "[DONE]"
  ) {
    return null;
  }

  const detail = traceDetail(data);
  const failed = /failed|error/.test(eventName) || detail.toLowerCase().includes("error");

  return {
    label: traceLabel(eventName),
    detail,
    status: failed ? "error" : /completed|done|resolved/.test(eventName) ? "done" : "running",
  };
}

function streamEventName(event: HermesStreamEvent) {
  const data = event.data;
  const name = event.type === "message" && data && typeof data === "object"
    ? String((data as Record<string, unknown>).event ?? event.type)
    : event.type;
  return name.toLowerCase();
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

  return safeJsonPreview(data);
}

function traceLabel(eventName: string) {
  const labels: Record<string, string> = {
    "message.completed": "消息完成",
    "message.delta": "消息生成中",
    "abort.completed": "停止完成",
    "abort.started": "正在停止",
    "approval.requested": "等待审批",
    "approval.resolved": "审批已处理",
    "clarify.requested": "需要澄清",
    "clarify.resolved": "澄清已处理",
    "compression.completed": "上下文压缩完成",
    "compression.started": "上下文压缩",
    "run.completed": "运行完成",
    "run.failed": "运行失败",
    "run.queued": "已加入队列",
    "run.started": "开始运行",
    "run.stopped": "已停止",
    "subagent.complete": "子任务完成",
    "subagent.progress": "子任务进展",
    "subagent.start": "子任务开始",
    "subagent.tool": "子任务工具",
    "tool.completed": "工具完成",
    "tool.failed": "工具失败",
    "tool.started": "工具调用",
    "usage.updated": "用量更新",
  };

  return labels[eventName] ?? eventName;
}

function readChoiceMessage(record: Record<string, unknown>) {
  const choices = record.choices;
  if (!Array.isArray(choices)) {
    return "";
  }

  const first = choices[0] as { message?: { content?: unknown } } | undefined;
  return typeof first?.message?.content === "string" ? first.message.content : "";
}

function readNestedString(record: Record<string, unknown>, path: string[]) {
  let value: unknown = record;

  for (const key of path) {
    if (!value || typeof value !== "object") {
      return null;
    }

    value = (value as Record<string, unknown>)[key];
  }

  return typeof value === "string" && value.trim() ? value : null;
}

function safeJsonPreview(data: unknown) {
  try {
    return JSON.stringify(data, redactTraceValue).slice(0, 240);
  } catch (error) {
    console.error("Failed to serialize Hermes trace event", error);
    return "事件已接收";
  }
}

function redactTraceValue(key: string, value: unknown) {
  if (SENSITIVE_TRACE_KEY.test(key)) {
    return "[redacted]";
  }

  if (typeof value === "string") {
    return value.replace(BEARER_VALUE, "Bearer [redacted]");
  }

  return value;
}
