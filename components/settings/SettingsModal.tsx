"use client";

import { useEffect, useState } from "react";
import { X, Settings } from "lucide-react";
import { useUserPrefs, type DevicePref } from "@/hooks/useUserPrefs";

export function SettingsButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      aria-label="Open settings"
      className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-[var(--surface)] px-3 text-sm transition-colors hover:bg-[color-mix(in_oklab,var(--surface),black_6%)] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <Settings className="h-4 w-4" />
      <span className="hidden sm:inline">Settings</span>
    </button>
  );
}

export function SettingsModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { prefs, ready, update } = useUserPrefs();
  const [tab, setTab] = useState<"general" | "execution">("general");
  const [localPrompt, setLocalPrompt] = useState("");
  const [device, setDevice] = useState<DevicePref>("auto");
  const [gpuIndex, setGpuIndex] = useState(0);
  const [numGpu, setNumGpu] = useState(1);

  useEffect(() => {
    if (!ready) return;
    setLocalPrompt(prefs.systemPrompt);
    setDevice(prefs.device);
    setGpuIndex(prefs.gpuIndex);
    setNumGpu(prefs.numGpu);
  }, [ready, prefs]);

  const handleSave = () => {
    update({ systemPrompt: localPrompt, device, gpuIndex, numGpu });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-xl rounded-lg border border-border bg-background p-4 shadow-lg">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Settings</h2>
          <button
            onClick={onClose}
            className="rounded p-1 hover:bg-[var(--surface)]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 flex gap-2 border-b border-border">
          <button
            className={`px-3 py-2 text-sm ${
              tab === "general"
                ? "border-b-2 border-accent font-medium"
                : "text-[var(--foreground)]/60"
            }`}
            onClick={() => setTab("general")}
          >
            General
          </button>
          <button
            className={`px-3 py-2 text-sm ${
              tab === "execution"
                ? "border-b-2 border-accent font-medium"
                : "text-[var(--foreground)]/60"
            }`}
            onClick={() => setTab("execution")}
          >
            Execution
          </button>
        </div>

        {tab === "general" && (
          <div className="space-y-2">
            <label className="text-sm font-medium">System Prompt</label>
            <textarea
              value={localPrompt}
              onChange={(e) => setLocalPrompt(e.target.value)}
              placeholder="Define how the AI should behave..."
              className="h-32 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <p className="text-xs text-[var(--foreground)]/60">
              Sent at the start of a conversation to guide model behavior.
            </p>
          </div>
        )}

        {tab === "execution" && (
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Device</label>
              <div className="flex gap-2">
                {(["auto", "cpu", "gpu"] as DevicePref[]).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDevice(d)}
                    className={`rounded-md border border-border px-3 py-1 text-sm ${
                      device === d
                        ? "bg-[var(--surface)]"
                        : "hover:bg-[var(--surface)]"
                    }`}
                  >
                    {d.toUpperCase()}
                  </button>
                ))}
              </div>
              <p className="text-xs text-[var(--foreground)]/60">
                CPU best-effort via num_gpu:0. For hard CPU-only, set
                CUDA_VISIBLE_DEVICES=-1 before starting Ollama.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">
                  GPU Index (main_gpu)
                </label>
                <input
                  type="number"
                  value={gpuIndex}
                  onChange={(e) => setGpuIndex(Number(e.target.value))}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                  min={0}
                />
              </div>
              <div>
                <label className="text-sm font-medium">
                  Num GPUs (num_gpu)
                </label>
                <input
                  type="number"
                  value={numGpu}
                  onChange={(e) => setNumGpu(Number(e.target.value))}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                  min={0}
                />
              </div>
            </div>
            <p className="text-xs text-[var(--foreground)]/60">
              Auto: no options sent. GPU: sends num_gpu/main_gpu. CPU: sends
              num_gpu:0.
            </p>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-[var(--surface)]"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="rounded-md bg-accent px-4 py-2 text-sm text-white hover:bg-[color-mix(in_oklab,var(--accent),black_10%)]"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
