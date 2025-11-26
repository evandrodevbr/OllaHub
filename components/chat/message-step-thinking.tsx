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

  const getStepConfig = () => {
    switch (metadata.stepType) {
      case 'preprocessing':
        return {
          icon: Brain,
          textColor: "text-blue-600 dark:text-blue-400",
          bgColor: "bg-blue-50 dark:bg-blue-900/20",
        };
      case 'web-research':
        return {
          icon: Globe,
          textColor: "text-green-600 dark:text-green-400",
          bgColor: "bg-green-50 dark:bg-green-900/20",
        };
      case 'sources-found':
        return {
          icon: Package,
          textColor: "text-purple-600 dark:text-purple-400",
          bgColor: "bg-purple-50 dark:bg-purple-900/20",
        };
      case 'processing':
        return {
          icon: Brain,
          textColor: "text-indigo-600 dark:text-indigo-400",
          bgColor: "bg-indigo-50 dark:bg-indigo-900/20",
        };
      case 'response-generation':
        return {
          icon: Loader2,
          textColor: "text-orange-600 dark:text-orange-400",
          bgColor: "bg-orange-50 dark:bg-orange-900/20",
        };
      case 'fallback':
        return {
          icon: AlertCircle,
          textColor: "text-yellow-600 dark:text-yellow-400",
          bgColor: "bg-yellow-50 dark:bg-yellow-900/20",
        };
      case 'error':
        return {
          icon: XCircle,
          textColor: "text-red-600 dark:text-red-400",
          bgColor: "bg-red-50 dark:bg-red-900/20",
        };
      default:
        return {
          icon: Search,
          textColor: "text-muted-foreground",
          bgColor: "bg-muted/30",
        };
    }
  };

  const getStepIcon = () => {
    const config = getStepConfig();
    const Icon = config.icon;
    const isSpinning = metadata.stepType === 'response-generation' && metadata.status === 'running';
    
    return <Icon className={cn("w-4 h-4", config.textColor, isSpinning && "animate-spin")} />;
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

  const config = getStepConfig();

  return (
    <div className="mb-4 ml-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className={cn(
        "flex items-center gap-3 p-2 rounded-lg transition-all w-fit max-w-full",
        config.bgColor
      )}>
        <div className="flex items-center gap-2">
            {getStepIcon()}
            <span className={cn("text-sm font-medium", config.textColor)}>
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
                className={cn("h-full transition-all duration-300", config.textColor.replace('text-', 'bg-'))} 
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
