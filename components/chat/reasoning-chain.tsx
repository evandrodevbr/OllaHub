'use client';

import { 
  Loader2, 
  CheckCircle2,
  Circle,
  Search,
  Globe,
  Brain,
  Package,
  BookOpen
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ThinkingMessageMetadata } from '@/hooks/use-chat';
import { SourcesCompact } from './sources-compact';

interface ReasoningChainProps {
  steps: ThinkingMessageMetadata[];
  searchQueries?: string[];
  className?: string;
}

export function ReasoningChain({ steps, searchQueries = [], className }: ReasoningChainProps) {
  const hasActiveStep = steps.some(step => step.status === 'running');
  const allSources = steps
    .flatMap(step => step.sources || [])
    .filter((source, index, self) => 
      index === self.findIndex(s => s.url === source.url)
    );

  const getStepIcon = (step: ThinkingMessageMetadata) => {
    const isRunning = step.status === 'running';
    const isCompleted = step.status === 'completed';
    const isError = step.status === 'error';

    if (isError) {
      return null; // Não mostrar ícone para erros, apenas texto
    }

    if (isCompleted) {
      return <CheckCircle2 className="w-3.5 h-3.5 text-muted-foreground/60" />;
    }

    if (isRunning) {
      return <Loader2 className="w-3.5 h-3.5 text-muted-foreground/60 animate-spin" />;
    }

    // Ícone baseado no tipo de step
    switch (step.stepType) {
      case 'preprocessing':
        return <Brain className="w-3.5 h-3.5 text-muted-foreground/60" />;
      case 'web-research':
        return <Search className="w-3.5 h-3.5 text-muted-foreground/60" />;
      case 'sources-found':
        return <Globe className="w-3.5 h-3.5 text-muted-foreground/60" />;
      case 'processing':
        return <Brain className="w-3.5 h-3.5 text-muted-foreground/60" />;
      case 'response-generation':
        return <Loader2 className="w-3.5 h-3.5 text-muted-foreground/60 animate-spin" />;
      default:
        return <Search className="w-3.5 h-3.5 text-muted-foreground/60" />;
    }
  };

  return (
    <div className={cn("mb-6 space-y-3", className)}>
      {/* Header: "Working..." com spinner sutil */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Circle className="w-2 h-2 fill-current animate-pulse" />
        <span>Working...</span>
      </div>
      
      {/* Lista vertical de steps - texto simples */}
      <div className="space-y-1.5 pl-6">
        {steps.map((step, index) => {
          const isRunning = step.status === 'running';
          const isCompleted = step.status === 'completed';
          const isError = step.status === 'error';
          
          return (
            <div 
              key={`${step.stepType}-${step.timestamp}`}
              className={cn(
                "reasoning-step flex items-center gap-2 text-sm",
                isError 
                  ? "text-destructive/80" 
                  : isCompleted 
                    ? "text-muted-foreground/60" 
                    : "text-muted-foreground/80"
              )}
              style={{ animationDelay: `${index * 100}ms` }}
            >
              {getStepIcon(step)}
              <span>{step.label}</span>
              {step.details && (
                <span className="text-xs text-muted-foreground/50 ml-1">
                  {step.details}
                </span>
              )}
            </div>
          );
        })}
      </div>
      
      {/* Pills de busca - cápsulas sutis */}
      {searchQueries.length > 0 && (
        <div className="flex flex-wrap gap-2 pl-6">
          <span className="text-xs text-muted-foreground/60">Searching:</span>
          {searchQueries.map((query, index) => (
            <span 
              key={index}
              className="text-xs font-mono px-2 py-1 bg-white/5 dark:bg-white/5 border border-white/10 dark:border-white/10 rounded-full text-muted-foreground/70"
            >
              {query}
            </span>
          ))}
        </div>
      )}
      
      {/* Fontes em revisão */}
      {allSources.length > 0 && (
        <div className="pl-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-muted-foreground/60">
              Reviewing sources - {allSources.length}
            </span>
          </div>
          <SourcesCompact sources={allSources} />
        </div>
      )}
    </div>
  );
}

