import { ArrowRight, Bot } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";

export function OnboardingPage() {
  return (
    <div className="flex min-h-full items-center justify-center bg-background p-6">
      <div className="w-full max-w-xl rounded-lg border border-border bg-card p-6">
        <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-primary text-primary-foreground">
          <Bot className="h-5 w-5" />
        </div>
        <h1 className="text-2xl font-semibold">设置 Ash</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          引导流程会准备内置本地引擎，导入已有偏好，并在进入应用前验证模型服务。
        </p>
        <div className="mt-6 flex items-center gap-3">
          <Button asChild>
            <Link to="/">
              进入应用
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/settings">打开设置</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
