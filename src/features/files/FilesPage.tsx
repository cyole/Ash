import { FileText } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";

export function FilesPage() {
  return (
    <div>
      <PageHeader
        eyebrow="工作区"
        title="文件"
        description="浏览本地配置文件、预览产物，并确认破坏性操作。"
        actions={<Button variant="outline">选择文件夹</Button>}
      />
      <EmptyState
        icon={<FileText className="h-4 w-4" />}
        title="尚未选择文件夹"
        description="本地文件夹选择会使用 Tauri 原生对话框，让用户清楚知道 Ash 可以访问哪些内容。"
      />
    </div>
  );
}
