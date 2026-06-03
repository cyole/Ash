import { Outlet } from "react-router";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { StatusBar } from "@/components/layout/StatusBar";

export function AppLayout() {
  return (
    <div className="flex h-full min-w-[960px] bg-background text-foreground">
      <AppSidebar />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-tl-[14px] border-l border-t border-black/10 bg-card">
        <StatusBar />
        <Outlet />
      </main>
    </div>
  );
}
