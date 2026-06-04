import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Clock3, Moon, PackageSearch, PenLine, Search, Settings, Sun } from "lucide-react";
import { NavLink } from "react-router";
import { ChatSessionsSidebar } from "@/features/chat/components/ChatSessionsSidebar";
import type { ThemeMode } from "@/features/settings/settings-store";
import { useAshSettings } from "@/features/settings/settings-store";
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
  return (
    <aside className="ash-sidebar-surface relative flex h-full w-[var(--ash-sidebar-width)] shrink-0 select-none flex-col overflow-hidden px-3 pb-3 pt-[calc(var(--ash-titlebar-height)+8px)] text-muted-foreground">
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
        <span className="absolute inset-y-3 right-1/2 w-px translate-x-1/2 rounded-full bg-transparent transition-colors group-hover:bg-[var(--ash-sidebar-resize-hover)] group-active:bg-[var(--ash-sidebar-resize-active)]" />
      </button>

      <nav className="shrink-0 space-y-0.5" aria-label="快捷入口">
        {quickNav.map((item) => (
          <SidebarLink key={item.to} item={item} />
        ))}
      </nav>

      <div className="mt-4 min-h-0 flex-1">
        <ChatSessionsSidebar />
      </div>

      <div className="flex shrink-0 items-center gap-1 pt-2">
        <SidebarLink className="min-w-0 flex-1" item={settingsNav} />
        <ThemeModeToggleButton />
      </div>
    </aside>
  );
}

function SidebarLink({ className, item }: { className?: string; item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      className={({ isActive }) =>
        cn(
          "flex h-9 items-center gap-2.5 rounded-lg px-2 text-[13px] transition-colors hover:bg-[var(--ash-sidebar-control-hover)] hover:text-foreground",
          isActive && "font-medium text-foreground",
          className,
        )
      }
    >
      <item.icon className="h-4 w-4" />
      <span>{item.label}</span>
    </NavLink>
  );
}

function ThemeModeToggleButton() {
  const { settings, updateSettings } = useAshSettings();
  const dark = useEffectiveDarkMode(settings.themeMode);
  const nextTheme = dark ? "light" : "dark";
  const label = dark ? "切换到浅色" : "切换到深色";
  const Icon = dark ? Sun : Moon;

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-[var(--ash-sidebar-control-hover)] hover:text-foreground"
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
