import { useEffect } from "react";
import { Archive, LoaderCircle, Pin } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router";
import { chatPathForSession, chatSessionSearchParam } from "@/features/chat/chat-route";
import type { ChatSessionActivity } from "@/features/chat/chat-session-activity";
import { markChatSessionViewed, useChatSessionActivities } from "@/features/chat/chat-session-activity";
import { errorMessage } from "@/lib/errors";
import type { HermesSession } from "@/lib/hermes";
import { hermesQueryKeys, useHermesApi } from "@/lib/hermes/queries";
import { formatSessionTime, sessionTitle, sessionUpdatedAt } from "@/lib/hermes/session-format";
import { cn } from "@/lib/utils";

export function ChatSessionsSidebar() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const selectedSessionId = searchParams.get(chatSessionSearchParam);
  const { apiReady, apiUrl, client, sessionToken } = useHermesApi();
  const sessionActivities = useChatSessionActivities();
  const sessions = useQuery({
    enabled: apiReady,
    queryKey: hermesQueryKeys.sessions(apiUrl, Boolean(sessionToken)),
    queryFn: () => client.listSessions(),
  });

  useEffect(() => {
    if (selectedSessionId) {
      markChatSessionViewed(selectedSessionId);
    }
  }, [selectedSessionId]);

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label="对话">
      <div className="mb-1.5 px-2 text-[12px] font-semibold tracking-normal text-muted-foreground/70">对话</div>

      <div className="min-h-0 flex-1 overflow-auto">
        {sessions.isLoading ? (
          <ChatSessionSkeleton />
        ) : sessions.isError ? (
          <SidebarNotice title="会话加载失败" description={errorMessage(sessions.error)} />
        ) : sessions.data?.length ? (
          <div className="space-y-0.5">
            {sessions.data.map((session) => (
              <ChatSessionItem
                key={session.id}
                active={session.id === selectedSessionId}
                activity={sessionActivities[session.id]}
                session={session}
                onClick={() => {
                  markChatSessionViewed(session.id);
                  navigate(chatPathForSession(session.id));
                }}
              />
            ))}
          </div>
        ) : (
          <SidebarNotice title="还没有会话" description="发送第一条消息后会出现在这里。" />
        )}
      </div>
    </section>
  );
}

function ChatSessionItem({
  active,
  activity,
  onClick,
  session,
}: {
  active: boolean;
  activity?: ChatSessionActivity;
  onClick: () => void;
  session: HermesSession;
}) {
  const generating = activity?.kind === "generating";
  const unread = activity?.kind === "unread";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-muted-foreground transition-colors hover:bg-foreground/[0.055] hover:text-foreground",
        generating && "bg-foreground/[0.06] text-foreground",
        active && "bg-foreground/[0.07] text-foreground",
      )}
    >
      <span className={cn("min-w-0 flex-1 truncate text-[13px] leading-5", active && "font-semibold")}>
        {sessionTitle(session)}
      </span>
      {generating ? (
        <span className="ml-1 shrink-0 text-muted-foreground/80" role="status" aria-label="正在等待回复">
          <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden="true" />
        </span>
      ) : unread ? (
        <span className="ml-1 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/70" role="status" aria-label="有新回复" />
      ) : (
        <>
          <span
            className={cn(
              "ml-2 w-9 shrink-0 text-right text-[10px] font-normal leading-4 text-muted-foreground/65 transition-opacity group-hover:hidden",
              active && "hidden",
            )}
          >
            {formatSidebarSessionTime(sessionUpdatedAt(session))}
          </span>
          <span
            className={cn(
              "ml-1 hidden shrink-0 items-center gap-1 text-muted-foreground/80 transition-colors group-hover:flex",
              active && "flex",
            )}
            aria-hidden="true"
          >
            <Pin className="h-3.5 w-3.5" />
            <Archive className="h-3.5 w-3.5" />
          </span>
        </>
      )}
    </button>
  );
}

function ChatSessionSkeleton() {
  return (
    <div className="space-y-1">
      {Array.from({ length: 7 }).map((_, index) => (
        <div key={index} className="flex h-8 items-center rounded-lg px-2">
          <div className="h-3 w-4/5 rounded bg-black/10" />
        </div>
      ))}
    </div>
  );
}

function SidebarNotice({ description, title }: { description: string; title: string }) {
  return (
    <div className="rounded-lg border border-black/10 bg-black/[0.025] px-3 py-3">
      <div className="text-[12px] font-medium text-foreground">{title}</div>
      <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{description}</p>
    </div>
  );
}

function formatSidebarSessionTime(value: number | null) {
  const formatted = formatSessionTime(value);

  return formatted
    .replace(" 分钟前", " 分")
    .replace(" 小时前", " 小时")
    .replace(" 天前", " 天");
}
