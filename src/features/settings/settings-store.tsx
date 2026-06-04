import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { isTauriRuntime, loadAppSettings, saveAppSettings, setWindowTheme, setWindowTranslucency } from "@/lib/tauri";

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

export interface AshSettingsStorage {
  error: string | null;
  kind: "browser-preview" | "desktop";
  loading: boolean;
  path: string;
}

export interface AshSettings {
  accentColor: AccentColor;
  animationMode: AnimationMode;
  autoScrollOnStreaming: boolean;
  chatFontSize: number;
  chatTransitionMode: ChatTransitionMode;
  contextMenuMode: ContextMenuMode;
  highlighterTheme: string;
  mermaidTheme: string;
  themeMode: ThemeMode;
  translucentSidebar: boolean;
}

interface AshSettingsContextValue {
  resetSettings: () => void;
  settings: AshSettings;
  storage: AshSettingsStorage;
  updateSettings: (patch: Partial<AshSettings>) => void;
}

const settingsStorageKey = "ash.settings.v1";
const browserPreviewStoragePath = `browser-preview:localStorage/${settingsStorageKey}`;
const minChatFontSize = 12;
const maxChatFontSize = 18;

export const defaultAshSettings: AshSettings = {
  accentColor: "neutral",
  animationMode: "agile",
  autoScrollOnStreaming: true,
  chatFontSize: 14,
  chatTransitionMode: "smooth",
  contextMenuMode: "default",
  highlighterTheme: "lobe-theme",
  mermaidTheme: "lobe-theme",
  themeMode: "system",
  translucentSidebar: true,
};

const AshSettingsContext = createContext<AshSettingsContextValue | null>(null);

export function AshSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AshSettings>(() =>
    isTauriRuntime() ? defaultAshSettings : readBrowserStoredSettings(),
  );
  const [hydrated, setHydrated] = useState(false);
  const [storage, setStorage] = useState<AshSettingsStorage>(() => ({
    error: null,
    kind: isTauriRuntime() ? "desktop" : "browser-preview",
    loading: true,
    path: isTauriRuntime() ? "正在读取桌面设置文件" : browserPreviewStoragePath,
  }));

  const updateSettings = useCallback((patch: Partial<AshSettings>) => {
    setSettings((current) => normalizeSettings({ ...current, ...patch }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(defaultAshSettings);
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
      root.dataset.ashTheme = settings.themeMode;
      root.dataset.ashAccent = settings.accentColor;
      root.dataset.ashAnimation = settings.animationMode;
      root.dataset.ashTranslucentSidebar = settings.translucentSidebar ? "true" : "false";
    }

    applyTheme();
    darkQuery.addEventListener("change", applyTheme);

    return () => {
      darkQuery.removeEventListener("change", applyTheme);
    };
  }, [settings.accentColor, settings.animationMode, settings.themeMode, settings.translucentSidebar]);

  useEffect(() => {
    void setWindowTranslucency(settings.translucentSidebar).catch((error) => {
      console.error("Failed to apply native window translucency.", error);
    });
  }, [settings.translucentSidebar]);

  useEffect(() => {
    void setWindowTheme(settings.themeMode).catch((error) => {
      console.error("Failed to apply native window theme.", error);
    });
  }, [settings.themeMode]);

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

  return <AshSettingsContext.Provider value={value}>{children}</AshSettingsContext.Provider>;
}

export function useAshSettings() {
  const value = useContext(AshSettingsContext);

  if (!value) {
    throw new Error("useAshSettings must be used inside AshSettingsProvider.");
  }

  return value;
}

function readBrowserStoredSettings() {
  try {
    const raw = window.localStorage.getItem(settingsStorageKey);
    if (!raw) {
      return defaultAshSettings;
    }

    return normalizeSettings(JSON.parse(raw) as Partial<AshSettings>);
  } catch {
    return defaultAshSettings;
  }
}

function writeBrowserStoredSettings(settings: AshSettings) {
  try {
    window.localStorage.setItem(settingsStorageKey, JSON.stringify(serializeSettings(settings)));
  } catch {
    // Local storage can be unavailable in hardened webviews.
  }
}

function serializeSettings(settings: AshSettings): Record<string, unknown> {
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
    translucentSidebar: settings.translucentSidebar,
  };
}

function normalizeSettings(input: Partial<AshSettings>): AshSettings {
  return {
    accentColor: isOneOf(input.accentColor, accentColors)
      ? input.accentColor
      : defaultAshSettings.accentColor,
    animationMode: isOneOf(input.animationMode, animationModes)
      ? input.animationMode
      : defaultAshSettings.animationMode,
    autoScrollOnStreaming:
      typeof input.autoScrollOnStreaming === "boolean"
        ? input.autoScrollOnStreaming
        : defaultAshSettings.autoScrollOnStreaming,
    chatFontSize:
      typeof input.chatFontSize === "number"
        ? clamp(Math.round(input.chatFontSize), minChatFontSize, maxChatFontSize)
        : defaultAshSettings.chatFontSize,
    chatTransitionMode: isOneOf(input.chatTransitionMode, chatTransitionModes)
      ? input.chatTransitionMode
      : defaultAshSettings.chatTransitionMode,
    contextMenuMode: isOneOf(input.contextMenuMode, contextMenuModes)
      ? input.contextMenuMode
      : defaultAshSettings.contextMenuMode,
    highlighterTheme:
      typeof input.highlighterTheme === "string" && input.highlighterTheme.trim()
        ? input.highlighterTheme
        : defaultAshSettings.highlighterTheme,
    mermaidTheme:
      typeof input.mermaidTheme === "string" && input.mermaidTheme.trim()
        ? input.mermaidTheme
        : defaultAshSettings.mermaidTheme,
    themeMode: isOneOf(input.themeMode, themeModes)
      ? input.themeMode
      : defaultAshSettings.themeMode,
    translucentSidebar:
      typeof input.translucentSidebar === "boolean"
        ? input.translucentSidebar
        : defaultAshSettings.translucentSidebar,
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
