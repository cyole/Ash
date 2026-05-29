import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Bot, CalendarClock, MessageSquare, ShieldCheck } from "lucide-react";
import { Link } from "react-router";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { hermesQueryKeys } from "@/lib/hermes/queries";
import { getRuntimeStatus } from "@/lib/tauri";

const quickActions = [
  {
    title: "开始对话",
    description: "发送任务，并在同一处查看执行进展。",
    href: "/chat",
    icon: MessageSquare,
  },
  {
    title: "创建计划",
    description: "安排定期简报、清理或研究任务。",
    href: "/jobs",
    icon: CalendarClock,
  },
  {
    title: "检查安全设置",
    description: "在授权更深访问前，确认本地优先的安全默认值。",
    href: "/settings",
    icon: ShieldCheck,
  },
];

export function HomePage() {
  const status = useQuery({
    queryKey: hermesQueryKeys.runtimeStatus,
    queryFn: getRuntimeStatus,
  });

  return (
    <div>
      <PageHeader
        eyebrow="概览"
        title="更清爽的本地助理工作区"
        description="应用会准备自己的本地引擎，导入已有偏好，并把对话、任务、文件、计划、模型和设置放在一处。"
        actions={
          <Button asChild>
            <Link to="/chat">
              打开对话
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 p-6 lg:grid-cols-[1fr_360px]">
        <section className="rounded-lg border border-border">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="text-sm font-medium">快捷操作</div>
            <Badge>测试版</Badge>
          </div>
          <div className="divide-y divide-border">
            {quickActions.map((action) => (
              <Link
                key={action.href}
                to={action.href}
                className="flex items-center justify-between gap-4 px-4 py-4 transition-colors hover:bg-accent"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
                    <action.icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{action.title}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{action.description}</div>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </section>

        <aside className="rounded-lg border border-border">
          <div className="border-b border-border px-4 py-3 text-sm font-medium">本地引擎</div>
          <div className="space-y-4 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-muted">
                <Bot className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-medium">
                  {status.data?.running
                    ? "已就绪"
                    : status.data?.installed
                      ? "已准备，未运行"
                      : "需要准备"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {status.data?.bundledRuntimeFound ? "内置运行时可用" : "缺少内置运行时"}
                </div>
              </div>
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">模式</dt>
                <dd>{status.data?.mode === "local-app" ? "应用托管" : status.data?.mode ?? "检查中"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">版本</dt>
                <dd className="truncate">{status.data?.version ?? "未知"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">已有设置</dt>
                <dd>{status.data?.legacyConfigFound ? "已找到" : "无"}</dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}
