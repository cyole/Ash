import type { FormEvent, KeyboardEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  CornerDownLeft,
  Loader2,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCcw,
  SendHorizontal,
  Sparkles,
  Square,
  Trash2,
  UserRound,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownMessage } from "@/features/chat/components/MarkdownMessage";
import { useHermesSettings } from "@/features/settings/settings-store";
import { errorMessage } from "@/lib/errors";
import type { HermesMessage, HermesSession, HermesStreamEvent } from "@/lib/hermes";
import { hermesQueryKeys, useHermesApi } from "@/lib/hermes/queries";
import { cn } from "@/lib/utils";
import {
  getModelConfigStatus,
  startGateway,
  streamHermesSessionChat,
} from "@/lib/tauri";

interface ChatMessage {
  id: string;
  role: "assistant" | "command" | "system" | "tool" | "user";
  content: string;
  createdAt: number;
  error?: string;
  reasoning?: string;
  status?: "complete" | "error" | "streaming";
  toolArgs?: string;
  toolCallId?: string;
  toolDuration?: number;
  toolName?: string;
  toolPreview?: string;
  toolResult?: string;
  toolStatus?: "done" | "error" | "running";
}

type ChatDisplayItem =
  | { kind: "assistant"; id: string; messages: ChatMessage[] }
  | { kind: "user"; message: ChatMessage };

interface AssistantMessageParts {
  displayContent: string;
  error?: string;
  reasoningText: string;
  streaming: boolean;
}

interface QueuedPrompt {
  id: string;
  content: string;
  createdAt: number;
}

interface LocalCommand {
  args?: string;
  description: string;
  insertText: string;
  name: string;
}

interface ParsedThinking {
  body: string;
  hasThinking: boolean;
  pending: string | null;
  segments: string[];
}

interface ToolUpdate {
  duration?: number;
  id?: string;
  name: string;
  preview?: string;
  result?: string;
  status: "done" | "error" | "running";
  toolArgs?: string;
}

type ActiveStreamMap = Record<string, string>;
type MessagesBySession = Record<string, ChatMessage[]>;
type QueuedPromptsBySession = Record<string, QueuedPrompt[]>;

const suggestedPrompts = [
  "整理一下今天最重要的三个工作项",
  "帮我把这个想法拆成可执行计划",
  "检查当前 Hermes 配置还缺什么",
] as const;

const localCommands = [
  { name: "clear", insertText: "/clear", description: "清空当前聊天视图" },
  { name: "new", insertText: "/new", description: "开始一个新对话" },
  { name: "stop", insertText: "/stop", description: "停止当前生成" },
  { name: "model", args: "模型 ID", insertText: "/model ", description: "临时切换模型" },
] as const satisfies readonly LocalCommand[];

const draftStorageKey = "hermes.chat.drafts.v1";

const messageTransitionClasses = {
  fadeIn: "animate-in fade-in duration-200",
  none: "",
  smooth: "animate-in fade-in slide-in-from-bottom-1 duration-200",
} as const;

