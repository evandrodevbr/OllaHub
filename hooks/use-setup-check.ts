import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useOllamaCheck, type OllamaStatus } from './use-ollama-check';

export type SetupStatus = 'checking' | 'ready' | 'needs_setup' | 'needs_ollama';

export function useSetupCheck() {
  const { status: ollamaStatus, check: checkOllama } = useOllamaCheck();
  const [setupStatus, setSetupStatus] = useState<SetupStatus>('checking');
  const [checkingStep, setCheckingStep] = useState<string>('Verificando Ollama...');
  const [hasModels, setHasModels] = useState(false);
  const [modelsCount, setModelsCount] = useState(0);

  const checkModels = async (): Promise<boolean> => {
    try {
      setCheckingStep('Verificando modelos instalados...');
      const models = await invoke<Array<{ name: string; size: string; id: string; modified_at: string }>>('list_local_models');
      const count = models.length;
      setModelsCount(count);
      const hasAny = count > 0;
      setHasModels(hasAny);
      return hasAny;
    } catch (error) {
      console.error('Failed to check models:', error);
      // Em caso de erro, assumir que não há modelos (seguro)
      setHasModels(false);
      setModelsCount(0);
      return false;
    }
  };

  const determineSetupStatus = async (ollamaStatus: OllamaStatus): Promise<SetupStatus> => {
    // Se Ollama não está instalado, precisa instalar
    if (ollamaStatus === 'not_installed') {
      return 'needs_ollama';
    }

    // Se Ollama está instalado mas parado, tentar iniciar primeiro
    if (ollamaStatus === 'installed_stopped') {
      try {
        setCheckingStep('Iniciando Ollama...');
        await invoke('auto_start_ollama');
        // Aguardar um pouco para o servidor iniciar
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Verificar novamente se está rodando
        const running = await invoke<boolean>('check_ollama_running');
        if (!running) {
          // Ainda não está rodando, precisa de intervenção do usuário
          return 'needs_setup';
        }
        // Agora está rodando, verificar modelos
        const hasAnyModels = await checkModels();
        return hasAnyModels ? 'ready' : 'needs_setup';
      } catch (error) {
        console.error('Failed to auto-start Ollama:', error);
        return 'needs_setup';
      }
    }

    // Se Ollama está rodando, verificar modelos
    if (ollamaStatus === 'running') {
      const hasAnyModels = await checkModels();
      return hasAnyModels ? 'ready' : 'needs_setup';
    }

    // Estado checking ou qualquer outro caso
    return 'checking';
  };

  useEffect(() => {
    const performCheck = async () => {
      if (ollamaStatus === 'checking') {
        setSetupStatus('checking');
        setCheckingStep('Verificando Ollama...');
        return;
      }

      const status = await determineSetupStatus(ollamaStatus);
      setSetupStatus(status);
      
      if (status === 'ready') {
        setCheckingStep('Tudo pronto!');
      } else if (status === 'needs_setup') {
        setCheckingStep('Configuração necessária');
      } else if (status === 'needs_ollama') {
        setCheckingStep('Ollama não instalado');
      }
    };

    performCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ollamaStatus]);

  const recheck = async () => {
    setSetupStatus('checking');
    setCheckingStep('Verificando Ollama...');
    await checkOllama();
    // O useEffect vai processar o novo status
  };

  return {
    status: setupStatus,
    ollamaStatus,
    hasModels,
    modelsCount,
    checkingStep,
    recheck,
  };
}

