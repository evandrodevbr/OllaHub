'use client';

import { Loader2, CheckCircle2, XCircle, ExternalLink, Globe } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ActiveUrl } from '@/hooks/use-web-search-events';

interface ScrapingUrlsMonitorProps {
  urls: ActiveUrl[];
  className?: string;
}

export function ScrapingUrlsMonitor({ urls, className }: ScrapingUrlsMonitorProps) {
  if (urls.length === 0) return null;

  const getFaviconUrl = (url: string): string => {
    try {
      const domain = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;
    } catch {
      return '';
    }
  };

  const getStatusIcon = (status: ActiveUrl['status']) => {
    switch (status) {
      case 'started':
        return <Loader2 className="w-3 h-3 animate-spin text-primary" />;
      case 'completed':
      case 'cached':
        return <CheckCircle2 className="w-3 h-3 text-green-500" />;
      case 'failed':
        return <XCircle className="w-3 h-3 text-red-500" />;
      default:
        return <Globe className="w-3 h-3 text-muted-foreground" />;
    }
  };

  const getSourceBadge = (source?: string) => {
    if (!source) return null;
    
    const colors: Record<string, string> = {
      static: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
      nodriver: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
      playwright: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
      cached: 'bg-gray-500/10 text-gray-600 border-gray-500/20',
    };

    return (
      <Badge variant="outline" className={cn('text-xs', colors[source] || 'bg-muted')}>
        {source}
      </Badge>
    );
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div className="text-xs font-medium text-muted-foreground mb-2">
        Sites Sendo Acessados ({urls.length})
      </div>
      {urls.map((url, idx) => (
        <div
          key={`${url.url}-${idx}`}
          className="flex items-start gap-2 p-2 rounded-md border bg-muted/30 hover:bg-muted/50 transition-colors"
        >
          <div className="flex-shrink-0 mt-0.5">
            {getStatusIcon(url.status)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2">
              <img
                src={getFaviconUrl(url.url)}
                alt=""
                className="w-4 h-4 rounded mt-0.5 flex-shrink-0"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <a
                    href={url.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-primary hover:underline line-clamp-1 flex items-center gap-1"
                  >
                    {url.title || url.url}
                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                  </a>
                  {getSourceBadge(url.source)}
                  {url.duration && (
                    <span className="text-xs text-muted-foreground">
                      {url.duration}ms
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {url.url}
                </p>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
