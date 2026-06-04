import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { highlighterThemes, mermaidThemes } from "@lobehub/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  Bot,
  CheckCircle2,
  CircleAlert,
  Code2,
  Cpu,
  FileText,
  Gauge,
  Loader2,
  Monitor,
  MonitorCog,
  Moon,
  MousePointer2,
  Palette,
  Play,
  RefreshCcw,
  ServerCog,
  ShieldCheck,
  Sparkles,
  Square,
  Stethoscope,
  Sun,
  Type,
  Waves,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { LobeRuntimeProvider } from "@/features/chat/components/LobeRuntimeProvider";
import { MarkdownMessage } from "@/features/chat/components/MarkdownMessage";
import {
  accentColors,
  animationModes,
  chatTransitionModes,
  contextMenuModes,
  defaultHermesSettings,
  themeModes,
  useHermesSettings,
} from "@/features/settings/settings-store";
import type {
  AccentColor,
  AnimationMode,
  ChatTransitionMode,
  ContextMenuMode,
  HermesSettingsStorage,
  ThemeMode,
} from "@/features/settings/settings-store";
import { errorMessage } from "@/lib/errors";
import { hermesQueryKeys, useHermesApi } from "@/lib/hermes/queries";
import {
  checkDashboard,
  isTauriRuntime,
  prepareRuntime,
  revealRuntimeLogs,
  runDoctor,
  setupPortal,
  startDashboard,
  stopDashboard,
} from "@/lib/tauri";
import { cn } from "@/lib/utils";
import type { ModelInfoResponse } from "@/types/hermes-dashboard";
import type { HermesStatus, RuntimeCommandResult } from "@/types/hermes";

type RuntimeAction = "prepare" | "start" | "stop" | "status" | "doctor" | "portal" | "logs";
type SettingsSectionId = "appearance" | "chat" | "model" | "runtime" | "advanced" | "about";

interface SettingsSectionNav {
  id: SettingsSectionId;
  label: string;
  description: string;
  icon: ReactNode;
}

const actionLabels: Record<RuntimeAction, string> = {
  prepare: "准备本地引擎",
  start: "启动 dashboard",
  stop: "停止 dashboard",
  status: "检查 dashboard",
  doctor: "运行诊断",
  portal: "连接门户",
  logs: "打开日志",
};

const runtimeModeLabels: Record<HermesStatus["mode"], string> = {
  "browser-preview": "浏览器预览",
  "local-app": "桌面托管",
  "local-existing": "本机已有",
  "local-managed": "应用托管",
  "local-managed-dashboard": "内置 Dashboard",
  remote: "远程服务",
};

const settingsSections: SettingsSectionNav[] = [
  {
    id: "appearance",
    label: "外观",
    description: "主题、动画和应用调色盘。",
    icon: <Palette className="h-4 w-4" />,
  },
  {
    id: "chat",
    label: "聊天外观",
    description: "消息过渡、字号和 Markdown 主题。",
    icon: <Bot className="h-4 w-4" />,
  },
  {
    id: "model",
    label: "服务模型",
    description: "默认提供商和模型连接状态。",
    icon: <Sparkles className="h-4 w-4" />,
  },
  {
    id: "runtime",
    label: "系统工具",
    description: "托管运行时、网关和诊断。",
    icon: <ServerCog className="h-4 w-4" />,
  },
  {
    id: "advanced",
    label: "数据存储",
    description: "路径、日志和开发者信息。",
    icon: <MonitorCog className="h-4 w-4" />,
  },
  {
    id: "about",
    label: "关于",
    description: "客户端能力和开源组件。",
    icon: <ShieldCheck className="h-4 w-4" />,
  },
];

const themeOptions: Array<{
  icon: ReactNode;
  label: string;
  value: ThemeMode;
}> = [
  { icon: <Sun className="h-3.5 w-3.5" />, label: "浅色", value: "light" },
  { icon: <Moon className="h-3.5 w-3.5" />, label: "深色", value: "dark" },
  { icon: <Monitor className="h-3.5 w-3.5" />, label: "自动", value: "system" },
];

const animationOptions: Array<{
  icon: ReactNode;
  label: string;
  value: AnimationMode;
}> = [
  { icon: <Ban className="h-3.5 w-3.5" />, label: "关闭", value: "disabled" },
  { icon: <Gauge className="h-3.5 w-3.5" />, label: "敏捷", value: "agile" },
  { icon: <Waves className="h-3.5 w-3.5" />, label: "优雅", value: "elegant" },
];

