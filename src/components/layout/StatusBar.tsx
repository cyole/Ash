import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleAlert, Loader2, MoreHorizontal } from "lucide-react";
import { useLocation, useSearchParams } from "react-router";
import { chatSessionSearchParam } from "@/features/chat/chat-route";
import { hermesQueryKeys, useHermesApi } from "@/lib/hermes/queries";
import { sessionTitle } from "@/lib/hermes/session-format";
import { cn } from "@/lib/utils";
import type { HermesStatus } from "@/types/hermes";

const routeTitles: Record<string, string> = {
  "/": "新对话",
  "/tasks": "自动化",
  "/jobs": "作业",
  "/files": "搜索",
  "/models": "模型",
  "/extensions": "插件",
  "/settings": "设置",
};

export function StatusBar() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const selectedSessionId = searchParams.get(chatSessionSearchParam);
  const { apiReady, apiUrl, client, sessionToken, status, tauriRuntime } = useHermesApi();
  const sessions = useQuery({
    enabled: apiReady && location.pathname === "/chat" && Boolean(selectedSessionId),
    queryKey: hermesQueryKeys.sessions(apiUrl, Boolean(sessionToken)),
    queryFn: () => client.listSessions(),
  });
  const selectedSession = sessions.data?.find((session) => session.id === selectedSessionId);
  const title =
    location.pathname === "/chat" ? (selectedSession ? sessionTitle(selectedSession) : "新对话") : (routeTitles[location.pathname] ?? "Hermes");
  const runtimeMeta = runtimeStatusMeta({
    apiReady,
    loading: status.isLoading,
    runtime: status.data,
    runtimeError: status.error,
    tauriRuntime,
  });

  return (
    <header
      className="flex h-[var(--hermes-titlebar-height)] shrink-0 select-none items-center border-b border-black/[0.055] bg-card text-foreground"
      data-tauri-drag-region="deep"
    >
      <div className="flex h-full min-w-0 flex-1 items-center justify-between gap-3 px-5" data-tauri-drag-region="deep">
        <div className="flex min-w-0 items-center gap-2" data-tauri-drag-region="deep">
          <h1 className="min-w-0 max-w-[60vw] truncate text-[14px] font-semibold leading-none">{title}</h1>
          <MoreHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </div>
        <div
          className={cn(
            "flex h-6 shrink-0 items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium",
            runtimeMeta.className,
          )}
          title={runtimeMeta.title}
        >
          {runtimeMeta.icon}
          <span>{runtimeMeta.label}</span>
        </div>
      </div>
    </header>
  );
}

function runtimeStatusMeta({
  apiReady,
  loading,
  runtime,
  runtimeError,
  tauriRuntime,
}: {
  apiReady: boolean;
  loading: boolean;
  runtime?: HermesStatus;
  runtimeError: unknown;
  tauriRuntime: boolean;
}) {
  if (!tauriRuntime) {
    return {
      className: "border-border bg-secondary text-muted-foreground",
      icon: <CircleAlert className="h-3 w-3" />,
      label: "预览模式",
      title: "浏览器预览不会启动本地 Hermes 服务。",
    };
  }

  if (runtimeError) {
    return {
      className: "border-destructive/20 bg-destructive/10 text-destructive",
      icon: <CircleAlert className="h-3 w-3" />,
      label: "检查失败",
      title: "运行时状态读取失败，请打开设置查看日志。",
    };
  }

  if (loading || !runtime || !apiReady) {
    return {
      className: "border-border bg-secondary text-muted-foreground",
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
      label: "检查中",
      title: "正在检查本地 Hermes 服务。",
    };
  }

  if (runtime.dashboardRunning && runtime.sessionTokenConfigured) {
    return {
      className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      icon: <CheckCircle2 className="h-3 w-3" />,
      label: "服务就绪",
      title: `Dashboard ${runtime.apiUrl}${runtime.backendPid ? `, PID ${runtime.backendPid}` : ""}`,
    };
  }

  if (runtime.installed) {
    return {
      className: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      icon: <CircleAlert className="h-3 w-3" />,
      label: "服务已停",
      title: `运行时已安装。日志：${runtime.logPath}`,
    };
  }

  return {
    className: "border-border bg-secondary text-muted-foreground",
    icon: <CircleAlert className="h-3 w-3" />,
    label: runtime.bundledRuntimeFound ? "待准备" : "缺运行时",
    title: runtime.bundledRuntimeFound
      ? "可以在设置中准备本地引擎。"
      : `未找到内置运行时归档：${runtime.bundledRuntimeArchive}`,
  };
}
