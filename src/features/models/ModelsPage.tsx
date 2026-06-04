import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  CheckCircle2,
  CircleAlert,
  Cpu,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  RefreshCcw,
  RotateCcw,
  Save,
  Search,
  Server,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/errors";
import type { HermesApiClient } from "@/lib/hermes/api";
import { ashQueryKeys, useAshApi } from "@/lib/hermes/queries";
import { cn } from "@/lib/utils";
import type {
  AuxiliaryModelsResponse,
  EnvVarInfo,
  HermesConfigRecord,
  ModelInfoResponse,
  ModelOptionProvider,
  ModelOptionsResponse,
} from "@/types/runtime-dashboard";

interface ModelSettingsData {
  auxiliary: AuxiliaryModelsResponse | null;
  info: ModelInfoResponse;
  options: ModelOptionsResponse;
}

interface ProviderSettingsData {
  config: HermesConfigRecord;
  env: Record<string, EnvVarInfo>;
  info: ModelInfoResponse;
  options: ModelOptionsResponse;
}

interface AuxiliaryTaskMeta {
  hint: string;
  key: string;
  label: string;
}

interface ProviderConfigEntry {
  apiKey: string;
  baseUrl: string;
  contextLength: number | null;
  defaultModel: string;
  key: string;
  models: string[];
  name: string;
  source: "custom_providers" | "providers";
}

interface ProviderEditorDraft {
  apiKey: string;
  baseUrl: string;
  contextLength: string;
  defaultModel: string;
  mode: "create" | "edit";
  modelsText: string;
  name: string;
  originalKey?: string;
  originalSource?: ProviderConfigEntry["source"];
  providerKey: string;
}

const auxiliaryTasks = [
  { key: "vision", label: "Vision", hint: "图像理解" },
  { key: "web_extract", label: "Web extract", hint: "网页摘要" },
  { key: "compression", label: "Compression", hint: "上下文压缩" },
  { key: "session_search", label: "Session search", hint: "会话检索" },
  { key: "skills_hub", label: "Skills hub", hint: "技能搜索" },
  { key: "approval", label: "Approval", hint: "智能审批" },
  { key: "mcp", label: "MCP", hint: "MCP 工具路由" },
  { key: "title_generation", label: "Title gen", hint: "标题生成" },
  { key: "curator", label: "Curator", hint: "技能使用复盘" },
] satisfies AuxiliaryTaskMeta[];

