import { ConfigProvider, ThemeProvider } from "@lobehub/ui";
import { m } from "motion/react";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useState } from "react";
import { useHermesSettings } from "@/features/settings/settings-store";

interface LobeRuntimeProviderProps {
  children: ReactNode;
}

const LobeRuntimeContext = createContext(false);

export function useLobeRuntime() {
  return useContext(LobeRuntimeContext);
}

export function LobeRuntimeProvider({ children }: LobeRuntimeProviderProps) {
  const { settings } = useHermesSettings();
  const [systemDark, setSystemDark] = useState(getSystemDarkPreference);
  const appearance = settings.themeMode === "dark" || (settings.themeMode === "system" && systemDark) ? "dark" : "light";
  const primaryColor = settings.accentColor === "green" ? "green" : settings.accentColor === "rose" ? "red" : "blue";

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => setSystemDark(query.matches);

    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  return (
    <ThemeProvider
      appearance={appearance}
      customTheme={{ neutralColor: "slate", primaryColor }}
      defaultAppearance={appearance}
      defaultThemeMode={appearance}
      enableCustomFonts={false}
      enableGlobalStyle={false}
      style={{ display: "contents" }}
      theme={{
        cssVar: { key: "lobe-vars" },
        token: {
          motion: settings.animationMode !== "disabled",
          motionUnit: settings.animationMode === "agile" ? 0.05 : 0.1,
        },
      }}
    >
      <ConfigProvider locale="zh-CN" motion={m} config={{ imgUnoptimized: true }}>
        <LobeRuntimeContext.Provider value>{children}</LobeRuntimeContext.Provider>
      </ConfigProvider>
    </ThemeProvider>
  );
}

function getSystemDarkPreference() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}
