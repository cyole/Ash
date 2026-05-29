import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  Bot,
  BriefcaseBusiness,
  ChevronDown,
  Hash,
  FileText,
  HelpCircle,
  Home,
  Library,
  ListChecks,
  MessageSquare,
  MoreHorizontal,
  PackageSearch,
  Search,
  Settings,
  Workflow,
  X,
} from "lucide-react";
import { Link, NavLink } from "react-router";
import { Input } from "@/components/ui/input";
import { hermesQueryKeys, useHermesApi } from "@/lib/hermes/queries";
import { sessionTitle, sessionUpdatedAt } from "@/lib/hermes/session-format";
import type { HermesSession } from "@/lib/hermes/types";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const workspaceNav = [
  { to: "/", label: "首页", icon: Home },
  { to: "/chat", label: "聊天", icon: MessageSquare },
  { to: "/sessions", label: "会话", icon: Bot },
  { to: "/tasks", label: "任务", icon: ListChecks },
  { to: "/jobs", label: "作业", icon: Workflow },
  { to: "/files", label: "文件", icon: FileText },
] satisfies NavItem[];

const resourceNav = [
  { to: "/models", label: "模型", icon: Library },
  { to: "/extensions", label: "扩展", icon: PackageSearch },
  { to: "/settings", label: "设置", icon: Settings },
] satisfies NavItem[];

export function AppSidebar() {
  const [recentOpen, setRecentOpen] = useState(false);
  const [recentFilter, setRecentFilter] = useState("");
  const { apiKey, apiReady, apiUrl, client } = useHermesApi();
  const hasApiKey = Boolean(apiKey);

  const sessionsQuery = useQuery({
    queryKey: hermesQueryKeys.sessions(apiUrl, hasApiKey),
    queryFn: () => client.listSessions(),
    enabled: apiReady,
    retry: false,
  });

  const recentSessions = useMemo(() => {
    return [...(sessionsQuery.data ?? [])].sort((a, b) => {
      return (sessionUpdatedAt(b) ?? 0) - (sessionUpdatedAt(a) ?? 0);
    });
  }, [sessionsQuery.data]);

  const visibleRecentSessions = recentSessions.slice(0, 5);
  const filteredRecentSessions = useMemo(() => {
    const query = recentFilter.trim().toLowerCase();
    if (!query) {
      return recentSessions;
    }

    return recentSessions.filter((session) => sessionTitle(session).toLowerCase().includes(query));
  }, [recentFilter, recentSessions]);

  return (
    <aside className="relative flex h-full w-[var(--hermes-sidebar-width)] shrink-0 flex-col bg-sidebar px-3 pb-3 pt-3.5 text-[#696969]">
      <div className="mb-4 flex items-center gap-2.5 px-1">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[linear-gradient(135deg,#111,#555)] text-white shadow-sm">
          <BriefcaseBusiness className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold text-foreground">Hermes</div>
          <div className="truncate text-[11px] text-muted-foreground">Desktop workspace</div>
        </div>
      </div>

      <SidebarSection title="工作台">
        {workspaceNav.map((item) => (
          <SidebarLink key={item.to} item={item} />
        ))}
      </SidebarSection>

      <RecentSection
        loading={sessionsQuery.isLoading}
        open={recentOpen}
        sessions={visibleRecentSessions}
        onOpenChange={setRecentOpen}
      />

      <SidebarSection title="配置" className="mt-4">
        {resourceNav.map((item) => (
          <SidebarLink key={item.to} item={item} />
        ))}
      </SidebarSection>

      <div className="mt-auto px-1">
        <HelpCircle className="h-[18px] w-[18px] text-muted-foreground" />
      </div>

      {recentOpen ? (
        <RecentPopover
          filter={recentFilter}
          loading={sessionsQuery.isLoading}
          sessions={filteredRecentSessions}
          onClose={() => setRecentOpen(false)}
          onFilterChange={setRecentFilter}
        />
      ) : null}
    </aside>
  );
}

function RecentSection({
  loading,
  onOpenChange,
  open,
  sessions,
}: {
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  sessions: HermesSession[];
}) {
  return (
    <section className="mt-4">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="mb-1 flex h-7 items-center gap-1 rounded-md px-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/15"
      >
        最近
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>

      <div className="space-y-1">
        {sessions.length > 0 ? (
          sessions.map((session) => <RecentLink key={session.id} id={session.id} title={sessionTitle(session)} />)
        ) : (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            {loading ? "正在加载最近聊天" : "暂无最近聊天"}
          </div>
        )}

        <button
          type="button"
          onClick={() => onOpenChange(true)}
          className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-[13px] transition-colors hover:bg-black/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/15"
        >
          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
          <span>更多</span>
        </button>
      </div>
    </section>
  );
}

function RecentPopover({
  filter,
  loading,
  onClose,
  onFilterChange,
  sessions,
}: {
  filter: string;
  loading: boolean;
  onClose: () => void;
  onFilterChange: (value: string) => void;
  sessions: HermesSession[];
}) {
  return (
    <section className="absolute left-full top-0 z-30 h-full w-[320px] border-l border-border bg-[#fbfbfb] px-3.5 py-5 shadow-[12px_0_32px_rgba(0,0,0,0.055)]">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">最近</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭最近聊天"
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/15"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filter}
          onChange={(event) => onFilterChange(event.target.value)}
          placeholder="搜索最近..."
          className="h-9 rounded-xl bg-background pl-9 text-[13px]"
        />
      </div>

      <div className="space-y-1">
        {sessions.length > 0 ? (
          sessions.map((session) => (
            <RecentLink
              key={session.id}
              id={session.id}
              title={sessionTitle(session)}
              className="h-9 text-[13px]"
              onClick={onClose}
            />
          ))
        ) : (
          <div className="px-2 py-8 text-center text-sm text-muted-foreground">
            {loading ? "正在加载最近聊天" : "没有匹配的聊天"}
          </div>
        )}
      </div>
    </section>
  );
}

function RecentLink({
  className,
  id,
  onClick,
  title,
}: {
  className?: string;
  id: string;
  onClick?: () => void;
  title: string;
}) {
  return (
    <Link
      to={`/chat?session=${encodeURIComponent(id)}`}
      onClick={onClick}
      className={cn(
        "flex h-9 min-w-0 items-center gap-2.5 rounded-lg px-2 text-[13px] transition-colors hover:bg-black/5 hover:text-foreground",
        className,
      )}
    >
      <Hash className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="truncate">{title}</span>
    </Link>
  );
}

function SidebarSection({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  title: string;
}) {
  return (
    <nav className={cn("space-y-0.5", className)} aria-label={title}>
      <div className="mb-1 px-1 text-[11px] font-medium text-muted-foreground">{title}</div>
      {children}
    </nav>
  );
}

function SidebarLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      className={({ isActive }) =>
        cn(
          "flex h-9 items-center gap-2.5 rounded-lg px-2 text-[13px] transition-colors hover:bg-black/5 hover:text-foreground",
          isActive && "bg-black/[0.055] font-medium text-foreground",
        )
      }
    >
      <item.icon className="h-4 w-4" />
      <span>{item.label}</span>
    </NavLink>
  );
}
