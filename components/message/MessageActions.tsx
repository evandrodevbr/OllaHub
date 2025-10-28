"use client";

import { useState } from "react";
import { Copy, Edit3, RefreshCw, Check, ChevronDown } from "lucide-react";
import { useCopyPrefs } from "@/hooks/useCopyPrefs";
import { stripMarkdown } from "@/hooks/useMarkdown";

type MessageActionsProps = {
  content: string;
  disabled?: boolean;
  onEdit?: () => void;
  onRegenerate?: () => void;
};

export function MessageActions({
  content,
  disabled,
  onEdit,
  onRegenerate,
}: MessageActionsProps) {
  const [copied, setCopied] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const { copyMode, setCopyMode } = useCopyPrefs();

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleCopyDefault = () => {
    const textToCopy =
      copyMode === "markdown" ? content : stripMarkdown(content);
    copy(textToCopy);
  };

  const handleModeSelect = (mode: "markdown" | "text") => {
    setCopyMode(mode);
    const textToCopy = mode === "markdown" ? content : stripMarkdown(content);
    copy(textToCopy);
    setDropdownOpen(false);
  };

  return (
    <div className="flex items-center gap-1 opacity-70">
      <button
        className="rounded px-2 py-1 text-xs hover:bg-[var(--surface)]"
        onClick={handleCopyDefault}
        disabled={disabled}
        aria-label="Copiar"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      </button>

      <div className="relative">
        <button
          className="rounded px-1 py-1 text-xs hover:bg-[var(--surface)]"
          onClick={() => setDropdownOpen(!dropdownOpen)}
          disabled={disabled}
          aria-label="Selecionar formato"
        >
          <ChevronDown className="h-3 w-3" />
        </button>

        {dropdownOpen && (
          <div className="absolute right-0 z-10 mt-1 rounded border border-[var(--border)] bg-[var(--background)] shadow-lg">
            <button
              className="block w-full px-3 py-2 text-left text-xs hover:bg-[var(--surface)]"
              onClick={() => handleModeSelect("markdown")}
            >
              Markdown
            </button>
            <button
              className="block w-full px-3 py-2 text-left text-xs hover:bg-[var(--surface)]"
              onClick={() => handleModeSelect("text")}
            >
              Texto
            </button>
          </div>
        )}
      </div>

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
