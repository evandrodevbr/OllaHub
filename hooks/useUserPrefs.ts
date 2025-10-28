"use client";

import { useCallback, useEffect, useState } from "react";

export type DevicePref = "auto" | "cpu" | "gpu";

type Prefs = {
  selectedModel: string | null; // NOVO
  systemPrompt: string;
  device: DevicePref;
  gpuIndex: number;
  numGpu: number;
};

const defaultPrefs: Prefs = {
  selectedModel: null, // NOVO
  systemPrompt: "",
  device: "auto",
  gpuIndex: 0,
  numGpu: 1,
};

export function useUserPrefs() {
  const [prefs, setPrefs] = useState<Prefs>(defaultPrefs);
  const [ready, setReady] = useState(false);

  // Carregar do Redis
  useEffect(() => {
    fetch("/api/preferences")
      .then((res) => res.json())
      .then((data) => {
        setPrefs(data);
        setReady(true);
      })
      .catch((err) => {
        console.error("Erro ao carregar preferências:", err);
        setReady(true);
      });
  }, []);

  // Salvar no Redis
  const update = useCallback((next: Partial<Prefs>) => {
    setPrefs((prev) => {
      const merged: Prefs = { ...prev, ...next };

      // Salvar no Redis
      fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(merged),
      }).catch((err) =>
        console.error("Erro ao salvar preferências:", err)
      );

      return merged;
    });
  }, []);

  return { prefs, ready, update };
}

export function buildOllamaOptions(
  device: DevicePref,
  numGpu: number,
  gpuIndex: number
) {
  if (device === "auto") return undefined;
  if (device === "cpu") return { num_gpu: 0 } as const;
  // gpu
  return {
    num_gpu: Math.max(1, numGpu),
    main_gpu: Math.max(0, gpuIndex),
  } as const;
}