"use client";

import { useCallback, useEffect, useState } from "react";

export type CopyMode = "markdown" | "text";

const KEY = "ollahub-copy-mode";

export function useCopyPrefs() {
  const [copyMode, setCopyModeState] = useState<CopyMode>("markdown");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem(KEY) as CopyMode | null;
    if (saved === "markdown" || saved === "text") {
      setCopyModeState(saved);
    }
  }, []);

  const setCopyMode = useCallback((mode: CopyMode) => {
    setCopyModeState(mode);
    if (typeof window !== "undefined") {
      localStorage.setItem(KEY, mode);
    }
  }, []);

  return { copyMode, setCopyMode };
}
