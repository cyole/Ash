import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, ArrowRight, Clock3, PackageSearch, PenLine, Search, Settings } from "lucide-react";
import { NavLink, useNavigate } from "react-router";
import { ChatSessionsSidebar } from "@/features/chat/components/ChatSessionsSidebar";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const quickNav = [
  { to: "/", label: "新对话", icon: PenLine },
  { to: "/files", label: "搜索", icon: Search },
  { to: "/extensions", label: "插件", icon: PackageSearch },
  { to: "/tasks", label: "自动化", icon: Clock3 },
] satisfies NavItem[];

const settingsNav = { to: "/settings", label: "设置", icon: Settings } satisfies NavItem;

interface AppSidebarProps {
  maxWidth: number;
  minWidth: number;
  onResizePointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  width: number;
}

export function AppSidebar({ maxWidth, minWidth, onResizePointerDown, width }: AppSidebarProps) {
  const navigate = useNavigate();

  return (
    <aside className="relative flex h-full w-[var(--hermes-sidebar-width)] shrink-0 select-none flex-col overflow-hidden bg-sidebar px-3 pb-3 pt-[calc(var(--hermes-titlebar-height)+8px)] text-muted-foreground">
      <button
        type="button"
        aria-label="调整侧边栏宽度"
        aria-orientation="vertical"
        aria-valuemax={maxWidth}
        aria-valuemin={minWidth}
        aria-valuenow={width}
        className="group absolute inset-y-0 -right-1 z-20 w-2 cursor-col-resize"
        onPointerDown={onResizePointerDown}
        role="separator"
      >
        <span className="absolute inset-y-3 right-1/2 w-px translate-x-1/2 rounded-full bg-transparent transition-colors group-hover:bg-black/15 group-active:bg-black/25" />
      </button>

      <div
        className="absolute inset-x-0 top-0 flex h-[var(--hermes-titlebar-height)] items-center justify-end gap-1 pr-4 text-muted-foreground/80"
        data-tauri-drag-region="deep"
      >
        <SidebarNavigationButton label="返回" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </SidebarNavigationButton>
        <SidebarNavigationButton label="前进" onClick={() => navigate(1)}>
          <ArrowRight className="h-4 w-4" />
        </SidebarNavigationButton>
      </div>

      <nav className="shrink-0 space-y-0.5" aria-label="快捷入口">
        {quickNav.map((item) => (
          <SidebarLink key={item.to} item={item} />
        ))}
      </nav>

      <div className="mt-4 min-h-0 flex-1">
        <ChatSessionsSidebar />
      </div>

      <div className="shrink-0 pt-2">
        <SidebarLink item={settingsNav} />
      </div>
    </aside>
  );
}

function SidebarNavigationButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-black/[0.04] hover:text-foreground"
    >
      {children}
    </button>
  );
}

function SidebarLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      className={({ isActive }) =>
        cn(
          "flex h-9 items-center gap-2.5 rounded-lg px-2 text-[13px] transition-colors hover:bg-black/[0.04] hover:text-foreground",
          isActive && "font-medium text-foreground",
        )
      }
    >
      <item.icon className="h-4 w-4" />
      <span>{item.label}</span>
    </NavLink>
  );
}
