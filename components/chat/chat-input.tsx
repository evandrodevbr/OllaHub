import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Square, Globe, WifiOff, ChevronUp } from "lucide-react";
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
  categories?: SearchCategory[];
  onToggleCategory?: (id: string, enabled: boolean) => void;
}

export function ChatInput({ 
  onSend, 
  onStop, 
  isLoading,
  webSearchEnabled = true,
  onWebSearchToggle,
  categories = [],
  onToggleCategory,
}: ChatInputProps) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [webDialogOpen, setWebDialogOpen] = useState(false);

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
    <div className="p-6 bg-transparent">
      <div className="relative max-w-3xl mx-auto w-full">
        <div className="flex-1 relative">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite sua mensagem..."
            className="min-h-[48px] resize-none overflow-hidden py-4 pr-12 rounded-xl border shadow-lg"
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
                          onWebSearchToggle(true);
                        } else {
                          setWebDialogOpen(true);
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
            {onToggleCategory && categories && categories.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="outline" className="h-8 w-8" title="Gerenciar fontes">
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={6}>
                  <DropdownMenuLabel>Fontes de conhecimento</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {categories.map((cat) => (
                    <DropdownMenuCheckboxItem
                      key={cat.id}
                      checked={cat.enabled}
                      onCheckedChange={(checked) => onToggleCategory(cat.id, !!checked)}
                    >
                      {cat.name}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
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
      <Dialog open={webDialogOpen} onOpenChange={setWebDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desativar pesquisa web?</DialogTitle>
            <DialogDescription>
              Desativar a busca pode reduzir a qualidade em perguntas sobre fatos recentes, preços, notícias e conteúdo em rápida mudança. 
              Use com cautela — modelos locais sem contexto web tendem a alucinar mais nesses cenários.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWebDialogOpen(false)}>Manter ativado</Button>
            <Button
              variant="destructive"
              onClick={() => { onWebSearchToggle?.(false); setWebDialogOpen(false); }}
            >
              Desativar pesquisa web
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="text-xs text-center text-muted-foreground mt-2">
        OllaHub pode cometer erros. Verifique informações importantes.
      </div>
    </div>
  );
}


import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SearchCategory } from "@/store/settings-store";



