import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export interface SystemStats {
  cpu_usage: number;
  memory_used: number;
  memory_total: number;
}

export function useSystemMonitor() {
  const [stats, setStats] = useState<SystemStats | null>(null);

  useEffect(() => {
    // Start the monitor thread in backend
    invoke('start_system_monitor');

    const unlisten = listen<SystemStats>('system-stats', (event) => {
      setStats(event.payload);
    });

    return () => {
      unlisten.then(f => f());
    };
  }, []);

  return stats;
}



