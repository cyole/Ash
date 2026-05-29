import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bug,
  CheckCircle2,
  CircleAlert,
  Cpu,
  Play,
  RefreshCcw,
  Square,
  Stethoscope,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { errorMessage } from "@/lib/errors";
import { hermesQueryKeys } from "@/lib/hermes/queries";
import {
  checkGateway,
  getRuntimeStatus,
  isTauriRuntime,
  prepareRuntime,
  runDoctor,
  setupPortal,
  startGateway,
  stopGateway,
} from "@/lib/tauri";
import type { RuntimeCommandResult } from "@/types/hermes";

type RuntimeAction = "prepare" | "start" | "stop" | "status" | "doctor" | "portal";

const actionLabels: Record<RuntimeAction, string> = {
  prepare: "准备本地引擎",
  start: "启动服务",
  stop: "停止服务",
  status: "检查服务",
  doctor: "运行诊断",
  portal: "连接门户",
};

function isDeveloperToolsEnabled() {
  const env = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env;
  if (env?.DEV) {
    return true;
  }

  try {
    return window.localStorage.getItem("hermesDeveloperTools") === "1";
  } catch {
    return false;
  }
}

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [lastResult, setLastResult] = useState<RuntimeCommandResult | null>(null);
  const [lastAction, setLastAction] = useState<RuntimeAction | null>(null);
  const tauriRuntime = useMemo(() => isTauriRuntime(), []);
  const developerToolsEnabled = useMemo(() => isDeveloperToolsEnabled(), []);

  const status = useQuery({
    queryKey: hermesQueryKeys.runtimeStatus,
    queryFn: getRuntimeStatus,
    refetchInterval: 15_000,
  });

  const runAction = useMutation({
    mutationFn: async (action: RuntimeAction) => {
      setLastAction(action);

      switch (action) {
        case "prepare":
          return prepareRuntime();
        case "start":
          return startGateway();
        case "stop":
          return stopGateway();
        case "status":
          return checkGateway();
        case "doctor":
          return runDoctor();
        case "portal":
          return setupPortal();
      }
    },
    onSuccess: (result, action) => {
      setLastResult(result);
      void queryClient.invalidateQueries({ queryKey: hermesQueryKeys.runtimeStatus });

      if (result.success) {
        toast.success(`${actionLabels[action]}已完成`);
      } else {
        toast.error(`${actionLabels[action]}需要处理`);
      }
    },
    onError: (error, action) => {
      toast.error(`${actionLabels[action]}失败`);
      setLastResult({
        success: false,
        code: null,
        stdout: "",
        stderr: errorMessage(error),
      });
    },
  });

  const runtime = status.data;
  const busy = runAction.isPending;
  const ready = Boolean(runtime?.installed);

  return (
    <div>
      <PageHeader
        eyebrow="系统"
        title="设置"
        description="Hermes 会随应用启动，并在应用退出前自动停止。"
        actions={
          <Button variant="outline" onClick={() => status.refetch()} disabled={status.isFetching}>
            <RefreshCcw className="h-4 w-4" />
            刷新
          </Button>
        }
      />

      <div className="space-y-4 p-6">
        <section className="rounded-lg border border-border">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <h2 className="text-sm font-medium">本地引擎</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Hermes 运行在由桌面应用托管的独立运行时中。
              </p>
            </div>
            <RuntimeBadge
              installed={runtime?.installed}
              running={runtime?.running}
              gatewayRunning={runtime?.gatewayRunning}
            />
          </div>

          <div className="grid gap-0 divide-y divide-border">
            <RuntimeRow
              label="状态"
              value={
                runtime?.running
                  ? "已就绪并运行中"
                  : runtime?.gatewayRunning
                    ? "网关运行中；本地 API 已暂停"
                    : ready
                      ? "已准备，可启动"
                      : "需要准备"
              }
            />
            <RuntimeRow
              label="内置运行时"
              value={
                runtime?.bundledRuntimeFound
                  ? "可用"
                  : "缺少当前平台运行时"
              }
            />
            <RuntimeRow
              label="本地 API 认证"
              value={runtime?.apiKeyConfigured ? "已配置" : "需要设置"}
            />
            <RuntimeRow
              label="已有设置"
              value={runtime?.legacyConfigFound ? "已找到，可导入" : "未找到已有 Hermes 配置"}
            />
            <RuntimeRow label="版本" value={runtime?.version ?? "未知"} />
          </div>
        </section>

        {developerToolsEnabled ? (
          <details className="rounded-lg border border-border">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
              <span className="flex items-center gap-2 text-sm font-medium">
                <Bug className="h-4 w-4" />
                调试菜单
              </span>
              <Badge className="border-border bg-secondary text-muted-foreground">开发者</Badge>
            </summary>

            <div className="border-t border-border p-4">
              <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">手动控制</div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => runAction.mutate("prepare")} disabled={!tauriRuntime || busy}>
                  <Cpu className="h-4 w-4" />
                  准备本地引擎
                </Button>
                <Button
                  onClick={() => runAction.mutate(runtime?.running ? "stop" : "start")}
                  disabled={!tauriRuntime || busy || !ready}
                  variant="outline"
                >
                  {runtime?.running ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  {runtime?.running ? "停止" : "启动"}
                </Button>
                <Button
                  onClick={() => runAction.mutate("status")}
                  disabled={!tauriRuntime || busy || !ready}
                  variant="outline"
                >
                  <RefreshCcw className="h-4 w-4" />
                  检查服务
                </Button>
                <Button
                  onClick={() => runAction.mutate("doctor")}
                  disabled={!tauriRuntime || busy || !ready}
                  variant="outline"
                >
                  <Stethoscope className="h-4 w-4" />
                  诊断
                </Button>
                <Button
                  onClick={() => runAction.mutate("portal")}
                  disabled={!tauriRuntime || busy || !ready}
                  variant="outline"
                >
                  连接门户
                </Button>
              </div>

              {!tauriRuntime ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  本地引擎操作仅在 Tauri 桌面应用中可用。浏览器预览只显示界面。
                </p>
              ) : null}
            </div>

            <div className="border-t border-border">
              <div className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                技术详情
              </div>
              <div className="grid gap-0 divide-y divide-border">
                <RuntimeRow label="运行时归档" value={runtime?.bundledRuntimeArchive ?? "检查中"} mono />
                <RuntimeRow label="运行时根目录" value={runtime?.managedRoot ?? "检查中"} mono />
                <RuntimeRow label="引擎主目录" value={runtime?.hermesHome ?? "检查中"} mono />
                <RuntimeRow label="配置文件" value={runtime?.configPath ?? "检查中"} mono />
                <RuntimeRow label="Hermes CLI" value={runtime?.path ?? "未找到"} mono />
                <RuntimeRow label="本地 API" value={runtime?.apiUrl ?? "http://127.0.0.1:8642"} mono />
              </div>
            </div>

            <div className="border-t border-border p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">活动日志</div>
                {lastAction ? (
                  <div className="flex items-center gap-2">
                    <Badge>{actionLabels[lastAction]}</Badge>
                    {lastResult ? (
                      <span className="text-xs text-muted-foreground">
                        {lastResult.success ? "成功" : "失败"}
                        {lastResult.code !== null ? ` (${lastResult.code})` : ""}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {busy ? (
                <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                  正在运行{lastAction ? actionLabels[lastAction] : "命令"}...
                </div>
              ) : (
                <CommandOutput result={lastResult} gatewayStatus={runtime?.gatewayStatus ?? null} />
              )}
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}

function RuntimeBadge({
  installed,
  running,
  gatewayRunning,
}: {
  installed?: boolean;
  running?: boolean;
  gatewayRunning?: boolean;
}) {
  if (running) {
    return (
      <Badge className="border-green-200 bg-green-50 text-green-700">
        <CheckCircle2 className="mr-1 h-3 w-3" />
        就绪
      </Badge>
    );
  }

  if (installed) {
    return (
      <Badge className="border-amber-200 bg-amber-50 text-amber-700">
        <CircleAlert className="mr-1 h-3 w-3" />
        {gatewayRunning ? "API 已暂停" : "已停止"}
      </Badge>
    );
  }

  return (
    <Badge className="border-border bg-secondary text-muted-foreground">
      <CircleAlert className="mr-1 h-3 w-3" />
      未就绪
    </Badge>
  );
}

function RuntimeRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-4 px-4 py-3 text-sm">
      <div className="text-muted-foreground">{label}</div>
      <div className={mono ? "min-w-0 truncate font-mono text-xs" : "min-w-0 truncate"}>{value}</div>
    </div>
  );
}

function CommandOutput({
  result,
  gatewayStatus,
}: {
  result: RuntimeCommandResult | null;
  gatewayStatus: string | null;
}) {
  if (!result && !gatewayStatus) {
    return (
      <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
        还没有运行任何操作。
      </div>
    );
  }

  const output = result ? [result.stdout, result.stderr].filter(Boolean).join("\n") : gatewayStatus;

  return (
    <div className="rounded-md border border-border bg-[#0a0a0b] p-3 text-xs text-zinc-100">
      <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap leading-5">{output || "没有输出。"}</pre>
      {gatewayStatus && result ? (
        <>
          <Separator className="my-3 bg-zinc-800" />
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap leading-5 text-zinc-300">{gatewayStatus}</pre>
        </>
      ) : null}
    </div>
  );
}