export function ChatPage() {
  const queryClient = useQueryClient();
  const { settings } = useHermesSettings();
  const { apiKey, apiReady, apiUrl, client, status, tauriRuntime } = useHermesApi();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectionInitialized, setSelectionInitialized] = useState(false);
  const [messagesBySession, setMessagesBySession] = useState<MessagesBySession>({});
  const [draft, setDraft] = useState("");
  const [modelOverride, setModelOverride] = useState("");
  const [activeStreams, setActiveStreams] = useState<ActiveStreamMap>({});
  const [queuedPromptsBySession, setQueuedPromptsBySession] = useState<QueuedPromptsBySession>({});
  const [sendError, setSendError] = useState<string | null>(null);
  const [nearBottom, setNearBottom] = useState(true);
  const [sessionsOpen, setSessionsOpen] = useState(true);
  const [activeCommandIndex, setActiveCommandIndex] = useState(0);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const streamTokensRef = useRef<Map<string, number>>(new Map());
  const queuedPromptsRef = useRef<QueuedPromptsBySession>({});
  const selectedSessionIdRef = useRef<string | null>(null);
  const pendingInitialScrollSessionRef = useRef<string | null>(null);
  const loadedMessagesSessionRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const sessions = useQuery({
    enabled: apiReady,
    queryKey: hermesQueryKeys.sessions(apiUrl, Boolean(apiKey)),
    queryFn: () => client.listSessions(),
  });

  const sessionMessages = useQuery({
    enabled: apiReady && Boolean(selectedSessionId),
    queryKey: hermesQueryKeys.sessionMessages(apiUrl, Boolean(apiKey), selectedSessionId),
    queryFn: () => selectedSessionId ? client.listSessionMessages(selectedSessionId) : Promise.resolve([]),
  });

  const modelStatus = useQuery({
    queryKey: hermesQueryKeys.modelConfigStatus,
    queryFn: getModelConfigStatus,
  });

  const startRuntime = useMutation({
    mutationFn: startGateway,
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: hermesQueryKeys.runtimeStatus });
      if (result.success) {
        toast.success("本地服务已启动");
      } else {
        toast.error(result.stderr || result.stdout || "本地服务启动需要处理");
      }
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });

  const selectedSession = useMemo(
    () => sessions.data?.find((session) => session.id === selectedSessionId) ?? null,
    [selectedSessionId, sessions.data],
  );
  const runtimeReady = !tauriRuntime || Boolean(status.data?.running && status.data.apiKeyConfigured);
  const messages = selectedSessionId ? messagesBySession[selectedSessionId] ?? [] : [];
  const activeStreamId = selectedSessionId ? activeStreams[selectedSessionId] ?? null : null;
  const queuedPrompts = selectedSessionId ? queuedPromptsBySession[selectedSessionId] ?? [] : [];
  const isStreaming = activeStreamId !== null;
  const displayItems = useMemo(() => buildChatDisplayItems(messages), [messages]);
  const canSubmit = Boolean(draft.trim() && apiReady && runtimeReady);
  const visibleTitle = selectedSession ? sessionTitle(selectedSession) : "新对话";
  const draftKey = draftStorageSessionKey(selectedSessionId);
  const slashCommandQuery = useMemo(() => {
    const trimmed = draft.trimStart();
    if (!trimmed.startsWith("/")) {
      return null;
    }

    const rawQuery = trimmed.slice(1);
    if (/\s/.test(rawQuery)) {
      return null;
    }

    return rawQuery.toLowerCase();
  }, [draft]);
  const filteredCommands = useMemo(
    () => slashCommandQuery === null ? [] : localCommands.filter((command) => command.name.includes(slashCommandQuery)),
    [slashCommandQuery],
  );
  const showCommandMenu = filteredCommands.length > 0 && draft.trimStart().startsWith("/");
  const scrollToBottom = useCallback((behavior?: ScrollBehavior) => {
    bottomRef.current?.scrollIntoView({
      behavior: behavior ?? (settings.animationMode === "disabled" ? "auto" : "smooth"),
      block: "end",
    });
  }, [settings.animationMode]);

  useEffect(() => {
    queuedPromptsRef.current = queuedPromptsBySession;
  }, [queuedPromptsBySession]);

  useEffect(() => {
    selectedSessionIdRef.current = selectedSessionId;
  }, [selectedSessionId]);

  useEffect(() => {
    setDraft(readDraft(draftKey));
    setActiveCommandIndex(0);
  }, [draftKey]);

  useEffect(() => {
    writeDraft(draftKey, draft);
  }, [draft, draftKey]);

  useEffect(() => {
    if (activeCommandIndex < filteredCommands.length) {
      return;
    }
    setActiveCommandIndex(0);
  }, [activeCommandIndex, filteredCommands.length]);

  useEffect(() => {
    if (selectionInitialized || sessions.isLoading) {
      return;
    }

    setSelectedSessionId(sessions.data?.[0]?.id ?? null);
    setSelectionInitialized(true);
  }, [selectionInitialized, sessions.data, sessions.isLoading]);

  useEffect(() => {
    if (!selectedSessionId) {
      pendingInitialScrollSessionRef.current = null;
      setNearBottom(true);
      return;
    }

    if (sessionMessages.data) {
      if (loadedMessagesSessionRef.current !== selectedSessionId) {
        pendingInitialScrollSessionRef.current = selectedSessionId;
        loadedMessagesSessionRef.current = selectedSessionId;
      }
      const sessionId = selectedSessionId;
      const serverMessages = sessionMessages.data.map(normalizeHermesMessage);
      const sessionIsStreaming = Boolean(activeStreams[sessionId]);
      setMessagesBySession((current) => {
        const runtimeMessages = current[sessionId] ?? [];
        const nextMessages = mergeServerAndRuntimeMessages(serverMessages, runtimeMessages, sessionIsStreaming);
        if (nextMessages === runtimeMessages) {
          return current;
        }
        return {
          ...current,
          [sessionId]: nextMessages,
        };
      });
    }
  }, [activeStreams, selectedSessionId, sessionMessages.data]);

  useEffect(() => {
    if (!settings.autoScrollOnStreaming || !isStreaming) {
      return;
    }

    if (!nearBottom) {
      return;
    }

    scrollToBottom();
  }, [isStreaming, messages, nearBottom, scrollToBottom, settings.autoScrollOnStreaming]);

  useEffect(() => {
    if (isStreaming || pendingInitialScrollSessionRef.current !== selectedSessionId) {
      return;
    }

    pendingInitialScrollSessionRef.current = null;
    setNearBottom(true);
    const frameId = window.requestAnimationFrame(() => scrollToBottom("auto"));
    return () => window.cancelAnimationFrame(frameId);
  }, [isStreaming, messages, scrollToBottom, selectedSessionId]);

  const cancelActiveStream = useCallback((sessionId = selectedSessionIdRef.current) => {
    if (!sessionId) {
      return;
    }

    const currentToken = streamTokensRef.current.get(sessionId) ?? 0;
    streamTokensRef.current.set(sessionId, currentToken + 1);
    abortControllersRef.current.get(sessionId)?.abort();
    abortControllersRef.current.delete(sessionId);
    setActiveStreams((current) => omitRecordKey(current, sessionId));
    updateSessionMessages(sessionId, (current) =>
      current.map((message) =>
        message.status === "streaming"
          ? {
              ...message,
              content: message.content.trim() || "已停止生成。",
              status: "complete",
            }
          : message,
      ),
    );
  }, []);

  function handleSelectSession(sessionId: string) {
    setSelectedSessionId(sessionId);
    setSendError(null);
  }

  function handleNewChat() {
    setSelectedSessionId(null);
    setDraft("");
    setSendError(null);
    setNearBottom(true);
  }

  function handleSubmit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    const prompt = draft.trim();
    if (!prompt) {
      return;
    }

    if (runLocalCommand(prompt)) {
      setDraft("");
      return;
    }

    if (!apiReady) {
      setSendError("Hermes API 认证仍在读取中。");
      return;
    }

    if (!runtimeReady) {
      setSendError("本地服务还没有就绪，请先启动服务并完成模型配置。");
      return;
    }

    setDraft("");
    setSendError(null);

    if (isStreaming) {
      if (selectedSessionId) {
        queuePrompt(selectedSessionId, prompt);
      }
      return;
    }

    void sendPrompt(prompt, selectedSessionId ?? undefined);
  }

  async function sendPrompt(prompt: string, preferredSessionId?: string) {
    setSendError(null);

    const now = Date.now();
    const userMessage: ChatMessage = {
      id: createMessageId("user"),
      role: "user",
      content: prompt,
      createdAt: now,
      status: "complete",
    };
    const assistantMessage: ChatMessage = {
      id: createMessageId("assistant"),
      role: "assistant",
      content: "",
      createdAt: now + 1,
      status: "streaming",
    };

    let sessionIdForRun = preferredSessionId ?? selectedSessionIdRef.current;
    let token = 0;
    let shouldRunQueuedPrompt = false;

    try {
      const sessionId = sessionIdForRun ?? await createChatSession(prompt);
      sessionIdForRun = sessionId;
      token = (streamTokensRef.current.get(sessionId) ?? 0) + 1;
      streamTokensRef.current.set(sessionId, token);

      updateSessionMessages(sessionId, (current) => [...current, userMessage, assistantMessage]);
      setNearBottom(true);
      if (selectedSessionIdRef.current === sessionId) {
        window.requestAnimationFrame(() => scrollToBottom());
      }
      setActiveStreams((current) => ({
        ...current,
        [sessionId]: assistantMessage.id,
      }));

      const controller = new AbortController();
      abortControllersRef.current.set(sessionId, controller);

      const stream = tauriRuntime
        ? streamHermesSessionChat({
            message: prompt,
            model: normalizedModelOverride(modelOverride),
            sessionId,
            signal: controller.signal,
          })
        : client.streamSessionChat({
            message: prompt,
            model: normalizedModelOverride(modelOverride),
            sessionId,
            signal: controller.signal,
          });

      let receivedContent = false;
      let receivedToolActivity = false;
      let receivedReasoning = false;
      for await (const streamEvent of stream) {
        if (streamTokensRef.current.get(sessionId) !== token) {
          return;
        }

        if (streamEvent.data === "[DONE]") {
          break;
        }

        const streamError = streamEventError(streamEvent);
        if (streamError) {
          throw new Error(streamError);
        }

        const reasoningDelta = streamEventReasoningText(streamEvent);
        if (reasoningDelta) {
          receivedReasoning = true;
          appendAssistantReasoning(sessionId, assistantMessage.id, reasoningDelta);
          continue;
        }

        const toolUpdate = streamEventToolUpdate(streamEvent);
        if (toolUpdate) {
          receivedToolActivity = true;
          upsertToolMessage(sessionId, toolUpdate);
          continue;
        }

        const delta = streamEventText(streamEvent);
        if (delta) {
          receivedContent = true;
          appendAssistantDelta(sessionId, assistantMessage.id, delta);
          continue;
        }

        if (isDoneEvent(streamEvent)) {
          break;
        }
      }

      if (streamTokensRef.current.get(sessionId) !== token) {
        return;
      }

      updateSessionMessages(sessionId, (current) =>
        current.map((message) =>
          message.id === assistantMessage.id
            ? {
                ...message,
                content: receivedContent || receivedReasoning || receivedToolActivity
                  ? message.content
                  : "未收到可显示内容。",
                status: "complete",
              }
            : message,
        ),
      );
      await refreshChatQueries(sessionId);
      shouldRunQueuedPrompt = true;
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      const detail = errorMessage(error);
      setSendError(detail);
      if (sessionIdForRun) {
        updateSessionMessages(sessionIdForRun, (current) =>
          current.map((message) =>
            message.id === assistantMessage.id
              ? {
                  ...message,
                  content: message.content.trim() || "生成失败。",
                  error: detail,
                  status: "error",
                }
              : message,
          ),
        );
      }
    } finally {
      const completedSessionId = sessionIdForRun;
      if (completedSessionId && streamTokensRef.current.get(completedSessionId) === token) {
        setActiveStreams((current) => omitRecordKey(current, completedSessionId));
        abortControllersRef.current.delete(completedSessionId);
      }

      if (completedSessionId && streamTokensRef.current.get(completedSessionId) === token && shouldRunQueuedPrompt) {
        runNextQueuedPrompt(completedSessionId);
      }
    }
  }

  function queuePrompt(sessionId: string, content: string) {
    const queuedPrompt = {
      id: createMessageId("queued"),
      content,
      createdAt: Date.now(),
    } satisfies QueuedPrompt;
    setQueuedPromptsBySession((current) => ({
      ...current,
      [sessionId]: [...(current[sessionId] ?? []), queuedPrompt],
    }));
    toast.success("已加入发送队列");
  }

  function runNextQueuedPrompt(sessionId: string) {
    const nextPrompt = queuedPromptsRef.current[sessionId]?.[0];
    if (!nextPrompt) {
      return;
    }

    setQueuedPromptsBySession((current) => updateQueuedPrompts(current, sessionId, (items) =>
      items.filter((item) => item.id !== nextPrompt.id),
    ));
    window.setTimeout(() => {
      void sendPrompt(nextPrompt.content, sessionId);
    }, 80);
  }

  function removeQueuedPrompt(id: string) {
    if (!selectedSessionId) {
      return;
    }
    setQueuedPromptsBySession((current) => updateQueuedPrompts(current, selectedSessionId, (items) =>
      items.filter((item) => item.id !== id),
    ));
  }

  async function copyMessage(message: ChatMessage) {
    await copyChatText(message.content);
  }

  async function copyChatText(content: string) {
    if (!content.trim()) {
      return;
    }

    const copied = await copyText(content);
    if (copied) {
      toast.success("已复制消息");
    } else {
      toast.error("没有复制成功，请手动选择文本。");
    }
  }

  function runLocalCommand(prompt: string) {
    const normalized = prompt.trim();
    if (!normalized.startsWith("/")) {
      return false;
    }

    const [rawCommand = "", ...rest] = normalized.slice(1).split(/\s+/);
    const command = rawCommand.toLowerCase();
    const args = rest.join(" ").trim();

    if (command === "clear") {
      if (selectedSessionId) {
        updateSessionMessages(selectedSessionId, () => []);
      }
      setSendError(null);
      toast.success("当前视图已清空");
      return true;
    }

    if (command === "new") {
      handleNewChat();
      toast.success("已开始新对话");
      return true;
    }

    if (command === "stop") {
      if (isStreaming) {
        cancelActiveStream();
        toast.success("已停止生成");
      }
      return true;
    }

    if (command === "model") {
      setModelOverride(args);
      toast.success(args ? `本次对话将使用 ${args}` : "已恢复默认模型");
      return true;
    }

    return false;
  }

  function applyCommand(command: LocalCommand) {
    setDraft(command.insertText);
    setActiveCommandIndex(0);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (showCommandMenu) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveCommandIndex((current) => (current + 1) % filteredCommands.length);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveCommandIndex((current) => (current - 1 + filteredCommands.length) % filteredCommands.length);
        return;
      }

      if (event.key === "Tab" || event.key === "Enter") {
        event.preventDefault();
        const command = filteredCommands[activeCommandIndex];
        if (command) {
          applyCommand(command);
        }
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setActiveCommandIndex(0);
        setDraft("");
        return;
      }
    }

    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    handleSubmit();
  }

  function handleScroll() {
    const element = scrollRef.current;
    if (!element) {
      return;
    }

    const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    setNearBottom(distanceToBottom < 96);
  }

  function updateSessionMessages(sessionId: string, updater: (messages: ChatMessage[]) => ChatMessage[]) {
    setMessagesBySession((current) => {
      const currentMessages = current[sessionId] ?? [];
      const nextMessages = updater(currentMessages);
      if (nextMessages === currentMessages) {
        return current;
      }

      return {
        ...current,
        [sessionId]: nextMessages,
      };
    });
  }

  function appendAssistantDelta(sessionId: string, messageId: string, delta: string) {
    updateSessionMessages(sessionId, (current) =>
      current.map((message) =>
        message.id === messageId
          ? {
              ...message,
              content: `${message.content}${delta}`,
            }
          : message,
      ),
    );
  }

  function appendAssistantReasoning(sessionId: string, messageId: string, delta: string) {
    updateSessionMessages(sessionId, (current) =>
      current.map((message) =>
        message.id === messageId
          ? {
              ...message,
              reasoning: `${message.reasoning ?? ""}${delta}`,
            }
          : message,
      ),
    );
  }

  function upsertToolMessage(sessionId: string, update: ToolUpdate) {
    updateSessionMessages(sessionId, (current) => {
      const existingIndex = update.id
        ? current.findIndex((message) => message.role === "tool" && message.toolCallId === update.id)
        : -1;
      const patch = {
        content: "",
        role: "tool",
        status: "complete",
        toolArgs: update.toolArgs,
        toolCallId: update.id,
        toolDuration: update.duration,
        toolName: update.name,
        toolPreview: update.preview,
        toolResult: update.result,
        toolStatus: update.status,
      } satisfies Partial<ChatMessage>;

      if (existingIndex >= 0) {
        return current.map((message, index) =>
          index === existingIndex
            ? {
                ...message,
                ...patch,
                toolArgs: patch.toolArgs ?? message.toolArgs,
                toolDuration: patch.toolDuration ?? message.toolDuration,
                toolPreview: patch.toolPreview ?? message.toolPreview,
                toolResult: patch.toolResult ?? message.toolResult,
              }
            : message,
        );
      }

      return [
        ...current,
        {
          id: update.id ? `tool-${update.id}` : createMessageId("tool"),
          createdAt: Date.now(),
          ...patch,
        } satisfies ChatMessage,
      ];
    });
  }

  async function createChatSession(prompt: string) {
    const session = await client.createSession({
      source: "desktop-chat",
      title: titleFromPrompt(prompt),
    });
    setSelectedSessionId(session.id);
    queryClient.setQueryData<HermesSession[]>(
      hermesQueryKeys.sessions(apiUrl, Boolean(apiKey)),
      (current) => mergeSession(current, session),
    );
    return session.id;
  }

  async function refreshChatQueries(sessionId: string) {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: hermesQueryKeys.sessions(apiUrl, Boolean(apiKey)) }),
      queryClient.invalidateQueries({
        queryKey: hermesQueryKeys.sessionMessages(apiUrl, Boolean(apiKey), sessionId),
      }),
    ]);
  }

  return (
    <div className="flex h-full min-h-0 bg-card">
      {sessionsOpen ? (
        <aside className="flex w-[288px] shrink-0 flex-col border-r border-border/70 bg-background/35">
          <div className="border-b border-border/70 p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                  <MessageSquare className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h1 className="truncate text-[15px] font-semibold">聊天</h1>
                  <p className="truncate text-xs text-muted-foreground">{sessions.data?.length ?? 0} 个会话</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="刷新会话"
                  onClick={() => sessions.refetch()}
                  disabled={sessions.isFetching}
                >
                  {sessions.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="收起会话列表"
                  onClick={() => setSessionsOpen(false)}
                >
                  <PanelLeftClose className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <Button type="button" className="w-full justify-center" onClick={handleNewChat}>
              <Plus className="h-4 w-4" />
              新对话
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-2">
            {sessions.isLoading ? (
              <SessionListSkeleton />
            ) : sessions.isError ? (
              <InlineNotice tone="danger" title="会话加载失败" description={errorMessage(sessions.error)} />
            ) : sessions.data?.length ? (
              <div className="space-y-1">
                {sessions.data.map((session) => (
                  <SessionButton
                    key={session.id}
                    active={session.id === selectedSessionId}
                    session={session}
                    streaming={Boolean(activeStreams[session.id])}
                    onClick={() => handleSelectSession(session.id)}
                  />
                ))}
              </div>
            ) : (
              <InlineNotice title="还没有会话" description="新的对话会在发送后保存到这里。" />
            )}
          </div>
        </aside>
      ) : null}

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-[var(--hermes-chat-header-height)] shrink-0 items-center justify-between gap-3 border-b border-border/70 px-5">
          <div className="flex min-w-0 items-center gap-3">
            {!sessionsOpen ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="展开会话列表"
                onClick={() => setSessionsOpen(true)}
              >
                <PanelLeftOpen className="h-4 w-4" />
              </Button>
            ) : null}
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="truncate text-[15px] font-semibold">{visibleTitle}</h2>
                <RuntimeBadge
                  configured={status.data?.apiKeyConfigured}
                  loading={status.isLoading}
                  running={runtimeReady}
                  tauriRuntime={tauriRuntime}
                />
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {modelOverride.trim()
                  ? `临时模型 ${modelOverride.trim()}`
                  : modelStatus.data?.model
                    ? `默认模型 ${modelStatus.data.model}`
                    : "使用 Hermes 当前默认模型"}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Input
              aria-label="模型覆盖"
              value={modelOverride}
              onChange={(event) => setModelOverride(event.target.value)}
              placeholder={modelStatus.data?.model ?? "默认模型"}
              className="h-8 w-[180px]"
            />
            {tauriRuntime && !runtimeReady ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => startRuntime.mutate()}
                disabled={startRuntime.isPending}
              >
                {startRuntime.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                启动服务
              </Button>
            ) : null}
          </div>
        </header>

        <div ref={scrollRef} onScroll={handleScroll} className="relative min-h-0 flex-1 overflow-auto">
          <div className="mx-auto flex min-h-full w-full max-w-[860px] flex-col px-5 py-6">
            {messages.length === 0 && !sessionMessages.isLoading ? (
              <ChatEmptyState onUsePrompt={setDraft} />
            ) : (
              <div className="space-y-5">
                {sessionMessages.isLoading && messages.length === 0 ? <MessageSkeleton /> : null}
                {displayItems.map((item) =>
                  item.kind === "user" ? (
                    <ChatMessageRow
                      key={item.message.id}
                      message={item.message}
                      transitionMode={settings.chatTransitionMode}
                      onCopy={() => copyMessage(item.message)}
                    />
                  ) : (
                    <AssistantTurnRow
                      key={item.id}
                      messages={item.messages}
                      transitionMode={settings.chatTransitionMode}
                      onCopy={(content) => copyChatText(content)}
                    />
                  ),
                )}
              </div>
            )}
            {isStreaming || queuedPrompts.length > 0 ? (
            <RunStatusPanel
              isStreaming={isStreaming}
              queuedPrompts={queuedPrompts}
              onCancel={() => cancelActiveStream()}
              onRemoveQueued={removeQueuedPrompt}
            />
            ) : null}
            <div ref={bottomRef} className="h-1" />
          </div>

          {!nearBottom && messages.length > 0 ? (
            <Button
              type="button"
              variant="outline"
            className="absolute bottom-4 left-1/2 h-8 -translate-x-1/2 rounded-full bg-card/95 shadow-md"
              onClick={() => scrollToBottom("smooth")}
            >
              回到底部
            </Button>
          ) : null}
        </div>

        <form onSubmit={handleSubmit} className="shrink-0 border-t border-border/70 bg-card/95 px-5 py-4">
          <div className="mx-auto w-full max-w-[860px]">
            {sendError ? (
              <div className="mb-3 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm leading-5 text-destructive">
                {sendError}
              </div>
            ) : null}
            <div className="relative rounded-xl border border-border bg-card shadow-sm focus-within:ring-2 focus-within:ring-ring">
              <div className="flex items-center justify-between gap-3 border-b border-border/70 px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    className="flex h-6 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    onClick={() => setDraft((current) => current.trimStart().startsWith("/") ? current : "/")}
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                    命令
                  </button>
                  {modelOverride.trim() ? (
                    <Badge className="rounded-md bg-primary/10 text-primary">模型 {modelOverride.trim()}</Badge>
                  ) : null}
                  {queuedPrompts.length > 0 ? (
                    <Badge className="rounded-md bg-muted text-muted-foreground">队列 {queuedPrompts.length}</Badge>
                  ) : null}
                </div>
                <div className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground sm:flex">
                  <CornerDownLeft className="h-3.5 w-3.5" />
                  Enter 发送
                </div>
              </div>
              {showCommandMenu ? (
                <CommandMenu
                  activeIndex={activeCommandIndex}
                  commands={filteredCommands}
                  onSelect={applyCommand}
                  onHover={setActiveCommandIndex}
                />
              ) : null}
              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder={runtimeReady ? "给 Hermes 发消息，输入 / 可使用本地命令" : "本地服务就绪后可以开始聊天"}
                disabled={!apiReady || !runtimeReady}
                className="max-h-44 min-h-[76px] resize-none border-0 bg-transparent px-4 py-3 text-[14px] leading-6 shadow-none focus-visible:ring-0"
              />
              <div className="flex items-center justify-between gap-3 border-t border-border/70 px-3 py-2">
                <div className="min-w-0 truncate text-xs text-muted-foreground">
                  {isStreaming ? "生成中发送会先加入队列。" : "Shift Enter 换行。"}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {isStreaming ? (
                    <Button type="button" variant="outline" onClick={() => cancelActiveStream()}>
                      <Square className="h-3.5 w-3.5 fill-current" />
                      停止
                    </Button>
                  ) : null}
                  <Button type="submit" disabled={!canSubmit}>
                    <SendHorizontal className="h-4 w-4" />
                    {isStreaming ? "加入队列" : "发送"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}

