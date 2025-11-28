import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

const TARGET_MODEL = "qwen2.5:0.5b";

export function useAutoLabelingModel() {
  const [isReady, setIsReady] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState<string>("");

  useEffect(() => {
    checkAndDownload();
  }, []);

  const checkAndDownload = async () => {
    try {
      const installed = await invoke<boolean>('check_if_model_installed', { name: TARGET_MODEL });
      if (installed) {
        setIsReady(true);
        return;
      }

      setIsDownloading(true);
      // Listen for progress
      const unlisten = await listen<string>('download-progress', (event) => {
        const payload = typeof event.payload === 'string' ? event.payload : String(event.payload);
        
        // Try to parse as JSON, if fails use as plain text
        try {
            const data = JSON.parse(payload);
            if (data.total && data.completed) {
                const percent = Math.round((data.completed / data.total) * 100);
                setProgress(`Baixando modelo de IA (${percent}%)`);
            } else if (data.status) {
                setProgress(data.status);
            } else {
                setProgress("Baixando...");
            }
        } catch {
            // Use payload as-is if it's not JSON
            setProgress(payload || "Baixando...");
        }
      });

      await invoke('pull_model', { name: TARGET_MODEL });
      
      unlisten();
      setIsDownloading(false);
      setIsReady(true);
    } catch (error) {
      console.error("Failed to setup auto-labeling model:", error);
      setIsDownloading(false);
    }
  };

  return { isReady, isDownloading, progress };
}

