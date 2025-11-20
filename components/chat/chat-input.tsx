import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Square, Globe, WifiOff } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop: () => void;
  isLoading: boolean;
  webSearchEnabled?: boolean;
  onWebSearchToggle?: (enabled: boolean) => void;
}

export function ChatInput({ 
  onSend, 
  onStop, 
  isLoading,
  webSearchEnabled = true,
  onWebSearchToggle,
}: ChatInputProps) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    if (input.trim() && !isLoading) {
      onSend(input);
      setInput("");
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  return (
    <div className="p-4 border-t bg-background">
      <div className="relative flex items-end gap-2 max-w-4xl mx-auto w-full">
        <div className="flex-1 relative">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite sua mensagem..."
            className="min-h-[50px] max-h-[200px] resize-none py-3 pr-12"
            rows={1}
          />
          <div className="absolute right-2 bottom-2 flex items-center gap-2">
            {onWebSearchToggle && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant={webSearchEnabled ? "default" : "ghost"}
                      onClick={() => {
                        if (!webSearchEnabled) {
                          // Ao ativar, não precisa de confirmação
                          onWebSearchToggle(true);
                        } else {
                          // Ao desativar, mostrar aviso
                          const confirmed = window.confirm(
                            "Atenção: Desativar a pesquisa web pode reduzir a qualidade das respostas para fatos recentes, especialmente em modelos menores. Deseja continuar?"
                          );
                          if (confirmed) {
                            onWebSearchToggle(false);
                          }
                        }
                      }}
                      className="h-8 w-8"
                      disabled={isLoading}
                    >
                      {webSearchEnabled ? (
                        <Globe className="h-4 w-4" />
                      ) : (
                        <WifiOff className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      {webSearchEnabled
                        ? "Pesquisa web ativada"
                        : "Pesquisa web desativada"}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {isLoading ? (
              <Button size="icon" variant="destructive" onClick={onStop} className="h-8 w-8">
                <Square className="h-4 w-4 fill-current" />
              </Button>
            ) : (
              <Button 
                size="icon" 
                onClick={handleSend} 
                disabled={!input.trim()} 
                className="h-8 w-8"
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
      <div className="text-xs text-center text-muted-foreground mt-2">
        OllaHub pode cometer erros. Verifique informações importantes.
      </div>
    </div>
  );
}



