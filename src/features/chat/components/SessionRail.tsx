import { Database, ListTree, Loader2, MessageSquarePlus, RefreshCcw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PanelNotice } from "@/features/chat/components/PanelNotice";
import { errorMessage } from "@/lib/errors";
import {
  formatSessionTime,
  sessionPreview,
  sessionSource,
  sessionTitle,
  sessionUpdatedAt,
} from "@/lib/hermes/session-format";
import type { HermesSession } from "@/lib/hermes/types";
import { cn } from "@/lib/utils";

interface SessionRailProps {
  activeSessionId: string | null;
  apiReady: boolean;
  filter: string;
  loading: boolean;
  refreshing: boolean;
  error: unknown;
  sessions: HermesSession[];
  onCreateSession: () => void;
  onFilterChange: (value: string) => void;
  onRefresh: () => void;
  onSelectSession: (sessionId: string) => void;
}

export function SessionRail({
  activeSessionId,
  apiReady,
  filter,
  loading,
  refreshing,
  error,
  sessions,
  onCreateSession,
  onFilterChange,
  onRefresh,
  onSelectSession,
}: SessionRailProps) {
  return (
    <aside className="flex min-h-0 flex-col border-r border-border/70 bg-sidebar">
      <div className="flex h-[56px] shrink-0 items-center justify-between border-b border-border/70 px-3">
        <div>
          <div className="text-sm font-semibold">会话列表</div>
          <div className="text-[11px] text-muted-foreground">{sessions.length} 个会话</div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={onRefresh} disabled={refreshing} aria-label="刷新会话">
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={onCreateSession} aria-label="新建会话">
            <MessageSquarePlus className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="列表视图">
            <ListTree className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="border-b border-border/70 p-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(event) => onFilterChange(event.target.value)}
            placeholder="搜索会话..."
            className="h-9 bg-background/80 pl-9 text-sm"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-1.5">
        {loading ? (
          <PanelNotice icon={<Loader2 className="h-4 w-4 animate-spin" />} title="正在加载会话" />
        ) : sessions.length > 0 ? (
          <div className="space-y-1.5">
            {sessions.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => onSelectSession(session.id)}
                className={cn(
                  "w-full rounded-lg border border-transparent px-2.5 py-2 text-left transition-all hover:border-border/70 hover:bg-card/85 hover:shadow-sm",
                  activeSessionId === session.id && "border-primary/20 bg-primary/10 shadow-sm shadow-primary/5",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate text-sm font-medium">{sessionTitle(session)}</div>
                  {session.id.startsWith("draft-") ? <Badge>草稿</Badge> : null}
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{sessionSource(session)}</span>
                  <span className="h-1 w-1 rounded-full bg-border" />
                  <span>{formatSessionTime(sessionUpdatedAt(session))}</span>
                </div>
                {sessionPreview(session) ? (
                  <div className="mt-1 truncate text-xs text-muted-foreground">{sessionPreview(session)}</div>
                ) : null}
              </button>
            ))}
          </div>
        ) : !apiReady ? (
          <PanelNotice icon={<Loader2 className="h-4 w-4 animate-spin" />} title="正在连接本地 API" />
        ) : (
          <PanelNotice
            icon={<Database className="h-4 w-4" />}
            title={error ? "会话暂不可用" : "暂无会话"}
            description={error ? errorMessage(error) : "创建新会话后开始发送任务。"}
          />
        )}
      </div>
    </aside>
  );
}
