import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export type OllamaStatus = 'checking' | 'not_installed' | 'installed_stopped' | 'running';

export function useOllamaCheck() {
  const [status, setStatus] = useState<OllamaStatus>('checking');

  const check = async () => {
    setStatus('checking');
    try {
      // Usar verificação completa que checa instalação E execução
      const result = await invoke<{
        installed: boolean;
        running: boolean;
        status: string;
      }>('check_ollama_full');
      
      setStatus(result.status as OllamaStatus);
    } catch (error) {
      console.error('Failed to check ollama:', error);
      // Se falhar, tentar verificação individual como fallback
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
      } catch (fallbackError) {
        console.error('Fallback check also failed:', fallbackError);
        setStatus('not_installed');
      }
    }
  };

  useEffect(() => {
    check();
  }, []);

  return { status, check };
}

