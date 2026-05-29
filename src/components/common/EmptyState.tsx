import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div className="flex min-h-80 flex-col items-center justify-center px-6 text-center">
      {icon ? <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-border/80 bg-card/90 text-primary shadow-sm">{icon}</div> : null}
      <h2 className="text-sm font-medium">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
