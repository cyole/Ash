import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { createId, mapHermesMessage, popPendingSessionMessage } from "@/features/chat/chat-utils";
import {
  streamDelta,
  streamFinalReasoning,
  streamFinalText,
  streamReasoningDelta,
  streamTrace,
} from "@/features/chat/stream-events";
import type { ChatAttachment, ChatMessage, TraceItem } from "@/features/chat/types";
import { errorMessage, isAbortError } from "@/lib/errors";
import { hermesQueryKeys, useHermesApi } from "@/lib/hermes/queries";
import { sessionUpdatedAt } from "@/lib/hermes/session-format";
import type { HermesSession } from "@/lib/hermes/types";

export function useChatWorkspace() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [draftSessions, setDraftSessions] = useState<HermesSession[]>([]);
  const [messagesBySession, setMessagesBySession] = useState<Record<string, ChatMessage[]>>({});
  const [tracesBySession, setTracesBySession] = useState<Record<string, TraceItem[]>>({});
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [streamingSessionId, setStreamingSessionId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const internalSessionUrlIdsRef = useRef<Set<string>>(new Set());
  const { apiKey, apiReady, apiUrl, client } = useHermesApi();
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
    queryFn: async () => {
      const sessionId = activeSessionId!;
      const messages = await client.listSessionMessages(sessionId);
      return { messages, sessionId };
    },
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

  const activeSession = sessions.find((session) => session.id === activeSessionId) ?? null;
  const activeMessages = activeSessionId ? messagesBySession[activeSessionId] ?? [] : [];
  const activeTraces = activeSessionId ? tracesBySession[activeSessionId] ?? [] : [];
  const isStreaming = streamingSessionId !== null;

  const setSessionUrl = useCallback((sessionId: string) => {
    internalSessionUrlIdsRef.current.add(sessionId);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("session", sessionId);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const selectSession = useCallback((sessionId: string) => {
    if (sessionId === activeSessionId) {
      return;
    }

    if (streamingSessionId && streamingSessionId !== sessionId) {
      abortRef.current?.abort();
    }

    setActiveSessionId(sessionId);
    setInput("");
  }, [activeSessionId, streamingSessionId]);

  useEffect(() => {
    const requestedSession = searchParams.get("session");
    if (requestedSession) {
      if (internalSessionUrlIdsRef.current.delete(requestedSession)) {
        return;
      }
      selectSession(requestedSession);
      return;
    }

    if (activeSessionId) {
      if (internalSessionUrlIdsRef.current.delete(activeSessionId)) {
        return;
      }

      if (streamingSessionId) {
        abortRef.current?.abort();
      }
      setActiveSessionId(null);
      setInput("");
    }
  }, [activeSessionId, searchParams, selectSession, streamingSessionId]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!activeSessionId || !messagesQuery.data || messagesQuery.data.sessionId !== activeSessionId) {
      return;
    }

    setMessagesBySession((current) => {
      const currentMessages = current[activeSessionId];
      if (currentMessages?.some((message) => message.streaming)) {
        return current;
      }
      if (currentMessages?.length) {
        return current;
      }

      return {
        ...current,
        [activeSessionId]: messagesQuery.data.messages.map(mapHermesMessage),
      };
    });
  }, [activeSessionId, messagesQuery.data]);

  useEffect(() => {
    if (!activeSessionId || !apiReady || isStreaming) {
      return;
    }

    const pendingMessage = popPendingSessionMessage(activeSessionId);
    if (pendingMessage?.trim()) {
      void sendMessage(pendingMessage);
    }
  }, [activeSessionId, apiReady, isStreaming]);

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
    setSessionUrl(session.id);
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
      setSessionUrl(session.id);
      await queryClient.invalidateQueries({ queryKey: hermesQueryKeys.sessions(apiUrl, hasApiKey) });
      toast.success("已创建会话");
    } catch (error) {
      console.error("Failed to create backend session", error);
      const draftId = createDraftSession();
      setMessagesBySession((current) => ({
        ...current,
        [draftId]: [],
      }));
      toast.message("后端暂不可用，已创建本地草稿会话");
    }
  }

  async function promoteDraftSession(draftId: string, title: string) {
    try {
      const session = await client.createSession({
        title,
        source: "desktop",
      });
      moveSessionState(draftId, session);
      setActiveSessionId(session.id);
      setSessionUrl(session.id);
      void queryClient.invalidateQueries({ queryKey: hermesQueryKeys.sessions(apiUrl, hasApiKey) });
      return session.id;
    } catch (error) {
      console.error("Failed to create session for chat message", error);
      toast.message("后端暂不可用，已创建本地草稿会话");
      return draftId;
    }
  }

  async function sendMessage(messageOverride?: string, attachments: ChatAttachment[] = []) {
    const content = (messageOverride ?? input).trim();
    const hasAttachments = attachments.length > 0;
    if ((!content && !hasAttachments) || isStreaming) {
      return;
    }
    if (!apiReady) {
      toast.message("本地 API 认证正在准备中");
      return;
    }

    const title = content.slice(0, 36) || attachmentTitle(attachments) || "新会话";
    let sessionId = activeSessionId ?? createDraftSession(title);
    const now = Date.now();
    const userMessage: ChatMessage = {
      id: createId("user"),
      role: "user",
      content,
      attachments: attachments.map((attachment) => ({
        ...attachment,
        uploading: Boolean(attachment.file && !attachment.path),
      })),
      createdAt: now,
    };
    const assistantId = createId("assistant");
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      createdAt: now,
      streaming: true,
    };
    const controller = new AbortController();

    abortRef.current = controller;
    setInput("");
    setActiveSessionId(sessionId);
    setStreamingSessionId(sessionId);
    pushMessages(sessionId, [userMessage, assistantMessage]);
    pushTrace(sessionId, {
      label: "开始运行",
      detail: selectedModel ? `模型：${selectedModel}` : "使用 Hermes 默认模型",
      status: "running",
    });

    try {
      let receivedContent = false;
      if (sessionId.startsWith("draft-")) {
        const promotedSessionId = await promoteDraftSession(sessionId, title);
        if (promotedSessionId !== sessionId) {
          sessionId = promotedSessionId;
          setStreamingSessionId(sessionId);
        }
      }

      const uploadedFiles = await uploadAttachments(sessionId, userMessage.id, attachments);
      const uploadedFilePaths = uploadedFiles.map((file) => file.path);

      for await (const event of client.streamSessionChat({
        sessionId,
        message: content,
        model: selectedModel || undefined,
        files: uploadedFilePaths.length > 0 ? uploadedFilePaths : undefined,
        signal: controller.signal,
      })) {
        const delta = streamDelta(event);
        const finalText = streamFinalText(event);
        const reasoningDelta = streamReasoningDelta(event);
        const finalReasoning = streamFinalReasoning(event);

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

        if (reasoningDelta) {
          updateMessage(sessionId, assistantId, (message) => ({
            ...message,
            reasoning: `${message.reasoning ?? ""}${reasoningDelta}`,
          }));
        }

        if (finalReasoning) {
          updateMessage(sessionId, assistantId, (message) => ({
            ...message,
            reasoning: finalReasoning,
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
          files: uploadedFilePaths.length > 0 ? uploadedFilePaths : undefined,
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
        label: "运行完成",
        detail: "本次流式响应已结束",
        status: "done",
      });
      await queryClient.invalidateQueries({
        queryKey: hermesQueryKeys.sessionMessages(apiUrl, hasApiKey, sessionId),
      });
      await queryClient.invalidateQueries({ queryKey: hermesQueryKeys.sessions(apiUrl, hasApiKey) });
    } catch (error) {
      const aborted = isAbortError(error);
      if (!aborted && hasAttachments) {
        updateMessage(sessionId, userMessage.id, (message) => ({
          ...message,
          attachments: message.attachments?.map((attachment) => ({
            ...attachment,
            uploading: false,
            uploadError: attachment.path ? attachment.uploadError : errorMessage(error),
          })),
        }));
      }
      updateMessage(sessionId, assistantId, (message) => ({
        ...message,
        content: aborted ? message.content || "已停止本次响应。" : errorMessage(error),
        streaming: false,
        error: !aborted,
      }));
      settleRunningTraces(sessionId, aborted ? "done" : "error");
      pushTrace(sessionId, {
        label: aborted ? "已停止" : "运行失败",
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
      void sendMessage(lastUserMessage.content, lastUserMessage.attachments);
    }
  }

  function retryMessage(messageId: string) {
    const messageIndex = activeMessages.findIndex((message) => message.id === messageId);
    if (messageIndex === -1) {
      return;
    }

    const previousUserMessage = activeMessages
      .slice(0, messageIndex)
      .reverse()
      .find((message) => message.role === "user");

    if (previousUserMessage) {
      void sendMessage(previousUserMessage.content, previousUserMessage.attachments);
    }
  }

  async function copyMessage(message: ChatMessage) {
    const content = message.content.trim();
    if (!content) {
      return;
    }

    try {
      await navigator.clipboard.writeText(content);
      toast.success("已复制消息");
    } catch (error) {
      console.error("Failed to copy chat message", error);
      toast.error("复制失败，可以手动选择文本复制。");
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

  async function uploadAttachments(sessionId: string, messageId: string, attachments: ChatAttachment[]) {
    const pending = attachments.filter((attachment) => attachment.file && !attachment.path);
    const existing = attachments
      .filter((attachment): attachment is ChatAttachment & { path: string } => Boolean(attachment.path))
      .map((attachment) => ({ name: attachment.name, path: attachment.path }));

    if (pending.length === 0) {
      return existing;
    }

    pushTrace(sessionId, {
      label: "上传附件",
      detail: pending.map((attachment) => attachment.name).join("、"),
      status: "running",
    });

    const uploaded = await client.uploadFiles(pending.map((attachment) => attachment.file!));
    const uploadedByName = new Map(uploaded.map((file) => [file.name, file.path]));

    updateMessage(sessionId, messageId, (message) => ({
      ...message,
      attachments: message.attachments?.map((attachment) => {
        const path = uploadedByName.get(attachment.name) ?? attachment.path;
        return {
          ...attachment,
          path,
          uploading: false,
        };
      }),
    }));

    pushTrace(sessionId, {
      label: "附件已上传",
      detail: `${uploaded.length} 个文件已发送给 Hermes`,
      status: "done",
    });

    return [...existing, ...uploaded];
  }

  function moveSessionState(draftId: string, session: HermesSession) {
    setDraftSessions((current) => current.filter((item) => item.id !== draftId));
    queryClient.setQueryData<HermesSession[]>(hermesQueryKeys.sessions(apiUrl, hasApiKey), (current) => [
      session,
      ...(current ?? []).filter((item) => item.id !== session.id),
    ]);
    setMessagesBySession((current) => {
      const draftMessages = current[draftId] ?? [];
      const existingMessages = current[session.id] ?? [];
      const { [draftId]: _draftMessages, ...rest } = current;

      return {
        ...rest,
        [session.id]: [...existingMessages, ...draftMessages],
      };
    });
    setTracesBySession((current) => {
      const draftTraces = current[draftId] ?? [];
      const existingTraces = current[session.id] ?? [];
      const { [draftId]: _draftTraces, ...rest } = current;

      return {
        ...rest,
        [session.id]: [...draftTraces, ...existingTraces].slice(0, 30),
      };
    });
  }

  return {
    activeMessages,
    activeSession,
    activeSessionId,
    activeTraces,
    apiReady,
    createBackendSession,
    input,
    isStreaming,
    messagesQuery,
    modelsQuery,
    copyMessage,
    retryLastMessage,
    retryMessage,
    selectedModel,
    selectSession,
    sendMessage,
    sessionsQuery,
    setInput,
    setSelectedModel,
    stopStreaming,
  };
}

function attachmentTitle(attachments: ChatAttachment[]) {
  return attachments.map((attachment) => attachment.name).join("、").slice(0, 36);
}
