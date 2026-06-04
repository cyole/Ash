import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, ArrowRight, Clock3, Moon, PackageSearch, PenLine, Search, Settings, Sun } from "lucide-react";
import { NavLink, useNavigate } from "react-router";
import { ChatSessionsSidebar } from "@/features/chat/components/ChatSessionsSidebar";
import type { ThemeMode } from "@/features/settings/settings-store";
import { useHermesSettings } from "@/features/settings/settings-store";
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
    <aside className="hermes-sidebar-surface relative flex h-full w-[var(--hermes-sidebar-width)] shrink-0 select-none flex-col overflow-hidden px-3.5 pb-3 pt-[calc(var(--hermes-titlebar-height)+10px)] text-muted-foreground">
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

      <nav className="shrink-0 space-y-1" aria-label="快捷入口">
        {quickNav.map((item) => (
          <SidebarLink key={item.to} item={item} />
        ))}
      </nav>

      <div className="mt-5 min-h-0 flex-1">
        <ChatSessionsSidebar />
      </div>

      <div className="flex shrink-0 items-center gap-1 pt-2">
        <SidebarLink className="min-w-0 flex-1" item={settingsNav} />
        <ThemeModeToggleButton />
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
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
    >
      {children}
    </button>
  );
}

function SidebarLink({ className, item }: { className?: string; item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      className={({ isActive }) =>
        cn(
          "flex h-10 items-center gap-3 rounded-lg px-2.5 text-[15px] font-semibold tracking-normal transition-colors hover:bg-foreground/[0.06] hover:text-foreground",
          isActive && "bg-foreground/[0.07] text-foreground",
          className,
        )
      }
    >
      <item.icon className="h-5 w-5 shrink-0 stroke-[2.1]" />
      <span className="min-w-0 truncate">{item.label}</span>
    </NavLink>
  );
}

function ThemeModeToggleButton() {
  const { settings, updateSettings } = useHermesSettings();
  const dark = useEffectiveDarkMode(settings.themeMode);
  const nextTheme = dark ? "light" : "dark";
  const label = dark ? "切换到浅色" : "切换到深色";
  const Icon = dark ? Sun : Moon;

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
      onClick={() => updateSettings({ themeMode: nextTheme })}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function useEffectiveDarkMode(themeMode: ThemeMode) {
  const [systemDark, setSystemDark] = useState(getSystemPrefersDark);

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => setSystemDark(query.matches);

    handleChange();
    query.addEventListener("change", handleChange);

    return () => {
      query.removeEventListener("change", handleChange);
    };
  }, []);

  return themeMode === "dark" || (themeMode === "system" && systemDark);
}

function getSystemPrefersDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}
