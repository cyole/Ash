import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { isTauriRuntime, loadAppSettings, saveAppSettings } from "@/lib/tauri";

export const themeModes = ["light", "dark", "system"] as const;
export const animationModes = ["disabled", "agile", "elegant"] as const;
export const contextMenuModes = ["disabled", "default"] as const;
export const chatTransitionModes = ["none", "fadeIn", "smooth"] as const;
export const accentColors = ["neutral", "blue", "green", "rose"] as const;

export type ThemeMode = (typeof themeModes)[number];
export type AnimationMode = (typeof animationModes)[number];
export type ContextMenuMode = (typeof contextMenuModes)[number];
export type ChatTransitionMode = (typeof chatTransitionModes)[number];
export type AccentColor = (typeof accentColors)[number];

export interface HermesSettingsStorage {
  error: string | null;
  kind: "browser-preview" | "desktop";
  loading: boolean;
  path: string;
}

export interface HermesSettings {
  accentColor: AccentColor;
  animationMode: AnimationMode;
  autoScrollOnStreaming: boolean;
  chatFontSize: number;
  chatTransitionMode: ChatTransitionMode;
  contextMenuMode: ContextMenuMode;
  highlighterTheme: string;
  mermaidTheme: string;
  themeMode: ThemeMode;
}

interface HermesSettingsContextValue {
  resetSettings: () => void;
  settings: HermesSettings;
  storage: HermesSettingsStorage;
  updateSettings: (patch: Partial<HermesSettings>) => void;
}

const settingsStorageKey = "hermes.settings.v1";
const browserPreviewStoragePath = `browser-preview:localStorage/${settingsStorageKey}`;
const minChatFontSize = 12;
const maxChatFontSize = 18;

export const defaultHermesSettings: HermesSettings = {
  accentColor: "neutral",
  animationMode: "agile",
  autoScrollOnStreaming: true,
  chatFontSize: 14,
  chatTransitionMode: "smooth",
  contextMenuMode: "default",
  highlighterTheme: "lobe-theme",
  mermaidTheme: "lobe-theme",
  themeMode: "system",
};

const HermesSettingsContext = createContext<HermesSettingsContextValue | null>(null);