const contextMenuOptions: Array<{
  icon: ReactNode;
  label: string;
  value: ContextMenuMode;
}> = [
  { icon: <Ban className="h-3.5 w-3.5" />, label: "不使用", value: "disabled" },
  { icon: <MousePointer2 className="h-3.5 w-3.5" />, label: "默认", value: "default" },
];

const chatTransitionOptions: Array<{
  label: string;
  value: ChatTransitionMode;
}> = [
  { label: "关闭", value: "none" },
  { label: "淡入", value: "fadeIn" },
  { label: "平滑", value: "smooth" },
];

const accentMeta: Record<AccentColor, { color: string; label: string }> = {
  neutral: { color: "hsl(0 0% 12%)", label: "中性" },
  blue: { color: "hsl(217 91% 55%)", label: "蓝色" },
  green: { color: "hsl(160 84% 34%)", label: "绿色" },
  rose: { color: "hsl(350 77% 52%)", label: "玫红" },
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
  const { resetSettings, storage } = useHermesSettings();
  const [activeSection, setActiveSection] = useState<SettingsSectionId>("appearance");
  const [lastResult, setLastResult] = useState<RuntimeCommandResult | null>(null);
  const [lastAction, setLastAction] = useState<RuntimeAction | null>(null);
  const tauriRuntime = useMemo(() => isTauriRuntime(), []);
  const developerToolsEnabled = useMemo(() => isDeveloperToolsEnabled(), []);
  const { apiReady, apiUrl, client, sessionToken, status } = useHermesApi();

  const modelInfo = useQuery({
    enabled: apiReady,
    queryKey: ["settings-model-info", apiUrl, Boolean(sessionToken)] as const,
    queryFn: () => client.getGlobalModelInfo(),
  });

  const runAction = useMutation({
    mutationFn: async (action: RuntimeAction) => {
      setLastAction(action);

      switch (action) {
        case "prepare":
          return prepareRuntime();
        case "start":
          return startDashboard();
        case "stop":
          return stopDashboard();
        case "status":
          return checkDashboard();
        case "doctor":
          return runDoctor();
        case "portal":
          return setupPortal();
        case "logs":
          return revealRuntimeLogs();
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
  const activeSectionConfig = settingsSections.find((section) => section.id === activeSection) ?? settingsSections[0]!;
  const busy = runAction.isPending;
  const ready = Boolean(runtime?.installed);
  const refreshing = status.isFetching || modelInfo.isFetching;

  function refresh() {
    void status.refetch();
    void modelInfo.refetch();
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[188px_minmax(0,1fr)] bg-background">
      <aside className="flex min-h-0 flex-col border-r border-border/70 bg-sidebar/80 p-2.5">
        <div className="px-2 pb-2 pt-1.5 text-[11px] font-medium text-muted-foreground">偏好设置</div>
        <div className="space-y-0.5">
          {settingsSections.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id)}
              title={section.description}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors",
                activeSection === section.id
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
              )}
            >
              <span className="shrink-0">{section.icon}</span>
              <span className="min-w-0 truncate text-[13px] font-medium">{section.label}</span>
            </button>
          ))}
        </div>

        <div className="mt-auto rounded-lg border border-border/70 bg-card/75 p-2.5 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-[11px] font-medium text-muted-foreground">本地服务</div>
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
              aria-label="刷新本地服务状态"
            >
              {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
            </button>
          </div>
          <RuntimeBadge
            installed={runtime?.installed}
            running={runtime?.running}
            backgroundGatewayRunning={runtime?.backgroundGatewayRunning}
          />
        </div>
      </aside>

      <main className="min-h-0 overflow-y-auto bg-card">
        <div className="mx-auto max-w-[980px] px-6 py-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-normal">{activeSectionConfig.label}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{activeSectionConfig.description}</p>
            </div>
            {activeSection === "appearance" || activeSection === "chat" ? (
              <Button variant="outline" size="sm" onClick={resetSettings}>
                恢复默认
              </Button>
            ) : null}
          </div>

          <Separator className="my-5" />

          <div className="space-y-6">
            {activeSection === "appearance" ? <AppearanceSection /> : null}
            {activeSection === "chat" ? <ChatAppearanceSection /> : null}
            {activeSection === "model" ? (
              <ModelSection modelInfo={modelInfo.data} loading={modelInfo.isLoading} error={modelInfo.error} />
            ) : null}
            {activeSection === "runtime" ? (
              <RuntimeSection
                busy={busy}
                lastAction={lastAction}
                lastResult={lastResult}
                ready={ready}
                runtime={runtime}
                runtimeError={status.error}
                runtimeLoading={status.isLoading}
                tauriRuntime={tauriRuntime}
                onRunAction={(action) => runAction.mutate(action)}
              />
            ) : null}
            {activeSection === "advanced" ? (
              <AdvancedSection
                developerToolsEnabled={developerToolsEnabled}
                lastAction={lastAction}
                lastResult={lastResult}
                runtime={runtime}
                busy={busy}
              />
            ) : null}
            {activeSection === "about" ? (
              <AboutSection runtime={runtime} modelInfo={modelInfo.data} storage={storage} />
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}

function AppearanceSection() {
  const { settings, updateSettings } = useHermesSettings();

  return (
    <div className="space-y-8">
      <SettingsGroup title="通用设置">
        <SettingsRow label="主题" action={<ThemeSelector value={settings.themeMode} onChange={(themeMode) => updateSettings({ themeMode })} />} />
        <SettingsRow
          label="响应动画"
          description="控制应用内过渡和聊天流式输出的动画速度。"
          action={
            <SegmentedControl
              options={animationOptions}
              value={settings.animationMode}
              onChange={(animationMode) => updateSettings({ animationMode })}
            />
          }
        />
        <SettingsRow
          label="右键菜单方案"
          description="不使用时会拦截浏览器/WebView 默认右键菜单。"
          action={
            <SegmentedControl
              options={contextMenuOptions}
              value={settings.contextMenuMode}
              onChange={(contextMenuMode) => updateSettings({ contextMenuMode })}
            />
          }
        />
      </SettingsGroup>

      <SettingsGroup title="应用外观">
        <SettingsRow
          label="半透明侧边栏"
          description="使用系统原生窗口材质显示左侧栏；关闭后使用实色侧边栏。"
          action={
            <SwitchControl
              checked={settings.translucentSidebar}
              onChange={(translucentSidebar) => updateSettings({ translucentSidebar })}
            />
          }
        />
        <SettingsRow
          label="调色盘"
          action={
            <div className="flex flex-col items-end gap-4">
              <AccentSelector
                value={settings.accentColor}
                onChange={(accentColor) => updateSettings({ accentColor })}
              />
              <AppPalettePreview />
            </div>
          }
        />
      </SettingsGroup>
    </div>
  );
}

function ChatAppearanceSection() {
  const { settings, updateSettings } = useHermesSettings();

  return (
    <LobeRuntimeProvider>
      <div className="space-y-6">
        <SettingsGroup title="聊天显示">
          <SettingsRow
            label="消息过渡动画"
            description="控制新消息出现方式；关闭后消息列表不再执行动效。"
            action={
              <SegmentedControl
                options={chatTransitionOptions}
                value={settings.chatTransitionMode}
                onChange={(chatTransitionMode) => updateSettings({ chatTransitionMode })}
              />
            }
          >
            <TransitionPreview mode={settings.chatTransitionMode} />
          </SettingsRow>
          <SettingsRow
            label="流式输出自动滚动"
            description="关闭后，模型持续输出时不会强制把视图拉到最新内容。"
            action={
              <SwitchControl
                checked={settings.autoScrollOnStreaming}
                onChange={(autoScrollOnStreaming) => updateSettings({ autoScrollOnStreaming })}
              />
            }
          />
          <SettingsRow
            label="消息字号"
            description="影响聊天区所有 Lobe Markdown 消息。"
            action={
              <RangeControl
                value={settings.chatFontSize}
                min={12}
                max={18}
                onChange={(chatFontSize) => updateSettings({ chatFontSize })}
              />
            }
          >
            <ChatPreviewPanel />
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup title="Markdown 渲染">
          <SettingsRow
            label="代码块主题"
            action={
              <SelectControl
                value={settings.highlighterTheme}
                options={highlighterThemes.map((item) => ({ label: item.displayName, value: item.id }))}
                onChange={(highlighterTheme) => updateSettings({ highlighterTheme })}
              />
            }
          >
            <CodePreviewPanel />
          </SettingsRow>
          <SettingsRow
            label="Mermaid 主题"
            action={
              <SelectControl
                value={settings.mermaidTheme}
                options={mermaidThemes.map((item) => ({ label: item.displayName, value: item.id }))}
                onChange={(mermaidTheme) => updateSettings({ mermaidTheme })}
              />
            }
          >
            <MermaidPreviewPanel />
          </SettingsRow>
        </SettingsGroup>
      </div>
    </LobeRuntimeProvider>
  );
}

function ModelSection({
  error,
  loading,
  modelInfo,
}: {
  error: unknown;
  loading: boolean;
  modelInfo?: ModelInfoResponse;
}) {
  const configured = Boolean(modelInfo?.provider && modelInfo.model);

  return (
    <div className="space-y-6">
      <SettingsGroup title="默认模型">
        <SettingsRow
          label="配置状态"
          description="来自 Hermes dashboard /api/model/info。"
          action={<ModelStatusBadge configured={configured} loading={loading} />}
        />
        <SettingsRow
          label="提供商"
          description={modelInfo?.provider ?? "尚未返回 provider。"}
          action={<ValuePill value={modelInfo?.provider ?? "未配置"} />}
        />
        <SettingsRow
          label="默认模型"
          description={modelInfo?.model ?? "还没有默认模型。"}
          action={<ValuePill value={modelInfo?.model ?? "未配置"} mono />}
        />
        <SettingsRow
          label="有效上下文"
          description="dashboard 合并模型能力和配置后的上下文长度。"
          action={<ValuePill value={formatSettingsNumber(modelInfo?.effective_context_length)} mono />}
        />
        <SettingsRow
          label="配置上下文"
          description="如果用户显式设置过 context length，会显示在这里。"
          action={<ValuePill value={formatSettingsNumber(modelInfo?.config_context_length)} mono />}
        />
        {error ? (
          <SettingsRow
            label="读取失败"
            description={errorMessage(error)}
            action={<StatusPill tone="danger">需要处理</StatusPill>}
          />
        ) : null}
      </SettingsGroup>

      <SettingsGroup title="模型管理">
        <div className="flex flex-wrap gap-2 px-4 py-4">
          <Button asChild>
            <Link to="/models">
              <Sparkles className="h-4 w-4" />
              打开模型设置
            </Link>
          </Button>
        </div>
      </SettingsGroup>
    </div>
  );
}

function RuntimeSection({
  busy,
  lastAction,
  lastResult,
  ready,
  runtime,
  runtimeError,
  runtimeLoading,
  tauriRuntime,
  onRunAction,
}: {
  busy: boolean;
  lastAction: RuntimeAction | null;
  lastResult: RuntimeCommandResult | null;
  ready: boolean;
  runtime?: HermesStatus;
  runtimeError: unknown;
  runtimeLoading: boolean;
  tauriRuntime: boolean;
  onRunAction: (action: RuntimeAction) => void;
}) {
  return (
    <div className="space-y-6">
      <SettingsGroup title="本地服务">
        <SettingsRow
          label="状态"
          description={runtimeLoading ? "正在检查本地服务。" : runtimeSummary(runtime)}
          action={
            <RuntimeBadge
              installed={runtime?.installed}
              running={runtime?.running}
              backgroundGatewayRunning={runtime?.backgroundGatewayRunning}
            />
          }
        />
        <SettingsRow
          label="运行模式"
          description="桌面应用会在需要时准备内置运行时，并启动官方 dashboard TUI 后端。"
          action={<ValuePill value={runtime ? runtimeModeLabels[runtime.mode] : "检查中"} />}
        />
        <SettingsRow
          label="内置运行时"
          description={runtime?.bundledRuntimeArchive ?? "正在检查运行时归档。"}
          action={
            <StatusPill tone={runtime?.bundledRuntimeFound ? "success" : "warning"}>
              {runtime?.bundledRuntimeFound ? "可用" : "未找到"}
            </StatusPill>
          }
        />
        <SettingsRow
          label="Dashboard Token"
          description="聊天请求会带上 dashboard 本次进程生成的 session token。"
          action={
            <StatusPill tone={runtime?.sessionTokenConfigured ? "success" : "warning"}>
              {runtime?.sessionTokenConfigured ? "已生成" : "未生成"}
            </StatusPill>
          }
        />
        {runtimeError ? (
          <SettingsRow
            label="检查失败"
            description={errorMessage(runtimeError)}
            action={<StatusPill tone="danger">需要处理</StatusPill>}
          />
        ) : null}
      </SettingsGroup>

      <SettingsGroup title="控制">
        <div className="flex flex-wrap gap-2 px-4 py-4">
          <Button onClick={() => onRunAction("prepare")} disabled={!tauriRuntime || busy}>
            <Cpu className="h-4 w-4" />
            准备本地引擎
          </Button>
          <Button
            onClick={() => onRunAction(runtime?.running ? "stop" : "start")}
            disabled={!tauriRuntime || busy || !ready}
            variant="outline"
          >
            {runtime?.running ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {runtime?.running ? "停止 dashboard" : "启动 dashboard"}
          </Button>
          <Button
            onClick={() => onRunAction("status")}
            disabled={!tauriRuntime || busy || !ready}
            variant="outline"
          >
            <RefreshCcw className="h-4 w-4" />
            检查服务
          </Button>
          <Button
            onClick={() => onRunAction("doctor")}
            disabled={!tauriRuntime || busy || !ready}
            variant="outline"
          >
            <Stethoscope className="h-4 w-4" />
            诊断
          </Button>
          <Button
            onClick={() => onRunAction("portal")}
            disabled={!tauriRuntime || busy || !ready}
            variant="outline"
          >
            连接门户
          </Button>
          <Button
            onClick={() => onRunAction("logs")}
            disabled={!tauriRuntime || busy}
            variant="outline"
          >
            <FileText className="h-4 w-4" />
            打开日志
          </Button>
        </div>
        {!tauriRuntime ? (
          <p className="border-t border-border/70 px-4 py-3 text-sm text-muted-foreground">
            本地服务操作仅在 Tauri 桌面应用中可用。浏览器预览只显示界面。
          </p>
        ) : null}
      </SettingsGroup>

      <SettingsGroup title="最近一次操作">
        <div className="p-4">
          <CommandHeader lastAction={lastAction} lastResult={lastResult} />
          {busy ? (
            <div className="mt-3 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
              正在运行{lastAction ? actionLabels[lastAction] : "命令"}...
            </div>
          ) : (
            <div className="mt-3">
              <CommandOutput result={lastResult} dashboardStatus={runtime?.dashboardStatus ?? null} />
            </div>
          )}
        </div>
      </SettingsGroup>

      <SettingsGroup title="启动日志">
        <SettingsRow
          label="日志文件"
          description={runtime?.logPath ?? "本地服务检查后会显示日志路径。"}
          action={
            <Button
              onClick={() => onRunAction("logs")}
              disabled={!tauriRuntime || busy}
              variant="outline"
              size="sm"
            >
              <FileText className="h-4 w-4" />
              打开目录
            </Button>
          }
        />
        <div className="border-t border-border/70 p-4">
          <LogPreview lines={runtime?.recentLogLines ?? []} />
        </div>
      </SettingsGroup>
    </div>
  );
}

function AdvancedSection({
  busy,
  developerToolsEnabled,
  lastAction,
  lastResult,
  runtime,
}: {
  busy: boolean;
  developerToolsEnabled: boolean;
  lastAction: RuntimeAction | null;
  lastResult: RuntimeCommandResult | null;
  runtime?: HermesStatus;
}) {
  return (
    <div className="space-y-6">
      <SettingsGroup title="技术详情">
        <SettingsRow label="运行时根目录" description={runtime?.managedRoot ?? "检查中"} action={<ValuePill value="managedRoot" mono />} />
        <SettingsRow label="Hermes 主目录" description={runtime?.hermesHome ?? "检查中"} action={<ValuePill value="hermesHome" mono />} />
        <SettingsRow label="配置文件" description={runtime?.configPath ?? "检查中"} action={<ValuePill value="config" mono />} />
        <SettingsRow label="日志文件" description={runtime?.logPath ?? "检查中"} action={<ValuePill value="desktop.log" mono />} />
        <SettingsRow label="Hermes CLI" description={runtime?.path ?? "未找到"} action={<ValuePill value="cli" mono />} />
        <SettingsRow label="Python" description={runtime?.pythonPath ?? "未找到"} action={<ValuePill value="python" mono />} />
        <SettingsRow label="Dashboard API" description={runtime?.apiUrl ?? "http://127.0.0.1:9120"} action={<ValuePill value="api" mono />} />
        <SettingsRow label="TUI WebSocket" description={runtime?.wsUrl ?? "dashboard 启动后显示"} action={<ValuePill value="ws" mono />} />
      </SettingsGroup>

      <SettingsGroup title="开发者工具">
        <SettingsRow
          label="调试菜单"
          description="用于查看运行时命令输出、dashboard 状态和本地路径。"
          action={
            <StatusPill tone={developerToolsEnabled ? "success" : "neutral"}>
              {developerToolsEnabled ? "已启用" : "未启用"}
            </StatusPill>
          }
        />
        <div className="border-t border-border/70 p-4">
          <CommandHeader lastAction={lastAction} lastResult={lastResult} />
          {busy ? (
            <div className="mt-3 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
              正在运行{lastAction ? actionLabels[lastAction] : "命令"}...
            </div>
          ) : (
            <div className="mt-3">
              <CommandOutput result={lastResult} dashboardStatus={runtime?.dashboardStatus ?? null} />
            </div>
          )}
        </div>
      </SettingsGroup>
    </div>
  );
}

function AboutSection({
  modelInfo,
  runtime,
  storage,
}: {
  modelInfo?: ModelInfoResponse;
  runtime?: HermesStatus;
  storage: HermesSettingsStorage;
}) {
  return (
    <div className="space-y-6">
      <SettingsGroup title="Hermes Desktop">
        <SettingsRow
          label="聊天输入"
          description="聊天页使用 @lobehub/editor/react 的 ChatInput 与 Lexical Editor。"
          action={<StatusPill tone="success">@lobehub/editor</StatusPill>}
        />
        <SettingsRow
          label="Markdown"
          description="消息渲染使用 @lobehub/ui Markdown，设置页中的主题会直接影响聊天消息。"
          action={<StatusPill tone="success">@lobehub/ui</StatusPill>}
        />
        <SettingsRow
          label="本地服务"
          description={runtime ? runtimeSummary(runtime) : "正在检查本地服务。"}
          action={<ValuePill value={runtime?.version ?? "未知版本"} mono />}
        />
        <SettingsRow
          label="默认模型"
          description={modelInfo?.provider ? `Provider: ${modelInfo.provider}` : "dashboard 还没有返回模型信息。"}
          action={<ValuePill value={modelInfo?.model ?? "未配置"} mono />}
        />
        <SettingsRow
          label="偏好设置"
          description={
            storage.error
              ? `桌面设置文件暂不可用：${storage.error}`
              : storage.kind === "desktop"
                ? "保存在 Tauri 应用数据目录，不依赖 WebView localStorage。"
                : "当前是浏览器预览，才使用 localStorage 兜底。"
          }
          action={<ValuePill value={storage.loading ? "读取中" : storage.path} mono />}
        />
      </SettingsGroup>
    </div>
  );
}

function SettingsGroup({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="overflow-hidden rounded-xl border border-border/80 bg-background/80 shadow-sm">
      <div className="border-b border-border/70 bg-muted/25 px-3.5 py-2.5">
        <h2 className="text-sm font-semibold tracking-normal">{title}</h2>
      </div>
      <div className="divide-y divide-border/70">{children}</div>
    </section>
  );
}

function SettingsRow({
  action,
  children,
  description,
  label,
}: {
  action?: ReactNode;
  children?: ReactNode;
  description?: ReactNode;
  label: string;
}) {
  return (
    <div className="grid gap-3 px-3.5 py-3 md:grid-cols-[minmax(0,1fr)_minmax(220px,auto)] md:items-start">
      <div className="min-w-0">
        <div className="text-[13px] font-medium">{label}</div>
        {description ? (
          <div className="mt-1 min-w-0 break-words text-xs leading-5 text-muted-foreground">{description}</div>
        ) : null}
        {children ? <div className="mt-3 max-w-[560px]">{children}</div> : null}
      </div>
      {action ? <div className="flex min-w-0 justify-start md:justify-end">{action}</div> : null}
    </div>
  );
}

function ThemeSelector({
  onChange,
  value,
}: {
  onChange: (value: ThemeMode) => void;
  value: ThemeMode;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {themeOptions.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "group flex flex-col items-center gap-1.5 rounded-lg border border-border/70 bg-card p-1.5 text-xs transition-all",
            value === option.value && "border-primary shadow-[0_0_0_1px_hsl(var(--primary))]",
          )}
        >
          <ThemePreview value={option.value} />
          <span className={cn("flex items-center gap-1.5 text-muted-foreground", value === option.value && "text-foreground")}>
            {option.icon}
            {option.label}
          </span>
        </button>
      ))}
    </div>
  );
}

