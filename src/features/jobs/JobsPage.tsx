import { CalendarClock } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";

export function JobsPage() {
  return (
    <div>
      <PageHeader
        eyebrow="自动化"
        title="计划"
        description="无需手写定时表达式，也能创建、暂停、恢复和运行 Hermes 定时任务。"
        actions={<Button>新建计划</Button>}
      />
      <EmptyState
        icon={<CalendarClock className="h-4 w-4" />}
        title="暂无定时计划"
        description="初版会先提供自然语言预设，之后再开放高级定时配置。"
      />
    </div>
  );
}
