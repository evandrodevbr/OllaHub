"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeHighlight from "rehype-highlight";
import { Copy } from "lucide-react";

type MarkdownRendererProps = {
  content: string;
};

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  // Normalizar quebras de linha e espaços
  const normalizedContent = content
    .replace(/\n{3,}/g, "\n\n") // Máximo 2 quebras consecutivas
    .replace(/[ \t]+$/gm, "") // Remover espaços no final das linhas
    .trim();

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw, rehypeHighlight]}
      components={{
        code({ inline, className, children, ...props }: any) {
          const text = String(children || "");

          if (inline) {
            return (
              <code className="rounded bg-[var(--surface)] px-1 py-0.5 text-[0.95em]">
                {children}
              </code>
            );
          }

          return (
            <div className="relative my-4 rounded-lg border border-[var(--border)] bg-[var(--background)]">
              <button
                type="button"
                className="absolute right-2 top-2 rounded px-2 py-1 text-xs bg-[var(--surface)]/70 hover:bg-[var(--surface)] transition-colors"
                onClick={() => navigator.clipboard.writeText(text)}
                aria-label="Copiar código"
              >
                <Copy className="h-3 w-3" />
              </button>
              <pre className="overflow-auto p-3">
                <code className={className} {...props}>
                  {children}
                </code>
              </pre>
            </div>
          );
        },
        h1: ({ children }: any) => (
          <h1 className="text-xl font-bold mt-4 mb-2 first:mt-0">{children}</h1>
        ),
        h2: ({ children }: any) => (
          <h2 className="text-lg font-semibold mt-3 mb-2">{children}</h2>
        ),
        h3: ({ children }: any) => (
          <h3 className="text-base font-semibold mt-3 mb-1">{children}</h3>
        ),
        h4: ({ children }: any) => (
          <h4 className="text-sm font-semibold mt-2 mb-1">{children}</h4>
        ),
        h5: ({ children }: any) => (
          <h5 className="text-sm font-medium mt-2 mb-1">{children}</h5>
        ),
        h6: ({ children }: any) => (
          <h6 className="text-xs font-medium mt-2 mb-1">{children}</h6>
        ),
        p: ({ children }: any) => (
          <p className="mb-3 leading-relaxed">{children}</p>
        ),
        ul: ({ children }: any) => (
          <ul className="mb-3 ml-4 list-disc space-y-1">{children}</ul>
        ),
        ol: ({ children }: any) => (
          <ol className="mb-3 ml-4 list-decimal space-y-1">{children}</ol>
        ),
        li: ({ children }: any) => (
          <li className="leading-relaxed">{children}</li>
        ),
        blockquote: ({ children }: any) => (
          <blockquote className="border-l-4 border-[var(--border)] pl-4 my-3 italic text-[var(--foreground)]/80">
            {children}
          </blockquote>
        ),
        hr: () => <hr className="my-4 border-[var(--border)]" />,
        br: () => <br className="mb-1" />,
      }}
    >
      {normalizedContent}
    </ReactMarkdown>
  );
}
