"use client";

import { useState, useEffect, useRef } from "react";
import { ModelDropdown } from "@/components/model/ModelDropdown";
import { ModelPullDialog } from "@/components/model/ModelPullDialog";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { SettingsModal } from "@/components/chat/SettingsModal";
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

  // Carregar modelo salvo ao iniciar
  useEffect(() => {
    if (ready && prefs.selectedModel && !selectedModel) {
      setSelectedModel(prefs.selectedModel);
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
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent]);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputContent.trim() && !isStreaming) {
      handleSendMessage(inputContent.trim());
      setInputContent("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
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

  const selectedModelData = models.find((m) => m.id === selectedModel);

  return (
    <div className="flex-1 flex flex-col bg-[var(--background)] min-h-0">
      {/* Chat Header */}
      <div className="border-b border-[var(--border)] p-4 flex items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">
            {selectedModelData
              ? "Chat with"
              : "Select a model to start chatting"}
          </h1>
          {selectedModelData && (
            <ModelDropdown
              models={models}
              selectedModel={selectedModel}
              onSelectModel={handleSelectModel}
              onDeleteModel={handleDeleteModel}
              onPullModel={handlePullModel}
              disabled={isStreaming}
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          <SettingsModal
            systemPrompt={systemPrompt}
            onSystemPromptChange={handleSystemPromptChange}
            selectedModel={selectedModel}
            models={models}
          />
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
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center text-[var(--foreground)]/60">
              <p className="text-lg mb-2">Welcome to Ollahub</p>
              <p className="text-sm">Select a model and start chatting!</p>
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
            {isStreaming && streamingContent && (
              <ChatMessage
                message={createMessage("assistant", streamingContent)}
                isStreaming={true}
              />
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-[var(--border)] bg-[var(--background)]">
        <form onSubmit={handleSubmit} className="p-4">
          <div className="flex gap-2">
            <textarea
              value={inputContent}
              onChange={(e) => setInputContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                selectedModel ? "Type a message..." : "Select a model first..."
              }
              disabled={!selectedModel || isStreaming}
              className="flex-1 resize-none rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-50"
              rows={1}
              maxLength={2000}
            />
            <button
              type={isStreaming ? "button" : "submit"}
              onClick={isStreaming ? handleStop : undefined}
              disabled={
                isStreaming ? false : !inputContent.trim() || !selectedModel
              }
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent)] text-white transition-colors hover:bg-[color-mix(in_oklab,var(--accent),black_10%)] disabled:opacity-50"
            >
              {isStreaming ? (
                <Square className="h-4 w-4" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
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
    </div>
  );
}
