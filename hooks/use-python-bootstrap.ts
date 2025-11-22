'use client';

import { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';

export interface PythonBootstrapProgress {
  stage: string;
  message: string;
  progress: number | null;
}

export interface PythonBootstrapState {
  stage: string;
  message: string;
  progress: number | null;
  isComplete: boolean;
  error: string | null;
}

export function usePythonBootstrap() {
  const [state, setState] = useState<PythonBootstrapState>({
    stage: 'checking',
    message: 'Verificando runtime Python...',
    progress: null,
    isComplete: false,
    error: null,
  });

  useEffect(() => {
    // Verificar status inicial
    const checkInitialStatus = async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const status = await invoke<{ ready: boolean; error: string | null }>('check_python_runtime_status');
        
        if (status.ready) {
          setState({
            stage: 'done',
            message: 'Runtime Python pronto',
            progress: 1.0,
            isComplete: true,
            error: null,
          });
        } else if (status.error) {
          setState(prev => ({
            ...prev,
            error: status.error || 'Erro desconhecido',
            isComplete: false,
          }));
        }
      } catch (error) {
        console.error('Erro ao verificar status inicial do Python:', error);
      }
    };

    checkInitialStatus();

    // Escutar eventos de progresso
    const progressUnlisten = listen<PythonBootstrapProgress>('python-bootstrap-progress', (event) => {
      const payload = event.payload;
      setState(prev => ({
        ...prev,
        stage: payload.stage,
        message: payload.message,
        progress: payload.progress ?? prev.progress,
        error: null,
      }));
    });

    // Escutar evento de conclusão
    const completeUnlisten = listen('python-bootstrap-complete', () => {
      setState(prev => ({
        ...prev,
        stage: 'done',
        message: 'Runtime Python pronto',
        progress: 1.0,
        isComplete: true,
        error: null,
      }));
    });

    // Escutar evento de erro
    const errorUnlisten = listen<string>('python-bootstrap-error', (event) => {
      setState(prev => ({
        ...prev,
        error: event.payload || 'Erro desconhecido durante o bootstrap',
        isComplete: false,
      }));
    });

    return () => {
      progressUnlisten.then(unlisten => unlisten());
      completeUnlisten.then(unlisten => unlisten());
      errorUnlisten.then(unlisten => unlisten());
    };
  }, []);

  return state;
}