export function HermesSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<HermesSettings>(() =>
    isTauriRuntime() ? defaultHermesSettings : readBrowserStoredSettings(),
  );
  const [hydrated, setHydrated] = useState(false);
  const [storage, setStorage] = useState<HermesSettingsStorage>(() => ({
    error: null,
    kind: isTauriRuntime() ? "desktop" : "browser-preview",
    loading: true,
    path: isTauriRuntime() ? "正在读取桌面设置文件" : browserPreviewStoragePath,
  }));

  const updateSettings = useCallback((patch: Partial<HermesSettings>) => {
    setSettings((current) => normalizeSettings({ ...current, ...patch }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(defaultHermesSettings);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrateSettings() {
      if (!isTauriRuntime()) {
        setSettings(readBrowserStoredSettings());
        setStorage({
          error: null,
          kind: "browser-preview",
          loading: false,
          path: browserPreviewStoragePath,
        });
        setHydrated(true);
        return;
      }

      try {
        const result = await loadAppSettings();
        if (cancelled) {
          return;
        }

        const browserFallbackSettings = readBrowserStoredSettings();
        const nextSettings = result.settings ? normalizeSettings(result.settings) : browserFallbackSettings;

        setSettings(nextSettings);
        setStorage({
          error: null,
          kind: "desktop",
          loading: false,
          path: result.path,
        });
        setHydrated(true);

        if (!result.settings) {
          void saveAppSettings(serializeSettings(nextSettings));
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        setSettings(readBrowserStoredSettings());
        setStorage({
          error: errorToString(error),
          kind: "desktop",
          loading: false,
          path: "桌面设置文件暂不可用",
        });
        setHydrated(true);
      }
    }

    void hydrateSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (!isTauriRuntime()) {
      writeBrowserStoredSettings(settings);
      return;
    }

    saveAppSettings(serializeSettings(settings))
      .then((result) => {
        setStorage((current) => ({
          ...current,
          error: null,
          kind: "desktop",
          loading: false,
          path: result.path,
        }));
      })
      .catch((error) => {
        setStorage((current) => ({
          ...current,
          error: errorToString(error),
          loading: false,
        }));
      });
  }, [hydrated, settings]);

  useEffect(() => {
    const root = document.documentElement;
    const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

    function applyTheme() {
      const shouldUseDark =
        settings.themeMode === "dark" ||
        (settings.themeMode === "system" && darkQuery.matches);

      root.classList.toggle("dark", shouldUseDark);
      root.dataset.hermesTheme = settings.themeMode;
      root.dataset.hermesAccent = settings.accentColor;
      root.dataset.hermesAnimation = settings.animationMode;
    }

    applyTheme();
    darkQuery.addEventListener("change", applyTheme);

    return () => {
      darkQuery.removeEventListener("change", applyTheme);
    };
  }, [settings.accentColor, settings.animationMode, settings.themeMode]);

  useEffect(() => {
    function handleContextMenu(event: MouseEvent) {
      if (settings.contextMenuMode === "disabled") {
        event.preventDefault();
      }
    }

    document.addEventListener("contextmenu", handleContextMenu, { capture: true });
    return () => document.removeEventListener("contextmenu", handleContextMenu, { capture: true });
  }, [settings.contextMenuMode]);

  const value = useMemo(
    () => ({
      resetSettings,
      settings,
      storage,
      updateSettings,
    }),
    [resetSettings, settings, storage, updateSettings],
  );

  return <HermesSettingsContext.Provider value={value}>{children}</HermesSettingsContext.Provider>;
}

export function useHermesSettings() {
  const value = useContext(HermesSettingsContext);

  if (!value) {
    throw new Error("useHermesSettings must be used inside HermesSettingsProvider.");
  }

  return value;
}

function readBrowserStoredSettings() {
  try {
    const raw = window.localStorage.getItem(settingsStorageKey);
    if (!raw) {
      return defaultHermesSettings;
    }

    return normalizeSettings(JSON.parse(raw) as Partial<HermesSettings>);
  } catch {
    return defaultHermesSettings;
  }
}

function writeBrowserStoredSettings(settings: HermesSettings) {
  try {
    window.localStorage.setItem(settingsStorageKey, JSON.stringify(serializeSettings(settings)));
  } catch {
    // Local storage can be unavailable in hardened webviews.
  }
}

function serializeSettings(settings: HermesSettings): Record<string, unknown> {
  return {
    accentColor: settings.accentColor,
    animationMode: settings.animationMode,
    autoScrollOnStreaming: settings.autoScrollOnStreaming,
    chatFontSize: settings.chatFontSize,
    chatTransitionMode: settings.chatTransitionMode,
    contextMenuMode: settings.contextMenuMode,
    highlighterTheme: settings.highlighterTheme,
    mermaidTheme: settings.mermaidTheme,
    themeMode: settings.themeMode,
  };
}

function normalizeSettings(input: Partial<HermesSettings>): HermesSettings {
  return {
    accentColor: isOneOf(input.accentColor, accentColors)
      ? input.accentColor
      : defaultHermesSettings.accentColor,
    animationMode: isOneOf(input.animationMode, animationModes)
      ? input.animationMode
      : defaultHermesSettings.animationMode,
    autoScrollOnStreaming:
      typeof input.autoScrollOnStreaming === "boolean"
        ? input.autoScrollOnStreaming
        : defaultHermesSettings.autoScrollOnStreaming,
    chatFontSize:
      typeof input.chatFontSize === "number"
        ? clamp(Math.round(input.chatFontSize), minChatFontSize, maxChatFontSize)
        : defaultHermesSettings.chatFontSize,
    chatTransitionMode: isOneOf(input.chatTransitionMode, chatTransitionModes)
      ? input.chatTransitionMode
      : defaultHermesSettings.chatTransitionMode,
    contextMenuMode: isOneOf(input.contextMenuMode, contextMenuModes)
      ? input.contextMenuMode
      : defaultHermesSettings.contextMenuMode,
    highlighterTheme:
      typeof input.highlighterTheme === "string" && input.highlighterTheme.trim()
        ? input.highlighterTheme
        : defaultHermesSettings.highlighterTheme,
    mermaidTheme:
      typeof input.mermaidTheme === "string" && input.mermaidTheme.trim()
        ? input.mermaidTheme
        : defaultHermesSettings.mermaidTheme,
    themeMode: isOneOf(input.themeMode, themeModes)
      ? input.themeMode
      : defaultHermesSettings.themeMode,
  };
}

function isOneOf<const T extends readonly string[]>(value: unknown, options: T): value is T[number] {
  return typeof value === "string" && options.includes(value);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function errorToString(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
