'use client';

import { ChevronDown, ChevronUp, Clock, CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

export interface ProcessStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  timestamp?: number;
  duration?: number;
  details?: string;
  error?: string;
}

interface PostProcessingPanelProps {
  steps: ProcessStep[];
  className?: string;
}

export function PostProcessingPanel({ steps, className }: PostProcessingPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!steps || steps.length === 0) {
    return null;
  }

  const completedSteps = steps.filter(s => s.status === 'completed').length;
  const hasErrors = steps.some(s => s.status === 'error');
  const isRunning = steps.some(s => s.status === 'running');

  const getStepIcon = (step: ProcessStep) => {
    switch (step.status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />;
      case 'running':
        return <Loader2 className="w-4 h-4 text-primary animate-spin" />;
      default:
        return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return '';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className={cn("border-t border-muted bg-muted/20", className)}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-3 flex items-center justify-between hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            {hasErrors ? (
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
            ) : isRunning ? (
              <Loader2 className="w-4 h-4 text-primary animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
            )}
            <span className="text-sm font-medium">
              Processo de Pensamento
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            ({completedSteps}/{steps.length} etapas)
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {isExpanded && (
        <div className="px-6 pb-4 space-y-3">
          {steps.map((step, idx) => (
            <div
              key={step.id}
              className={cn(
                "p-3 rounded-lg border transition-all",
                step.status === 'completed' && "bg-green-500/5 border-green-500/20",
                step.status === 'error' && "bg-red-500/5 border-red-500/20",
                step.status === 'running' && "bg-primary/5 border-primary/20",
                step.status === 'pending' && "bg-muted/50 border-muted"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 flex-1 min-w-0">
                  {getStepIcon(step)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{step.label}</span>
                      {step.duration && (
                        <span className="text-xs text-muted-foreground">
                          ({formatDuration(step.duration)})
                        </span>
                      )}
                    </div>
                    {step.details && (
                      <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
                        {step.details}
                      </p>
                    )}
                    {step.error && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                        {step.error}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

