import type { ReactNode } from "react";
import { Bot, Copy, FileText, ImageIcon, RotateCcw, TerminalSquare, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { roleLabel } from "@/features/chat/chat-utils";
import { MarkdownMessage } from "@/features/chat/components/MarkdownMessage";
import type { ChatAttachment, ChatMessage, ChatRole } from "@/features/chat/types";
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
        <div className="max-w-[66%] rounded-xl bg-muted px-3 py-2 text-[13px] leading-[1.65] text-foreground">
          {message.attachments?.length ? <MessageAttachments attachments={message.attachments} compact /> : null}
          {message.content ? <MarkdownMessage>{message.content}</MarkdownMessage> : null}
        </div>
      </article>
    );
  }

  const role = message.role;

  return (
    <article className="group flex gap-2.5 py-2">
      <div
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white shadow-sm",
          role === "assistant" && "bg-[radial-gradient(circle_at_35%_30%,#7dd3fc,#2563eb_48%,#111827)]",
          role === "system" && "bg-muted text-muted-foreground",
          role === "tool" && "bg-emerald-600",
          role === "command" && "bg-zinc-800",
        )}
      >
        <RoleIcon role={role} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-center gap-2 leading-none">
          <span className="text-[13px] font-semibold">{roleLabel(message.role)}</span>
          {message.streaming ? <span className="text-[11px] text-muted-foreground">正在生成</span> : null}
        </div>
        {message.attachments?.length ? <MessageAttachments attachments={message.attachments} /> : null}
        {message.reasoning ? (
          <div className="mb-2 max-w-[820px] rounded-md border border-border bg-muted/45 px-3 py-2 text-[12px] leading-5 text-muted-foreground">
            <div className="mb-1 font-medium text-foreground/80">思考</div>
            <MarkdownMessage streaming={message.streaming}>{message.reasoning}</MarkdownMessage>
          </div>
        ) : null}
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

function RoleIcon({ role }: { role: ChatRole }) {
  if (role === "tool") {
    return <Wrench className="h-3.5 w-3.5" strokeWidth={2.2} />;
  }

  if (role === "command") {
    return <TerminalSquare className="h-3.5 w-3.5" strokeWidth={2.2} />;
  }

  return <Bot className="h-3.5 w-3.5" strokeWidth={2.2} />;
}

function MessageAttachments({
  attachments,
  compact = false,
}: {
  attachments: ChatAttachment[];
  compact?: boolean;
}) {
  return (
    <div className={cn("mb-2 flex flex-wrap gap-2", compact && "justify-end")}>
      {attachments.map((attachment) => {
        const image = attachment.type.startsWith("image/") && attachment.url;

        return (
          <div
            key={attachment.id}
            className={cn(
              "overflow-hidden rounded-md border border-border bg-card text-left shadow-sm",
              image ? "w-36" : "max-w-[220px]",
            )}
          >
            {image ? (
              <img src={attachment.url} alt={attachment.name} className="h-24 w-full object-cover" />
            ) : null}
            <div className="flex min-w-0 items-center gap-2 px-2 py-1.5">
              {image ? (
                <ImageIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0">
                <div className="truncate text-[12px] font-medium leading-4">{attachment.name}</div>
                <div className="truncate text-[11px] leading-4 text-muted-foreground">
                  {attachment.uploading ? "上传中" : attachment.uploadError || formatSize(attachment.size)}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
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

function formatSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
