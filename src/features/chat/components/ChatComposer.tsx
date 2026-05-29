import type { KeyboardEvent, ReactNode } from "react";
import { AtSign, Expand, Globe2, ImageIcon, Loader2, Paperclip, RotateCcw, Send, Sparkles, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { HermesModel, HermesSession } from "@/lib/hermes/types";
import type { ChatMessage } from "@/features/chat/types";

interface ChatComposerProps {
  activeSession: HermesSession | null;
  apiReady: boolean;
  input: string;
  isStreaming: boolean;
  messages: ChatMessage[];
  modelError: unknown;
  models: HermesModel[];
  modelsLoading: boolean;
  selectedModel: string;
  onInputChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onRetry: () => void;
  onSelectedModelChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
}

export function ChatComposer({
  activeSession,
  apiReady,
  input,
  isStreaming,
  messages,
  modelError,
  models,
  modelsLoading,
  selectedModel,
  onInputChange,
  onKeyDown,
  onRetry,
  onSelectedModelChange,
  onSend,
  onStop,
}: ChatComposerProps) {
  const hasMessages = messages.length > 0;

  return (
    <div className="w-full">
      <div className="mx-auto w-full max-w-[880px]">
        <div className="rounded-2xl border border-border bg-card p-2.5 shadow-[var(--hermes-shadow-panel)]">
          <Textarea
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="提问、搜索或头脑风暴。@ 召唤其他智能体加入。"
            className="min-h-[60px] resize-none border-0 bg-transparent px-1.5 py-0 text-[14px] leading-6 shadow-none focus-visible:ring-0"
            disabled={isStreaming || !apiReady}
          />

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <ToolButton label="附件" icon={<Paperclip className="h-3.5 w-3.5" />} />
              <ToolButton label="提及" icon={<AtSign className="h-3.5 w-3.5" />} />
              <ToolButton label="指令" text="/" />
              <ToolButton label="图片" icon={<ImageIcon className="h-3.5 w-3.5" />} />
            </div>

            <div className="flex items-center gap-1.5">
              <label className="inline-flex h-7 items-center gap-1.5 rounded-full px-2 text-[12px] text-muted-foreground">
                {modelsLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                <select
                  value={selectedModel}
                  onChange={(event) => onSelectedModelChange(event.target.value)}
                  className="max-w-[150px] bg-transparent text-[12px] text-muted-foreground outline-none"
                  aria-label="选择模型"
                >
                  <option value="">GPT-5.4 mini</option>
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.id}
                    </option>
                  ))}
                </select>
              </label>
              <ToolButton label="网络" icon={<Globe2 className="h-3.5 w-3.5" />} />
              <ToolButton label="展开输入框" icon={<Expand className="h-3.5 w-3.5" />} />
              {isStreaming ? (
                <Button variant="outline" size="icon" onClick={onStop} aria-label="停止" className="h-8 w-8 rounded-full">
                  <Square className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button
                  size="icon"
                  onClick={onSend}
                  disabled={!apiReady || !input.trim()}
                  aria-label="发送"
                  className="h-8 w-8 rounded-full bg-[#1f1f1f] text-white hover:bg-black"
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        </div>

        {hasMessages ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onRetry}
              disabled={isStreaming || !messages.some((message) => message.role === "user")}
              className="ml-auto"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              重试
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ToolButton({
  icon,
  label,
  text,
}: {
  icon?: ReactNode;
  label: string;
  text?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {icon ?? <span className="text-[13px] font-medium">{text}</span>}
    </button>
  );
}
