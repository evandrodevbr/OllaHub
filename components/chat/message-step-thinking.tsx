'use client';

import { 
  Search, 
  Brain, 
  Globe, 
  Package, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Copy,
  Check
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import type { ThinkingMessageMetadata } from '@/hooks/use-chat';

interface MessageStepThinkingProps {
  metadata: ThinkingMessageMetadata;
}

export function MessageStepThinking({ metadata }: MessageStepThinkingProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const getStepIcon = () => {
    const isSpinning = metadata.stepType === 'response-generation' && metadata.status === 'running';
    
    switch (metadata.stepType) {
      case 'preprocessing':
        return <Brain className={cn("w-4 h-4 text-muted-foreground/80", isSpinning && "animate-spin")} />;
      case 'web-research':
        return <Globe className={cn("w-4 h-4 text-muted-foreground/80", isSpinning && "animate-spin")} />;
      case 'sources-found':
        return <Package className={cn("w-4 h-4 text-muted-foreground/80", isSpinning && "animate-spin")} />;
      case 'processing':
        return <Brain className={cn("w-4 h-4 text-muted-foreground/80", isSpinning && "animate-spin")} />;
      case 'response-generation':
        return <Loader2 className={cn("w-4 h-4 text-muted-foreground/80", isSpinning && "animate-spin")} />;
      case 'fallback':
        return <AlertCircle className="w-4 h-4 text-muted-foreground/80" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-destructive/80" />;
      default:
        return <Search className="w-4 h-4 text-muted-foreground/80" />;
    }
  };

  const copyToClipboard = async (url: string, index: number) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (error) {
      console.error('Failed to copy URL:', error);
    }
  };

  return (
    <div className="mb-4 ml-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center gap-3 p-2 transition-all w-fit max-w-full">
        <div className="flex items-center gap-2">
            {getStepIcon()}
            <span className={cn(
              "text-sm font-medium",
              metadata.status === 'error' 
                ? "text-destructive/80" 
                : "text-muted-foreground/80"
            )}>
                {metadata.label}
            </span>
        </div>

        {metadata.status === 'running' && (
             <Loader2 className="w-3 h-3 animate-spin text-muted-foreground/50" />
        )}

        {(metadata.details || metadata.sources || metadata.error) && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors"
          >
            {isExpanded ? (
              <ChevronUp className="w-3.5 h-3.5 opacity-50" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 opacity-50" />
            )}
          </button>
        )}
      </div>

      {/* Progress Bar Compacta */}
      {metadata.progress !== undefined && metadata.progress < 100 && (
         <div className="ml-1 mt-1 w-32 h-1 bg-muted/50 rounded-full overflow-hidden">
            <div 
                className="h-full bg-primary/50 transition-all duration-300" 
                style={{ width: `${metadata.progress}%` }}
            />
         </div>
      )}

      {/* Conteúdo Expandido */}
      {isExpanded && (
        <div className="mt-2 ml-1 p-3 border-l-2 border-muted/30 space-y-2 text-sm text-muted-foreground animate-in fade-in">
            {metadata.details && (
                <div className="whitespace-pre-wrap">{metadata.details}</div>
            )}
            
            {metadata.sources && metadata.sources.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                    {metadata.sources.map((source, idx) => (
                         <div key={idx} className="flex items-center gap-1 bg-background/50 border border-muted/50 px-2 py-1 rounded text-xs max-w-[200px]">
                            <ExternalLink className="w-3 h-3 opacity-50" />
                            <a href={source.url} target="_blank" className="truncate hover:underline flex-1">{source.title || source.url}</a>
                            <button onClick={() => copyToClipboard(source.url, idx)} className="ml-1 opacity-50 hover:opacity-100">
                                {copiedIndex === idx ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                            </button>
                         </div>
                    ))}
                </div>
            )}

            {metadata.error && (
                <div className="text-red-500 font-medium flex items-center gap-2">
                    <XCircle className="w-4 h-4" />
                    {metadata.error}
                </div>
            )}
        </div>
      )}
    </div>
  );
}
