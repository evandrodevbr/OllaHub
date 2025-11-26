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
  const base = "group flex w-full gap-4 md:gap-6 relative transition-all duration-200";
  
  // User: Fundo sutil, alinhado à direita (se quiséssemos, mas o layout atual é lista). 
  // Vamos manter layout lista mas com estilo clean.
  // Perplexity usa: User message apenas texto bold/destacado, Assistant texto normal.
  
  const roleCl = role === "user"
    ? "bg-transparent text-foreground px-0 py-2" // Minimalista
    : "bg-transparent text-foreground/90 px-0 py-2";

  // Estado de seleção sutil
  const stateCl = state === "selected" ? "bg-muted/30 -mx-4 px-4 rounded-lg" : "";
  
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
