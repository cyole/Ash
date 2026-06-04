import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IEditor as LobeEditor } from "@lobehub/editor";
import { ReactCodeblockPlugin, ReactLinkPlugin, ReactListPlugin } from "@lobehub/editor";
import { ChatInput, Editor, useEditor } from "@lobehub/editor/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Brain,
  ChevronDown,
  ChevronRight,
  Copy,
  CornerDownLeft,
  Loader2,
  SendHorizontal,
  Sparkles,
  Square,
  Trash2,
} from "lucide-react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { chatPathForSession, chatSessionSearchParam, readPendingChatPrompt } from "@/features/chat/chat-route";
import {
  clearChatSessionActivity,
  markChatSessionFinished,
  markChatSessionGenerating,
  markChatSessionViewed,
} from "@/features/chat/chat-session-activity";
import { ComposerResizeHandle, useComposerResize } from "@/features/chat/components/ComposerResizeHandle";
import { MarkdownMessage } from "@/features/chat/components/MarkdownMessage";
import { useAshSettings } from "@/features/settings/settings-store";
import { errorMessage } from "@/lib/errors";
import type { HermesMessage, HermesSession, HermesStreamEvent } from "@/lib/hermes";
import { ashQueryKeys, useAshApi } from "@/lib/hermes/queries";
import { cn } from "@/lib/utils";
import { createRuntimeTuiSession, interruptRuntimeSession, streamRuntimeSessionChat } from "@/lib/tauri";
import type { ModelInfoResponse } from "@/types/runtime-dashboard";

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

interface ChatUsageStats {
  contextMax?: number;
  contextPercent?: number;
  contextUsed?: number;
  input: number;
  output: number;
  total: number;
}

interface SendPromptOptions {
  forceNewSession?: boolean;
}

type ActiveStreamMap = Record<string, string>;
type DraftUpdate = string | ((current: string) => string);
type MessagesBySession = Record<string, ChatMessage[]>;
type QueuedPromptsBySession = Record<string, QueuedPrompt[]>;
type UsageBySession = Record<string, ChatUsageStats>;

const suggestedPrompts = [
  "整理一下今天最重要的三个工作项",
  "帮我把这个想法拆成可执行计划",
  "检查当前 Ash 配置还缺什么",
] as const;

const localCommands = [
  { name: "clear", insertText: "/clear", description: "清空当前聊天视图" },
  { name: "new", insertText: "/new", description: "开始一个新对话" },
  { name: "stop", insertText: "/stop", description: "停止当前生成" },
] as const satisfies readonly LocalCommand[];

const composerEditorPlugins = [ReactListPlugin, ReactLinkPlugin, ReactCodeblockPlugin];
const draftStorageKey = "ash.chat.drafts.v1";

const messageTransitionClasses = {
  fadeIn: "animate-in fade-in duration-200",
  none: "",
  smooth: "animate-in fade-in slide-in-from-bottom-1 duration-200",
} as const;

