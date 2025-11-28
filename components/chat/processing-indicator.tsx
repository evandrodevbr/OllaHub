'use client';

import { Search, Brain, Package, Loader2, CheckCircle2, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';

export type ProcessingStep = 
  | 'collecting'
  | 'processing'
  | 'searching'
  | 'preparing'
  | 'streaming';

interface ProcessingIndicatorProps {
  currentStep: ProcessingStep;
  progress?: number; // 0-100
  sourcesCount?: number;
}

export function ProcessingIndicator({
  currentStep,
  progress = 0,
  sourcesCount = 0,
}: ProcessingIndicatorProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Fade-in animation
    setIsVisible(true);
  }, []);

  const steps: Array<{
    key: ProcessingStep;
    label: string;
    icon: React.ReactNode;
    emoji: string;
  }> = [
    {
      key: 'collecting',
      label: 'Coletando Dados',
      icon: <Search className="w-4 h-4" />,
      emoji: '🔍',
    },
    {
      key: 'processing',
      label: 'Processando...',
      icon: <Brain className="w-4 h-4" />,
      emoji: '🤖',
    },
    {
      key: 'searching',
      label: sourcesCount > 0 ? `Buscando na Web (${sourcesCount} fontes)...` : 'Buscando na Web...',
      icon: <Globe className="w-4 h-4" />,
      emoji: '🌐',
    },
    {
      key: 'preparing',
      label: 'Preparando Contexto',
      icon: <Package className="w-4 h-4" />,
      emoji: '📦',
    },
    {
      key: 'streaming',
      label: 'Gerando Resposta...',
      icon: <Loader2 className="w-4 h-4 animate-spin" />,
      emoji: '💬',
    },
  ];

  const currentStepIndex = steps.findIndex(s => s.key === currentStep);
  const currentStepData = steps[currentStepIndex] || steps[0];

  return (
    <div
      className={cn(
        "mx-4 mb-3 px-4 py-3 rounded-lg border border-muted/50 bg-muted/20 transition-all duration-300",
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"
      )}
    >
      {/* Card de Status Atual */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-shrink-0">
          <div className="relative w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            {currentStep === 'collecting' && (
              <div className="absolute inset-0 rounded-full border-2 border-primary/30 animate-ping" />
            )}
            {currentStep === 'processing' && (
              <div className="absolute inset-0 rounded-full border-2 border-primary/30 animate-pulse" />
            )}
            {currentStep === 'searching' && (
              <div className="absolute inset-0 rounded-full border-2 border-primary/30 animate-spin" style={{ animationDuration: '2s' }} />
            )}
            <span className="text-xl relative z-10">{currentStepData.emoji}</span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground">
            {currentStepData.label}
          </div>
          {progress > 0 && progress < 100 && (
            <div className="mt-1.5 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Timeline Visual */}
      <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground">
        {steps.slice(0, currentStepIndex + 1).map((step, idx) => {
          const isActive = idx === currentStepIndex;
          const isPast = idx < currentStepIndex;

          return (
            <div key={step.key} className="flex items-center gap-1.5">
              <div
                className={cn(
                  "flex items-center justify-center w-6 h-6 rounded-full transition-all duration-300",
                  isPast && "bg-green-500/20 text-green-600 dark:text-green-400",
                  isActive && "bg-primary/20 text-primary animate-pulse",
                  !isActive && !isPast && "bg-muted text-muted-foreground"
                )}
              >
                {isPast ? (
                  <CheckCircle2 className="w-3 h-3" />
                ) : isActive ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  step.icon
                )}
              </div>
              <span
                className={cn(
                  "transition-colors duration-300",
                  isActive && "text-foreground font-medium",
                  isPast && "text-muted-foreground opacity-60"
                )}
              >
                {step.label.split(' ')[0]} {/* Mostrar apenas primeira palavra na timeline */}
              </span>
              {idx < currentStepIndex && (
                <div className="w-6 h-px bg-muted mx-1" />
              )}
            </div>
          );
        })}
      </div>

      {/* Timeline Vertical para Mobile */}
      <div className="md:hidden space-y-2">
        {steps.slice(0, currentStepIndex + 1).map((step, idx) => {
          const isActive = idx === currentStepIndex;
          const isPast = idx < currentStepIndex;

          return (
            <div key={step.key} className="flex items-center gap-2">
              <div
                className={cn(
                  "flex items-center justify-center w-5 h-5 rounded-full transition-all",
                  isPast && "bg-green-500/20 text-green-600 dark:text-green-400",
                  isActive && "bg-primary/20 text-primary animate-pulse",
                  !isActive && !isPast && "bg-muted text-muted-foreground"
                )}
              >
                {isPast ? (
                  <CheckCircle2 className="w-3 h-3" />
                ) : isActive ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  step.icon
                )}
              </div>
              <span
                className={cn(
                  "text-xs transition-colors",
                  isActive && "text-foreground font-medium",
                  isPast && "text-muted-foreground opacity-60"
                )}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

