'use client';

import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

// Helper para formatar bytes em formato legível (KB, MB, GB)
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// Helper para formatar velocidade em formato legível
function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec === 0) return '0 B/s';
  const k = 1024;
  const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  const i = Math.floor(Math.log(bytesPerSec) / Math.log(k));
  return `${parseFloat((bytesPerSec / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// Helper para parsear string formatada (ex: "552 MB") para bytes
function parseFormattedBytes(formatted: string): number {
  if (!formatted || typeof formatted !== 'string') return 0;
  
  const match = formatted.match(/([\d.]+)\s*(B|KB|MB|GB)/i);
  if (!match) return 0;
  
  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  const multiplier = 
    unit === 'GB' ? 1024 * 1024 * 1024 :
    unit === 'MB' ? 1024 * 1024 :
    unit === 'KB' ? 1024 : 1;
  
  return value * multiplier;
}

interface DownloadProgress {
  percent: number | null; // null = indeterminado
  downloadedBytes: number; // em bytes
  totalBytes: number; // em bytes
  downloadedFormatted: string; // "552 MB"
  totalFormatted: string; // "1.2 GB"
  speed: string; // "25 MB/s" (calculado no frontend)
  status: string;
}

interface DownloadState {
  isDownloading: boolean;
  isSuccess: boolean; // NOVO: indica se download foi concluído com sucesso
  progress: DownloadProgress;
  currentModel: string | null;
  error: string | null;
  isCancelling: boolean;
}

interface DownloadContextType {
  state: DownloadState;
  startDownload: (modelName: string) => Promise<void>;
  cancelDownload: () => void;
  clearError: () => void;
}

const DownloadContext = createContext<DownloadContextType | undefined>(undefined);

export function DownloadProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DownloadState>({
    isDownloading: false,
    isSuccess: false,
    progress: {
      percent: null,
      downloadedBytes: 0,
      totalBytes: 0,
      downloadedFormatted: '0 B',
      totalFormatted: '0 B',
      speed: '0 B/s',
      status: '',
    },
    currentModel: null,
    error: null,
    isCancelling: false,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);
  const isCancellingRef = useRef(false);
  const lastDownloadedBytesRef = useRef<number>(0);
  const lastUpdateTimeRef = useRef<number>(0);

  // Sincronizar ref com estado
  useEffect(() => {
    isCancellingRef.current = state.isCancelling;
  }, [state.isCancelling]);

  // Escutar eventos de progresso do download
  useEffect(() => {
    if (!state.isDownloading) {
      // Limpar listener quando não estiver baixando
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
      return;
    }

    const setupListener = async () => {
      const unlisten = await listen<string>('download-progress', (event) => {
        if (isCancellingRef.current) return;

        try {
          const data = JSON.parse(event.payload);
          
          const status = data.status || '';
          
          // Usar percent do backend diretamente (já calculado corretamente)
          // Se não estiver disponível e tivermos completed/total, calcular
          let percent: number | null = data.percent !== undefined ? data.percent : null;
          
          // Parsear valores formatados do backend para bytes
          let downloadedBytes = 0;
          let totalBytes = 0;
          
          if (data.downloaded) {
            downloadedBytes = typeof data.downloaded === 'string' 
              ? parseFormattedBytes(data.downloaded)
              : data.downloaded;
          }
          
          if (data.total) {
            totalBytes = typeof data.total === 'string'
              ? parseFormattedBytes(data.total)
              : data.total;
          }
          
          // Se percent não veio do backend mas temos valores brutos, calcular
          if (percent === null && totalBytes > 0 && downloadedBytes > 0) {
            percent = Math.round((downloadedBytes / totalBytes) * 100);
          }
          
          // Se total for 0 ou indefinido, percent fica null (indeterminado)
          if (totalBytes === 0) {
            percent = null;
          }
          
          // Calcular velocidade em tempo real usando refs
          const now = Date.now();
          let calculatedSpeed = '0 B/s';
          
          if (downloadedBytes > 0) {
            // Primeira atualização: inicializar timestamp
            if (lastUpdateTimeRef.current === 0) {
              lastUpdateTimeRef.current = now;
              lastDownloadedBytesRef.current = downloadedBytes;
              // Usar velocidade do backend se disponível, senão 0
              calculatedSpeed = data.speed || '0 B/s';
            } else {
              const deltaTime = (now - lastUpdateTimeRef.current) / 1000; // em segundos
              
              if (deltaTime > 0 && downloadedBytes > lastDownloadedBytesRef.current) {
                const deltaBytes = downloadedBytes - lastDownloadedBytesRef.current;
                const bytesPerSec = deltaBytes / deltaTime;
                calculatedSpeed = formatSpeed(bytesPerSec);
            } else {
                // Sem mudança ou tempo inválido, manter velocidade anterior ou do backend
                calculatedSpeed = data.speed || '0 B/s';
              }
              
              // Atualizar refs para próximo cálculo
              lastDownloadedBytesRef.current = downloadedBytes;
              lastUpdateTimeRef.current = now;
            }
          }
          
          // Formatar valores para exibição
          const downloadedFormatted = downloadedBytes > 0 ? formatBytes(downloadedBytes) : (data.downloaded || '0 B');
          const totalFormatted = totalBytes > 0 ? formatBytes(totalBytes) : (data.total || '0 B');
          
          // Determinar se é sucesso
          const isSuccess = status === 'success' || percent === 100;
          
          setState(prev => ({
            ...prev,
            isSuccess: isSuccess,
            isDownloading: !isSuccess,
            progress: {
              percent: percent !== null ? percent : prev.progress.percent,
              downloadedBytes: downloadedBytes || prev.progress.downloadedBytes,
              totalBytes: totalBytes || prev.progress.totalBytes,
              downloadedFormatted: downloadedFormatted,
              totalFormatted: totalFormatted,
              speed: calculatedSpeed,
              status: status || prev.progress.status,
            },
            isCancelling: false,
          }));
          
          if (isSuccess) {
            // Não resetar progresso - manter em 100% para feedback visual
            setState(prev => ({
              ...prev,
              isDownloading: false,
              isSuccess: true,
              progress: {
                ...prev.progress,
                percent: 100,
              },
            }));
            
            if (unlistenRef.current) {
              unlistenRef.current();
              unlistenRef.current = null;
            }
          }
        } catch (error) {
          console.error('Erro ao processar evento de progresso:', error);
        }
      });

      unlistenRef.current = unlisten;
    };

    setupListener();

    return () => {
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    };
  }, [state.isDownloading, state.isCancelling]);

  const startDownload = useCallback(async (modelName: string) => {
    if (state.isDownloading) {
      console.warn('Download já em andamento');
      return;
    }

    // Resetar refs para cálculo de velocidade
    lastDownloadedBytesRef.current = 0;
    lastUpdateTimeRef.current = Date.now();

    setState({
      isDownloading: true,
      isSuccess: false,
      progress: {
        percent: null,
        downloadedBytes: 0,
        totalBytes: 0,
        downloadedFormatted: '0 B',
        totalFormatted: '0 B',
        speed: '0 B/s',
        status: 'Iniciando download...',
      },
      currentModel: modelName,
      error: null,
      isCancelling: false,
    });

    abortControllerRef.current = new AbortController();

    try {
      await invoke('download_default_model_command', { modelName });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido durante download';
      setState(prev => ({
        ...prev,
        isDownloading: false,
        isSuccess: false,
        error: errorMsg,
        isCancelling: false,
      }));
      
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    }
  }, [state.isDownloading]);

  const cancelDownload = useCallback(async () => {
    if (!state.isDownloading) return;

    setState(prev => ({
      ...prev,
      isCancelling: true,
    }));

    try {
      await invoke('cancel_download');
    } catch (error) {
      console.error('Falha ao cancelar no backend:', error);
    }

    setState(prev => ({
      ...prev,
      isDownloading: false,
      isCancelling: false,
      progress: {
        ...prev.progress,
        status: 'Cancelado',
      },
    }));

    if (unlistenRef.current) {
      unlistenRef.current();
      unlistenRef.current = null;
    }

    // Limpar AbortController local
    if (abortControllerRef.current) {
      abortControllerRef.current = null;
    }
  }, [state.isDownloading]);

  const clearError = useCallback(() => {
    setState(prev => ({
      ...prev,
      error: null,
    }));
  }, []);

  return (
    <DownloadContext.Provider
      value={{
        state,
        startDownload,
        cancelDownload,
        clearError,
      }}
    >
      {children}
    </DownloadContext.Provider>
  );
}

export function useDownloadContext() {
  const context = useContext(DownloadContext);
  if (context === undefined) {
    throw new Error('useDownloadContext deve ser usado dentro de DownloadProvider');
  }
  return context;
}