function ThemePreview({ value }: { value: ThemeMode }) {
  const light = (
    <div className="h-full flex-1 bg-white">
      <div className="h-3 bg-blue-500" />
      <div className="space-y-1 p-2">
        <div className="h-2 w-8 rounded-sm bg-sky-100" />
        <div className="h-2 w-14 rounded-sm bg-zinc-200" />
        <div className="h-2 w-10 rounded-sm bg-zinc-200" />
      </div>
    </div>
  );
  const dark = (
    <div className="h-full flex-1 bg-black">
      <div className="h-3 bg-[#071b55]" />
      <div className="space-y-1 p-2">
        <div className="h-2 w-8 rounded-sm bg-slate-700" />
        <div className="h-2 w-14 rounded-sm bg-zinc-800" />
        <div className="h-2 w-10 rounded-sm bg-zinc-800" />
      </div>
    </div>
  );

  return (
    <div className="flex h-[48px] w-[96px] overflow-hidden rounded-md border border-border bg-muted">
      {value === "light" ? light : null}
      {value === "dark" ? dark : null}
      {value === "system" ? (
        <>
          {light}
          {dark}
        </>
      ) : null}
    </div>
  );
}

function SegmentedControl<T extends string>({
  onChange,
  options,
  value,
}: {
  onChange: (value: T) => void;
  options: Array<{ icon?: ReactNode; label: string; value: T }>;
  value: T;
}) {
  return (
    <div className="inline-flex rounded-lg bg-muted p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground transition-colors",
            value === option.value && "bg-card text-foreground shadow-sm",
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

function AccentSelector({
  onChange,
  value,
}: {
  onChange: (value: AccentColor) => void;
  value: AccentColor;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {accentColors.map((accent) => (
        <button
          key={accent}
          type="button"
          onClick={() => onChange(accent)}
          className={cn(
            "flex h-8 items-center gap-2 rounded-md border border-border bg-card px-2 text-xs text-muted-foreground",
            value === accent && "border-primary text-foreground shadow-[0_0_0_1px_hsl(var(--primary))]",
          )}
        >
          <span className="h-4 w-4 rounded-full" style={{ background: accentMeta[accent].color }} />
          {accentMeta[accent].label}
        </button>
      ))}
    </div>
  );
}

function AppPalettePreview() {
  return (
    <div className="w-[240px] overflow-hidden rounded-lg border border-border/80 bg-card shadow-sm">
      <div className="grid h-[126px] grid-cols-[48px_1fr]">
        <div className="space-y-2.5 border-r border-border/70 bg-muted/60 p-2.5">
          <div className="h-5 w-5 rounded-full border-2 border-primary" />
          <div className="h-4 w-4 rounded bg-muted-foreground/20" />
          <div className="h-4 w-4 rounded bg-muted-foreground/20" />
          <div className="h-4 w-4 rounded bg-muted-foreground/20" />
        </div>
        <div className="flex flex-col">
          <div className="flex h-9 items-center justify-between border-b border-border/70 px-3">
            <div className="h-3 w-24 rounded bg-muted-foreground/20" />
            <div className="flex gap-1">
              <div className="h-3 w-3 rounded bg-muted-foreground/20" />
              <div className="h-3 w-3 rounded bg-muted-foreground/20" />
            </div>
          </div>
          <div className="flex-1 space-y-2 p-3">
            <div className="ml-auto h-7 w-24 rounded-md border border-border bg-background" />
            <div className="h-7 w-32 rounded-md bg-muted" />
            <div className="ml-auto h-3 w-16 rounded bg-primary" />
          </div>
        </div>
      </div>
    </div>
  );
}

function SwitchControl({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-7 w-12 rounded-full border border-border transition-colors",
        checked ? "bg-primary" : "bg-muted",
      )}
    >
      <span
        className={cn(
          "absolute top-1 h-5 w-5 rounded-full bg-card shadow-sm transition-transform",
          checked ? "translate-x-5" : "translate-x-1",
        )}
      />
    </button>
  );
}

