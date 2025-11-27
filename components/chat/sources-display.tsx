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

  const getFaviconUrl = (url: string): string => {
    try {
      const domain = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;
    } catch {
      return '';
    }
  };

  const getDomain = (url: string): string => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    }
  };

  return (
    <div className={cn("px-6 py-4 border-t border-muted/50", className)}>
      <div className="flex items-center gap-2 mb-3">
        <Globe className="w-4 h-4 text-muted-foreground/60" />
        <p className="text-xs font-medium text-muted-foreground/80">
          Fontes consultadas ({sources.length}):
        </p>
      </div>
      
      <div className="flex gap-3 overflow-x-auto py-2 sources-scrollbar">
        {sources.map((source, idx) => {
          const faviconUrl = getFaviconUrl(source.url);
          const domain = getDomain(source.url);
          const isCopied = copiedIndex === idx;
          
          return (
            <a
              key={idx}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 hover:bg-muted/50 border border-transparent hover:border-muted transition-all flex-shrink-0"
              onClick={(e) => {
                // Permitir que o botão de copiar funcione sem navegar
                if ((e.target as HTMLElement).closest('button')) {
                  e.preventDefault();
                }
              }}
            >
              {faviconUrl ? (
                <img
                  src={faviconUrl}
                  alt=""
                  className="w-4 h-4 rounded flex-shrink-0"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <Globe className="w-4 h-4 text-muted-foreground/60 flex-shrink-0" />
              )}
              <div className="min-w-0">
                <div className="text-xs font-medium truncate max-w-[140px] text-foreground/90">
                  {source.title || domain}
                </div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {domain}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  copyToClipboard(source.url, idx);
                }}
                className="ml-1 p-1 rounded hover:bg-muted/50 transition-colors opacity-0 group-hover:opacity-100"
                title="Copiar URL"
                aria-label="Copiar URL"
              >
                {isCopied ? (
                  <Check className="w-3 h-3 text-green-600 dark:text-green-400" />
                ) : (
                  <Copy className="w-3 h-3 text-muted-foreground" />
                )}
              </button>
            </a>
          );
        })}
      </div>
    </div>
  );
}

