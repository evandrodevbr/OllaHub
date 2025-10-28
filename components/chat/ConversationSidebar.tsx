"use client";

import { useState, useEffect } from "react";
import { MessageSquare, Plus, Trash2 } from "lucide-react";

type Conversation = {
  id: string;
  title: string;
  model: string;
  updated_at: number;
};

type ConversationSidebarProps = {
  currentConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  refreshTrigger?: number; // Para forçar atualização
};

export function ConversationSidebar({
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  refreshTrigger,
}: ConversationSidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConversations();
  }, []);

  // Recarregar conversas quando refreshTrigger mudar
  useEffect(() => {
    if (refreshTrigger !== undefined) {
      loadConversations();
    }
  }, [refreshTrigger]);

  const loadConversations = async () => {
    try {
      const response = await fetch("/api/conversations");
      const data = await response.json();
      setConversations(data);
    } catch (error) {
      console.error("Erro ao carregar conversas:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!confirm("Deletar esta conversa?")) return;

    try {
      await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      setConversations((prev) => prev.filter((c) => c.id !== id));

      if (currentConversationId === id) {
        onNewConversation();
      }
    } catch (error) {
      console.error("Erro ao deletar conversa:", error);
    }
  };

  return (
    <div className="w-64 h-full bg-[var(--surface)] border-r border-[var(--border)] flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-[var(--border)]">
        <button
          onClick={onNewConversation}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[var(--accent)] text-white rounded-lg hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          Nova Conversa
        </button>
      </div>

      {/* Lista de Conversas */}
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="text-center p-4 text-sm text-[var(--foreground)]/60">
            Carregando...
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center p-4 text-sm text-[var(--foreground)]/60">
            Nenhuma conversa ainda
          </div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => onSelectConversation(conv.id)}
              className={`w-full flex items-center gap-2 p-3 rounded-lg mb-1 text-left transition-colors group cursor-pointer ${
                currentConversationId === conv.id
                  ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                  : "hover:bg-[var(--background)]"
              }`}
            >
              <MessageSquare className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1 text-sm truncate">{conv.title}</span>
              <button
                onClick={(e) => handleDelete(conv.id, e)}
                className="p-1 hover:bg-[var(--background)] rounded opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
