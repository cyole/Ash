import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { QRCode } from "antd";
import { useQuery } from "@tanstack/react-query";
import {
  Bot,
  CircleAlert,
  ExternalLink,
  Loader2,
  Mail,
  MessageCircle,
  MessageSquare,
  Power,
  QrCode,
  RadioTower,
  RefreshCcw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  Webhook,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/errors";
import { hermesQueryKeys, useHermesApi } from "@/lib/hermes/queries";
import { getWeixinQrCode, pollWeixinQrStatus } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import type { WeixinQrStatus } from "@/lib/tauri";
import type { MessagingEnvVarInfo, MessagingPlatformInfo, MessagingPlatformTestResponse } from "@/types/hermes-dashboard";

type EditMap = Record<string, Record<string, string>>;
type StatusTone = "danger" | "neutral" | "success" | "warning";

interface FieldCopy {
  advanced?: boolean;
  help?: string;
  label: string;
  placeholder?: string;
}

interface WeixinQrState {
  message?: string;
  pollBaseUrl?: string;
  qrcode?: string;
  qrcodeUrl?: string;
  status: "confirmed" | "error" | "expired" | "idle" | "loading" | "saving" | "scaned" | "waiting";
}

const WEIXIN_DOCS_URL = "https://hermes-agent.nousresearch.com/docs/zh-Hans/user-guide/messaging/weixin";
const WEIXIN_ILINK_BASE_URL = "https://ilinkai.weixin.qq.com";
const WEIXIN_CDN_BASE_URL = "https://novac2c.cdn.weixin.qq.com/c2c";

const WEIXIN_QR_DEFAULT_ENV = [
  ["WEIXIN_CDN_BASE_URL", WEIXIN_CDN_BASE_URL],
  ["WEIXIN_DM_POLICY", "pairing"],
  ["WEIXIN_ALLOW_ALL_USERS", "false"],
  ["WEIXIN_ALLOWED_USERS", ""],
  ["WEIXIN_GROUP_POLICY", "disabled"],
  ["WEIXIN_GROUP_ALLOWED_USERS", ""],
] as const satisfies ReadonlyArray<readonly [string, string]>;

const STATE_LABELS: Record<string, string> = {
  connected: "已连接",
  connecting: "连接中",
  disabled: "已停用",
  fatal: "错误",
  gateway_stopped: "Gateway 未运行",
  not_configured: "待配置",
  pending_restart: "需重启",
  retrying: "重试中",
  startup_failed: "启动失败",
};

const STATE_HELP: Record<string, string> = {
  gateway_stopped: "启动或重启 Gateway 后，渠道才会开始连接。",
  not_configured: "先填完必填凭证，再启用渠道。",
  pending_restart: "配置已保存，重启 Gateway 后生效。",
};

const FIELD_COPY: Record<string, FieldCopy> = {
  API_SERVER_ENABLED: {
    advanced: true,
    help: "启用 OpenAI-compatible API server。",
    label: "启用 API Server",
  },
  API_SERVER_HOST: {
    advanced: true,
    label: "监听地址",
    placeholder: "127.0.0.1",
  },
  API_SERVER_KEY: {
    label: "API Key",
  },
  API_SERVER_MODEL_NAME: {
    advanced: true,
    label: "模型名称",
  },
  API_SERVER_PORT: {
    advanced: true,
    label: "端口",
    placeholder: "8080",
  },
  BLUEBUBBLES_ALLOWED_USERS: {
    help: "逗号分隔允许使用 Hermes 的 iMessage 用户。",
    label: "允许用户",
  },
  BLUEBUBBLES_PASSWORD: {
    label: "服务密码",
  },
  BLUEBUBBLES_SERVER_URL: {
    label: "BlueBubbles URL",
    placeholder: "https://bluebubbles.example.com",
  },
  DINGTALK_CLIENT_ID: {
    label: "Client ID / App Key",
  },
  DINGTALK_CLIENT_SECRET: {
    label: "Client Secret / App Secret",
  },
  DISCORD_ALLOWED_USERS: {
    help: "推荐填写。逗号分隔 Discord user ID。",
    label: "允许用户",
  },
  DISCORD_BOT_TOKEN: {
    help: "在 Discord Developer Portal 创建应用并添加 Bot 后复制。",
    label: "Bot Token",
  },
  DISCORD_REPLY_TO_MODE: {
    advanced: true,
    help: "可选 first / all / off。",
    label: "回复方式",
  },
  EMAIL_ADDRESS: {
    label: "邮箱地址",
  },
  EMAIL_IMAP_HOST: {
    label: "IMAP Host",
    placeholder: "imap.gmail.com",
  },
  EMAIL_PASSWORD: {
    label: "邮箱密码 / App Password",
  },
  EMAIL_SMTP_HOST: {
    label: "SMTP Host",
    placeholder: "smtp.gmail.com",
  },
  FEISHU_APP_ID: {
    label: "App ID",
  },
  FEISHU_APP_SECRET: {
    label: "App Secret",
  },
  FEISHU_ENCRYPT_KEY: {
    advanced: true,
    label: "Encrypt Key",
  },
  FEISHU_VERIFICATION_TOKEN: {
    advanced: true,
    label: "Verification Token",
  },
  HASS_TOKEN: {
    label: "Long-lived Token",
  },
  HASS_URL: {
    label: "Home Assistant URL",
    placeholder: "https://homeassistant.local:8123",
  },
  MATTERMOST_ALLOWED_USERS: {
    help: "逗号分隔 Mattermost 用户 ID。",
    label: "允许用户",
  },
  MATTERMOST_TOKEN: {
    label: "Bot Token",
  },
  MATTERMOST_URL: {
    label: "Server URL",
    placeholder: "https://mattermost.example.com",
  },
  MATRIX_ACCESS_TOKEN: {
    label: "Access Token",
  },
  MATRIX_ALLOWED_USERS: {
    help: "逗号分隔 @user:server 格式的用户。",
    label: "允许用户",
  },
  MATRIX_HOMESERVER: {
    label: "Homeserver",
    placeholder: "https://matrix.org",
  },
  MATRIX_USER_ID: {
    label: "Bot User ID",
    placeholder: "@hermes:example.org",
  },
  QQ_ALLOWED_USERS: {
    help: "逗号分隔允许使用 Hermes 的 QQ 用户。",
    label: "允许用户",
  },
  QQ_APP_ID: {
    label: "App ID",
  },
  QQ_CLIENT_SECRET: {
    label: "Client Secret",
  },
  SIGNAL_ACCOUNT: {
    label: "Signal 账号",
  },
  SIGNAL_ALLOWED_USERS: {
    help: "逗号分隔允许使用 Hermes 的 Signal 用户。",
    label: "允许用户",
  },
  SIGNAL_HTTP_URL: {
    label: "signal-cli REST URL",
    placeholder: "http://127.0.0.1:8080",
  },
  SLACK_APP_TOKEN: {
    help: "Socket Mode 需要的 xapp- token。",
    label: "App-level Token",
    placeholder: "xapp-...",
  },
  SLACK_BOT_TOKEN: {
    help: "OAuth & Permissions 安装后复制 xoxb- token。",
    label: "Bot Token",
    placeholder: "xoxb-...",
  },
  TELEGRAM_ALLOWED_USERS: {
    help: "推荐填写。逗号分隔 Telegram 数字用户 ID。",
    label: "允许用户",
  },
  TELEGRAM_BOT_TOKEN: {
    help: "通过 @BotFather 创建 bot 后复制 token。",
    label: "Bot Token",
    placeholder: "123456:ABC...",
  },
  TELEGRAM_PROXY: {
    advanced: true,
    help: "仅在当前网络无法访问 Telegram 时需要。",
    label: "代理地址",
  },
  WEBHOOK_ENABLED: {
    advanced: true,
    label: "启用 Webhook",
  },
  WEBHOOK_PORT: {
    advanced: true,
    label: "Webhook 端口",
  },
  WEBHOOK_SECRET: {
    label: "Webhook Secret",
  },
  WECOM_BOT_ID: {
    help: "企业微信群机器人 Webhook Key。",
    label: "Bot ID / Webhook Key",
  },
  WECOM_CALLBACK_AGENT_ID: {
    label: "Agent ID",
  },
  WECOM_CALLBACK_CORP_ID: {
    label: "Corp ID",
  },
  WECOM_CALLBACK_CORP_SECRET: {
    label: "Corp Secret",
  },
  WECOM_CALLBACK_ENCODING_AES_KEY: {
    advanced: true,
    label: "Encoding AES Key",
  },
  WECOM_CALLBACK_TOKEN: {
    advanced: true,
    label: "Callback Token",
  },
  WECOM_SECRET: {
    label: "Secret",
  },
  WEIXIN_ACCOUNT_ID: {
    help: "扫码确认后由 Tencent iLink 返回，通常形如 bot 身份 ID。",
    label: "Account ID",
  },
  WEIXIN_BASE_URL: {
    help: "iLink API 地址；未特殊返回时使用官方默认地址。",
    label: "iLink Base URL",
    placeholder: WEIXIN_ILINK_BASE_URL,
  },
  WEIXIN_TOKEN: {
    help: "扫码确认后返回的 bot token；不是公众号 callback token。",
    label: "Bot Token",
  },
  WHATSAPP_ALLOWED_USERS: {
    help: "逗号分隔允许使用 Hermes 的 WhatsApp 用户。",
    label: "允许用户",
  },
  WHATSAPP_ENABLED: {
    advanced: true,
    label: "启用 WhatsApp Bridge",
  },
  WHATSAPP_MODE: {
    advanced: true,
    label: "Bridge Mode",
  },
};

const PLATFORM_COPY: Record<string, string> = {
  api_server: "开启 OpenAI-compatible HTTP API，供 Open WebUI、LobeChat 等外部客户端调用。",
  bluebubbles: "在 macOS 上运行 BlueBubbles Server 后，把服务地址和密码填入这里。",
  dingtalk: "在钉钉开放平台创建应用，复制 Client ID 和 Client Secret。",
  discord: "在 Discord Developer Portal 创建应用并添加 Bot，再复制 Bot Token。",
  email: "建议使用专用邮箱。Gmail / Workspace 通常需要 App Password。",
  feishu: "在飞书 / Lark 开放平台创建应用并启用机器人能力。",
  matrix: "使用 bot 账号登录 homeserver 后复制 access token、user ID 和 homeserver URL。",
  mattermost: "创建 Mattermost bot 账号或 personal access token，再填写服务 URL。",
  qqbot: "在 QQ 开放平台创建应用，复制 App ID 和 Client Secret。",
  signal: "先运行 signal-cli REST bridge，再把 bridge URL 和注册手机号填入这里。",
  slack: "创建 Slack app，启用 Socket Mode，安装到 workspace 后复制 xoxb- 和 xapp- token。",
  telegram: "通过 @BotFather 创建 bot，复制 token；建议同时限制允许用户。",
  webhooks: "启动 HTTP webhook server，供 GitHub、GitLab 或自定义系统推送事件。",
  webhook: "启动 HTTP webhook server，供 GitHub、GitLab 或自定义系统推送事件。",
  wecom: "企业微信群机器人是 send-only；需要双向消息时使用 WeCom app。",
  wecom_callback: "配置企业微信自建应用 callback，填写 corp、agent、token 和 AES key。",
  weixin: "微信个人号接入走 Tencent iLink Bot API。扫码后保存 Account ID 和 Bot Token。",
  whatsapp: "使用 Hermes 自带 WhatsApp bridge，首次运行需要扫码授权。",
};

const PLATFORM_ICON: Record<string, ReactNode> = {
  api_server: <RadioTower className="h-4 w-4" />,
  dingtalk: <MessageSquare className="h-4 w-4" />,
  discord: <MessageCircle className="h-4 w-4" />,
  email: <Mail className="h-4 w-4" />,
  feishu: <Send className="h-4 w-4" />,
  matrix: <MessageSquare className="h-4 w-4" />,
  qqbot: <Bot className="h-4 w-4" />,
  slack: <MessageSquare className="h-4 w-4" />,
  telegram: <Send className="h-4 w-4" />,
  webhook: <Webhook className="h-4 w-4" />,
  webhooks: <Webhook className="h-4 w-4" />,
  wecom: <MessageCircle className="h-4 w-4" />,
  wecom_callback: <MessageCircle className="h-4 w-4" />,
  weixin: <MessageCircle className="h-4 w-4" />,
  whatsapp: <MessageCircle className="h-4 w-4" />,
};

export function MessagingSettingsPanel() {
  const { apiReady, apiUrl, client, sessionToken, status, tauriRuntime } = useHermesApi();
  const [edits, setEdits] = useState<EditMap>({});
  const [query, setQuery] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [showAdvanced, setShowAdvanced] = useState<Record<string, boolean>>({});
  const [weixinQr, setWeixinQr] = useState<WeixinQrState>({ status: "idle" });

  const platformsQuery = useQuery({
    enabled: apiReady,
    queryKey: hermesQueryKeys.messagingPlatforms(apiUrl, Boolean(sessionToken)),
    queryFn: () => client.getMessagingPlatforms(),
    refetchInterval: 6_000,
    refetchIntervalInBackground: false,
  });

  const platforms = useMemo(() => normalizePlatforms(platformsQuery.data?.platforms), [platformsQuery.data?.platforms]);

  useEffect(() => {
    if (platforms.length === 0) {
      setSelectedId("");
      return;
    }

    if (!selectedId || !platforms.some((platform) => platform.id === selectedId)) {
      setSelectedId(platforms[0]!.id);
    }
  }, [platforms, selectedId]);

  const visiblePlatforms = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return platforms;
    }

    return platforms.filter((platform) =>
      [platform.id, platform.name, platform.description, platform.state]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [platforms, query]);

  const selectedPlatform = platforms.find((platform) => platform.id === selectedId) ?? platforms[0] ?? null;

  const refresh = useCallback(() => {
    void platformsQuery.refetch();
    void status.refetch();
  }, [platformsQuery, status]);

  const saveWeixinQrCredentials = useCallback(
    async (result: WeixinQrStatus) => {
      const accountId = result.accountId?.trim();
      const token = result.token?.trim();
      if (!accountId || !token) {
        throw new Error("微信扫码已确认，但 iLink 没有返回完整凭证。");
      }

      setWeixinQr((current) => ({ ...current, message: "正在保存微信凭证...", status: "saving" }));

      const env: Record<string, string> = {
        WEIXIN_ACCOUNT_ID: accountId,
        WEIXIN_BASE_URL: result.baseUrl?.trim() || WEIXIN_ILINK_BASE_URL,
        WEIXIN_TOKEN: token,
      };

      await client.updateMessagingPlatform("weixin", {
        enabled: true,
        env,
      });

      for (const [key, value] of WEIXIN_QR_DEFAULT_ENV) {
        await client.setEnvVar(key, value);
      }

      if (result.userId?.trim()) {
        await client.setEnvVar("WEIXIN_HOME_CHANNEL", result.userId.trim());
      }

      try {
        await client.restartGateway();
        toast.success("微信已配置，Gateway 已重启");
      } catch (error) {
        toast.warning(`微信凭证已保存，但 Gateway 重启失败：${errorMessage(error)}`);
      }

      setEdits((current) => ({ ...current, weixin: {} }));
      setSelectedId("weixin");
      setWeixinQr((current) => ({
        ...current,
        message: result.userId ? `已保存，Home Channel: ${result.userId}` : "已保存微信凭证",
        status: "confirmed",
      }));
      await platformsQuery.refetch();
      void status.refetch();
    },
    [client, platformsQuery, status],
  );

  useEffect(() => {
    if (!weixinQr.qrcode || (weixinQr.status !== "waiting" && weixinQr.status !== "scaned")) {
      return;
    }

    let cancelled = false;
    let timeoutId: number | undefined;

    const poll = async () => {
      if (cancelled || !weixinQr.qrcode) {
        return;
      }

      try {
        const result = await pollWeixinQrStatus(weixinQr.qrcode, weixinQr.pollBaseUrl);
        if (cancelled) {
          return;
        }

        if (result.status === "confirmed") {
          void saveWeixinQrCredentials(result).catch((error) => {
            setWeixinQr((current) => ({
              ...current,
              message: errorMessage(error),
              status: "error",
            }));
            toast.error(`微信凭证保存失败：${errorMessage(error)}`);
          });
          return;
        }

        if (result.status === "expired") {
          setWeixinQr((current) => ({ ...current, message: "二维码已过期，请重新获取。", status: "expired" }));
          return;
        }

        const nextBaseUrl = result.status === "scaned_but_redirect" && result.redirectHost ? `https://${result.redirectHost}` : weixinQr.pollBaseUrl;
        setWeixinQr((current) => ({
          ...current,
          message: result.status === "scaned" ? "已扫码，请在微信中确认。" : current.message,
          pollBaseUrl: nextBaseUrl,
          status: result.status === "scaned" || result.status === "scaned_but_redirect" ? "scaned" : "waiting",
        }));
        timeoutId = window.setTimeout(poll, 3_000);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setWeixinQr((current) => ({ ...current, message: `等待 iLink 响应：${errorMessage(error)}` }));
        timeoutId = window.setTimeout(poll, 3_000);
      }
    };

    timeoutId = window.setTimeout(poll, 1_000);

    return () => {
      cancelled = true;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [saveWeixinQrCredentials, weixinQr.pollBaseUrl, weixinQr.qrcode, weixinQr.status]);

  async function startWeixinQrLogin() {
    setWeixinQr({ status: "loading" });

    try {
      const result = await getWeixinQrCode();
      const qrcodeUrl = result.qrcodeUrl.trim();
      setWeixinQr({
        message: "请用微信扫码并在手机上确认。",
        qrcode: result.qrcode,
        qrcodeUrl,
        status: "waiting",
      });

      if (qrcodeUrl) {
        window.open(qrcodeUrl, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      setWeixinQr({ message: errorMessage(error), status: "error" });
      toast.error(`获取微信二维码失败：${errorMessage(error)}`);
    }
  }

  async function handleToggle(platform: MessagingPlatformInfo, enabled: boolean) {
    setSavingKey(`toggle:${platform.id}`);

    try {
      await client.updateMessagingPlatform(platform.id, { enabled });
      toast.success(enabled ? `${platform.name} 已启用` : `${platform.name} 已停用`);
      await platformsQuery.refetch();
    } catch (error) {
      toast.error(`更新 ${platform.name} 失败：${errorMessage(error)}`);
    } finally {
      setSavingKey(null);
    }
  }

  async function handleSave(platform: MessagingPlatformInfo) {
    const env = trimEdits(edits[platform.id] ?? {});
    if (Object.keys(env).length === 0) {
      toast.info("没有需要保存的渠道配置。");
      return;
    }

    setSavingKey(`save:${platform.id}`);

    try {
      await client.updateMessagingPlatform(platform.id, { env });
      setEdits((current) => ({ ...current, [platform.id]: {} }));
      toast.success(`${platform.name} 配置已保存`);
      await platformsQuery.refetch();
    } catch (error) {
      toast.error(`保存 ${platform.name} 失败：${errorMessage(error)}`);
    } finally {
      setSavingKey(null);
    }
  }

  async function handleClear(platform: MessagingPlatformInfo, key: string) {
    if (!window.confirm(`确定移除 ${key} 吗？`)) {
      return;
    }

    setSavingKey(`clear:${key}`);

    try {
      await client.updateMessagingPlatform(platform.id, { clear_env: [key] });
      setEdits((current) => ({
        ...current,
        [platform.id]: {
          ...(current[platform.id] ?? {}),
          [key]: "",
        },
      }));
      toast.success(`${key} 已移除`);
      await platformsQuery.refetch();
    } catch (error) {
      toast.error(`移除 ${key} 失败：${errorMessage(error)}`);
    } finally {
      setSavingKey(null);
    }
  }

  async function handleTest(platform: MessagingPlatformInfo) {
    setSavingKey(`test:${platform.id}`);

    try {
      const result = await client.testMessagingPlatform(platform.id);
      notifyTestResult(platform, result);
      await platformsQuery.refetch();
    } catch (error) {
      toast.error(`测试 ${platform.name} 失败：${errorMessage(error)}`);
    } finally {
      setSavingKey(null);
    }
  }

  async function handleRestartGateway() {
    setSavingKey("restart");

    try {
      await client.restartGateway();
      toast.success("Gateway 已重启");
      await platformsQuery.refetch();
      void status.refetch();
    } catch (error) {
      toast.error(`重启 Gateway 失败：${errorMessage(error)}`);
    } finally {
      setSavingKey(null);
    }
  }

  if (!apiReady) {
    return (
      <PanelNotice
        icon={<Loader2 className="h-4 w-4 animate-spin" />}
        title="正在连接 Hermes dashboard"
        description="消息渠道配置需要本地 dashboard API 就绪后读取。"
      />
    );
  }

  if (platformsQuery.isError) {
    return (
      <PanelNotice
        icon={<CircleAlert className="h-4 w-4" />}
        title="消息渠道读取失败"
        description={errorMessage(platformsQuery.error)}
        action={
          <Button variant="outline" size="sm" onClick={() => void platformsQuery.refetch()}>
            <RefreshCcw className="h-4 w-4" />
            重试
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <StatusBadge tone={status.data?.backgroundGatewayRunning ? "success" : "warning"}>
            {status.data?.backgroundGatewayRunning ? "Gateway 运行中" : "Gateway 未运行"}
          </StatusBadge>
          <span>{platforms.length} 个渠道</span>
          {platformsQuery.isFetching ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              正在同步状态
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={platformsQuery.isFetching}>
            <RefreshCcw className="h-4 w-4" />
            刷新
          </Button>
          <Button variant="outline" size="sm" onClick={() => void handleRestartGateway()} disabled={savingKey === "restart"}>
            {savingKey === "restart" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
            重启 Gateway
          </Button>
        </div>
      </div>

      <section className="grid min-h-[560px] overflow-hidden rounded-xl border border-border/80 bg-background/80 shadow-sm md:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="border-b border-border/70 bg-muted/20 md:border-b-0 md:border-r">
          <div className="border-b border-border/70 p-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索渠道..."
                className="pl-8"
              />
            </div>
          </div>
          <div className="max-h-[520px] overflow-y-auto p-2">
            {visiblePlatforms.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/80 px-3 py-6 text-center text-xs text-muted-foreground">
                没有匹配的渠道
              </div>
            ) : (
              <div className="space-y-1">
                {visiblePlatforms.map((platform) => (
                  <PlatformRow
                    key={platform.id}
                    active={selectedPlatform?.id === platform.id}
                    platform={platform}
                    onSelect={() => setSelectedId(platform.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </aside>

        <main className="min-w-0">
          {platformsQuery.isLoading ? (
            <div className="flex h-full min-h-[420px] items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              正在读取消息渠道...
            </div>
          ) : selectedPlatform ? (
            <PlatformDetail
              edits={edits[selectedPlatform.id] ?? {}}
              platform={selectedPlatform}
              savingKey={savingKey}
              showAdvanced={Boolean(showAdvanced[selectedPlatform.id])}
              tauriRuntime={tauriRuntime}
              weixinQr={weixinQr}
              onClear={(key) => void handleClear(selectedPlatform, key)}
              onEdit={(key, value) => {
                setEdits((current) => ({
                  ...current,
                  [selectedPlatform.id]: {
                    ...(current[selectedPlatform.id] ?? {}),
                    [key]: value,
                  },
                }));
              }}
              onSave={() => void handleSave(selectedPlatform)}
              onStartWeixinQr={() => void startWeixinQrLogin()}
              onTest={() => void handleTest(selectedPlatform)}
              onToggle={(enabled) => void handleToggle(selectedPlatform, enabled)}
              onToggleAdvanced={() => {
                setShowAdvanced((current) => ({
                  ...current,
                  [selectedPlatform.id]: !current[selectedPlatform.id],
                }));
              }}
            />
          ) : (
            <div className="flex h-full min-h-[420px] items-center justify-center text-sm text-muted-foreground">
              暂无可配置渠道
            </div>
          )}
        </main>
      </section>
    </div>
  );
}

function PlatformDetail({
  edits,
  onClear,
  onEdit,
  onSave,
  onStartWeixinQr,
  onTest,
  onToggle,
  onToggleAdvanced,
  platform,
  savingKey,
  showAdvanced,
  tauriRuntime,
  weixinQr,
}: {
  edits: Record<string, string>;
  onClear: (key: string) => void;
  onEdit: (key: string, value: string) => void;
  onSave: () => void;
  onStartWeixinQr: () => void;
  onTest: () => void;
  onToggle: (enabled: boolean) => void;
  onToggleAdvanced: () => void;
  platform: MessagingPlatformInfo;
  savingKey: string | null;
  showAdvanced: boolean;
  tauriRuntime: boolean;
  weixinQr: WeixinQrState;
}) {
  const requiredFields = platform.env_vars.filter((field) => field.required);
  const optionalFields = platform.env_vars.filter((field) => !field.required && !fieldCopy(field).advanced);
  const advancedFields = platform.env_vars.filter((field) => !field.required && fieldCopy(field).advanced);
  const hasEdits = Object.keys(trimEdits(edits)).length > 0;
  const tone = stateTone(platform);
  const stateHint = STATE_HELP[platform.state ?? ""] ?? (!platform.gateway_running && platform.enabled ? STATE_HELP.gateway_stopped : "");
  const docsUrl = docsUrlFor(platform);
  const intro = introCopy(platform);

  return (
    <div className="flex min-h-[560px] flex-col">
      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <PlatformAvatar platform={platform} size="lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold tracking-normal">{platform.name}</h2>
                <StatusBadge tone={tone}>{stateLabel(platform.state)}</StatusBadge>
                <StatusBadge tone={platform.configured ? "success" : "warning"}>
                  {platform.configured ? "凭证已保存" : "需要配置"}
                </StatusBadge>
              </div>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{intro || platform.description}</p>
              {stateHint ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{stateHint}</p> : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SwitchControl
              checked={platform.enabled}
              disabled={savingKey === `toggle:${platform.id}`}
              onChange={onToggle}
            />
          </div>
        </header>

        {platform.error_message ? (
          <div className="flex gap-2 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive">
            <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{platform.error_message}</span>
          </div>
        ) : null}

        {platform.id === "weixin" ? (
          <WeixinQrLoginPanel
            docsUrl={docsUrl}
            qrState={weixinQr}
            tauriRuntime={tauriRuntime}
            onStart={onStartWeixinQr}
          />
        ) : null}

        <SectionCard title="配置指南">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 text-xs leading-5 text-muted-foreground">
              {platform.id === "weixin"
                ? "微信扫码会保存 iLink 凭证，并按官方 CLI 默认启用 DM pairing、关闭群聊。"
                : "按官方 dashboard 暴露的 env key 保存凭证；保存后重启 Gateway 才会重新连接。"}
            </div>
            {docsUrl ? (
              <Button asChild variant="outline" size="sm">
                <a href={docsUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  打开文档
                </a>
              </Button>
            ) : null}
          </div>
        </SectionCard>

        <FieldSection
          title="必填凭证"
          empty="这个渠道没有必填凭证。"
          fields={requiredFields}
          edits={edits}
          savingKey={savingKey}
          onClear={onClear}
          onEdit={onEdit}
        />

        {optionalFields.length > 0 ? (
          <FieldSection
            title="推荐配置"
            fields={optionalFields}
            edits={edits}
            savingKey={savingKey}
            onClear={onClear}
            onEdit={onEdit}
          />
        ) : null}

        {advancedFields.length > 0 ? (
          <SectionCard
            title={`高级配置 (${advancedFields.length})`}
            action={
              <Button variant="ghost" size="sm" onClick={onToggleAdvanced}>
                {showAdvanced ? "收起" : "展开"}
              </Button>
            }
          >
            {showAdvanced ? (
              <div className="space-y-4">
                {advancedFields.map((field) => (
                  <MessagingField
                    key={field.key}
                    edits={edits}
                    field={field}
                    savingKey={savingKey}
                    onClear={onClear}
                    onEdit={onEdit}
                  />
                ))}
              </div>
            ) : (
              <p className="text-xs leading-5 text-muted-foreground">高级项通常只在自定义网络、代理或桥接模式下需要。</p>
            )}
          </SectionCard>
        ) : null}

        {platform.home_channel ? (
          <SectionCard title="Home Channel">
            <div className="grid gap-2 text-xs leading-5 text-muted-foreground sm:grid-cols-2">
              <MetaLine label="平台" value={platform.home_channel.platform} />
              <MetaLine label="名称" value={platform.home_channel.name || "未命名"} />
              <MetaLine label="Chat ID" value={platform.home_channel.chat_id} mono />
              {platform.home_channel.thread_id ? <MetaLine label="Thread ID" value={platform.home_channel.thread_id} mono /> : null}
            </div>
          </SectionCard>
        ) : null}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 bg-muted/20 px-4 py-3">
        <div className="text-xs text-muted-foreground">
          {hasEdits ? "有未保存的渠道配置" : platform.updated_at ? `最后状态：${formatDateTime(platform.updated_at)}` : "保存后请重启 Gateway"}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onTest} disabled={savingKey === `test:${platform.id}`}>
            {savingKey === `test:${platform.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            测试
          </Button>
          <Button size="sm" onClick={onSave} disabled={!hasEdits || savingKey === `save:${platform.id}`}>
            {savingKey === `save:${platform.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            保存
          </Button>
        </div>
      </footer>
    </div>
  );
}

function WeixinQrLoginPanel({
  docsUrl,
  onStart,
  qrState,
  tauriRuntime,
}: {
  docsUrl: string;
  onStart: () => void;
  qrState: WeixinQrState;
  tauriRuntime: boolean;
}) {
  const qrValue = qrState.qrcodeUrl || qrState.qrcode || "";
  const busy = qrState.status === "loading" || qrState.status === "saving";

  return (
    <SectionCard
      title="微信扫码登录"
      action={
        <Button onClick={onStart} size="sm" disabled={!tauriRuntime || busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
          {qrState.status === "confirmed" ? "重新扫码" : "扫码登录"}
        </Button>
      }
    >
      <div className="grid gap-4 md:grid-cols-[152px_minmax(0,1fr)]">
        <div className="flex h-[152px] items-center justify-center rounded-lg border border-border bg-card">
          {qrValue ? (
            <QRCode value={qrValue} size={128} bordered={false} color="currentColor" bgColor="transparent" />
          ) : (
            <QrCode className="h-10 w-10 text-muted-foreground/60" />
          )}
        </div>
        <div className="min-w-0 space-y-2 text-xs leading-5 text-muted-foreground">
          <p>
            官方微信接入是 Tencent iLink Bot API：扫码确认后返回 Account ID 与 Bot Token。它不是公众号 callback 配置。
          </p>
          <p>
            iLink 会生成 bot 身份，普通微信群通常不能直接邀请这个身份；群策略只有在 iLink 实际投递群事件时才生效。
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={qrTone(qrState.status)}>{qrLabel(qrState.status)}</StatusBadge>
            {qrState.message ? <span className="min-w-0 break-words">{qrState.message}</span> : null}
          </div>
          {!tauriRuntime ? <p>浏览器预览无法使用桌面 QR 代理；请在 Tauri 应用中扫码。</p> : null}
          {qrState.qrcodeUrl ? (
            <a className="inline-flex items-center gap-1 text-primary hover:underline" href={qrState.qrcodeUrl} target="_blank" rel="noreferrer">
              打开扫码链接
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : (
            <a className="inline-flex items-center gap-1 text-primary hover:underline" href={docsUrl} target="_blank" rel="noreferrer">
              查看官方微信指南
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

function FieldSection({
  edits,
  empty,
  fields,
  onClear,
  onEdit,
  savingKey,
  title,
}: {
  edits: Record<string, string>;
  empty?: string;
  fields: MessagingEnvVarInfo[];
  onClear: (key: string) => void;
  onEdit: (key: string, value: string) => void;
  savingKey: string | null;
  title: string;
}) {
  return (
    <SectionCard title={title}>
      {fields.length === 0 ? (
        <p className="text-xs leading-5 text-muted-foreground">{empty ?? "暂无配置项。"}</p>
      ) : (
        <div className="space-y-4">
          {fields.map((field) => (
            <MessagingField
              key={field.key}
              edits={edits}
              field={field}
              savingKey={savingKey}
              onClear={onClear}
              onEdit={onEdit}
            />
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function MessagingField({
  edits,
  field,
  onClear,
  onEdit,
  savingKey,
}: {
  edits: Record<string, string>;
  field: MessagingEnvVarInfo;
  onClear: (key: string) => void;
  onEdit: (key: string, value: string) => void;
  savingKey: string | null;
}) {
  const copy = fieldCopy(field);

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`messaging-env-${field.key}`} className="text-[13px] font-medium">
          {copy.label}
        </label>
        <span className="font-mono text-[11px] text-muted-foreground">{field.key}</span>
        {field.required ? <StatusBadge tone="warning">必填</StatusBadge> : null}
        {field.is_set ? <StatusBadge tone="success">已保存</StatusBadge> : null}
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <Input
          id={`messaging-env-${field.key}`}
          className="font-mono"
          type={field.is_password ? "password" : "text"}
          value={edits[field.key] ?? ""}
          placeholder={field.is_set ? field.redacted_value ?? "输入新值会覆盖当前配置" : copy.placeholder ?? field.key}
          onChange={(event) => onEdit(field.key, event.target.value)}
        />
        {field.url ? (
          <Button asChild variant="ghost" size="icon" title="打开字段文档">
            <a href={field.url} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        ) : null}
        {field.is_set ? (
          <Button
            variant="ghost"
            size="icon"
            title={`移除 ${field.key}`}
            onClick={() => onClear(field.key)}
            disabled={savingKey === `clear:${field.key}`}
          >
            {savingKey === `clear:${field.key}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </Button>
        ) : null}
      </div>
      {copy.help || field.description ? (
        <p className="text-xs leading-5 text-muted-foreground">{copy.help || field.description}</p>
      ) : null}
    </div>
  );
}

function PlatformRow({
  active,
  onSelect,
  platform,
}: {
  active: boolean;
  onSelect: () => void;
  platform: MessagingPlatformInfo;
}) {
  const tone = stateTone(platform);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors",
        active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
      )}
    >
      <PlatformAvatar platform={platform} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{platform.name}</span>
        <span className="block truncate text-[11px]">{stateLabel(platform.state)}</span>
      </span>
      <StatusDot tone={tone} />
    </button>
  );
}

function PlatformAvatar({ platform, size = "sm" }: { platform: MessagingPlatformInfo; size?: "lg" | "sm" }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-sm",
        size === "lg" ? "h-10 w-10" : "h-8 w-8",
      )}
    >
      {PLATFORM_ICON[platform.id] ?? <MessageCircle className={size === "lg" ? "h-5 w-5" : "h-4 w-4"} />}
    </span>
  );
}

function SectionCard({ action, children, title }: { action?: ReactNode; children: ReactNode; title: string }) {
  return (
    <section className="overflow-hidden rounded-xl border border-border/80 bg-card/80">
      <div className="flex min-h-10 items-center justify-between gap-2 border-b border-border/70 bg-muted/25 px-3.5 py-2">
        <h3 className="text-sm font-semibold tracking-normal">{title}</h3>
        {action}
      </div>
      <div className="p-3.5">{children}</div>
    </section>
  );
}

function PanelNotice({
  action,
  description,
  icon,
  title,
}: {
  action?: ReactNode;
  description: ReactNode;
  icon: ReactNode;
  title: string;
}) {
  return (
    <div className="rounded-xl border border-border/80 bg-background/80 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-muted-foreground">{icon}</div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{title}</div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">{description}</div>
        </div>
        {action}
      </div>
    </div>
  );
}

function MetaLine({ label, mono = false, value }: { label: string; mono?: boolean; value: string }) {
  return (
    <div className="min-w-0">
      <span className="text-muted-foreground">{label}: </span>
      <span className={cn("break-all text-foreground", mono && "font-mono")}>{value}</span>
    </div>
  );
}

function SwitchControl({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-7 w-12 rounded-full border border-border transition-colors disabled:cursor-not-allowed disabled:opacity-50",
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

function StatusBadge({ children, tone }: { children: ReactNode; tone: StatusTone }) {
  return (
    <Badge
      className={cn(
        "gap-1",
        tone === "success" && "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        tone === "warning" && "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        tone === "danger" && "border-destructive/20 bg-destructive/10 text-destructive",
      )}
    >
      {children}
    </Badge>
  );
}

function StatusDot({ tone }: { tone: StatusTone }) {
  return (
    <span
      className={cn(
        "h-2 w-2 shrink-0 rounded-full",
        tone === "success" && "bg-emerald-500",
        tone === "warning" && "bg-amber-500",
        tone === "danger" && "bg-destructive",
        tone === "neutral" && "bg-muted-foreground/50",
      )}
    />
  );
}

function fieldCopy(field: MessagingEnvVarInfo): FieldCopy {
  const copy: Partial<FieldCopy> = FIELD_COPY[field.key] ?? {};

  return {
    advanced: Boolean(copy.advanced || field.advanced),
    help: copy.help || field.description,
    label: copy.label || field.prompt || field.key,
    placeholder: copy.placeholder || field.prompt || field.key,
  };
}

function trimEdits(edits: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(edits)
      .map(([key, value]) => [key, value.trim()])
      .filter(([, value]) => value),
  );
}

function normalizePlatforms(platforms: MessagingPlatformInfo[] | undefined): MessagingPlatformInfo[] {
  if (!Array.isArray(platforms)) {
    return [];
  }

  return platforms.map((platform) => ({
    ...platform,
    description: platform.description ?? "",
    docs_url: platform.docs_url ?? "",
    env_vars: Array.isArray(platform.env_vars) ? platform.env_vars.filter((field) => Boolean(field?.key)) : [],
    id: platform.id ?? "",
    name: platform.name ?? platform.id ?? "Unknown",
  })).filter((platform) => Boolean(platform.id));
}

function stateTone(platform: MessagingPlatformInfo): StatusTone {
  if (!platform.enabled || platform.state === "disabled") {
    return "neutral";
  }

  if (platform.state === "connected") {
    return "success";
  }

  if (platform.state === "fatal" || platform.state === "startup_failed") {
    return "danger";
  }

  return "warning";
}

function stateLabel(state?: null | string) {
  return state ? STATE_LABELS[state] ?? state.replace(/_/g, " ") : "未知状态";
}

function docsUrlFor(platform: MessagingPlatformInfo) {
  if (platform.id === "weixin") {
    return WEIXIN_DOCS_URL;
  }

  return platform.docs_url || "";
}

function introCopy(platform: MessagingPlatformInfo) {
  return PLATFORM_COPY[platform.id] || platform.description;
}

function notifyTestResult(platform: MessagingPlatformInfo, result: MessagingPlatformTestResponse) {
  const message = result.message || stateLabel(result.state) || platform.name;

  if (result.ok) {
    toast.success(message);
  } else {
    toast.warning(message);
  }
}

function qrTone(status: WeixinQrState["status"]): StatusTone {
  if (status === "confirmed") {
    return "success";
  }

  if (status === "error" || status === "expired") {
    return "danger";
  }

  if (status === "idle") {
    return "neutral";
  }

  return "warning";
}

function qrLabel(status: WeixinQrState["status"]) {
  switch (status) {
    case "confirmed":
      return "已配置";
    case "error":
      return "失败";
    case "expired":
      return "已过期";
    case "loading":
      return "获取中";
    case "saving":
      return "保存中";
    case "scaned":
      return "已扫码";
    case "waiting":
      return "等待扫码";
    case "idle":
      return "未开始";
  }
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  }).format(date);
}
