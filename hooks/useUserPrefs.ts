"use client";

import { useCallback, useEffect, useState } from "react";

export type DevicePref = "auto" | "cpu" | "gpu";

type Prefs = {
  systemPrompt: string;
  device: DevicePref;
  gpuIndex: number; // main_gpu
  numGpu: number; // num_gpu
};

const KEYS = {
  systemPrompt: "ollahub-system-prompt",
  device: "ollahub-device-pref",
  gpuIndex: "ollahub-gpu-index",
  numGpu: "ollahub-num-gpu",
} as const;

const defaultPrefs: Prefs = {
  systemPrompt: "",
  device: "auto",
  gpuIndex: 0,
  numGpu: 1,
};

export function useUserPrefs() {
  const [prefs, setPrefs] = useState<Prefs>(defaultPrefs);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const p: Prefs = {
      systemPrompt:
        localStorage.getItem(KEYS.systemPrompt) || defaultPrefs.systemPrompt,
      device:
        (localStorage.getItem(KEYS.device) as DevicePref) ||
        defaultPrefs.device,
      gpuIndex: Number(
        localStorage.getItem(KEYS.gpuIndex) || defaultPrefs.gpuIndex
      ),
      numGpu: Number(localStorage.getItem(KEYS.numGpu) || defaultPrefs.numGpu),
    };
    setPrefs(p);
    setReady(true);
  }, []);

  const update = useCallback((next: Partial<Prefs>) => {
    setPrefs((prev) => {
      const merged: Prefs = { ...prev, ...next };
      if (typeof window !== "undefined") {
        localStorage.setItem(KEYS.systemPrompt, merged.systemPrompt);
        localStorage.setItem(KEYS.device, merged.device);
        localStorage.setItem(KEYS.gpuIndex, String(merged.gpuIndex));
        localStorage.setItem(KEYS.numGpu, String(merged.numGpu));
      }
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
