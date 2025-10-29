"use client";

import { useState, useEffect, useRef } from "react";
import { User, Bot, Send, Loader2, Square } from "lucide-react";
import { MarkdownRenderer } from "@/components/message/MarkdownRenderer";
import { MessageActions } from "@/components/message/MessageActions";
import type { Message } from "@/lib/chat";
import { formatTimestamp } from "@/lib/chat";

interface ChatMessageProps {
  message: Message;
  isStreaming?: boolean;
  bubbleSize?: "sm" | "md" | "lg";
}

export function ChatMessage({
  message,
  isStreaming = false,
  bubbleSize = "md",
}: ChatMessageProps) {
  const isUser = message.role === "user";
  const sizeClass =
    bubbleSize === "sm"
      ? "px-3 py-1.5 text-sm"
      : bubbleSize === "lg"
      ? "px-5 py-3 text-base"
      : "px-4 py-2 text-sm";

  return (
    <div
      className={`flex gap-3 p-4 ${isUser ? "justify-end" : "justify-start"}`}
    >
      {!isUser && (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)] text-white">
          <Bot className="h-4 w-4" />
        </div>
      )}
      <div
        className={`max-w-[85%] md:max-w-[80%] relative rounded-lg ${sizeClass} shadow-sm ${
          isUser
            ? "bg-[var(--accent)] text-white"
            : "bg-[var(--surface)] text-[var(--foreground)]"
        }`}
      >
        <div className="break-words">
          {isUser ? (
            <div className="whitespace-pre-wrap">{message.content}</div>
          ) : (
            <MarkdownRenderer content={message.content} />
          )}
        </div>
        {isStreaming && <span className="ml-1 animate-pulse">▊</span>}
        {!isUser && !isStreaming && (
          <div className="absolute bottom-2 right-2 z-10 pointer-events-auto">
            <MessageActions content={message.content} />
          </div>
        )}
        <div
          className={`mt-1 text-xs opacity-70 ${
            isUser ? "text-right" : "text-left"
          }`}
        >
          {formatTimestamp(message.timestamp)}
        </div>
      </div>

      {isUser && (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface)]">
          <User className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}

interface ChatInputProps {
  onSendMessage: (content: string) => void;
  onStop?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
  placeholder?: string;
}

export function ChatInput({
  onSendMessage,
  onStop,
  disabled = false,
  isStreaming = false,
  placeholder = "Type a message...",
}: ChatInputProps) {
  const [content, setContent] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (content.trim() && !disabled) {
      onSendMessage(content.trim());
      setContent("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        120
      )}px`;
    }
  }, [content]);

  return (
    <form
      onSubmit={handleSubmit}
      className="flex gap-2 p-4 border-t border-[var(--border)]"
    >
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1 resize-none rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-50"
        rows={1}
        
      />
      <button
        type={isStreaming ? "button" : "submit"}
        onClick={isStreaming ? onStop : undefined}
        disabled={isStreaming ? false : !content.trim() || disabled}
        className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent)] text-white transition-colors hover:bg-[color-mix(in_oklab,var(--accent),black_10%)] disabled:opacity-50"
      >
        {isStreaming ? (
          <Square className="h-4 w-4" />
        ) : disabled ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
      </button>
    </form>
  );
}

interface StreamingTextProps {
  text: string;
  isStreaming: boolean;
}

export function StreamingText({ text, isStreaming }: StreamingTextProps) {
  return (
    <span>
      {text}
      {isStreaming && <span className="ml-1 animate-pulse">▊</span>}
    </span>
  );
}
