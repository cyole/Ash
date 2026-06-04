import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Plug,
  RefreshCcw,
  Save,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { errorMessage } from "@/lib/errors";
import { ashQueryKeys, useAshApi } from "@/lib/hermes/queries";
import { cn } from "@/lib/utils";
import type { HermesApiClient } from "@/lib/hermes/api";
import type { SkillInfo, ToolEnvVar, ToolProvider, ToolsetInfo } from "@/types/runtime-dashboard";

type CatalogMode = "skills" | "toolsets";

interface CapabilitiesCatalog {
  skills: SkillInfo[];
  toolsets: ToolsetInfo[];
}

const catalogModeOptions = [
  ["skills", "技能"],
  ["toolsets", "工具集"],
] as const satisfies ReadonlyArray<readonly [CatalogMode, string]>;

export function ExtensionsPage() {
  const { apiReady, apiUrl, client, sessionToken } = useAshApi();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<CatalogMode>("skills");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [expandedToolset, setExpandedToolset] = useState<string | null>(null);
  const hasSessionToken = Boolean(sessionToken);
  const capabilitiesQueryKey = ashQueryKeys.extensions(apiUrl, hasSessionToken);

  const catalog = useQuery({
    enabled: apiReady,
    queryKey: capabilitiesQueryKey,
    queryFn: async (): Promise<CapabilitiesCatalog> => {
      const [skills, toolsets] = await Promise.all([client.getSkills(), client.getToolsets()]);
      return { skills, toolsets };
    },
    retry: false,
  });

  const toggleSkill = useMutation({
    mutationFn: ({ enabled, name }: { enabled: boolean; name: string }) => client.toggleSkill(name, enabled),
    onSuccess: (result) => {
      queryClient.setQueryData<CapabilitiesCatalog>(capabilitiesQueryKey, (current) =>
        current
          ? {
              ...current,
              skills: current.skills.map((skill) =>
                textValue(skill.name) === result.name ? { ...skill, enabled: result.enabled } : skill,
              ),
            }
          : current,
      );
      toast.success(result.enabled ? "技能已启用" : "技能已停用");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const toggleToolset = useMutation({
    mutationFn: ({ enabled, name }: { enabled: boolean; name: string }) => client.toggleToolset(name, enabled),
    onSuccess: (result) => {
      queryClient.setQueryData<CapabilitiesCatalog>(capabilitiesQueryKey, (current) =>
        current
          ? {
              ...current,
              toolsets: current.toolsets.map((toolset) =>
                textValue(toolset.name) === result.name ? { ...toolset, enabled: result.enabled } : toolset,
              ),
            }
          : current,
      );
      toast.success(result.enabled ? "工具集已启用" : "工具集已停用");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const skills = catalog.data?.skills ?? [];
  const toolsets = catalog.data?.toolsets ?? [];
  const categories = useMemo(() => skillCategories(skills), [skills]);
  const filteredSkills = useMemo(
    () => filterSkills(skills, query, activeCategory),
    [activeCategory, query, skills],
  );
  const filteredToolsets = useMemo(() => filterToolsets(toolsets, query), [query, toolsets]);
  const skillGroups = useMemo(() => groupSkills(filteredSkills), [filteredSkills]);

  const enabledSkills = skills.filter((skill) => Boolean(skill.enabled)).length;
  const enabledToolsets = toolsets.filter((toolset) => Boolean(toolset.enabled)).length;
  const configuredToolsets = toolsets.filter((toolset) => Boolean(toolset.configured)).length;

  function handleToggleSkill(skill: SkillInfo) {
    const name = textValue(skill.name);
    if (!name) {
      toast.error("技能名称缺失，无法更新。");
      return;
    }

    toggleSkill.mutate({ name, enabled: !Boolean(skill.enabled) });
  }

  function handleToggleToolset(toolset: ToolsetInfo) {
    const name = textValue(toolset.name);
    if (!name) {
      toast.error("工具集名称缺失，无法更新。");
      return;
    }

    toggleToolset.mutate({ name, enabled: !Boolean(toolset.enabled) });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        eyebrow="扩展"
        title="技能与工具集"
        description="从本地 dashboard 读取官方 capabilities，启用状态、工具集 provider 和密钥配置都会直接写入运行时。"
        actions={
          <Button variant="outline" onClick={() => void catalog.refetch()} disabled={catalog.isFetching || !apiReady}>
            {catalog.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            刷新
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
          <div className="grid gap-3 md:grid-cols-4">
            <Metric label="技能总数" value={skills.length} detail={`${enabledSkills} 个已启用`} />
            <Metric label="技能分类" value={categories.length} detail="来自 /api/skills" />
            <Metric label="工具集总数" value={toolsets.length} detail={`${enabledToolsets} 个已启用`} />
            <Metric label="已配置工具集" value={configuredToolsets} detail="provider / API key 已就绪" />
          </div>

          <div className="rounded-md border border-border bg-background">
            <div className="flex flex-col gap-3 border-b border-border p-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative w-full lg:max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={mode === "skills" ? "搜索技能名称、分类或描述..." : "搜索工具集、工具或描述..."}
                  className="pl-9"
                />
              </div>

              <ToggleGroup
                type="single"
                value={mode}
                onValueChange={(value) => {
                  if (isCatalogMode(value)) {
                    setMode(value);
                  }
                }}
                size="sm"
                spacing={0}
                className="h-9 rounded-md border border-border bg-muted p-0.5"
              >
                {catalogModeOptions.map(([value, label]) => (
                  <ToggleGroupItem
                    key={value}
                    value={value}
                    className={cn(
                      "min-w-20 rounded border-0 px-3 text-xs text-muted-foreground",
                      "data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm",
                    )}
                  >
                    {label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            {mode === "skills" && categories.length > 0 ? (
              <div className="flex flex-wrap gap-2 border-b border-border px-4 py-3">
                <CategoryButton
                  active={activeCategory === null}
                  label="全部"
                  count={skills.length}
                  onClick={() => setActiveCategory(null)}
                />
                {categories.map((category) => (
                  <CategoryButton
                    key={category.name}
                    active={activeCategory === category.name}
                    label={prettyName(category.name)}
                    count={category.count}
                    onClick={() => setActiveCategory((current) => (current === category.name ? null : category.name))}
                  />
                ))}
              </div>
            ) : null}

            {!apiReady || catalog.isLoading ? (
              <PanelNotice icon={<Loader2 className="h-4 w-4 animate-spin" />} title="正在读取官方 capabilities" />
            ) : catalog.error ? (
              <PanelNotice
                icon={<Plug className="h-4 w-4" />}
                title="技能与工具集暂不可用"
                description={errorMessage(catalog.error)}
              />
            ) : mode === "skills" ? (
              <SkillsList
                groups={skillGroups}
                savingName={toggleSkill.isPending ? toggleSkill.variables?.name : undefined}
                onToggle={handleToggleSkill}
              />
            ) : (
              <ToolsetsList
                apiUrl={apiUrl}
                client={client}
                expandedToolset={expandedToolset}
                hasSessionToken={hasSessionToken}
                onConfiguredChange={() => void queryClient.invalidateQueries({ queryKey: capabilitiesQueryKey })}
                onExpand={(name) => setExpandedToolset((current) => (current === name ? null : name))}
                onToggle={handleToggleToolset}
                savingName={toggleToolset.isPending ? toggleToolset.variables?.name : undefined}
                toolsets={filteredToolsets}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SkillsList({
  groups,
  savingName,
  onToggle,
}: {
  groups: Array<[string, SkillInfo[]]>;
  savingName?: string;
  onToggle: (skill: SkillInfo) => void;
}) {
  if (groups.length === 0) {
    return <EmptyRows text="没有匹配的技能。" />;
  }

  return (
    <div className="divide-y divide-border">
      {groups.map(([category, skills]) => (
        <section key={category}>
          <SectionHeader
            icon={<Sparkles className="h-4 w-4" />}
            title={prettyName(category)}
            detail={`${skills.length} 项`}
          />
          <div className="divide-y divide-border">
            {skills.map((skill) => {
              const skillName = textValue(skill.name) || "未命名技能";
              const categoryName = categoryFor(skill);
              const isSaving = savingName === textValue(skill.name);

              return (
                <article
                  key={`${categoryName}:${skillName}`}
                  className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(180px,0.8fr)_1.4fr_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{skillName}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <EnabledBadge enabled={Boolean(skill.enabled)} />
                      <Badge>{prettyName(categoryName)}</Badge>
                    </div>
                  </div>
                  <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
                    {textValue(skill.description) || "这个技能没有提供描述。"}
                  </p>
                  <Button
                    variant={skill.enabled ? "outline" : "default"}
                    disabled={isSaving}
                    onClick={() => onToggle(skill)}
                  >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {skill.enabled ? "停用" : "启用"}
                  </Button>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function ToolsetsList({
  apiUrl,
  client,
  expandedToolset,
  hasSessionToken,
  onConfiguredChange,
  onExpand,
  onToggle,
  savingName,
  toolsets,
}: {
  apiUrl: string;
  client: HermesApiClient;
  expandedToolset: string | null;
  hasSessionToken: boolean;
  onConfiguredChange: () => void;
  onExpand: (name: string) => void;
  onToggle: (toolset: ToolsetInfo) => void;
  savingName?: string;
  toolsets: ToolsetInfo[];
}) {
  if (toolsets.length === 0) {
    return <EmptyRows text="没有匹配的工具集。" />;
  }

  return (
    <div className="divide-y divide-border">
      {toolsets.map((toolset) => {
        const toolsetName = textValue(toolset.name);
        const label = textValue(toolset.label) || toolsetName || "未命名工具集";
        const tools = toolsForToolset(toolset);
        const expanded = expandedToolset === toolsetName;
        const isSaving = savingName === toolsetName;

        return (
          <article key={toolsetName || label} className="px-4 py-3">
            <div className="grid gap-3 md:grid-cols-[minmax(180px,0.8fr)_1.4fr_auto] md:items-start">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{label}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <EnabledBadge enabled={Boolean(toolset.enabled)} />
                  <ConfiguredBadge configured={Boolean(toolset.configured)} />
                </div>
              </div>
              <div className="min-w-0">
                <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
                  {textValue(toolset.description) || "这个工具集没有提供描述。"}
                </p>
                {tools.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {tools.map((tool) => (
                      <Badge key={tool} className="gap-1 font-mono">
                        <Wrench className="h-3 w-3" />
                        {tool}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap justify-start gap-2 md:justify-end">
                <Button variant="outline" onClick={() => onExpand(toolsetName)} aria-expanded={expanded} disabled={!toolsetName}>
                  <Settings2 className="h-4 w-4" />
                  配置
                </Button>
                <Button
                  variant={toolset.enabled ? "outline" : "default"}
                  disabled={!toolsetName || isSaving}
                  onClick={() => onToggle(toolset)}
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {toolset.enabled ? "停用" : "启用"}
                </Button>
              </div>
            </div>

            {expanded ? (
              <ToolsetConfigPanel
                apiUrl={apiUrl}
                client={client}
                hasSessionToken={hasSessionToken}
                onConfiguredChange={onConfiguredChange}
                toolsetName={toolsetName}
              />
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function ToolsetConfigPanel({
  apiUrl,
  client,
  hasSessionToken,
  onConfiguredChange,
  toolsetName,
}: {
  apiUrl: string;
  client: HermesApiClient;
  hasSessionToken: boolean;
  onConfiguredChange: () => void;
  toolsetName: string;
}) {
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const config = useQuery({
    queryKey: ashQueryKeys.toolsetConfig(apiUrl, hasSessionToken, toolsetName),
    queryFn: () => client.getToolsetConfig(toolsetName),
    retry: false,
  });

  const providerMutation = useMutation({
    mutationFn: (provider: string) => client.selectToolsetProvider(toolsetName, provider),
    onSuccess: (result) => {
      setActiveProvider(result.provider);
      toast.success("工具集 provider 已更新");
      void config.refetch();
      onConfiguredChange();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const providers = Array.isArray(config.data?.providers) ? config.data.providers : [];

  useEffect(() => {
    const firstProvider = providers[0];
    if (!firstProvider) {
      setActiveProvider(null);
      return;
    }

    setActiveProvider((current) => {
      if (current && providers.some((provider) => provider.name === current)) {
        return current;
      }

      const activeProviderName = textValue(config.data?.active_provider);
      return (
        providers.find((provider) => provider.is_active)?.name ??
        (activeProviderName
          ? providers.find((provider) => textValue(provider.name) === activeProviderName)?.name
          : undefined) ??
        providers.find(providerConfigured)?.name ??
        firstProvider.name
      );
    });
  }, [config.data?.active_provider, providers]);

  if (config.isLoading) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        正在读取工具集配置...
      </div>
    );
  }

  if (config.error) {
    return (
      <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm text-destructive">
        {errorMessage(config.error)}
      </div>
    );
  }

  if (!config.data?.has_category) {
    return (
      <div className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
        这个工具集没有 provider 选项，启用后会直接使用当前运行时配置。
      </div>
    );
  }

  if (providers.length === 0) {
    return (
      <div className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
        这个工具集当前没有可选 provider。
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-md border border-border bg-muted/30 p-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-medium">Provider</div>
          <div className="text-xs text-muted-foreground">选择官方工具集 provider，并配置它需要的环境变量。</div>
        </div>
        <Select
          value={activeProvider ?? undefined}
          onValueChange={(value) => {
            setActiveProvider(value);
            providerMutation.mutate(value);
          }}
          disabled={providerMutation.isPending}
        >
          <SelectTrigger className="w-full md:w-64">
            <SelectValue placeholder="选择 provider" />
          </SelectTrigger>
          <SelectContent>
            {providers.map((provider) => {
              const providerName = textValue(provider.name);
              if (!providerName) {
                return null;
              }

              return (
                <SelectItem key={providerName} value={providerName}>
                  {providerName}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-3 grid gap-2">
        {providers.map((provider) => {
          const providerName = textValue(provider.name);
          if (!providerName) {
            return null;
          }

          const isActive = activeProvider === providerName;
          return (
            <ProviderPanel
              key={providerName}
              active={isActive}
              client={client}
              onChanged={() => {
                void config.refetch();
                onConfiguredChange();
              }}
              onSelect={() => {
                setActiveProvider(providerName);
                providerMutation.mutate(providerName);
              }}
              provider={provider}
              selecting={providerMutation.isPending && providerMutation.variables === providerName}
            />
          );
        })}
      </div>
    </div>
  );
}

function ProviderPanel({
  active,
  client,
  onChanged,
  onSelect,
  provider,
  selecting,
}: {
  active: boolean;
  client: HermesApiClient;
  onChanged: () => void;
  onSelect: () => void;
  provider: ToolProvider;
  selecting: boolean;
}) {
  const ready = providerConfigured(provider);
  const providerName = textValue(provider.name) || "未命名 provider";
  const providerBadge = textValue(provider.badge);
  const providerTag = textValue(provider.tag);
  const envVars = envVarsForProvider(provider);
  const postSetup = textValue(provider.post_setup);

  return (
    <div className={cn("rounded-md border border-border bg-background", active && "border-primary/50")}>
      <button
        type="button"
        aria-pressed={active}
        onClick={onSelect}
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left transition hover:bg-accent",
          active && "bg-accent/60",
        )}
      >
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{providerName}</span>
          {providerBadge ? <Badge>{providerBadge}</Badge> : null}
          {ready ? (
            <Badge className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700">
              <Check className="h-3 w-3" />
              Ready
            </Badge>
          ) : (
            <Badge className="gap-1 border-amber-200 bg-amber-50 text-amber-700">
              <KeyRound className="h-3 w-3" />
              Needs keys
            </Badge>
          )}
        </span>
        {selecting ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : null}
      </button>

      {active ? (
        <div className="grid gap-2 border-t border-border p-3">
          {providerTag ? <p className="text-xs leading-5 text-muted-foreground">{providerTag}</p> : null}
          {provider.requires_nous_auth ? (
            <p className="text-xs leading-5 text-muted-foreground">这个 provider 需要 Nous Portal 登录状态。</p>
          ) : null}
          {envVars.length === 0 ? (
            <p className="text-xs text-muted-foreground">这个 provider 不需要 API key。</p>
          ) : (
            envVars.map((envVar) => (
              <EnvVarField key={textValue(envVar.key)} client={client} envVar={envVar} onChanged={onChanged} />
            ))
          )}
          {postSetup ? (
            <p className="text-xs leading-5 text-muted-foreground">
              这个 provider 还需要额外 setup：<span className="font-mono">{postSetup}</span>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function EnvVarField({
  client,
  envVar,
  onChanged,
}: {
  client: HermesApiClient;
  envVar: ToolEnvVar;
  onChanged: () => void;
}) {
  const envKey = textValue(envVar.key);
  const prompt = textValue(envVar.prompt);
  const docsUrl = textValue(envVar.url);
  const hasDefault = textValue(envVar.default).length > 0;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!envKey) {
    return null;
  }

  async function handleSave() {
    if (!value.trim()) {
      return;
    }

    setBusy(true);
    try {
      await client.setEnvVar(envKey, value);
      setEditing(false);
      setValue("");
      setRevealed(null);
      onChanged();
      toast.success(`${envKey} 已保存`);
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

  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-medium">{envKey}</span>
            <CredentialBadge isSet={Boolean(envVar.is_set)} />
          </div>
          {prompt ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{prompt}</p> : null}
          {revealed !== null ? (
            <div className="mt-2 break-all rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs">
              {revealed || "(empty)"}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          {docsUrl ? (
            <Button asChild variant="ghost" size="sm">
              <a href={docsUrl} target="_blank" rel="noreferrer">
                文档
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          ) : null}
          {envVar.is_set ? (
            <Button variant="ghost" size="icon" onClick={() => void handleReveal()} disabled={busy} title="查看值">
              {revealed !== null ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => setEditing((current) => !current)}>
            {envVar.is_set ? "替换" : "设置"}
          </Button>
          {envVar.is_set ? (
            <Button variant="ghost" size="icon" onClick={() => void handleClear()} disabled={busy} title="移除">
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
            type={hasDefault ? "text" : "password"}
            placeholder={prompt || envKey}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <Button onClick={() => void handleSave()} disabled={busy || !value.trim()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            保存
          </Button>
          <Button variant="outline" onClick={() => setEditing(false)}>
            取消
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold leading-none">{value}</div>
      <div className="mt-2 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function SectionHeader({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{title}</div>
          <div className="text-xs text-muted-foreground">{detail}</div>
        </div>
      </div>
    </div>
  );
}

function CategoryButton({
  active,
  count,
  label,
  onClick,
}: {
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs transition",
        active ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-accent",
      )}
    >
      <span>{label}</span>
      <span className={cn("font-mono", active ? "text-primary-foreground/80" : "text-muted-foreground")}>{count}</span>
    </button>
  );
}

function PanelNotice({
  description,
  icon,
  title,
}: {
  description?: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center px-4 text-center">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md border border-border bg-muted">
        {icon}
      </div>
      <div className="text-sm font-medium">{title}</div>
      {description ? <div className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">{description}</div> : null}
    </div>
  );
}

function EmptyRows({ text }: { text: string }) {
  return <div className="px-4 py-8 text-center text-sm text-muted-foreground">{text}</div>;
}

function EnabledBadge({ enabled }: { enabled: boolean }) {
  return (
    <Badge
      className={cn(
        enabled
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-border bg-muted text-muted-foreground",
      )}
    >
      {enabled ? "已启用" : "已停用"}
    </Badge>
  );
}

function ConfiguredBadge({ configured }: { configured: boolean }) {
  return (
    <Badge
      className={cn(
        "gap-1",
        configured
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-amber-200 bg-amber-50 text-amber-700",
      )}
    >
      {configured ? <Check className="h-3 w-3" /> : <KeyRound className="h-3 w-3" />}
      {configured ? "已配置" : "需要密钥"}
    </Badge>
  );
}

function CredentialBadge({ isSet }: { isSet: boolean }) {
  return (
    <Badge
      className={cn(
        "gap-1",
        isSet ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-border bg-muted text-muted-foreground",
      )}
    >
      {isSet ? <Check className="h-3 w-3" /> : null}
      {isSet ? "已设置" : "未设置"}
    </Badge>
  );
}

function categoryFor(skill: SkillInfo) {
  return textValue(skill.category) || "general";
}

function skillCategories(skills: SkillInfo[]) {
  const counts = new Map<string, number>();
  for (const skill of skills) {
    const category = categoryFor(skill);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, count]) => ({ count, name }));
}

function groupSkills(skills: SkillInfo[]): Array<[string, SkillInfo[]]> {
  const groups = new Map<string, SkillInfo[]>();
  for (const skill of skills) {
    const category = categoryFor(skill);
    groups.set(category, [...(groups.get(category) ?? []), skill]);
  }

  return Array.from(groups.entries()).sort(([left], [right]) => left.localeCompare(right));
}

function filterSkills(skills: SkillInfo[], query: string, category: string | null) {
  const needle = query.trim().toLowerCase();
  return skills
    .filter((skill) => {
      if (category && categoryFor(skill) !== category) {
        return false;
      }

      if (!needle) {
        return true;
      }

      return [skill.name, skill.description, skill.category].map(textValue).join(" ").toLowerCase().includes(needle);
    })
    .sort((left, right) => textValue(left.name).localeCompare(textValue(right.name)));
}

function filterToolsets(toolsets: ToolsetInfo[], query: string) {
  const needle = query.trim().toLowerCase();
  return toolsets
    .filter((toolset) => {
      if (!needle) {
        return true;
      }

      return [toolset.name, toolset.label, toolset.description, ...toolsForToolset(toolset)]
        .map(textValue)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    })
    .sort((left, right) =>
      (textValue(left.label) || textValue(left.name)).localeCompare(textValue(right.label) || textValue(right.name)),
    );
}

function providerConfigured(provider: ToolProvider) {
  const envVars = envVarsForProvider(provider);
  return envVars.length === 0 || envVars.every((envVar) => Boolean(envVar.is_set));
}

function toolsForToolset(toolset: ToolsetInfo) {
  if (!Array.isArray(toolset.tools)) {
    return [];
  }

  return toolset.tools.map(textValue).filter(Boolean);
}

function envVarsForProvider(provider: ToolProvider) {
  if (!Array.isArray(provider.env_vars)) {
    return [];
  }

  return provider.env_vars.filter((envVar) => Boolean(textValue(envVar.key)));
}

function textValue(value: unknown) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "";
}

function prettyName(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isCatalogMode(value: string): value is CatalogMode {
  return value === "skills" || value === "toolsets";
}
