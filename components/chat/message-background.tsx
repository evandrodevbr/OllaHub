import * as React from "react";
import { cn } from "@/lib/utils";

type MessageRole = "user" | "assistant";
type MessageVisualState = "normal" | "highlighted" | "selected";

interface MessageBackgroundProps extends React.ComponentProps<"div"> {
  role: MessageRole;
  state?: MessageVisualState;
  highContrast?: boolean;
}

export function MessageBackground({
  role,
  state = "normal",
  highContrast = false,
  className,
  children,
  ...props
}: MessageBackgroundProps) {
  const base = "group flex w-full gap-3 md:gap-4 relative transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";
  const roleCl = role === "user"
    ? "rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-4 py-3"
    : "bg-transparent px-0 py-0";
  const stateCl = state === "selected" ? "ring-2 ring-primary/40" : state === "highlighted" ? "ring-1 ring-accent/30" : "";
  const hc = highContrast ? "hc:bg-message-high-contrast hc:text-foreground" : "";

  return (
    <div
      data-selected={state === "selected"}
      className={cn(base, roleCl, stateCl, hc, className)}
      {...props}
    >
      {children}
    </div>
  );
}