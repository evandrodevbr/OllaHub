'use client';

import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useToast } from '@/hooks/use-toast';

export type HealthStatus = 'healthy' | 'warning' | 'critical';

export interface SystemHealth {
  status: HealthStatus;
  ram_percent: number;
  cpu_percent: number;
  message: string;
}

export function useSystemHealth() {
  const [health, setHealth] = useState<SystemHealth>({
    status: 'healthy',
    ram_percent: 0,
    cpu_percent: 0,
    message: 'Sistema saudável',
  });
  const [hasShownCriticalToast, setHasShownCriticalToast] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const unlistenPromise = listen<SystemHealth>('system-state-change', (event) => {
      const newHealth = event.payload;
      setHealth(newHealth);

      // Mostrar toast apenas quando entrar em modo Critical (uma vez)
      if (newHealth.status === 'critical' && !hasShownCriticalToast) {
        toast({
          title: 'Modo de Economia Ativado',
          description: 'Recursos limitados para manter estabilidade. Algumas funcionalidades podem estar temporariamente indisponíveis.',
          variant: 'destructive',
          duration: 5000,
        });
        setHasShownCriticalToast(true);
      } else if (newHealth.status !== 'critical') {
        // Reset flag quando sair do modo crítico
        setHasShownCriticalToast(false);
      }
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [hasShownCriticalToast, toast]);

  return health;
}

