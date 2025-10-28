"use client";

import { Cpu, CircuitBoard, Info } from "lucide-react";
import type { ModelInfo } from "@/lib/models";
import { useState } from "react";

export function ModelCard({ model }: { model: ModelInfo }) {
  const [hover, setHover] = useState(false);
  const isGpu = model.device === "GPU";
  return (
    <div
      role="button"
      tabIndex={0}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      className="group relative rounded-lg border border-[var(--border)] bg-[var(--background)] p-4 shadow-sm transition-all hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
    >
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[16px] font-semibold tracking-tight">
          {model.name}
        </h3>
        <span className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--foreground)]/80">
          {isGpu ? (
            <CircuitBoard className="h-3.5 w-3.5" />
          ) : (
            <Cpu className="h-3.5 w-3.5" />
          )}
          {model.device}
        </span>
      </div>
      <div className="flex items-center gap-2 text-sm text-[var(--foreground)]/80">
        <span className="rounded-md bg-[var(--surface)] px-2 py-0.5">
          {model.quantization}
        </span>
        <span className="rounded-md bg-[var(--surface)] px-2 py-0.5">
          {model.sizeGB} GB
        </span>
      </div>

      <div className="pointer-events-none absolute right-3 top-3 opacity-60">
        <Info className="h-4 w-4" />
      </div>

      {hover && (
        <div className="absolute left-0 top-full z-10 mt-2 w-72 rounded-md border border-[var(--border)] bg-[var(--background)] p-3 text-sm shadow-lg">
          <div className="mb-2 font-medium">Detalhes (estimativa)</div>
          <div className="flex items-center justify-between">
            <span>Uso de CPU</span>
            <span className="font-medium">{model.estCpuUsagePct ?? "—"}%</span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span>Uso de VRAM</span>
            <span className="font-medium">{model.estVramGB ?? 0} GB</span>
          </div>
        </div>
      )}
    </div>
  );
}
