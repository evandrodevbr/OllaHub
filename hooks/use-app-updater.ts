import { useState, useEffect, useCallback } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { useSettingsStore } from '@/store/settings-store';
import { check as checkForUpdate } from '@tauri-apps/plugin-updater';

export interface UpdateInfo {
  version: string;
  date?: string;
  body?: string;
}

export interface AppUpdaterState {
  currentVersion: string;
  updateAvailable: boolean;
  updateInfo: UpdateInfo | null;
  isChecking: boolean;
  isDownloading: boolean;
  downloadProgress: number;
  error: string | null;
  checkUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
}

export function useAppUpdater(): AppUpdaterState {
  const [currentVersion, setCurrentVersion] = useState<string>('');
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const autoCheckEnabled = useSettingsStore((state) => state.autoCheckUpdates ?? true);

  // Obter versão atual
  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const version = await getVersion();
        setCurrentVersion(version);
      } catch (err) {
        console.error('Failed to get app version:', err);
        setCurrentVersion('0.1.0');
      }
    };

    fetchVersion();
  }, []);

  // Verificar atualizações
  const checkUpdate = useCallback(async () => {
    setIsChecking(true);
    setError(null);

    try {
      const update = await checkForUpdate();

      if (update?.available) {
        setUpdateAvailable(true);
        setUpdateInfo({
          version: update.version,
          date: update.date,
          body: update.body,
        });
      } else {
        setUpdateAvailable(false);
        setUpdateInfo(null);
      }
    } catch (err) {
      console.error('Failed to check for updates:', err);
      setError(err instanceof Error ? err.message : 'Erro ao verificar atualizações');
      setUpdateAvailable(false);
    } finally {
      setIsChecking(false);
    }
  }, []);

  // Instalar atualização
  const installUpdate = useCallback(async () => {
    if (!updateAvailable) return;

    setIsDownloading(true);
    setError(null);
    setDownloadProgress(0);

    try {
      const update = await checkForUpdate();

      if (update?.available) {
        // Baixar e instalar atualização
        // O progresso pode ser monitorado via eventos do Tauri se necessário
        await update.downloadAndInstall();
        
        // Após downloadAndInstall(), o app será reiniciado automaticamente
        // Não é necessário chamar installAndRestart() que não existe na API
      }
    } catch (err) {
      console.error('Failed to install update:', err);
      setError(err instanceof Error ? err.message : 'Erro ao instalar atualização');
      setIsDownloading(false);
      setDownloadProgress(0);
    }
  }, [updateAvailable]);

  // Verificação automática periódica (a cada 6 horas)
  useEffect(() => {
    if (!autoCheckEnabled) return;

    // Verificar imediatamente ao montar (com delay para não interferir no carregamento)
    const initialTimer = setTimeout(() => {
      checkUpdate();
    }, 5000); // 5 segundos após o app carregar

    // Verificar periodicamente
    const interval = setInterval(() => {
      checkUpdate();
    }, 6 * 60 * 60 * 1000); // 6 horas

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [autoCheckEnabled, checkUpdate]);

  return {
    currentVersion,
    updateAvailable,
    updateInfo,
    isChecking,
    isDownloading,
    downloadProgress,
    error,
    checkUpdate,
    installUpdate,
  };
}

