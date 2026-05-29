import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

interface MarkdownMessageProps {
  children: string;
  streaming?: boolean;
}

export function MarkdownMessage({ children, streaming }: MarkdownMessageProps) {
  return (
    <div className="relative">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-2.5 border-l-4 border-border pl-3 text-muted-foreground">
              {children}
            </blockquote>
          ),
          code: ({ children, className }) => {
            const inline = !className;
            return (
              <code
                className={cn(
                  inline
                    ? "rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.88em]"
                    : "font-mono text-xs leading-5",
                  className,
                )}
              >
                {children}
              </code>
            );
          },
          h1: ({ children }) => <h1 className="mb-2.5 mt-4 text-lg font-semibold first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-2 mt-4 text-base font-semibold first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-1.5 mt-3 text-[15px] font-semibold first:mt-0">{children}</h3>,
          li: ({ children }) => <li className="pl-1">{children}</li>,
          ol: ({ children }) => <ol className="my-2.5 list-decimal space-y-1 pl-5">{children}</ol>,
          p: ({ children }) => <p className="mb-2.5 last:mb-0">{children}</p>,
          pre: ({ children }) => (
            <pre className="my-2.5 overflow-auto rounded-lg border border-border bg-muted/70 p-3 text-xs leading-5">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="my-2.5 overflow-x-auto rounded-lg border border-border">
              <table className="w-full border-collapse text-[13px]">{children}</table>
            </div>
          ),
          td: ({ children }) => <td className="border-t border-border px-3 py-1.5 align-top">{children}</td>,
          th: ({ children }) => (
            <th className="bg-muted/70 px-3 py-1.5 text-left font-medium align-top">{children}</th>
          ),
          ul: ({ children }) => <ul className="my-2.5 list-disc space-y-1 pl-5">{children}</ul>,
        }}
      >
        {children}
      </ReactMarkdown>
      {streaming ? <span className="ml-1 inline-block h-4 w-1 translate-y-0.5 animate-pulse rounded-full bg-foreground/70" /> : null}
    </div>
  );
}