function RangeControl({
  max,
  min,
  onChange,
  value,
}: {
  max: number;
  min: number;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <div className="flex w-[220px] items-center gap-2.5">
      <span className="text-xs text-muted-foreground">A</span>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="min-w-0 flex-1 accent-primary"
      />
      <span className="text-base font-medium">A</span>
      <span className="w-9 rounded-md border border-border bg-card px-1.5 py-1 text-center text-xs tabular-nums">
        {value}
      </span>
    </div>
  );
}

function SelectControl<T extends string>({
  onChange,
  options,
  value,
}: {
  onChange: (value: T) => void;
  options: Array<{ label: string; value: T }>;
  value: T;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
      className="h-9 w-[240px] rounded-lg border border-border/80 bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function TransitionPreview({ mode }: { mode: ChatTransitionMode }) {
  return (
    <div className="flex h-[72px] max-w-[380px] items-center gap-3 rounded-lg border border-border bg-card p-3">
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Bot className="h-3.5 w-3.5" />
      </div>
      <div
        className={cn(
          "space-y-2 rounded-lg border border-border bg-background p-3 transition-all",
          mode === "fadeIn" && "opacity-80",
          mode === "smooth" && "translate-y-0 shadow-sm",
        )}
      >
        <div className="h-2 w-48 rounded bg-muted-foreground/25" />
        <div className="h-2 w-32 rounded bg-muted-foreground/20" />
      </div>
    </div>
  );
}

function ChatPreviewPanel() {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <MarkdownMessage>
        {["这是一段聊天字号预览，包含 **加粗**、列表和代码。", "", "- 扫描当前上下文", "- 输出可执行的下一步"].join("\n")}
      </MarkdownMessage>
    </div>
  );
}

