'use client';

import { AlertCircle, RefreshCw, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface ErrorDisplayProps {
  error: string | Error;
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
}

export function ErrorDisplay({ error, onRetry, onDismiss, className }: ErrorDisplayProps) {
  const errorMessage = error instanceof Error ? error.message : String(error);

  return (
    <div
      className={cn(
        "mx-4 mb-3 px-4 py-3 rounded-lg border border-red-500/50 bg-red-500/10",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-red-600 dark:text-red-400 mb-1">
            Erro ao processar
          </div>
          <p className="text-sm text-red-700 dark:text-red-300 break-words">
            {errorMessage}
          </p>
          {(onRetry || onDismiss) && (
            <div className="flex items-center gap-2 mt-3">
              {onRetry && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onRetry}
                  className="h-7 text-xs border-red-500/50 text-red-600 dark:text-red-400 hover:bg-red-500/20"
                >
                  <RefreshCw className="w-3 h-3 mr-1.5" />
                  Tentar novamente
                </Button>
              )}
              {onDismiss && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onDismiss}
                  className="h-7 text-xs text-red-600 dark:text-red-400 hover:bg-red-500/10"
                >
                  <X className="w-3 h-3 mr-1.5" />
                  Fechar
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

