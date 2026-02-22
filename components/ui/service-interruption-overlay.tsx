'use client';

import { useState } from 'react';
import { useOllamaHealth } from '@/contexts/ollama-health-context';
import { useSettingsStore } from '@/store/settings-store';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Power } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

export function ServiceInterruptionOverlay() {
  const { isOllamaRunning, isChecking, checkNow } = useOllamaHealth();
  const isSetupCompleted = useSettingsStore((s) => s.isSetupCompleted);
  const [starting, setStarting] = useState(false);

  const tryStartOllama = async () => {
    setStarting(true);
    try {
      await invoke<boolean>('auto_start_ollama');
      await checkNow();
    } catch {}
    setStarting(false);
  };

  if (isOllamaRunning || !isSetupCompleted) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="max-w-md w-full border rounded-lg bg-zinc-900 text-white p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="w-6 h-6 text-yellow-400" />
          <h2 className="text-lg font-semibold">Conexão com Ollama Perdida</h2>
        </div>
        <p className="text-sm text-zinc-300 mb-4">
          O serviço Ollama não está respondendo. Verifique se ele está aberto.
        </p>
        <div className="flex items-center gap-2 mb-6">
          {isChecking ? (
            <span className="text-xs text-zinc-400 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" /> Tentando reconectar...
            </span>
          ) : (
            <Button variant="ghost" size="sm" onClick={checkNow}>
              <RefreshCw className="w-4 h-4" /> Verificar novamente
            </Button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={tryStartOllama} disabled={starting} className="flex-1">
            {starting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" /> Iniciando Ollama...
              </>
            ) : (
              <>
                <Power className="w-4 h-4" /> Tentar abrir Ollama
              </>
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={checkNow}>
            Testar novamente
          </Button>
        </div>
      </div>
    </div>
  );
}

