import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export interface SetupWizardState {
  currentStep: number;
  completedSteps: number[];
  ollamaInstalled: boolean;
  ollamaRunning: boolean;
  modelDownloaded: boolean;
  modelName: string | null;
  lastError: string | null;
  progressMessage: string | null;
  progressStatus: string | null;
}

const CHECKPOINT_KEY = 'ollahub_setup_wizard_checkpoint';
const DEFAULT_MODEL = 'llama3.2:1b';
const MAX_STEPS = 4;
const MIN_STEP = 1;

function getDefaultState(): SetupWizardState {
  return {
    currentStep: 1,
    completedSteps: [],
    ollamaInstalled: false,
    ollamaRunning: false,
    modelDownloaded: false,
    modelName: null,
    lastError: null,
    progressMessage: null,
    progressStatus: null,
  };
}

function validateWizardState(state: unknown): SetupWizardState | null {
  // Verificar se é um objeto
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return null;
  }

  const stateObj = state as Record<string, unknown>;

  // Validar currentStep
  const currentStep = typeof stateObj.currentStep === 'number' 
    ? Math.max(MIN_STEP, Math.min(MAX_STEPS, Math.round(stateObj.currentStep)))
    : MIN_STEP;

  // Validar completedSteps
  const completedSteps = Array.isArray(stateObj.completedSteps)
    ? stateObj.completedSteps
        .filter((step: unknown) => typeof step === 'number' && step >= MIN_STEP && step <= MAX_STEPS)
        .map((step: unknown) => Math.round(step as number))
        .filter((step: number, index: number, arr: number[]) => arr.indexOf(step) === index) // Remover duplicatas
    : [];

  // Validar tipos dos campos booleanos
  const ollamaInstalled = typeof stateObj.ollamaInstalled === 'boolean' ? stateObj.ollamaInstalled : false;
  const ollamaRunning = typeof stateObj.ollamaRunning === 'boolean' ? stateObj.ollamaRunning : false;
  const modelDownloaded = typeof stateObj.modelDownloaded === 'boolean' ? stateObj.modelDownloaded : false;

  // Validar modelName (pode ser null ou string)
  const modelName = stateObj.modelName === null || typeof stateObj.modelName === 'string' 
    ? stateObj.modelName as string | null
    : null;

  // Validar lastError (pode ser null ou string)
  const lastError = stateObj.lastError === null || typeof stateObj.lastError === 'string' 
    ? stateObj.lastError as string | null
    : null;

  // Validar progressMessage (pode ser null ou string)
  const progressMessage = stateObj.progressMessage === null || typeof stateObj.progressMessage === 'string' 
    ? stateObj.progressMessage as string | null
    : null;

  // Validar progressStatus (pode ser null ou string)
  const progressStatus = stateObj.progressStatus === null || typeof stateObj.progressStatus === 'string' 
    ? stateObj.progressStatus as string | null
    : null;

  return {
    currentStep,
    completedSteps,
    ollamaInstalled,
    ollamaRunning,
    modelDownloaded,
    modelName,
    lastError,
    progressMessage,
    progressStatus,
  };
}

