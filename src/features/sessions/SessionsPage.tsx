import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, Edit3, MessageSquare, RefreshCcw, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/errors";
import { hermesQueryKeys, useHermesApi } from "@/lib/hermes/queries";
import {
  formatSessionTime,
  sessionMessageCount,
  sessionModelLabel,
  sessionPreview,
  sessionSource,
  sessionTitle,
  sessionUpdatedAt,
} from "@/lib/hermes/session-format";
import type { HermesSession } from "@/lib/hermes/types";

export function SessionsPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const { apiAuth, apiKey, apiReady, apiUrl, client } = useHermesApi();
  const hasApiKey = Boolean(apiKey);

  const sessions = useQuery({
    queryKey: hermesQueryKeys.sessions(apiUrl, hasApiKey),
    queryFn: () => client.listSessions(),
    enabled: apiReady,
    retry: false,
  });

  const createSession = useMutation({
    mutationFn: () =>
      client.createSession({
        title: "新会话",
        source: "desktop",
    }),
    onSuccess: async (session) => {
      toast.success("已创建会话");
      await queryClient.invalidateQueries({ queryKey: hermesQueryKeys.sessions(apiUrl, hasApiKey) });
      window.location.hash = `/chat?session=${encodeURIComponent(session.id)}`;
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });

  const renameSession = useMutation({
    mutationFn: ({ sessionId, title }: { sessionId: string; title: string }) =>
      client.renameSession({ sessionId, title }),
    onSuccess: async () => {
      toast.success("会话已重命名");
      await queryClient.invalidateQueries({ queryKey: hermesQueryKeys.sessions(apiUrl, hasApiKey) });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });

  const deleteSession = useMutation({
    mutationFn: (sessionId: string) => client.deleteSession(sessionId),
    onSuccess: async () => {
      toast.success("会话已删除");
      await queryClient.invalidateQueries({ queryKey: hermesQueryKeys.sessions(apiUrl, hasApiKey) });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });

  const filteredSessions = useMemo(() => {
    const items = [...(sessions.data ?? [])].sort((a, b) => {
      return (sessionUpdatedAt(b) ?? 0) - (sessionUpdatedAt(a) ?? 0);
    });
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return items;
    }

    return items.filter((session) => {
      return [sessionTitle(session), sessionPreview(session), sessionSource(session), sessionModelLabel(session), session.id]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [query, sessions.data]);

  function handleRename(session: HermesSession) {
    const nextTitle = window.prompt("新的会话名称", sessionTitle(session));
    if (!nextTitle?.trim() || nextTitle.trim() === sessionTitle(session)) {
      return;
    }

    renameSession.mutate({
      sessionId: session.id,
      title: nextTitle.trim(),
    });
  }

  function handleDelete(session: HermesSession) {
    if (!window.confirm(`删除“${sessionTitle(session)}”？这个操作无法撤销。`)) {
      return;
    }

    deleteSession.mutate(session.id);
  }

  const busy = createSession.isPending || renameSession.isPending || deleteSession.isPending;

  return (
    <div>
      <PageHeader
        eyebrow="对话历史"
        title="会话"
        description="从 Hermes WebUI 的历史管理开始落地：搜索、继续、重命名和删除会话。"
        actions={
          <>
            <Button variant="outline" onClick={() => sessions.refetch()} disabled={!apiReady || sessions.isFetching}>
              <RefreshCcw className="h-4 w-4" />
              刷新
            </Button>
            <Button onClick={() => createSession.mutate()} disabled={!apiReady || createSession.isPending}>
              新建会话
            </Button>
          </>
        }
      />

      <div className="space-y-4 p-6">
        <div className="flex items-center gap-3">
          <div className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索标题、来源、模型或会话 ID..."
              className="pl-9"
            />
          </div>
          <Badge>{filteredSessions.length} 个会话</Badge>
        </div>

        {!apiReady || sessions.isLoading ? (
          <EmptyState
            icon={<Database className="h-4 w-4" />}
            title="正在加载会话"
            description={apiAuth.isError ? errorMessage(apiAuth.error) : "正在从 Hermes 本地 API 读取历史记录。"}
          />
        ) : sessions.error ? (
          <EmptyState
            icon={<Database className="h-4 w-4" />}
            title="暂时无法加载会话"
            description={errorMessage(sessions.error)}
            action={
              <Button variant="outline" onClick={() => sessions.refetch()}>
                <RefreshCcw className="h-4 w-4" />
                重试
              </Button>
            }
          />
        ) : filteredSessions.length > 0 ? (
          <section className="overflow-hidden rounded-lg border border-border">
            <div className="grid grid-cols-[1fr_160px_140px_150px] gap-4 border-b border-border bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
              <div>会话</div>
              <div>来源</div>
              <div>最近活动</div>
              <div className="text-right">操作</div>
            </div>
            <div className="divide-y divide-border">
              {filteredSessions.map((session) => (
                <div
                  key={session.id}
                  className="grid grid-cols-[1fr_160px_140px_150px] items-center gap-4 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="truncate text-sm font-medium">{sessionTitle(session)}</div>
                      {sessionMessageCount(session) !== null ? <Badge>{sessionMessageCount(session)} 条</Badge> : null}
                    </div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {sessionPreview(session) || sessionModelLabel(session)}
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">{sessionSource(session)}</div>
                  <div className="text-sm text-muted-foreground">{formatSessionTime(sessionUpdatedAt(session))}</div>
                  <div className="flex justify-end gap-1">
                    <Button asChild variant="ghost" size="icon" aria-label="继续会话">
                      <Link to={`/chat?session=${encodeURIComponent(session.id)}`}>
                        <MessageSquare className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="重命名会话"
                      onClick={() => handleRename(session)}
                      disabled={busy}
                    >
                      <Edit3 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="删除会话"
                      onClick={() => handleDelete(session)}
                      disabled={busy}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <EmptyState
            icon={<Database className="h-4 w-4" />}
            title={query ? "没有匹配的会话" : "尚未加载会话"}
            description={query ? "换个关键词试试。" : "连接 Hermes 后端后，这里会显示本地桌面会话和 Hermes 历史记录。"}
            action={
              <Button onClick={() => createSession.mutate()} disabled={!apiReady || createSession.isPending}>
                新建会话
              </Button>
            }
          />
        )}
      </div>
    </div>
  );
}
