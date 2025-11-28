'use client';

import { useEffect, useState } from 'react';
import { UpdateDialog } from '@/components/modals/update-dialog';
import { useAppUpdater } from '@/hooks/use-app-updater';
import { useSettingsStore } from '@/store/settings-store';

export function AppUpdaterProvider() {
  const { updateAvailable, checkUpdate } = useAppUpdater();
  const [isOpen, setIsOpen] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);
  const autoCheckEnabled = useSettingsStore((state) => state.autoCheckUpdates ?? true);

  useEffect(() => {
    if (!autoCheckEnabled || hasChecked) return;

    // Verificar após um delay para não interferir no carregamento inicial
    const timer = setTimeout(() => {
      checkUpdate().then(() => {
        setHasChecked(true);
      });
    }, 5000); // 5 segundos após o app carregar

    return () => clearTimeout(timer);
  }, [autoCheckEnabled, hasChecked, checkUpdate]);

  useEffect(() => {
    if (updateAvailable && !isOpen) {
      setIsOpen(true);
    }
  }, [updateAvailable, isOpen]);

  return (
    <UpdateDialog
      open={isOpen}
      onOpenChange={setIsOpen}
    />
  );
}

