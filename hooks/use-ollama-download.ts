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
  installStatus: string | null;
  isInstalling: boolean;
  speed: string;
  downloadedBytes: number;
  totalBytes: number;
  eta: number;
  status: 'downloading' | 'verifying' | 'completed';
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
    installStatus: null,
    isInstalling: false,
    speed: '0 MB/s',
    downloadedBytes: 0,
    totalBytes: 0,
    eta: 0,
    status: 'downloading',
  });

  const checkingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isCheckingRef = useRef(false);

  // Escutar eventos de progresso do download
  useEffect(() => {
    const unlistenDownloadPromise = listen('installer-download-progress', (event: any) => {
      const data = event.payload;
      const statusText = data.status || '';
      const isVerifying = statusText.includes('Verificando');
      const isCompleted = data.progress === 100 && !isVerifying;
      
      setState(prev => ({
        ...prev,
        downloadProgress: data.progress || 0,
        downloadStatus: statusText,
        speed: data.speed_formatted || '0 MB/s',
        downloadedBytes: data.downloaded || 0,
        totalBytes: data.total || 0,
        eta: data.eta_seconds || 0,
        status: isVerifying ? 'verifying' : isCompleted ? 'completed' : 'downloading',
        isDownloading: !isCompleted,
      }));
    });

    // Escutar eventos de progresso da instalação
    const unlistenInstallPromise = listen('installer-progress', (event: any) => {
      const data = event.payload;
      const status = data.status || 'unknown';
      const message = data.message || 'Processando...';
      
      setState(prev => ({
        ...prev,
        isInstalling: status !== 'success' && status !== 'error' && status !== 'partial',
        installStatus: message,
        isInstalled: status === 'success',
        downloadError: status === 'error' ? message : prev.downloadError,
      }));

      // Se a instalação foi bem-sucedida, iniciar verificação automática
      if (status === 'success') {
        // Usar setTimeout para evitar dependência circular
        setTimeout(() => {
          // startAutoCheck será chamado via closure do componente
          // Por enquanto, apenas atualizar o estado
          setState(prev => ({
            ...prev,
            isChecking: true,
            checkStatus: 'Verificando instalação...',
          }));
        }, 100);
      }
    });

    // Escutar evento de Ollama pronto
    const unlistenReadyPromise = listen('ollama-ready', () => {
      setState(prev => ({
        ...prev,
        isInstalling: false,
        installStatus: 'Ollama instalado e rodando!',
        isInstalled: true,
        isChecking: false,
        checkStatus: 'Ollama encontrado e rodando!',
      }));
      window.dispatchEvent(new CustomEvent('ollama-installed'));
    });

    return () => {
      unlistenDownloadPromise.then(unlisten => unlisten());
      unlistenInstallPromise.then(unlisten => unlisten());
      unlistenReadyPromise.then(unlisten => unlisten());
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
      isChecking: false,
      checkStatus: '',
<<<<<<< HEAD
      installStatus: null,
      isInstalling: false,
      speed: '0 MB/s',
      downloadedBytes: 0,
      totalBytes: 0,
      eta: 0,
      status: 'downloading',
=======
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
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
          isChecking: false,
          checkStatus: '',
<<<<<<< HEAD
          installStatus: null,
          isInstalling: false,
          speed: '0 MB/s',
          downloadedBytes: 0,
          totalBytes: 0,
          eta: 0,
          status: 'completed',
=======
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
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
        isChecking: false,
        checkStatus: '',
<<<<<<< HEAD
        installStatus: null,
        isInstalling: false,
        speed: '0 MB/s',
        downloadedBytes: 0,
        totalBytes: 0,
        eta: 0,
        status: 'completed',
=======
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
      });
    } catch (error) {
      setState({
        isDownloading: false,
        downloadProgress: 0,
        downloadStatus: '',
        downloadError: error instanceof Error ? error.message : 'Erro desconhecido durante download',
        filePath: null,
        isInstalled: false,
        isChecking: false,
        checkStatus: '',
<<<<<<< HEAD
        installStatus: null,
        isInstalling: false,
        speed: '0 MB/s',
        downloadedBytes: 0,
        totalBytes: 0,
        eta: 0,
        status: 'downloading',
=======
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
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

<<<<<<< HEAD
    // Atualizar estado para mostrar que a instalação está começando
    setState(prev => ({
      ...prev,
      isInstalling: true,
      installStatus: 'Iniciando instalação silenciosa...',
      downloadError: null,
    }));

    // Chamar Tauri em background (não bloquear)
    runInstaller(state.filePath)
      .then(() => {
        // Após iniciar a instalação, começar a verificação automática após um delay
        setTimeout(() => {
          startAutoCheck();
        }, 2000);
      })
=======
    // Optimistic UI: atualizar estado imediatamente antes da chamada Tauri
    setState(prev => ({
      ...prev,
      isInstalled: true, // Marcar como instalado imediatamente
    }));
    
    // Iniciar verificação automática em segundo plano imediatamente
    startAutoCheck();

    // Chamar Tauri em background (não bloquear)
    runInstaller(state.filePath)
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
      .catch((error) => {
        setState(prev => ({
          ...prev,
          downloadError: error instanceof Error ? error.message : 'Erro ao executar instalador',
<<<<<<< HEAD
          isInstalling: false,
          installStatus: null,
=======
          isInstalled: false, // Reverter se falhar
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
        }));
      });
  };

  const checkOllama = async (): Promise<boolean> => {
    try {
      // Usar verificação robusta multi-camada (PATH, caminhos absolutos, HTTP)
      const isInstalledAndRunning = await invoke<boolean>('verify_ollama_integrity_command');
      return isInstalledAndRunning;
    } catch (error) {
      console.error('Erro ao verificar Ollama:', error);
      // Fallback para verificação simples se o comando robusto falhar
      try {
        const installed = await invoke<boolean>('check_ollama_installed');
        if (!installed) {
          return false;
        }
        const running = await invoke<boolean>('check_ollama_running');
        return running;
      } catch (fallbackError) {
        console.error('Fallback check also failed:', fallbackError);
        return false;
      }
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
        status: 'completed',
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
      installStatus: null,
      isInstalling: false,
      speed: '0 MB/s',
      downloadedBytes: 0,
      totalBytes: 0,
      eta: 0,
      status: 'downloading',
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

