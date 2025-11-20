import { Search, BookOpen, Brain, Loader2, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ThinkingStep = 
  | 'analyzing'
  | 'searching' 
  | 'reading'
  | 'formulating'
  | 'complete';

interface ThinkingIndicatorProps {
  currentStep: ThinkingStep;
  searchQuery?: string;
  sourcesRead?: number;
  totalSources?: number;
  onComplete?: () => void;
}

export function ThinkingIndicator({
  currentStep,
  searchQuery,
  sourcesRead = 0,
  totalSources = 0,
}: ThinkingIndicatorProps) {
  const steps: Array<{
    key: ThinkingStep;
    label: string;
    icon: React.ReactNode;
  }> = [
    {
      key: 'analyzing',
      label: 'Analisando intenção...',
      icon: <Brain className="w-3 h-3" />,
    },
    {
      key: 'searching',
      label: searchQuery ? `Pesquisando: "${searchQuery}"` : 'Pesquisando na web...',
      icon: <Search className="w-3 h-3" />,
    },
    {
      key: 'reading',
      label: totalSources > 0 
        ? `Lendo ${sourcesRead}/${totalSources} fontes...`
        : 'Lendo conteúdo...',
      icon: <BookOpen className="w-3 h-3" />,
    },
    {
      key: 'formulating',
      label: 'Formulando resposta...',
      icon: <Brain className="w-3 h-3" />,
    },
  ];

  const currentStepIndex = steps.findIndex(s => s.key === currentStep);
  const isComplete = currentStep === 'complete';

  if (isComplete) {
    return null; // Não mostrar quando completo
  }

  return (
    <div className="px-6 py-4 border-b border-muted/50 bg-muted/20">
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        {steps.slice(0, currentStepIndex + 1).map((step, idx) => {
          const isActive = idx === currentStepIndex;
          const isPast = idx < currentStepIndex;

          return (
            <div key={step.key} className="flex items-center gap-2">
              <div
                className={cn(
                  "flex items-center justify-center w-5 h-5 rounded-full transition-colors",
                  isPast && "bg-green-500/20 text-green-600 dark:text-green-400",
                  isActive && "bg-blue-500/20 text-blue-600 dark:text-blue-400 animate-pulse",
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
                  "transition-colors",
                  isActive && "text-foreground font-medium",
                  isPast && "text-muted-foreground line-through opacity-60"
                )}
              >
                {step.label}
              </span>
              {idx < steps.length - 1 && (
                <div className="w-8 h-px bg-muted mx-1" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

