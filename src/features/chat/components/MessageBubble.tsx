import type { ReactNode } from "react";
import { Bot, Copy, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkdownMessage } from "@/features/chat/components/MarkdownMessage";
import type { ChatMessage } from "@/features/chat/types";
import { cn } from "@/lib/utils";

interface MessageBubbleProps {
  message: ChatMessage;
  onCopy: () => void;
  onRetry: () => void;
}

export function MessageBubble({ message, onCopy, onRetry }: MessageBubbleProps) {
  if (message.role === "user") {
    return (
      <article className="flex justify-end">
        <div className="max-w-[58%] rounded-xl bg-muted px-3 py-2 text-[13px] leading-[1.65] text-foreground">
          <MarkdownMessage>{message.content}</MarkdownMessage>
        </div>
      </article>
    );
  }

  return (
    <article className="group flex gap-2.5 py-2">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[radial-gradient(circle_at_35%_30%,#7dd3fc,#2563eb_48%,#111827)] text-white shadow-sm">
        <Bot className="h-3.5 w-3.5" strokeWidth={2.2} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-center gap-2 leading-none">
          <span className="text-[13px] font-semibold">Hermes</span>
          {message.streaming ? <span className="text-[11px] text-muted-foreground">正在生成</span> : null}
        </div>
        <div
          className={cn(
            "max-w-[880px] text-[14px] leading-[1.75]",
            message.error ? "text-destructive" : "text-foreground",
          )}
        >
          <MarkdownMessage streaming={message.streaming}>
            {message.content || (message.streaming ? "正在整理结果" : "")}
          </MarkdownMessage>
        </div>
        <div className="mt-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <ActionButton
            label="复制"
            icon={<Copy className="h-3.5 w-3.5" />}
            onClick={onCopy}
            disabled={!message.content.trim()}
          />
          <ActionButton
            label="重新生成"
            icon={<RotateCcw className="h-3.5 w-3.5" />}
            onClick={onRetry}
            disabled={message.streaming}
          />
        </div>
      </div>
    </article>
  );
}

function ActionButton({
  disabled,
  icon,
  label,
  onClick,
}: {
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="h-6 w-6 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {icon}
    </Button>
  );
}
