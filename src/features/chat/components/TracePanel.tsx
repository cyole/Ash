import { Check, Clock3, PanelRightClose } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatSessionTime, sessionMessageCount } from "@/lib/hermes/session-format";
import type { HermesSession } from "@/lib/hermes/types";
import type { ChatMessage, TraceItem } from "@/features/chat/types";
import { PanelNotice } from "@/features/chat/components/PanelNotice";

interface TracePanelProps {
  activeSession: HermesSession | null;
  messages: ChatMessage[];
  onClose: () => void;
  traces: TraceItem[];
}

export function TracePanel({ activeSession, messages, onClose, traces }: TracePanelProps) {
  return (
    <aside className="flex min-h-0 flex-col bg-sidebar">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/70 px-3">
        <div>
          <div className="text-sm font-semibold">运行时事件</div>
          <div className="text-[11px] text-muted-foreground">
            {activeSession ? `${sessionMessageCount(activeSession) ?? messages.length} 条消息` : "等待会话"}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="关闭运行时事件面板"
            className="h-7 w-7 rounded-full"
          >
            <PanelRightClose className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {traces.length > 0 ? (
          <div className="relative space-y-2.5 pl-3 before:absolute before:left-[7px] before:top-2 before:h-[calc(100%-16px)] before:w-px before:bg-border">
            {traces.map((trace) => (
              <div key={trace.id} className="relative pl-5">
                <span className="absolute left-[-1px] top-3 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-sidebar">
                  {trace.status === "done" ? (
                    <Check className="h-2.5 w-2.5 text-emerald-600" />
                  ) : trace.status === "error" ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  )}
                </span>
                <div className="rounded-lg border border-border/80 bg-card/85 p-2 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-xs font-medium">{trace.label}</div>
                    <TraceBadge status={trace.status} />
                  </div>
                  <div className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">{trace.detail}</div>
                  <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock3 className="h-3 w-3" />
                    {formatSessionTime(trace.createdAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <PanelNotice
            icon={<Clock3 className="h-4 w-4" />}
            title="暂无事件"
            description="发送消息后会显示流式运行、工具调用和错误。"
          />
        )}
      </div>
    </aside>
  );
}

function TraceBadge({ status }: { status: TraceItem["status"] }) {
  if (status === "running") {
    return <Badge className="border-blue-200 bg-blue-50 text-blue-700">运行中</Badge>;
  }

  if (status === "error") {
    return <Badge className="border-destructive/30 bg-destructive/10 text-destructive">失败</Badge>;
  }

  return <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">完成</Badge>;
}
