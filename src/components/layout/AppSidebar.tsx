import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BriefcaseBusiness,
  FileText,
  HelpCircle,
  Home,
  Library,
  ListChecks,
  PackageSearch,
  Settings,
  Workflow,
} from "lucide-react";
import { NavLink } from "react-router";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const workspaceNav = [
  { to: "/", label: "首页", icon: Home },
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

      <SidebarSection title="配置" className="mt-4">
        {resourceNav.map((item) => (
          <SidebarLink key={item.to} item={item} />
        ))}
      </SidebarSection>

      <div className="mt-auto px-1">
        <HelpCircle className="h-[18px] w-[18px] text-muted-foreground" />
      </div>
    </aside>
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
      <div className="mb-2 px-1 text-[11px] font-medium text-muted-foreground">{title}</div>
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
