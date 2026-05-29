import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, ChevronLeft, ChevronRight, Clock3, HardDrive, Plus, X } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { hermesQueryKeys, useHermesApi } from "@/lib/hermes/queries";
import { sessionTitle } from "@/lib/hermes/session-format";
import { cn } from "@/lib/utils";

const routeTitles: Record<string, string> = {
  "/": "首页",
  "/chat": "新会话",
  "/sessions": "会话",
  "/tasks": "任务",
  "/jobs": "作业",
  "/files": "文件",
  "/models": "模型",
  "/extensions": "扩展",
  "/settings": "设置",
};

export function StatusBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { apiKey, apiReady, apiUrl, client } = useHermesApi();
  const hasApiKey = Boolean(apiKey);
  const sessionId = new URLSearchParams(location.search).get("session");

  const sessionsQuery = useQuery({
    queryKey: hermesQueryKeys.sessions(apiUrl, hasApiKey),
    queryFn: () => client.listSessions(),
    enabled: apiReady && location.pathname === "/chat",
    retry: false,
  });

  const title = useMemo(() => {
    if (location.pathname === "/chat" && sessionId) {
      const session = sessionsQuery.data?.find((item) => item.id === sessionId);
      return session ? sessionTitle(session) : "新会话";
    }

    return routeTitles[location.pathname] ?? "Hermes";
  }, [location.pathname, sessionId, sessionsQuery.data]);

  return (
    <header className="flex h-[var(--hermes-titlebar-height)] shrink-0 select-none items-center justify-between bg-background text-muted-foreground">
      <div className="h-full w-[132px] shrink-0" data-tauri-drag-region />

      <div className="flex min-w-0 flex-1 items-center gap-1.5 px-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full" onClick={() => navigate(-1)} aria-label="返回">
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full" onClick={() => navigate(1)} aria-label="前进">
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" asChild className="h-6 w-6 rounded-full" aria-label="会话历史">
            <Link to="/sessions">
              <Clock3 className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>

        <div className="flex h-7 min-w-[190px] max-w-[300px] items-center gap-2 rounded-lg bg-card px-2.5 text-foreground shadow-sm">
          <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#7dd3fc,#2563eb_48%,#111827)] text-white">
            <Bot className="h-2.5 w-2.5" />
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{title}</span>
          <button
            type="button"
            aria-label="关闭标签"
            className="flex h-[18px] w-[18px] items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </div>

        <Button variant="ghost" size="icon" asChild className="h-6 w-6 rounded-full" aria-label="新建聊天">
          <Link to="/chat">
            <Plus className="h-3.5 w-3.5" />
          </Link>
        </Button>

        <div className="h-full min-w-4 flex-1" data-tauri-drag-region />
      </div>

      <div
        aria-label={apiReady ? "已连接到网关" : "正在连接网关"}
        title={apiReady ? "已连接到网关" : "正在连接网关"}
        className="relative mr-3 flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/5"
        role="status"
      >
        <HardDrive className="h-3.5 w-3.5" />
        <span
          className={cn(
            "absolute bottom-0.5 right-0.5 h-2 w-2 rounded-full border-2 border-background",
            apiReady ? "bg-green-500" : "bg-muted-foreground",
          )}
        />
      </div>
    </header>
  );
}
