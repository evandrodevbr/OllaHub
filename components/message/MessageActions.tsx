"use client";

import { useState } from "react";
import { Copy, Edit3, RefreshCw, Check } from "lucide-react";

type MessageActionsProps = {
  content: string;
  disabled?: boolean;
  onEdit?: () => void;
  onRegenerate?: () => void;
  extractCodeBlocks?: (
    text: string
  ) => Array<{ language: string; code: string }>;
};

export function MessageActions({
  content,
  disabled,
  onEdit,
  onRegenerate,
  extractCodeBlocks,
}: MessageActionsProps) {
  const [copied, setCopied] = useState<"none" | "markdown" | "text" | "code">(
    "none"
  );

  const copy = async (text: string, flag: MessageActionsProps["content"]) => {
    await navigator.clipboard.writeText(text);
    setCopied(flag as any);
    setTimeout(() => setCopied("none"), 1500);
  };

  const stripMarkdown = (md: string) =>
    md
      .replace(/```[\s\S]*?```/g, (block) =>
        block.replace(/```[\s\S]*?\n/, "").replace(/```$/, "")
      )
      .replace(/[#*_>`~-]/g, "");
  const codeBlocks = extractCodeBlocks ? extractCodeBlocks(content) : [];

  return (
    <div className="flex items-center gap-1 opacity-70">
      <button
        className="rounded px-2 py-1 text-xs hover:bg-[var(--surface)]"
        onClick={() => copy(content, "markdown")}
        disabled={disabled}
        aria-label="Copy as markdown"
      >
        {copied === "markdown" ? (
          <Check className="h-3 w-3" />
        ) : (
          <Copy className="h-3 w-3" />
        )}{" "}
        MD
      </button>
      <button
        className="rounded px-2 py-1 text-xs hover:bg-[var(--surface)]"
        onClick={() => copy(stripMarkdown(content), "text")}
        disabled={disabled}
        aria-label="Copy as plain text"
      >
        {copied === "text" ? (
          <Check className="h-3 w-3" />
        ) : (
          <Copy className="h-3 w-3" />
        )}{" "}
        TXT
      </button>
      {codeBlocks.map((b, i) => (
        <button
          key={`${b.language}-${i}`}
          className="rounded px-2 py-1 text-xs hover:bg-[var(--surface)]"
          onClick={() => copy(b.code, "code")}
          disabled={disabled}
          aria-label={`Copy ${b.language} code`}
        >
          {copied === "code" ? (
            <Check className="h-3 w-3" />
          ) : (
            <Copy className="h-3 w-3" />
          )}{" "}
          {b.language}
        </button>
      ))}
      {onEdit && (
        <button
          className="rounded px-2 py-1 text-xs hover:bg-[var(--surface)]"
          onClick={onEdit}
          disabled={disabled}
          aria-label="Edit message"
        >
          <Edit3 className="h-3 w-3" /> Edit
        </button>
      )}
      {onRegenerate && (
        <button
          className="rounded px-2 py-1 text-xs hover:bg-[var(--surface)]"
          onClick={onRegenerate}
          disabled={disabled}
          aria-label="Regenerate"
        >
          <RefreshCw className="h-3 w-3" /> Retry
        </button>
      )}
    </div>
  );
}
