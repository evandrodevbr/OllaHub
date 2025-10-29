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
  const [tab, setTab] = useState<"general" | "execution" | "device">("general");
  const [localPrompt, setLocalPrompt] = useState("");
  const [device, setDevice] = useState<DevicePref>("auto");
  const [gpuIndex, setGpuIndex] = useState(0);
  const [numGpu, setNumGpu] = useState(1);
  const [chatLayout, setChatLayout] = useState<"compact" | "edge">("compact");
  const [bubbleSize, setBubbleSize] = useState<"sm" | "md" | "lg">("md");
  const [sysInfo, setSysInfo] = useState<any>(null);

  useEffect(() => {
    if (!ready) return;
    setLocalPrompt(prefs.systemPrompt);
    setDevice(prefs.device);
    setGpuIndex(prefs.gpuIndex);
    setNumGpu(prefs.numGpu);
    setChatLayout((prefs as any).chatLayout ?? "compact");
    setBubbleSize((prefs as any).bubbleSize ?? "md");
  }, [ready, prefs]);

  const handleSave = () => {
    update({ systemPrompt: localPrompt, device, gpuIndex, numGpu, chatLayout, bubbleSize });
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
          <button
            className={`px-3 py-2 text-sm ${
              tab === "device"
                ? "border-b-2 border-accent font-medium"
                : "text-[var(--foreground)]/60"
            }`}
            onClick={() => setTab("device")}
          >
            Device
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

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium">Chat layout</label>
                <select
                  value={chatLayout}
                  onChange={(e) => setChatLayout(e.target.value as any)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="compact">Compact (centered)</option>
                  <option value="edge">Edge-to-edge</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Bubble size</label>
                <select
                  value={bubbleSize}
                  onChange={(e) => setBubbleSize(e.target.value as any)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="sm">Small</option>
                  <option value="md">Medium</option>
                  <option value="lg">Large</option>
                </select>
              </div>
            </div>
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

        {tab === "device" && (
          <DeviceStatus
            sysInfo={sysInfo}
            setSysInfo={setSysInfo}
            device={device}
            gpuIndex={gpuIndex}
            setDevice={setDevice}
            setGpuIndex={setGpuIndex}
          />
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

function DeviceStatus({ sysInfo, setSysInfo, device, gpuIndex, setDevice, setGpuIndex }: { sysInfo: any; setSysInfo: (v: any) => void; device: DevicePref; gpuIndex: number; setDevice: (d: DevicePref) => void; setGpuIndex: (i: number) => void; }) {
  // polling a cada 2s
  useEffect(() => {
    let mounted = true;
    const load = () => {
      fetch("/api/system/status")
        .then((r) => r.json())
        .then((d) => mounted && d.success && setSysInfo(d.info))
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 2000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [setSysInfo]);

  // Defaultar GPU 0 quando houver GPU e usuário escolher GPU
  useEffect(() => {
    const gpus = Array.isArray(sysInfo?.gpus) ? sysInfo.gpus : [];
    if (device === "gpu" && gpus.length > 0) {
      if (typeof gpuIndex !== "number" || gpuIndex < 0 || gpuIndex >= gpus.length) {
        setGpuIndex(0);
      }
    }
  }, [device, gpuIndex, sysInfo, setGpuIndex]);

  if (!sysInfo) {
    return <div className="text-sm text-[var(--foreground)]/60">Loading device info...</div>;
  }

  const memPct = sysInfo.memory.total > 0 ? (sysInfo.memory.used / sysInfo.memory.total) * 100 : 0;
  const memModules = Array.isArray(sysInfo.memory.modules) ? sysInfo.memory.modules : [];
  const gpus = Array.isArray(sysInfo.gpus) ? sysInfo.gpus : [];
  const hasGpu = gpus.length > 0;
  const currentGpu = hasGpu ? Math.min(Math.max(0, gpuIndex || 0), gpus.length - 1) : 0;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-md border border-border p-3">
          <div className="font-medium mb-1">Sistema</div>
          <div>OS: {sysInfo.os?.platform || sysInfo.platform} {sysInfo.os?.release || sysInfo.release}</div>
          <div>Arch: {sysInfo.os?.arch || sysInfo.arch}</div>
          <div>CPU: {sysInfo.cpu?.model} ({sysInfo.cpu?.cores} cores)</div>
          <div>Uptime: {Math.round(sysInfo.uptimeSec / 60)} min</div>
        </div>
        <div className="rounded-md border border-border p-3">
          <div className="font-medium mb-1">Carga</div>
          <div>Load (1m/5m/15m): {Number(sysInfo.metrics?.loadAvg?.["1m"] ?? 0).toFixed(2)} / {Number(sysInfo.metrics?.loadAvg?.["5m"] ?? 0).toFixed(2)} / {Number(sysInfo.metrics?.loadAvg?.["15m"] ?? 0).toFixed(2)}</div>
          <div>Memória: {(sysInfo.memory.used/1024/1024).toFixed(0)}MB / {(sysInfo.memory.total/1024/1024).toFixed(0)}MB ({memPct.toFixed(0)}%)</div>
          <div>Módulos de RAM: {memModules.length}</div>
        </div>
      </div>

      <div className="rounded-md border border-border p-3 text-sm">
        <div className="font-medium mb-1">Aplicativo</div>
        <div>RSS: {(sysInfo.metrics?.process?.rss/1024/1024).toFixed(0)}MB | Heap: {(sysInfo.metrics?.process?.heapUsed/1024/1024).toFixed(0)}MB / {(sysInfo.metrics?.process?.heapTotal/1024/1024).toFixed(0)}MB</div>
      </div>

      <div className="rounded-md border border-border p-3 text-sm">
        <div className="font-medium mb-2">Placas de vídeo</div>
        {hasGpu ? (
          <div className="space-y-2">
            {gpus.map((g: any) => (
              <div key={g.index} className="flex items-center justify-between rounded-md border border-border p-2">
                <div>
                  <div className="font-medium">{g.name}</div>
                  <div className="text-[var(--foreground)]/70">{g.vendor || ""} {g.vramMB ? `• ${g.vramMB}MB VRAM` : ""} {g.bus ? `• ${g.bus}` : ""}</div>
                </div>
                <div className="text-xs">index: {g.index}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[var(--foreground)]/60">Nenhuma GPU detectada</div>
        )}
      </div>

      <div className="rounded-md border border-border p-3 text-sm">
        <div className="font-medium mb-2">Dispositivo principal</div>
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <label className="inline-flex items-center gap-2">
            <input type="radio" name="dev" checked={device === "cpu"} onChange={() => setDevice("cpu")}/> CPU
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="radio" name="dev" checked={device === "gpu"} onChange={() => setDevice("gpu")} disabled={!hasGpu}/> GPU
          </label>
          <select
            disabled={device !== "gpu" || !hasGpu}
            value={currentGpu}
            onChange={(e) => setGpuIndex(Number(e.target.value))}
            className="mt-1 w-full md:w-auto rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          >
            {gpus.map((g: any) => (
              <option key={g.index} value={g.index}>{g.index}: {g.name}</option>
            ))}
          </select>
          <span className="text-xs text-[var(--foreground)]/60">Se houver GPU, ela será o padrão quando selecionar GPU.</span>
        </div>
      </div>

      <p className="text-xs text-[var(--foreground)]/60">Para métricas detalhadas por modelo/GPU, integrações com o servidor de modelos serão adicionadas depois.</p>
    </div>
  );
}
