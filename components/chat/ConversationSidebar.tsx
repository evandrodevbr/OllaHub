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
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");

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

  const filteredConversations = conversations.filter((c) =>
    c.title.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="w-64 lg:w-72 h-full bg-[var(--surface)] border-r border-[var(--border)] flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-[var(--border)] sticky top-0 z-10 bg-[color-mix(in_oklab,var(--surface),black_2%)]/90 backdrop-blur supports-[backdrop-filter]:bg-[color-mix(in_oklab,var(--surface),black_2%)]/70">
        <button
          onClick={async () => {
            if (creating) return;
            setCreating(true);
            try {
              // Buscar modelo selecionado nas preferências
              const prefsRes = await fetch("/api/preferences");
              const prefs = await prefsRes.json();
              const model = prefs?.selectedModel;
              if (!model) {
                alert("Selecione um modelo antes de criar uma conversa.");
                return;
              }

              // Criar conversa vazia (título padrão gerado no backend)
              const res = await fetch("/api/conversations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ model }),
              });
              if (!res.ok) throw new Error("Falha ao criar conversa");
              const { id, title } = await res.json();

              // Inserir no topo da lista e selecionar
              const newConv: Conversation = {
                id,
                title,
                model,
                updated_at: Date.now(),
              };
              setConversations((prev) => [newConv, ...prev]);
              onSelectConversation(id);

              // Notificar container para possíveis efeitos colaterais
              onNewConversation();
            } catch (e) {
              console.error(e);
              alert("Não foi possível criar a conversa.");
            } finally {
              setCreating(false);
            }
          }}
          disabled={creating}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[var(--accent)] text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          <Plus className="h-4 w-4" />
          {creating ? "Criando..." : "Nova Conversa"}
        </button>
        <div className="mt-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar conversa..."
            className="w-full px-3 py-2 text-sm rounded-md bg-[var(--background)] border border-[var(--border)] outline-none focus:border-[var(--accent)] transition-colors"
          />
        </div>
      </div>

      {/* Lista de Conversas */}
      <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
        {loading ? (
          <div className="text-center p-4 text-sm text-[var(--foreground)]/60">
            Carregando...
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center p-4 text-sm text-[var(--foreground)]/60">
            Nenhuma conversa ainda
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="text-center p-4 text-sm text-[var(--foreground)]/60">
            Nenhum resultado para "{query}"
          </div>
        ) : (
          filteredConversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => onSelectConversation(conv.id)}
              className={`w-full flex items-center gap-2 p-3 rounded-lg mb-1 text-left transition-colors group cursor-pointer ${
                currentConversationId === conv.id
                  ? "bg-[var(--accent)]/12 text-[var(--accent)] ring-1 ring-[var(--accent)]/30"
                  : "hover:bg-[color-mix(in_oklab,var(--surface),black_6%)]"
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
