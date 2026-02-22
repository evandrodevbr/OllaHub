'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { usePathname } from 'next/navigation';
import { useSettingsStore } from '@/store/settings-store';

interface OllamaHealthContextType {
  isOllamaRunning: boolean;
  lastCheckedAt: number | null;
  isChecking: boolean;
  checkNow: () => Promise<void>;
}

const OllamaHealthContext = createContext<OllamaHealthContextType | undefined>(undefined);

export function OllamaHealthProvider({ children }: { children: ReactNode }) {
  const [isOllamaRunning, setIsOllamaRunning] = useState<boolean>(true);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef<boolean>(false);
  const pathname = usePathname();
  const isSetupCompleted = useSettingsStore((s) => s.isSetupCompleted);

  const shouldPoll = useMemo(() => {
    if (!isSetupCompleted) return false;
    if (!pathname) return true;
    return !pathname.startsWith('/setup');
  }, [pathname, isSetupCompleted]);

  const checkNow = async () => {
    try {
      if (!mountedRef.current) return;
      setIsChecking(true);
      const ok = await invoke<boolean>('check_ollama_heartbeat');
      if (!mountedRef.current) return;
      setIsOllamaRunning(!!ok);
      setLastCheckedAt(Date.now());
    } catch {
      if (!mountedRef.current) return;
      setIsOllamaRunning(false);
      setLastCheckedAt(Date.now());
    } finally {
      if (!mountedRef.current) return;
      setIsChecking(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!shouldPoll) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    // primeira verificação imediata após mount
    setTimeout(() => { checkNow(); }, 0);
    // polling
    intervalRef.current = setInterval(() => { if (mountedRef.current) { checkNow(); } }, 3000);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [shouldPoll]);

  return (
    <OllamaHealthContext.Provider value={{ isOllamaRunning, lastCheckedAt, isChecking, checkNow }}>
      {children}
    </OllamaHealthContext.Provider>
  );
}

export function useOllamaHealth() {
  const ctx = useContext(OllamaHealthContext);
  if (!ctx) throw new Error('useOllamaHealth deve ser usado dentro de OllamaHealthProvider');
  return ctx;
}
