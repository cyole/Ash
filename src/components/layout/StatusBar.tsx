import { useQuery } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";
import { useLocation, useSearchParams } from "react-router";
import { chatSessionSearchParam } from "@/features/chat/chat-route";
import { hermesQueryKeys, useHermesApi } from "@/lib/hermes/queries";
import { sessionTitle } from "@/lib/hermes/session-format";

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
  const { apiKey, apiReady, apiUrl, client } = useHermesApi();
  const sessions = useQuery({
    enabled: apiReady && location.pathname === "/chat" && Boolean(selectedSessionId),
    queryKey: hermesQueryKeys.sessions(apiUrl, Boolean(apiKey)),
    queryFn: () => client.listSessions(),
  });
  const selectedSession = sessions.data?.find((session) => session.id === selectedSessionId);
  const title =
    location.pathname === "/chat" ? (selectedSession ? sessionTitle(selectedSession) : "新对话") : (routeTitles[location.pathname] ?? "Hermes");

  return (
    <header
      className="flex h-[var(--hermes-titlebar-height)] shrink-0 select-none items-center border-b border-black/[0.055] bg-card text-foreground"
      data-tauri-drag-region="deep"
    >
      <div className="flex h-full min-w-0 flex-1 items-center gap-2 px-5" data-tauri-drag-region="deep">
        <h1 className="min-w-0 max-w-[60vw] truncate text-[14px] font-semibold leading-none">{title}</h1>
        <MoreHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </div>
    </header>
  );
}
