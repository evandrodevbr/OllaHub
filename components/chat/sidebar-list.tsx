import { SessionSummary } from "@/hooks/use-chat-storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Trash2, Plus, MessageSquare, Search, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect, useRef } from "react";

interface SidebarListProps {
  sessions: SessionSummary[];
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onNewChat: () => void;
  onSearch?: (query: string) => void;
  isSearching?: boolean;
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInHours = diffInMs / (1000 * 60 * 60);
  const diffInDays = diffInMs / (1000 * 60 * 60 * 24);

  // Se foi hoje, mostrar apenas hora
  if (diffInHours < 24) {
    return new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  // Se foi ontem
  if (diffInDays < 2) {
    return 'Ontem';
  }

  // Se foi nos últimos 7 dias
  if (diffInDays < 7) {
    return new Intl.DateTimeFormat('pt-BR', {
      weekday: 'short'
    }).format(date);
  }

  // Caso contrário, mostrar data completa
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: diffInDays > 365 ? 'numeric' : undefined
  }).format(date);
}

export function SidebarList({ 
  sessions, 
  currentSessionId, 
  onSelectSession, 
  onDeleteSession,
  onNewChat,
  onSearch,
  isSearching = false
}: SidebarListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const DEBOUNCE_MS = 300;
  
  useEffect(() => {
    // Limpar timeout anterior
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    // Se query vazia, limpar busca imediatamente
    if (!searchQuery.trim()) {
      if (onSearch) {
        onSearch('');
      }
      return;
    }
    
    // Debounce: aguardar antes de buscar
    searchTimeoutRef.current = setTimeout(() => {
      if (onSearch && searchQuery.trim().length >= 2) {
        onSearch(searchQuery.trim());
      }
    }, DEBOUNCE_MS);
    
    // Cleanup
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, onSearch]);
  
  const handleClearSearch = () => {
    setSearchQuery('');
    if (onSearch) {
      onSearch('');
    }
  };
  
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col h-full border-r border-sidebar-border bg-sidebar min-w-[240px] max-w-[360px] w-full">
        {/* Header com busca e botão Nova Conversa */}
        <div className="p-3 sm:p-4 border-b border-sidebar-border flex-shrink-0 space-y-2">
          {/* Campo de busca */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Buscar conversas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-8 h-9 text-sm"
            />
            {isSearching && (
              <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
            )}
            {searchQuery && !isSearching && (
              <button
                onClick={handleClearSearch}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Limpar busca"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          
          {/* Botão Nova Conversa */}
          <Button 
            onClick={onNewChat} 
            className="w-full justify-start gap-2 text-sm font-medium h-9 sm:h-10" 
            variant="outline"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span className="truncate">Nova Conversa</span>
          </Button>
        </div>
        
        {/* Lista de chats com scroll customizado */}
        <div className="flex-1 overflow-y-auto min-h-0 sidebar-chat-list">
          <div className="p-3 sm:p-4 space-y-2 sm:space-y-2.5">
            {sessions.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <MessageSquare className="w-10 h-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">
                  {searchQuery ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa salva'}
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  {searchQuery 
                    ? 'Tente buscar por outro termo'
                    : 'Comece uma nova conversa para começar'}
                </p>
              </div>
            )}
            
            {sessions.map((session) => {
              const isSelected = currentSessionId === session.id;
              const showTooltip = session.title.length > 30;
              
              return (
                <Tooltip key={session.id} delayDuration={300} disableHoverableContent>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        "group relative bg-card border rounded-lg cursor-pointer transition-all duration-200",
                        "hover:shadow-md hover:border-primary/20 hover:-translate-y-0.5",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        isSelected && "border-primary/40 shadow-sm bg-accent/50",
                        "active:scale-[0.98]"
                      )}
                      onClick={() => onSelectSession(session.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelectSession(session.id);
                        }
                      }}
                    >
                      {/* Conteúdo do card */}
                      <div className="p-3 sm:p-3.5 flex items-start gap-3 overflow-hidden">
                        {/* Ícone/Emoji */}
                        <div className="shrink-0 flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-md bg-muted/50 text-base sm:text-lg">
                          {session.emoji || '💬'}
                        </div>
                        
                        {/* Texto do card */}
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <h3 
                            className="text-sm sm:text-base font-medium text-card-foreground truncate leading-tight mb-1"
                          >
                            {session.title}
                          </h3>
                          
                          <p className="text-xs text-muted-foreground">
                            {formatDate(session.updated_at)}
                          </p>
                        </div>
                        
                        {/* Botão de deletar - aparece no hover */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            "h-7 w-7 sm:h-8 sm:w-8 shrink-0 transition-all duration-200",
                            "opacity-0 group-hover:opacity-100",
                            "hover:bg-destructive/10 hover:text-destructive",
                            "active:scale-95"
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            onDeleteSession(session.id);
                          }}
                          aria-label={`Deletar conversa "${session.title}"`}
                        >
                          <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </Button>
                      </div>
                      
                      {/* Indicador de seleção */}
                      {isSelected && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-l-lg" />
                      )}
                    </div>
                  </TooltipTrigger>
                  {showTooltip && (
                    <TooltipContent side="right" className="max-w-xs">
                      <p className="break-words font-medium">{session.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDate(session.updated_at)}
                      </p>
                    </TooltipContent>
                  )}
                </Tooltip>
              );
            })}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

