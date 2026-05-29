import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { hermesQueryKeys, useHermesApi } from "@/lib/hermes/queries";
import {
  sessionPreview,
  sessionSource,
  sessionTitle,
  sessionUpdatedAt,
} from "@/lib/hermes/session-format";
import type { HermesSession } from "@/lib/hermes/types";
import { streamHermesSessionChat } from "@/lib/tauri";
import { createId, errorMessage, isAbortError, mapHermesMessage } from "@/features/chat/chat-utils";
import { streamDelta, streamFinalText, streamTrace } from "@/features/chat/stream-events";
import type { ChatMessage, TraceItem } from "@/features/chat/types";

export function useChatWorkspace() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [draftSessions, setDraftSessions] = useState<HermesSession[]>([]);
  const [sessionFilter, setSessionFilter] = useState("");
  const [messagesBySession, setMessagesBySession] = useState<Record<string, ChatMessage[]>>({});
  const [tracesBySession, setTracesBySession] = useState<Record<string, TraceItem[]>>({});
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [streamingSessionId, setStreamingSessionId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { apiKey, apiReady, apiUrl, client, tauriRuntime } = useHermesApi();
  const hasApiKey = Boolean(apiKey);

  const sessionsQuery = useQuery({
    queryKey: hermesQueryKeys.sessions(apiUrl, hasApiKey),
    queryFn: () => client.listSessions(),
    enabled: apiReady,
    retry: false,
  });

  const modelsQuery = useQuery({
    queryKey: hermesQueryKeys.models(apiUrl, hasApiKey),
    queryFn: () => client.listModels(),
    enabled: apiReady,
    retry: false,
  });

  const activeSessionIsDraft = activeSessionId?.startsWith("draft-") ?? false;
  const messagesQuery = useQuery({
    queryKey: hermesQueryKeys.sessionMessages(apiUrl, hasApiKey, activeSessionId),
    queryFn: () => client.listSessionMessages(activeSessionId!),
    enabled: Boolean(apiReady && activeSessionId && !activeSessionIsDraft),
    retry: false,
  });

  const sessions = useMemo(() => {
    const byId = new Map<string, HermesSession>();
    for (const session of [...draftSessions, ...(sessionsQuery.data ?? [])]) {
      byId.set(session.id, session);
    }

    return [...byId.values()].sort((a, b) => {
      return (sessionUpdatedAt(b) ?? 0) - (sessionUpdatedAt(a) ?? 0);
    });
  }, [draftSessions, sessionsQuery.data]);

  const filteredSessions = useMemo(() => {
    const query = sessionFilter.trim().toLowerCase();
    if (!query) {
      return sessions;
    }

    return sessions.filter((session) => {
      return [sessionTitle(session), sessionPreview(session), sessionSource(session), session.id]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [sessionFilter, sessions]);

  const activeSession = sessions.find((session) => session.id === activeSessionId) ?? null;
  const activeMessages = activeSessionId ? messagesBySession[activeSessionId] ?? [] : [];
  const activeTraces = activeSessionId ? tracesBySession[activeSessionId] ?? [] : [];
  const isStreaming = streamingSessionId !== null;

  useEffect(() => {
    const requestedSession = searchParams.get("session");
    if (requestedSession && requestedSession !== activeSessionId) {
      setActiveSessionId(requestedSession);
    }
  }, [activeSessionId, searchParams]);

  useEffect(() => {
    if (!activeSessionId && sessions.length > 0) {
      setActiveSessionId(sessions[0].id);
    }
  }, [activeSessionId, sessions]);

  useEffect(() => {
    if (!activeSessionId) {
      return;
    }

    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("session", activeSessionId);
      return next;
    }, { replace: true });
  }, [activeSessionId, setSearchParams]);

  useEffect(() => {
    if (!activeSessionId || !messagesQuery.data) {
      return;
    }

    setMessagesBySession((current) => {
      if (current[activeSessionId]) {
        return current;
      }

      return {
        ...current,
        [activeSessionId]: messagesQuery.data.map(mapHermesMessage),
      };
    });
  }, [activeSessionId, messagesQuery.data]);

  function createDraftSession(title = "新会话") {
    const now = new Date().toISOString();
    const session: HermesSession = {
      id: `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      source: "desktop",
      created_at: now,
      updated_at: now,
    };

    setDraftSessions((current) => [session, ...current]);
    setActiveSessionId(session.id);
    return session.id;
  }

  async function createBackendSession() {
    if (!apiReady) {
      toast.message("本地 API 认证正在准备中");
      return;
    }

    try {
      const session = await client.createSession({
        title: "新会话",
        source: "desktop",
      });
      setActiveSessionId(session.id);
      await queryClient.invalidateQueries({ queryKey: hermesQueryKeys.sessions(apiUrl, hasApiKey) });
      toast.success("已创建会话");
    } catch {
      const draftId = createDraftSession();
      setMessagesBySession((current) => ({
        ...current,
        [draftId]: [],
      }));
      toast.message("后端暂不可用，已创建本地草稿会话");
    }
  }

  async function sendMessage(messageOverride?: string) {
    const content = (messageOverride ?? input).trim();
    if (!content || isStreaming) {
      return;
    }
    if (!apiReady) {
      toast.message("本地 API 认证正在准备中");
      return;
    }

    const sessionId = activeSessionId ?? createDraftSession(content.slice(0, 36));
    const userMessage: ChatMessage = {
      id: createId("user"),
      role: "user",
      content,
      createdAt: Date.now(),
    };
    const assistantId = createId("assistant");
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      streaming: true,
    };
    const controller = new AbortController();

    abortRef.current = controller;
    setInput("");
    setActiveSessionId(sessionId);
    setStreamingSessionId(sessionId);
    pushMessages(sessionId, [userMessage, assistantMessage]);
    pushTrace(sessionId, {
      label: "run.started",
      detail: selectedModel ? `模型：${selectedModel}` : "使用 Hermes 默认模型",
      status: "running",
    });

    try {
      let receivedContent = false;
      const stream = tauriRuntime ? streamHermesSessionChat : client.streamSessionChat.bind(client);

      for await (const event of stream({
        sessionId,
        message: content,
        model: selectedModel || undefined,
        signal: controller.signal,
      })) {
        const delta = streamDelta(event);
        const finalText = streamFinalText(event);

        if (delta) {
          receivedContent = true;
          updateMessage(sessionId, assistantId, (message) => ({
            ...message,
            content: `${message.content}${delta}`,
          }));
        }

        if (finalText) {
          receivedContent = true;
          updateMessage(sessionId, assistantId, (message) => ({
            ...message,
            content: finalText.length >= message.content.length ? finalText : message.content,
          }));
        }

        const trace = streamTrace(event);
        if (trace) {
          pushTrace(sessionId, trace);
        }
      }

      let fallbackContent = "";
      if (!receivedContent) {
        fallbackContent = await client.probeChatCompletion({
          message: content,
          model: selectedModel || undefined,
          signal: controller.signal,
        });
      }

      updateMessage(sessionId, assistantId, (message) => ({
        ...message,
        content: message.content || fallbackContent || "Hermes 已完成本次运行，但没有返回可显示的文本。",
        streaming: false,
      }));
      settleRunningTraces(sessionId, "done");
      pushTrace(sessionId, {
        label: "run.completed",
        detail: "本次流式响应已结束",
        status: "done",
      });
      await queryClient.invalidateQueries({ queryKey: hermesQueryKeys.sessions(apiUrl, hasApiKey) });
    } catch (error) {
      const aborted = isAbortError(error);
      updateMessage(sessionId, assistantId, (message) => ({
        ...message,
        content: aborted ? message.content || "已停止本次响应。" : errorMessage(error),
        streaming: false,
        error: !aborted,
      }));
      settleRunningTraces(sessionId, aborted ? "done" : "error");
      pushTrace(sessionId, {
        label: aborted ? "run.stopped" : "run.failed",
        detail: aborted ? "用户停止了本次响应" : errorMessage(error),
        status: aborted ? "done" : "error",
      });
    } finally {
      abortRef.current = null;
      setStreamingSessionId(null);
    }
  }

  function stopStreaming() {
    abortRef.current?.abort();
  }

  function retryLastMessage() {
    const lastUserMessage = [...activeMessages].reverse().find((message) => message.role === "user");
    if (lastUserMessage) {
      void sendMessage(lastUserMessage.content);
    }
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  function pushMessages(sessionId: string, messages: ChatMessage[]) {
    setMessagesBySession((current) => ({
      ...current,
      [sessionId]: [...(current[sessionId] ?? []), ...messages],
    }));
  }

  function updateMessage(
    sessionId: string,
    messageId: string,
    updater: (message: ChatMessage) => ChatMessage,
  ) {
    setMessagesBySession((current) => ({
      ...current,
      [sessionId]: (current[sessionId] ?? []).map((message) =>
        message.id === messageId ? updater(message) : message,
      ),
    }));
  }

  function pushTrace(sessionId: string, item: Omit<TraceItem, "id" | "createdAt">) {
    setTracesBySession((current) => ({
      ...current,
      [sessionId]: [
        {
          id: createId("trace"),
          createdAt: Date.now(),
          ...item,
        },
        ...(current[sessionId] ?? []),
      ].slice(0, 30),
    }));
  }

  function settleRunningTraces(sessionId: string, status: TraceItem["status"]) {
    setTracesBySession((current) => ({
      ...current,
      [sessionId]: (current[sessionId] ?? []).map((trace) =>
        trace.status === "running" ? { ...trace, status } : trace,
      ),
    }));
  }

  return {
    activeMessages,
    activeSession,
    activeSessionId,
    activeTraces,
    apiReady,
    createBackendSession,
    filteredSessions,
    handleInputKeyDown,
    input,
    isStreaming,
    messagesQuery,
    modelsQuery,
    retryLastMessage,
    selectedModel,
    sendMessage,
    sessionFilter,
    sessionsQuery,
    setActiveSessionId,
    setInput,
    setSelectedModel,
    setSessionFilter,
    stopStreaming,
  };
}
