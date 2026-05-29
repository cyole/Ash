import type { MarkdownProps } from "@lobehub/ui";
import { Markdown } from "@lobehub/ui";
import { useMemo } from "react";
import { LobeRuntimeProvider, useLobeRuntime } from "@/features/chat/components/LobeRuntimeProvider";
import { useHermesSettings } from "@/features/settings/settings-store";

interface MarkdownMessageProps {
  children: string;
  streaming?: boolean;
}

export function MarkdownMessage({ children, streaming }: MarkdownMessageProps) {
  const { settings } = useHermesSettings();
  const hasLobeRuntime = useLobeRuntime();
  const shouldAnimate = Boolean(streaming && settings.animationMode !== "disabled");
  const componentProps = useMemo(
    () =>
      ({
        highlight: {
          fullFeatured: true,
          theme: settings.highlighterTheme as HighlightTheme,
        },
        img: {
          maxHeight: 360,
          objectFit: "contain",
          preview: false,
          variant: "outlined",
        },
        mermaid: {
          fullFeatured: true,
          theme: settings.mermaidTheme as MermaidTheme,
        },
      }) satisfies MarkdownProps["componentProps"],
    [settings.highlighterTheme, settings.mermaidTheme],
  );

  const message = (
    <div className="relative">
      <Markdown
        animated={shouldAnimate}
        className="hermes-lobe-markdown"
        componentProps={componentProps}
        enableGithubAlert
        enableHtmlPreview
        enableMermaid
        enableStream={shouldAnimate}
        fontSize={settings.chatFontSize}
        fullFeaturedCodeBlock
        lineHeight={1.68}
        marginMultiple={0.85}
        streamSmoothingPreset={settings.animationMode === "elegant" ? "silky" : "balanced"}
        variant="chat"
      >
        {children}
      </Markdown>
      {shouldAnimate ? (
        <span className="ml-1 inline-block h-4 w-1 translate-y-0.5 animate-pulse rounded-full bg-foreground/70" />
      ) : null}
    </div>
  );

  return hasLobeRuntime ? message : <LobeRuntimeProvider>{message}</LobeRuntimeProvider>;
}

type MarkdownComponentProps = NonNullable<MarkdownProps["componentProps"]>;
type HighlightTheme = NonNullable<NonNullable<MarkdownComponentProps["highlight"]>["theme"]>;
type MermaidTheme = NonNullable<NonNullable<MarkdownComponentProps["mermaid"]>["theme"]>;