function CodePreviewPanel() {
  const sample = [
    "```ts",
    "const task = await hermes.chat(\"整理今天的本地任务\");",
    "console.log(task.summary);",
    "```",
  ].join("\n");

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <MarkdownMessage>{sample}</MarkdownMessage>
    </div>
  );
}

function MermaidPreviewPanel() {
  const sample = ["```mermaid", "flowchart LR", "  A[输入] --> B[计划]", "  B --> C[执行]", "  C --> D[结果]", "```"].join("\n");

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <MarkdownMessage>{sample}</MarkdownMessage>
    </div>
  );
}

function RuntimeBadge({
  backgroundGatewayRunning,
  installed,
  running,
}: {
  backgroundGatewayRunning?: boolean;
  installed?: boolean;
  running?: boolean;
}) {
  if (running) {
    return (
      <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
        <CheckCircle2 className="mr-1 h-3 w-3" />
        就绪
      </Badge>
    );
  }

  if (installed) {
    return (
      <Badge className="border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300">
        <CircleAlert className="mr-1 h-3 w-3" />
        {backgroundGatewayRunning ? "Dashboard 已停止" : "已停止"}
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

function ModelStatusBadge({ configured, loading }: { configured?: boolean; loading: boolean }) {
  if (loading) {
    return (
      <Badge className="border-border bg-secondary text-muted-foreground">
        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        检查中
      </Badge>
    );
  }

  return (
    <StatusPill tone={configured ? "success" : "warning"}>
      {configured ? "已配置" : "需要设置"}
    </StatusPill>
  );
}

function StatusPill({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "danger" | "neutral" | "success" | "warning";
}) {
  const classes = {
    danger: "border-destructive/20 bg-destructive/10 text-destructive",
    neutral: "border-border bg-secondary text-muted-foreground",
    success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    warning: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  };

  return <Badge className={classes[tone]}>{children}</Badge>;
}

function ValuePill({ mono = false, value }: { mono?: boolean; value: string }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-[280px] items-center justify-end truncate rounded-md border border-border/70 bg-background px-2 py-1 text-xs text-muted-foreground",
        mono && "font-mono",
      )}
      title={value}
    >
      {value}
    </span>
  );
}

