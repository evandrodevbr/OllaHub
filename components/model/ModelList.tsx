"use client";

import { ModelCard } from "./ModelCard";
import type { ModelInfo } from "@/lib/models";

export function ModelList({ models }: { models: ModelInfo[] }) {
  if (!models?.length) {
    return (
      <div className="rounded-lg border border-[var(--border)] p-6 text-sm text-[var(--foreground)]/70">
        Nenhum modelo encontrado.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {models.map((m) => (
        <ModelCard key={m.id} model={m} />
      ))}
    </div>
  );
}