export function ModelSettingsPanel() {
  const queryClient = useQueryClient();
  const { apiReady, apiUrl, client, sessionToken, status } = useAshApi();
  const [selectedProvider, setSelectedProvider] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [editingAuxiliaryTask, setEditingAuxiliaryTask] = useState<string | null>(null);
  const [auxiliaryDraft, setAuxiliaryDraft] = useState({ model: "", provider: "" });
  const [hydrated, setHydrated] = useState(false);

  const modelSettings = useQuery({
    enabled: apiReady,
    queryKey: ashQueryKeys.modelSettings(apiUrl, Boolean(sessionToken)),
    queryFn: async (): Promise<ModelSettingsData> => {
      const [info, options, auxiliary] = await Promise.all([
        client.getGlobalModelInfo(),
        client.getGlobalModelOptions(),
        client.getAuxiliaryModels().catch((error: unknown) => {
          console.error("Failed to read auxiliary model assignments", error);
          return null;
        }),
      ]);

      return { auxiliary, info, options };
    },
  });

  const providers = modelSettings.data?.options.providers ?? [];
  const currentInfo = modelSettings.data?.info;
  const selectedProviderModels = useMemo(
    () => providers.find((provider) => provider.slug === selectedProvider)?.models ?? [],
    [providers, selectedProvider],
  );
  const auxiliaryDraftProviderModels = useMemo(
    () => providers.find((provider) => provider.slug === auxiliaryDraft.provider)?.models ?? [],
    [auxiliaryDraft.provider, providers],
  );

  useEffect(() => {
    if (!modelSettings.data || hydrated) {
      return;
    }

    setSelectedProvider(modelSettings.data.info.provider);
    setSelectedModel(modelSettings.data.info.model);
    setHydrated(true);
  }, [hydrated, modelSettings.data]);

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: ashQueryKeys.modelSettings(apiUrl, Boolean(sessionToken)),
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
      void queryClient.invalidateQueries({ queryKey: ashQueryKeys.models(apiUrl, Boolean(sessionToken)) });
      toast.success("主模型已更新");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const restartGateway = useMutation({
    mutationFn: () => client.restartGateway(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ashQueryKeys.runtimeStatus });
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

  const setAuxiliaryToMain = useMutation({
    mutationFn: async (task: string) => {
      if (!currentInfo) {
        throw new Error("当前主模型还没有加载。");
      }

      return client.setModelAssignment({
        scope: "auxiliary",
        task,
        provider: currentInfo.provider,
        model: currentInfo.model,
      });
    },
    onSuccess: () => {
      void refresh();
      toast.success("辅助模型已设为主模型");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const applyAuxiliaryModel = useMutation({
    mutationFn: async ({ model, provider, task }: { model: string; provider: string; task: string }) => {
      if (!provider || !model) {
        throw new Error("请选择 provider 和模型。");
      }

      return client.setModelAssignment({
        scope: "auxiliary",
        task,
        provider,
        model,
      });
    },
    onSuccess: () => {
      setEditingAuxiliaryTask(null);
      void refresh();
      toast.success("辅助模型已更新");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const loading = modelSettings.isLoading && !modelSettings.data;
  const canApply = Boolean(selectedProvider && selectedModel && !applyMainModel.isPending);
  const auxiliaryApplying = setAuxiliaryToMain.isPending || applyAuxiliaryModel.isPending || resetAuxiliary.isPending;

  function beginAuxiliaryEdit(task: string) {
    const current = modelSettings.data?.auxiliary?.tasks.find((entry) => entry.task === task);
    const provider = current?.provider && current.provider !== "auto"
      ? current.provider
      : currentInfo?.provider ?? providers[0]?.slug ?? "";
    const providerModels = providers.find((item) => item.slug === provider)?.models ?? [];
    const model = current?.model || currentInfo?.model || providerModels[0] || "";

    setAuxiliaryDraft({ provider, model });
    setEditingAuxiliaryTask(task);
  }

  function updateAuxiliaryDraftProvider(provider: string) {
    const firstModel = providers.find((item) => item.slug === provider)?.models?.[0] ?? "";
    setAuxiliaryDraft({ provider, model: firstModel });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
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
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
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
            <div className="border-b border-border px-4 py-3 text-xs leading-5 text-muted-foreground">
              辅助任务默认跟随主模型；为某个任务单独选择模型后，本地引擎会只在该任务上使用这个覆盖配置。
            </div>
            <div className="divide-y divide-border">
              {auxiliaryTasks.map((task) => (
                <AuxiliaryModelRow
                  key={task.key}
                  applying={auxiliaryApplying}
                  current={modelSettings.data?.auxiliary?.tasks.find((entry) => entry.task === task.key)}
                  editing={editingAuxiliaryTask === task.key}
                  draft={auxiliaryDraft}
                  draftModels={auxiliaryDraftProviderModels}
                  mainModel={currentInfo}
                  providers={providers}
                  task={task}
                  onApply={() =>
                    applyAuxiliaryModel.mutate({
                      task: task.key,
                      provider: auxiliaryDraft.provider,
                      model: auxiliaryDraft.model,
                    })}
                  onCancel={() => setEditingAuxiliaryTask(null)}
                  onChangeModel={(model) => setAuxiliaryDraft((current) => ({ ...current, model }))}
                  onChangeProvider={updateAuxiliaryDraftProvider}
                  onEdit={() => beginAuxiliaryEdit(task.key)}
                  onSetToMain={() => setAuxiliaryToMain.mutate(task.key)}
                />
              ))}
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
        </aside>
      </div>
    </div>
  );
}

export function ProviderSettingsPanel() {
  const queryClient = useQueryClient();
  const { apiReady, apiUrl, client, sessionToken, status } = useAshApi();
  const [selectedProviderSlug, setSelectedProviderSlug] = useState("");
  const [providerSearch, setProviderSearch] = useState("");
  const [providerModelSearch, setProviderModelSearch] = useState("");
  const [providerEditorDraft, setProviderEditorDraft] = useState<ProviderEditorDraft | null>(null);

  const providerSettingsKey = ["ash-provider-settings", apiUrl, Boolean(sessionToken)] as const;
  const providerSettings = useQuery({
    enabled: apiReady,
    queryKey: providerSettingsKey,
    queryFn: async (): Promise<ProviderSettingsData> => {
      const [info, options, env, config] = await Promise.all([
        client.getGlobalModelInfo(),
        client.getGlobalModelOptions(),
        client.getEnvVars(),
        client.getHermesConfigRecord(),
      ]);

      return { config, env, info, options };
    },
  });

  const providers = providerSettings.data?.options.providers ?? [];
  const currentInfo = providerSettings.data?.info;
  const envVars = providerSettings.data?.env ?? {};
  const configEntries = useMemo(
    () => extractProviderConfigEntries(providerSettings.data?.config),
    [providerSettings.data?.config],
  );
  const visibleProviders = useMemo(
    () => providerOptionsWithConfigEntries(providers, configEntries),
    [configEntries, providers],
  );
  const loading = providerSettings.isLoading && !providerSettings.data;

  useEffect(() => {
    if (visibleProviders.length === 0) {
      return;
    }

    const preferred = currentInfo?.provider && visibleProviders.some((provider) => provider.slug === currentInfo.provider)
      ? currentInfo.provider
      : visibleProviders[0]?.slug;
    if (!selectedProviderSlug || !visibleProviders.some((provider) => provider.slug === selectedProviderSlug)) {
      setSelectedProviderSlug(preferred ?? "");
      setProviderModelSearch("");
    }
  }, [currentInfo?.provider, selectedProviderSlug, visibleProviders]);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: providerSettingsKey }),
      queryClient.invalidateQueries({ queryKey: ashQueryKeys.modelSettings(apiUrl, Boolean(sessionToken)) }),
      queryClient.invalidateQueries({ queryKey: ashQueryKeys.models(apiUrl, Boolean(sessionToken)) }),
    ]);

  const restartGateway = useMutation({
    mutationFn: () => client.restartGateway(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ashQueryKeys.runtimeStatus });
      toast.success("Gateway 已重启");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const saveProviderConfig = useMutation({
    mutationFn: async (draft: ProviderEditorDraft) => {
      const nextConfig = updateProviderConfig(providerSettings.data?.config, draft);
      return client.saveHermesConfig(nextConfig);
    },
    onSuccess: () => {
      setProviderEditorDraft(null);
      void refresh();
      toast.success("服务商配置已保存");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const removeProviderConfig = useMutation({
    mutationFn: async (entry: ProviderConfigEntry) => {
      const nextConfig = removeProviderConfigEntry(providerSettings.data?.config, entry);
      return client.saveHermesConfig(nextConfig);
    },
    onSuccess: () => {
      setProviderEditorDraft(null);
      void refresh();
      toast.success("服务商配置已删除");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  function beginCreateProvider() {
    setProviderEditorDraft({
      apiKey: "",
      baseUrl: "",
      contextLength: "",
      defaultModel: "",
      mode: "create",
      modelsText: "",
      name: "",
      providerKey: "",
    });
  }

  function beginEditProvider(provider: ModelOptionProvider) {
    const entry = findProviderConfigEntry(configEntries, provider.slug);
    if (!entry) {
      toast.info("内置服务商可直接编辑 API Key / Base URL；新增自定义服务商请使用添加按钮。");
      return;
    }

    setProviderEditorDraft(providerDraftFromConfig(entry));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => void providerSettings.refetch()}
          disabled={providerSettings.isFetching}
        >
          {providerSettings.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
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
      </div>

      {providerSettings.error ? (
        <PanelNotice title="服务商配置暂不可用" description={errorMessage(providerSettings.error)} />
      ) : null}

      <ProviderConfigurationSection
        client={client}
        configEntries={configEntries}
        currentInfo={currentInfo}
        editorDraft={providerEditorDraft}
        envVars={envVars}
        loading={loading}
        modelSearch={providerModelSearch}
        providers={visibleProviders}
        saving={saveProviderConfig.isPending || removeProviderConfig.isPending}
        search={providerSearch}
        selectedProviderSlug={selectedProviderSlug}
        onAddProvider={beginCreateProvider}
        onChanged={() => void refresh()}
        onChangeEditorDraft={setProviderEditorDraft}
        onDeleteProvider={(entry) => removeProviderConfig.mutate(entry)}
        onEditProvider={beginEditProvider}
        onModelSearchChange={setProviderModelSearch}
        onSaveProvider={(draft) => saveProviderConfig.mutate(draft)}
        onSearchChange={setProviderSearch}
        onSelectProvider={(provider) => {
          setSelectedProviderSlug(provider);
          setProviderModelSearch("");
        }}
      />

      <ProviderSummaryCard envVars={envVars} />
    </div>
  );
}

function ProviderConfigurationSection({
  client,
  configEntries,
  currentInfo,
  editorDraft,
  envVars,
  loading,
  modelSearch,
  onAddProvider,
  onChanged,
  onChangeEditorDraft,
  onDeleteProvider,
  onEditProvider,
  onModelSearchChange,
  onSaveProvider,
  onSearchChange,
  onSelectProvider,
  providers,
  saving,
  search,
  selectedProviderSlug,
}: {
  client: HermesApiClient;
  configEntries: ProviderConfigEntry[];
  currentInfo?: ModelInfoResponse;
  editorDraft: ProviderEditorDraft | null;
  envVars: Record<string, EnvVarInfo>;
  loading: boolean;
  modelSearch: string;
  onAddProvider: () => void;
  onChanged: () => void;
  onChangeEditorDraft: (draft: ProviderEditorDraft | null) => void;
  onDeleteProvider: (entry: ProviderConfigEntry) => void;
  onEditProvider: (provider: ModelOptionProvider) => void;
  onModelSearchChange: (value: string) => void;
  onSaveProvider: (draft: ProviderEditorDraft) => void;
  onSearchChange: (value: string) => void;
  onSelectProvider: (provider: string) => void;
  providers: ModelOptionProvider[];
  saving: boolean;
  search: string;
  selectedProviderSlug: string;
}) {
  const selectedProvider = providers.find((provider) => provider.slug === selectedProviderSlug) ?? providers[0];
  const selectedConfigEntry = selectedProvider ? findProviderConfigEntry(configEntries, selectedProvider.slug) : undefined;
  const filteredProviders = providers.filter((provider) => {
    const needle = search.trim().toLowerCase();
    if (!needle) {
      return true;
    }

    return `${provider.name} ${provider.slug}`.toLowerCase().includes(needle);
  });
  const credentialEntries = selectedProvider ? providerEnvEntries(selectedProvider, envVars) : [];
  const keyEntries = credentialEntries.filter(([key, info]) => isSecretEnv(key, info));
  const endpointEntries = credentialEntries.filter(([key, info]) => !isSecretEnv(key, info) && isEndpointEnv(key));
  const otherEntries = credentialEntries.filter(([key, info]) => !isSecretEnv(key, info) && !isEndpointEnv(key));
  const filteredModels = providerModelsForSearch(selectedProvider, modelSearch);
  const unavailableModels = new Set(selectedProvider?.unavailable_models ?? []);
  const selectedReady = selectedProvider
    ? providerConfigured(selectedProvider, envVars, currentInfo) || providerConfigConfigured(selectedConfigEntry)
    : false;
  const providerCount = providers.length;

  return (
    <section className="overflow-hidden rounded-lg border border-border">
      <SectionHeader
        icon={<KeyRound className="h-4 w-4" />}
        title="供应商配置"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border-border bg-secondary text-muted-foreground">
              {providerCount ? `${providerCount} 个 provider` : loading ? "检查中" : "未返回 provider"}
            </Badge>
            <Button type="button" size="sm" onClick={onAddProvider}>
              <Plus className="h-4 w-4" />
              添加服务商
            </Button>
          </div>
        }
      />

      <div className="grid min-h-[420px] lg:grid-cols-[250px_minmax(0,1fr)]">
        <div className="border-b border-border bg-muted/20 lg:border-b-0 lg:border-r">
          <div className="border-b border-border p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                className="h-9 pl-8"
                placeholder="搜索服务商..."
              />
            </div>
          </div>
          <div className="max-h-[520px] overflow-y-auto p-2">
            {filteredProviders.length ? (
              <div className="space-y-1">
                {filteredProviders.map((provider) => (
                  <ProviderListButton
                    key={provider.slug}
                    active={provider.slug === selectedProvider?.slug}
                    configured={
                      providerConfigured(provider, envVars, currentInfo)
                      || providerConfigConfigured(findProviderConfigEntry(configEntries, provider.slug))
                    }
                    current={currentInfo?.provider === provider.slug}
                    provider={provider}
                    onSelect={() => onSelectProvider(provider.slug)}
                  />
                ))}
              </div>
            ) : (
              <div className="px-2 py-8 text-center text-xs text-muted-foreground">没有匹配的供应商。</div>
            )}
          </div>
        </div>

        {selectedProvider ? (
          <div className="min-w-0 p-4">
            <div className="flex flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-lg font-semibold tracking-normal">{selectedProvider.name}</div>
                  <Badge className="font-mono text-[11px]">{selectedProvider.slug}</Badge>
                  {currentInfo?.provider === selectedProvider.slug ? (
                    <Badge className="border-primary/20 bg-primary/10 text-primary">主模型使用中</Badge>
                  ) : null}
                  {selectedProvider.warning ? (
                    <Badge className="border-amber-200 bg-amber-50 text-amber-700">需要注意</Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {selectedReady ? "该供应商已有可用凭证或正在作为主模型使用。" : "配置 API Key 或代理地址后即可在主模型和辅助任务中使用。"}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <ProviderStatusBadge configured={selectedReady} loading={loading} />
                <Button type="button" variant="outline" size="sm" onClick={() => onEditProvider(selectedProvider)}>
                  <Pencil className="h-4 w-4" />
                  编辑
                </Button>
                {selectedConfigEntry ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (window.confirm(`确定删除服务商 ${selectedConfigEntry.name} 吗？`)) {
                        onDeleteProvider(selectedConfigEntry);
                      }
                    }}
                    disabled={saving}
                  >
                    <Trash2 className="h-4 w-4" />
                    删除
                  </Button>
                ) : null}
              </div>
            </div>

            {editorDraft ? (
              <ProviderEditorForm
                draft={editorDraft}
                saving={saving}
                onCancel={() => onChangeEditorDraft(null)}
                onChange={onChangeEditorDraft}
                onSave={onSaveProvider}
              />
            ) : null}

            <div className="grid gap-6 py-5">
              <ProviderEnvGroup
                client={client}
                entries={keyEntries}
                emptyText="这个供应商没有在 dashboard 暴露专属 API Key 字段。"
                title="API Key"
                onChanged={onChanged}
              />
              <ProviderEnvGroup
                client={client}
                entries={endpointEntries}
                emptyText="这个供应商没有可编辑的代理地址字段。"
                title="API 代理地址"
                onChanged={onChanged}
              />
              {otherEntries.length ? (
                <ProviderEnvGroup
                  client={client}
                  entries={otherEntries}
                  emptyText=""
                  title="其他配置"
                  onChanged={onChanged}
                />
              ) : null}
            </div>

            <div className="border-t border-border pt-4">
              <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-sm font-semibold">模型列表</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    共 {selectedProvider.models?.length ?? 0} 个模型可用。
                  </p>
                </div>
                <div className="relative w-full md:w-[240px]">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={modelSearch}
                    onChange={(event) => onModelSearchChange(event.target.value)}
                    className="h-9 pl-8"
                    placeholder="搜索模型..."
                  />
                </div>
              </div>

              {filteredModels.length ? (
                <div className="divide-y divide-border rounded-md border border-border">
                  {filteredModels.slice(0, 30).map((model) => (
                    <ProviderModelRow
                      key={model}
                      capabilities={selectedProvider.capabilities?.[model]}
                      current={currentInfo?.provider === selectedProvider.slug && currentInfo.model === model}
                      model={model}
                      pricing={selectedProvider.pricing?.[model]}
                      unavailable={unavailableModels.has(model)}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-border p-4 text-sm text-muted-foreground">
                  {modelSearch.trim() ? "没有匹配的模型。" : "这个供应商暂时没有返回模型列表。"}
                </div>
              )}
              {filteredModels.length > 30 ? (
                <div className="mt-2 text-xs text-muted-foreground">
                  只显示前 30 个结果，可以继续搜索缩小范围。
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="min-h-[360px] p-4">
            {editorDraft ? (
              <ProviderEditorForm
                draft={editorDraft}
                saving={saving}
                onCancel={() => onChangeEditorDraft(null)}
                onChange={onChangeEditorDraft}
                onSave={onSaveProvider}
              />
            ) : (
              <div className="flex min-h-[320px] items-center justify-center text-sm text-muted-foreground">
                {loading ? "正在读取供应商配置..." : "本地 dashboard 没有返回可配置供应商，可以点击添加服务商。"}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function ProviderEditorForm({
  draft,
  onCancel,
  onChange,
  onSave,
  saving,
}: {
  draft: ProviderEditorDraft;
  onCancel: () => void;
  onChange: (draft: ProviderEditorDraft) => void;
  onSave: (draft: ProviderEditorDraft) => void;
  saving: boolean;
}) {
  const canSave = Boolean(draft.name.trim() && draft.providerKey.trim() && draft.baseUrl.trim() && draft.defaultModel.trim());

  function updateDraft(patch: Partial<ProviderEditorDraft>) {
    onChange({ ...draft, ...patch });
  }

  return (
    <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
      <div className="mb-4 flex flex-col gap-1">
        <h3 className="text-sm font-semibold">
          {draft.mode === "create" ? "添加服务商" : "编辑服务商"}
        </h3>
        <p className="text-xs leading-5 text-muted-foreground">
          保存后会写入运行时 config.yaml 的 providers 配置；适合 OpenAI-compatible 网关、Ollama / vLLM / LM Studio 等自定义端点。
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <ModelConfigField label="显示名称">
          <Input
            value={draft.name}
            onChange={(event) => {
              const name = event.target.value;
              updateDraft({
                name,
                providerKey: draft.mode === "create" ? slugifyProviderKey(name) : draft.providerKey,
              });
            }}
            placeholder="例如：OpenRouter 自定义"
          />
        </ModelConfigField>
        <ModelConfigField label="Provider Key">
          <Input
            value={draft.providerKey}
            onChange={(event) => updateDraft({ providerKey: slugifyProviderKey(event.target.value) })}
            placeholder="例如：openrouter-custom"
            disabled={draft.mode === "edit" && draft.originalSource === "custom_providers"}
          />
        </ModelConfigField>
        <ModelConfigField label="Base URL">
          <Input
            value={draft.baseUrl}
            onChange={(event) => updateDraft({ baseUrl: event.target.value })}
            placeholder="https://api.example.com/v1"
          />
        </ModelConfigField>
        <ModelConfigField label="API Key">
          <Input
            value={draft.apiKey}
            onChange={(event) => updateDraft({ apiKey: event.target.value })}
            placeholder="本地模型可留空"
            type="password"
            autoComplete="off"
          />
        </ModelConfigField>
        <ModelConfigField label="默认模型">
          <Input
            value={draft.defaultModel}
            onChange={(event) => updateDraft({ defaultModel: event.target.value })}
            placeholder="例如：gpt-4.1-mini"
          />
        </ModelConfigField>
        <ModelConfigField label="上下文长度">
          <Input
            value={draft.contextLength}
            onChange={(event) => updateDraft({ contextLength: event.target.value.replace(/[^\d]/g, "") })}
            placeholder="可选，例如：128000"
            inputMode="numeric"
          />
        </ModelConfigField>
      </div>

      <div className="mt-3">
        <ModelConfigField label="模型列表（可选）">
          <Textarea
            value={draft.modelsText}
            onChange={(event) => updateDraft({ modelsText: event.target.value })}
            placeholder={"可留空；默认模型会自动写入\n每行一个额外模型 ID"}
            className="min-h-28 font-mono"
          />
        </ModelConfigField>
      </div>

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          取消
        </Button>
        <Button type="button" onClick={() => onSave(draft)} disabled={!canSave || saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          保存服务商
        </Button>
      </div>
    </div>
  );
}

function ProviderListButton({
  active,
  configured,
  current,
  onSelect,
  provider,
}: {
  active: boolean;
  configured: boolean;
  current: boolean;
  onSelect: () => void;
  provider: ModelOptionProvider;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent/70",
        active && "bg-accent text-accent-foreground",
      )}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{provider.name}</span>
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
          {provider.models?.length ?? provider.total_models ?? 0} models
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        {current ? <span className="h-1.5 w-1.5 rounded-full bg-primary" title="主模型使用中" /> : null}
        {configured ? (
          <Check className="h-3.5 w-3.5 text-emerald-600" />
        ) : (
          <CircleAlert className="h-3.5 w-3.5 text-muted-foreground/70" />
        )}
      </span>
    </button>
  );
}

function ProviderEnvGroup({
  client,
  emptyText,
  entries,
  onChanged,
  title,
}: {
  client: HermesApiClient;
  emptyText: string;
  entries: Array<[string, EnvVarInfo]>;
  onChanged: () => void;
  title: string;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-3 space-y-2">
        {entries.length ? (
          entries.map(([key, info]) => (
            <ProviderEnvVarRow key={key} client={client} envKey={key} info={info} onChanged={onChanged} />
          ))
        ) : (
          <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
            {emptyText}
          </div>
        )}
      </div>
    </div>
  );
}

function ProviderEnvVarRow({
  client,
  envKey,
  info,
  onChanged,
}: {
  client: HermesApiClient;
  envKey: string;
  info: EnvVarInfo;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    const nextValue = value.trim();
    if (!nextValue) {
      return;
    }

    setBusy(true);
    try {
      const probe = await client.validateProviderCredential(envKey, nextValue);
      if (!probe.ok && probe.reachable) {
        throw new Error(probe.message || "Provider 拒绝了这个配置。");
      }

      await client.setEnvVar(envKey, nextValue);
      setEditing(false);
      setValue("");
      setRevealed(null);
      onChanged();

      if (probe.reachable) {
        toast.success(`${envKey} 已验证并保存`);
      } else {
        toast.warning(`${envKey} 已保存，但当前无法在线验证`);
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleReveal() {
    if (revealed !== null) {
      setRevealed(null);
      return;
    }

    setBusy(true);
    try {
      const result = await client.revealEnvVar(envKey);
      setRevealed(result.value);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleClear() {
    if (!window.confirm(`确定移除 ${envKey} 吗？`)) {
      return;
    }

    setBusy(true);
    try {
      await client.deleteEnvVar(envKey);
      setEditing(false);
      setValue("");
      setRevealed(null);
      onChanged();
      toast.success(`${envKey} 已移除`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-medium">{envKey}</span>
            <CredentialBadge isSet={info.is_set} />
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {info.description || info.category || "本地 dashboard 暴露的供应商配置。"}
          </p>
          {info.redacted_value ? (
            <div className="mt-2 font-mono text-xs text-muted-foreground">{info.redacted_value}</div>
          ) : null}
          {revealed !== null ? (
            <div className="mt-2 break-all rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs">
              {revealed || "(empty)"}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap justify-start gap-1.5 md:justify-end">
          {info.url ? (
            <Button asChild variant="ghost" size="sm">
              <a href={info.url} target="_blank" rel="noreferrer">
                文档
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          ) : null}
          {info.is_set ? (
            <Button type="button" variant="ghost" size="icon" onClick={() => void handleReveal()} disabled={busy} title="查看值">
              {revealed !== null ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing((current) => !current)}>
            {info.is_set ? "替换" : "设置"}
          </Button>
          {info.is_set ? (
            <Button type="button" variant="ghost" size="icon" onClick={() => void handleClear()} disabled={busy} title="移除">
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>

      {editing ? (
        <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center">
          <Input
            autoFocus
            className="font-mono"
            type={info.is_password ? "password" : "text"}
            placeholder={envKey}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <Button type="button" onClick={() => void handleSave()} disabled={busy || !value.trim()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            保存
          </Button>
          <Button type="button" variant="outline" onClick={() => setEditing(false)} disabled={busy}>
            取消
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ProviderModelRow({
  capabilities,
  current,
  model,
  pricing,
  unavailable,
}: {
  capabilities?: { fast: boolean; reasoning: boolean };
  current: boolean;
  model: string;
  pricing?: { cache: null | string; free: boolean; input: string; output: string };
  unavailable: boolean;
}) {
  return (
    <div className="grid gap-2 px-3 py-2.5 text-sm md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate font-medium">{model}</span>
          {current ? <Badge className="border-primary/20 bg-primary/10 text-primary">当前</Badge> : null}
          {unavailable ? <Badge className="border-amber-200 bg-amber-50 text-amber-700">不可用</Badge> : null}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {pricing ? modelPricingLabel(pricing) : "价格信息未返回"}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-1.5">
        {capabilities?.reasoning ? <Badge className="bg-blue-50 text-blue-700">reasoning</Badge> : null}
        {capabilities?.fast ? <Badge className="bg-green-50 text-green-700">fast</Badge> : null}
        {pricing?.free ? <Badge className="bg-emerald-50 text-emerald-700">free</Badge> : null}
      </div>
    </div>
  );
}

function ProviderSummaryCard({ envVars }: { envVars: Record<string, EnvVarInfo> }) {
  const entries = modelCredentialEntries(envVars);
  const configured = entries.filter(([, info]) => info.is_set).length;

  return (
    <section className="rounded-lg border border-border">
      <SectionHeader icon={<KeyRound className="h-4 w-4" />} title="凭证概览" />
      <div className="grid divide-y divide-border">
        <ConfigRow label="已保存" value={`${configured}/${entries.length}`} />
        <ConfigRow label="API Key" value={String(entries.filter(([key, info]) => isSecretEnv(key, info)).length)} />
        <ConfigRow label="代理地址" value={String(entries.filter(([key]) => isEndpointEnv(key)).length)} />
      </div>
    </section>
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
  applying,
  current,
  draft,
  draftModels,
  editing,
  mainModel,
  onApply,
  onCancel,
  onChangeModel,
  onChangeProvider,
  onEdit,
  onSetToMain,
  providers,
  task,
}: {
  applying: boolean;
  current?: AuxiliaryModelsResponse["tasks"][number];
  draft: { model: string; provider: string };
  draftModels: string[];
  editing: boolean;
  mainModel?: ModelInfoResponse;
  onApply: () => void;
  onCancel: () => void;
  onChangeModel: (model: string) => void;
  onChangeProvider: (provider: string) => void;
  onEdit: () => void;
  onSetToMain: () => void;
  providers: ModelOptionProvider[];
  task: AuxiliaryTaskMeta;
}) {
  const usesMainModel = !current || !current.provider || current.provider === "auto";
  const assignmentLabel = usesMainModel
    ? "auto · use main model"
    : `${current.provider} · ${current.model || "(provider default)"}`;

  return (
    <div className="px-4 py-3 text-sm">
      <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)_auto] md:items-center">
        <div>
          <div className="font-medium text-foreground">{task.label}</div>
          <div className="mt-1 text-xs text-muted-foreground">{task.hint}</div>
        </div>
        <div className="min-w-0 rounded-md border border-border bg-muted/45 px-3 py-2 font-mono text-xs">
          <span className={cn(usesMainModel ? "text-muted-foreground" : "text-foreground")}>
            {assignmentLabel}
          </span>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onSetToMain}
            disabled={!mainModel || applying}
          >
            设为主模型
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onEdit}
            disabled={providers.length === 0 || applying}
          >
            修改
          </Button>
        </div>
      </div>
      {editing ? (
        <div className="mt-3 grid gap-3 rounded-md border border-border bg-muted/30 p-3 md:grid-cols-[minmax(180px,0.7fr)_minmax(220px,1fr)_auto] md:items-end">
          <ModelConfigField label="Provider">
            <Select
              value={draft.provider}
              onValueChange={onChangeProvider}
              disabled={applying || providers.length === 0}
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
              value={draft.model}
              onValueChange={onChangeModel}
              disabled={applying || draftModels.length === 0}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择模型" />
              </SelectTrigger>
              <SelectContent>
                {draftModels.map((model) => (
                  <SelectItem key={model} value={model}>
                    {model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </ModelConfigField>

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={applying}
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={onApply}
              disabled={!draft.provider || !draft.model || applying}
            >
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              应用
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CredentialBadge({ isSet }: { isSet: boolean }) {
  return (
    <Badge className={cn("shrink-0 rounded-md", isSet ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "text-muted-foreground")}>
      {isSet ? "已保存" : "未设置"}
    </Badge>
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
    .filter(([key, info]) => isModelCredentialEnv(key, info))
    .sort(([leftKey, left], [rightKey, right]) => {
      if (left.is_set !== right.is_set) {
        return left.is_set ? -1 : 1;
      }

      return leftKey.localeCompare(rightKey);
    });
}

function providerEnvEntries(provider: ModelOptionProvider, env: Record<string, EnvVarInfo>) {
  const entries = modelCredentialEntries(env);
  const aliases = providerAliases(provider);
  const matched = entries.filter(([key, info]) => includesAny(normalizedEnvHaystack(key, info), aliases));

  return matched.length ? matched : [];
}

function providerConfigured(
  provider: ModelOptionProvider,
  env: Record<string, EnvVarInfo>,
  currentInfo?: ModelInfoResponse,
) {
  if (currentInfo?.provider === provider.slug || provider.is_current) {
    return true;
  }

  return providerEnvEntries(provider, env).some(([, info]) => Boolean(info.is_set));
}

function providerConfigConfigured(entry: ProviderConfigEntry | undefined) {
  return Boolean(entry?.apiKey || entry?.baseUrl);
}

function providerOptionsWithConfigEntries(
  providers: ModelOptionProvider[],
  entries: ProviderConfigEntry[],
): ModelOptionProvider[] {
  const seen = new Set(providers.map((provider) => normalizeProviderKey(provider.slug)));
  const merged = [...providers];
  for (const entry of entries) {
    const normalizedKey = normalizeProviderKey(entry.key);
    if (seen.has(normalizedKey)) {
      continue;
    }

    seen.add(normalizedKey);
    merged.push({
      name: entry.name,
      slug: entry.key,
      models: entry.models,
      total_models: entry.models.length,
    });
  }

  return merged;
}

function providerModelsForSearch(provider: ModelOptionProvider | undefined, search: string) {
  const models = provider?.models ?? [];
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return models;
  }

  return models.filter((model) => model.toLowerCase().includes(needle));
}

function isModelCredentialEnv(key: string, info: EnvVarInfo) {
  const normalizedKey = key.toUpperCase();
  const category = safeLower(info.category);
  const description = safeLower(info.description);
  return (
    Boolean(info.is_password)
    || normalizedKey.includes("API_KEY")
    || normalizedKey.includes("ACCESS_TOKEN")
    || normalizedKey.includes("BASE_URL")
    || normalizedKey.includes("ENDPOINT")
    || category.includes("provider")
    || category.includes("model")
    || category.includes("llm")
    || description.includes("provider")
    || description.includes("model")
    || description.includes("api key")
  );
}

function isSecretEnv(key: string, info: EnvVarInfo) {
  const normalizedKey = key.toUpperCase();
  return Boolean(info.is_password)
    || normalizedKey.includes("API_KEY")
    || normalizedKey.includes("TOKEN")
    || normalizedKey.includes("SECRET");
}

function isEndpointEnv(key: string) {
  const normalizedKey = key.toUpperCase();
  return normalizedKey.includes("BASE_URL")
    || normalizedKey.includes("ENDPOINT")
    || normalizedKey.endsWith("_URL");
}

function providerAliases(provider: ModelOptionProvider) {
  const seeds = [
    provider.slug,
    provider.name,
    ...provider.slug.split(/[-_]/),
    ...provider.name.split(/[-_\s]/),
  ];
  const aliasMap: Record<string, string[]> = {
    anthropic: ["anthropic", "claude"],
    azure: ["azure", "openai"],
    bedrock: ["bedrock", "aws"],
    deepseek: ["deepseek"],
    gemini: ["gemini", "google"],
    google: ["google", "gemini"],
    kimi: ["kimi", "moonshot"],
    lmstudio: ["lmstudio", "lm_studio", "lm studio"],
    moonshot: ["moonshot", "kimi"],
    nous: ["nous"],
    ollama: ["ollama"],
    openai: ["openai"],
    openrouter: ["openrouter"],
    qwen: ["qwen", "dashscope", "aliyun", "bailian"],
    xai: ["xai", "grok"],
    xiaomi: ["xiaomi", "mimo"],
  };
  const normalizedSeeds = seeds.map(normalizeSearchText).filter(Boolean);
  const mapped = normalizedSeeds.flatMap((seed) => aliasMap[seed] ?? []);

  return [...new Set([...normalizedSeeds, ...mapped.map(normalizeSearchText)].filter(Boolean))];
}

function normalizedEnvHaystack(key: string, info: EnvVarInfo) {
  return normalizeSearchText([
    key,
    info.category,
    info.description,
    info.url,
    ...(Array.isArray(info.tools) ? info.tools : []),
  ].filter(Boolean).join(" "));
}

function includesAny(haystack: string, needles: string[]) {
  return needles.some((needle) => needle && haystack.includes(needle));
}

function normalizeSearchText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function safeLower(value: unknown) {
  return String(value ?? "").toLowerCase();
}

function modelPricingLabel(pricing: { cache: null | string; free: boolean; input: string; output: string }) {
  if (pricing.free) {
    return "免费";
  }

  const pieces = [
    pricing.input ? `输入 ${pricing.input}/M` : "",
    pricing.output ? `输出 ${pricing.output}/M` : "",
    pricing.cache ? `缓存 ${pricing.cache}/M` : "",
  ].filter(Boolean);

  return pieces.length ? pieces.join(" · ") : "价格信息未返回";
}

function extractProviderConfigEntries(config: HermesConfigRecord | undefined): ProviderConfigEntry[] {
  const entries: ProviderConfigEntry[] = [];
  const providers = asRecord(config?.providers);
  if (providers) {
    for (const [key, value] of Object.entries(providers)) {
      const entry = providerConfigEntryFromRecord(key, asRecord(value), "providers");
      if (entry) {
        entries.push(entry);
      }
    }
  }

  const customProviders = Array.isArray(config?.custom_providers) ? config.custom_providers : [];
  for (const value of customProviders) {
    const record = asRecord(value);
    const key = slugifyProviderKey(readString(record, "name"));
    const entry = providerConfigEntryFromRecord(key, record, "custom_providers");
    if (entry) {
      entries.push(entry);
    }
  }

  return entries;
}

function providerConfigEntryFromRecord(
  key: string,
  record: Record<string, unknown> | null,
  source: ProviderConfigEntry["source"],
): ProviderConfigEntry | null {
  if (!record) {
    return null;
  }

  const baseUrl = readFirstString(record, ["base_url", "api", "url"]);
  if (!baseUrl) {
    return null;
  }

  const defaultModel = readFirstString(record, ["default_model", "model"]);
  const models = modelsFromConfig(record.models, defaultModel);
  const contextLength = readPositiveInteger(record.context_length) ?? contextLengthFromModels(record.models, defaultModel);

  return {
    apiKey: readString(record, "api_key"),
    baseUrl,
    contextLength,
    defaultModel,
    key: key.trim(),
    models,
    name: readString(record, "name") || key,
    source,
  };
}

function findProviderConfigEntry(entries: ProviderConfigEntry[], slug: string) {
  const normalizedSlug = normalizeProviderKey(slug);
  return entries.find((entry) => {
    const normalizedKey = normalizeProviderKey(entry.key);
    const customKey = normalizeProviderKey(`custom:${entry.key}`);
    const nameSlug = normalizeProviderKey(slugifyProviderKey(entry.name));
    const customNameSlug = normalizeProviderKey(`custom:${slugifyProviderKey(entry.name)}`);
    return normalizedSlug === normalizedKey
      || normalizedSlug === customKey
      || normalizedSlug === nameSlug
      || normalizedSlug === customNameSlug;
  });
}

function providerDraftFromConfig(entry: ProviderConfigEntry): ProviderEditorDraft {
  return {
    apiKey: entry.apiKey,
    baseUrl: entry.baseUrl,
    contextLength: entry.contextLength ? String(entry.contextLength) : "",
    defaultModel: entry.defaultModel,
    mode: "edit",
    modelsText: entry.models.join("\n"),
    name: entry.name,
    originalKey: entry.key,
    originalSource: entry.source,
    providerKey: entry.key,
  };
}

function updateProviderConfig(
  config: HermesConfigRecord | undefined,
  draft: ProviderEditorDraft,
): HermesConfigRecord {
  const providerKey = slugifyProviderKey(draft.providerKey || draft.name);
  if (!providerKey) {
    throw new Error("请输入服务商名称或 Provider Key。");
  }

  const baseUrl = normalizeProviderBaseUrl(draft.baseUrl);
  if (!baseUrl) {
    throw new Error("Base URL 必须包含 http:// 或 https://。");
  }

  const defaultModel = draft.defaultModel.trim();
  if (!defaultModel) {
    throw new Error("请输入默认模型。");
  }

  const modelIds = uniqueStrings([...modelsFromText(draft.modelsText), defaultModel]);
  const contextLength = draft.contextLength ? Number.parseInt(draft.contextLength, 10) : null;
  const nextConfig = cloneConfig(config);
  const providers = asMutableRecord(nextConfig.providers);
  if (draft.mode === "edit" && draft.originalSource === "providers" && draft.originalKey && draft.originalKey !== providerKey) {
    delete providers[draft.originalKey];
  }

  providers[providerKey] = {
    name: draft.name.trim() || providerKey,
    base_url: baseUrl,
    api_key: draft.apiKey.trim(),
    default_model: defaultModel,
    models: modelsConfigFromIds(modelIds, contextLength),
  };
  nextConfig.providers = providers;

  if (draft.mode === "edit" && draft.originalSource === "custom_providers" && draft.originalKey) {
    nextConfig.custom_providers = removeLegacyCustomProvider(nextConfig.custom_providers, draft.originalKey);
  }

  return nextConfig;
}

function removeProviderConfigEntry(
  config: HermesConfigRecord | undefined,
  entry: ProviderConfigEntry,
): HermesConfigRecord {
  const nextConfig = cloneConfig(config);
  if (entry.source === "providers") {
    const providers = asMutableRecord(nextConfig.providers);
    delete providers[entry.key];
    nextConfig.providers = providers;
    return nextConfig;
  }

  nextConfig.custom_providers = removeLegacyCustomProvider(nextConfig.custom_providers, entry.key);
  return nextConfig;
}

function removeLegacyCustomProvider(input: unknown, key: string) {
  if (!Array.isArray(input)) {
    return input;
  }

  const normalizedKey = normalizeProviderKey(key);
  return input.filter((item) => {
    const record = asRecord(item);
    if (!record) {
      return true;
    }

    return normalizeProviderKey(slugifyProviderKey(readString(record, "name"))) !== normalizedKey;
  });
}

function modelsConfigFromIds(models: string[], contextLength: number | null) {
  const output: Record<string, { context_length?: number }> = {};
  for (const model of models) {
    output[model] = contextLength && contextLength > 0 ? { context_length: contextLength } : {};
  }

  return output;
}

function modelsFromConfig(input: unknown, defaultModel: string) {
  const models: string[] = [];
  if (defaultModel) {
    models.push(defaultModel);
  }

  if (Array.isArray(input)) {
    for (const item of input) {
      if (typeof item === "string") {
        models.push(item);
      }
    }
  } else if (isRecord(input)) {
    models.push(...Object.keys(input));
  }

  return uniqueStrings(models);
}

function contextLengthFromModels(input: unknown, defaultModel: string) {
  if (!isRecord(input)) {
    return null;
  }

  const defaultEntry = asRecord(input[defaultModel]);
  return readPositiveInteger(defaultEntry?.context_length);
}

function modelsFromText(text: string) {
  return uniqueStrings(text
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean));
}

function slugifyProviderKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^custom:/, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeProviderKey(value: string) {
  return value.trim().toLowerCase().replace(/^custom:/, "");
}

function normalizeProviderBaseUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? trimmed : "";
  } catch {
    return "";
  }
}

function cloneConfig(config: HermesConfigRecord | undefined): HermesConfigRecord {
  if (!config) {
    return {};
  }

  return structuredClone(config) as HermesConfigRecord;
}

function asMutableRecord(input: unknown): Record<string, unknown> {
  return isRecord(input) ? { ...input } : {};
}

function asRecord(input: unknown): Record<string, unknown> | null {
  return isRecord(input) ? input : null;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function readString(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function readFirstString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = readString(record, key);
    if (value) {
      return value;
    }
  }

  return "";
}

function readPositiveInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function formatOptionalNumber(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : "未设置";
}
