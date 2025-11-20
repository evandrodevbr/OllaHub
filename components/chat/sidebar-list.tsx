import { SessionSummary } from "@/hooks/use-chat-storage";
import { Button } from "@/components/ui/button";
import { Trash2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarListProps {
  sessions: SessionSummary[];
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onNewChat: () => void;
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

export function SidebarList({ 
  sessions, 
  currentSessionId, 
  onSelectSession, 
  onDeleteSession,
  onNewChat 
}: SidebarListProps) {
  return (
    <div className="flex flex-col h-full border-r bg-muted/10">
      <div className="p-4 border-b">
        <Button onClick={onNewChat} className="w-full justify-start gap-2" variant="outline">
          <Plus className="w-4 h-4" />
          Nova Conversa
        </Button>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        <div className="p-2 space-y-2">
          {sessions.length === 0 && (
            <div className="text-center text-muted-foreground text-sm py-8">
              Nenhuma conversa salva
            </div>
          )}
          
          {sessions.map((session) => (
            <div
              key={session.id}
              className={cn(
                "group flex items-center justify-between p-2 rounded-lg cursor-pointer hover:bg-accent transition-colors",
                currentSessionId === session.id && "bg-accent"
              )}
              onClick={() => onSelectSession(session.id)}
            >
              <div className="flex items-start gap-3 overflow-hidden flex-1">
                <span className="text-lg shrink-0 mt-0.5" role="img" aria-label="emoji">
                  {session.emoji || '💬'}
                </span>
                <div className="flex flex-col overflow-hidden flex-1">
                  <span className="text-sm font-medium truncate" title={session.title}>
                    {session.title}
                  </span>
                  <span className="text-xs text-muted-foreground truncate">
                    {formatDate(session.updated_at)}
                  </span>
                </div>
              </div>
              
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteSession(session.id);
                }}
              >
                <Trash2 className="w-3 h-3 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

