"use client";

import { useState, useEffect, useRef } from "react";
import { ModelDropdown } from "@/components/model/ModelDropdown";
import { ModelPullDialog } from "@/components/model/ModelPullDialog";
import { ChatMessage, ChatInput } from "@/components/chat/ChatMessage";
import { SystemPrompt } from "@/components/chat/SystemPrompt";
import type { ModelInfo } from "@/lib/models";
import type { Message } from "@/lib/chat";
import { createMessage } from "@/lib/chat";
import { useUserPrefs, buildOllamaOptions } from "@/hooks/useUserPrefs";

interface ChatContainerProps {
  models: ModelInfo[];
  offline: boolean;
}

export function ChatContainer({ models, offline }: ChatContainerProps) {
  const { prefs, ready } = useUserPrefs();
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const [showPullDialog, setShowPullDialog] = useState(false);
  const [modelToPull, setModelToPull] = useState<string>("");
  const [systemPrompt, setSystemPrompt] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent]);

  const handleSendMessage = async (content: string) => {
    if (!selectedModel || isStreaming) return;

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

  const handleStop = () => {
    if (abortRef.current && isStreaming) {
      abortRef.current.abort();
    }
  };

  const handleSelectModel = (modelId: string) => {
    const model = models.find((m) => m.id === modelId);
    if (model) {
      setSelectedModel(modelId);
      // Optional: clear chat when switching models
      // setMessages([]);
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
    <div className="flex h-full bg-[var(--background)]">
      {/* Sidebar */}
      <div className="w-80 border-r border-[var(--border)] bg-[var(--surface)] p-4 overflow-y-auto">
        <div className="mb-4">
          <h2 className="text-sm font-medium text-[var(--foreground)]/80 mb-2">
            Models
          </h2>
          <ModelDropdown
            models={models}
            selectedModel={selectedModel}
            onSelectModel={handleSelectModel}
            disabled={isStreaming}
          />
        </div>

        {offline && (
          <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
            <p className="text-sm text-orange-800">
              Ollama is offline. Using mock data.
            </p>
          </div>
        )}

        {selectedModelData && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
            <h3 className="font-medium text-sm mb-2">Selected Model</h3>
            <div className="space-y-1 text-xs text-[var(--foreground)]/80">
              <div>Name: {selectedModelData.name}</div>
              <div>Size: {selectedModelData.sizeGB} GB</div>
              <div>Quantization: {selectedModelData.quantization}</div>
              <div>Device: {selectedModelData.device}</div>
            </div>
          </div>
        )}

        <SystemPrompt onSystemPromptChange={setSystemPrompt} />
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Chat Header */}
        <div className="border-b border-[var(--border)] p-4 flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold">
            {selectedModelData
              ? `Chat with ${selectedModelData.name}`
              : "Select a model to start chatting"}
          </h1>
          <div className="flex items-center gap-2">
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
        <ChatInput
          onSendMessage={handleSendMessage}
          disabled={!selectedModel || isStreaming}
          placeholder={
            selectedModel ? "Type a message..." : "Select a model first..."
          }
        />
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
