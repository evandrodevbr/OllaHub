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

  useEffect(() => {
    if (!isOpen) {
      setIsPulling(false);
      setProgress(null);
      setError(null);
    }
  }, [isOpen]);

  const handleConfirm = async () => {
    setIsPulling(true);
    setError(null);

    try {
      await onConfirmPull(modelName);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to pull model");
    } finally {
      setIsPulling(false);
    }
  };

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

        <div className="mb-4">
          <p className="text-sm text-[var(--foreground)]/80 mb-2">
            Install <span className="font-medium">{modelName}</span>?
          </p>
          <p className="text-xs text-[var(--foreground)]/60">
            This will download the model to your local Ollama installation.
          </p>
        </div>

        {progress && (
          <div className="mb-4 rounded-lg bg-[var(--surface)] p-3">
            <div className="flex items-center justify-between text-sm mb-2">
              <span>Downloading...</span>
              <span>
                {progress.total && progress.completed
                  ? `${Math.round(
                      (progress.completed / progress.total) * 100,
                    )}%`
                  : "0%"}
              </span>
            </div>
            <div className="w-full bg-[var(--border)] rounded-full h-2">
              <div
                className="bg-[var(--accent)] h-2 rounded-full transition-all duration-300"
                style={{
                  width:
                    progress.total && progress.completed
                      ? `${(progress.completed / progress.total) * 100}%`
                      : "0%",
                }}
              />
            </div>
            {progress.digest && (
              <p className="text-xs text-[var(--foreground)]/60 mt-1">
                {progress.digest.slice(0, 12)}...
              </p>
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
            Cancel
          </button>
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
        </div>
      </div>
    </div>
  );
}