function SessionButton({
  active,
  onClick,
  session,
  streaming,
}: {
  active: boolean;
  onClick: () => void;
  session: HermesSession;
  streaming: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full flex-col items-start rounded-lg px-3 py-2 text-left transition-colors hover:bg-card",
        active && "bg-card shadow-sm ring-1 ring-border",
      )}
    >
      <span className="flex w-full min-w-0 items-center gap-2">
        <span className="line-clamp-1 min-w-0 flex-1 text-[13px] font-medium leading-5 text-foreground">
          {sessionTitle(session)}
        </span>
        {streaming ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-emerald-600 dark:text-emerald-300" /> : null}
      </span>
      <span className="mt-0.5 text-xs text-muted-foreground">
        {streaming ? "正在生成" : formatSessionTime(session.updated_at ?? session.created_at)}
      </span>
    </button>
  );
}

function AssistantTurnRow({
  messages,
  onCopy,
  transitionMode,
}: {
  messages: ChatMessage[];
  onCopy: (content: string) => void;
  transitionMode: keyof typeof messageTransitionClasses;
}) {
  const assistantMessages = messages.filter((message) => message.role !== "tool");
  const toolMessages = messages.filter((message) => message.role === "tool");
  const parts = assistantMessages.map(assistantMessageParts);
  const reasoningText = parts
    .map((part) => part.reasoningText)
    .filter((content) => content.trim() !== "")
    .join("\n\n");
  const displayContent = parts
    .map((part) => part.displayContent.trim())
    .filter(Boolean)
    .join("\n\n");
  const errors = parts
    .map((part) => part.error)
    .filter((error): error is string => Boolean(error));
  const isStreaming = parts.some((part) => part.streaming) || toolMessages.some((message) => message.toolStatus === "running");
  const shouldShowPlaceholder = isStreaming && !displayContent.trim() && !reasoningText.trim() && toolMessages.length === 0;
  const copyableContent = displayContent.trim();

  return (
    <article className={cn("flex gap-3", messageTransitionClasses[transitionMode])}>
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <Bot className="h-4 w-4" />
      </div>
      <div className="min-w-0 max-w-[calc(100%-44px)] flex-1">
        <div
          className={cn(
            "rounded-xl border border-border bg-background/45 px-4 py-3 text-foreground shadow-sm",
            errors.length > 0 && "border-destructive/30 bg-destructive/5",
          )}
        >
          {copyableContent ? (
            <div className="mb-2 flex justify-start">
              <button
                type="button"
                onClick={() => onCopy(copyableContent)}
                className="inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Copy className="h-3 w-3" />
                复制
              </button>
            </div>
          ) : null}
          {reasoningText.trim() ? (
            <ThinkingBlock
              content={reasoningText}
              streaming={isStreaming && !displayContent.trim()}
            />
          ) : null}
          {toolMessages.length > 0 ? <ToolTraceList messages={toolMessages} /> : null}
          {displayContent.trim() ? (
            <MarkdownMessage streaming={isStreaming}>{displayContent}</MarkdownMessage>
          ) : null}
          {shouldShowPlaceholder ? (
            <MarkdownMessage streaming>正在思考...</MarkdownMessage>
          ) : null}
          {errors.map((error) => (
            <p key={error} className="mt-2 border-t border-destructive/20 pt-2 text-xs leading-5 text-destructive">
              {error}
            </p>
          ))}
        </div>
      </div>
    </article>
  );
}

