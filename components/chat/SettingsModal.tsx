"use client";

import { useState } from "react";
import { Settings, X } from "lucide-react";

type SettingsModalProps = {
  systemPrompt: string;
  onSystemPromptChange: (prompt: string) => void;
  selectedModel: string | null;
  models: Array<{ id: string; name: string; device: string }>;
};

export function SettingsModal({
  systemPrompt,
  onSystemPromptChange,
  selectedModel,
  models,
}: SettingsModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [tempPrompt, setTempPrompt] = useState(systemPrompt);

  const selectedModelData = models.find((m) => m.id === selectedModel);

  const handleSave = () => {
    onSystemPromptChange(tempPrompt);
    setIsOpen(false);
  };

  const handleCancel = () => {
    setTempPrompt(systemPrompt);
    setIsOpen(false);
  };

  return (
    <>
      {/* Botão de Configurações */}
      <button
        onClick={() => setIsOpen(true)}
        className="p-2 rounded-lg hover:bg-[var(--surface)] transition-colors"
        aria-label="Configurações"
      >
        <Settings className="h-5 w-5" />
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--background)] rounded-lg border border-[var(--border)] w-full max-w-2xl mx-4 max-h-[80vh] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <h2 className="text-lg font-semibold">Configurações</h2>
              <button
                onClick={handleCancel}
                className="p-1 rounded hover:bg-[var(--surface)] transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-6 overflow-y-auto max-h-[60vh]">
              {/* Model Info */}
              {selectedModelData && (
                <div className="space-y-3">
                  <h3 className="font-medium">Modelo Selecionado</h3>
                  <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-[var(--foreground)]/60">Nome:</span>
                        <span>{selectedModelData.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--foreground)]/60">Dispositivo:</span>
                        <span className="capitalize">{selectedModelData.device}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* System Prompt */}
              <div className="space-y-3">
                <h3 className="font-medium">System Prompt</h3>
                <div className="space-y-2">
                  <label className="text-sm text-[var(--foreground)]/80">
                    Instruções para o modelo (opcional)
                  </label>
                  <textarea
                    value={tempPrompt}
                    onChange={(e) => setTempPrompt(e.target.value)}
                    placeholder="Ex: Você é um assistente útil e prestativo..."
                    className="w-full h-32 p-3 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  />
                  <p className="text-xs text-[var(--foreground)]/60">
                    Este prompt será usado como contexto para todas as mensagens desta conversa.
                  </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 p-4 border-t border-[var(--border)]">
              <button
                onClick={handleCancel}
                className="px-4 py-2 rounded-lg border border-[var(--border)] hover:bg-[var(--surface)] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white hover:opacity-90 transition-opacity"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
