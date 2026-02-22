'use client';

import { useDownloadContext } from '@/contexts/download-context';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function GlobalDownloadStatusBar() {
  const { state, cancelDownload } = useDownloadContext();

  if (!state.isDownloading) {
    return null;
  }

  const { progress, currentModel, isCancelling } = state;
  const modelDisplayName = currentModel || 'Modelo';
  const percent = progress.percent ?? 0;
  const hasSizeInfo = progress.totalBytes > 0 && progress.downloadedBytes > 0;

  return (
    <div
      className={cn(
        'fixed bottom-0 left-0 right-0 z-50',
        'bg-background/95 backdrop-blur-sm border-t border-border',
        'shadow-lg',
        'animate-in slide-in-from-bottom duration-300',
        'transition-all'
      )}
    >
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-medium text-foreground truncate">
                {isCancelling ? (
                  'Cancelando download...'
                ) : (
                  `Baixando Modelo: ${modelDisplayName} (${percent}%)`
                )}
              </span>
              {progress.speed && !isCancelling && (
                <span className="text-xs text-muted-foreground font-mono ml-2 shrink-0">
                  {progress.speed}
                </span>
              )}
            </div>
            
            <Progress 
              value={percent} 
              className="h-1.5 mb-1.5"
            />
            
            {hasSizeInfo && (
              <div className="flex justify-between items-center text-[10px] text-muted-foreground/70 uppercase font-medium tracking-wider">
                <span>
                  {progress.downloadedFormatted} / {progress.totalFormatted}
                </span>
                {progress.status && (
                  <span className="normal-case">{progress.status}</span>
                )}
              </div>
            )}
          </div>
          
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={cancelDownload}
            disabled={isCancelling}
            className="shrink-0 h-8 w-8"
            aria-label="Cancelar download"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
