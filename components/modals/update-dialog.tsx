'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Download, Loader2, X, Sparkles } from 'lucide-react';
import { useAppUpdater } from '@/hooks/use-app-updater';
import { useSettingsStore } from '@/store/settings-store';

interface UpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UpdateDialog({ open, onOpenChange }: UpdateDialogProps) {
  const {
    currentVersion,
    updateAvailable,
    updateInfo,
    isChecking,
    isDownloading,
    downloadProgress,
    error,
    installUpdate,
  } = useAppUpdater();

  const [dontShowAgain, setDontShowAgain] = useState(false);
  const setAutoCheckUpdates = useSettingsStore((state) => state.setAutoCheckUpdates);

  const handleInstall = async () => {
    if (dontShowAgain) {
      setAutoCheckUpdates(false);
    }
    await installUpdate();
  };

  const handleClose = () => {
    if (dontShowAgain) {
      setAutoCheckUpdates(false);
    }
    onOpenChange(false);
  };

  if (!updateAvailable && !isChecking) {
    return null;
  }

  return (
    <Dialog open={open && updateAvailable} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Atualização Disponível
          </DialogTitle>
          <DialogDescription>
            Uma nova versão do OllaHub está disponível para download.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Versão Atual</span>
              <span className="font-mono font-medium">{currentVersion}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Nova Versão</span>
              <span className="font-mono font-medium text-primary">
                {updateInfo?.version}
              </span>
            </div>
          </div>

          {updateInfo?.body && (
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground line-clamp-3">
                {updateInfo.body}
              </p>
            </div>
          )}

          {isDownloading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Baixando atualização...</span>
                <span className="font-medium">{downloadProgress}%</span>
              </div>
              <Progress value={downloadProgress} className="h-2" />
            </div>
          )}

          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Checkbox
              id="dont-show-updates"
              checked={dontShowAgain}
              onCheckedChange={(checked) => setDontShowAgain(checked === true)}
            />
            <Label
              htmlFor="dont-show-updates"
              className="text-sm font-normal cursor-pointer"
            >
              Não verificar atualizações automaticamente
            </Label>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isDownloading}
          >
            <X className="h-4 w-4 mr-2" />
            Depois
          </Button>
          <Button
            onClick={handleInstall}
            disabled={isDownloading || isChecking}
          >
            {isDownloading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Baixando...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Atualizar Agora
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

