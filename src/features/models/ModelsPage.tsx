import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  CircleAlert,
  KeyRound,
  Loader2,
  RefreshCcw,
  RotateCcw,
  Save,
  Server,
  Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/errors";
import { hermesQueryKeys } from "@/lib/hermes/queries";
import {
  fetchOpenAICompatibleModels,
  getModelConfigStatus,
  getRuntimeStatus,
  isTauriRuntime,
  restartGateway,
  saveOpenAICompatibleModelConfig,
} from "@/lib/tauri";
import { cn } from "@/lib/utils";
import type { OpenAICompatibleModelConfig } from "@/types/hermes";

const DEFAULT_PROVIDER_NAME = "openai-compatible";
const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";

export function ModelsPage() {
  const queryClient = useQueryClient();
  const tauriRuntime = useMemo(() => isTauriRuntime(), []);
  const [name, setName] = useState(DEFAULT_PROVIDER_NAME);
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [contextLength, setContextLength] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [modelsUrl, setModelsUrl] = useState("");

  const status = useQuery({
    queryKey: hermesQueryKeys.modelConfigStatus,
    queryFn: getModelConfigStatus,
  });

  const runtime = useQuery({
    queryKey: hermesQueryKeys.runtimeStatus,
    queryFn: getRuntimeStatus,
    refetchInterval: 15_000,
  });

  useEffect(() => {
    if (!status.data || hydrated) {
      return;
    }

    setName(status.data.name ?? DEFAULT_PROVIDER_NAME);
    setBaseUrl(status.data.baseUrl ?? DEFAULT_BASE_URL);
    setModel(status.data.model ?? DEFAULT_MODEL);
    setHydrated(true);
  }, [hydrated, status.data]);

  const fetchModels = useMutation({
    mutationFn: () => fetchOpenAICompatibleModels({ baseUrl, apiKey }),
    onSuccess: (result) => {
      setAvailableModels(result.models);
      setModelsUrl(result.modelsUrl);
      if (!model.trim() && result.models[0]) {
        setModel(result.models[0]);
      }
      toast.success(`已获取 ${result.models.length} 个模型`);
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });

  const saveConfig = useMutation({
    mutationFn: () => saveOpenAICompatibleModelConfig(buildConfig()),
    onSuccess: (nextStatus) => {
      queryClient.setQueryData(hermesQueryKeys.modelConfigStatus, nextStatus);
      void queryClient.invalidateQueries({ queryKey: hermesQueryKeys.runtimeStatus });
      toast.success("模型配置已保存");
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });

  const restart = useMutation({
    mutationFn: restartGateway,
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: hermesQueryKeys.runtimeStatus });
      if (result.success) {
        toast.success("本地服务已重启");
      } else {
        toast.error(result.stderr || result.stdout || "本地服务重启需要处理");
      }
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });

  const current = status.data;
  const canFetch = Boolean(baseUrl.trim() && apiKey.trim() && !fetchModels.isPending);
  const canSave = Boolean(
    tauriRuntime
    && name.trim()
    && baseUrl.trim()
    && apiKey.trim()
    && model.trim()
    && !saveConfig.isPending,
  );

  function buildConfig(): OpenAICompatibleModelConfig {
    return {
      name: name.trim(),
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      model: model.trim(),
      contextLength: parseContextLength(contextLength),
    };
  }

  return (
    <div>
      <PageHeader
        eyebrow="模型服务"
        title="模型"
        description="配置 OpenAI 兼容提供商，作为 Hermes 的默认模型。"
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => status.refetch()}
              disabled={status.isFetching}
            >
              <RefreshCcw className="h-4 w-4" />
              刷新
            </Button>
            <Button
              variant="outline"
              onClick={() => restart.mutate()}
              disabled={!tauriRuntime || !runtime.data?.installed || restart.isPending}
            >
              {restart.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              重启本地服务
            </Button>
          </>
        }
      />

      <div className="grid gap-4 p-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-lg border border-border">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <h2 className="text-sm font-medium">OpenAI 兼容配置</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                当前写入 Hermes 的 custom provider 配置。
              </p>
            </div>
            <ProviderStatusBadge configured={current?.configured} loading={status.isLoading} />
          </div>

          <div className="grid gap-4 p-4 md:grid-cols-2">
            <ModelConfigField label="配置名称" htmlFor="model-config-name">
              <Input
                id="model-config-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={DEFAULT_PROVIDER_NAME}
                autoComplete="off"
              />
            </ModelConfigField>
            <ModelConfigField label="服务地址" htmlFor="model-config-base-url">
              <Input
                id="model-config-base-url"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder={DEFAULT_BASE_URL}
                autoComplete="off"
              />
            </ModelConfigField>
            <ModelConfigField label="API Key" htmlFor="model-config-api-key">
              <Input
                id="model-config-api-key"
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={current?.hasApiKey ? "已保存，重新保存时需要再次输入" : "sk-..."}
                autoComplete="off"
              />
            </ModelConfigField>
            <ModelConfigField label="默认模型" htmlFor="model-config-model">
              <Input
                id="model-config-model"
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder={DEFAULT_MODEL}
                autoComplete="off"
              />
            </ModelConfigField>
            <ModelConfigField label="上下文长度" htmlFor="model-config-context-length" optional>
              <Input
                id="model-config-context-length"
                value={contextLength}
                onChange={(event) => setContextLength(event.target.value)}
                placeholder="可选"
                inputMode="numeric"
              />
            </ModelConfigField>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => fetchModels.mutate()}
              disabled={!canFetch}
            >
              {fetchModels.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              测试并获取模型
            </Button>
            <Button type="button" onClick={() => saveConfig.mutate()} disabled={!canSave}>
              {saveConfig.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存配置
            </Button>
            {!tauriRuntime ? (
              <span className="text-sm text-muted-foreground">
                浏览器预览不能写入本地配置。
              </span>
            ) : null}
          </div>

          {availableModels.length > 0 ? (
            <div className="border-t border-border p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-medium">模型列表</h3>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{modelsUrl}</p>
                </div>
                <Badge>{availableModels.length} 个模型</Badge>
              </div>
              <div className="grid max-h-72 gap-2 overflow-auto sm:grid-cols-2">
                {availableModels.map((modelId) => (
                  <Button
                    key={modelId}
                    type="button"
                    variant="outline"
                    onClick={() => setModel(modelId)}
                    className={cn(
                      "h-auto w-full min-w-0 justify-start rounded-md px-3 py-2 text-left text-sm",
                      modelId === model && "border-primary bg-accent",
                    )}
                  >
                    <span className="block truncate font-mono text-xs">{modelId}</span>
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <aside className="space-y-4">
          <section className="rounded-lg border border-border">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Server className="h-4 w-4" />
              <h2 className="text-sm font-medium">当前配置</h2>
            </div>
            <div className="grid divide-y divide-border">
              <ConfigRow label="状态" value={current?.configured ? "已配置" : "未配置"} />
              <ConfigRow label="Provider" value={current?.providerKey ?? "未设置"} mono />
              <ConfigRow label="名称" value={current?.name ?? "未设置"} />
              <ConfigRow label="服务地址" value={current?.baseUrl ?? "未设置"} mono />
              <ConfigRow label="默认模型" value={current?.model ?? "未设置"} mono />
              <ConfigRow label="API Key" value={current?.hasApiKey ? "已保存" : "未保存"} />
              <ConfigRow label="配置文件" value={current?.configPath ?? "检查中"} mono />
            </div>
          </section>

          <section className="rounded-lg border border-border">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <KeyRound className="h-4 w-4" />
              <h2 className="text-sm font-medium">写入格式</h2>
            </div>
            <div className="space-y-2 p-4 text-sm">
              <CodeLine label="model.provider" value={`custom:${normalizeProviderName(name)}`} />
              <CodeLine label="model.default" value={model.trim() || DEFAULT_MODEL} />
              <CodeLine label="api_mode" value="chat_completions" />
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function ModelConfigField({
  htmlFor,
  label,
  optional = false,
  children,
}: {
  htmlFor: string;
  label: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <Field className="min-w-0 gap-2">
      <FieldLabel htmlFor={htmlFor}>
        {label}
        {optional ? <span className="text-xs font-normal text-muted-foreground">可选</span> : null}
      </FieldLabel>
      {children}
    </Field>
  );
}

function ProviderStatusBadge({ configured, loading }: { configured?: boolean; loading: boolean }) {
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

function ConfigRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-3 px-4 py-3 text-sm">
      <div className="text-muted-foreground">{label}</div>
      <div className={cn("min-w-0 truncate", mono && "font-mono text-xs")}>{value}</div>
    </div>
  );
}

function CodeLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-muted px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-mono text-xs">{value}</div>
    </div>
  );
}

function parseContextLength(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (!/^\d+$/.test(trimmed)) {
    throw new Error("上下文长度需要是正整数。");
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("上下文长度需要是正整数。");
  }

  return parsed;
}

function normalizeProviderName(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || DEFAULT_PROVIDER_NAME;
}
