import { PlaySquare } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";

export function TasksPage() {
  return (
    <div>
      <PageHeader
        eyebrow="智能体运行"
        title="任务"
        description="跟踪运行中、已完成、失败以及等待审批的任务。"
      />
      <EmptyState
        icon={<PlaySquare className="h-4 w-4" />}
        title="暂无任务"
        description="Hermes 的任务事件会显示在这里，方便查看后台正在执行什么。"
      />
    </div>
  );
}
