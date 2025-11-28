import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Square, Globe, WifiOff, ChevronUp, AlertCircle, GraduationCap, Newspaper, Terminal, TrendingUp } from "lucide-react";
import { useState, useRef, useEffect, useMemo } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { quickValidate, validateQuery } from "@/lib/query-validation";
import { useSettingsStore, type SearchCategory } from "@/store/settings-store";

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
  const settings = useSettingsStore();
  
  // Validação em tempo real
  const validation = useMemo(() => {
    if (!input.trim()) {
      return { isValid: true, errors: [], warnings: [] };
    }
    const preprocessingConfig = settings.queryPreprocessing || {
      enabled: true,
      minLength: 3,
      maxLength: 2000,
      autoSplitQuestions: true,
      irrelevantPatterns: [],
    };
    
    if (!preprocessingConfig.enabled) {
      return { isValid: true, errors: [], warnings: [] };
    }
    
    return validateQuery(input, {
      minLength: preprocessingConfig.minLength,
      maxLength: preprocessingConfig.maxLength,
      irrelevantPatterns: preprocessingConfig.irrelevantPatterns.length > 0
        ? preprocessingConfig.irrelevantPatterns
        : undefined,
    });
  }, [input, settings.queryPreprocessing]);
  
  const isValid = validation.isValid;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    if (input.trim() && !isLoading && isValid) {
      onSend(input);
      setInput("");
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const scrollHeight = textareaRef.current.scrollHeight;
      // Limitar altura máxima a uns 200px
      textareaRef.current.style.height = `${Math.min(scrollHeight, 200)}px`;
    }
  }, [input]);

  return (
    <div className="w-full bg-transparent">
      <div className="relative w-full">
        <div className="flex-1 relative bg-background dark:bg-zinc-900/50 rounded-[2rem] border border-border/50 shadow-lg backdrop-blur-xl transition-all duration-200 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/40 hover:border-primary/30">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pergunte qualquer coisa..."
            className={`min-h-[52px] sm:min-h-[56px] max-h-[200px] w-full resize-none bg-transparent py-3 sm:py-4 pl-4 sm:pl-6 pr-28 sm:pr-32 text-[16px] sm:text-lg rounded-[2rem] border-0 focus-visible:ring-0 shadow-none placeholder:text-muted-foreground/50 ${
              input.trim() && !isValid ? 'text-destructive' : ''
            }`}
            rows={1}
          />
          
          {/* Right Actions */}
          <div className="absolute right-2 sm:right-3 bottom-2 sm:bottom-2.5 flex items-center gap-1 sm:gap-1.5">
            {onWebSearchToggle && (
              <TooltipProvider>
                <Tooltip delayDuration={300}>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant={webSearchEnabled ? "ghost" : "ghost"}
                      onClick={() => {
                        if (!webSearchEnabled) {
                          onWebSearchToggle(true);
                        } else {
                          setWebDialogOpen(true);
                        }
                      }}
                      className={`h-9 w-9 rounded-full transition-all ${
                        webSearchEnabled 
                          ? "text-primary bg-primary/10 hover:bg-primary/20" 
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
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
                  <Button size="icon" variant="ghost" className="h-9 w-9 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted" title="Gerenciar fontes">
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={12} className="w-56 rounded-xl">
                  <DropdownMenuLabel>Fontes de conhecimento</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {categories.map((cat) => {
                    // Mapeamento de ícones por categoria
                    const getCategoryIcon = (categoryId: string) => {
                      const iconMap: Record<string, React.ReactNode> = {
                        'academic': <GraduationCap className="w-4 h-4 text-muted-foreground shrink-0" />,
                        'news': <Newspaper className="w-4 h-4 text-muted-foreground shrink-0" />,
                        'tech': <Terminal className="w-4 h-4 text-muted-foreground shrink-0" />,
                        'finance': <TrendingUp className="w-4 h-4 text-muted-foreground shrink-0" />,
                      };
                      return iconMap[categoryId] || null;
                    };

                    return (
                      <DropdownMenuCheckboxItem
                        key={cat.id}
                        checked={cat.enabled}
                        onCheckedChange={(checked) => onToggleCategory(cat.id, !!checked)}
                        className="pl-8"
                      >
                        <div className="flex items-center gap-2.5">
                          {getCategoryIcon(cat.id)}
                          <span>{cat.name}</span>
                        </div>
                      </DropdownMenuCheckboxItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {isLoading ? (
              <Button 
                size="icon" 
                variant="destructive" 
                onClick={onStop} 
                className="h-9 w-9 rounded-full shadow-sm animate-in fade-in zoom-in duration-200"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </Button>
            ) : (
              <Button 
                size="icon" 
                onClick={handleSend} 
                disabled={!input.trim() || !isValid} 
                className={`h-9 w-9 rounded-full transition-all shadow-sm ${
                    input.trim() && isValid 
                    ? "bg-primary text-primary-foreground hover:bg-primary/90" 
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                }`}
              >
                <Send className="h-4 w-4 ml-0.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Validation Errors */}
        {input.trim() && !isValid && validation.errors.length > 0 && (
          <div className="absolute -top-12 left-0 right-0 mx-auto w-max max-w-[90%] animate-in fade-in slide-in-from-bottom-2">
             <div className="bg-destructive/90 text-destructive-foreground text-xs px-3 py-1.5 rounded-full shadow-lg flex items-center gap-2 backdrop-blur-sm">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>{validation.errors[0]}</span>
             </div>
          </div>
        )}
      </div>

      <Dialog open={webDialogOpen} onOpenChange={setWebDialogOpen}>
        <DialogContent className="sm:max-w-[425px] rounded-2xl">
          <DialogHeader>
            <DialogTitle>Desativar pesquisa web?</DialogTitle>
            <DialogDescription>
              Desativar a busca pode reduzir a qualidade em perguntas sobre fatos recentes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setWebDialogOpen(false)} className="rounded-full">Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => { onWebSearchToggle?.(false); setWebDialogOpen(false); }}
              className="rounded-full"
            >
              Desativar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
