"use client";

import { useState, useEffect } from "react";
import { X, Download, Loader2 } from "lucide-react";

interface ModelPullDialogProps {
  isOpen: boolean;
  onClose: () => void;
  modelName: string;
  onConfirmPull: (modelName: string) => Promise<void>;
}

interface PullProgress {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
  error?: string;
}

export function ModelPullDialog({
  isOpen,
  onClose,
  modelName,
  onConfirmPull,
}: ModelPullDialogProps) {
  const [isPulling, setIsPulling] = useState(false);
  const [progress, setProgress] = useState<PullProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [editableName, setEditableName] = useState<string>(modelName);
  const [tags, setTags] = useState<string[]>([]);
  const [isLoadingTags, setIsLoadingTags] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) {
      setIsPulling(false);
      setProgress(null);
      setError(null);
      setIsSuccess(false);
      setEditableName(modelName);
      setTags([]);
      setIsLoadingTags(false);
      return;
    }

    // Ao abrir, tentar buscar tags conhecidas
    const base = String(modelName).split(":")[0];
    setEditableName(modelName);
    if (!base) {
      setTags([]);
      setIsLoadingTags(false);
      return;
    }
    setIsLoadingTags(true);
    fetch(`/api/ollama/tags?name=${encodeURIComponent(base)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data?.success && Array.isArray(data.tags)) {
          setTags(data.tags);
        } else {
          setTags([]);
        }
      })
      .catch(() => setTags([]))
      .finally(() => setIsLoadingTags(false));
  }, [isOpen, modelName]);

  const handleConfirm = async () => {
    setIsPulling(true);
    setError(null);
    setProgress(null);

    try {
      const response = await fetch("/api/ollama/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: editableName.trim() }),
      });

      if (!response.ok) {
        throw new Error("Falha ao iniciar download do modelo");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Resposta inválida do servidor");

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
            
            // Processar diferentes estados de progresso
            if (data.status === "downloading" || data.status === "pulling") {
              setProgress({
                status: data.status,
                total: data.total,
                completed: data.completed,
                digest: data.digest,
              });
            } else if (data.status === "success") {
              setProgress((prev) => ({ 
                status: "success", 
                total: prev?.total, 
                completed: prev?.total 
              }));
              setIsSuccess(true);
            } else if (data.error) {
              setError(data.detail || data.error);
            } else if (data.total || data.completed) {
              // Caso o status não seja "downloading" mas tenha dados de progresso
              setProgress({
                status: data.status || "downloading",
                total: data.total,
                completed: data.completed,
                digest: data.digest,
              });
            }
          } catch (e) {
            // ignorar linhas inválidas
          }
        }
      }

      // Não fechar automaticamente; permitir usuário fechar ao concluir
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to pull model");
    } finally {
      setIsPulling(false);
    }
  };

  const formatBytes = (n?: number) => {
    if (!n || n <= 0) return "0 MB";
    const mb = n / 1024 / 1024;
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    const gb = mb / 1024;
    return `${gb.toFixed(2)} GB`;
  };

  const percent = progress?.total && progress?.completed
    ? Math.max(0, Math.min(100, Math.round((progress.completed / progress.total) * 100)))
    : 0;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--background)] p-6 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Install Model</h2>
          <button
            onClick={onClose}
            disabled={isPulling}
            className="rounded-md p-1 transition-colors hover:bg-[var(--surface)] disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 space-y-2">
          <div>
            <p className="text-sm text-[var(--foreground)]/80 mb-2">
              Confirme o identificador do modelo (nome[:tag]):
            </p>
            <input
              type="text"
              value={editableName}
              onChange={(e) => setEditableName(e.target.value)}
              disabled={isPulling}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              placeholder="ex.: llama3:8b-instruct"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-[var(--foreground)]/60">Tags disponíveis</p>
              {isLoadingTags && (
                <span className="text-xs text-[var(--foreground)]/50">Carregando…</span>
              )}
            </div>
            {tags.length > 0 ? (
              <select
                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                onChange={(e) => {
                  const base = String(modelName).split(":")[0];
                  const tag = e.target.value;
                  setEditableName(`${base}:${tag}`);
                }}
                defaultValue=""
                disabled={isPulling}
              >
                <option value="" disabled>
                  Selecione uma tag (opcional)
                </option>
                {tags.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-[var(--foreground)]/50">
                Nenhuma tag detectada automaticamente. Você pode digitar manualmente.
              </p>
            )}
          </div>

          <p className="text-xs text-[var(--foreground)]/60">
            Isso fará o download do modelo na sua instalação local do Ollama.
          </p>
        </div>

        {progress && (
          <div className="mb-4 rounded-lg bg-[var(--surface)] p-3">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="flex items-center gap-2">
                {!isSuccess && <Loader2 className="h-4 w-4 animate-spin" />}
                {isSuccess ? "Download concluído" : "Baixando modelo..."}
              </span>
              {progress.total && progress.completed && <span>{percent}%</span>}
            </div>
            <div className="w-full bg-[var(--border)] rounded-full h-2 overflow-hidden">
              <div
                className={`h-2 transition-all duration-300 ${
                  isSuccess ? "bg-green-500" : "bg-[var(--accent)]"
                }`}
                style={{ width: `${percent}%` }}
              />
            </div>
            {progress.total && progress.completed ? (
              <div className="mt-2 flex items-center justify-between text-xs text-[var(--foreground)]/60">
                <span>
                  {formatBytes(progress.completed)} / {formatBytes(progress.total)}
                </span>
                {progress?.digest && (
                  <span>sha256: {progress.digest.slice(0, 12)}...</span>
                )}
              </div>
            ) : (
              <div className="mt-2 text-xs text-[var(--foreground)]/60">
                Aguardando informações de progresso...
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            disabled={isPulling}
            className="px-4 py-2 text-sm rounded-md border border-[var(--border)] transition-colors hover:bg-[var(--surface)] disabled:opacity-50"
          >
            {isSuccess ? "Fechar" : "Cancelar"}
          </button>
          {!isSuccess && (
            <button
              onClick={handleConfirm}
              disabled={isPulling}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-[var(--accent)] text-white transition-colors hover:bg-[color-mix(in_oklab,var(--accent),black_10%)] disabled:opacity-50"
            >
              {isPulling ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Installing...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Install
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
