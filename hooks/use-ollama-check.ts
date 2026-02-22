import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export type OllamaStatus = 'checking' | 'not_installed' | 'installed_stopped' | 'running';

interface UseOllamaCheckReturn {
  status: OllamaStatus;
  isChecking: boolean;
  check: () => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
  reset: () => void;
  elapsedTime: number;
}

const INITIAL_INTERVAL = 2000; // 2 segundos
const MAX_INTERVAL = 30000; // 30 segundos
const BACKOFF_MULTIPLIER = 1.5;
const TOTAL_TIMEOUT = 300000; // 5 minutos

export function useOllamaCheck(): UseOllamaCheckReturn {
  const [status, setStatus] = useState<OllamaStatus>('not_installed');
  const [isChecking, setIsChecking] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const currentIntervalRef = useRef<number>(INITIAL_INTERVAL);
  const attemptCountRef = useRef<number>(0);
  const isPollingActiveRef = useRef<boolean>(false);
  const elapsedTimerRef = useRef<NodeJS.Timeout | null>(null);

  const performCheck = useCallback(async (): Promise<boolean> => {
    try {
      const result = await invoke<{
        installed: boolean;
        running: boolean;
        status: string;
      }>('check_ollama_full');
      
      const newStatus = result.status as OllamaStatus;
      setStatus(newStatus);
      
      // Se Ollama está rodando, polling deve parar
      if (newStatus === 'running' && result.installed && result.running) {
        return true; // Sucesso, parar polling
      }
      
      return false; // Continua polling
    } catch (error) {
      console.error('Failed to check ollama:', error);
      // Se falhar, tentar verificação robusta como fallback
      try {
        const isInstalledAndRunning = await invoke<boolean>('verify_ollama_integrity_command');
        if (isInstalledAndRunning) {
          setStatus('running');
          return true; // Sucesso, parar polling
        }
        
        // Se verify_ollama_integrity retornou false, pode ser instalado mas não rodando
        // ou não instalado. Verificar separadamente para determinar status exato
        const installed = await invoke<boolean>('check_ollama_installed');
        if (!installed) {
          setStatus('not_installed');
          return false; // Continua polling (não instalado ainda)
        }

        const running = await invoke<boolean>('check_ollama_running');
        if (!running) {
          setStatus('installed_stopped');
          return false; // Continua polling (instalado mas não rodando)
        }

        setStatus('running');
        return true; // Sucesso, parar polling
      } catch (fallbackError) {
        console.error('Fallback check also failed:', fallbackError);
        setStatus('not_installed');
        return false; // Continua polling
      }
    }
  }, []);

  const startPolling = useCallback(() => {
    if (isPollingActiveRef.current) {
      return; // Já está rodando
    }

    isPollingActiveRef.current = true;
    setIsChecking(true);
    startTimeRef.current = Date.now();
    attemptCountRef.current = 0;
    currentIntervalRef.current = INITIAL_INTERVAL;

    // Atualizar tempo decorrido a cada segundo
    elapsedTimerRef.current = setInterval(() => {
      if (startTimeRef.current) {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setElapsedTime(elapsed);
        
        // Verificar timeout total
        if (elapsed * 1000 >= TOTAL_TIMEOUT) {
          setIsChecking(false);
          isPollingActiveRef.current = false;
          if (elapsedTimerRef.current) {
            clearInterval(elapsedTimerRef.current);
            elapsedTimerRef.current = null;
          }
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          return;
        }
      }
    }, 1000);

    // Primeira verificação imediata
    performCheck().then((shouldStop) => {
      if (shouldStop) {
        stopPolling();
        return;
      }

      // Iniciar polling com exponential backoff
      const scheduleNext = () => {
        if (!isPollingActiveRef.current) {
          return;
        }

        attemptCountRef.current += 1;
        
        // Calcular próximo intervalo com exponential backoff
        const nextInterval = Math.min(
          INITIAL_INTERVAL * Math.pow(BACKOFF_MULTIPLIER, attemptCountRef.current - 1),
          MAX_INTERVAL
        );
        currentIntervalRef.current = nextInterval;

        intervalRef.current = setTimeout(async () => {
          if (!isPollingActiveRef.current) {
            return;
          }

          const shouldStop = await performCheck();
          if (shouldStop) {
            stopPolling();
          } else {
            scheduleNext();
          }
        }, nextInterval);
      };

      scheduleNext();
    });

    // Timeout total
    timeoutRef.current = setTimeout(() => {
      if (isPollingActiveRef.current) {
        console.warn('Ollama check polling timeout após 5 minutos');
        stopPolling();
      }
    }, TOTAL_TIMEOUT);
  }, [performCheck]);

  const stopPolling = useCallback(() => {
    isPollingActiveRef.current = false;
    setIsChecking(false);
    
    if (intervalRef.current) {
      clearTimeout(intervalRef.current);
      intervalRef.current = null;
    }
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  }, []);

  const check = useCallback(async () => {
    // Forçar verificação manual
    await performCheck();
  }, [performCheck]);

  const reset = useCallback(() => {
    stopPolling();
    currentIntervalRef.current = INITIAL_INTERVAL;
    attemptCountRef.current = 0;
    setElapsedTime(0);
    startTimeRef.current = null;
    startPolling();
  }, [stopPolling, startPolling]);

  // Limpar polling ao desmontar
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  // Parar polling automaticamente quando status for 'running'
  useEffect(() => {
    if (status === 'running' && isPollingActiveRef.current) {
      stopPolling();
    }
  }, [status, stopPolling]);

  return {
    status,
    isChecking,
    check,
    startPolling,
    stopPolling,
    reset,
    elapsedTime,
  };
}