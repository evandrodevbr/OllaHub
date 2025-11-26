'use client';

import { ExternalLink, Copy, Check, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useMemo } from 'react';
import type { ScrapedContent } from '@/services/webSearch';

interface SourcesDisplayProps {
  sources: ScrapedContent[];
  className?: string;
}

export function SourcesDisplay({ sources, className }: SourcesDisplayProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  if (!sources || sources.length === 0) {
    return null;
  }

  const copyToClipboard = async (url: string, index: number) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (error) {
      console.error('Failed to copy URL:', error);
    }
  };

  // Memoizar URLs de favicon para evitar recálculos
  const faviconUrls = useMemo(() => {
    return sources.map(source => {
      try {
        const domain = new URL(source.url).hostname;
        return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
      } catch {
        return null;
      }
    });
  }, [sources]);

  return (
    <div className={cn("px-6 py-4 border-t border-muted bg-muted/20", className)}>
      <div className="flex items-center gap-2 mb-3">
        <Globe className="w-4 h-4 text-muted-foreground" />
        <p className="text-xs font-medium text-muted-foreground">
          Fontes consultadas ({sources.length}):
        </p>
      </div>
      
      <div className="flex flex-wrap gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
        {sources.map((source, idx) => {
          const faviconUrl = faviconUrls[idx];
          const isCopied = copiedIndex === idx;
          
          return (
            <div
              key={idx}
              className="group flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-md bg-background hover:bg-muted/80 transition-all duration-200 border border-muted hover:border-primary/50 shadow-sm hover:shadow-md"
            >
              {/* Favicon */}
              {faviconUrl ? (
                <img
                  src={faviconUrl}
                  alt=""
                  className="w-4 h-4 flex-shrink-0 rounded-sm"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <Globe className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
              )}
              
              {/* Title and URL */}
              <div className="flex-1 min-w-0 max-w-[200px] md:max-w-[300px]">
                <div className="text-xs font-medium text-foreground truncate" title={source.title || source.url}>
                  {source.title || `Fonte ${idx + 1}`}
                </div>
                <div className="text-[10px] text-muted-foreground truncate" title={source.url}>
                  {source.url.replace(/^https?:\/\//, '').replace(/^www\./, '')}
                </div>
              </div>
              
              {/* Actions */}
              <div className="flex items-center gap-1">
                {/* Copy Button */}
                <button
                  onClick={() => copyToClipboard(source.url, idx)}
                  className="p-1 rounded hover:bg-muted transition-colors"
                  title="Copiar URL"
                  aria-label="Copiar URL"
                >
                  {isCopied ? (
                    <Check className="w-3 h-3 text-green-600 dark:text-green-400" />
                  ) : (
                    <Copy className="w-3 h-3 text-muted-foreground" />
                  )}
                </button>
                
                {/* External Link Button */}
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 rounded hover:bg-muted transition-colors"
                  title="Abrir em nova aba"
                  aria-label="Abrir em nova aba"
                >
                  <ExternalLink className="w-3 h-3 text-muted-foreground" />
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

