import { useState } from "react";
import { Activity, Ellipsis, Loader2, MessageSquarePlus, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatComposer } from "@/features/chat/components/ChatComposer";
import { ChatMessageList } from "@/features/chat/components/ChatMessageList";
import { LobeRuntimeProvider } from "@/features/chat/components/LobeRuntimeProvider";
import { TracePanel } from "@/features/chat/components/TracePanel";
import { useChatWorkspace } from "@/features/chat/hooks/useChatWorkspace";
import { sessionModelLabel, sessionSource, sessionTitle } from "@/lib/hermes/session-format";
import { cn } from "@/lib/utils";

type ChatWorkspace = ReturnType<typeof useChatWorkspace>;

export function ChatPage() {
  const chat = useChatWorkspace();
  const [traceOpen, setTraceOpen] = useState(false);

  return (
    <div className="h-full min-h-0 bg-card">
      <div
        className="grid h-full min-h-0 overflow-hidden bg-card"
        style={{
          gridTemplateColumns: traceOpen ? "minmax(0, 1fr) 292px" : "minmax(0, 1fr)",
        }}
      >
        <section className="flex min-h-0 min-w-0 flex-col bg-card">
          <ChatHeader
            chat={chat}
            traceOpen={traceOpen}
            onToggleTrace={() => setTraceOpen((current) => !current)}
          />
          <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
            <ChatMessageList
              key={chat.activeSessionId ?? "new-session"}
              error={chat.messagesQuery.error}
              loading={chat.messagesQuery.isLoading}
              messages={chat.activeMessages}
              onCopyMessage={(message) => void chat.copyMessage(message)}
              onRetryMessage={chat.retryMessage}
            />
          </div>
          <div className="shrink-0 bg-card px-4 pb-3 pt-1.5">
            <LobeRuntimeProvider>
              <ChatComposer
                key={chat.activeSessionId ?? "new-session"}
                activeSession={chat.activeSession}
                apiReady={chat.apiReady}
                input={chat.input}
                isStreaming={chat.isStreaming}
                modelError={chat.modelsQuery.error}
                models={chat.modelsQuery.data ?? []}
                modelsLoading={chat.modelsQuery.isLoading}
                selectedModel={chat.selectedModel}
                onInputChange={chat.setInput}
                onSelectedModelChange={chat.setSelectedModel}
                onSend={() => void chat.sendMessage()}
                onStop={chat.stopStreaming}
              />
            </LobeRuntimeProvider>
          </div>
        </section>

        {traceOpen ? (
          <TracePanel
            activeSession={chat.activeSession}
            messages={chat.activeMessages}
            traces={chat.activeTraces}
            onClose={() => setTraceOpen(false)}
          />
        ) : null}
      </div>
    </div>
  );
}

function ChatHeader({
  chat,
  onToggleTrace,
  traceOpen,
}: {
  chat: ChatWorkspace;
  onToggleTrace: () => void;
  traceOpen: boolean;
}) {
  const title = chat.activeSession ? sessionTitle(chat.activeSession) : "新会话";
  const source = chat.activeSession ? sessionSource(chat.activeSession) : "desktop";
  const model = chat.activeSession ? sessionModelLabel(chat.activeSession) : chat.selectedModel || "默认模型";

  return (
    <header className="flex h-[var(--hermes-chat-header-height)] shrink-0 items-center justify-between border-b border-border bg-card px-4">
      <div className="flex min-w-0 items-center gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="truncate text-[15px] font-semibold leading-none">{title}</div>
            <Ellipsis className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] leading-none text-muted-foreground">
            <span className="truncate">{source}</span>
            <span className="h-1 w-1 rounded-full bg-border" />
            <span className="truncate">{model}</span>
            <span className="h-1 w-1 rounded-full bg-border" />
            <span className="inline-flex items-center gap-1">
              {chat.apiReady ? null : <Loader2 className="h-3 w-3 animate-spin" />}
              {chat.apiReady ? "运行时就绪" : "正在连接运行时"}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleTrace}
          aria-label={traceOpen ? "收起运行时事件" : "展开运行时事件"}
          className={cn("relative h-7 w-7 rounded-full", traceOpen && "bg-black/[0.055]")}
        >
          <Activity className="h-3.5 w-3.5" />
          {chat.activeTraces.length > 0 ? (
            <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
          ) : null}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void chat.sessionsQuery.refetch()}
          disabled={chat.sessionsQuery.isFetching}
          aria-label="刷新会话"
          className="h-7 w-7 rounded-full"
        >
          {chat.sessionsQuery.isFetching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCcw className="h-3.5 w-3.5" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void chat.createBackendSession()}
          aria-label="新建会话"
          className="h-7 w-7 rounded-full"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </header>
  );
}
