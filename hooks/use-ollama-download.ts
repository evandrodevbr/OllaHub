import { useState, useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { downloadInstaller, getDownloadedInstallerPath, runInstaller, type OS } from '@/lib/download-utils';

interface DownloadState {
  isDownloading: boolean;
  downloadProgress: number;
  downloadStatus: string;
  downloadError: string | null;
  filePath: string | null;
  isInstalled: boolean;
  isChecking: boolean;
  checkStatus: string;
}

export function useOllamaDownload() {
  const [state, setState] = useState<DownloadState>({
    isDownloading: false,
    downloadProgress: 0,
    downloadStatus: '',
    downloadError: null,
    filePath: null,
    isInstalled: false,
    isChecking: false,
    checkStatus: '',
  });

  const checkingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isCheckingRef = useRef(false);

  // Escutar eventos de progresso do download
  useEffect(() => {
    const unlistenPromise = listen('installer-download-progress', (event: any) => {
      const data = event.payload;
      setState(prev => ({
        ...prev,
        downloadProgress: data.progress || 0,
        downloadStatus: data.status || '',
      }));
    });

    return () => {
      unlistenPromise.then(unlisten => unlisten());
    };
  }, []);

  const handleDownload = async (os: OS) => {
    setState({
      isDownloading: true,
      downloadProgress: 0,
      downloadStatus: 'Iniciando download...',
      downloadError: null,
      filePath: null,
      isInstalled: false,
    });

    try {
      // Verificar se já foi baixado
      const existingPath = await getDownloadedInstallerPath(os);
      if (existingPath) {
        setState({
          isDownloading: false,
          downloadProgress: 100,
          downloadStatus: 'Download já concluído',
          downloadError: null,
          filePath: existingPath,
          isInstalled: false,
        });
        return;
      }

      // Fazer download
      const filePath = await downloadInstaller(os);
      setState({
        isDownloading: false,
        downloadProgress: 100,
        downloadStatus: 'Download concluído',
        downloadError: null,
        filePath,
        isInstalled: false,
      });
    } catch (error) {
      setState({
        isDownloading: false,
        downloadProgress: 0,
        downloadStatus: '',
        downloadError: error instanceof Error ? error.message : 'Erro desconhecido durante download',
        filePath: null,
        isInstalled: false,
      });
    }
  };

  const handleInstall = async () => {
    if (!state.filePath) {
      setState(prev => ({
        ...prev,
        downloadError: 'Nenhum instalador disponível',
      }));
      return;
    }

    try {
      await runInstaller(state.filePath);
      setState(prev => ({
        ...prev,
        isInstalled: true,
      }));
      
      // Iniciar verificação automática em segundo plano
      startAutoCheck();
    } catch (error) {
      setState(prev => ({
        ...prev,
        downloadError: error instanceof Error ? error.message : 'Erro ao executar instalador',
      }));
    }
  };

  const checkOllama = async (): Promise<boolean> => {
    try {
      const installed = await invoke<boolean>('check_ollama_installed');
      if (!installed) {
        return false;
      }

      const running = await invoke<boolean>('check_ollama_running');
      return running;
    } catch (error) {
      console.error('Erro ao verificar Ollama:', error);
      return false;
    }
  };

  const startAutoCheck = () => {
    // Limpar intervalo anterior se existir
    if (checkingIntervalRef.current) {
      clearInterval(checkingIntervalRef.current);
    }

    if (isCheckingRef.current) {
      return; // Já está verificando
    }

    isCheckingRef.current = true;
    setState(prev => ({
      ...prev,
      isChecking: true,
      checkStatus: 'Verificando instalação do Ollama...',
    }));

    let attempts = 0;
    const maxAttempts = 300; // 5 minutos (300 * 1 segundo)

    checkingIntervalRef.current = setInterval(async () => {
      attempts++;
      
      const isRunning = await checkOllama();
      
      if (isRunning) {
        // Ollama encontrado e rodando!
        if (checkingIntervalRef.current) {
          clearInterval(checkingIntervalRef.current);
          checkingIntervalRef.current = null;
        }
        isCheckingRef.current = false;
        
        setState(prev => ({
          ...prev,
          isChecking: false,
          checkStatus: 'Ollama encontrado e rodando!',
        }));

        // Emitir evento customizado para notificar o componente pai
        window.dispatchEvent(new CustomEvent('ollama-installed'));
      } else if (attempts >= maxAttempts) {
        // Limite de tentativas atingido
        if (checkingIntervalRef.current) {
          clearInterval(checkingIntervalRef.current);
          checkingIntervalRef.current = null;
        }
        isCheckingRef.current = false;
        
        setState(prev => ({
          ...prev,
          isChecking: false,
          checkStatus: 'Verificação automática pausada. Use "Verificar Novamente" para continuar.',
        }));
      } else {
        setState(prev => ({
          ...prev,
          checkStatus: `Verificando... (${attempts}/${maxAttempts})`,
        }));
      }
    }, 1000); // Verificar a cada 1 segundo
  };

  const stopAutoCheck = () => {
    if (checkingIntervalRef.current) {
      clearInterval(checkingIntervalRef.current);
      checkingIntervalRef.current = null;
    }
    isCheckingRef.current = false;
    setState(prev => ({
      ...prev,
      isChecking: false,
      checkStatus: '',
    }));
  };

  // Limpar intervalo ao desmontar
  useEffect(() => {
    return () => {
      if (checkingIntervalRef.current) {
        clearInterval(checkingIntervalRef.current);
      }
    };
  }, []);

  const checkExistingDownload = async (os: OS) => {
    const existingPath = await getDownloadedInstallerPath(os);
    if (existingPath) {
      setState(prev => ({
        ...prev,
        filePath: existingPath,
        downloadProgress: 100,
        downloadStatus: 'Download já concluído',
      }));
    }
  };

  const reset = () => {
    stopAutoCheck();
    setState({
      isDownloading: false,
      downloadProgress: 0,
      downloadStatus: '',
      downloadError: null,
      filePath: null,
      isInstalled: false,
      isChecking: false,
      checkStatus: '',
    });
  };

  return {
    ...state,
    handleDownload,
    handleInstall,
    checkExistingDownload,
    startAutoCheck,
    stopAutoCheck,
    reset,
  };
}

