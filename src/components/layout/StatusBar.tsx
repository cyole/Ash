import { ArrowLeft, ArrowRight, Bot, HardDrive, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { useHermesApi } from "@/lib/hermes/queries";
import { cn } from "@/lib/utils";

const routeTitles: Record<string, string> = {
  "/": "首页",
  "/tasks": "任务",
  "/jobs": "作业",
  "/files": "文件",
  "/models": "模型",
  "/extensions": "扩展",
  "/settings": "设置",
};

const titlebarIconButtonClass =
  "h-8 w-8 rounded-lg border-0 bg-transparent text-muted-foreground/70 shadow-none hover:bg-black/[0.055] hover:text-muted-foreground";

export function StatusBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { apiReady } = useHermesApi();
  const title = routeTitles[location.pathname] ?? "Hermes";

  return (
    <header
      className="flex h-[var(--hermes-titlebar-height)] shrink-0 select-none items-center justify-between bg-background text-muted-foreground"
      data-tauri-drag-region="deep"
    >
      <div className="h-full w-[164px] shrink-0" data-tauri-drag-region="deep" />

      <div className="flex min-w-0 flex-1 items-center gap-1.5 px-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className={titlebarIconButtonClass}
            onClick={() => navigate(-1)}
            aria-label="返回"
          >
            <ArrowLeft className="h-[18px] w-[18px]" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={titlebarIconButtonClass}
            onClick={() => navigate(1)}
            aria-label="前进"
          >
            <ArrowRight className="h-[18px] w-[18px]" />
          </Button>
        </div>

        <div className="flex h-8 min-w-[210px] max-w-[320px] items-center gap-2 rounded-lg bg-card px-2.5 text-foreground shadow-sm">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#7dd3fc,#2563eb_48%,#111827)] text-white">
            <Bot className="h-3 w-3" />
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{title}</span>
          <Button
            variant="ghost"
            size="icon"
            type="button"
            aria-label="关闭标签"
            className="h-[18px] w-[18px] rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>

        <div className="h-full min-w-4 flex-1" data-tauri-drag-region="deep" />
      </div>

      <div
        aria-label={apiReady ? "已连接到网关" : "正在连接网关"}
        title={apiReady ? "已连接到网关" : "正在连接网关"}
        className="relative mr-3.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-0 bg-transparent text-muted-foreground/70 shadow-none transition-colors hover:bg-black/[0.055] hover:text-muted-foreground"
        role="status"
      >
        <HardDrive className="h-[18px] w-[18px]" />
        <span
          className={cn(
            "absolute bottom-0.5 right-0.5 h-2 w-2 rounded-full border-2 border-background",
            apiReady ? "bg-green-500" : "bg-muted-foreground",
          )}
        />
      </div>
    </header>
  );
}