function CommandHeader({
  lastAction,
  lastResult,
}: {
  lastAction: RuntimeAction | null;
  lastResult: RuntimeCommandResult | null;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
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
  );
}

function CommandOutput({
  dashboardStatus,
  result,
}: {
  dashboardStatus: string | null;
  result: RuntimeCommandResult | null;
}) {
  if (!result && !dashboardStatus) {
    return (
      <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
        还没有运行任何操作。
      </div>
    );
  }

  const output = result ? [result.stdout, result.stderr].filter(Boolean).join("\n") : dashboardStatus;

  return (
    <div className="rounded-md border border-border bg-[#0a0a0b] p-3 text-xs text-zinc-100">
      <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap leading-5">{output || "没有输出。"}</pre>
      {dashboardStatus && result ? (
        <>
          <Separator className="my-3 bg-zinc-800" />
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap leading-5 text-zinc-300">{dashboardStatus}</pre>
        </>
      ) : null}
    </div>
  );
}

function LogPreview({ lines }: { lines: string[] }) {
  if (lines.length === 0) {
    return (
      <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
        还没有启动日志。准备或启动本地服务后会显示最近记录。
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-[#0a0a0b] p-3 text-xs text-zinc-100">
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap leading-5">
        {lines.join("\n")}
      </pre>
    </div>
  );
}

function formatSettingsNumber(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : "未设置";
}

function runtimeSummary(runtime?: HermesStatus) {
  if (!runtime) {
    return "正在检查本地服务。";
  }

  if (runtime.running) {
    return "本地服务已就绪并运行中。";
  }

  if (runtime.backgroundGatewayRunning) {
    return "后台 gateway 正在运行，dashboard 暂未就绪。";
  }

  if (runtime.installed) {
    return "运行时已准备，可以启动本地服务。";
  }

  return "需要先准备本地运行时。";
}