function ChatMessageRow({
  message,
  onCopy,
  transitionMode,
}: {
  message: ChatMessage;
  onCopy: () => void;
  transitionMode: keyof typeof messageTransitionClasses;
}) {
  if (message.role === "tool") {
    return <ToolMessageRow message={message} transitionMode={transitionMode} />;
  }

  const isUser = message.role === "user";
  const Icon = isUser ? UserRound : Bot;
  const parsedThinking = parseThinking(message.content, message.status === "streaming");
  const reasoningText = [message.reasoning, ...parsedThinking.segments, parsedThinking.pending]
    .filter((part): part is string => typeof part === "string" && part.trim() !== "")
    .join("\n\n");
  const displayContent = isUser ? message.content : parsedThinking.body;
  const shouldRenderAssistantContent = isUser || displayContent.trim() || !reasoningText.trim();

  return (
    <article
      className={cn(
        "flex gap-3",
        isUser && "justify-end",
        messageTransitionClasses[transitionMode],
      )}
    >
      {!isUser ? (
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <Icon className="h-4 w-4" />
        </div>
      ) : null}
      <div className={cn("min-w-0 max-w-[78%]", !isUser && "max-w-[calc(100%-44px)] flex-1")}>
        <div
          className={cn(
            "rounded-xl px-4 py-3 shadow-sm",
            isUser
              ? "bg-primary text-primary-foreground"
              : "border border-border bg-background/45 text-foreground",
            message.status === "error" && "border-destructive/30 bg-destructive/5",
          )}
        >
          {message.content.trim() ? (
            <div className={cn("mb-2 flex", isUser ? "justify-end" : "justify-start")}>
              <button
                type="button"
                onClick={onCopy}
                className={cn(
                  "inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] transition-colors",
                  isUser
                    ? "text-primary-foreground/70 hover:bg-white/10 hover:text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Copy className="h-3 w-3" />
                复制
              </button>
            </div>
          ) : null}
          {isUser ? (
            <p className="whitespace-pre-wrap text-[14px] leading-6">{message.content}</p>
          ) : (
            <>
              {reasoningText.trim() ? (
                <ThinkingBlock
                  content={reasoningText}
                  streaming={message.status === "streaming" && !displayContent.trim()}
                />
              ) : null}
              {shouldRenderAssistantContent ? (
                <MarkdownMessage streaming={message.status === "streaming"}>
                  {displayContent || "正在思考..."}
                </MarkdownMessage>
              ) : null}
            </>
          )}
          {message.error ? (
            <p className="mt-2 border-t border-destructive/20 pt-2 text-xs leading-5 text-destructive">
              {message.error}
            </p>
          ) : null}
        </div>
      </div>
      {isUser ? (
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="h-4 w-4" />
        </div>
      ) : null}
    </article>
  );
}

function ThinkingBlock({ content, streaming }: { content: string; streaming: boolean }) {
  const [expandedOverride, setExpandedOverride] = useState<boolean | null>(null);
  const expanded = streaming || expandedOverride === true;
  const characterCount = [...content].length;

  return (
    <div className="mb-3 overflow-hidden rounded-lg border border-border bg-muted/35">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted"
        onClick={() => setExpandedOverride((current) => !(current ?? false))}
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <Brain className="h-3.5 w-3.5" />
        <span className="font-medium text-foreground">{streaming ? "正在思考" : "思考过程"}</span>
        <span className="ml-auto tabular-nums">{characterCount} 字</span>
      </button>
      {expanded ? (
        <div className="border-t border-border px-3 py-2 text-xs leading-5 text-muted-foreground">
          <MarkdownMessage>{content}</MarkdownMessage>
        </div>
      ) : null}
    </div>
  );
}

function ToolMessageRow({
  message,
  transitionMode,
}: {
  message: ChatMessage;
  transitionMode: keyof typeof messageTransitionClasses;
}) {
  return (
    <article className={cn("ml-11 max-w-[760px]", messageTransitionClasses[transitionMode])}>
      <ToolTraceItem message={message} />
    </article>
  );
}

function ToolTraceList({ messages }: { messages: ChatMessage[] }) {
  const hasRunningTool = messages.some((message) => message.toolStatus === "running");
  const errorCount = messages.filter((message) => message.toolStatus === "error").length;
  const [expandedOverride, setExpandedOverride] = useState<boolean | null>(null);
  const expanded = hasRunningTool || expandedOverride === true;
  const latestMessage = messages[messages.length - 1];
  const statusText = hasRunningTool
    ? "正在调用工具"
    : errorCount > 0
      ? `${errorCount} 个调用失败`
      : "调用完成";

  return (
    <div className="mb-3 overflow-hidden rounded-lg border border-border bg-muted/25">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted"
        onClick={() => setExpandedOverride((current) => !(current ?? false))}
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <Wrench className="h-3.5 w-3.5" />
        <span className="font-medium text-foreground">调用过程</span>
        <span>{messages.length} 步</span>
        <span className="ml-auto">{statusText}</span>
      </button>
      {expanded ? (
        <div className="space-y-1 border-t border-border p-2">
          {messages.map((message) => (
            <ToolTraceItem key={message.id} message={message} />
          ))}
        </div>
      ) : latestMessage ? (
        <div className="border-t border-border px-3 py-2 text-xs leading-5 text-muted-foreground">
          <span className="font-medium text-foreground">{toolDisplayName(latestMessage.toolName)}</span>
          {latestMessage.toolPreview ? <span>：{latestMessage.toolPreview}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function ToolTraceItem({ message }: { message: ChatMessage }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = Boolean(message.toolArgs || message.toolResult);
  const statusLabel = toolStatusLabel(message.toolStatus);

  return (
    <div className="rounded-lg px-1 py-1 text-muted-foreground">
      <button
        type="button"
        className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/60"
        onClick={() => hasDetails && setExpanded((current) => !current)}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground shadow-sm">
          {hasDetails
            ? expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
            : <Wrench className="h-3.5 w-3.5" />}
        </span>
        <Wrench className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-medium">{toolDisplayName(message.toolName)}</span>
        <Badge className={cn(
          "shrink-0 rounded-md border-border bg-background text-[11px] text-muted-foreground",
          message.toolStatus === "running" && "text-emerald-600 dark:text-emerald-300",
          message.toolStatus === "error" && "border-destructive/20 bg-destructive/10 text-destructive",
        )}>
          {statusLabel}
        </Badge>
      </button>
      {message.toolPreview ? (
        <p className="ml-12 mt-1 line-clamp-3 text-[13px] leading-6 text-foreground/85">{message.toolPreview}</p>
      ) : null}
      {message.toolDuration ? (
        <p className="ml-12 mt-1 text-[11px] text-muted-foreground">耗时 {formatToolDuration(message.toolDuration)}</p>
      ) : null}
      {expanded && hasDetails ? (
        <div className="ml-12 mt-3 space-y-3 border-l border-border pl-3">
          {message.toolArgs ? <ToolPayload title="参数" content={message.toolArgs} /> : null}
          {message.toolResult ? <ToolPayload title="结果" content={message.toolResult} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function ToolPayload({ content, title }: { content: string; title: string }) {
  const formatted = formatJsonLikeText(content);
  return (
    <div>
      <div className="mb-1 text-[11px] font-medium text-muted-foreground">{title}</div>
      <pre className="max-h-64 overflow-auto rounded-md bg-background/80 p-3 text-xs leading-5 text-foreground">
        <code>{formatted}</code>
      </pre>
    </div>
  );
}

function CommandMenu({
  activeIndex,
  commands,
  onHover,
  onSelect,
}: {
  activeIndex: number;
  commands: readonly LocalCommand[];
  onHover: (index: number) => void;
  onSelect: (command: LocalCommand) => void;
}) {
  return (
    <div className="absolute bottom-full left-3 z-20 mb-2 w-[320px] overflow-hidden rounded-lg border border-border bg-popover shadow-[var(--hermes-shadow-popover)]">
      <div className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">本地命令</div>
      <div className="max-h-56 overflow-auto p-1">
        {commands.map((command, index) => (
          <button
            key={command.name}
            type="button"
            onMouseEnter={() => onHover(index)}
            onMouseDown={(event) => {
              event.preventDefault();
              onSelect(command);
            }}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[13px]",
              index === activeIndex ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <span className="font-mono text-foreground">/{command.name}</span>
            {command.args ? <span className="text-xs text-muted-foreground">{command.args}</span> : null}
            <span className="ml-auto truncate text-xs">{command.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function RunStatusPanel({
  isStreaming,
  onCancel,
  onRemoveQueued,
  queuedPrompts,
}: {
  isStreaming: boolean;
  onCancel: () => void;
  onRemoveQueued: (id: string) => void;
  queuedPrompts: QueuedPrompt[];
}) {
  return (
    <div className="ml-11 mt-5 max-w-[560px] rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", isStreaming ? "animate-pulse bg-emerald-500" : "bg-muted-foreground")} />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium text-foreground">
              {isStreaming ? "正在接收流式响应" : "等待下一条消息"}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {queuedPrompts.length > 0 ? `${queuedPrompts.length} 条消息在队列中` : "响应完成后会自动同步会话。"}
            </div>
          </div>
        </div>
        {isStreaming ? (
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            <Square className="h-3.5 w-3.5 fill-current" />
            停止
          </Button>
        ) : null}
      </div>
      {queuedPrompts.length > 0 ? (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          {queuedPrompts.map((prompt, index) => (
            <div key={prompt.id} className="flex items-center gap-2 rounded-lg bg-muted/55 px-2 py-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-card text-[11px] text-muted-foreground">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-foreground">{prompt.content}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="移出队列"
                className="h-6 w-6"
                onClick={() => onRemoveQueued(prompt.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ChatEmptyState({ onUsePrompt }: { onUsePrompt: (prompt: string) => void }) {
  return (
    <div className="flex flex-1 items-center justify-center py-12">
      <div className="w-full max-w-[620px] text-center">
        <div className="mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <Sparkles className="h-5 w-5" />
        </div>
        <h2 className="text-[21px] font-semibold tracking-normal">今天想让 Hermes 做什么？</h2>
        <p className="mx-auto mt-2 max-w-[480px] text-sm leading-6 text-muted-foreground">
          可以从一个问题、一个目标，或一段需要整理的上下文开始。
        </p>
        <div className="mt-6 grid gap-2 text-left sm:grid-cols-3">
          {suggestedPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => onUsePrompt(prompt)}
              className="rounded-lg border border-border bg-card px-3 py-3 text-[13px] leading-5 text-foreground shadow-sm transition-colors hover:bg-muted"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function RuntimeBadge({
  configured,
  loading,
  running,
  tauriRuntime,
}: {
  configured?: boolean;
  loading: boolean;
  running: boolean;
  tauriRuntime: boolean;
}) {
  if (!tauriRuntime) {
    return <Badge className="bg-muted text-muted-foreground">浏览器预览</Badge>;
  }

  if (loading) {
    return (
      <Badge className="bg-muted text-muted-foreground">
        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        检查中
      </Badge>
    );
  }

  if (running) {
    return (
      <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
        <CheckCircle2 className="mr-1 h-3 w-3" />
        就绪
      </Badge>
    );
  }

  return (
    <Badge className="border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300">
      {configured ? "服务未启动" : "模型未配置"}
    </Badge>
  );
}

function InlineNotice({
  description,
  title,
  tone = "neutral",
}: {
  description: string;
  title: string;
  tone?: "danger" | "neutral";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-3",
        tone === "danger" ? "border-destructive/20 bg-destructive/5" : "border-border bg-card/60",
      )}
    >
      <div className="text-[13px] font-medium text-foreground">{title}</div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
    </div>
  );
}

function SessionListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="rounded-lg border border-border/60 bg-card/50 p-3">
          <div className="h-3 w-4/5 rounded bg-muted" />
          <div className="mt-2 h-2 w-2/5 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function MessageSkeleton() {
  return (
    <div className="flex gap-3">
      <div className="h-8 w-8 rounded-lg bg-muted" />
      <div className="flex-1 rounded-xl border border-border bg-background/45 p-4">
        <div className="h-3 w-4/5 rounded bg-muted" />
        <div className="mt-3 h-3 w-3/5 rounded bg-muted" />
      </div>
    </div>
  );
}

function buildChatDisplayItems(messages: ChatMessage[]): ChatDisplayItem[] {
  const items: ChatDisplayItem[] = [];
  let currentAssistantItem: Extract<ChatDisplayItem, { kind: "assistant" }> | null = null;

  for (const message of messages) {
    if (message.role === "user") {
      currentAssistantItem = null;
      items.push({ kind: "user", message });
      continue;
    }

    if (currentAssistantItem) {
      currentAssistantItem.messages.push(message);
      continue;
    }

    currentAssistantItem = {
      id: `assistant-turn-${message.id}`,
      kind: "assistant",
      messages: [message],
    };
    items.push(currentAssistantItem);
  }

  return items;
}

function assistantMessageParts(message: ChatMessage): AssistantMessageParts {
  if (message.role === "tool") {
    return {
      displayContent: "",
      error: message.error,
      reasoningText: "",
      streaming: message.status === "streaming" || message.toolStatus === "running",
    };
  }

  const parsedThinking = parseThinking(message.content, message.status === "streaming");
  const reasoningText = [message.reasoning, ...parsedThinking.segments, parsedThinking.pending]
    .filter((part): part is string => typeof part === "string" && part.trim() !== "")
    .join("\n\n");
  const displayContent = message.role === "assistant" ? parsedThinking.body : message.content;

  return {
    displayContent,
    error: message.error,
    reasoningText,
    streaming: message.status === "streaming",
  };
}

function omitRecordKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) {
    return record;
  }

  const nextRecord = { ...record };
  delete nextRecord[key];
  return nextRecord;
}

function updateQueuedPrompts(
  current: QueuedPromptsBySession,
  sessionId: string,
  updater: (items: QueuedPrompt[]) => QueuedPrompt[],
): QueuedPromptsBySession {
  const currentItems = current[sessionId] ?? [];
  const nextItems = updater(currentItems);
  if (nextItems === currentItems) {
    return current;
  }

  if (nextItems.length === 0) {
    return omitRecordKey(current, sessionId);
  }

  return {
    ...current,
    [sessionId]: nextItems,
  };
}

function mergeServerAndRuntimeMessages(
  serverMessages: ChatMessage[],
  runtimeMessages: ChatMessage[],
  sessionIsStreaming: boolean,
): ChatMessage[] {
  if (serverMessages.length === 0) {
    return runtimeMessages;
  }

  if (runtimeMessages.length === 0) {
    return serverMessages;
  }

  const serverIds = new Set(serverMessages.map((message) => message.id));
  const lastServerCreatedAt = Math.max(...serverMessages.map((message) => message.createdAt));
  const merged = [...serverMessages];

  for (const runtimeMessage of runtimeMessages) {
    if (serverIds.has(runtimeMessage.id) || runtimeMessageRepresentedByServer(runtimeMessage, serverMessages)) {
      continue;
    }

    const shouldKeepRuntimeMessage = sessionIsStreaming
      || runtimeMessage.status === "streaming"
      || runtimeMessage.status === "error"
      || runtimeMessage.createdAt >= lastServerCreatedAt;
    if (shouldKeepRuntimeMessage) {
      merged.push(runtimeMessage);
    }
  }

  if (merged.length === serverMessages.length) {
    return serverMessages;
  }

  return merged.sort((first, second) => first.createdAt - second.createdAt);
}

function runtimeMessageRepresentedByServer(runtimeMessage: ChatMessage, serverMessages: ChatMessage[]): boolean {
  if (runtimeMessage.role === "tool" && runtimeMessage.toolCallId) {
    return serverMessages.some((serverMessage) =>
      serverMessage.role === "tool" && serverMessage.toolCallId === runtimeMessage.toolCallId,
    );
  }

  const runtimeContent = runtimeMessage.content.trim();
  if (!runtimeContent) {
    return false;
  }

  return serverMessages.some((serverMessage) =>
    serverMessage.role === runtimeMessage.role
    && serverMessage.content.trim() === runtimeContent,
  );
}

function normalizeHermesMessage(message: HermesMessage): ChatMessage {
  const content = contentToText(message.content);
  return {
    id: message.id ?? createMessageId(message.role),
    role: message.role,
    content: message.role === "tool" ? "" : content,
    createdAt: message.timestamp ?? (Date.parse(message.created_at ?? "") || Date.now()),
    reasoning: (message.reasoning?.trim() || readMessageString(message, "reasoning_content") || undefined),
    status: "complete",
    toolCallId: message.tool_call_id ?? undefined,
    toolName: message.tool_name ?? undefined,
    toolPreview: message.role === "tool" ? toolPreviewFromResult(content) : undefined,
    toolResult: message.role === "tool" ? content : undefined,
    toolStatus: message.role === "tool" ? "done" : undefined,
  };
}

function contentToText(content: unknown): string {
  if (typeof content === "string") {
    return displayContentFromUnknown(content) ?? normalizeEscapedText(content);
  }

  if (Array.isArray(content)) {
    return content.map(contentToText).filter(Boolean).join("\n");
  }

  if (isRecord(content)) {
    const displayContent = displayContentFromRecord(content);
    if (displayContent !== null) {
      return displayContent;
    }

    const text = readString(content, "text") ?? readString(content, "content");
    if (text) {
      return normalizeEscapedText(text);
    }
  }

  return "";
}

function streamEventReasoningText(event: HermesStreamEvent): string {
  const eventName = streamEventName(event);
  if (eventName !== "reasoning.delta" && eventName !== "thinking.delta") {
    return "";
  }

  const data = streamEventRecord(event);
  if (data) {
    return normalizeEscapedText(
      readString(data, "text")
      ?? readString(data, "delta")
      ?? readString(data, "content")
      ?? "",
    );
  }

  return typeof event.data === "string" ? normalizeEscapedText(event.data) : "";
}

function streamEventToolUpdate(event: HermesStreamEvent): ToolUpdate | null {
  const eventName = streamEventName(event);
  const data = streamEventRecord(event);
  if (!data) {
    return null;
  }

  if (eventName === "tool.started") {
    const name = readString(data, "tool") ?? readString(data, "name") ?? "工具调用";
    return {
      id: readString(data, "tool_call_id") ?? readString(data, "toolCallId") ?? undefined,
      name,
      preview: readString(data, "preview") ?? summarizeToolArguments(readString(data, "arguments")),
      status: "running",
      toolArgs: readString(data, "arguments") ?? undefined,
    };
  }

  if (eventName === "tool.completed") {
    const name = readString(data, "tool") ?? readString(data, "name") ?? "工具调用";
    const output = readString(data, "output") ?? readString(data, "result") ?? undefined;
    return {
      duration: readNumber(data, "duration") ?? readNumber(data, "duration_seconds") ?? undefined,
      id: readString(data, "tool_call_id") ?? readString(data, "toolCallId") ?? undefined,
      name,
      preview: toolPreviewFromResult(output ?? ""),
      result: output,
      status: readBoolean(data, "error") || isToolOutputError(output) ? "error" : "done",
    };
  }

  if (eventName.startsWith("subagent.")) {
    return subagentToolUpdate(eventName, data);
  }

  return null;
}

function streamEventText(event: HermesStreamEvent): string {
  const eventName = streamEventName(event);
  if (
    eventName === "reasoning.available"
    || eventName === "reasoning.delta"
    || eventName === "thinking.delta"
    || eventName === "tool.started"
    || eventName === "tool.completed"
    || eventName.startsWith("subagent.")
  ) {
    return "";
  }

  const data = event.data;
  if (typeof data === "string") {
    if (data === "[DONE]") {
      return "";
    }

    return displayContentFromUnknown(data) ?? normalizeEscapedText(data);
  }

  if (!isRecord(data)) {
    return "";
  }

  const choices = data.choices;
  if (Array.isArray(choices)) {
    return choices.map(choiceText).join("");
  }

  const displayContent = displayContentFromRecord(data);
  if (displayContent !== null) {
    return displayContent;
  }

  if (isCompletionMetadata(data)) {
    return "";
  }

  return (
    readString(data, "delta")
    ?? readString(data, "content")
    ?? readString(data, "text")
    ?? readNestedString(data, ["message", "content"])
    ?? readNestedString(data, ["delta", "content"])
    ?? ""
  );
}

function choiceText(choice: unknown): string {
  if (!isRecord(choice)) {
    return "";
  }

  return (
    readNestedString(choice, ["delta", "content"])
    ?? readNestedString(choice, ["message", "content"])
    ?? readString(choice, "text")
    ?? ""
  );
}

function streamEventError(event: HermesStreamEvent): string | null {
  const data = streamEventRecord(event) ?? event.data;
  if (!event.type.toLowerCase().includes("error") && !hasErrorPayload(data)) {
    return null;
  }

  if (typeof data === "string") {
    return data;
  }

  if (!isRecord(data)) {
    return "流式响应返回错误。";
  }

  const directMessage = readString(data, "message") ?? readString(data, "detail");
  if (directMessage) {
    return directMessage;
  }

  const error = data.error;
  if (typeof error === "string") {
    return error;
  }

  if (isRecord(error)) {
    return readString(error, "message") ?? readString(error, "detail") ?? "流式响应返回错误。";
  }

  return "流式响应返回错误。";
}

function hasErrorPayload(data: unknown): boolean {
  return isRecord(data) && "error" in data;
}

function isDoneEvent(event: HermesStreamEvent): boolean {
  if (event.data === "[DONE]") {
    return true;
  }

  const eventName = streamEventName(event);
  if (
    eventName === "done"
    || eventName === "message.completed"
    || eventName === "response.completed"
    || eventName === "run.completed"
    || eventName === "transport.done"
  ) {
    return true;
  }

  const data = streamEventRecord(event);
  if (!data) {
    return false;
  }

  if (isCompletionMetadata(data) && readString(data, "exit_reason") === "completed") {
    return true;
  }

  const choices = data.choices;
  if (!Array.isArray(choices)) {
    return false;
  }

  const hasFinishReason = choices.some((choice) => {
    if (!isRecord(choice)) {
      return false;
    }

    return Boolean(choice.finish_reason ?? choice.finishReason);
  });
  const hasDeltaContent = choices.some((choice) =>
    isRecord(choice) && Boolean(readNestedString(choice, ["delta", "content"])),
  );

  return hasFinishReason && !hasDeltaContent;
}

function streamEventName(event: HermesStreamEvent): string {
  const data = streamEventRecord(event);
  return (data ? readString(data, "event") : null) ?? event.type.toLowerCase();
}

function streamEventRecord(event: HermesStreamEvent): Record<PropertyKey, unknown> | null {
  if (isRecord(event.data)) {
    return event.data;
  }

  if (typeof event.data !== "string") {
    return null;
  }

  const parsed = parseJsonText(event.data);
  return isRecord(parsed) ? parsed : null;
}

function displayContentFromUnknown(value: unknown): string | null {
  if (typeof value === "string") {
    const parsed = parseJsonText(value);
    if (parsed === null) {
      return null;
    }
    return displayContentFromUnknown(parsed);
  }

  if (isRecord(value)) {
    return displayContentFromRecord(value);
  }

  return null;
}

function displayContentFromRecord(record: Record<PropertyKey, unknown>): string | null {
  const parsedReasoningContent = readString(record, "parsed_content");
  if (parsedReasoningContent !== null) {
    return normalizeEscapedText(parsedReasoningContent);
  }

  const output = readString(record, "output");
  if (output) {
    return displayContentFromUnknown(output) ?? normalizeEscapedText(output);
  }

  const content = readString(record, "content");
  if (content && looksLikeStructuredEnvelope(content)) {
    return displayContentFromUnknown(content);
  }

  const summaries = resultSummaries(record.results);
  if (summaries) {
    return summaries;
  }

  return null;
}

function resultSummaries(results: unknown): string | null {
  if (!Array.isArray(results)) {
    return null;
  }

  const summaries = results
    .map((item, index) => resultSummary(item, index))
    .filter(Boolean);

  return summaries.length > 0 ? summaries.join("\n\n") : null;
}

function resultSummary(item: unknown, index: number): string {
  if (typeof item === "string") {
    return normalizeEscapedText(item);
  }

  if (!isRecord(item)) {
    return "";
  }

  const summary = readString(item, "summary")
    ?? readString(item, "text")
    ?? readString(item, "content")
    ?? readString(item, "output_tail")
    ?? "";
  const normalized = normalizeEscapedText(summary);
  const status = readString(item, "status");
  if (!status || status === "completed") {
    return normalized;
  }

  return normalized ? `子任务 ${index + 1} ${status}: ${normalized}` : `子任务 ${index + 1} ${status}`;
}

function subagentToolUpdate(eventName: string, data: Record<PropertyKey, unknown>): ToolUpdate {
  const taskIndex = readNumber(data, "task_index") ?? 0;
  const taskCount = readNumber(data, "task_count") ?? 1;
  const label = `${taskIndex + 1}/${Math.max(1, taskCount)}`;
  const text = readString(data, "text") ?? readString(data, "preview") ?? "";
  const summary = readString(data, "summary") ?? "";
  const goal = readString(data, "goal") ?? "";
  const toolName = readString(data, "tool") ?? readString(data, "name") ?? "";
  const status = readString(data, "status") ?? "completed";
  const subagentId = readString(data, "subagent_id") ?? String(taskIndex);
  const runId = readString(data, "run_id") ?? "run";

  let preview = text || summary || goal;
  if (eventName === "subagent.start") {
    preview = `子任务 ${label} 开始${goal ? `：${goal}` : ""}`;
  } else if (eventName === "subagent.tool") {
    preview = `子任务 ${label}${toolName ? `：${toolName}` : ""}${text ? ` - ${text}` : ""}`;
  } else if (eventName === "subagent.progress") {
    preview = `子任务 ${label}：${text || "执行中"}`;
  } else if (eventName === "subagent.complete") {
    preview = `子任务 ${label} ${status}${summary ? `：${summary}` : ""}`;
  }

  return {
    duration: readNumber(data, "duration_seconds") ?? readNumber(data, "duration") ?? undefined,
    id: `subagent:${runId}:${subagentId}`,
    name: "delegate_task",
    preview: preview.slice(0, 220),
    result: eventName === "subagent.complete"
      ? formatJsonLikeText(JSON.stringify({
          status,
          summary: summary || text,
          api_calls: data.api_calls,
          input_tokens: data.input_tokens,
          output_tokens: data.output_tokens,
        }))
      : undefined,
    status: eventName === "subagent.complete" && status !== "completed" ? "error" : eventName === "subagent.complete" ? "done" : "running",
  };
}

function parseThinking(content: string, streaming: boolean): ParsedThinking {
  const protectedText = protectInlineCode(content);
  const segments: string[] = [];
  let body = "";
  let pending: string | null = null;
  let cursor = 0;
  const tagPattern = /<(think|thinking|reasoning)>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(protectedText.masked)) !== null) {
    body += protectedText.masked.slice(cursor, match.index);
    segments.push(restoreInlineCode(match[2] ?? "", protectedText.blocks));
    cursor = match.index + match[0].length;
  }

  const rest = protectedText.masked.slice(cursor);
  const openMatch = rest.match(/<(think|thinking|reasoning)>([\s\S]*)$/i);
  if (openMatch && openMatch.index !== undefined) {
    body += rest.slice(0, openMatch.index);
    if (streaming) {
      pending = restoreInlineCode(openMatch[2] ?? "", protectedText.blocks);
    } else {
      body += rest.slice(openMatch.index);
    }
  } else {
    body += rest;
  }

  return {
    body: restoreInlineCode(body, protectedText.blocks),
    hasThinking: segments.length > 0 || pending !== null,
    pending,
    segments,
  };
}

function protectInlineCode(input: string) {
  const blocks: string[] = [];
  const masked = input
    .replace(/(^|\n)( {0,3})(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\2\3[ \t]*(?=\n|$)/g, (match) => {
      blocks.push(match);
      return `\u0000HERMCODE${blocks.length - 1}\u0000`;
    })
    .replace(/`[^`\n]*`/g, (match) => {
      blocks.push(match);
      return `\u0000HERMCODE${blocks.length - 1}\u0000`;
    });

  return { blocks, masked };
}

function restoreInlineCode(input: string, blocks: string[]): string {
  return input.replace(/\u0000HERMCODE(\d+)\u0000/g, (_, index: string) => blocks[Number(index)] ?? "");
}

function parseJsonText(input: string): unknown | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const candidates = [trimmed];
  if (trimmed.includes('\\"') || trimmed.includes("\\n")) {
    candidates.push(trimmed.replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\t/g, "\t"));
  }

  for (const candidate of candidates) {
    try {
      let parsed = JSON.parse(candidate) as unknown;
      for (let index = 0; index < 2 && typeof parsed === "string" && looksLikeStructuredEnvelope(parsed); index += 1) {
        parsed = JSON.parse(parsed) as unknown;
      }
      return parsed;
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

function looksLikeStructuredEnvelope(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return false;
  }

  return (
    trimmed.includes('"results"')
    || trimmed.includes('"output"')
    || trimmed.includes('"parsed_content"')
    || trimmed.includes('"parsed_reasoning"')
    || trimmed.includes('"api_calls"')
    || trimmed.includes('"tool_trace"')
  );
}

function normalizeEscapedText(input: string): string {
  if (!input.includes("\\n") && !input.includes('\\"') && !input.includes("\\t")) {
    return input;
  }

  return input
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"');
}

function summarizeToolArguments(args: string | null): string | undefined {
  if (!args) {
    return undefined;
  }

  const normalized = formatJsonLikeText(args).replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, 160) : undefined;
}

function toolPreviewFromResult(result: string): string | undefined {
  const displayContent = displayContentFromUnknown(result);
  const source = displayContent ?? formatJsonLikeText(result);
  const normalized = source.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, 180) : undefined;
}

function isToolOutputError(output: string | undefined): boolean {
  if (!output?.trim()) {
    return false;
  }

  const parsed = parseJsonText(output);
  if (!isRecord(parsed)) {
    return output.trim().startsWith("Error");
  }

  if (parsed.success === false) {
    return true;
  }

  const error = parsed.error;
  return error !== undefined && error !== null && String(error).trim() !== "";
}

function formatJsonLikeText(input: string): string {
  const parsed = parseJsonText(input);
  if (parsed === null) {
    return normalizeEscapedText(input);
  }

  if (typeof parsed === "string") {
    return normalizeEscapedText(parsed);
  }

  return JSON.stringify(parsed, null, 2);
}

function formatToolDuration(seconds: number): string {
  if (seconds < 1) {
    return `${Math.round(seconds * 1000)}ms`;
  }

  if (seconds < 60) {
    return `${Math.round(seconds * 10) / 10}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

function toolStatusLabel(status: ChatMessage["toolStatus"]): string {
  if (status === "running") {
    return "执行中";
  }

  if (status === "error") {
    return "失败";
  }

  return "完成";
}

function toolDisplayName(name: string | undefined): string {
  if (!name) {
    return "运行步骤";
  }

  if (name === "delegate_task") {
    return "委派子任务";
  }

  return name.replace(/[_-]+/g, " ");
}

function isCompletionMetadata(data: Record<PropertyKey, unknown>): boolean {
  return (
    "api_calls" in data
    || "duration_seconds" in data
    || "exit_reason" in data
    || "tokens" in data
    || "tool_trace" in data
    || "total_duration_seconds" in data
  );
}

function readNestedString(record: Record<PropertyKey, unknown>, path: string[]): string | null {
  let current: unknown = record;
  for (const key of path) {
    if (!isRecord(current)) {
      return null;
    }
    current = current[key];
  }

  return typeof current === "string" ? current : null;
}

function readString(record: Record<PropertyKey, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function readMessageString(message: HermesMessage, key: string): string | null {
  const value = message[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(record: Record<PropertyKey, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBoolean(record: Record<PropertyKey, unknown>, key: string): boolean {
  return record[key] === true;
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null;
}

function mergeSession(current: HermesSession[] | undefined, session: HermesSession): HermesSession[] {
  if (!current) {
    return [session];
  }

  return [session, ...current.filter((item) => item.id !== session.id)];
}

function sessionTitle(session: HermesSession): string {
  return session.title?.trim() || "未命名会话";
}

function titleFromPrompt(prompt: string): string {
  return prompt.replace(/\s+/g, " ").slice(0, 36) || "新对话";
}

function normalizedModelOverride(model: string): string | undefined {
  const normalized = model.trim();
  return normalized || undefined;
}

function draftStorageSessionKey(sessionId: string | null): string {
  return sessionId ?? "__new__";
}

function readDraftMap(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(draftStorageKey);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed)
      ? Object.fromEntries(
          Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
        )
      : {};
  } catch {
    return {};
  }
}

function readDraft(key: string): string {
  return readDraftMap()[key] ?? "";
}

function writeDraft(key: string, value: string) {
  try {
    const drafts = readDraftMap();
    if (value) {
      drafts[key] = value;
    } else {
      delete drafts[key];
    }

    if (Object.keys(drafts).length === 0) {
      window.localStorage.removeItem(draftStorageKey);
      return;
    }

    window.localStorage.setItem(draftStorageKey, JSON.stringify(drafts));
  } catch (error) {
    console.error("Failed to persist chat draft", error);
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error("Failed to write clipboard with navigator API", error);
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  } catch (error) {
    console.error("Failed to write clipboard with fallback API", error);
    return false;
  }
}

function formatSessionTime(value?: string | null): string {
  if (!value) {
    return "刚刚";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "刚刚";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  }).format(date);
}

function createMessageId(prefix: string): string {
  const randomId = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(16).slice(2);
  return `${prefix}-${Date.now()}-${randomId}`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
