import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { SystemSpecs, GpuInfo } from '@/lib/recommendation';

export function useHardware() {
  const [specs, setSpecs] = useState<SystemSpecs | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSpecs() {
      try {
        const data = await invoke<SystemSpecs>('get_system_specs');
        setSpecs(data);
        setLoading(false);
      } catch (error) {
        console.error("Failed to get system specs:", error);
        setLoading(false);
      }
    }
    fetchSpecs();
  }, []);

  return { 
    specs, 
    loading,
    gpus: specs?.gpus || []
  };
}

