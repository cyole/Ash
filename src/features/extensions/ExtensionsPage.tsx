import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FolderTree, KeyRound, Loader2, Plug, RefreshCcw, Search, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/errors";
import { hermesQueryKeys } from "@/lib/hermes/queries";
import { getExtensionsCatalog } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import type { HermesPluginCatalogItem, HermesSkillCatalogItem } from "@/types/hermes";

type CatalogMode = "all" | "skills" | "plugins";

export function ExtensionsPage() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<CatalogMode>("all");

  const catalog = useQuery({
    queryKey: hermesQueryKeys.extensionsCatalog,
    queryFn: getExtensionsCatalog,
    retry: false,
  });

  const skills = catalog.data?.skills ?? [];
  const plugins = catalog.data?.plugins ?? [];
  const filteredSkills = useMemo(() => {
    return skills.filter((skill) => matchesSkill(skill, query));
  }, [query, skills]);
  const filteredPlugins = useMemo(() => {
    return plugins.filter((plugin) => matchesPlugin(plugin, query));
  }, [plugins, query]);

  const installedSkills = skills.filter((skill) => skill.status === "enabled").length;
  const optionalSkills = skills.filter((skill) => skill.source === "optional").length;
  const enabledPlugins = plugins.filter((plugin) => plugin.status === "enabled").length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        eyebrow="扩展"
        title="技能与插件"
        description="从内置 Hermes runtime 读取已安装技能、可选技能和插件清单，方便确认当前桌面版带了哪些能力。"
        actions={
          <Button variant="outline" onClick={() => void catalog.refetch()} disabled={catalog.isFetching}>
            {catalog.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            刷新
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
          <div className="grid gap-3 md:grid-cols-4">
            <Metric label="技能总数" value={skills.length} detail={`${installedSkills} 个已启用`} />
            <Metric label="可选技能" value={optionalSkills} detail="来自 optional-skills" />
            <Metric label="插件总数" value={plugins.length} detail={`${enabledPlugins} 个显式启用`} />
            <Metric label="插件类型" value={uniqueCount(plugins.map((plugin) => plugin.kind))} detail="backend / provider / platform" />
          </div>

          <div className="rounded-md border border-border bg-background">
            <div className="flex flex-col gap-3 border-b border-border p-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative w-full lg:max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索名称、分类、描述或环境变量..."
                  className="pl-9"
                />
              </div>

              <div className="flex h-9 rounded-md border border-border bg-muted p-0.5">
                {([
                  ["all", "全部"],
                  ["skills", "技能"],
                  ["plugins", "插件"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setMode(value)}
                    className={cn(
                      "min-w-16 rounded px-3 text-xs font-medium text-muted-foreground transition-colors",
                      mode === value && "bg-background text-foreground shadow-sm",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {catalog.isLoading ? (
              <PanelNotice icon={<Loader2 className="h-4 w-4 animate-spin" />} title="正在读取扩展清单" />
            ) : catalog.error ? (
              <PanelNotice
                icon={<Plug className="h-4 w-4" />}
                title="扩展清单暂不可用"
                description={errorMessage(catalog.error)}
              />
            ) : (
              <div className="divide-y divide-border">
                {mode !== "plugins" ? (
                  <CatalogSection
                    icon={<Sparkles className="h-4 w-4" />}
                    title="技能"
                    count={filteredSkills.length}
                    root={catalog.data?.skillsRoot}
                  >
                    {filteredSkills.length > 0 ? (
                      <div className="divide-y divide-border">
                        {filteredSkills.map((skill) => (
                          <SkillRow key={`${skill.source}:${skill.path}`} skill={skill} />
                        ))}
                      </div>
                    ) : (
                      <EmptyRows text="没有匹配的技能。" />
                    )}
                  </CatalogSection>
                ) : null}

                {mode !== "skills" ? (
                  <CatalogSection
                    icon={<Plug className="h-4 w-4" />}
                    title="插件"
                    count={filteredPlugins.length}
                    root={catalog.data?.pluginsRoot}
                  >
                    {filteredPlugins.length > 0 ? (
                      <div className="divide-y divide-border">
                        {filteredPlugins.map((plugin) => (
                          <PluginRow key={`${plugin.source}:${plugin.key}`} plugin={plugin} />
                        ))}
                      </div>
                    ) : (
                      <EmptyRows text="没有匹配的插件。" />
                    )}
                  </CatalogSection>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
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

function CatalogSection({
  icon,
  title,
  count,
  root,
  children,
}: {
  icon: ReactNode;
  title: string;
  count: number;
  root?: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="flex flex-col gap-2 border-b border-border px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-muted">
            {icon}
          </div>
          <div>
            <div className="text-sm font-medium">{title}</div>
            <div className="text-xs text-muted-foreground">{count} 项</div>
          </div>
        </div>
        {root ? (
          <div className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            <FolderTree className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{root}</span>
          </div>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function SkillRow({ skill }: { skill: HermesSkillCatalogItem }) {
  return (
    <article className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(180px,0.8fr)_1.4fr_220px] md:items-start">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{skill.name}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <StatusBadge status={skill.status} />
          <Badge>{sourceLabel(skill.source)}</Badge>
          {skill.version ? <Badge>v{skill.version}</Badge> : null}
        </div>
      </div>
      <div className="min-w-0">
        <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
          {skill.description || "这个技能没有提供描述。"}
        </p>
        <div className="mt-1 truncate text-xs text-muted-foreground">{skill.path}</div>
      </div>
      <div className="flex flex-wrap justify-start gap-1.5 md:justify-end">
        {skill.category ? <Badge>{skill.category}</Badge> : null}
        {skill.author ? <Badge>{skill.author}</Badge> : null}
      </div>
    </article>
  );
}

function PluginRow({ plugin }: { plugin: HermesPluginCatalogItem }) {
  return (
    <article className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(220px,0.9fr)_1.3fr_240px] md:items-start">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{plugin.key}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <StatusBadge status={plugin.status} />
          <Badge>{kindLabel(plugin.kind)}</Badge>
          {plugin.version ? <Badge>v{plugin.version}</Badge> : null}
        </div>
      </div>
      <div className="min-w-0">
        <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
          {plugin.description || plugin.name || "这个插件没有提供描述。"}
        </p>
        <div className="mt-1 truncate text-xs text-muted-foreground">{plugin.path}</div>
      </div>
      <div className="flex flex-wrap justify-start gap-1.5 md:justify-end">
        <Badge>{sourceLabel(plugin.source)}</Badge>
        {plugin.requiresEnv.map((name) => (
          <Badge key={name} className="gap-1">
            <KeyRound className="h-3 w-3" />
            {name}
          </Badge>
        ))}
      </div>
    </article>
  );
}

function StatusBadge({ status }: { status: string }) {
  const label = statusLabel(status);
  return (
    <Badge
      className={cn(
        status === "enabled" && "border-green-200 bg-green-50 text-green-700",
        status === "disabled" && "border-destructive/30 bg-destructive/10 text-destructive",
        status === "available" && "border-blue-200 bg-blue-50 text-blue-700",
      )}
    >
      {label}
    </Badge>
  );
}

function PanelNotice({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
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

function matchesSkill(skill: HermesSkillCatalogItem, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  return [
    skill.name,
    skill.description,
    skill.category,
    skill.source,
    skill.status,
    skill.author,
    skill.path,
  ].join(" ").toLowerCase().includes(needle);
}

function matchesPlugin(plugin: HermesPluginCatalogItem, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  return [
    plugin.key,
    plugin.name,
    plugin.description,
    plugin.kind,
    plugin.source,
    plugin.status,
    plugin.author,
    plugin.requiresEnv.join(" "),
    plugin.path,
  ].join(" ").toLowerCase().includes(needle);
}

function sourceLabel(source: string) {
  const labels: Record<string, string> = {
    installed: "已安装",
    bundled: "内置",
    optional: "可选",
    user: "用户",
  };
  return labels[source] ?? source;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    enabled: "已启用",
    available: "可用",
    disabled: "已禁用",
  };
  return labels[status] ?? status;
}

function kindLabel(kind: string) {
  const labels: Record<string, string> = {
    backend: "后端",
    "model-provider": "模型提供方",
    platform: "平台",
    standalone: "独立",
    exclusive: "互斥",
  };
  return labels[kind] ?? kind;
}

function uniqueCount(values: string[]) {
  return new Set(values.filter(Boolean)).size;
}