export function ChatPage() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { settings } = useAshSettings();
  const { apiReady, apiUrl, client, sessionToken, status, tauriRuntime } = useAshApi();
  const selectedSessionId = searchParams.get(chatSessionSearchParam);
  const [messagesBySession, setMessagesBySession] = useState<MessagesBySession>({});
  const [draft, setDraft] = useState("");
  const [activeStreams, setActiveStreams] = useState<ActiveStreamMap>({});
  const [queuedPromptsBySession, setQueuedPromptsBySession] = useState<QueuedPromptsBySession>({});
  const [usageBySession, setUsageBySession] = useState<UsageBySession>({});
  const [sendError, setSendError] = useState<string | null>(null);
  const [nearBottom, setNearBottom] = useState(true);
  const [activeCommandIndex, setActiveCommandIndex] = useState(0);
  const composerEditor = useEditor();
  const composerResize = useComposerResize({ defaultHeight: 84, maxHeight: 360, minHeight: 84 });
  const [composerReady, setComposerReady] = useState(false);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const handledPendingPromptRef = useRef<string | null>(null);
  const streamTokensRef = useRef<Map<string, number>>(new Map());
  const runtimeSessionIdsRef = useRef<Map<string, string>>(new Map());
  const queuedPromptsRef = useRef<QueuedPromptsBySession>({});
  const selectedSessionIdRef = useRef<string | null>(null);
  const pendingInitialScrollSessionRef = useRef<string | null>(null);
  const loadedMessagesSessionRef = useRef<string | null>(null);
  const draftChangeSourceRef = useRef<"editor" | "external">("external");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const sessions = useQuery({
    enabled: apiReady,
    queryKey: ashQueryKeys.sessions(apiUrl, Boolean(sessionToken)),
    queryFn: () => client.listSessions(),
  });

  const sessionMessages = useQuery({
    enabled: apiReady && Boolean(selectedSessionId),
    queryKey: ashQueryKeys.sessionMessages(apiUrl, Boolean(sessionToken), selectedSessionId),
    queryFn: () => selectedSessionId ? client.listSessionMessages(selectedSessionId) : Promise.resolve([]),
  });

  const runtimeReady = !tauriRuntime || Boolean(status.data?.dashboardRunning && status.data.sessionTokenConfigured);
  const modelInfo = useQuery({
    enabled: apiReady && runtimeReady,
    queryKey: ["chat-model-info", apiUrl, Boolean(sessionToken)] as const,
    queryFn: () => client.getGlobalModelInfo(),
    retry: false,
    staleTime: 30_000,
  });
  const messages = selectedSessionId ? messagesBySession[selectedSessionId] ?? [] : [];
  const activeStreamId = selectedSessionId ? activeStreams[selectedSessionId] ?? null : null;
  const queuedPrompts = selectedSessionId ? queuedPromptsBySession[selectedSessionId] ?? [] : [];
  const isStreaming = activeStreamId !== null;
  const selectedSession = useMemo(
    () => selectedSessionId ? sessions.data?.find((session) => session.id === selectedSessionId) ?? null : null,
    [selectedSessionId, sessions.data],
  );
  const contextUsage = useMemo(
    () => buildContextUsage(
      selectedSession,
      modelInfo.data,
      selectedSessionId ? usageBySession[selectedSessionId] : undefined,
    ),
    [modelInfo.data, selectedSession, selectedSessionId, usageBySession],
  );
  const displayItems = useMemo(() => buildChatDisplayItems(messages), [messages]);
  const canSubmit = Boolean(draft.trim() && apiReady && runtimeReady);
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

  const setSelectedSession = useCallback((sessionId: string | null, replace = false) => {
    navigate(chatPathForSession(sessionId), { replace, state: null });
  }, [navigate]);

  const setComposerDraft = useCallback((next: DraftUpdate) => {
    draftChangeSourceRef.current = "external";
    setDraft((current) => typeof next === "function" ? next(current) : next);
  }, []);

  const updateDraftFromEditor = useCallback((editor: LobeEditor) => {
    draftChangeSourceRef.current = "editor";
    setDraft(readEditorMarkdown(editor));
  }, []);

  const readComposerDraft = useCallback(() => {
    if (!composerReady) {
      return draft;
    }

    const editorDraft = readEditorMarkdown(composerEditor);
    return editorDraft || draft;
  }, [composerEditor, composerReady, draft]);

  useEffect(() => {
    queuedPromptsRef.current = queuedPromptsBySession;
  }, [queuedPromptsBySession]);

  useEffect(() => {
    selectedSessionIdRef.current = selectedSessionId;
    if (selectedSessionId) {
      markChatSessionViewed(selectedSessionId);
    }
  }, [selectedSessionId]);

  useEffect(() => {
    setComposerDraft(readDraft(draftKey));
    setActiveCommandIndex(0);
  }, [draftKey, setComposerDraft]);

  useEffect(() => {
    if (!composerReady) {
      return;
    }

    if (draftChangeSourceRef.current === "editor") {
      draftChangeSourceRef.current = "external";
      return;
    }

    setEditorMarkdown(composerEditor, draft);
  }, [composerEditor, composerReady, draft]);

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
    if (!selectedSessionId) {
      pendingInitialScrollSessionRef.current = null;
      setNearBottom(true);
      return;
    }

    pendingInitialScrollSessionRef.current = selectedSessionId;
    setNearBottom(true);
  }, [selectedSessionId]);

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
    if (pendingInitialScrollSessionRef.current !== selectedSessionId) {
      return;
    }

    const waitingForServerMessages = Boolean(sessionMessages.data?.length && messages.length === 0);
    if (sessionMessages.isLoading || waitingForServerMessages) {
      return;
    }

    setNearBottom(true);
    let innerFrameId: number | null = null;
    const frameId = window.requestAnimationFrame(() => {
      innerFrameId = window.requestAnimationFrame(() => {
        if (pendingInitialScrollSessionRef.current !== selectedSessionId) {
          return;
        }

        scrollToBottom("auto");
        pendingInitialScrollSessionRef.current = null;
      });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      if (innerFrameId !== null) {
        window.cancelAnimationFrame(innerFrameId);
      }
    };
  }, [messages, scrollToBottom, selectedSessionId, sessionMessages.data, sessionMessages.isLoading]);

  const cancelActiveStream = useCallback((sessionId = selectedSessionIdRef.current) => {
    if (!sessionId) {
      return;
    }

    const runtimeSessionId = runtimeSessionIdsRef.current.get(sessionId);
    const currentToken = streamTokensRef.current.get(sessionId) ?? 0;
    streamTokensRef.current.set(sessionId, currentToken + 1);
    abortControllersRef.current.get(sessionId)?.abort();
    abortControllersRef.current.delete(sessionId);
    setActiveStreams((current) => omitRecordKey(current, sessionId));
    clearChatSessionActivity(sessionId);
    updateSessionMessages(sessionId, (current) =>
      current.map((message) =>
        message.status === "streaming"
          ? {
              ...message,
              content: message.content.trim()
                ? `${message.content.trim()}\n\n_[interrupted]_`
                : "_[interrupted]_",
              status: "complete",
            }
          : message,
      ),
    );

    if (runtimeSessionId) {
      void interruptRuntimeSession(runtimeSessionId).catch((error) => {
        toast.error(`停止失败：${errorMessage(error)}`);
      });
    }
  }, []);

  function handleNewChat() {
    setSelectedSession(null);
    setComposerDraft("");
    setSendError(null);
    setNearBottom(true);
  }

  function handleSubmit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    const prompt = readComposerDraft().trim();
    if (!prompt) {
      return;
    }

    if (runLocalCommand(prompt)) {
      setComposerDraft("");
      return;
    }

    if (!apiReady) {
      setSendError("本地服务认证仍在读取中。");
      return;
    }

    if (!runtimeReady) {
      setSendError("本地服务还没有就绪，请先启动服务并完成模型配置。");
      return;
    }

    setComposerDraft("");
    setSendError(null);

    if (isStreaming) {
      if (selectedSessionId) {
        queuePrompt(selectedSessionId, prompt);
      }
      return;
    }

    void sendPrompt(prompt, selectedSessionId ?? undefined);
  }

  async function sendPrompt(prompt: string, preferredSessionId?: string, options: SendPromptOptions = {}) {
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

    let sessionIdForRun = options.forceNewSession ? null : preferredSessionId ?? selectedSessionIdRef.current;
    let token = 0;
    let shouldRunQueuedPrompt = false;

    try {
      let transientSessionId: string | undefined;
      if (!sessionIdForRun) {
        const session = await createChatSession(prompt);
        sessionIdForRun = session.storedSessionId;
        transientSessionId = session.sessionId;
      }

      const sessionId = sessionIdForRun;
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
      markChatSessionGenerating(sessionId);

      const controller = new AbortController();
      abortControllersRef.current.set(sessionId, controller);

      const stream = streamRuntimeSessionChat({
        message: prompt,
        sessionId,
        onRuntimeSession: (runtimeSessionId, storedSessionId) => {
          runtimeSessionIdsRef.current.set(storedSessionId, runtimeSessionId);
        },
        signal: controller.signal,
        transientSessionId,
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

        if (streamEvent.sessionId) {
          runtimeSessionIdsRef.current.set(sessionId, streamEvent.sessionId);
        }

        const streamError = streamEventError(streamEvent);
        if (streamError) {
          throw new Error(streamError);
        }

        const usageUpdate = streamEventUsage(streamEvent);
        if (usageUpdate) {
          updateSessionUsage(sessionId, usageUpdate);
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

        if (isDoneEvent(streamEvent)) {
          const finalText = streamEventFinalText(streamEvent);
          if (!receivedContent && finalText) {
            receivedContent = true;
            appendAssistantDelta(sessionId, assistantMessage.id, finalText);
          }
          break;
        }

        const delta = streamEventText(streamEvent);
        if (delta) {
          receivedContent = true;
          appendAssistantDelta(sessionId, assistantMessage.id, delta);
          continue;
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
        const hasQueuedPrompt = Boolean(queuedPromptsRef.current[completedSessionId]?.length);
        if (!(shouldRunQueuedPrompt && hasQueuedPrompt)) {
          markChatSessionFinished(completedSessionId, selectedSessionIdRef.current === completedSessionId);
        }
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

  function updateSessionUsage(sessionId: string, usage: ChatUsageStats) {
    setUsageBySession((current) => ({
      ...current,
      [sessionId]: mergeUsageStats(current[sessionId], usage),
    }));
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

    const [rawCommand = ""] = normalized.slice(1).split(/\s+/);
    const command = rawCommand.toLowerCase();

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

    return false;
  }

  function applyCommand(command: LocalCommand) {
    setComposerDraft(command.insertText);
    setActiveCommandIndex(0);
    window.requestAnimationFrame(() => composerEditor.focus());
  }

  function handleComposerKeyDown({ event }: { event: KeyboardEvent }) {
    if (showCommandMenu) {
      if (event.key === "ArrowDown") {
        setActiveCommandIndex((current) => (current + 1) % filteredCommands.length);
        return true;
      }

      if (event.key === "ArrowUp") {
        setActiveCommandIndex((current) => (current - 1 + filteredCommands.length) % filteredCommands.length);
        return true;
      }

      if (event.key === "Tab" || event.key === "Enter") {
        const command = filteredCommands[activeCommandIndex];
        if (command) {
          applyCommand(command);
        }
        return true;
      }

      if (event.key === "Escape") {
        setActiveCommandIndex(0);
        setComposerDraft("");
        return true;
      }
    }

    return false;
  }

  function handleComposerPressEnter({ event }: { event: KeyboardEvent }) {
    if (showCommandMenu || event.shiftKey) {
      return false;
    }

    handleSubmit();
    return true;
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
    const title = titleFromPrompt(prompt);
    const session = await createRuntimeTuiSession();
    const now = new Date().toISOString();
    runtimeSessionIdsRef.current.set(session.storedSessionId, session.sessionId);
    const storedSession: HermesSession = {
      id: session.storedSessionId,
      source: "desktop-chat",
      title,
      created_at: now,
      updated_at: now,
    };
    setSelectedSession(session.storedSessionId, true);
    queryClient.setQueryData<HermesSession[]>(
      ashQueryKeys.sessions(apiUrl, Boolean(sessionToken)),
      (current) => mergeSession(current, storedSession),
    );
    return session;
  }

  async function refreshChatQueries(sessionId: string) {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ashQueryKeys.sessions(apiUrl, Boolean(sessionToken)) }),
      queryClient.invalidateQueries({
        queryKey: ashQueryKeys.sessionMessages(apiUrl, Boolean(sessionToken), sessionId),
      }),
    ]);
  }

  useEffect(() => {
    const pendingPrompt = readPendingChatPrompt(location.state);
    if (!pendingPrompt) {
      return;
    }

    const pendingKey = `${location.key}:${pendingPrompt}`;
    if (handledPendingPromptRef.current === pendingKey) {
      return;
    }

    handledPendingPromptRef.current = pendingKey;
    navigate(chatPathForSession(null), { replace: true, state: null });
    setComposerDraft("");
    setSendError(null);
    void sendPrompt(pendingPrompt, undefined, { forceNewSession: true });
  }, [location.key, location.state, navigate, setComposerDraft]);

  return (
    <div className="flex h-full min-h-0 bg-card">
      <section className="flex min-w-0 flex-1 flex-col bg-card">
        <div ref={scrollRef} onScroll={handleScroll} className="relative min-h-0 flex-1 overflow-auto">
          <div className="mx-auto flex min-h-full w-full max-w-[900px] flex-col px-5 pb-8 pt-7">
            {messages.length === 0 && !sessionMessages.isLoading ? (
              <ChatEmptyState onUsePrompt={setComposerDraft} />
            ) : (
              <div className="space-y-6">
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
        </div>

        <form onSubmit={handleSubmit} className="shrink-0 bg-gradient-to-t from-card via-card/95 to-card/0 px-5 pb-4 pt-3">
          <div className="mx-auto w-full max-w-[900px]">
            {sendError ? (
              <div className="mb-3 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm leading-5 text-destructive">
                {sendError}
              </div>
            ) : null}
            <div className="relative">
              {showCommandMenu ? (
                <CommandMenu
                  activeIndex={activeCommandIndex}
                  commands={filteredCommands}
                  onSelect={applyCommand}
                  onHover={setActiveCommandIndex}
                />
              ) : null}
              <ComposerResizeHandle
                onMouseDown={composerResize.handleMouseDown}
                onPointerDown={composerResize.handlePointerDown}
              />
              <ChatInput
                resize={false}
                minHeight={composerResize.height}
                maxHeight={360}
                onBodyClick={() => composerEditor.focus()}
                className="!overflow-hidden !rounded-2xl !border !border-border/70 !bg-card !shadow-[0_18px_55px_rgba(15,23,42,0.10)] focus-within:!border-primary/35 focus-within:!ring-2 focus-within:!ring-primary/10 dark:!shadow-[0_18px_55px_rgba(0,0,0,0.32)]"
                classNames={{
                  body: "!bg-card !px-0 !py-0",
                  footer: "!bg-card !px-0",
                  header: "!bg-card !px-0",
                }}
                styles={{
                  body: {
                    height: composerResize.height,
                    overflow: "auto",
                  },
                  footer: {
                    width: "100%",
                  },
                  header: {
                    width: "100%",
                  },
                }}
                header={(
                  <div className="flex items-center justify-between gap-3 px-3 pb-1 pt-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <button
                        type="button"
                        className="flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        onClick={() => {
                          setComposerDraft((current) => current.trimStart().startsWith("/") ? current : "/");
                          window.requestAnimationFrame(() => composerEditor.focus());
                        }}
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                        命令
                      </button>
                      {queuedPrompts.length > 0 ? (
                        <Badge className="rounded-md bg-muted text-muted-foreground">队列 {queuedPrompts.length}</Badge>
                      ) : null}
                    </div>
                    <div className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground sm:flex">
                      <CornerDownLeft className="h-3.5 w-3.5" />
                      Enter 发送
                    </div>
                  </div>
                )}
                footer={(
                  <div className="flex items-center justify-between gap-3 px-3 pb-3 pt-1">
                    <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                      <span className="min-w-0 truncate">
                        {isStreaming ? "正在生成，新的消息会加入队列。" : "支持富文本粘贴，Shift Enter 换行"}
                      </span>
                      {contextUsage ? (
                        <>
                          <span className="hidden h-3 w-px shrink-0 bg-border/80 sm:block" />
                          <ContextUsageIndicator usage={contextUsage} />
                        </>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {isStreaming ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label="停止生成"
                          className="h-9 w-9"
                          onClick={() => cancelActiveStream()}
                        >
                          <Square className="h-3.5 w-3.5 fill-current" />
                        </Button>
                      ) : null}
                      <Button
                        type="submit"
                        size="icon"
                        aria-label={isStreaming ? "加入队列" : "发送"}
                        className="h-9 w-9"
                        disabled={!canSubmit}
                      >
                        <SendHorizontal className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              >
                <Editor
                  autoFormatMarkdown
                  content={draft}
                  debounceWait={0}
                  editable={apiReady && runtimeReady}
                  editor={composerEditor}
                  enablePasteMarkdown
                  markdownOption
                  onChange={updateDraftFromEditor}
                  onInit={() => setComposerReady(true)}
                  onKeyDown={handleComposerKeyDown}
                  onPressEnter={handleComposerPressEnter}
                  onTextChange={updateDraftFromEditor}
                  pasteMarkdownAutoConvertThreshold={3}
                  placeholder={runtimeReady ? "给 Ash 发消息，输入 / 可使用本地命令" : "本地服务就绪后可以开始聊天"}
                  plugins={composerEditorPlugins}
                  style={{
                    height: composerResize.height,
                    minHeight: composerResize.height,
                  }}
                  type="text"
                  variant="chat"
                  className="ash-composer-editor ash-composer-editor-chat h-full px-4 py-2 text-[15px] leading-6 text-foreground outline-none"
                  theme={{
                    fontSize: 15,
                    lineHeight: 1.55,
                    marginMultiple: 0.45,
                  }}
                />
              </ChatInput>
            </div>
          </div>
        </form>
      </section>
    </div>
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
    <article className={cn("group/message flex gap-3 py-1", messageTransitionClasses[transitionMode])}>
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Bot className="h-4 w-4" />
      </div>
      <div className="min-w-0 max-w-[min(760px,calc(100%-44px))] flex-1">
        <MessageAuthorLabel />
        <div
          className={cn(
            "wrap-anywhere text-pretty text-[15px] leading-7 text-foreground",
            errors.length > 0 && "rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2",
          )}
        >
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
        {copyableContent ? <MessageActions align="left" onCopy={() => onCopy(copyableContent)} /> : null}
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
  const parsedThinking = parseThinking(message.content, message.status === "streaming");
  const reasoningText = [message.reasoning, ...parsedThinking.segments, parsedThinking.pending]
    .filter((part): part is string => typeof part === "string" && part.trim() !== "")
    .join("\n\n");
  const displayContent = isUser ? message.content : parsedThinking.body;
  const shouldRenderAssistantContent = isUser || displayContent.trim() || !reasoningText.trim();

  return (
    <article
      className={cn(
        "group/message flex gap-3 py-1",
        isUser && "justify-end",
        messageTransitionClasses[transitionMode],
      )}
    >
      {!isUser ? (
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Bot className="h-4 w-4" />
        </div>
      ) : null}
      <div className={cn("min-w-0 max-w-[min(72%,680px)]", !isUser && "max-w-[min(760px,calc(100%-44px))] flex-1")}>
        {!isUser ? <MessageAuthorLabel /> : null}
        <div
          className={cn(
            "wrap-anywhere text-pretty text-[15px] leading-7",
            isUser
              ? "rounded-2xl rounded-tr-md bg-muted px-4 py-2.5 text-foreground"
              : "text-foreground",
            message.status === "error" && "rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2",
          )}
        >
          {isUser ? (
            <MarkdownMessage tone="user">{message.content}</MarkdownMessage>
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
        {message.content.trim() ? <MessageActions align={isUser ? "right" : "left"} onCopy={onCopy} /> : null}
      </div>
    </article>
  );
}

function MessageAuthorLabel() {
  return (
    <div className="mb-1 flex items-center gap-2 text-[13px] font-medium leading-5 text-foreground">
      <span>Ash</span>
      <span className="text-xs font-normal text-muted-foreground">AI</span>
    </div>
  );
}

function MessageActions({ align, onCopy }: { align: "left" | "right"; onCopy: () => void }) {
  return (
    <div
      className={cn(
        "mt-1 flex opacity-0 transition-opacity duration-150 group-hover/message:opacity-100 focus-within:opacity-100",
        align === "right" ? "justify-end" : "justify-start",
      )}
    >
      <button
        type="button"
        onClick={onCopy}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
        title="复制"
        aria-label="复制消息"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function ContextUsageIndicator({ usage }: { usage: ChatUsageStats }) {
  const contextMax = usage.contextMax ?? 0;
  const hasContextWindow = contextMax > 0;
  const percent = hasContextWindow
    ? clampPercent(usage.contextPercent ?? ((usage.contextUsed ?? usage.total) / contextMax) * 100)
    : null;
  const filledSegments = percent === null ? 0 : Math.round((percent / 100) * 10);
  const label = usageContextLabel(usage);

  if (!label) {
    return null;
  }

  return (
    <div
      className="hidden shrink-0 items-center gap-1.5 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground/75 sm:flex"
      title={hasContextWindow ? `上下文占用 ${label}，${Math.round(percent ?? 0)}%` : `本会话已用 ${label}`}
    >
      <span className="text-muted-foreground/60">上下文</span>
      <span>{label}</span>
      {hasContextWindow ? (
        <>
          <span className="grid w-10 grid-cols-10 gap-px" aria-hidden="true">
            {Array.from({ length: 10 }, (_, index) => (
              <span
                key={index}
                className={cn(
                  "h-2 rounded-[1px] bg-muted-foreground/18",
                  index < filledSegments && "bg-muted-foreground/50",
                )}
              />
            ))}
          </span>
          <span>{Math.round(percent ?? 0)}%</span>
        </>
      ) : null}
    </div>
  );
}

function ThinkingBlock({ content, streaming }: { content: string; streaming: boolean }) {
  const [expandedOverride, setExpandedOverride] = useState<boolean | null>(null);
  const expanded = streaming || expandedOverride === true;
  const characterCount = [...content].length;

  return (
    <div className="mb-2 text-xs text-muted-foreground/70">
      <button
        type="button"
        className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-md px-1.5 text-left transition-colors hover:bg-muted/70 hover:text-foreground"
        onClick={() => setExpandedOverride((current) => !(current ?? false))}
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <Brain className="h-3.5 w-3.5" />
        <span>{streaming ? "正在思考" : "思考过程"}</span>
        <span className="tabular-nums text-muted-foreground/60">{characterCount} 字</span>
      </button>
      {expanded ? (
        <div className="mt-1 border-l border-border/70 pl-3 text-xs leading-5 text-muted-foreground">
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
  const expanded = expandedOverride === true;
  const latestMessage = messages[messages.length - 1];
  const statusText = hasRunningTool
    ? "正在使用工具"
    : errorCount > 0
      ? `${errorCount} 个调用失败`
      : `${messages.length} 个工具`;
  const latestPreview = latestMessage?.toolPreview?.trim();

  return (
    <div className="my-2 max-w-[720px] text-xs text-muted-foreground/70">
      <button
        type="button"
        className={cn(
          "flex min-h-7 w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 text-left transition-colors hover:bg-muted/70 hover:text-foreground",
          expanded && "bg-muted/50 text-foreground",
        )}
        onClick={() => setExpandedOverride((current) => !(current ?? false))}
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <ToolStatusDot status={hasRunningTool ? "running" : errorCount > 0 ? "error" : "done"} />
        <span className="shrink-0">{statusText}</span>
        {latestMessage ? (
          <span className="min-w-0 truncate text-muted-foreground/60">
            {toolDisplayName(latestMessage.toolName)}
            {latestPreview ? ` · ${latestPreview}` : ""}
          </span>
        ) : null}
      </button>
      {expanded ? (
        <div className="mt-1 space-y-1 border-l border-border/70 pl-3">
          {messages.map((message) => (
            <ToolTraceItem key={message.id} message={message} />
          ))}
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
    <div className="rounded-md py-1 text-muted-foreground">
      <button
        type="button"
        className="group/tool flex w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs transition-colors hover:bg-muted/60 hover:text-foreground"
        onClick={() => hasDetails && setExpanded((current) => !current)}
      >
        {hasDetails
          ? expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
          : <span className="h-3.5 w-3.5" />}
        <ToolStatusDot status={message.toolStatus === "running" ? "running" : message.toolStatus === "error" ? "error" : "done"} />
        <span className="min-w-0 flex-1 truncate">{toolDisplayName(message.toolName)}</span>
        <span className="shrink-0 text-[11px] text-muted-foreground/60">{statusLabel}</span>
      </button>
      {message.toolPreview ? (
        <p className="ml-10 mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground/75">{message.toolPreview}</p>
      ) : null}
      {message.toolDuration ? (
        <p className="ml-10 mt-0.5 text-[11px] text-muted-foreground/55">耗时 {formatToolDuration(message.toolDuration)}</p>
      ) : null}
      {expanded && hasDetails ? (
        <div className="ml-10 mt-2 space-y-2 border-l border-border/70 pl-3">
          {message.toolArgs ? <ToolPayload title="参数" content={message.toolArgs} /> : null}
          {message.toolResult ? <ToolPayload title="结果" content={message.toolResult} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function ToolStatusDot({ status }: { status: "done" | "error" | "running" }) {
  return (
    <span
      className={cn(
        "h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/35",
        status === "running" && "animate-pulse bg-emerald-500/70",
        status === "error" && "bg-destructive/80",
      )}
    />
  );
}

function ToolPayload({ content, title }: { content: string; title: string }) {
  const formatted = formatJsonLikeText(content);
  return (
    <div>
      <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">{title}</div>
      <pre className="max-h-44 overflow-auto rounded-md border border-border/60 bg-muted/20 px-2 py-1.5 text-[11px] leading-5 text-muted-foreground">
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
    <div className="absolute bottom-full left-3 z-20 mb-2 w-[320px] overflow-hidden rounded-lg border border-border bg-popover shadow-[var(--ash-shadow-popover)]">
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
    <div className="ml-11 mt-5 max-w-[560px] rounded-lg border border-border/70 bg-background/70 p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", isStreaming ? "animate-pulse bg-emerald-500" : "bg-muted-foreground")} />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium text-foreground">
              {isStreaming ? "正在生成" : "等待下一条消息"}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {queuedPrompts.length > 0 ? `${queuedPrompts.length} 条消息在队列中` : "完成后会同步会话。"}
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
        <div className="mt-3 space-y-2 border-t border-border/70 pt-3">
          {queuedPrompts.map((prompt, index) => (
            <div key={prompt.id} className="flex items-center gap-2 rounded-lg bg-muted/45 px-2 py-2">
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
        <div className="mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background text-foreground shadow-sm">
          <Sparkles className="h-5 w-5" />
        </div>
        <h2 className="text-[22px] font-semibold tracking-normal">今天想让 Ash 做什么？</h2>
        <p className="mx-auto mt-2 max-w-[480px] text-sm leading-6 text-muted-foreground">
          可以从一个问题、一个目标，或一段需要整理的上下文开始。
        </p>
        <div className="mt-6 grid gap-2 text-left sm:grid-cols-3">
          {suggestedPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => onUsePrompt(prompt)}
              className="rounded-lg border border-border/70 bg-background/80 px-3 py-3 text-[13px] leading-5 text-foreground shadow-sm transition-colors hover:bg-muted/60"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
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

function buildContextUsage(
  session: HermesSession | null,
  modelInfo: ModelInfoResponse | undefined,
  runtimeUsage: ChatUsageStats | undefined,
): ChatUsageStats | null {
  const sessionUsage = usageStatsFromSession(session);
  const contextMax = positiveUsageNumber(runtimeUsage?.contextMax) ?? modelContextMax(modelInfo);
  const input = runtimeUsage && runtimeUsage.input > 0 ? runtimeUsage.input : sessionUsage.input;
  const output = runtimeUsage && runtimeUsage.output > 0 ? runtimeUsage.output : sessionUsage.output;
  const total = runtimeUsage && runtimeUsage.total > 0
    ? runtimeUsage.total
    : sessionUsage.total > 0
      ? sessionUsage.total
      : input + output;
  const contextUsed = usageNumber(runtimeUsage?.contextUsed) ?? total;
  const contextPercent = usageNumber(runtimeUsage?.contextPercent)
    ?? (contextMax ? (contextUsed / contextMax) * 100 : undefined);

  if (!contextMax && total <= 0) {
    return null;
  }

  return {
    contextMax,
    contextPercent,
    contextUsed,
    input,
    output,
    total,
  };
}

function usageStatsFromSession(session: HermesSession | null): ChatUsageStats {
  if (!isRecord(session)) {
    return {
      input: 0,
      output: 0,
      total: 0,
    };
  }

  const input = readNumber(session, "input_tokens") ?? readNumber(session, "input") ?? 0;
  const output = readNumber(session, "output_tokens") ?? readNumber(session, "output") ?? 0;
  const total = readNumber(session, "total_tokens") ?? readNumber(session, "tokens") ?? input + output;

  return {
    input,
    output,
    total,
  };
}

function modelContextMax(modelInfo: ModelInfoResponse | undefined): number | undefined {
  return positiveUsageNumber(modelInfo?.effective_context_length)
    ?? positiveUsageNumber(modelInfo?.config_context_length)
    ?? positiveUsageNumber(modelInfo?.auto_context_length);
}

function mergeUsageStats(current: ChatUsageStats | undefined, next: ChatUsageStats): ChatUsageStats {
  const contextMax = positiveUsageNumber(next.contextMax) ?? current?.contextMax;
  const contextUsed = usageNumber(next.contextUsed) ?? current?.contextUsed;
  const input = next.input > 0 ? next.input : current?.input ?? 0;
  const output = next.output > 0 ? next.output : current?.output ?? 0;
  const total = next.total > 0 ? next.total : current?.total ?? input + output;
  const contextPercent = usageNumber(next.contextPercent)
    ?? (contextMax && contextUsed !== undefined ? (contextUsed / contextMax) * 100 : current?.contextPercent);

  return {
    contextMax,
    contextPercent,
    contextUsed,
    input,
    output,
    total,
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

function streamEventUsage(event: HermesStreamEvent): ChatUsageStats | null {
  const data = streamEventRecord(event);
  if (!data) {
    return null;
  }

  const nestedUsage = isRecord(data.usage) ? data.usage : null;
  const source = nestedUsage ?? data;
  const tokenRecord = isRecord(source.tokens)
    ? source.tokens
    : isRecord(data.tokens)
      ? data.tokens
      : null;
  const records = tokenRecord ? [source, tokenRecord] : [source];
  const input = readFirstNumber(records, ["input", "input_tokens", "prompt_tokens"]);
  const output = readFirstNumber(records, ["output", "output_tokens", "completion_tokens"]);
  const total = readFirstNumber(records, ["total", "total_tokens", "tokens"]);
  const contextMax = readFirstNumber(records, [
    "context_max",
    "context_length",
    "context_limit",
    "context_window",
    "effective_context_length",
    "model_context_length",
  ]);
  const contextUsed = readFirstNumber(records, ["context_used", "context_tokens", "used_context_tokens"]);
  const contextPercent = readFirstNumber(records, ["context_percent", "context_percentage", "percentage"]);
  const hasUsage = [input, output, total, contextMax, contextUsed, contextPercent].some((value) => value !== null);

  if (!hasUsage) {
    return null;
  }

  const normalizedInput = input ?? 0;
  const normalizedOutput = output ?? 0;
  const normalizedTotal = total ?? normalizedInput + normalizedOutput;

  return {
    contextMax: positiveUsageNumber(contextMax),
    contextPercent: usageNumber(contextPercent),
    contextUsed: usageNumber(contextUsed) ?? normalizedTotal,
    input: normalizedInput,
    output: normalizedOutput,
    total: normalizedTotal,
  };
}

function streamEventToolUpdate(event: HermesStreamEvent): ToolUpdate | null {
  const eventName = streamEventName(event);
  const data = streamEventRecord(event);
  if (!data) {
    return null;
  }

  if (eventName === "tool.started" || eventName === "tool.start" || eventName === "tool.progress" || eventName === "tool.generating") {
    const name = readString(data, "tool") ?? readString(data, "name") ?? "工具调用";
    return {
      id: readToolId(data),
      name,
      preview: readString(data, "preview")
        ?? readString(data, "message")
        ?? readString(data, "context")
        ?? summarizeToolArguments(readString(data, "arguments") ?? readString(data, "args") ?? readString(data, "input")),
      status: "running",
      toolArgs: readString(data, "arguments") ?? readString(data, "args") ?? readString(data, "input") ?? undefined,
    };
  }

  if (eventName === "tool.completed" || eventName === "tool.complete") {
    const name = readString(data, "tool") ?? readString(data, "name") ?? "工具调用";
    const output = readString(data, "output") ?? readString(data, "result") ?? undefined;
    return {
      duration: readNumber(data, "duration") ?? readNumber(data, "duration_seconds") ?? readNumber(data, "duration_s") ?? undefined,
      id: readToolId(data),
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
    || eventName === "tool.start"
    || eventName === "tool.complete"
    || eventName === "tool.progress"
    || eventName === "tool.generating"
    || eventName === "message.complete"
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

function readToolId(data: Record<PropertyKey, unknown>) {
  return (
    readString(data, "tool_id")
    ?? readString(data, "tool_call_id")
    ?? readString(data, "toolCallId")
    ?? readString(data, "id")
    ?? undefined
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

function streamEventFinalText(event: HermesStreamEvent): string {
  if (streamEventName(event) !== "message.complete") {
    return "";
  }

  const data = streamEventRecord(event);
  if (!data) {
    return "";
  }

  return normalizeEscapedText(readString(data, "text") ?? readString(data, "content") ?? "");
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
    || eventName === "message.complete"
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
    || "context_max" in data
    || "context_percent" in data
    || "context_used" in data
    || "duration_seconds" in data
    || "exit_reason" in data
    || "tokens" in data
    || "tool_trace" in data
    || "total_duration_seconds" in data
    || "usage" in data
  );
}

function usageContextLabel(usage: ChatUsageStats): string {
  if (usage.contextMax) {
    return `${formatCompactTokenCount(usage.contextUsed ?? usage.total)}/${formatCompactTokenCount(usage.contextMax)}`;
  }

  return usage.total > 0 ? `${formatCompactTokenCount(usage.total)} tok` : "";
}

function formatCompactTokenCount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0";
  }

  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }

  return String(Math.round(value));
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, value));
}

function readFirstNumber(records: Record<PropertyKey, unknown>[], keys: string[]): number | null {
  for (const record of records) {
    for (const key of keys) {
      const value = readNumber(record, key);
      if (value !== null) {
        return value;
      }
    }
  }

  return null;
}

function positiveUsageNumber(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function usageNumber(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
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

function titleFromPrompt(prompt: string): string {
  return prompt.replace(/\s+/g, " ").slice(0, 36) || "新对话";
}

function readEditorMarkdown(editor: LobeEditor): string {
  try {
    const content = editor.getDocument("markdown");
    return typeof content === "string" ? content : "";
  } catch {
    return "";
  }
}

function setEditorMarkdown(editor: LobeEditor, markdown: string) {
  try {
    if (markdown.trim()) {
      editor.setDocument("markdown", markdown);
      return;
    }

    editor.cleanDocument();
  } catch (error) {
    console.error("Failed to sync chat editor content", error);
  }
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

function createMessageId(prefix: string): string {
  const randomId = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(16).slice(2);
  return `${prefix}-${Date.now()}-${randomId}`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