export function useSetupWizard() {
  const [state, setState] = useState<SetupWizardState>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(CHECKPOINT_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          const validated = validateWizardState(parsed);
          
          if (validated) {
            return validated;
          } else {
            // Estado inválido, remover do localStorage e usar estado inicial
            console.warn('Estado do wizard inválido detectado, resetando para estado inicial');
            localStorage.removeItem(CHECKPOINT_KEY);
          }
        } catch (error) {
          // Se falhar ao fazer parse, remover item corrompido
          console.error('Erro ao fazer parse do estado do wizard:', error);
          localStorage.removeItem(CHECKPOINT_KEY);
        }
      }
    }
    
    return getDefaultState();
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(state));
    }
  }, [state]);

  useEffect(() => {
    const unlistenPromise = listen<{ status: string; message: string }>('setup-progress', (event) => {
      const { status, message } = event.payload;
      setState(prev => ({
        ...prev,
        progressStatus: status,
        progressMessage: message,
      }));
    });

    return () => {
      unlistenPromise.then(unlisten => unlisten());
    };
  }, []);

  const checkSetupState = useCallback(async () => {
    try {
      const setupState = await invoke<{
        ollama_installed: boolean;
        ollama_running: boolean;
        default_model_downloaded: boolean;
        default_model_name: string | null;
      }>('get_setup_state_command');

      setState(prev => ({
        ...prev,
        ollamaInstalled: setupState.ollama_installed,
        ollamaRunning: setupState.ollama_running,
        modelDownloaded: setupState.default_model_downloaded,
        modelName: setupState.default_model_name || DEFAULT_MODEL,
      }));

      let initialStep = 1;
      if (setupState.ollama_installed && setupState.ollama_running) {
        initialStep = 2;
        if (setupState.default_model_downloaded) {
          initialStep = 4;
        } else {
          initialStep = 3;
        }
      }

      setState(prev => ({
        ...prev,
        currentStep: Math.max(prev.currentStep, initialStep),
      }));

      return setupState;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      setState(prev => ({
        ...prev,
        lastError: errorMsg,
      }));
      throw error;
    }
  }, []);

  const nextStep = useCallback(() => {
    setState(prev => {
      const next = prev.currentStep + 1;
      return {
        ...prev,
        currentStep: next,
        completedSteps: [...prev.completedSteps, prev.currentStep],
        lastError: null,
      };
    });
  }, []);

  const previousStep = useCallback(() => {
    setState(prev => ({
      ...prev,
      currentStep: Math.max(1, prev.currentStep - 1),
      lastError: null,
    }));
  }, []);

  const goToStep = useCallback((step: number) => {
    setState(prev => ({
      ...prev,
      currentStep: Math.max(1, Math.min(4, step)),
      lastError: null,
    }));
  }, []);

  const checkChocolatey = useCallback(async (): Promise<boolean> => {
    try {
      return await invoke<boolean>('check_chocolatey_installed_command');
    } catch (error) {
      console.error('Erro ao verificar Chocolatey:', error);
      return false;
    }
  }, []);

  const installChocolatey = useCallback(async (): Promise<void> => {
    try {
      setState(prev => ({
        ...prev,
        progressMessage: 'Instalando Chocolatey...',
        progressStatus: 'installing_chocolatey',
        lastError: null,
      }));
      
      await invoke('install_chocolatey_command');
      
      setState(prev => ({
        ...prev,
        progressMessage: 'Chocolatey instalado com sucesso',
        progressStatus: null,
      }));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Erro ao instalar Chocolatey';
      setState(prev => ({
        ...prev,
        lastError: errorMsg,
        progressStatus: null,
      }));
      throw error;
    }
  }, []);

  const installOllamaViaChoco = useCallback(async (): Promise<void> => {
    try {
      setState(prev => ({
        ...prev,
        progressMessage: 'Instalando Ollama via Chocolatey...',
        progressStatus: 'installing_ollama',
        lastError: null,
      }));
      
      await invoke('install_ollama_choco_command');
      
      setState(prev => ({
        ...prev,
        progressMessage: 'Ollama instalado com sucesso',
        progressStatus: null,
      }));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Erro ao instalar Ollama via Chocolatey';
      setState(prev => ({
        ...prev,
        lastError: errorMsg,
        progressStatus: null,
      }));
      throw error;
    }
  }, []);

  const installOllama = useCallback(async (installerPath?: string) => {
    try {
      setState(prev => ({
        ...prev,
        lastError: null,
        progressMessage: 'Iniciando instalação do Ollama...',
        progressStatus: 'installing_ollama',
      }));

      await invoke('install_ollama_silently_command', {
        installerPath: installerPath || null,
      });

      await checkSetupState();

      setState(prev => ({
        ...prev,
        ollamaInstalled: true,
        ollamaRunning: true,
        progressMessage: 'Ollama instalado e rodando!',
        progressStatus: 'ollama_ready',
      }));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      setState(prev => ({
        ...prev,
        lastError: errorMsg,
        progressMessage: `Erro: ${errorMsg}`,
        progressStatus: 'error',
      }));
      throw error;
    }
  }, [checkSetupState]);

  const downloadModel = useCallback(async (modelName: string = DEFAULT_MODEL) => {
    try {
      setState(prev => ({
        ...prev,
        lastError: null,
        progressMessage: `Baixando modelo ${modelName}...`,
        progressStatus: 'downloading_model',
      }));

      await invoke('download_default_model_command', { modelName });

      setState(prev => ({
        ...prev,
        modelDownloaded: true,
        modelName,
        progressMessage: `Modelo ${modelName} baixado com sucesso!`,
        progressStatus: 'model_ready',
      }));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      setState(prev => ({
        ...prev,
        lastError: errorMsg,
        progressMessage: `Erro ao baixar modelo: ${errorMsg}`,
        progressStatus: 'error',
      }));
      throw error;
    }
  }, []);

  const resetWizard = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(CHECKPOINT_KEY);
    }
    setState(getDefaultState());
  }, []);

  const isStepComplete = useCallback((step: number) => {
    return state.completedSteps.includes(step);
  }, [state.completedSteps]);

  return {
    state,
    checkSetupState,
    nextStep,
    previousStep,
    goToStep,
    checkChocolatey,
    installChocolatey,
    installOllamaViaChoco,
    installOllama,
    downloadModel,
    resetWizard,
    isStepComplete,
  };
}
