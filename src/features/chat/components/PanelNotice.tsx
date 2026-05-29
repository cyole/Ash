import type { ReactNode } from "react";

export function PanelNotice({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex min-h-28 flex-col items-center justify-center px-4 text-center">
      <div className="mb-2.5 flex h-8 w-8 items-center justify-center rounded-lg border border-border/80 bg-card/80 text-muted-foreground shadow-sm">
        {icon}
      </div>
      <div className="text-sm font-medium">{title}</div>
      {description ? <div className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">{description}</div> : null}
    </div>
  );
}
