import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  CircleAlert,
  Cpu,
  KeyRound,
  Loader2,
  RefreshCcw,
  RotateCcw,
  Save,
  Server,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { errorMessage } from "@/lib/errors";
import { hermesQueryKeys, useHermesApi } from "@/lib/hermes/queries";
import { cn } from "@/lib/utils";
import type {
  AuxiliaryModelsResponse,
  EnvVarInfo,
  ModelInfoResponse,
  ModelOptionsResponse,
} from "@/types/hermes-dashboard";

interface ModelSettingsData {
  auxiliary: AuxiliaryModelsResponse | null;
  env: Record<string, EnvVarInfo>;
  info: ModelInfoResponse;
  options: ModelOptionsResponse;
}

const AUXILIARY_TASK_LABELS: Record<string, string> = {
  approval: "Approval",
  compression: "Compression",
  curator: "Curator",
  mcp: "MCP",
  session_search: "Session search",
  skills_hub: "Skills hub",
  title_generation: "Title generation",
  vision: "Vision",
  web_extract: "Web extract",
};

export function ModelsPage() {
  const queryClient = useQueryClient();
  const { apiReady, apiUrl, client, sessionToken, status } = useHermesApi();
  const [selectedProvider, setSelectedProvider] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [credentialKey, setCredentialKey] = useState("");
  const [credentialValue, setCredentialValue] = useState("");
  const [hydrated, setHydrated] = useState(false);

  const modelSettings = useQuery({
    enabled: apiReady,
    queryKey: hermesQueryKeys.modelSettings(apiUrl, Boolean(sessionToken)),
    queryFn: async (): Promise<ModelSettingsData> => {
      const [info, options, auxiliary, env] = await Promise.all([
        client.getGlobalModelInfo(),
        client.getGlobalModelOptions(),
        client.getAuxiliaryModels().catch(() => null),
        client.getEnvVars(),
      ]);

      return { auxiliary, env, info, options };
    },
  });

  const providers = modelSettings.data?.options.providers ?? [];
  const currentInfo = modelSettings.data?.info;
  const envVars = modelSettings.data?.env ?? {};
  const credentialEntries = useMemo(() => modelCredentialEntries(envVars), [envVars]);
  const selectedProviderModels = useMemo(
    () => providers.find((provider) => provider.slug === selectedProvider)?.models ?? [],
    [providers, selectedProvider],
  );

  useEffect(() => {
    if (!modelSettings.data || hydrated) {
      return;
    }

    setSelectedProvider(modelSettings.data.info.provider);
    setSelectedModel(modelSettings.data.info.model);
    setCredentialKey(credentialEntries[0]?.[0] ?? "");
    setHydrated(true);
  }, [credentialEntries, hydrated, modelSettings.data]);

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: hermesQueryKeys.modelSettings(apiUrl, Boolean(sessionToken)),
    });

  const applyMainModel = useMutation({
    mutationFn: async () => {
      if (!selectedProvider || !selectedModel) {
        throw new Error("请选择 provider 和模型。");
      }

      return client.setModelAssignment({
        scope: "main",
        provider: selectedProvider,
        model: selectedModel,
      });
    },
    onSuccess: () => {
      void refresh();
      void queryClient.invalidateQueries({ queryKey: hermesQueryKeys.models(apiUrl, Boolean(sessionToken)) });
      toast.success("主模型已更新");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const saveCredential = useMutation({
    mutationFn: async () => {
      const key = credentialKey.trim();
      const value = credentialValue.trim();
      if (!key || !value) {
        throw new Error("请选择凭证并输入值。");
      }

      await client.validateProviderCredential(key, value);
      return client.setEnvVar(key, value);
    },
    onSuccess: () => {
      setCredentialValue("");
      void refresh();
      toast.success("凭证已保存");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const restartGateway = useMutation({
    mutationFn: () => client.restartGateway(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: hermesQueryKeys.runtimeStatus });
      toast.success("Gateway 已重启");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const resetAuxiliary = useMutation({
    mutationFn: async () => {
      if (!currentInfo) {
        throw new Error("当前主模型还没有加载。");
      }

      return client.setModelAssignment({
        scope: "auxiliary",
        task: "__reset__",
        provider: currentInfo.provider,
        model: currentInfo.model,
      });
    },
    onSuccess: () => {
      void refresh();
      toast.success("辅助模型已重置");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const loading = modelSettings.isLoading && !modelSettings.data;
  const canApply = Boolean(selectedProvider && selectedModel && !applyMainModel.isPending);
  const canSaveCredential = Boolean(credentialKey && credentialValue.trim() && !saveCredential.isPending);

  return (
    <div>
      <PageHeader
        eyebrow="模型服务"
        title="模型"
        description="使用 Hermes dashboard 的官方模型与凭证 API。"
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => void modelSettings.refetch()}
              disabled={modelSettings.isFetching}
            >
              {modelSettings.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              刷新
            </Button>
            <Button
              variant="outline"
              onClick={() => restartGateway.mutate()}
              disabled={!apiReady || !status.data?.dashboardRunning || restartGateway.isPending}
            >
              {restartGateway.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              重启 Gateway
            </Button>
          </>
        }
      />

      <div className="grid gap-4 p-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <section className="rounded-lg border border-border">
            <SectionHeader
              icon={<Sparkles className="h-4 w-4" />}
              title="主模型"
              action={<ProviderStatusBadge configured={Boolean(currentInfo?.provider && currentInfo.model)} loading={loading} />}
            />
            {modelSettings.error ? (
              <PanelNotice title="模型配置暂不可用" description={errorMessage(modelSettings.error)} />
            ) : (
              <div className="grid gap-4 p-4 md:grid-cols-[minmax(180px,0.7fr)_minmax(220px,1fr)_auto] md:items-end">
                <ModelConfigField label="Provider">
                  <Select
                    value={selectedProvider}
                    onValueChange={(value) => {
                      setSelectedProvider(value);
                      setSelectedModel("");
                    }}
                    disabled={loading || providers.length === 0}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="选择 provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {providers.map((provider) => (
                        <SelectItem key={provider.slug} value={provider.slug}>
                          {provider.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </ModelConfigField>

                <ModelConfigField label="模型">
                  <Select
                    value={selectedModel}
                    onValueChange={setSelectedModel}
                    disabled={loading || selectedProviderModels.length === 0}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="选择模型" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedProviderModels.map((model) => (
                        <SelectItem key={model} value={model}>
                          {model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </ModelConfigField>

                <Button type="button" onClick={() => applyMainModel.mutate()} disabled={!canApply}>
                  {applyMainModel.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  应用
                </Button>
              </div>
            )}
          </section>

          <section className="rounded-lg border border-border">
            <SectionHeader icon={<Cpu className="h-4 w-4" />} title="辅助模型" />
            <div className="divide-y divide-border">
              {modelSettings.data?.auxiliary?.tasks.length ? (
                modelSettings.data.auxiliary.tasks.map((task) => (
                  <AuxiliaryModelRow key={task.task} task={task} />
                ))
              ) : (
                <PanelNotice title="没有辅助模型覆盖" description="Hermes 会默认使用主模型处理辅助任务。" />
              )}
            </div>
            <div className="border-t border-border px-4 py-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => resetAuxiliary.mutate()}
                disabled={!currentInfo || resetAuxiliary.isPending}
              >
                {resetAuxiliary.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                全部重置为主模型
              </Button>
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-lg border border-border">
            <SectionHeader icon={<Server className="h-4 w-4" />} title="当前状态" />
            <div className="grid divide-y divide-border">
              <ConfigRow label="Provider" value={currentInfo?.provider ?? "检查中"} mono />
              <ConfigRow label="模型" value={currentInfo?.model ?? "检查中"} mono />
              <ConfigRow label="配置上下文" value={formatOptionalNumber(currentInfo?.config_context_length)} />
              <ConfigRow label="有效上下文" value={formatOptionalNumber(currentInfo?.effective_context_length)} />
              <ConfigRow label="Dashboard" value={status.data?.dashboardRunning ? "运行中" : "未运行"} />
            </div>
          </section>

          <section className="rounded-lg border border-border">
            <SectionHeader icon={<KeyRound className="h-4 w-4" />} title="Provider 凭证" />
            <div className="space-y-3 p-4">
              <ModelConfigField label="环境变量">
                <Select
                  value={credentialKey}
                  onValueChange={setCredentialKey}
                  disabled={credentialEntries.length === 0}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="选择凭证" />
                  </SelectTrigger>
                  <SelectContent>
                    {credentialEntries.map(([key, info]) => (
                      <SelectItem key={key} value={key}>
                        {key}
                        {info.is_set ? " · 已保存" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </ModelConfigField>
              <ModelConfigField label="值">
                <Input
                  type="password"
                  value={credentialValue}
                  onChange={(event) => setCredentialValue(event.target.value)}
                  placeholder={credentialKey ? "输入新的凭证值" : "先选择环境变量"}
                  disabled={!credentialKey}
                  autoComplete="off"
                />
              </ModelConfigField>
              <Button type="button" onClick={() => saveCredential.mutate()} disabled={!canSaveCredential}>
                {saveCredential.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                验证并保存
              </Button>
              <CredentialSummary entries={credentialEntries} />
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function SectionHeader({
  action,
  icon,
  title,
}: {
  action?: ReactNode;
  icon: ReactNode;
  title: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-muted">
          {icon}
        </div>
        <h2 className="text-sm font-medium">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function ModelConfigField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Field className="min-w-0 gap-2">
      <FieldLabel>{label}</FieldLabel>
      {children}
    </Field>
  );
}

function ProviderStatusBadge({ configured, loading }: { configured: boolean; loading: boolean }) {
  if (loading) {
    return (
      <Badge className="border-border bg-secondary text-muted-foreground">
        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        检查中
      </Badge>
    );
  }

  if (configured) {
    return (
      <Badge className="border-green-200 bg-green-50 text-green-700">
        <CheckCircle2 className="mr-1 h-3 w-3" />
        已配置
      </Badge>
    );
  }

  return (
    <Badge className="border-amber-200 bg-amber-50 text-amber-700">
      <CircleAlert className="mr-1 h-3 w-3" />
      待配置
    </Badge>
  );
}

function AuxiliaryModelRow({
  task,
}: {
  task: AuxiliaryModelsResponse["tasks"][number];
}) {
  const title = AUXILIARY_TASK_LABELS[task.task] ?? task.task;
  return (
    <div className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[180px_1fr] md:items-center">
      <div>
        <div className="font-medium text-foreground">{title}</div>
        <div className="mt-1 font-mono text-xs text-muted-foreground">{task.task}</div>
      </div>
      <div className="min-w-0 rounded-md border border-border bg-muted/45 px-3 py-2 font-mono text-xs">
        <span className={cn(!task.provider || task.provider === "auto" ? "text-muted-foreground" : "text-foreground")}>
          {!task.provider || task.provider === "auto" ? "auto · use main model" : `${task.provider} · ${task.model}`}
        </span>
      </div>
    </div>
  );
}

function CredentialSummary({ entries }: { entries: Array<[string, EnvVarInfo]> }) {
  if (entries.length === 0) {
    return <p className="text-xs leading-5 text-muted-foreground">当前 dashboard 没有暴露可编辑的模型凭证。</p>;
  }

  return (
    <div className="space-y-1 border-t border-border pt-3">
      {entries.slice(0, 8).map(([key, info]) => (
        <div key={key} className="flex items-center justify-between gap-3 text-xs">
          <span className="min-w-0 truncate font-mono">{key}</span>
          <Badge className={cn("shrink-0 rounded-md", info.is_set ? "text-green-700" : "text-muted-foreground")}>
            {info.is_set ? "已保存" : "未设置"}
          </Badge>
        </div>
      ))}
    </div>
  );
}

function PanelNotice({ description, title }: { description?: string; title: string }) {
  return (
    <div className="p-4 text-sm">
      <div className="font-medium text-foreground">{title}</div>
      {description ? <div className="mt-1 text-muted-foreground">{description}</div> : null}
    </div>
  );
}

function ConfigRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-3 px-4 py-3 text-sm">
      <div className="text-muted-foreground">{label}</div>
      <div className={cn("min-w-0 truncate", mono && "font-mono text-xs")}>{value}</div>
    </div>
  );
}

function modelCredentialEntries(env: Record<string, EnvVarInfo>): Array<[string, EnvVarInfo]> {
  return Object.entries(env)
    .filter(([, info]) => info.is_password || info.category.toLowerCase().includes("provider"))
    .sort(([leftKey, left], [rightKey, right]) => {
      if (left.is_set !== right.is_set) {
        return left.is_set ? -1 : 1;
      }

      return leftKey.localeCompare(rightKey);
    });
}

function formatOptionalNumber(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : "未设置";
}
