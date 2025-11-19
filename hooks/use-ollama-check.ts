import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export type OllamaStatus = 'checking' | 'not_installed' | 'installed_stopped' | 'running';

export function useOllamaCheck() {
  const [status, setStatus] = useState<OllamaStatus>('checking');

  const check = async () => {
    // Don't set checking here if we want to silently revalidate, 
    // but for initial load or explicit re-check it is fine.
    // Only set checking if it's not already in a known state to avoid flicker?
    // For now simple is better.
    try {
      const installed = await invoke<boolean>('check_ollama_installed');
      if (!installed) {
        setStatus('not_installed');
        return;
      }

      const running = await invoke<boolean>('check_ollama_running');
      if (!running) {
        setStatus('installed_stopped');
        return;
      }

      setStatus('running');
    } catch (error) {
      console.error('Failed to check ollama:', error);
      // If invoke fails (e.g. backend not ready), we might want to handle gracefully
      setStatus('not_installed');
    }
  };

  useEffect(() => {
    check();
  }, []);

  return { status, check };
}

