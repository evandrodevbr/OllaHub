"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ModelDropdown } from "@/components/model/ModelDropdown";
import { ModelPullDialog } from "@/components/model/ModelPullDialog";
import { ChatMessage } from "@/components/chat/ChatMessage";
// Settings are controlled globally in header
import { MCPSelector, ActiveMCPBadges } from "@/components/chat/MCPSelector";
import { MCPManualInstallModal } from "@/components/mcp/MCPManualInstallModal";
import { Send, Square } from "lucide-react";
import type { ModelInfo } from "@/lib/models";
import type { Message } from "@/lib/chat";
import { createMessage } from "@/lib/chat";
import { useUserPrefs, buildOllamaOptions } from "@/hooks/useUserPrefs";

interface ChatContainerProps {
  models: ModelInfo[];
  offline: boolean;
  onConversationCreated?: () => void;
  currentConversationId?: string | null;
}

export function ChatContainer({
  models,
  offline,
  onConversationCreated,
  currentConversationId: propCurrentConversationId,
}: ChatContainerProps) {
  const { prefs, ready, update } = useUserPrefs();
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [inputContent, setInputContent] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const [showPullDialog, setShowPullDialog] = useState(false);
  const [modelToPull, setModelToPull] = useState<string>("");
  const [systemPrompt, setSystemPrompt] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [showManualInstall, setShowManualInstall] = useState(false);
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [highlightedCmd, setHighlightedCmd] = useState(0);

  // Estado para MCPs ativos
  const [activeMcps, setActiveMcps] = useState<string[]>([]);
  const [mcpNames, setMcpNames] = useState<Map<string, string>>(new Map());

  // Carregar modelo salvo ao iniciar
  useEffect(() => {
    if (ready && prefs.selectedModel && !selectedModel) {
      setSelectedModel(prefs.selectedModel);
      // Warmup do modelo em background
      fetch(`/api/ollama/warmup?model=${encodeURIComponent(prefs.selectedModel)}`).catch(() => {});
    }
  }, [ready, prefs.selectedModel]);

  // Carregar mensagens quando uma conversa é selecionada
  useEffect(() => {
    if (propCurrentConversationId) {
      loadConversation(propCurrentConversationId);
    } else {
      // Limpar mensagens quando nenhuma conversa está selecionada
      setMessages([]);
      setConversationId(null);
    }
  }, [propCurrentConversationId]);

  // Salvar modelo quando selecionado
  const handleModelChange = (modelName: string) => {
    setSelectedModel(modelName);
    update({ selectedModel: modelName }); // Salvar no Redis
    // Disparar warmup em background
    fetch(`/api/ollama/warmup?model=${encodeURIComponent(modelName)}`).catch(() => {});
  };

  // Carregar MCPs ativos do localStorage
  useEffect(() => {
    const saved = localStorage.getItem("ollahub-active-mcps");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setActiveMcps(parsed.mcps || []);
        setMcpNames(new Map(parsed.names || []));
      } catch (e) {
        console.error("Error loading active MCPs:", e);
      }
    }
  }, []);

  // Salvar MCPs ativos no localStorage quando mudarem
  useEffect(() => {
    if (activeMcps.length > 0 || mcpNames.size > 0) {
      localStorage.setItem(
        "ollahub-active-mcps",
        JSON.stringify({
          mcps: activeMcps,
          names: Array.from(mcpNames.entries()),
        })
      );
    }
  }, [activeMcps, mcpNames]);

  // Handlers para MCP Selector
  const handleToggleMCP = useCallback(
    async (mcpId: string) => {
      setActiveMcps((prev) => {
        if (prev.includes(mcpId)) {
          return prev.filter((id) => id !== mcpId);
        } else {
          // Buscar nome do MCP se ainda não temos
          if (!mcpNames.has(mcpId)) {
            fetch("/api/mcp/available-for-chat")
              .then((res) => res.json())
              .then((data) => {
                if (data.success) {
                  const mcp = data.mcps.find((m: any) => m.mcpId === mcpId);
                  if (mcp) {
                    setMcpNames((prev) => new Map(prev).set(mcpId, mcp.name));
                  }
                }
              })
              .catch(console.error);
          }
          return [...prev, mcpId];
        }
      });
    },
    [mcpNames]
  );

  const handleClearAllMCPs = useCallback(() => {
    setActiveMcps([]);
  }, []);

  const handleRemoveMCP = useCallback((mcpId: string) => {
    setActiveMcps((prev) => prev.filter((id) => id !== mcpId));
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent]);

  // Auto-expansão do textarea conforme o usuário digita
  useEffect(() => {
    if (inputRef.current) {
      const el = inputRef.current;
      el.style.height = "auto";
      const maxPx = 160; // ~10rem
      el.style.height = `${Math.min(el.scrollHeight, maxPx)}px`;
    }
  }, [inputContent]);

  const loadConversation = async (id: string) => {
    try {
      const response = await fetch(`/api/conversations/${id}`);
      const data = await response.json();

      if (data.conversation && data.messages) {
        setConversationId(id);
        setMessages(data.messages);
        setSelectedModel(data.conversation.model);
      }
    } catch (error) {
      console.error("Erro ao carregar conversa:", error);
    }
  };

  const startNewConversation = () => {
    setConversationId(null);
    setMessages([]);
  };

  const handleSendMessage = async (content: string) => {
    if (!selectedModel || isStreaming) return;

    // Criar nova conversa se não existir (COM TÍTULO)
    let currentConversationId = conversationId;
    if (!currentConversationId) {
      try {
        const response = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: selectedModel,
            firstMessage: content, // Passar primeira mensagem
          }),
        });
        const { id, title } = await response.json();
        currentConversationId = id;
        setConversationId(id);
        console.log("✨ Chat criado:", title);

        // Notificar sidebar para atualizar lista de conversas
        if (onConversationCreated) {
          onConversationCreated();
        }
      } catch (error) {
        console.error("Erro ao criar conversa:", error);
      }
    }

    const userMessage = createMessage("user", content);
    const newMessages = [...messages, userMessage];

    // Add system prompt if it exists and this is the first user message
    const messagesToSend =
      systemPrompt && messages.length === 0
        ? [createMessage("system", systemPrompt), ...newMessages]
        : newMessages;

    setMessages(newMessages);
    setIsStreaming(true);
    setStreamingContent("");

    // Persistir mensagem do usuário
    if (currentConversationId) {
      try {
        await fetch(`/api/conversations/${currentConversationId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "user", content }),
        });
      } catch (error) {
        console.error("Erro ao persistir mensagem:", error);
      }
    }

    try {
      const options = buildOllamaOptions(
        prefs.device,
        prefs.numGpu,
        prefs.gpuIndex
      );
      abortRef.current = new AbortController();
      const response = await fetch("/api/ollama/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: selectedModel,
          messages: messagesToSend,
          options,
          system: systemPrompt || undefined,
          activeMcps: activeMcps.length > 0 ? activeMcps : undefined,
        }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let assistantContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const data = JSON.parse(line);

            // Tool execution indicator
            if (data.toolExecution) {
              console.log(
                `🔧 MCP Tool executed: ${data.toolExecution.mcpId}.${data.toolExecution.toolName}`
              );
              // Opcional: Mostrar indicador visual
            }

            // Clear previous response (para prompt engineering)
            if (data.clearPrevious) {
              assistantContent = "";
              setStreamingContent("");
            }

            if (data.token) {
              assistantContent += data.token;
              setStreamingContent(assistantContent);
            }
            if (data.done) {
              const assistantMessage = createMessage(
                "assistant",
                assistantContent
              );
              setMessages((prev) => [...prev, assistantMessage]);
              setStreamingContent("");

              // Persistir mensagem do assistente
              if (currentConversationId) {
                try {
                  await fetch(
                    `/api/conversations/${currentConversationId}/messages`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        role: "assistant",
                        content: assistantContent,
                      }),
                    }
                  );
                } catch (error) {
                  console.error(
                    "Erro ao persistir mensagem do assistente:",
                    error
                  );
                }
              }
            }
            if (data.error) {
              throw new Error(data.error);
            }
          } catch (e) {
            console.error("Error parsing stream:", e);
          }
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      const errorMessage = createMessage(
        "assistant",
        "Sorry, I encountered an error. Please try again."
      );
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsStreaming(false);
      setStreamingContent("");
      abortRef.current = null;
    }
  };

  // Parse de comando no submit
  const tryHandleSlashCommand = (text: string): boolean => {
    if (!text.startsWith("/")) return false;
    const [cmd, ...rest] = text.trim().split(/\s+/);
    if (cmd === "/clear") {
      startNewConversation();
      setInputContent("");
      return true;
    }
    if (cmd === "/model") {
      const newModel = rest.join(" ");
      if (newModel) {
        handleSelectModel(newModel);
        setInputContent("");
      }
      return true;
    }
    return false;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputContent.trim() && !isStreaming) {
      if (tryHandleSlashCommand(inputContent.trim())) return;
      handleSendMessage(inputContent.trim());
      setInputContent("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showCommandMenu) {
      const commands = filteredCommands;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedCmd((h) => (commands.length ? (h + 1) % commands.length : 0));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedCmd((h) => (commands.length ? (h - 1 + commands.length) % commands.length : 0));
        return;
      }
      if (e.key === "Escape") {
        setShowCommandMenu(false);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const cmd = commands[highlightedCmd] || commands[0];
        if (cmd) executeCommand(cmd);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleStop = () => {
    if (abortRef.current && isStreaming) {
      abortRef.current.abort();
    }
  };

  const handleSystemPromptChange = (prompt: string) => {
    setSystemPrompt(prompt);
    update({ systemPrompt: prompt }); // Salvar no SQLite
  };

  // Regenerar última resposta do assistente
  const handleRegenerate = async () => {
    if (isStreaming || messages.length === 0 || !selectedModel) return;
    const lastUserIndex = [...messages].map((m) => m.role).lastIndexOf("user");
    if (lastUserIndex === -1) return;
    const baseMessages = messages.slice(0, lastUserIndex + 1);
    setMessages(baseMessages);
    setIsStreaming(true);
    setStreamingContent("");
    try {
      const options = buildOllamaOptions(
        prefs.device,
        prefs.numGpu,
        prefs.gpuIndex
      );
      abortRef.current = new AbortController();
      const response = await fetch("/api/ollama/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: selectedModel,
          messages: baseMessages,
          options,
          system: systemPrompt || undefined,
          activeMcps: activeMcps.length > 0 ? activeMcps : undefined,
        }),
        signal: abortRef.current.signal,
      });
      if (!response.ok) throw new Error("Failed to regenerate");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantContent = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.clearPrevious) {
              assistantContent = "";
              setStreamingContent("");
            }
            if (data.token) {
              assistantContent += data.token;
              setStreamingContent(assistantContent);
            }
            if (data.done) {
              const assistantMessage = createMessage("assistant", assistantContent);
              setMessages((prev) => [...prev, assistantMessage]);
              setStreamingContent("");
              if (conversationId) {
                try {
                  await fetch(`/api/conversations/${conversationId}/messages`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ role: "assistant", content: assistantContent }),
                  });
                } catch {}
              }
            }
            if (data.error) throw new Error(data.error);
          } catch (e) {
            console.error("Error parsing stream:", e);
          }
        }
      }
    } catch (error) {
      console.error("Regenerate error:", error);
    } finally {
      setIsStreaming(false);
      setStreamingContent("");
      abortRef.current = null;
    }
  };

  // Comandos do chat
  type ChatCommand = { id: string; label: string; hint?: string };
  const availableCommands: ChatCommand[] = [
    { id: "clear", label: "/clear", hint: "Limpar o histórico atual" },
    { id: "model", label: "/model <id>", hint: "Trocar de modelo ativo" },
  ];
  const filteredCommands = availableCommands.filter((c) =>
    c.label.toLowerCase().includes(commandQuery.toLowerCase())
  );
  const executeCommand = (cmd: ChatCommand) => {
    if (cmd.id === "clear") {
      startNewConversation();
      setInputContent("");
      setShowCommandMenu(false);
      return;
    }
    if (cmd.id === "model") {
      setInputContent("/model ");
      setTimeout(() => inputRef.current?.focus(), 0);
      return;
    }
  };

  const handleSelectModel = (modelId: string) => {
    const model = models.find((m) => m.id === modelId);
    if (model) {
      handleModelChange(modelId);
      // Optional: clear chat when switching models
      // setMessages([]);
    }
  };

  const handleDeleteModel = async (modelId: string) => {
    try {
      const response = await fetch("/api/ollama/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelName: modelId }),
      });

      if (!response.ok) {
        throw new Error("Failed to delete model");
      }

      // Atualizar lista de modelos após exclusão
      // Aqui você pode recarregar a lista ou remover o modelo da lista local
      console.log(`Model ${modelId} deleted successfully`);
    } catch (error) {
      console.error("Error deleting model:", error);
    }
  };

  const handlePullModel = async (modelName: string) => {
    try {
      const response = await fetch("/api/ollama/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelName }),
      });

      if (!response.ok) {
        throw new Error("Failed to pull model");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const data = JSON.parse(line);
            if (data.status === "success") {
              // Model pulled successfully, refresh models list
              window.location.reload();
            } else if (data.error) {
              // Mostrar erro amigável quando backend identifica problema com tag/manifest
              const hint = data.hint ? `\nHint: ${data.hint}` : "";
              const url = data.url ? `\nPágina do modelo: ${data.url}` : "";
              alert(`Falha ao baixar o modelo: ${data.detail || data.error}${hint}${url}`);
            }
          } catch (e) {
            console.error("Error parsing pull stream:", e);
          }
        }
      }
    } catch (error) {
      throw error;
    }
  };

  // Abrir diálogo de instalação (seleção/edição de tag)
  const openPullDialog = (name: string) => {
    setModelToPull(name);
    setShowPullDialog(true);
  };

  const selectedModelData = models.find((m) => m.id === selectedModel);

  return (
    <div className="flex-1 flex flex-col bg-[var(--background)] min-h-0">
      {/* Chat Header */}
      <div className="border-b border-[var(--border)] p-4 flex items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">
            {selectedModelData ? "Chat with" : "Select a model to start chatting"}
          </h1>
          <ModelDropdown
            models={models}
            selectedModel={selectedModel}
            onSelectModel={handleSelectModel}
            onDeleteModel={handleDeleteModel}
            onPullModel={openPullDialog}
            disabled={isStreaming}
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRegenerate}
            disabled={isStreaming || messages.length === 0}
            className="rounded-md border border-[var(--border)] px-3 py-1 text-sm hover:bg-[var(--surface)] disabled:opacity-50"
          >
            Regenerar
          </button>
          <button
            onClick={handleStop}
            disabled={!isStreaming}
            className="rounded-md border border-[var(--border)] px-3 py-1 text-sm hover:bg-[var(--surface)] disabled:opacity-50"
          >
            Stop
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className={`mx-auto w-full ${
          (prefs.chatLayout ?? "compact") === "edge" ? "max-w-full px-2" : "max-w-3xl px-4"
        }`}>
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center py-16">
              <div className="text-center text-[var(--foreground)]/70">
                <p className="text-xl font-medium mb-1">Bem-vindo ao Ollahub</p>
                <p className="text-sm">Selecione um modelo e comece a conversar.</p>
              </div>
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <ChatMessage key={message.id} message={message} bubbleSize={prefs.bubbleSize ?? "md"} />
              ))}
              {isStreaming && streamingContent && (
                <ChatMessage
                  message={createMessage("assistant", streamingContent)}
                  isStreaming={true}
                  bubbleSize={prefs.bubbleSize ?? "md"}
                />
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-[var(--border)] sticky bottom-0 z-10 bg-[color-mix(in_oklab,var(--background),black_2%)]/80 backdrop-blur supports-[backdrop-filter]:bg-[color-mix(in_oklab,var(--background),black_2%)]/60">
        <form onSubmit={handleSubmit} className="p-4">
          <div className="mx-auto w-full max-w-3xl">
            {/* Active MCP Badges */}
            <ActiveMCPBadges
              activeMcps={activeMcps}
              mcpNames={mcpNames}
              onRemove={handleRemoveMCP}
            />

            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/60 shadow-sm transition-all focus-within:ring-2 focus-within:ring-[var(--accent)] relative">
              <div className="flex gap-2 p-2">
                {/* MCP Selector */}
                <MCPSelector
                  activeMcps={activeMcps}
                  onToggleMCP={handleToggleMCP}
                  onClearAll={handleClearAllMCPs}
                onOpenInstallModal={() => setShowManualInstall(true)}
                />

                <textarea
                  ref={inputRef}
                  value={inputContent}
                  onChange={(e) => {
                    const val = e.target.value;
                    setInputContent(val);
                    if (val.startsWith("/")) {
                      setShowCommandMenu(true);
                      const q = val.slice(1).trim();
                      setCommandQuery(q);
                      setHighlightedCmd(0);
                    } else {
                      setShowCommandMenu(false);
                    }
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    selectedModel ? "Digite uma mensagem..." : "Selecione um modelo primeiro..."
                  }
                  disabled={!selectedModel || isStreaming}
                  className="flex-1 resize-none rounded-lg border-none bg-transparent px-3 py-3 text-sm focus:outline-none disabled:opacity-50 max-h-40 overflow-y-auto"
                  rows={1}
                  
                />
                <button
                  type={isStreaming ? "button" : "submit"}
                  onClick={isStreaming ? handleStop : undefined}
                  disabled={
                    isStreaming ? false : !inputContent.trim() || !selectedModel
                  }
                  className="flex h-10 w-10 my-auto items-center justify-center rounded-lg bg-[var(--accent)] text-white transition-colors hover:bg-[color-mix(in_oklab,var(--accent),black_10%)] disabled:opacity-50"
                >
                  {isStreaming ? (
                    <Square className="h-4 w-4" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>
              <div className="flex items-center gap-2 px-3 pb-2 pt-0 text-xs text-[var(--foreground)]/60">
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(inputContent).catch(() => {})}
                  className="px-2 py-1 rounded hover:bg-[var(--surface)]"
                >
                  Copiar
                </button>
                <button
                  type="button"
                  onClick={() => setInputContent("")}
                  className="px-2 py-1 rounded hover:bg-[var(--surface)]"
                >
                  Limpar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInputContent("/");
                    setShowCommandMenu(true);
                    setCommandQuery("");
                    setHighlightedCmd(0);
                    setTimeout(() => inputRef.current?.focus(), 0);
                  }}
                  className="px-2 py-1 rounded hover:bg-[var(--surface)]"
                >
                  Comandos
                </button>
                <span className="ml-auto">{selectedModel ? "" : "Selecione um modelo para começar"}</span>
              </div>

              {showCommandMenu && filteredCommands.length > 0 && (
                <div className="absolute left-2 right-2 bottom-14 rounded-md border border-[var(--border)] bg-[var(--background)] shadow-md overflow-hidden">
                  {filteredCommands.map((cmd, idx) => (
                    <button
                      key={cmd.id + idx}
                      type="button"
                      onClick={() => executeCommand(cmd)}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--surface)] ${
                        idx === highlightedCmd ? "bg-[var(--surface)]" : ""
                      }`}
                    >
                      <div className="font-medium">{cmd.label}</div>
                      {cmd.hint && (
                        <div className="text-[10px] opacity-70">{cmd.hint}</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </form>
      </div>

      {/* Pull Dialog */}
      <ModelPullDialog
        isOpen={showPullDialog}
        onClose={() => setShowPullDialog(false)}
        modelName={modelToPull}
        onConfirmPull={handlePullModel}
      />
      <MCPManualInstallModal
        isOpen={showManualInstall}
        onClose={() => setShowManualInstall(false)}
        onSuccess={() => {
          // Fechar e opcionalmente poderíamos sinalizar o MCPSelector a recarregar.
          setShowManualInstall(false);
        }}
      />
    </div>
  );
}
