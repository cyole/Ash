import type { ReactNode } from "react";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col items-start justify-between gap-4 border-b border-border/70 bg-card px-6 py-5 sm:flex-row sm:gap-6">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1 text-xs font-medium text-primary">{eyebrow}</div> : null}
        <h1 className="text-xl font-semibold tracking-normal">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto">{actions}</div> : null}
    </div>
  );
}
