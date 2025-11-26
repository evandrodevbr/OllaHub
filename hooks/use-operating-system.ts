import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { OS } from '@/lib/download-utils';

export function useOperatingSystem() {
  const [os, setOs] = useState<OS | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const detectOS = async () => {
      try {
        const detectedOS = await invoke<string>('get_operating_system');
        // Mapear para o tipo OS
        if (detectedOS === 'windows' || detectedOS === 'mac' || detectedOS === 'linux') {
          setOs(detectedOS as OS);
        } else {
          // Fallback: tentar detectar via user agent
          const userAgent = navigator.userAgent.toLowerCase();
          if (userAgent.includes('win')) {
            setOs('windows');
          } else if (userAgent.includes('mac')) {
            setOs('mac');
          } else if (userAgent.includes('linux')) {
            setOs('linux');
          } else {
            setOs('windows'); // Default fallback
          }
        }
      } catch (error) {
        console.error('Failed to detect OS:', error);
        // Fallback: detectar via user agent
        const userAgent = navigator.userAgent.toLowerCase();
        if (userAgent.includes('win')) {
          setOs('windows');
        } else if (userAgent.includes('mac')) {
          setOs('mac');
        } else if (userAgent.includes('linux')) {
          setOs('linux');
        } else {
          setOs('windows'); // Default fallback
        }
      } finally {
        setLoading(false);
      }
    };

    detectOS();
  }, []);

  return { os, loading };
}





