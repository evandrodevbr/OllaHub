'use client';

import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Source {
  url: string;
  title?: string;
}

interface SourcesCompactProps {
  sources: Source[];
  className?: string;
}

export function SourcesCompact({ sources, className }: SourcesCompactProps) {
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

  if (!sources || sources.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex gap-3 overflow-x-auto py-2 sources-scrollbar", className)}>
      {sources.map((source, idx) => {
        const faviconUrl = getFaviconUrl(source.url);
        const domain = getDomain(source.url);
        
        return (
          <a
            key={idx}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 hover:bg-muted/50 border border-transparent hover:border-muted transition-all flex-shrink-0"
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
              <ExternalLink className="w-4 h-4 text-muted-foreground/60 flex-shrink-0" />
            )}
            <div className="min-w-0">
              <div className="text-xs font-medium truncate max-w-[140px] text-foreground/90">
                {source.title || domain}
              </div>
              <div className="text-[10px] text-muted-foreground truncate">
                {domain}
              </div>
            </div>
          </a>
        );
      })}
    </div>
  );
}

